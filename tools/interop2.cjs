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
  ok((ui.match(/id="goTask"[^>]*>前往关卡</g) || []).length === 2, 'S1 任务面板两处按钮文案=前往关卡',
    '匹配数=' + (ui.match(/id="goTask"[^>]*>前往关卡</g) || []).length);
  ok(!/>前往任务</.test(ui), 'S3 全站不再有「前往任务」按钮', '仍存在');
  const gh = (ui.match(/gb\.onclick\s*=\s*\(\)\s*=>\s*\{([^}]*)\}/) || [])[1] || '';
  ok(/open\('level'/.test(gh), 'S2 按钮行为=打开关卡选择', 'handler=' + gh.trim());
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
  const tt = aft.screens.taskText || '';
  ok(/前往关卡/.test(tt) && !/前往任务/.test(tt),
    'R6 任务页真实渲染文案与行为一致', 'taskText 不含前往关卡或仍含前往任务');

  // ---- 前后对比 ----
  const bh = (bef.screens.shopCells || []).map(x => x.h), ah = cells.map(x => x.h);
  ok(bh.length && ah.length && Math.max(...ah) < Math.max(...bh) - 30,
    'A1 卡片实测明显变矮（一屏放更多商品）', 'before=' + Math.max(...bh) + ' after=' + Math.max(...ah));
  const dupB = (bef.screens.shopCells || []).filter(x => x.desc.some(t => /每日\s*\d+\s*次/.test(t))).length;
  const dupA = cells.filter(x => x.desc.some(t => /每日\s*\d+\s*次/.test(t))).length;
  ok(dupB > 0 && dupA === 0, 'A2 重复文案从 ' + dupB + ' 处归零', 'after dup=' + dupA);
  ok((aft.feErrors || []).length === 0 && (aft.beErrors || []).length === 0,
    'A3 整改后前后台真实渲染 0 报错', 'fe=' + (aft.feErrors || []).length + ' be=' + (aft.beErrors || []).length);
  const gp = aft.paths && aft.paths.goTask || {};
  ok(gp.found && /关卡/.test(gp.label) && gp.landed === 'level',
    'A4 点击路径：文案=关卡、落点=关卡选择', JSON.stringify(gp));
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
