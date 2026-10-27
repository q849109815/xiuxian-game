#!/usr/bin/env node
/* ==========================================================================
 * 【版本发布工具】tools/ver.cjs
 *
 * 用法：
 *   node tools/ver.cjs              # 显示当前版本与规范说明
 *   node tools/ver.cjs patch        # 修 BUG / 小幅优化  1.2.0 -> 1.2.1
 *   node tools/ver.cjs minor        # 新增玩法/系统/内容 1.2.x -> 1.3.0
 *   node tools/ver.cjs major        # 大版本（题材/架构级）1.x.x -> 2.0.0
 *   node tools/ver.cjs patch "说明" # 带变更说明，自动写进 CHANGELOG
 *
 * 一条命令完成 5 件事（历史上全靠手改，导致版本号分叉）：
 *   1. index.html  全部 ?v= 戳
 *   2. admin/index.html 全部 ?v= 戳
 *   3. config.js  HOT_UPDATE.version
 *   4. config.js  HOT_UPDATE.manifest 每一项的 ver
 *   5. CHANGELOG.md 追加记录
 *
 * 版本号语义（MAJOR.MINOR.PATCH）：
 *   PATCH 第三位 —— 修 BUG、小幅体验优化。可累加超过 9（1.2.1 ... 1.2.11）
 *   MINOR 第二位 —— 新玩法 / 新系统 / 大体量内容
 *   MAJOR 第一位 —— 题材或架构级变更
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

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
    /* 【制作人铁律】每次发布必定在版本号末尾追加一位 1。
       目的：版本号字符串必定变化 -> 所有 ?v= 缓存戳必定变化 -> 玩家必定拿到新文件。
       历史教训：复用版本号或改动不升版，玩家缓存拿到旧/被污染的文件，被投诉。 */
    return String(v) + '1';
  }
  if (kind === 'major') { p[0]++; p[1] = 0; p[2] = 0; }
  else if (kind === 'minor') { p[1]++; p[2] = 0; }
  else p[2]++;                    /* patch：第三位可超过 9，按制作人要求 */
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
  const kn = { patch: '修 BUG / 小幅优化', minor: '新玩法 / 新系统 / 大内容', major: '大版本', bump1: '修 BUG / 小幅优化（版本号末尾+1，强制冲刷缓存）' }[kind];
  const head = `\n## V${to}（${kn}） · ${ds}\n`;
  const body = (note && note.trim()) ? note.trim().split('\n').map(x => (x.startsWith('-') ? x : '- ' + x)).join('\n') + '\n'
    : '- （待补充）\n';
  const old = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : '# 更新日志\n';
  fs.writeFileSync(CHANGELOG, old + head + body);
}

const kind = (process.argv[2] || '').toLowerCase();
const note = process.argv.slice(3).join(' ');
const cur = readVer();

if (!['patch', 'minor', 'major', 'bump1'].includes(kind)) {
  console.log('=== 当前版本 V' + cur + ' ===');
  console.log('用法： node tools/ver.cjs  patch|minor|major|bump1  "变更说明"');
  console.log('  bump1 —— 【默认发布方式】版本号末尾追加一位 1（1.3.72 -> 1.3.721）');
  console.log('           铁律：任何一次发布都必须让版本号字符串变化，否则玩家缓存不刷新');
  console.log('  patch 第三位 —— 修 BUG / 小幅优化（1.2.1 ... 1.2.11 可累加）');
  console.log('  minor 第二位 —— 新玩法 / 新系统 / 大体量内容');
  console.log('  major 第一位 —— 题材或架构级变更');
  process.exit(0);
}

const next = bump(cur, kind);
assertInc(cur, next);
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
