#!/usr/bin/env node
/* =========================================================
 * mutate_onlinerver.cjs —— 云端三次取样守卫的变异验证
 * 立规原因：抓不住问题的检查等于没有。用纯函数喂伪造快照，不改任何线上文件。
 * 5 组：4 拒绝类（半同步 / 长度分裂 / 锚点分裂 / 快照缺失）+ 1 放行类（合法样本）。
 * 退出码：0=全部符合预期 / 1=有未捕获或误杀
 * ========================================================= */
'use strict';
const { CONTROLLED, BASELINE_FILE, verify } = require('./onlinerver.cjs');

function good() {
  const s = {};
  CONTROLLED.forEach(f => { s[f] = ['1.3.95']; });
  return [JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(s))];
}
function mutate(fn) { const snaps = good(); fn(snaps); return snaps; }

const cases = [
  ['M1 上传半同步：第2份快照仍有一处旧版本', () => mutate(s => { s[1]['index.html'] = ['1.3.94']; }), true],
  ['M2 长度分裂：混入 1.3.9（5 字符）', () => mutate(s => { s[2]['admin/index.html'] = ['1.3.9']; }), true],
  ['M3 锚点分裂：CHANGELOG 按旧口径取到历史版本', () => mutate(s => { s.forEach(x => { x['CHANGELOG.md'] = ['1.3.93']; }); }), true],
  ['M4 快照缺失：某份缺一个受控文件', () => mutate(s => { delete s[1]['js/ui.js']; }), true],
  ['M5 合法样本必须放行（防守卫一刀切）', () => good(), false]
];

let cap = 0, bad = 0;
for (const [name, build, shouldFail] of cases) {
  const r = verify(build());
  const ok = shouldFail ? r.fail > 0 : r.fail === 0;
  const failedChecks = r.checks.filter(x => !x.ok).map(x => x.name.split(' ')[0]).join(',');
  console.log((ok ? '√ ' : '× ') + name + '  PASS=' + r.pass + ' FAIL=' + r.fail + '  [' + failedChecks + ']');
  if (shouldFail && r.fail > 0) cap++;
  if (!ok) bad++;
}
console.log('mutate_onlinerver: 捕获 ' + cap + '/4，放行 ' + (bad === 0 ? '1/1' : '0/1') + '，异常 ' + bad);
process.exit(bad ? 1 : 0);
