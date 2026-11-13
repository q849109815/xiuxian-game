#!/usr/bin/env node
/* [verconst.cjs] 立规原因：V1.3.90 实测发现「报了 V1.3.89 已发布」但全站版本戳仍分裂
 * （基线 1.3.73 / index 与 config 1.3.74 / IMG_V 与 AIMG_V 1.3.73），
 * 且 CHANGELOG 末尾挂着一次 reset 测试残留段，导致 R1/R3 判版本回退。
 * 根因是版本脚本被打断留下半同步状态，而看板没有一条独立检查问「8 处是否一致」。
 * 判据：以本工具 8 项断言输出为准；任一不一致即点名具体文件。
 * 退出码：0=全过 / 1=有未过项 / 2=崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let P = 0, F = 0;
const ok = (n, d) => { P++; console.log('  √ ' + n + (d ? '  ' + d : '')); };
const no = (n, d) => { F++; console.log('  ✗ ' + n + (d ? '  ' + d : '')); };

console.log('=== 版本一致性守卫 verconst（V1.3.90 新增固定项）===');
try {
  const base = JSON.parse(R('tools/.version.json')).v;
  console.log('发布基线 V' + base + '\n— V1~V7 八处版本戳与基线一致 —');
  const idx = R('index.html'), adm = R('admin/index.html');
  const cfg = R('js/config.js'), ui = R('js/ui.js'), core = R('admin/js/core.js');
  const log = R('CHANGELOG.md');
  const allV = s => [...s.matchAll(/\?v=([\w.\-]+)/g)].map(x => x[1]);
  const idxV = allV(idx), admV = allV(adm);
  const cfgV = (cfg.match(/HOT_UPDATE:\s*\{[\s\S]*?version:\s*'([^']+)'/) || [])[1];
  const manV = [...cfg.matchAll(/ver\s*:\s*'([^']+)'/g)].map(x => x[1]);
  const imgV = (ui.match(/const\s+IMG_V\s*=\s*'([^']+)'/) || [])[1];
  const aimgV = (core.match(/const\s+AIMG_V\s*=\s*'([^']+)'/) || [])[1];
  const heads = [...log.matchAll(/^## V([\d.]+)/gm)].map(x => x[1]);

  const chk = (n, cond, got) => cond ? ok(n, got) : no(n, '实得 ' + got + '，期望 ' + base);
  chk('V1 index.html ?v=', idxV.length > 0 && idxV.every(x => x === base), [...new Set(idxV)].join(','));
  chk('V2 admin/index.html ?v=', admV.length > 0 && admV.every(x => x === base), [...new Set(admV)].join(','));
  chk('V3 config.js HOT_UPDATE.version', cfgV === base, String(cfgV));
  chk('V4 config.js manifest ver', manV.length > 0 && manV.every(x => x === base), [...new Set(manV)].join(','));
  chk('V5 ui.js IMG_V', imgV === base, String(imgV));
  chk('V6 admin/core.js AIMG_V', aimgV === base, String(aimgV));
  chk('V7 CHANGELOG 最新条目', heads.length > 0 && heads[heads.length - 1] === base, String(heads[heads.length - 1]));

  console.log('\n— V8 版本序列严格递增（防测试残留 / 乱序条目）—');
  const cmp = (a, b) => {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
    return 0;
  };
  /* 唯一合法回落：V1.3.73 版本规范整改，把「末尾追加 1」膨胀出的畸形串拉回规范区间。
   * 与 ver.cjs reset 的硬约束（当前畸形 + 目标规范）完全一致。
   * 除此之外任何回落都是测试残留或乱序条目，必须报红——这正是 V1.3.90 清掉的那一段。 */
  const malformed = s => { const p = s.split('.').map(Number); return p.length !== 3 || !Number.isFinite(p[2]) || p[2] > 99; };
  let firstBad = '', resets = 0;
  for (let i = 1; i < heads.length; i++) {
    if (cmp(heads[i], heads[i - 1]) > 0) continue;
    if (malformed(heads[i - 1]) && !malformed(heads[i])) { resets++; continue; }
    firstBad = heads[i - 1] + ' -> ' + heads[i]; break;
  }
  firstBad ? no('V8 版本序列未递增', firstBad) : ok('V8 版本序列严格递增', heads.length + ' 条，基线重设豁免 ' + resets + ' 次');
} catch (e) {
  no('工具崩溃', String(e && e.message || e));
  console.log('\nRESULT: PASS=' + P + ' FAIL=' + F + '（崩溃显式判失败）');
  process.exit(2);
}
console.log('\n==========================================================');
console.log('RESULT: PASS=' + P + ' FAIL=' + F);
process.exit(F ? 1 : 0);
