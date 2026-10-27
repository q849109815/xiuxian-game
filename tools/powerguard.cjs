#!/usr/bin/env node
/**
 * V1.2.0 常驻守卫 · 战力链缺字段兜底（程序 D-12 / 测试 T-13）
 *
 * 背景（实测）：
 *   E.power() 全项目 17 处调用（ui.js 14 / main.js 2 / battle.js 1），
 *   而 ensureDicts 只在 ui.js 出现 4 次 —— main.js / battle.js 两条战力链
 *   从没走过缺字段兜底。后台 GM 热改档在 session 内删掉 p.talents 时，
 *   attrs() 内 p.talents.t_armor 直接抛 TypeError → 结算面板/战斗内白屏。
 *
 * 修法：power() 入口就地 ensureDicts(p) 一次，一处修住全部 17 个调用点。
 *
 * 铁律：每条断言必须能被变异测试证伪 —— 抓不住注入缺陷的断言等于不存在。
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let PASS = 0; const FAILS = [];
const ok = (c, n, d) => { if (c) { PASS++; } else { FAILS.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); } };

const ctx = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, Math, Date, JSON,
  Number, String, Array, Object, isNaN, parseInt, parseFloat, setTimeout,
  location: { pathname: '/' }, fetch: async () => ({ ok: false }),
});
ctx.window = ctx;
for (const f of ['js/config.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const E = ctx.E;

console.log('=== V1.2.0 守卫：战力链缺字段兜底 ===\n');

/* A. 基线：正常存档必须算出有限正数 */
const base = E.power(E.newPlayer('T'));
ok(Number.isFinite(base) && base > 0, 'A1 正常存档战力有限且为正', 'power=' + base);

/* B. 逐个删字段：不得抛异常、不得出 NaN */
const FIELDS = ['talents', 'build', 'cleared', 'tasks', 'equip', 'gems', 'chip', 'bag', 'stats'];
for (const k of FIELDS) {
  const p = E.newPlayer('T');
  const before = E.power(p);
  delete p[k];
  let v = null, threw = null;
  try { v = E.power(p); } catch (e) { threw = e.message; }
  ok(!threw, 'B_' + k + '_不抛', threw);
  ok(Number.isFinite(v), 'B_' + k + '_非NaN', 'v=' + v);
  ok(v === before, 'B_' + k + '_数值不变（不影响正常玩家）', v + ' vs ' + before);
}

/* C. 极端脏值 */
const dirty = [null, undefined, {}, { lv: 1 }, { lv: 'abc' }, { talents: null }, { talents: 'x' }, { equip: 'x' }];
let di = 0;
for (const d of dirty) {
  di++;
  let threw = null, v = null;
  try { v = E.power(d); } catch (e) { threw = e.message; }
  ok(!threw, 'C' + di + '_脏值不抛', threw);
  ok(v === null || Number.isFinite(v), 'C' + di + '_脏值非NaN', 'v=' + v);
}

/* D. 幂等：连续调用结果稳定 */
const p2 = E.newPlayer('T');
const a1 = E.power(p2), a2 = E.power(p2), a3 = E.power(p2);
ok(a1 === a2 && a2 === a3, 'D1 幂等', [a1, a2, a3].join('/'));

/* E. 源码层：power 入口必须调用 ensureDicts */
const eng = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
const m = eng.match(/power\(p\)\s*\{[\s\S]{0,400}?ensureDicts/);
ok(!!m, 'E1 power() 入口含 ensureDicts 兜底');

console.log('\n--- PASS ' + PASS + ' / FAIL ' + FAILS.length + ' ---');
if (FAILS.length) process.exit(1);
