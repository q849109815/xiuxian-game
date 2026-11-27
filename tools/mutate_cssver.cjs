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
const FILES = ['index.html', 'css/style.css', 'css/tokens.css', 'css/v1392.css', 'css/v1396.css', 'tools/.version.json'];

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
  { name: 'M3 挂了不存在的 css（幽灵路径）', tag: 'C5',
    inject() { const f = P('index.html'); const s = fs.readFileSync(f, 'utf8');
      if (!s.includes('css/v1396.css')) return false;
      fs.writeFileSync(f, s.replace('css/v1396.css', 'css/v1397.css')); return true; } },
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
