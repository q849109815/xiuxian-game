/* =========================================================
 * mutate_cssver.cjs —— CSS 版本戳与引入链守卫的变异验证（V1.3.96）
 * 立规原因：抓不住缺陷的断言等于不存在。把四类真事故塞回去必须全部报红。
 * 强停安全：所有被改文件先备份，finally 逐字节还原并校验 md5；
 *   备份清单覆盖 ver.cjs 会写的全部文件，不复 V1.3.95 漏 css 的覆辙。
 * 退出码：0=全捕获且还原干净 / 1=漏网或还原异常 / 2=前提未就绪
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const P = f => path.join(ROOT, f);
/* V1.3.97 收口：备份清单补上新建的 css/v1397.css。
 * V1.3.95 老事故就是备份清单漏了 style.css，强停后 finally 没还原干净；
 * 每新增一个受检 css 都必须同步进这里，否则同类事故会复发。 */
const FILES = ['index.html', 'css/style.css', 'css/tokens.css', 'css/v1392.css',
  'css/v1396.css', 'css/v1397.css', 'tools/.version.json'];

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
function run() { return cp.spawnSync('node', ['tools/cssver.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 }); }

const cases = [
  { name: 'M1 css 内 ?v= 残留旧版 1.4.0', tag: 'C2',
    inject() { const f = P('css/style.css'); const s = fs.readFileSync(f, 'utf8');
      if (!/\?v=1\.3\.\d+/.test(s)) return false;
      fs.writeFileSync(f, s.replace(/\?v=1\.3\.\d+/, '?v=1.4.0')); return true; } },
  { name: 'M2 视觉覆盖层写了却没挂 link', tag: 'C4',
    inject() { const f = P('index.html'); const s = fs.readFileSync(f, 'utf8');
      const re = /\n<link rel="stylesheet" href="css\/v1396\.css\?v=[\d.]+">/;
      if (!re.test(s)) return false;
      fs.writeFileSync(f, s.replace(re, '')); return true; } },
  /* 【V1.3.97 收口 · 变异用例自身失效修复】
   * 旧注入把 `css/v1396.css` 替换成 `css/v1397.css`，靠「v1397 当时不存在」
   * 制造幽灵路径。但本轮真的新建了 css/v1397.css —— 幽灵不再幽灵：
   * 替换后 C5 全绿，反倒让 v1396 变成「漏挂」触发 C4，exit=1 却没点名 C5，
   * 于是报「捕获 3/4 漏网 1」。**不是守卫失效，是变异用例随项目演进失效了。**
   * 修法：① 用固定探针名 `__ghost_probe__`，保证永远不存在；
   *       ② 用「追加一行」而非「替换」，避免连带触发 C4 造成误判捕获；
   *       ③ 探针带当前 ?v=，避免 C3 顺带报红；
   *       ④ 注入前显式检查探针文件确实不存在，将来谁真建了它，用例会
   *          显式报「注入失效」而不是悄悄退化成假漏网。 */
  { name: 'M3 挂了不存在的 css（幽灵路径）', tag: 'C5',
    inject() { const f = P('index.html'); const s = fs.readFileSync(f, 'utf8');
      if (fs.existsSync(P('css/__ghost_probe__.css'))) return false;
      const m = s.match(/<link rel="stylesheet" href="css\/v1397\.css\?v=([\d.]+)">/);
      if (!m) return false;
      const ghost = '<link rel="stylesheet" href="css/__ghost_probe__.css?v=' + m[1] + '">';
      fs.writeFileSync(f, s.replace(m[0], m[0] + '\n' + ghost)); return true; } },
  { name: 'M4 层叠顺序错：tokens 排到 style 之后', tag: 'C6',
    inject() { const f = P('index.html'); const s = fs.readFileSync(f, 'utf8');
      const t = /<link rel="stylesheet" href="css\/tokens\.css\?v=[\d.]+">\n/;
      const m = s.match(t); if (!m) return false;
      let out = s.replace(t, '');
      const i = out.indexOf('css/style.css');
      out = out.replace(/(<link rel="stylesheet" href="css\/style\.css\?v=[\d.]+">\n)/, '$1' + m[0]);
      fs.writeFileSync(f, out); return true; } }
];

const snap = backup();
let cap = 0, invalid = 0, falseAlarm = 0;
try {
  const base = run();
  if (base.status !== 0) { console.log('前提未就绪：未改动的基线就不是全绿'); process.exit(2); }
  for (const c of cases) {
    let ok = false;
    try { ok = c.inject(); } catch (e) { ok = false; }
    if (!ok) { invalid++; console.log('  x ' + c.name + ' → 注入点无效（不算捕获）'); restore(snap); continue; }
    const r = run();
    const hit = ((r.stdout || '') + (r.stderr || '')).includes('FAIL ' + c.tag);
    if (hit && r.status !== 0) { cap++; console.log('  √ ' + c.name + ' → ' + c.tag + ' 报红'); }
    else { falseAlarm++; console.log('  x ' + c.name + ' → 未捕获 exit=' + r.status); }
    restore(snap);
  }
} finally { restore(snap); }

const finalBad = restore(snap);
const final = run();
const rows = [
  '基线全绿: ' + (final.status === 0 ? 'PASS' : 'FAIL'),
  '还原后复跑: exit=' + final.status + ' / ' + ((final.stdout || '').trim().split('\n').pop() || ''),
  'RESULT: 捕获 ' + cap + '/' + cases.length + '  漏网 ' + falseAlarm + '  注入失效 ' + invalid + '  还原异常 ' + finalBad
];
console.log('\n=== CSS 守卫变异验证 ===\n' + rows.join('\n'));
process.exit((falseAlarm || invalid || finalBad || final.status !== 0) ? 1 : 0);
