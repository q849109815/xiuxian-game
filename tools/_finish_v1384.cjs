#!/usr/bin/env node
/* V1.3.84 收口：修回归红项 + 让购买按钮一眼可辨 + 新工具进清单/看板。
 * 三体验：UX 按钮有明确主色（此前与描述条同色，玩家分不清哪个能点）；
 *         DX 全部令牌化，不留硬编码像素/色值；AX 新守卫进固定看板与上传清单。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const C = path.join(ROOT, 'css/style.css'), P = path.join(ROOT, 'tools/push.py'), D = path.join(ROOT, 'tools/dash.cjs');
let c = fs.readFileSync(C, 'utf8'), p = fs.readFileSync(P, 'utf8'), d = fs.readFileSync(D, 'utf8');

// 1) 令牌化 + 按钮 affordance
const fixes = [
  ['margin:3px 0 1px', 'margin:var(--sp-half) 0 var(--sp-0)'],
  ['margin:1px 0 2px', 'margin:var(--sp-half) 0 var(--sp-half)'],
  ['margin:0 0 2px', 'margin:0 0 var(--sp-half)'],
  ['gap:1px', 'gap:var(--sp-half)'],
  ['padding:3px 7px', 'padding:var(--sp-half) var(--sp-1)'],
  ['color:#7ee38a', 'color:var(--c-green-400)'],
  ['color:#ff8a8a', 'color:var(--c-red-400)'],
];
fixes.forEach(([a, b]) => { if (c.includes(a)) c = c.split(a).join(b); });
const oldBtn = '.gcell.shop-cell .gbuy .btn{flex:0 0 auto;width:100%;font-size:var(--fs-xs);padding:var(--sp-half) var(--sp-1);margin:0;white-space:nowrap}';
const newBtn = '.gcell.shop-cell .gbuy .btn{flex:0 0 auto;width:100%;font-size:var(--fs-xs);padding:var(--sp-half) var(--sp-1);margin:0;white-space:nowrap;min-height:0;line-height:1.25;border-color:var(--c-amber-350);color:var(--c-amber-100);box-shadow:0 0 0 1px var(--c-amber-350) inset}';
if (!c.includes(oldBtn)) { console.error('FINISH_FAIL 按钮样式未命中'); process.exit(1); }
c = c.replace(oldBtn, newBtn);

// 2) 新守卫登记上传清单（历史错题：工具改了永远传不上线）
const anchor = "    'tools/interop.cjs',";
if (!p.includes(anchor)) { console.error('FINISH_FAIL push.py 锚点未命中'); process.exit(1); }
if (!p.includes("'tools/interop2.cjs'")) {
  p = p.replace(anchor, anchor + "\n    'tools/interop2.cjs',\n    'tools/mutate_interop2.cjs',");
}

// 3) 看板固定项
const dAnchor = "A('测试','交互操作性守卫',iop?(iop.f?`未过${iop.f}✗`:`PASS${iop.p}/0`):'未跑通✗');";
if (!d.includes(dAnchor)) { console.error('FINISH_FAIL dash 锚点未命中'); process.exit(1); }
if (!d.includes("'交互操作性(真实取证)'")) {
  const extra = `\nconst i2=(()=>{try{const r=require('child_process').spawnSync('node',['tools/interop2.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:30000});\nconst m=(r.stdout||'').match(/INTEROP2 PASS=(\\d+) FAIL=(\\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();\nA('测试','交互操作性(真实取证)',i2?(i2.f?\`未过\${i2.f}✗\`:\`PASS\${i2.p}/0\`):'未跑通✗');`;
  d = d.replace(dAnchor, dAnchor + extra);
}
fs.writeFileSync(C, c); fs.writeFileSync(P, p); fs.writeFileSync(D, d);
console.log('FINISH_OK css令牌化+按钮主色 / push登记2工具 / 看板新增固定项');
