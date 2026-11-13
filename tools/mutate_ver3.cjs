/* =========================================================
 * mutate_ver3.cjs —— 三次取样守卫变异验证
 * 立规原因：抓不住缺陷的断言等于不存在。本脚本把「铁律被破坏」的
 *   五种形态分别塞回源码，确认 ver3.cjs 每一种都报红；还原后 md5 一致。
 * 退出码：0=全部捕获 / 1=有漏网 / 2=还原校验失败
 * ========================================================= */
'use strict';
const fs = require('fs'), cp = require('child_process'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const cases = [
  { n: 'M1 取样份数改成1', f: 'tools/cloudver.cjs', a: 'const SAMPLES = 3;', b: 'const SAMPLES = 1;' },
  { n: 'M2 删三次一致性判据', f: 'tools/cloudver.cjs',
    a: "ck('V3 三次取样两两一致', snaps.length >= 2 && snaps.every(s => norm(s) === norm(snaps[0])),",
    b: "ck('V3 三次取样两两一致', true," },
  { n: 'M3 删长度判据', f: 'tools/cloudver.cjs',
    a: "ck('V4 版本文字长度一致', lens.length <= 1, 'lengths=' + lens.join(','));",
    b: "ck('V4 版本文字长度一致', true, '');" },
  { n: 'M4 规范删铁律', f: '发布流程规范.md',
    a: '受控铁律：版本文字必须三次取样', b: '版本文字单次取样即可' },
  { n: 'M5 看板删固定项', f: 'tools/dash.cjs',
    a: "'云端版本三次取样'", b: "'云端版本单次取样'" }
];
let caught = 0, total = 0, restoreBad = 0;
for (const c of cases) {
  total++;
  const p = path.join(ROOT, c.f);
  const orig = fs.readFileSync(p, 'utf8');
  if (!orig.includes(c.a)) { console.log('SKIP ' + c.n + '  锚点未命中'); continue; }
  fs.writeFileSync(p, orig.replace(c.a, c.b));
  let r;
  try {
    r = cp.spawnSync('node', ['tools/ver3.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 90000 });
  } finally {
    fs.writeFileSync(p, orig);
  }
  const failed = r.status !== 0 || /FAIL /.test(r.stdout || '');
  const ok = md5(fs.readFileSync(p, 'utf8')) === md5(orig);
  if (!ok) restoreBad++;
  console.log((failed ? 'CAUGHT  ' : 'MISSED  ') + c.n + '  exit=' + r.status + '  restore=' + (ok ? 'md5一致' : 'MD5不一致'));
  if (failed) caught++;
}
console.log('RESULT: 捕获 ' + caught + '/' + total + '  还原异常 ' + restoreBad);
process.exit(caught === total && restoreBad === 0 ? 0 : (restoreBad ? 2 : 1));
