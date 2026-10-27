#!/usr/bin/env node
/**
 * 人事裁决守卫（测试部交付物）
 * 铁律：抓不出缺陷的断言等于不存在。本工具对「连续2轮C换人」制度做可复现验证，
 * 全部用合成数据，不污染真实台账（运行前备份、运行后还原 _hr.json）。
 *
 * 用法: node tools/hrguard.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HRP = path.join(ROOT, 'tools', '_hr.json');
const { judge } = require('./hr.cjs');

const rank = (s) => s >= 95 ? 'A+' : s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'E';
const mk = (score, cause) => ({ score, items: [{ got: 0, max: 10, note: 'x', cause }] });
const dept = (o) => ({ '策划': mk(100), '美术': mk(100), '程序': mk(100), '音频': mk(100), '测试': o, '运营': mk(100) });

let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  OK ${name}${info ? ' :: ' + info : ''}`); } else { fail++; console.log(`  XX ${name}${info ? ' :: ' + info : ''}`); } };

// —— 备份真实台账 ——
let backup = null;
try { backup = fs.readFileSync(HRP, 'utf8'); } catch (e) { }
const restore = () => { try { backup == null ? fs.unlinkSync(HRP) : fs.writeFileSync(HRP, backup); } catch (e) { } };

console.log('=== 人事裁决守卫 ===\n');

// A1 连续 2 轮内部原因 C → 必须换人
try {
  fs.writeFileSync(HRP, JSON.stringify({ roster: {}, log: [] }));
  let hist = { '测试': ['C'] };
  const r1 = judge({ K: dept(mk(75, 'internal')), rank, hist, round: 2, flaky: [] });
  const fired1 = r1.fired.filter(x => x.dept === '测试');
  ok(fired1.length === 1, 'A1 连续2轮内部C → 触发换人', `fired=${fired1.length}`);
  ok(r1.hr.roster['测试'].gen === 2, 'A2 负责人更替', `gen=${r1.hr.roster['测试'].gen} head=${r1.hr.roster['测试'].head}`);
  ok(r1.hr.roster['测试'].probationUntil === 3, 'A3 新负责人带试用期', `截至第 ${r1.hr.roster['测试'].probationUntil} 轮`);

  // A4 试用期拿 A → 转正
  const r2 = judge({ K: dept(mk(95)), rank, hist, round: 3, flaky: [] });
  ok(r2.hr.roster['测试'].probationUntil === null, 'A4 试用期达标 → 转正');
  ok(r2.hr.log.some(x => x.action === 'PROBATION_PASS'), 'A5 转正写入人事台账');
} catch (e) { ok(false, 'A 组异常', e.message); }

// B 试用期拿 C → 再次换人
try {
  fs.writeFileSync(HRP, JSON.stringify({ roster: {}, log: [] }));
  const hist = { '测试': ['C'] };
  judge({ K: dept(mk(75, 'internal')), rank, hist, round: 2, flaky: [] });
  const r3 = judge({ K: dept(mk(70, 'internal')), rank, hist, round: 3, flaky: [] });
  ok(r3.hr.roster['测试'].gen === 3, 'B1 试用未过 → 再次换人', `gen=${r3.hr.roster['测试'].gen}`);
  ok(r3.hr.log.some(x => x.action === 'PROBATION_FAIL'), 'B2 试用未过写入台账');
} catch (e) { ok(false, 'B 组异常', e.message); }

// C 外部依赖 C* → 不计入连续，不换人
try {
  fs.writeFileSync(HRP, JSON.stringify({ roster: {}, log: [] }));
  const hist = { '测试': ['C'] };
  const r4 = judge({ K: dept(mk(75, 'external')), rank, hist, round: 2, flaky: [] });
  ok(r4.fired.length === 0, 'C1 纯外部依赖的C → 不换人（避免误杀）');
  ok(hist['测试'].slice(-1)[0] === 'C*', 'C2 评级标记为 C*', `末位=${hist['测试'].slice(-1)[0]}`);
  const r5 = judge({ K: dept(mk(75, 'external')), rank, hist, round: 3, flaky: [] });
  ok(r5.fired.length === 0, 'C3 连续两轮 C* 仍不换人');
} catch (e) { ok(false, 'C 组异常', e.message); }

// D 守卫跑挂 → 整轮不评级、不裁决
try {
  fs.writeFileSync(HRP, JSON.stringify({ roster: {}, log: [] }));
  const hist = { '测试': ['C'] };
  const before = JSON.stringify(hist);
  const r6 = judge({ K: dept(mk(75, 'internal')), rank, hist, round: 2, flaky: ['perfq'] });
  ok(r6.fired.length === 0, 'D1 工具跑挂 → 不触发换人');
  ok(JSON.stringify(hist) === before, 'D2 跑挂轮次不写入评级历史');
  ok(r6.lines.some(l => l.includes('不可信')), 'D3 输出不可信告警');
} catch (e) { ok(false, 'D 组异常', e.message); }

// E 混合归因：既有内部也有外部 → 按内部计
try {
  fs.writeFileSync(HRP, JSON.stringify({ roster: {}, log: [] }));
  const hist = { '测试': ['C'] };
  const K2 = dept({ score: 75, items: [{ got: 0, max: 10, cause: 'internal' }, { got: 0, max: 5, cause: 'external' }] });
  const r7 = judge({ K: dept2(K2), rank, hist, round: 2, flaky: [] });
  ok(r7.fired.length === 1, 'E1 含内部未交付 → 正常计入并换人');
} catch (e) { ok(false, 'E 组异常', e.message); }
function dept2(K2) { return { '策划': mk(100), '美术': mk(100), '程序': mk(100), '音频': mk(100), '测试': K2['测试'], '运营': mk(100) }; }

restore();
console.log(`\n--- ${pass} passed, ${fail} failed ---`);
console.log(fail === 0 ? 'HRGUARD: PASS' : 'HRGUARD: FAIL');
process.exit(fail === 0 ? 0 : 1);
