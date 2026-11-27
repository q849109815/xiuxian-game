#!/usr/bin/env node
/* =========================================================
 * mutate_auditsave.cjs —— 体检快照保护 · 变异验证（V1.3.96 收口）
 *
 * 立规原因：dash 的「检测工具体检」项会周期性假红。查下来两个根因：
 *   ① mistmut 的 M9 只体检一个工具，把 34 行完整快照覆盖成 1 行残快照；
 *   ② 旧时效证比较 GUARDS 文件 mtime，而注入→还原必然刷新 mtime
 *      （本沙盒 fs.utimesSync 报 EPERM，回不去），于是误报「已过期」。
 * 修法：toolaudit 加 --no-save；mistmut M9 带上；dashparse 的 taFresh
 *   改为「年龄 + rows 名字覆盖」，不再看 mtime。
 *
 * 本脚本证明：① 不带保护确实会踩坏（对照组，注入有效）；
 *   ② 带 --no-save 后快照分毫不动；③ M9 跑完快照仍完整；
 *   ④ mtime 被刷新后新判据仍判新鲜；⑤ 判据拒绝类仍抓得住；⑥ 接线真实存在。
 * 前提：进入时快照必须已经是完整的（先串行跑完 toolaudit 全量体检），
 *   否则一律 exit=2「前提未就绪」，不拿残快照冒充基线做对照。
 * 所有被改文件先备份，finally 逐字节 + 时间戳还原。
 * 退出码：0=全部符合预期 / 1=有漏网或误杀 / 2=前提未就绪
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const SNAP = path.join(__dirname, '_toolaudit_last.json');
const BASE = path.join(__dirname, '_toolaudit_base.json');
const GUARD = path.join(ROOT, 'tools', 'themeguard.cjs');
const DP = require('./dashparse.cjs');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

function snapOf(p) {
  if (!fs.existsSync(p)) return null;
  const st = fs.statSync(p);
  return { buf: fs.readFileSync(p), mtimeMs: st.mtimeMs, atimeMs: st.atimeMs };
}
function restore(p, s) {
  if (!s) { try { fs.rmSync(p, { force: true }); } catch (e) {} return; }
  fs.writeFileSync(p, s.buf);
  try { fs.utimesSync(p, new Date(s.atimeMs), new Date(s.mtimeMs)); } catch (e) {}
}
function run(args, ms) {
  const r = cp.spawnSync('node', [path.join(ROOT, 'tools', args[0])].concat(args.slice(1)),
    { cwd: ROOT, encoding: 'utf8', timeout: ms || 120000 });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}
function readSnap() { try { return JSON.parse(fs.readFileSync(SNAP, 'utf8')); } catch (e) { return null; } }

const backup = { snap: snapOf(SNAP), base: snapOf(BASE), guard: snapOf(GUARD) };
let pass = 0, fail = 0;
const ck = (n, ok, d) => { console.log((ok ? '  √ ' : '  x ') + n + (d ? '  ' + d : '')); ok ? pass++ : fail++; };

const startSnap = readSnap();
if (!backup.snap || !startSnap || startSnap.complete !== true || (startSnap.total || 0) < 34) {
  console.error('前提未就绪：_toolaudit_last.json 不是完整快照（complete=true / total>=34）。');
  console.error('请先单独串行跑完 `node tools/toolaudit.cjs` 再执行本验证，不拿残快照做对照。');
  process.exit(2);
}

try {
  console.log('=== 体检快照保护 · 变异验证 ===');
  console.log('前提：完整快照 total=' + startSnap.total + ' complete=' + startSnap.complete);

  /* M1 对照组：不带 --no-save 确实会把完整快照冲成残快照（证明注入有效） */
  const r1 = run(['toolaudit.cjs', 'themeguard.cjs'], 120000);
  const j1 = readSnap();
  ck('M1 不带保护会踩坏快照（对照组）', j1 && j1.complete === false && (j1.total || 0) < 34,
    'exit=' + r1.code + ' total=' + (j1 && j1.total));
  restore(SNAP, backup.snap);

  /* M2 带 --no-save：出报告但快照分毫不动 */
  const r2 = run(['toolaudit.cjs', 'themeguard.cjs', '--no-save'], 120000);
  const same2 = md5(fs.readFileSync(SNAP)) === md5(backup.snap.buf);
  ck('M2 --no-save 保护快照', same2 && /no-save/.test(r2.out),
    'exit=' + r2.code + ' 快照' + (same2 ? '未变' : '被改'));
  ck('M2b --no-save 仍出体检报告', /共 \d+ 个工具/.test(r2.out));

  /* M3 真实跑一次 M9：mtime 会被刷新（环境不允许回退），但新判据仍判新鲜 */
  const mBefore = Math.round(fs.statSync(GUARD).mtimeMs);
  const r3 = run(['mistmut.cjs', '--only=M9'], 240000);
  const mAfter = Math.round(fs.statSync(GUARD).mtimeMs);
  const j3 = readSnap();
  const names = (fs.readFileSync(path.join(ROOT, 'tools', 'toolaudit.cjs'), 'utf8')
    .match(/const GUARDS = \[([\s\S]*?)\]/)[1].replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '').match(/'([A-Za-z0-9_.-]+)'/g) || []).map(s => s.replace(/'/g, ''));
  const freshNow = DP.taFresh(j3, names, fs.statSync(SNAP).mtimeMs, Date.now());
  ck('M3 M9 变异用例本身仍捕获', r3.code === 0 && /捕获 1\/1/.test(r3.out), 'exit=' + r3.code);
  ck('M3b 如实记录 mtime 被刷新（不假装能回退）', mAfter >= mBefore,
    'before=' + mBefore + ' after=' + mAfter);
  ck('M3c mtime 刷新后新时效证仍判新鲜', freshNow === true,
    'taFresh=' + freshNow + ' names=' + names.length);

  /* M4 M9 跑完快照仍完整（不再被单工具体检冲成残快照） */
  ck('M4 M9 跑完快照仍完整', j3 && j3.complete === true && (j3.total || 0) >= 34,
    'complete=' + (j3 && j3.complete) + ' total=' + (j3 && j3.total));

  /* M5 新判据拒绝类仍抓得住 */
  const NOW = Date.now();
  const rows = names.map(n => ({ name: n, pass: 10, fail: 0 }));
  ck('M5a 过期快照拒绝', DP.taFresh({ at: 'x', rows }, names, NOW - 31 * 60 * 1000, NOW) === false);
  ck('M5b 名字缺失拒绝', DP.taFresh({ at: 'x', rows: rows.slice(0, 5) }, names, NOW - 1000, NOW) === false);
  ck('M5c 残快照拒绝', DP.taFresh({ at: 'x', rows: [{ name: names[0], pass: 0, fail: 0 }] }, names, NOW - 1000, NOW) === false);

  /* M6 接线证：四处改动必须真实存在，防止「写了模块没接线」 */
  const ta = fs.readFileSync(path.join(ROOT, 'tools', 'toolaudit.cjs'), 'utf8');
  const mm = fs.readFileSync(path.join(ROOT, 'tools', 'mistmut.cjs'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'tools', 'dash.cjs'), 'utf8');
  const sync = fs.readFileSync(path.join(ROOT, 'tools', 'synccheck.py'), 'utf8');
  const wired = /const noSave = args\.includes\('--no-save'\)/.test(ta)
    && /if \(noSave\)/.test(ta)
    && /args: \['themeguard\.cjs', '--no-save'\]/.test(mm)
    && /args: \['--no-save'\]/.test(mm)
    && /if '--no-save' in sys\.argv/.test(sync)
    && /\[no-save\]/.test(sync)
    && /DP\.taFresh\(/.test(dash)
    && typeof DP.taFresh === 'function';
  ck('M6 六处接线证', wired);
} catch (e) {
  console.log('  x 用例异常: ' + e.message);
  fail++;
} finally {
  restore(SNAP, backup.snap);
  restore(BASE, backup.base);
  restore(GUARD, backup.guard);
}

console.log('\nRESULT: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
