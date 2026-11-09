#!/usr/bin/env node
/* 【mutrestore.cjs】立规原因：本工具为常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码语义：0=全部通过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
/**
 * tools/mutrestore.cjs —— 「变异验证工具被信号中断时不会把缺陷留在源码里」守卫
 *
 * 事故（V1.3.78）：mutguard 在注入态收到 SIGTERM，旧 handler 只清锁就 exit，
 * try/finally 没机会执行，tools/push.py 的 c01_jack.jpg 上传条目被删后未还原。
 * 若此时发布，第一张角色立绘线上 404。
 *
 * 本守卫不只查「代码里有没有这段实现」，还真实起一个停在注入态的子进程、
 * 发 SIGTERM，检查文件是否被写回 —— 抓不住问题的断言等于不存在。
 */
const fs = require('fs'), cp = require('child_process'), crypto = require('crypto');
const ROOT = '/data/workspace/zombie';
const SRC = 'tools/mutguard.cjs';
const R = p => fs.readFileSync(ROOT + '/' + p, 'utf8');
const md5f = p => crypto.createHash('md5').update(fs.readFileSync(ROOT + '/' + p)).digest('hex');
let P = 0, F = 0; const bad = [];
function ck(name, cond, detail) {
  if (cond) { P++; console.log('  √ ' + name); }
  else { F++; bad.push(name); console.log('  x ' + name + (detail ? ' — ' + detail : '')); }
}
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('=== 变异中断还原守卫 ===\n— R 静态证：实现必须真在代码里（剥注释后校验） —');
const src = strip(R(SRC));
ck('R1 注入态登记表存在', /let ACTIVE = null/.test(src) && /function emergencyRestore/.test(src));
ck('R2 emergencyRestore 会写回原文', /fs\.writeFileSync\(fp, ACTIVE\.src\)/.test(src));
/* 必须锁定「主退出路径」那一条（带清锁动作）：自证分支也有一个
 * `const rel = () => { emergencyRestore(); }`，只匹配前缀会被它顶包，
 * 导致「删掉主路径还原调用」这条变异逃过检查。 */
ck('R3 主退出路径 rel 调用 emergencyRestore 且清锁',
   /const rel = \(\) => \{ emergencyRestore\(\); try \{ fs\.unlinkSync\(LOCK\)/.test(src));
ck('R4 SIGTERM / SIGINT / exit 三条退出路径都挂 rel',
   (src.match(/process\.on\('(?:SIGTERM|SIGINT|exit)'/g) || []).length >= 3);
ck('R5 注入前登记 ACTIVE', /ACTIVE = \{ file: m\.file, src, before \}/.test(src));
ck('R6 还原成功后清空登记', /if \(restored\) ACTIVE = null/.test(src));
ck('R7 收工污染自动 restoreAll', /try \{ restoreAll\(\); \}/.test(src));
ck('R8 自动恢复过的批次不得判全绿', /const clean =[\s\S]{0,160}!autoFixed/.test(src));
ck('R9 自动恢复计入机读 FAIL', /autoFixed \? 1 : 0/.test(src));
ck('R10 存在信号自证入口', /--selftest-signal/.test(src));
ck('R11 自证不申请全局锁（不与全量变异互斥）',
   /if \(process\.argv\[2\] === '--selftest-signal'\) return;/.test(src));
ck('R12 收工有开工快照全量比对', /md5f\(f\) !== BASE0\[f\]/.test(src));

console.log('\n— E 执行证：真实信号中断 + 卫生检查 —');
const probe = ROOT + '/tools/_restore_probe.txt';
const LOCK = ROOT + '/tools/.mutguard.lock';
const lockBefore = fs.existsSync(LOCK);   /* 全量变异可能正持锁，自证不得干扰它 */
try { fs.unlinkSync(probe); } catch (e) {}
const orig = 'ORIGINAL-BEFORE-INJECT\n';
const child = cp.spawn('node', [SRC, '--selftest-signal'], { cwd: ROOT, stdio: 'ignore' });
const ev = new Promise(res => {
  let done = false;
  const finish = code => {
    if (done) return; done = true;
    let content = null;
    try { content = fs.readFileSync(probe, 'utf8'); } catch (e) {}
    try { fs.unlinkSync(probe); } catch (e) {}
    res({ code, content });
  };
  child.on('exit', finish);
  setTimeout(() => { try { child.kill('SIGTERM'); } catch (e) {} }, 600);
  setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} finish(-9); }, 9000);
});
ev.then(sig => {
  ck('E1 子进程收到 SIGTERM 后退出', sig.code === 143, '实际退出码 ' + sig.code);
  ck('E2 注入态文件被写回原文', sig.content === orig,
     '实际内容 ' + JSON.stringify(sig.content));
  ck('E3 自证不新增也不清除他人持有的锁', fs.existsSync(LOCK) === lockBefore);

  const syn = cp.spawnSync('node', ['--check', SRC], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  ck('E4 mutguard.cjs 语法完好', syn.status === 0, String(syn.stderr || '').slice(0, 120));
  ck('E5 上传清单含 c01_jack 立绘（本轮污染已还原）',
     R('tools/push.py').includes("'assets/char/c01_jack.jpg',"));
  /* E6 不再跑哨兵：全量 mutguard 正处于注入态时，哨兵会读到中间态而报残留，
   * 那是「前提未就绪」，不是本守卫坏了。污染由 mutguard 开工前健康检查负责。 */
  ck('E6 探针文件已清理（不留垃圾产物）', !fs.existsSync(probe));

  console.log('\n==========================================================');
  if (F) { console.log('未过项：' + bad.join('、')); }
  console.log(`RESULT: PASS=${P} FAIL=${F}`);
  console.log(`=== PASS ${P}/${F} ===`);
  process.exit(F ? 1 : 0);
});
