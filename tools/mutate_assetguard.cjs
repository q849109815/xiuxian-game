#!/usr/bin/env node
/* ============================================================================
 * mutate_assetguard.cjs —— assetguard「F 文件存在证」变异验证
 * ----------------------------------------------------------------------------
 * 要证明的不是「守卫平时是绿的」，而是：把 V1.3.79 那次真实污染塞回去，
 * 它必须报红、点名文件、并拒绝让 --rebase 把污染写进基线。
 * 抓不住缺陷的断言等于不存在。
 *
 * M0 干净基线必须绿
 * M1 注入 star_X.jpg（磁盘不存在）→ 必须 FAIL 且点名「引用文件不存在」
 * M2 带 --rebase 也不能把污染写进基线
 * M3 还原后 md5 与原文逐字节一致
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'js/config.js');
const REF = path.join(__dirname, '_asset_refs.json');
const GUARD = path.join(__dirname, 'assetguard.cjs');
const CLEAN = "'assets/icon/star.jpg?v=20270105a'";
const BAD = "'assets/icon/star_X.jpg?v=20270105a'";
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const run = (extra = []) => spawnSync('node', [GUARD, ...extra], { cwd: ROOT, encoding: 'utf8' });

const origCfg = fs.readFileSync(CFG);
const origRef = fs.existsSync(REF) ? fs.readFileSync(REF) : null;
let ok = 0, fail = 0;
const good = (m) => { ok++; console.log('  √ ' + m); };
const bad = (m) => { fail++; console.log('  x ' + m); };

try {
  /* M0 干净基线 */
  let r = run();
  r.status === 0 && /PASS 240 \/ FAIL 0/.test(r.stdout || '') ? good('M0 干净基线 PASS 240/FAIL 0')
    : bad('M0 基线异常 exit=' + r.status + ' ' + String(r.stdout || '').slice(-200));

  /* 注入真实事故形态 */
  const src = origCfg.toString('utf8');
  if (!src.includes(CLEAN)) throw new Error('干净锚点不存在，无法注入');
  fs.writeFileSync(CFG, Buffer.from(src.replace(CLEAN, BAD)));

  /* M1 必须报红并点名 */
  r = run();
  const out = (r.stdout || '') + (r.stderr || '');
  (r.status !== 0 && /引用文件不存在/.test(out) && /star_X\.jpg/.test(out) && /变异特征/.test(out))
    ? good('M1 注入假引用 → 报红 + 点名文件 + 命中变异特征')
    : bad('M1 未捕获 exit=' + r.status + ' :: ' + out.slice(-400));

  /* M2 --rebase 不得把污染写进基线 */
  r = run(['--rebase']);
  const out2 = (r.stdout || '') + (r.stderr || '');
  (r.status !== 0 && /--rebase 拒绝执行/.test(out2))
    ? good('M2 --rebase 拒绝把不存在的引用写进基线')
    : bad('M2 rebase 未拦住 exit=' + r.status + ' :: ' + out2.slice(-300));
} catch (e) {
  bad('脚本异常：' + e.message);
} finally {
  /* 还原：同步执行，绝不留下半截注入态 */
  fs.writeFileSync(CFG, origCfg);
  if (origRef !== null) fs.writeFileSync(REF, origRef);
  else if (fs.existsSync(REF)) fs.unlinkSync(REF);
  const same = md5(fs.readFileSync(CFG)) === md5(origCfg);
  same ? good('M3 还原后 config.js md5 逐字节一致') : bad('M3 还原失败');
  const r3 = run();
  r3.status === 0 ? good('M3 还原后守卫回到绿') : bad('M3 还原后仍红 exit=' + r3.status);
}

console.log('\nRESULT: PASS=' + ok + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
