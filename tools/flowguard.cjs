#!/usr/bin/env node
/* 【flowguard.cjs】立规原因：制作人追问「界面逻辑性操作性你视觉看了嘛？方便嘛？」——
 * 此前所有守卫只证明「按钮存在 / 面板能开 / 不报错」，从未有一条问过
 * 「玩家按路径点下去顺不顺、会不会被踢出去、状态还认不认得」。
 * 本守卫消费 _flowwalk.cjs 的真实 Chrome 逐路径取证，并对源码立静态回归断言。
 * 判据：静态 5 项 + 动态 11 项，全部以自身输出为准。
 * 退出码：0=全过 / 1=存在未过项 / 2=取证缺失或工具崩溃（崩溃显式判失败）。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = p => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const A = [];
const ck = (k, cond, msg) => A.push({ k, ok: !!cond, msg: msg || '' });

let J = null;
try { J = JSON.parse(R('_vis/_flowwalk_final2.json')); } catch (e) { J = null; }
if (!J) { console.log('flowguard: 取证缺失 ← 需重跑 _flowwalk.cjs final2'); process.exit(2); }

const ui = R('js/ui.js'), css = R('css/style.css'), tool = R('tools/_flowwalk.cjs');

/* ---- 静态回归：防本轮四处修复被改回去 ---- */
ck('S1 购买售罄不再关闭面板', !/if \(soldOut\) \{ this\.close\(\); \}/.test(ui) &&
  /买完统一原地刷新/.test(ui), '防「买完一件每日限购就被踢出商城」复发');
ck('S2 售罄状态行说明何时刷新', /daily: '明日刷新'/.test(ui) && /const stTxt/.test(ui),
  '按钮说已达上限，状态行说下一步，不重复');
/* 判据收紧：首版用 `[^}]*14px`，把 width 改成 48px 后仍能靠
 * min-width:14px 命中 → M3 变异逃逸（假通过）。必须锁 width/height 本身。 */
ck('S3 价格按钮货币图标被钉成 14px',
  /\.gcell \.gbuy button \.ei\{width:14px;height:14px;/.test(css) &&
  !/\.gcell \.gbuy button \.ei\{width:48px/.test(css),
  '防 .gcell img 后代规则把 💎200 的图标撑成 48×48');
ck('S4 不存在的视觉缺陷未被写进产品', !/\.gcell\.shop-cell > img\{background/.test(css),
  '空框是截图时序假象，底座已撤回');
ck('S5 取证工具等待图片 complete', /const waitImgs/.test(tool) && /await waitImgs\(pg\)/.test(tool),
  '截图工具本身也是被审对象');

/* ---- 动态：真实 Chrome 逐路径取证 ---- */
const F = k => J[k] || {};
ck('D1 批量领取有汇总反馈且不关面板', F('F2_批量领取反馈').batchGone &&
  /已领取/.test(F('F2_批量领取反馈').toast || '') && F('F2_批量领取反馈').panelStillOpen);
ck('D2 跨面板跳转 ◀ 返回上级', F('F3_返回上级导航').backReturned === true &&
  F('F3_返回上级导航').landed === 'role' && F('F3_返回上级导航').open === true);
ck('D3 关闭再打开记住页签', F('F4_页签记忆').remembered === '直购');
const f5 = F('F5_购买反馈');
ck('D4 买完不打断、售罄可读、其余仍可买', f5.panelOpen === true &&
  f5.curPanel === 'shop' && f5.disabled === true && f5.btnAfter === '已达上限' &&
  (f5.otherBuyable || 0) >= 5 && /购买成功/.test(f5.toast || ''), JSON.stringify(f5));
ck('D5 每日页一屏看全无需滚动', F('F6_购买后滚动').cap === 0);
const f7 = F('F7_邮件单封领取');
ck('D6 邮件单封领取不是死按钮', f7.singles >= 2 && (f7.bound || []).every(x => x.hasOnclick) && f7.all === true);
ck('D7 后台取证前提已就绪', (F('BE_READY').pages || []).length >= 15 && (F('BE_READY').bodyLen || 0) > 0);
ck('D8 空状态给可点入口且真能跳选人页', F('F8_空状态行动入口').emptyBtn === true &&
  F('F8_空状态行动入口').after === 'account');
ck('D9 选中玩家跨页保留', F('F9_选中态跨页').keptAll === true);
const f10 = F('F10_危险操作确认');
ck('D10 危险操作走模态、无原生阻塞弹窗', (f10.modalShown || 0) >= 1 && f10.nativeDialogs === 0);
ck('D11 前后台真实渲染 0 报错', (J.FE_ERRS || []).length === 0 && (J.BE_ERRS || []).length === 0 &&
  (J.NATIVE_DIALOGS || []).length === 0);

let pass = 0, fail = 0;
for (const a of A) {
  if (a.ok) { pass++; console.log('  PASS ' + a.k); }
  else { fail++; console.log('  FAIL ' + a.k + (a.msg ? ' — ' + a.msg : '')); }
}
console.log('flowguard: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
