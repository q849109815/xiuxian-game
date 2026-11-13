#!/usr/bin/env node
/* [mutate_verconst.cjs] 立规原因：新建守卫必须自证「抓得住」，否则等于没有。
 * 判据：每条用例注入后 verconst 必须 exit!=0 且输出点名对应断言；还原后 md5 逐字节一致。
 * 退出码：0=全部捕获且还原干净 / 1=有未捕获或残留 / 2=崩溃。 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const fp = f => path.join(ROOT, f);
const read = f => fs.readFileSync(fp(f), 'utf8');
const run = () => {
  const r = spawnSync('node', ['tools/verconst.cjs'], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const cases = [
  {
    name: 'M1 IMG_V 回退到旧值（玩家图标缓存刷不掉）',
    f: 'js/ui.js',
    inject: s => s.replace(/const IMG_V = '[^']+';/, "const IMG_V = '1.3.73';"),
    expect: 'V5',
  },
  {
    name: 'M2 AIMG_V 回退到旧值（后台图标缓存刷不掉）',
    f: 'admin/js/core.js',
    inject: s => s.replace(/const AIMG_V = '[^']+';/, "const AIMG_V = '1.3.73';"),
    expect: 'V6',
  },
  {
    name: 'M3 CHANGELOG 末尾插入低版本测试残留条目',
    f: 'CHANGELOG.md',
    inject: s => s + '\n## V1.3.70（测试残留） · 2026-11-14\n- 变异用例\n',
    expect: 'V7',
  },
];

console.log('=== verconst 变异验证（注入 → 必须报红 → 还原 → md5 一致）===');
const base = run();
console.log('基线: exit=' + base.code + '  ' + (base.out.match(/RESULT:.*/) || [''])[0]);
if (base.code !== 0) { console.error('[FAIL] 基线不绿，无法做变异验证'); process.exit(2); }

let caught = 0, failed = 0;
for (const c of cases) {
  const orig = read(c.f);
  const before = md5(orig);
  const mutated = c.inject(orig);
  if (mutated === orig) { console.log('  ✗ ' + c.name + ' 注入无效（锚点没命中）'); failed++; continue; }
  fs.writeFileSync(fp(c.f), mutated);
  let r;
  try { r = run(); } finally { fs.writeFileSync(fp(c.f), orig); }
  const after = md5(read(c.f));
  const hit = r.code !== 0 && r.out.includes(c.expect);
  const clean = after === before;
  if (hit && clean) { caught++; console.log('  √ ' + c.name + '  → 捕获(exit=' + r.code + ', ' + c.expect + ') 还原md5一致'); }
  else { failed++; console.log('  ✗ ' + c.name + '  → 未捕获或还原失败 exit=' + r.code + ' clean=' + clean); }
}
console.log('\nRESULT: 捕获 ' + caught + '/' + cases.length + '  异常 ' + failed);
process.exit(failed ? 1 : 0);
