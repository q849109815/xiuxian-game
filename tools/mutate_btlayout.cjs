#!/usr/bin/env node
/**
 * btlayout 变异验证 —— B8 震屏变换配对
 * 铁律：抓不住缺陷的断言等于不存在。必须证明 B8 能抓住「save/restore 不配对」。
 */
const fs = require('fs'), cp = require('child_process');
const F = 'js/battle.js';
const BAK = '.mut_btlayout.bak';
const orig = fs.readFileSync(F, 'utf8');
const md5 = (s) => require('crypto').createHash('md5').update(s).digest('hex').slice(0, 12);

function run() {
  const r = cp.spawnSync('node', ['tools/btlayout.cjs', '360x640'], { encoding: 'utf8', timeout: 300000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function step(name, mutate, expectFail) {
  fs.writeFileSync(BAK, orig);
  const bad = mutate(orig);
  if (bad === null) { console.log('X ' + name + ' :: 变异未命中（断言可能已失效）'); return 0; }
  fs.writeFileSync(F, bad);
  const r = run();
  const caught = /B8/.test(r.out) && /X B8|FAIL/.test(r.out);
  const okk = expectFail ? caught : !caught;
  console.log((okk ? '√ ' : 'X ') + name + ' :: ' + (caught ? '捕获' : '未捕获') + ' exit=' + r.code);
  if (!okk) console.log('   ' + r.out.split('\n').filter(l => /B8|FAIL|PASS/.test(l)).slice(0, 5).join('\n   '));
  fs.writeFileSync(F, orig);
  return okk ? 1 : 0;
}
let pass = 0, tot = 0;
const M = [
  ['注入 save/restore 不配对（事故本源）', (s) => s.replace('if (_shk || _jsh) c.restore();', 'if (_shk) c.restore();'), 1],
  ['注入 完全不 restore', (s) => s.replace('if (_shk || _jsh) c.restore();', '/* no restore */'), 1],
];
for (const [n, f, e] of M) { tot++; pass += step(n, f, e); }
const now = fs.readFileSync(F, 'utf8');
console.log('还原一致: ' + (md5(now) === md5(orig) ? '是 md5=' + md5(now) : '否（原始 ' + md5(orig) + ' 现 ' + md5(now) + '）'));
console.log('[mutate_btlayout] ' + pass + '/' + tot);
process.exit(pass === tot ? 0 : 1);
