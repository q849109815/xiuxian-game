#!/usr/bin/env node
/* 【dashcons.cjs】立规原因：本工具为常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码语义：0=全部通过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
/* ============================================================================
 * tools/dashcons.cjs —— 看板判据一致性守卫（V1.3.77 新增固定项）
 * ----------------------------------------------------------------------------
 * 要证明什么：
 *   ① biguard 输出的两种合法形态都能被解析，崩溃/超时不得被判绿，
 *      真 FAIL 不得被吞成「未跑通」；
 *   ② 工具体检残快照（条数不足 / complete=false / 空跑行）一律判「需重跑」；
 *   ③ 判据确实被 dash.cjs 使用（不是另一个没人调用的副本）；
 *   ④ synccheck 实时基准与 fullscan D3 的修复真实接线，
 *      且不再有「静默吞异常」「待定性」这两类让假结论溜过去的写法。
 *
 * 铁律：抓不住缺陷的断言等于不存在 —— 本守卫由 mutate_dashcons.cjs 变异验证。
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const R = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const DP = require('./dashparse.cjs');

let pass = 0, fail = 0; const bad = [];
const ok = m => { pass++; console.log('  √  ' + m); };
const ng = m => { fail++; bad.push(m); console.log('  x  ' + m); };
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  a === b ? ok(name + ' → ' + a) : ng(name + ' 期望 ' + b + ' 实得 ' + a);
};

console.log('=== 看板判据一致性守卫 dashcons ===');

/* ---- A 组：parseBI 真实执行（5 组样本） ---- */
eq('A1 现行格式 PASS=12 FAIL=0', DP.parseBI('biguard: PASS=12 FAIL=0', 0), { p: 12, f: 0 });
eq('A2 历史格式 PASS 12 FAIL 0', DP.parseBI('biguard: PASS 12 FAIL 0', 0), { p: 12, f: 0 });
eq('A3 无计数输出判未跑通', DP.parseBI('BIGUARD OK', 0), null);
eq('A4 崩溃退出不得靠 stdout 蒙混', DP.parseBI('biguard: PASS=12 FAIL=0', 1), null);
eq('A5 真失败原样保留', DP.parseBI('biguard: PASS=10 FAIL=2', 0), { p: 10, f: 2 });

/* ---- B 组：taComplete 真实执行（4 组样本） ---- */
const names = Array.from({ length: 30 }, (_, i) => 'g' + i);
const fullRows = names.map(n => ({ name: n, pass: 10, fail: 0 }));
eq('B1 事故残快照（1行/空跑）', DP.taComplete(
  { rows: [{ name: 'themeguard.cjs', pass: 0, fail: 0 }], total: 1, bad: 1, trust: 0 }, names), false);
eq('B2 complete=false 分批未完成', DP.taComplete(
  { rows: fullRows, total: 30, complete: false, trust: 30 }, names), false);
eq('B3 行数不足注册数', DP.taComplete(
  { rows: fullRows.slice(0, 9), total: 9, complete: true, trust: 9 }, names), false);
eq('B4 完整快照判绿', DP.taComplete(
  { rows: fullRows, total: 30, complete: true, trust: 30 }, names), true);

/* ---- C 组：判据接线证（防止「改了模块、看板没用」） ---- */
const dash = R('tools/dash.cjs');
/require\(['"]\.\/dashparse\.cjs['"]\)/.test(dash)
  ? ok('C1 dash.cjs 引入共享判据模块') : ng('C1 dash.cjs 未引入 dashparse.cjs');
/DP\.parseBI\(/.test(dash) ? ok('C2 埋点解析走共享模块') : ng('C2 埋点解析未走共享模块');
/DP\.taComplete\(/.test(dash) ? ok('C3 体检完整性走共享模块') : ng('C3 体检完整性未走共享模块');
/残快照←需重跑✗/.test(dash) ? ok('C4 残快照显式判失败（带✗，非中性词）') : ng('C4 残快照显示未带显式失败标记');

/* ---- D 组：实时基准与 D3 修复接线证 ---- */
const sync = R('tools/synccheck.py'), scan = R('tools/fullscan.cjs');
/'consistent':\s*bad\s*==\s*0/.test(sync)
  ? ok('D1 synclast.consistent 由真实差异数推导') : ng('D1 consistent 不是由 bad 推导（可能是写死 true）');
/synclast\.json/.test(sync) && /synclast\.json/.test(scan)
  ? ok('D2 实时基准生产端与消费端都接线') : ng('D2 synclast.json 未双端接线');
/except Exception:\s*pass/.test(sync)
  ? ng('D3 synccheck 仍有静默吞异常（基准失效会无人知晓）') : ok('D3 落盘异常显式判失败');
/d3Live\.consistent === true/.test(scan) && !/info\('D3 /.test(scan)
  ? ok('D4 D3 按显式布尔判定，不再用 info() 输出「待定性」中性词') : ng('D4 D3 判据或输出形态仍是旧版');

/* ---- D5：并发锁身份核验（防变异验证静默停摆） ----
 * 必须剥注释再查：第一版直接对全文找 /proc/，而注释里写着「读 /proc/<pid>/cmdline」，
 * 变异把代码改成 /procX/ 后注释仍命中 → 假通过（历史错题「锚点选在注释里」复发）。
 * 变异验证当场抓出，改成只校验真实代码。 */
const mut = R('tools/mutguard.cjs');
const mutCode = mut.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
/\/proc\//.test(mutCode) && /mutguard\\\.cjs/.test(mutCode)
  ? ok('D5 并发锁按 cmdline 核验实例身份（PID 复用不再永久拒绝开工）')
  : ng('D5 并发锁仍只看 PID 存活，存在静默停摆风险');

/* ---- E 组：端到端真实执行（biguard 实跑 → 共享判据解析 → 判绿） ---- */
try {
  const out = execFileSync('node', ['tools/biguard.cjs'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
  });
  const r = DP.parseBI(out, 0);
  r && r.f === 0 && r.p >= 12
    ? ok('E1 biguard 实跑输出可解析且全绿（PASS=' + r.p + '）')
    : ng('E1 biguard 实跑解析异常：' + JSON.stringify(r));
} catch (e) {
  ng('E1 biguard 实跑失败（判失败，不当中性词略过）：' + String(e.message).slice(0, 120));
}

console.log('-'.repeat(62));
console.log('RESULT: PASS=' + pass + ' FAIL=' + fail);
console.log('dashcons: PASS=' + pass + ' FAIL=' + fail);
if (bad.length) { console.log('【未过项】'); bad.forEach(b => console.log('  · ' + b)); }
process.exit(fail ? 1 : 0);
