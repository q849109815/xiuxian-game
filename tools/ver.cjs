#!/usr/bin/env node
/* ==========================================================================
 * 【版本发布工具】tools/ver.cjs
 *
 * 用法：
 *   node tools/ver.cjs              # 显示当前版本与规范说明
 *   node tools/ver.cjs patch        # 修 BUG / 小幅优化  1.3.72 -> 1.3.73
 *   node tools/ver.cjs minor        # 新增玩法/系统/内容 1.3.x -> 1.4.0
 *   node tools/ver.cjs major        # 大版本（题材/架构级）1.x.x -> 2.0.0
 *   node tools/ver.cjs patch "说明" # 带变更说明，自动写进 CHANGELOG
 *   node tools/ver.cjs reset 1.3.73 # 基线重设（仅用于把已膨胀的畸形版本号拉回规范区间）
 *
 * 一条命令完成 5 件事（历史上全靠手改，导致版本号分叉）：
 *   1. index.html  全部 ?v= 戳
 *   2. admin/index.html 全部 ?v= 戳
 *   3. config.js  HOT_UPDATE.version
 *   4. config.js  HOT_UPDATE.manifest 每一项的 ver
 *   5. CHANGELOG.md 追加记录
 *
 * 版本号语义（MAJOR.MINOR.PATCH）：
 *   PATCH 第三位 —— 修 BUG、小幅体验优化。0..99，满 99 进位 MINOR（1.3.99 -> 1.4.0）
 *   MINOR 第二位 —— 新玩法 / 新系统 / 大体量内容
 *   MAJOR 第一位 —— 题材或架构级变更
 *
 * 【V1.3.73 版本规范整改 —— 废弃 bump1】
 *   历史做法：每次发布在版本号末尾追加一位 1（1.3.72 -> 1.3.721 -> 1.3.7211 ...）。
 *   初衷是对的——保证版本号字符串必变，?v= 缓存戳必变，玩家必拿到新文件。
 *   但代价是版本号一路膨胀到 1.3.72111111111111（14 个 1），
 *   而这个字符串玩家在「设置 → 前瞻」里看得见，既不可读也不专业。
 *   整改：PATCH 改为正常十进制 +1（1.3.72 -> 1.3.73）。
 *   字符串同样每次必变，缓存冲刷效果完全等价，版本号保持可读。
 *   reset 命令用于把已膨胀的畸形版本号一次性拉回规范区间。
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

/* PATCH 段上限：超过即进位 MINOR。
 * 背景：旧的「末尾追加 1」做法让版本号膨胀到 1.3.72111111111111（14 个 1），
 * 玩家可见却完全不可读。这里给出硬上限，配合 releaseguard R6 双重拦截。 */
const MAX_PATCH = 99;

/* 畸形版本号判定：PATCH 段超过 MAX_PATCH，即「追加 1」膨胀产物 */
function isMalformed(v) {
  const seg = String(v || '').split('.');
  if (seg.length !== 3) return true;
  const n = Number(seg[2]);
  return !Number.isFinite(n) || n > MAX_PATCH;
}

const ROOT = path.resolve(__dirname, '..');
const VER_FILE = path.join(ROOT, 'tools', '.version.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

/* 需要同步版本戳的文件：只同步真正控制缓存的地方，不动历史备份与临时脚本 */
const TARGETS = [
  { f: 'index.html', pat: /\?v=[\w.\-]+/g },
  { f: 'admin/index.html', pat: /\?v=[\w.\-]+/g },
];

function readVer() {
  if (!fs.existsSync(VER_FILE)) return '1.2.0';
  try { return JSON.parse(fs.readFileSync(VER_FILE, 'utf8')).v; }
  catch (e) { return '1.2.0'; }
}
function writeVer(v) {
  fs.writeFileSync(VER_FILE, JSON.stringify({ v, at: new Date().toISOString() }, null, 2));
}
function bump(v, kind) {
  const p = String(v).split('.').map(Number);
  while (p.length < 3) p.push(0);
  if (kind === 'bump1') {
    /* 【已废弃 V1.3.73】末尾追加 1 会让版本号无限膨胀（1.3.72 -> 1.3.721 -> ... 14 个 1），
       玩家在「设置 → 前瞻」看得见，不可读。改用 patch 十进制 +1，同样保证字符串必变。 */
    console.error('[FAIL] bump1 已废弃（版本号会膨胀成 1.3.72111111111111）。请用 patch 代替。');
    process.exit(2);
  }
  if (kind === 'major') { p[0]++; p[1] = 0; p[2] = 0; }
  else if (kind === 'minor') { p[1]++; p[2] = 0; }
  else {
    p[2]++;
    /* PATCH 上限 99：满 99 进位 MINOR，杜绝再次膨胀成超长串 */
    if (p[2] > MAX_PATCH) { p[2] = 0; p[1]++; }
  }
  return p.join('.');
}

/* 单调递增校验：新版本必须严格大于旧版本，否则等于没升版 = 缓存不刷 */
function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
/* 规范性校验：新版本号必须落在 MAJOR.MINOR.PATCH(0..99) 规范区间。
 * 防止有人绕过 reset 又写出 1.3.72111111111111 这类畸形串。 */
function assertNorm(v) {
  if (!/^\d+\.\d+\.\d+$/.test(String(v)) || isMalformed(v)) {
    console.error('[FAIL] 版本号不规范：V' + v + '（必须是 MAJOR.MINOR.PATCH，且 PATCH <= ' + MAX_PATCH + '）');
    console.error('       畸形版本号玩家可见却不可读，禁止发布。');
    process.exit(2);
  }
}

function assertInc(cur, next) {
  if (cmpVer(next, cur) <= 0) {
    console.error('[FAIL] 版本号未递增：V' + cur + ' -> V' + next + '（等于/小于当前版本 = 玩家缓存不会刷新，禁止发布）');
    process.exit(2);
  }
}

function syncHtml(v) {
  let n = 0;
  for (const t of TARGETS) {
    const fp = path.join(ROOT, t.f);
    if (!fs.existsSync(fp)) continue;
    let s = fs.readFileSync(fp, 'utf8');
    const before = s;
    s = s.replace(t.pat, '?v=' + v);
    if (s !== before) { fs.writeFileSync(fp, s); n += (before.match(t.pat) || []).length; }
  }
  return n;
}

function syncConfig(v) {
  const fp = path.join(ROOT, 'js', 'config.js');
  let s = fs.readFileSync(fp, 'utf8');
  let n = 0;
  /* 主版本号 */
  const s0 = s;
  s = s.replace(/(HOT_UPDATE:\s*\{[\s\S]*?version:\s*')[\w.\-]+(')/, (m, a, b) => { n++; return a + v + b; });
  /* manifest 每一项的 ver */
  s = s.replace(/(ver\s*:\s*')[\w.\-]+(')/g, (m, a, b) => { n++; return a + v + b; });
  if (s !== s0) fs.writeFileSync(fp, s);
  /* 【同步回读校验】—— 事故：bump1 打印「config.js 版本字段同步 14 处」后，
     实测 config.js 里新版本号出现 0 次（version 字段与 13 项 manifest ver 全是旧值），
     结果玩家缓存不刷新、拿到旧文件 —— 而当时没有任何一条报错，
     直到 cacheguard C2/C4 与 releaseguard R2 报红才被发现。
     这里强制回读：同步后新版本号必须真实出现在 config.js 中，
     且 version 字段必须等于新版本，否则直接中止发布。 */
  const chk = fs.readFileSync(fp, 'utf8');
  const hits = (chk.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  const mv = chk.match(/version:\s*'([^']+)'/);
  /* manifest 每一项的 ver 也必须同步 —— 只校验 version 字段是不够的：
     manifest ver 是热更引擎判断「要不要拉新文件」的依据，
     它停在旧值 => 引擎认为玩家已是最新 => 新代码永远下发不下去。 */
  const vers = [...chk.matchAll(/ver\s*:\s*'([^']+)'/g)].map(x => x[1]);
  const badV = vers.filter(x => x !== v);
  const cond = hits === 0 || !mv || mv[1] !== v || vers.length === 0 || badV.length > 0;
  if (cond) {
    if (badV.length > 0) console.error('[FAIL] manifest 有 ' + badV.length + ' 项 ver 未同步（如 ' + badV[0] + '），期望 ' + v);
    console.error('[FAIL] config.js 版本同步回读校验未通过：新版本号出现 ' + hits +
                  ' 次，version 字段=' + (mv ? mv[1] : '未读到') + '，期望 ' + v);
    console.error('       版本不同步 => 玩家缓存不刷新 => 修了等于没修 => 投诉');
    process.exit(2);
  }
  return n;
}

function syncImgV(v) {
  const fp = path.join(ROOT, 'js', 'ui.js');
  if (!fs.existsSync(fp)) return 0;
  let s = fs.readFileSync(fp, 'utf8');
  const s0 = s;
  s = s.replace(/(const\s+IMG_V\s*=\s*')[\w.\-]+(')/, (m, a, b) => a + v + b);
  if (s !== s0) { fs.writeFileSync(fp, s); return 1; }
  return 0;
}

/* 后台动态图标版本戳 AIMG_V。
 *
 * 为什么单列（本轮实测挖出的真洞）：
 *   admin/js/core.js 里 AIMG_V = '20270202a' 是**写死的历史值**，
 *   而全站版本已走到 1.3.7xxxxx。后台 14 个导航入口、头部菜单、以及各页面里
 *   由 emojify 动态生成的 <img class="ai">，全部走这个常量拼 ?v=。
 *   后果：图标换了以后，运营的浏览器命中 20270202a 那份旧缓存，
 *   **清缓存也刷不掉**——因为 URL 从来没变过。
 *   这与前端 ui.js 的 IMG_V 是同一类洞（V1.3.71 修过前端那次），
 *   但当时只补了 IMG_V，漏了后台 AIMG_V：
 *   缓存冲刷守卫 C7 只查 index.html 的 ?v=，没查 JS 常量。 */
function syncAImgV(v) {
  const fp = path.join(ROOT, 'admin', 'js', 'core.js');
  if (!fs.existsSync(fp)) return 0;
  let s = fs.readFileSync(fp, 'utf8');
  const s0 = s;
  s = s.replace(/(const\s+AIMG_V\s*=\s*')[\w.\-]+(')/, (m, a, b) => a + v + b);
  if (s !== s0) { fs.writeFileSync(fp, s); return 1; }
  return 0;
}

function changelog(from, to, kind, note) {
  const d = new Date();
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const kn = { patch: '修 BUG / 小幅优化', minor: '新玩法 / 新系统 / 大内容', major: '大版本', bump1: '（已废弃）', reset: '版本规范整改 / 基线重设' }[kind];
  const head = `\n## V${to}（${kn}） · ${ds}\n`;
  const body = (note && note.trim()) ? note.trim().split('\n').map(x => (x.startsWith('-') ? x : '- ' + x)).join('\n') + '\n'
    : '- （待补充）\n';
  const old = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : '# 更新日志\n';
  fs.writeFileSync(CHANGELOG, old + head + body);
}

const kind = (process.argv[2] || '').toLowerCase();
const raw = process.argv[3] || '';
const cur = readVer();

if (!['patch', 'minor', 'major', 'bump1', 'reset'].includes(kind)) {
  console.log('=== 当前版本 V' + cur + ' ===');
  console.log('用法： node tools/ver.cjs  patch|minor|major|reset  "变更说明"');
  console.log('  patch 第三位 —— 【默认】修 BUG / 小幅优化（1.3.72 -> 1.3.73，满 99 进位）');
  console.log('                  铁律：每次发布版本号必须变化，否则玩家缓存不刷新');
  console.log('  minor 第二位 —— 新玩法 / 新系统 / 大体量内容');
  console.log('  major 第一位 —— 题材或架构级变更');
  console.log('  reset <版本号> —— 基线重设，仅允许从畸形版本号（PATCH>99）拉回规范区间');
  console.log('                   例： node tools/ver.cjs reset 1.3.73 "版本号规范整改"');
  process.exit(0);
}

let next;
if (kind === 'reset') {
  /* 基线重设：只允许从「追加 1」膨胀出的畸形版本号拉回规范区间。
   * 硬约束（每一条都是为了防止本命令被滥用成随意回退）：
   *   1. 目标版本号必须规范（PATCH <= 99）
   *   2. 当前版本号必须畸形（否则就是普通的版本回退，禁止）
   *   3. 目标字符串必须不同于当前（保证 ?v= 变化、缓存必刷新）
   */
  const target = String(raw || '').trim();
  assertNorm(target);
  if (!isMalformed(cur)) {
    console.error('[FAIL] 当前版本 V' + cur + ' 已是规范版本号，不允许 reset。');
    console.error('       reset 仅用于修正「末尾追加 1」膨胀出的畸形版本号。');
    console.error('       正常的升版请用 patch / minor / major。');
    process.exit(2);
  }
  if (target === String(cur)) {
    console.error('[FAIL] 目标版本与当前相同（V' + target + '），版本号不变 = 玩家缓存不刷新。');
    process.exit(2);
  }
  next = target;
  console.log('[基线重设] V' + cur + ' -> V' + next + '（畸形版本号拉回规范区间，字符串已变化 = 缓存必刷新）');
} else {
  next = bump(cur, kind);
  assertNorm(next);
  assertInc(cur, next);
}
const note = (kind === 'reset') ? process.argv.slice(4).join(' ') : raw;
const a = syncHtml(next);
const b = syncConfig(next);
const c = syncImgV(next);
const d = syncAImgV(next);
changelog(cur, next, kind, note);
writeVer(next);

console.log(`[递增校验] V${cur} -> V${next} 严格递增 OK（缓存必刷新）`);
console.log(`版本发布： V${cur}  ->  V${next}  (${kind})`);
console.log(`  index.html / admin  ?v= 戳同步 ${a} 处`);
console.log(`  config.js 版本字段同步      ${b} 处`);
console.log(`  ui.js IMG_V 同步            ${c} 处`);
console.log(`  admin core.js AIMG_V 同步   ${d} 处`);
console.log(`  CHANGELOG.md 已追加`);
