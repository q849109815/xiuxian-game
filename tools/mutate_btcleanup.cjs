#!/usr/bin/env node
/* =========================================================
 * mutate_btcleanup.cjs —— 强停残留清理的变异证伪（V1.3.97 收口）
 *
 * 立规原因（真实事故）：mutate_btlayout.cjs 被 timeout 强杀在 M5 期间，
 *   `/*MUT*\/ #battle .bt-topbar{left:-120px}` 留在 css/style.css；
 * 下一轮把污染当 orig，md5 还原校验照样 PASS，btlayout 报 17 项越界、
 * 看板「战斗布局未过 15 项」，而「捕获 5/5」看起来还是全绿。
 * 修法是落盘备份 + 启动清理 + 前提断言。**没被证伪过的清理等于没有清理。**
 *
 * 用例：
 *   M1 强停残留 + 落盘备份   -> --check-clean 必须从备份还原、exit=0
 *   M2 强停残留但无备份      -> 必须显式 exit=2，且不擅自剥离文件
 *   M3 本来干净              -> 不得误报、exit=0
 *   M4 接线证                -> 主脚本真的有落盘备份 / 启动清理 / 前提断言
 *
 * 前提：进入时 css/style.css 必须干净（无 MUT、无 .bak_btlayout_*），
 * 否则 exit=2 拒绝跑，不拿污染基线做对照。
 * 退出码：0=全部符合预期 / 1=漏网或还原异常 / 2=前提未就绪
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const F = 'css/style.css', FP = path.join(ROOT, F);
const BAK = FP + '.bak_btlayout_5';
const MUT = '\n/*MUT*/ #battle .bt-topbar{position:relative;left:-120px !important}\n';
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const clean = () => {
  const s = fs.readFileSync(FP, 'utf8');
  if (s.includes('/*MUT*/')) return false;
  const d = path.dirname(FP), bn = path.basename(FP);
  if (fs.readdirSync(d).some(n => n.startsWith(bn + '.bak_btlayout_'))) return false;
  return true;
};

if (!clean()) { console.error('前提未就绪：css/style.css 不干净，请先还原再跑本验证'); process.exit(2); }
const orig = fs.readFileSync(FP);
const h0 = md5(orig);
let pass = 0, fail = 0;
const ck = (n, ok, d) => { console.log((ok ? '  √ ' : '  x ') + n + (d ? '  ' + d : '')); ok ? pass++ : fail++; };
const run = () => {
  const r = cp.spawnSync('node', ['tools/mutate_btlayout.cjs', '--check-clean'],
    { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
};
const reset = () => { fs.writeFileSync(FP, orig); try { fs.rmSync(BAK, { force: true }); } catch (e) {} };

try {
  console.log('=== 强停残留清理 · 变异证伪 ===');

  /* M1：模拟「强停在 M5、落盘备份还在」 */
  fs.writeFileSync(BAK, orig);
  fs.writeFileSync(FP, orig.toString() + MUT);
  const r1 = run();
  ck('M1 强停残留能从落盘备份还原', r1.code === 0 && clean() &&
    md5(fs.readFileSync(FP)) === h0 && /从落盘备份还原/.test(r1.out),
    'exit=' + r1.code + ' 洁净=' + clean());
  reset();

  /* M2：污染但无备份 —— 必须显式判前提未就绪，且不许擅改文件 */
  fs.writeFileSync(FP, orig.toString() + MUT);
  const r2 = run();
  const stillMut = fs.readFileSync(FP, 'utf8').includes('/*MUT*/');
  ck('M2 无备份残留必须显式 exit=2', r2.code === 2 && /前提未就绪/.test(r2.out),
    'exit=' + r2.code);
  ck('M2b 不得擅自剥离污染文件（交人工确认）', stillMut);
  reset();

  /* M3：本来干净，不误报 */
  const r3 = run();
  ck('M3 干净状态不误报', r3.code === 0 && clean() && md5(fs.readFileSync(FP)) === h0,
    'exit=' + r3.code);

  /* M4：接线证，防止「写了模块没接上」 */
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'mutate_btlayout.cjs'), 'utf8');
  ck('M4 四处接线证',
    /fs\.writeFileSync\(bak, orig\)/.test(src) &&
    /fs\.copyFileSync\(bak, fp\)/.test(src) &&
    /process\.exit\(2\)/.test(src) &&
    /--check-clean/.test(src));
} catch (e) {
  console.log('  x 用例异常: ' + e.message); fail++;
} finally { reset(); }

const ok = clean() && md5(fs.readFileSync(FP)) === h0;
console.log('\nRESULT: PASS=' + pass + ' FAIL=' + fail + '  最终还原=' + (ok ? 'PASS' : 'FAIL'));
process.exit(fail || !ok ? 1 : 0);
