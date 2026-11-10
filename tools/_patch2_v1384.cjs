#!/usr/bin/env node
/* V1.3.84 补丁二：商店卡片压紧 + 样式作用域限定。
 * 立规原因：补丁一虽删了重复文案，卡片实测仍 222~238px（图片占 82% + 描述强制两行），
 *   两列一屏放不下几件商品；且 .gcell 被背包/角色/图鉴等面板复用，直接改会破坏现有功能。
 * 做法：给商店卡加 shop-cell 专属 class，所有新样式仅在其作用域生效。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const U = path.join(ROOT, 'js/ui.js'), C = path.join(ROOT, 'css/style.css');
let u = fs.readFileSync(U, 'utf8'), c = fs.readFileSync(C, 'utf8');

// ui.js：只改 r_shop 段内的第一处 gcell
const a = u.indexOf('r_shop(p, tab)'), b = u.indexOf('/* 唯一性商品扣款前校验', a);
if (a < 0 || b < 0) { console.error('PATCH2_FAIL 定位失败'); process.exit(1); }
let seg = u.slice(a, b);
const oldC = 'return `<div class="gcell">';
if (!seg.includes(oldC)) { console.error('PATCH2_FAIL 未命中 gcell'); process.exit(1); }
seg = seg.replace(oldC, 'return `<div class="gcell shop-cell">');
u = u.slice(0, a) + seg + u.slice(b);

// css：重写上一次追加的块
const MARK = '/* V1.3.84 操作性整改：商店卡片 */';
const i = c.indexOf(MARK);
if (i >= 0) c = c.slice(0, i);
c += `${MARK}
/* 作用域限定：避免误伤背包/角色/图鉴等复用 .gcell 的面板 */
.gcell.shop-cell{display:flex;flex-direction:column;align-items:center}
.gcell.shop-cell img{width:56%;max-width:72px;max-height:72px;aspect-ratio:1/1;object-fit:contain;margin:4px 0 2px}
.gcell.shop-cell .gd{font-size:var(--fs-xs);line-height:1.3;margin:1px 0 3px;min-height:0;text-align:center;width:100%;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gcell.shop-cell .gbuy{display:flex;align-items:center;gap:5px;margin-top:auto;width:100%;justify-content:center}
.gcell.shop-cell .gbuy .btn{flex:0 0 auto;width:auto;font-size:var(--fs-xs);padding:3px 7px;margin:0;white-space:nowrap}
.gcell.shop-cell .gst{font-size:var(--fs-xs);color:#7ee38a;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.gcell.shop-cell .gst.warn{color:#ff8a8a}
`;
fs.writeFileSync(U, u); fs.writeFileSync(C, c);
console.log('PATCH2_OK shop-cell class + scoped css');
