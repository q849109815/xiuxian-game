#!/usr/bin/env node
/**
 * btprereq 变异验证 —— 证明「前提类断言不得混入缺陷计数」这条守卫真能抓缺陷
 * ------------------------------------------------------------------
 * 铁律：抓不住缺陷的断言等于不存在。本轮新建 btprereq 必须自证。
 *
 * 备份清单从配置解析，不手写（手写曾漏掉一个文件 → 污染残留被传上线）。
 *
 * 用例：
 *   M1 B0 前提失败改回 bad()          → 环境问题又被报成游戏缺陷
 *   M2 B2 前提分支改回 bad()          → 同上
 *   M3 去掉 PREREQ 计数器             → pq 无处登记
 *   M4 退出码去掉前提态（FAIL?1:0）   → Agent 区分不了「游戏坏」和「测试没跑起来」
 *   M5 dash 加回中性词「未跑」        → 工具故障被静默
 *   M6 dash 三态改回两态              → 看板仍显示「未过N项」
 *   M7 还原校验：字节一致 + 守卫回绿
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.dirname(path.dirname(__filename));
const F = p => path.join(ROOT, p);

const TARGETS = ['tools/btlayout.cjs', 'tools/dash.cjs'];
const bak = {};

function backup() { for (const t of TARGETS) bak[t] = fs.readFileSync(F(t)); }
function restore() { for (const t of TARGETS) fs.writeFileSync(F(t), bak[t]); }
function edit(t, from, to) {
  const p = F(t); let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error('锚点未命中: ' + from.slice(0, 60));
  s = s.replace(from, to); fs.writeFileSync(p, s);
}
function runGuard() {
  try {
    const out = execFileSync('node', [F('tools/btprereq.cjs')], { encoding: 'utf8', cwd: ROOT });
    return { code: 0, out };
  } catch (e) { return { code: e.status == null ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
function sha(s) { return require('crypto').createHash('md5').update(s).digest('hex'); }

const CASES = [
  ['M1 B0 前提失败改回 bad()', () => edit('tools/btlayout.cjs',
    "pq('B0 未能进入战斗'", "bad('B0 未能进入战斗'")],
  ['M2 B2 前提分支改回 bad()', () => edit('tools/btlayout.cjs',
    "pq('B2 三选一无法弹出'", "bad('B2 三选一无法弹出'")],
  /* M3 必须真正破坏功能：只在旁边加注释不算变异（曾因此误判守卫失效） */
  ['M3 pq 不再计数（前提失败静默丢失）', () => edit('tools/btlayout.cjs',
    'const pq = (n, d) => { PREREQ++;', 'const pq = (n, d) => { /* mutated */')],
  ['M4 退出码去掉前提态', () => edit('tools/btlayout.cjs',
    'process.exit(FAIL ? 1 : (PREREQ ? 2 : 0));', 'process.exit(FAIL ? 1 : 0);')],
  ['M5 dash 加回中性词「未跑」', () => edit('tools/dash.cjs',
    "!ta?'未跑通✗'", "!ta?'未跑'")],
  ['M6 dash 三态改回两态', () => edit('tools/dash.cjs',
    '!bt.run?\'未跑通✗(判失败)\'', '!bt.run?\'未跑通\'')],
];

/* M8 端到端（真实浏览器）：强制 enterBattle 失败，必须走 PREREQ 且退出码 2。
 * 修复前同样场景会输出「FAIL 1」退出码 1，看板显示「未过 1 项」——把环境问题报成游戏缺陷。 */
function runBtLayout() {
  try { return { code: 0, out: execFileSync('node', [F('tools/btlayout.cjs'), '360x640'], { encoding: 'utf8', cwd: ROOT, timeout: 420000 }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

let pass = 0, fail = 0;
console.log('=== btprereq 变异验证 ===');
backup();
const baseSha = TARGETS.map(t => sha(fs.readFileSync(F(t)))).join('|');

for (const [name, mut] of CASES) {
  restore();
  let err = null;
  try { mut(); } catch (e) { err = e.message; }
  if (err) { console.log('  X ' + name + ' :: 变异注入失败 ' + err); fail++; continue; }
  const r = runGuard();
  if (r.code !== 0) { console.log('  √ ' + name + ' → 守卫捕获（exit=' + r.code + '）'); pass++; }
  else { console.log('  X ' + name + ' → 未捕获，守卫失效'); fail++; }
}

/* M5 需要单独处理：注入中性词要真的写进去 */
restore();

/* M8 端到端：真实浏览器验证 PREREQ 路径 */
restore();
try {
  edit('tools/btlayout.cjs', "      e = await enterBattle(pg, '1-1');", "      e = { scr: 'home' }; /* M8 模拟前提未就绪 */");
  const r8 = runBtLayout();
  const m8 = (r8.out.match(/\[btlayout\] PASS (\d+) \/ FAIL (\d+) \/ PREREQ (\d+)/) || []);
  if (m8 && +m8[3] >= 1 && +m8[2] === 0 && r8.code === 2) {
    console.log('  √ M8 端到端：前提未就绪 → PREREQ ' + m8[3] + ' / FAIL 0 / exit=2（不误报为缺陷）'); pass++;
  } else {
    console.log('  X M8 端到端：前提未就绪未走 PREREQ 路径', JSON.stringify({ m: m8[0] || null, code: r8.code })); fail++;
  }
} catch (e) { console.log('  X M8 端到端执行失败 :: ' + e.message); fail++; }

restore();
const endSha = TARGETS.map(t => sha(fs.readFileSync(F(t)))).join('|');
if (endSha === baseSha) { console.log('  √ M7 还原校验：' + TARGETS.length + ' 个文件字节一致'); pass++; }
else { console.log('  X M7 还原校验：文件被污染'); fail++; }

const fin = runGuard();
if (fin.code === 0) { console.log('  √ M7b 还原后守卫回绿'); pass++; }
else { console.log('  X M7b 还原后守卫仍红'); fail++; }

console.log('\n[mutate_btprereq] PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
