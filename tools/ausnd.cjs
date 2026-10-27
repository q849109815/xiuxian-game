#!/usr/bin/env node
/* ==========================================================================
 * tools/ausnd.cjs —— 音频部 AU-02 常驻验证：打击音效与 juice 事件对齐矩阵
 * --------------------------------------------------------------------------
 * 检查项：
 *   A1 每个 juice 事件都必须有音效（7 个事件全覆盖，不允许静音事件）
 *   A2 音效名必须真实存在于 audio.js 的音效库（写到不存在的名字=静默无声）
 *   A3 语义正确：BOSS 死亡不得用 levelup；暴击必须用 crit 而非 hit
 *   A4 高频音效必须节流（成片清怪不糊成爆音）
 *   A5 节流单位正确（CFG.STOP_*.gap 是秒，转毫秒后必须 >= 80ms）
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, m) => { c ? (pass++, console.log('  o ' + n)) : (fail++, console.log('  x ' + n + ' :: ' + m)); };

/* ---------- 读源码 ---------- */
const juice = fs.readFileSync(path.join(ROOT, 'js/juice.js'), 'utf8');
const audio = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');

/* ---------- A2：音效库里真实存在的名字 ---------- */
const defined = new Set(
  (audio.match(/case '([a-zA-Z]+)':/g) || []).map(s => s.replace(/case '/, '').replace(/':/, ''))
);

/* ---------- A1：每个事件的音效 ---------- */
// 事件 -> 期望音效（语义矩阵）
const MATRIX = [
  { ev: 'onKill',      branch: 'BOSS 死亡',   want: 'boss'     },
  { ev: 'onKill',      branch: '普通击杀',    want: 'kill'     },
  { ev: 'onKill',      branch: '连杀里程碑',  want: 'upgrade'  },
  { ev: 'onHit',       branch: '暴击',       want: 'crit'     },
  { ev: 'onPlayerHurt',branch: '防线受伤',    want: 'hurt'     },
  { ev: 'onBlast',     branch: '爆炸',       want: 'explode'  },
  { ev: 'onWave',      branch: '波次推进',    want: 'wave'     },
];

console.log('=== AU-02 打击音效矩阵 ===');

/* 逐个事件块提取 _snd/_sndGap 调用 */
// 按方法切块
function block(name) {
  const i = juice.indexOf('    ' + name + '(');
  if (i < 0) return '';
  // 到下一个顶层方法或文件尾
  const rest = juice.slice(i);
  const m = rest.match(/\n    \}\n    \},/);
  return m ? rest.slice(0, m.index + m[0].length) : rest;
}

const blocks = {};
for (const ev of ['onKill', 'onHit', 'onPlayerHurt', 'onBlast', 'onWave']) {
  blocks[ev] = block(ev);
}

for (const row of MATRIX) {
  const b = blocks[row.ev] || '';
  // 该事件块内所有音效调用
  const calls = [...b.matchAll(/this\._snd(?:Gap)?\(\s*'([a-zA-Z]+)'/g)].map(m => m[1]);
  ok('A1/A3 ' + row.ev + ' · ' + row.branch + ' → ' + row.want,
     calls.includes(row.want),
     '未找到，块内实际音效=[' + calls.join(',') + ']');
}

/* ---------- A2：音效名真实存在 ---------- */
const allCalls = [...juice.matchAll(/this\._snd(?:Gap)?\(\s*'([a-zA-Z]+)'/g)].map(m => m[1]);
const bad = allCalls.filter(n => !defined.has(n));
ok('A2 全部音效名在 audio.js 有定义', bad.length === 0, '未定义: ' + bad.join(','));

/* ---------- A3：禁止用 levelup 做战斗打击音 ---------- */
ok('A3 BOSS 死亡未误用 levelup', !allCalls.includes('levelup'), '仍存在 levelup 调用');

/* ---------- A4/A5：节流单位 ---------- */
// 两种结尾并存：Math.max(…)*1000 的 `));` 与字面量的 `);`
// 用贪婪 .* 匹配到行内最后一个 `)`，两种都能完整捕获
const gapCalls = [...juice.matchAll(/this\._sndGap\(\s*'([a-zA-Z]+)'\s*,\s*(.*)\)/g)];
ok('A4 高频音效已走节流 _sndGap', gapCalls.length >= 3, '节流调用仅 ' + gapCalls.length + ' 处');

let unitOk = true, unitMsg = '';
for (const g of gapCalls) {
  const expr = g[2];
  // 必须是 ×1000 转换，或直接的 >=80 毫秒字面量
  const hasConv = /\*\s*1000/.test(expr);
  const literal = expr.match(/^\s*(\d+)\s*$/);
  if (!hasConv && !(literal && Number(literal[1]) >= 80)) {
    unitOk = false; unitMsg += g[1] + '=' + expr + ' ';
  }
}
ok('A5 节流窗口单位正确（秒→毫秒，>=80ms）', unitOk, unitMsg);

/* ---------- 运行时验证：真跑一遍 ---------- */
console.log('=== 运行时：真实触发 7 个事件 ===');
const calls = [];
const win = {
  performance: { now: () => Date.now() },
  SND: { play: (n) => calls.push(n) },
  UI: { toast(){}, btTalk(){} },
  requestAnimationFrame: () => 0,
  document: { getElementById: () => null, createElement: () => ({ style:{}, classList:{add(){},remove(){}}, appendChild(){}, addEventListener(){} }), body:{appendChild(){}}, documentElement:{style:{}} },
};
win.window = win;
const vm = require('vm');
const ctx = vm.createContext(win);
try {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/juice.js'), 'utf8'), ctx);
  const J = win.JUICE;
  if (!J) throw new Error('JUICE 未导出');

  J.reset && J.reset();
  // 普通击杀 x3（节流：应只响 1 次 kill）
  J.onKill({}, 0); J.onKill({}, 0); J.onKill({}, 0);
  // BOSS 死亡
  J.onKill({ isBoss: true }, 0);
  // 暴击 x3（节流）
  J.onHit(10, true); J.onHit(10, true); J.onHit(10, true);
  // 受伤 x2（不节流，应响 2 次）
  J.onPlayerHurt(5); J.onPlayerHurt(5);
  // 爆炸 x2（节流，应 1 次）
  J.onBlast(72); J.onBlast(72);
  // 波次
  J.onWave(3);

  const cnt = {};
  calls.forEach(n => cnt[n] = (cnt[n] || 0) + 1);
  console.log('  实际音效序列: ' + calls.join(' → '));
  ok('R1 普通击杀 kill 已触发', (cnt.kill || 0) >= 1, 'kill=' + (cnt.kill||0));
  ok('R2 BOSS 死亡 boss 已触发', (cnt.boss || 0) === 1, 'boss=' + (cnt.boss||0));
  ok('R3 暴击 crit 已触发', (cnt.crit || 0) >= 1, 'crit=' + (cnt.crit||0));
  ok('R4 受伤 hurt 不节流（2次全响）', (cnt.hurt || 0) === 2, 'hurt=' + (cnt.hurt||0));
  ok('R5 爆炸 explode 已触发且被节流', (cnt.explode || 0) === 1, 'explode=' + (cnt.explode||0));
  ok('R6 波次 wave 已触发', (cnt.wave || 0) === 1, 'wave=' + (cnt.wave||0));
  ok('R7 kill 被节流（3次击杀未响3次）', (cnt.kill || 0) < 3, 'kill=' + (cnt.kill||0));
  ok('R8 无 levelup 误触发', !cnt.levelup, 'levelup=' + (cnt.levelup||0));
} catch (e) {
  fail++; console.log('  x 运行时异常 :: ' + e.message);
}

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
