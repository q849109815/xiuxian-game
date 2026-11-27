#!/usr/bin/env node
/* 【mutate_btlayout.cjs】立规原因：本工具为常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码语义：0=全部通过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
/**
 * btlayout 变异验证 —— 证明守卫抓得住真缺陷，且不会把真缺陷洗成「前提未就绪」
 *
 * 铁律：抓不住缺陷的断言等于不存在。
 * V1.3.75 补充立规：本轮把 B5/B7 的「量不到盒子」归为 PREREQ 后，
 * 必须证明【真越界仍然 FAIL（exit=1）】，绝不能靠前提归类把缺陷吞掉。
 *
 * 用例：
 *   M1/M2 B8 震屏 save/restore 不配对（历史 P0 事故本源）
 *   M3    B7 防线落在可视区外（真缺陷，不得被判 PREREQ）
 *   M4    B5 技能栏塞满真溢出（真缺陷，不得被判 PREREQ）
 *
 * 判据：输出必须【点名对应断言 + FAIL>=1 + PREREQ=0 + exit=1】。
 *   崩溃或「前提未就绪 exit=2」一律不算捕获。
 * 防污染：备份只放内存，每组 finally 还原并 md5 逐字节校验。
 * 用法：node tools/mutate_btlayout.cjs
 * 退出码：0 全部捕获且无残留 / 1 有未捕获或还原不一致
 */
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const P = (f) => path.join(ROOT, f);

const M = [
  {
    n: 'M1 注入 save/restore 不配对（事故本源）', f: 'js/battle.js', want: /X B8/,
    mut: (s) => s.replace('if (_shk || _jsh) c.restore();', 'if (_shk) c.restore();'),
  },
  {
    n: 'M2 注入 完全不 restore', f: 'js/battle.js', want: /X B8/,
    mut: (s) => s.replace('if (_shk || _jsh) c.restore();', '/* no restore */'),
  },
  {
    n: 'M3 注入 B7 防线出屏（真缺陷不得洗成 PREREQ）', f: 'js/battle.js', want: /X B7/,
    mut: (s) => s.replace('this.wallY = this.H - 96;', 'this.wallY = this.H + 400;'),
  },
  {
    /* 第一版改 638 行 .bt-skills .bs{width:40px} 守卫仍报绿 —— 不是守卫失效：
     * css/style.css 里同名选择器有 4 处定义（540/638/791 等），后面的规则覆盖了我改的那处。
     * 变异改错位置是本项目复发项，改用 id + !important 追加到末尾才真正制造溢出。 */
    n: 'M4 注入 B5 技能栏真溢出（真缺陷不得洗成 PREREQ）', f: 'css/style.css', want: /X B5/,
    mut: (s) => s + '\n/*MUT*/ #btSkills .bs{width:300px !important;flex:0 0 300px !important}\n',
  },
  {
    /* V1.3.96 收口：B6 扫描口径收窄（排除战斗态下的 #home 后代）后，
     * 必须证明【战斗 HUD 真越界仍会被 B6 点名报红】，
     * 否则「修误报」就变成了「放宽守卫」，正是本项目反复踩的坑。 */
    n: 'M5 注入 B6 战斗顶栏真越界（口径收窄后仍抓得住）', f: 'css/style.css', want: /X B6/,
    mut: (s) => s + '\n/*MUT*/ #battle .bt-topbar{position:relative;left:-120px !important}\n',
  },
];

/* ------------------------------------------------------------------
 * 【启动前残留清理】V1.3.97 收口 · 真实事故
 * 本脚本曾被 `timeout 170` 强杀在 M5 执行期间，finally 没来得及跑，
 *   `/*MUT*\/ #battle .bt-topbar{left:-120px}` 永久留在 css/style.css。
 * 下一轮把这份污染当成 orig：还原校验 md5 照样 PASS（还原成污染的 orig），
 * 于是污染被封进基线 —— btlayout 报 17 项越界、看板「战斗布局未过 15 项」，
 * 而「捕获 5/5」看起来还是全绿。**内存备份挡不住强停。**
 *
 * 修法三条，缺一不可：
 *   ① 每条用例先落盘 .bak_btlayout_N，强停也留得下；
 *   ② 启动时先从备份还原，再显式扫 MUT 特征；
 *   ③ 仍不干净就 exit=2「前提未就绪」，绝不拿污染版本当基线。
 * 与 mistmut.cjs 的 startup cleanup 同类，但那份只剥 MUT-BOOM 前缀，
 * 这里额外保留逐字节备份，避免「剥掉的内容其实是被改过的真代码」。
 * ---------------------------------------------------------------- */
const MUT_MARK = /\/\*MUT\*\//;
const TARGETS = [...new Set(M.map((c) => c.f))];
let cleaned = 0, blocked = false;
M.forEach((c, i) => {
  const fp = P(c.f), bak = fp + '.bak_btlayout_' + (i + 1);
  if (fs.existsSync(bak)) {
    try { fs.copyFileSync(bak, fp); fs.unlinkSync(bak); cleaned++; }
    catch (e) { console.log('  ! 备份还原失败 ' + bak + ' :: ' + e.message); blocked = true; }
  }
});
for (const f of TARGETS) {
  if (MUT_MARK.test(fs.readFileSync(P(f), 'utf8'))) {
    blocked = true; console.log('  x 前提未就绪：' + f + ' 仍有 MUT 残留（上次强停未还原）');
  }
}
if (cleaned) console.log('[cleanup] 从落盘备份还原 ' + cleaned + ' 个文件');
if (blocked) { console.log('[中止] 请先手动还原干净版本，禁止拿污染版本当基线'); process.exit(2); }
/* 自检模式：只跑 cleanup + 前提检查，供 mutate_btcleanup.cjs 做变异证伪，
 * 不必每次都等 5 组浏览器跑批（全套约 5 分钟）。 */
if (process.argv.includes('--check-clean')) {
  console.log('[check-clean] 洁净'); process.exit(0);
}

let captured = 0, dirty = 0;
M.forEach((c, ci) => {
  const fp = P(c.f), bak = fp + '.bak_btlayout_' + (ci + 1);
  const orig = fs.readFileSync(fp, 'utf8');
  const h0 = md5(orig);
  fs.writeFileSync(bak, orig);   /* ① 强停也留得下 */
  const bad = c.mut(orig);
  if (!bad || bad === orig) {
    console.log('  × ' + c.n + ' :: 变异锚点未命中'); dirty++;
    try { fs.unlinkSync(bak); } catch (e) {}
    return;
  }
  let verdict = '未捕获';
  try {
    fs.writeFileSync(fp, bad);
    const r = cp.spawnSync('node', ['tools/btlayout.cjs', '360x640'],
      { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    const out = String(r.stdout || '') + String(r.stderr || '');
    const named = c.want.test(out);
    const realFail = /FAIL [1-9]/.test(out) && /PREREQ 0/.test(out) && r.status === 1;
    if (named && realFail) { captured++; verdict = '捕获✓（点名断言 + FAIL + exit=1）'; }
    else if (named && !realFail) verdict = '点名了但被判前提/未报红 ✗';
    else if (realFail) verdict = '报红但未点名目标断言 ✗';
    else verdict = '守卫仍报绿 ✗';
  } catch (e) {
    verdict = '执行异常：' + e.message;
  } finally {
    /* 从落盘备份还原而不是只信内存 orig：注入中途若被强杀，orig 在下一轮
     * 可能是污染版本，但 .bak 是这一轮真正开始前的干净快照。 */
    if (fs.existsSync(bak)) { try { fs.copyFileSync(bak, fp); } catch (e) {} }
    else fs.writeFileSync(fp, orig);
    try { fs.unlinkSync(bak); } catch (e) {}
    if (md5(fs.readFileSync(fp, 'utf8')) !== h0 ||
        MUT_MARK.test(fs.readFileSync(fp, 'utf8'))) {
      dirty++; console.log('  × ' + c.n + ' 还原不一致或仍有 MUT 残留');
    }
  }
  console.log('  ' + (verdict.startsWith('捕获') ? '√' : '×') + ' ' + c.n + ' → ' + verdict);
});

/* 基线前提：跑之前再确认目标文件干净。上一轮事故里「还原校验 PASS」
 * 是拿污染的 orig 比出来的，基线照样 FAIL —— 这里把洁净检查前置，
 * 让失败原因一眼可见，不再让人去猜是布局坏了还是文件没还原。 */
const residue = TARGETS.filter((f) => {
  if (MUT_MARK.test(fs.readFileSync(P(f), 'utf8'))) return true;
  const d = path.dirname(P(f)), bn = path.basename(P(f));
  return fs.readdirSync(d).some((n) => n.startsWith(bn + '.bak_btlayout_'));
});
if (residue.length) console.log('  x 基线前提未就绪，残留：' + residue.join(', '));

const base = cp.spawnSync('node', ['tools/btlayout.cjs', '360x640'],
  { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
const baseOut = String(base.stdout || '');
const baseOk = !residue.length && base.status === 0 && /FAIL 0/.test(baseOut);
console.log('\n[mutate_btlayout] 本轮验证 ' + M.length + ' 条，捕获 ' + captured + '/' + M.length +
  '；还原校验 ' + (dirty ? 'FAIL ' + dirty : 'PASS') + '；基线 ' + (baseOk ? 'PASS' : 'FAIL'));
process.exit(captured === M.length && dirty === 0 && baseOk ? 0 : 1);
