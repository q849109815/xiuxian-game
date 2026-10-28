#!/usr/bin/env node
/* ==========================================================================
 * 版本规范变异验证 tools/mutate_vernorm.cjs
 *
 * 证明「版本号不再膨胀」这条规矩真的有牙齿。
 * 每条用例：故意制造违规 → ver.cjs 必须拒绝（退出码非 0）；
 *           或制造合法升版 → 必须成功。跑完全部还原并校验字节一致。
 *
 * 用法： node tools/mutate_vernorm.cjs
 * 退出码： 0 全部捕获 / 1 有漏网
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.mut_vernorm');
/* 会被 ver.cjs 改动的文件，全部纳入备份 */
const FILES = [
  'tools/.version.json',
  'index.html',
  'admin/index.html',
  'js/config.js',
  'js/ui.js',
  'admin/js/core.js',
  'CHANGELOG.md',
];

const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');

function backup() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  for (const f of FILES) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(TMP, f.replace(/[\\/]/g, '__'));
    fs.copyFileSync(src, dst);
  }
}
function restore() {
  for (const f of FILES) {
    const dst = path.join(TMP, f.replace(/[\\/]/g, '__'));
    if (!fs.existsSync(dst)) continue;
    fs.copyFileSync(dst, path.join(ROOT, f));
  }
  fs.rmSync(TMP, { recursive: true, force: true });
}
function run(args) {
  try {
    const out = execSync('node tools/ver.cjs ' + args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}
function setVer(v) {
  fs.writeFileSync(path.join(ROOT, 'tools', '.version.json'),
    JSON.stringify({ v, at: new Date().toISOString() }, null, 2));
}

let PASS = 0, FAIL = 0;
const ok = (n, d) => { PASS++; console.log('  √ ' + n + (d ? '  ' + d : '')); };
const no = (n, d) => { FAIL++; console.log('  ✗ ' + n + (d ? '  ' + d : '')); };

console.log('=== 版本规范变异验证 ===');
const before = FILES.map(md5);
backup();

try {
  /* ---- 拒绝类：必须被拦（这些都在写文件之前 exit，无副作用） ---- */
  console.log('— 拒绝类：违规升版必须被拦 —');

  setVer('1.3.73');                                   /* 已是规范版本 */
  let r = run('reset 1.3.80 "滥用测试"');
  (r.code !== 0 && /不允许 reset/.test(r.out))
    ? ok('M1 规范版本上执行 reset 被拒', 'exit=' + r.code)
    : no('M1 规范版本 reset 未被拒（可被滥用成随意回退）', 'exit=' + r.code);

  setVer('1.3.72111111111111');                       /* 畸形版本 */
  /* 同值/越界/空目标三条都必须被拒：任一漏网都可能让版本号不变（缓存不刷）
     或继续膨胀。空目标单独测——参数写漏时不能静默通过。 */
  r = run('reset "空目标测试"');
  (r.code !== 0)
    ? ok('M2 reset 目标缺失被拒（不得静默通过）', 'exit=' + r.code)
    : no('M2 reset 空目标未被拒', 'exit=' + r.code);

  r = run('reset 1.3.721111111111111111111 "越界测试"');
  (r.code !== 0 && /不规范/.test(r.out))
    ? ok('M3 reset 到畸形版本号被拒（PATCH>99）', 'exit=' + r.code)
    : no('M3 reset 畸形目标未被拒', 'exit=' + r.code);

  r = run('bump1 "废弃命令测试"');
  (r.code !== 0 && /bump1 已废弃/.test(r.out))
    ? ok('M4 bump1 被调用即拒绝（防版本号再膨胀）', 'exit=' + r.code)
    : no('M4 bump1 未被拒绝（版本号会再次膨胀）', 'exit=' + r.code);

  /* ---- 放行类：合法操作必须成功 ---- */
  console.log('— 放行类：合法升版必须成功 —');

  setVer('1.3.72111111111111');
  r = run('reset 1.3.73 "重设测试"');
  (r.code === 0 && /基线重设/.test(r.out))
    ? ok('M5 畸形版本 reset 到规范版本放行', '1.3.72111111111111 -> 1.3.73')
    : no('M5 合法 reset 被误拒', 'exit=' + r.code + ' ' + r.out.slice(0, 120));

  setVer('1.3.73');
  r = run('patch "递增测试"');
  const nowV = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', '.version.json'), 'utf8')).v;
  (r.code === 0 && nowV === '1.3.74')
    ? ok('M6 PATCH 十进制递增', '1.3.73 -> 1.3.74（不再追加 1）')
    : no('M6 PATCH 递增错误', '得到 ' + nowV);

  setVer('1.3.99');
  r = run('patch "进位测试"');
  const carryV = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', '.version.json'), 'utf8')).v;
  (r.code === 0 && carryV === '1.4.0')
    ? ok('M7 PATCH 满 99 进位 MINOR', '1.3.99 -> 1.4.0')
    : no('M7 进位错误（会重新开始膨胀）', '得到 ' + carryV);
} finally {
  restore();
}

/* 还原校验：不留污染 */
const after = FILES.map(md5);
let same = true;
for (let i = 0; i < FILES.length; i++) if (before[i] !== after[i]) same = false;
same ? ok('M8 全部还原，字节一致', FILES.length + ' 个文件')
     : no('M8 还原不一致（工作区被污染）', FILES.filter((f, i) => before[i] !== after[i]).join(','));

console.log('\n==========================================================');
console.log('RESULT: PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL ? 1 : 0);
