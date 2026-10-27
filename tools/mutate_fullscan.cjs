#!/usr/bin/env node
/* ============================================================================
 * tools/mutate_fullscan.cjs —— fullscan.cjs 的变异测试
 * ----------------------------------------------------------------------------
 * 铁律：抓不住缺陷的断言等于不存在。fullscan 报 PASS=4 必须先自证。
 *
 * 真实场景复刻：本轮 js/ui.js:2038 就躺着 `if (window.__MUT) return;`
 * （变异脚本被强杀没还原，mutsentinel 因只查 mutguard 31 条锚点而漏掉）。
 * 所以变异1 完全按那个真事故的形状注入，证明 D4 挡得住。
 *
 * 步骤：备份 → 注入 → 断言 FAIL 且点名该开关 → 还原 → 断言字节一致 + PASS
 * 任一步不成立 → fullscan 不可信，退出码非 0。
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const UI = path.join(ROOT, 'js', 'ui.js');
const BAK = path.join(ROOT, '_scan', 'ui.js.bak_mutfs');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function run(extra) {
  try {
    const out = execFileSync('node', [path.join(ROOT, 'tools', 'fullscan.cjs')]
      .concat(extra || []), { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status,
             out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

const before = sha(UI);
fs.copyFileSync(UI, BAK);
let okAll = true;
const say = (b, m) => { console.log((b ? 'ok  ' : 'X   ') + m); if (!b) okAll = false; };

try {
  /* ---- 变异1：注入未登记开关（复刻本轮真事故形状） ---- */
  let src = fs.readFileSync(UI, 'utf8');
  const ANCHOR = "  b_chip(p, tab) {\n    const ce = $('#chipEquip');\n    if (ce) ce.onclick = () => {";
  if (!src.includes(ANCHOR)) { console.log('X 锚点未找到，无法注入'); process.exit(2); }
  src = src.replace(ANCHOR, ANCHOR + ' if (window.__MUTFS) return;');
  fs.writeFileSync(UI, src);
  const r1 = run();
  const caught = r1.code !== 0 && /__MUTFS/.test(r1.out) && /D4/.test(r1.out);
  say(caught, '变异1 注入 window.__MUTFS → fullscan ' +
    (caught ? '报 FAIL 并点名该开关（抓到）' : '【没抓到，D4 不可信】\n' + r1.out.slice(-600)));
  if (!caught) { console.log(r1.out.slice(-800)); }

  /* ---- 变异2：还原后字节必须一致 ---- */
  fs.copyFileSync(BAK, UI);
  const same = sha(UI) === before;
  say(same, '变异2 还原后 js/ui.js ' + (same ? '字节一致' : '不一致！'));

  /* ---- 变异3：还原后必须回到 PASS ---- */
  const r2 = run();
  const clean = r2.code === 0 && /FAIL=0/.test(r2.out);
  say(clean, '变异3 还原后 fullscan ' + (clean ? 'FAIL=0' : '仍失败'));

  /* ---- 变异4：D5 线上内容证（自证模式，绝不上生产） ----
   * 本轮真事故：本地 ui.js 干净，线上 main 分支却仍带着 __MUT，
   * 而所有扫描都只扫本地。D5 是唯一能发现「污染已进生产」的一证。
   * 网络版无法安全变异（要证它抓得住就得真传污染上生产），
   * 故用 --selftest 喂本地模拟样本，判据与网络版完全一致。 */
  const SIMD = path.join(ROOT, '_scan', 'online_sim');
  fs.mkdirSync(SIMD, { recursive: true });
  const SIM = path.join(SIMD, 'js__ui.js');
  const hadSim = fs.existsSync(SIM);
  const simBak = SIM + '.bak';
  if (hadSim) fs.copyFileSync(SIM, simBak);
  fs.copyFileSync(UI, SIM);
  fs.writeFileSync(path.join(ROOT, '_scan', 'diff.txt'), 'js/ui.js\n');
  let sim = fs.readFileSync(SIM, 'utf8');
  sim = sim.replace(ANCHOR, ANCHOR + ' if (window.__MUTFS) return;');
  fs.writeFileSync(SIM, sim);
  const r3 = run(['--selftest']);
  /* 注意：fullscan 打的是【匹配到的特征串】本身，__MUTFS 会命中特征表里的
   * '__MUT'（前缀匹配），所以输出里是 "__MUT" 而不是 "__MUTFS"。
   * 第一版断言写死 __MUTFS，导致 D5 明明抓到了却被判『没抓到』
   * —— 是断言写错，不是守卫失效。判据改为：D5 必须点名该文件且判含特征。 */
  const c5 = r3.code !== 0 && /D5 线上 js\/ui\.js 含注入特征/.test(r3.out);
  say(c5, '变异4 线上样本带 __MUTFS → D5 ' +
    (c5 ? '报 FAIL 并点名（抓到）' : '【没抓到，D5 不可信】\n' + r3.out.slice(-600)));
  if (hadSim) fs.copyFileSync(simBak, SIM); else { fs.copyFileSync(UI, SIM); }
  if (fs.existsSync(simBak)) fs.unlinkSync(simBak);

  /* ---- 变异5：D6 备份源洁净证 ----
   * 本轮真缺口：根目录 8 个 .bak_* 备份在污染状态下拍的，带 __MUT，
   * 而 D1 的 SKIP_PAT 把 .bak_ 开头整个跳过，从没被扫过。
   * 危害：拿它当恢复源会把污染「恢复」回源码，工具还会说无需恢复。 */
  const BAKP = path.join(ROOT, '.bak_mutfs_probe.js');
  fs.copyFileSync(UI, BAKP);
  let bs = fs.readFileSync(BAKP, 'utf8');
  bs = bs.replace(ANCHOR, ANCHOR + ' if (window.__MUTFS) return;');
  fs.writeFileSync(BAKP, bs);
  const r4 = run(['--selftest']);
  const c6 = r4.code !== 0 && /D6/.test(r4.out) && /mutfs_probe/.test(r4.out);
  say(c6, '变异5 备份源带 __MUTFS → D6 ' +
    (c6 ? '报 FAIL 并点名（抓到）' : '【没抓到，D6 不可信】\n' + r4.out.slice(-600)));
  fs.unlinkSync(BAKP);

  /* ---- 变异6：全部还原后必须回到 PASS ---- */
  const r5 = run(['--selftest']);
  const back = r5.code === 0 && /FAIL=0/.test(r5.out);
  say(back, '变异6 全部还原后 fullscan ' + (back ? 'FAIL=0' : '仍失败'));
} finally {
  if (fs.existsSync(BAK)) {
    try { fs.copyFileSync(BAK, UI); fs.unlinkSync(BAK); } catch (e) {}
  }
}
console.log('\n' + (okAll ? 'RESULT: 变异验证全部通过（D4 可信）' : 'RESULT: 变异验证失败'));
process.exit(okAll ? 0 : 1);
