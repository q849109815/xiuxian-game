#!/usr/bin/env node
/**
 * tools/mutate_mutrestore.cjs —— mutrestore.cjs 的变异验证
 * 铁律：抓不住缺陷的断言等于不存在。把修复逐条拆掉，守卫必须当场报红。
 */
const fs = require('fs'), cp = require('child_process'), crypto = require('crypto');
const ROOT = '/data/workspace/zombie';
const R = p => fs.readFileSync(ROOT + '/' + p, 'utf8');
const W = (p, s) => fs.writeFileSync(ROOT + '/' + p, s);
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const CASES = [
  { id: 'M1', f: 'tools/mutguard.cjs',
    from: 'const rel = () => { emergencyRestore(); try', to: 'const rel = () => { try',
    label: '信号中断不再还原 → 缺陷留在源码' },
  { id: 'M2', f: 'tools/mutguard.cjs',
    from: 'if (restored) ACTIVE = null;', to: '',
    label: '还原成功不清空登记 → 后续退出重复写回' },
  { id: 'M3', f: 'tools/mutguard.cjs',
    from: 'try { restoreAll(); } catch', to: 'try { /* noop */ } catch',
    label: '收工发现污染只提示不恢复' },
  { id: 'M4', f: 'tools/mutguard.cjs',
    from: '&& !autoFixed\n', to: '\n',
    label: '自动恢复过的批次仍判全绿' },
  { id: 'M5', f: 'tools/push.py',
    from: "'assets/char/c01_jack.jpg', ", to: '',
    label: '上传清单删掉首张立绘 → 线上破图' },
  { id: 'M6', f: 'tools/mutguard.cjs',
    from: '      fs.writeFileSync(fp, ACTIVE.src);', to: '',
    label: '中断还原函数不写回 → 注入态留在源码（E2 真实执行捕获）' },
];
let P = 0, F = 0;
console.log('=== mutrestore 变异验证 ===');
for (const c of CASES) {
  const orig = R(c.f), before = md5(orig);
  if (!orig.includes(c.from)) { console.log(`[锚点不存在] ${c.id} ${c.f}`); F++; continue; }
  let ec = -1, out = '';
  try {
    W(c.f, orig.replace(c.from, c.to));
    const r = cp.spawnSync('node', ['tools/mutrestore.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    ec = r.status; out = String(r.stdout || '') + String(r.stderr || '');
  } finally {
    W(c.f, orig);
  }
  const restored = md5(R(c.f)) === before;
  const caught = ec !== 0 && out.includes('FAIL=') && !out.includes('FAIL=0');
  const ok = caught && restored;
  if (ok) P++; else F++;
  console.log(`${ok ? '✅捕获' : '❌失效'} ${c.id} ${c.label} (exit=${ec} 还原=${restored ? '一致' : '不一致'})`);
  if (!ok) console.log(out.split('\n').filter(x => /x |RESULT/.test(x)).slice(0, 4).join(' | '));
}
const base = cp.spawnSync('node', ['tools/mutrestore.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
const green = base.status === 0;
console.log(`\n基线还原后：${green ? 'PASS' : 'FAIL'}（exit=${base.status}）`);
if (!green) F++;
console.log(`RESULT: PASS=${P} FAIL=${F}`);
console.log(`=== PASS ${P}/${F} ===`);
process.exit(F ? 1 : 0);
