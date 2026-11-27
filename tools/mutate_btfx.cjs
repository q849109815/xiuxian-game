#!/usr/bin/env node
/* =========================================================
 * mutate_btfx.cjs —— 战斗视觉深化层变异验证（V1.3.97）
 *
 * 立规原因：抓不住缺陷的断言等于不存在。V1.3.96 连续踩过
 * 「CSS 写了被 !important 吃掉」「覆盖层写好忘挂 link」，
 * 这次新增 7 处接线，每处都必须能被独立证伪。
 * 强停安全：所有被改文件先备份，finally 逐字节还原并校验 md5。
 *
 * 用例 → 必须点名报红的判据：
 *   M1 删 btfx.js 引入          → G1
 *   M2 摘掉 draw() 的 hook      → G2
 *   M3 特效层偷写战斗数值       → G3
 *   M4 网格改回冷青紫           → G4
 *   M5 删全屏闪光 CSS           → G5
 *   M6 技能球丢掉 data-el       → G6
 *   M7 manifest 漏登新 CSS      → G7
 *
 * 退出码：0=全部捕获且还原干净 / 1=漏网或还原异常 / 2=前提未就绪
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const P = f => path.join(ROOT, f);
const FILES = ['index.html', 'js/battle.js', 'js/btfx.js', 'js/ui.js',
  'css/v1397.css', 'js/config.js'];

function backup() {
  const m = new Map();
  for (const f of FILES) if (fs.existsSync(P(f))) m.set(f, fs.readFileSync(P(f)));
  return m;
}
function restore(m) {
  let bad = 0;
  for (const [f, b] of m) {
    fs.writeFileSync(P(f), b);
    if (md5(fs.readFileSync(P(f))) !== md5(b)) { bad++; console.log('  ! 还原异常 ' + f); }
  }
  return bad;
}
function run() {
  const r = cp.spawnSync('node', ['tools/btfxguard.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}
function edit(f, fn) {
  const p = P(f); let s = fs.readFileSync(p, 'utf8'); const t = fn(s);
  if (t === s || t == null) return false;
  fs.writeFileSync(p, t); return true;
}

const CASES = [
  { n: 'M1 删掉 js/btfx.js 引入（写了没挂）', tag: 'G1', f: 'index.html',
    mut: s => s.replace(/<script src="js\/btfx\.js\?v=[\d.]+"><\/script>/, '') },
  { n: 'M2 摘掉 draw() 的特效 hook（挂了没调）', tag: 'G2', f: 'js/battle.js',
    mut: s => s.replace('BTFX.frame(c, r);', '/* MUT no frame */') },
  { n: 'M3 特效层偷写战斗数值（越界成玩法层）', tag: 'G3', f: 'js/btfx.js',
    mut: s => s.replace('function frame(c, r) {', 'function frame(c, r) {\n    r.gold = 999999; /* MUT */') },
  { n: 'M4 网格改回冷青紫（细致化被回滚）', tag: 'G4', f: 'js/battle.js',
    mut: s => s.replace("'rgba(255,196,116,'", "'rgba(110,240,255,'") },
  { n: 'M5 删掉全屏闪光规则（大招不亮）', tag: 'G5', f: 'css/v1397.css',
    mut: s => s.replace(/#battle\.fx-cast::after/g, '#battle.MUT-noflash::after') },
  { n: 'M6 技能球丢掉 data-el（元素色全失效）', tag: 'G6', f: 'js/ui.js',
    mut: s => s.replace('data-el="${d.el || \'\'}"', '') },
  { n: 'M7 热更 manifest 漏登新 CSS（玩家拿旧文件）', tag: 'G7', f: 'js/config.js',
    mut: s => s.replace("      { p: 'css/v1397.css', ver:'1.3.97', size: 0 },\n", '')
      .replace("      { p: 'css/v1397.css', ver:'1.3.96', size: 0 },\n", '') },
];

const snap = backup();
let cap = 0, invalid = 0, falseAlarm = 0;
try {
  const base = run();
  if (base.code !== 0) { console.log('前提未就绪：未改动的基线就不是全绿'); process.exit(2); }
  for (const c of CASES) {
    let ok = false;
    try { ok = edit(c.f, c.mut); } catch (e) { ok = false; }
    if (!ok) { invalid++; console.log('  x ' + c.n + ' → 注入点未命中（不算捕获）'); restore(snap); continue; }
    const r = run();
    /* 必须点名对应判据报红，且整体退出码非 0；只报别的红不算捕获 */
    const named = new RegExp('FAIL ' + c.tag + '\\b').test(r.out);
    if (named && r.code !== 0) { cap++; console.log('  √ ' + c.n + ' → ' + c.tag + ' 点名报红'); }
    else { falseAlarm++; console.log('  x ' + c.n + ' → 未点名捕获 exit=' + r.code); }
    restore(snap);
  }
} finally { restore(snap); }

const finalBad = restore(snap);
const final = run();
console.log('\n=== 战斗特效层变异验证 ===');
console.log('还原后基线: ' + (final.code === 0 ? 'PASS 全绿' : 'FAIL 非全绿'));
console.log('还原后复跑: exit=' + final.code + ' / ' + (final.out.trim().split('\n').pop() || ''));
console.log('RESULT: 捕获 ' + cap + '/' + CASES.length + '  漏网 ' + falseAlarm +
  '  注入失效 ' + invalid + '  还原异常 ' + finalBad);
process.exit((falseAlarm || invalid || finalBad || final.code !== 0) ? 1 : 0);
