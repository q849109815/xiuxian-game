#!/usr/bin/env node
/* 【interop2.cjs】立规原因：V1.3.84 前，"操作性"从未被量化守卫检查过——
 * 只查面板能否打开 / 有无报错 / 有无越界，不查「按钮文案是否等于实际行为」
 * 「同一件事是否说两遍」「状态是否写在按钮上」。本守卫把这些变成可复跑断言。
 * 判据：源码锚点 + 真实 Chrome 渲染取证(_opshot) 交叉；不依赖 jsdom（沙盒无该模块）。
 * 退出码：0=全过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败）。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = p => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const J = p => { try { return JSON.parse(R(p)); } catch (e) { return {}; } };
let P = 0; const F = [];
const ok = (c, n, d) => { if (c) { P++; console.log('  ok ' + n); } else { F.push(n + ' :: ' + d); console.log('  X  ' + n + ' :: ' + d); } };

try {
  const ui = R('js/ui.js'), css = R('css/style.css');
  const bef = J('_vis/_opaudit_before.json'), aft = J('_vis/_opaudit_after.json');
  if (!aft.screens || !bef.screens) throw new Error('取证 JSON 缺失，需先跑 _opshot.cjs before/after');

  // ---- 源码锚点（可被变异验证命中）----
  /* V1.3.86 判据升级（不是删除）：原 S1/S2 守的是「按钮文案与落点一致」，
   * 当时靠两个 goTask=前往关卡 实现；现在改为每条未完成任务的「行内直达」，
   * 按 cond.t 分派到正确面板，原目的由更严格的判据承接。 */
  ok(!/id="goTask"/.test(ui) && !/>前往关卡</.test(ui) && /taskGo\(t\)\s*\{/.test(ui) &&
     (ui.match(/this\.taskGoBtn\([ta]\)\)\}/g) || []).length >= 4,
    'S1 任务面板改为四页签行内直达（无笼统按钮）',
    'goTask 残留=' + /id="goTask"/.test(ui) + ' taskGoBtn 数=' + (ui.match(/this\.taskGoBtn\([ta]\)\)\}/g) || []).length);
  ok(!/>前往任务</.test(ui), 'S3 全站不再有「前往任务」按钮', '仍存在');
  ok(/\$\$\('#pnBody \[data-go\]'\)\.forEach/.test(ui) &&
     /this\.open\(b\.dataset\.go, b\.dataset\.gtab \|\| undefined\)/.test(ui) &&
     /key: 'gun'/.test(ui) && /focus: 'lvEndless'/.test(ui),
    'S2 行内按钮按任务类型 open 对应面板', '绑定或分派缺失');
  ok(/btnTxt\s*=\s*blocked\s*\?\s*'已达上限'/.test(ui), 'S4 限购达上限时按钮直说状态', '缺 blocked 分支');
  ok(/const descShort[\s\S]{0,220}replace\(\/\\s\*\[·•\]/.test(ui), 'S5 描述静态限购后缀被剥离', '缺 descShort 剥离');
  ok(/class="lbl gd" title="\$\{descShort\}"\>\$\{descShort\}/.test(ui), 'S6 渲染改用 descShort', '仍直接用 g.desc');
  ok(/<div class="gbuy">/.test(ui), 'S7 价格与状态并入同一行容器', '缺 .gbuy');
  ok(/class="gst/.test(ui), 'S8 状态行独立可机读', '缺 .gst');
  ok(css.includes('/* V1.3.84 操作性整改：商店卡片 */') && /shop-cell \.gbuy\{display:flex/.test(css),
    'S9 样式已落地且限定商店作用域', 'CSS 缺失或未限定');
  ok(/class="gcell shop-cell"/.test(ui), 'S10 商店卡片带专属 class（不误伤背包/角色页）', '缺 shop-cell');

  // ---- 真实 Chrome 渲染取证 ----
  const cells = aft.screens.shopCells || [];
  ok(cells.length >= 6, 'R1 每日商店真实渲染出 6 件商品', 'cells=' + cells.length);
  ok(cells.length > 0 && cells.every(x => !x.desc.some(t => /每日\s*\d+\s*次/.test(t))),
    'R2 商品描述不再重复「每日N次」', JSON.stringify(cells.slice(0, 2).map(x => x.desc)));
  ok(cells.length > 0 && cells.every(x => x.gbuy === 1),
    'R3 每张卡都有价格+状态同一行', 'gbuy=' + cells.map(x => x.gbuy).join(','));
  ok(cells.length > 0 && cells.every(x => x.gst && x.gst.length && x.gst[0].trim().length > 0),
    'R4 状态行不为空（余量/货币不足）', '存在空状态行');
  ok(cells.length > 0 && cells.every(x => (x.btn || '').trim().length > 0),
    'R5 价格按钮文案非空', '存在空按钮');
  ok(cells.length > 0 && cells.every(x => x.gstW > 20),
    'R7 限购状态行真实可见（宽度>20px，不是被挤成 0）', 'gstW=' + cells.map(x => x.gstW).join(','));
  /* V1.3.86：原 R6/A4 消费 V1.3.84 的旧快照，产品改了它却仍报绿 ——
   * 这是「取证过期冒充当前状态」的复发错题，改为消费本轮真实取证。 */
  const TF = J('_vis/_v1386_after2.json') || {}, TS = TF.steps || {};
  const g7 = TS['G7_四页签行内入口'] || [];
  ok(g7.length === 4 && g7.every(x => x.unfinishedBtns > 0),
    'R6 四个任务页签真实渲染均有直达按钮', JSON.stringify(g7.map(x => x.tab + ':' + x.unfinishedBtns)));

  // ---- 前后对比 ----
  const bh = (bef.screens.shopCells || []).map(x => x.h), ah = cells.map(x => x.h);
  ok(bh.length && ah.length && Math.max(...ah) < Math.max(...bh) - 30,
    'A1 卡片实测明显变矮（一屏放更多商品）', 'before=' + Math.max(...bh) + ' after=' + Math.max(...ah));
  const dupB = (bef.screens.shopCells || []).filter(x => x.desc.some(t => /每日\s*\d+\s*次/.test(t))).length;
  const dupA = cells.filter(x => x.desc.some(t => /每日\s*\d+\s*次/.test(t))).length;
  ok(dupB > 0 && dupA === 0, 'A2 重复文案从 ' + dupB + ' 处归零', 'after dup=' + dupA);
  ok((aft.feErrors || []).length === 0 && (aft.beErrors || []).length === 0,
    'A3 整改后前后台真实渲染 0 报错', 'fe=' + (aft.feErrors || []).length + ' be=' + (aft.beErrors || []).length);
  const g8 = TS['G8_点击落点与返回'] || {};
  ok(g8.up?.landed === 'gun' && g8.endless?.landed === 'level' &&
     g8.endless?.inFirstScreen === true && g8.back?.landed === 'task',
    'A4 点击路径：按类型落点 + 无尽聚焦首屏 + ◀ 回任务', JSON.stringify(g8));
  const bBtn = (bef.screens.shop_daily || {}).visibleButtons || 0;
  const aBtn = (aft.screens.shop_daily || {}).visibleButtons || 0;
  ok(bBtn === aBtn, 'A5 按钮总数不变（未破坏现有功能）', 'before=' + bBtn + ' after=' + aBtn);
} catch (e) {
  F.push('CRASH :: ' + String(e.stack || e).slice(0, 300));
  console.log('  X  CRASH :: ' + String(e.message || e));
}
console.log('INTEROP2 PASS=' + P + ' FAIL=' + F.length);
F.forEach(x => console.log('  FAIL ' + x));
process.exit(F.length ? (F.some(x => x.startsWith('CRASH')) ? 2 : 1) : 0);
