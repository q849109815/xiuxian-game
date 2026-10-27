#!/usr/bin/env node
/* ============================================================================
 * tools/fullscan.cjs —— 污染全量扫描（批次 B/C/D 合并执行）
 * ----------------------------------------------------------------------------
 * 为什么要有这个（本轮真实缺口）：
 *   mutsentinel.cjs 报 PASS=3，但它只覆盖 mutguard.cjs 里登记的 31 条用例。
 *   tools/ 下还有 mutate_vistate.cjs、mutate_dead.cjs 等**独立变异脚本**，
 *   它们的注入串（MUTATION-TEST-INJECT / __mutbtn / __MUT）完全不在哨兵
 *   视野内 —— 一旦强杀导致没还原，哨兵照样报绿。
 *
 *   用户要求「全量查询一个都别拉下」，所以本工具改口径：
 *     D1 特征证 —— 已知注入特征串全量扫（从所有变异脚本收集，不只 mutguard）
 *     D2 备份证 —— .mut/ 与 tools/_mutsnap/ 里的备份 vs 当前文件，
 *                   逐文件差异取证。备份是"变异前长什么样"的独立证据，
 *                   不依赖快照机制的自证。
 *     D3 基准证 —— 与线上 main 分支逐文件比 blob sha（干净的外部基准）
 *   三条互不依赖，任一命中即污染。
 *
 * 用法：
 *   node tools/fullscan.cjs            扫描（有污染 exit 1）
 *   node tools/fullscan.cjs --json     机器可读
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.dirname(__dirname);
let pass = 0, fail = 0;
const bad = [];
const ok = (m) => { pass++; console.log('  √  ' + m); };
const ng = (m) => { fail++; bad.push(m); console.log('  x  ' + m); };
/* 待定性清单：D2/D3 天然存在合法差异（本地改了还没上传），一律判 FAIL 会
 * 让工具永远红、反而没人看。改为登记待定性，不计入失败；确认污染靠 D1/D4。 */
const listed = [];
const info = (m) => { listed.push(m); console.log('  -  ' + m); };

/* ------------------------------------------------------------ 特征串清单 */
/* 来源：mutguard.cjs 的全部 to: 值 + 独立 mutate 脚本的注入常量 + 通用特征 */
const FEATS = [
  /* 通用变异标记 */
  '__mut_', '__MUT', '__mutbtn', '_XXX', 'MUTATION-TEST-INJECT',
  '__mut_missing', 'assets/icon/__mut_missing.png',
  /* 语法破坏类 */
  'const UI = {{{',
  /* 破图路径类 */
  'nonexistent', '__missing', 'no-such-file',
];

/* ------------------------------------------------- D4 测试开关白名单 ---- */
/* 事故复盘（本轮真发生）：js/ui.js:2038 长期躺着一句
 *     if (ce) ce.onclick = () => { if (window.__MUT) return;
 * 这是变异注入残留 —— 变异脚本被强杀没还原，而 mutsentinel 只核对
 * mutguard 登记的那 31 条锚点，这处根本不在清单里，哨兵一直报绿。
 * 玩家侧因 __MUT 恒为 undefined 而无感，所以肉眼也发现不了。
 *
 * 判据：真源码里出现 window.__xxx 形式的开关，必须在白名单内。
 * 白名单只放【业务开关】（有明确生产用途且源码内自洽赋值），
 * 其余一律视为测试注入残留。加新开关必须同时在这里登记并写理由。 */
const SWITCH_WL = new Map([
  ['__zbResetting', '业务：清空存档期间阻断重复保存（main.js/net.js/ui.js 三处自洽）'],
]);

/* 从 mutguard.cjs 追加全部 to: 值（含中文注入） */
const MUT = path.join(ROOT, 'tools', 'mutguard.cjs');
if (fs.existsSync(MUT)) {
  const src = fs.readFileSync(MUT, 'utf8');
  const re = /to:\s*(['"])((?:[^'\"\\]|\\.)*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    let v = m[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t')
                .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    v = v.trim();
    /* 只收"带变异指纹"的 to: 值。
     * 反例：mutguard 有条用例把 CSS 数值改成 `gap:7px`，这类值在真实代码里
     * 本就存在（admin.css:178 就有），当特征扫会误报。
     * 判据：必须含变异指纹（__ / MUT / _XXX / missing / nonexistent），
     * 否则它只是"另一个合法值"，该由 mutsentinel 的锚点证负责，不是特征证。 */
    const fp = /__|MUT|_XXX|missing|nonexistent/i;
    if (v && v.length >= 4 && fp.test(v) && !FEATS.includes(v)) FEATS.push(v);
  }
}

/* ------------------------------------------------------------ 扫描目标 */
/* 只扫"会被上传/会进玩家端"的真源码，跳过备份与截图 */
const SCAN_EXT = new Set(['.js', '.cjs', '.html', '.css', '.json', '.py', '.md']);
const SKIP_DIR = new Set(['.mut', '_mutsnap', '_scan', '_trash', 'node_modules',
                          '__pycache__', '.git', 'lib', 'backups']);
const SKIP_PAT = /^(\.bak_|\.bak|.*\.bak[_a-zA-Z0-9]*$|_)/;

function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name) || SKIP_PAT.test(e.name)) continue;
      walk(p, out);
    } else {
      if (SKIP_PAT.test(e.name)) continue;
      if (!SCAN_EXT.has(path.extname(e.name).toLowerCase())) continue;
      out.push(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------ D1 特征证 */
/* D1 只扫【会进玩家端/后台的交付源码】，不扫 tools/ 与文档。
 * 理由：变异脚本和探测器自身必须持有特征串（那是它们要注入/要抓的东西），
 * 周报里也会引用这些词 —— 扫它们必然误报，误报多了真信号就被淹没了。 */
const DELIVER = ['js', 'css', 'admin', 'data', 'assets'];
const files = [];
for (const d of DELIVER) {
  const dp = path.join(ROOT, d);
  if (fs.existsSync(dp)) walk(dp, files);
}
for (const f of ['index.html']) {
  const fp = path.join(ROOT, f);
  if (fs.existsSync(fp)) files.push(fp);
}

console.log('=== 污染全量扫描 ===\n');
console.log('— D1 特征证：交付源码全量扫（' + FEATS.length + ' 条特征 / '
  + files.length + ' 个文件）—');
let d1hit = [];
for (const f of files) {
  let s;
  try { s = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  for (const feat of FEATS) {
    if (s.includes(feat)) {
      const rel = path.relative(ROOT, f);
      /* 变异脚本自身持有特征串是正常的（那是它们要注入的内容） */
      if (/(^|\/)(mutate_|mutguard|mutsentinel|fullscan)/.test(rel)) continue;
      d1hit.push(rel + '  ←  ' + JSON.stringify(feat).slice(0, 60));
      break;
    }
  }
}
if (d1hit.length === 0) ok('D1 全仓库无注入特征残留（扫描 ' + files.length + ' 个文件 / '
  + FEATS.length + ' 条特征）');
else d1hit.forEach(h => ng('D1 ' + h));

/* ------------------------------------------------------------ D2 备份证 */
console.log('\n— D2 备份证：变异备份 vs 当前文件 —');
const BAKMAP = [
  ['.mut/config.js', 'js/config.js'],
  ['.mut/audio.js', 'js/audio.js'],
  ['.mut/ui.js', 'js/ui.js'],
  ['.mut/config_bak.js', 'js/config.js'],
  ['.mut/ag_config.bak', 'js/config.js'],
  ['.mut/sent_cfg.bak', 'js/config.js'],
];
const SNP = path.join(ROOT, 'tools', '_mutsnap');
if (fs.existsSync(SNP)) {
  for (const n of fs.readdirSync(SNP)) {
    if (n === '_meta.json') continue;
    const rel = n.replace(/^js_/, 'js/').replace(/^css_/, 'css/')
                 .replace(/^tools_/, 'tools/').replace(/^admin_js_/, 'admin/js/')
                 .replace(/^admin_/, 'admin/');
    BAKMAP.push([path.join('tools', '_mutsnap', n), rel]);
  }
}
let d2diff = [], d2cmp = 0, d2auto = 0;
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const hasFeat = (buf) => {
  const s = buf.toString('utf8');
  for (const f of FEATS) if (s.includes(f)) return f;
  return null;
};
/* V1.3.8 修：D2 此前「只报差异、不判性质」，而备份天然是旧快照，
 * 于是每轮都产出一批『待定性』——噪音一大就没人看，真污染反而被淹。
 * 改为自动定性：
 *   · 当前文件含特征        → 判污染（FAIL），这是变异没还原
 *   · 备份含特征            → 判污染（FAIL），恢复源有毒（由 D6 兜，这里也报）
 *   · 仅版本/内容演进差异    → 记为『旧快照（合法）』，静默计数，不再刷屏 */
for (const [bak, cur] of BAKMAP) {
  const bp = path.join(ROOT, bak), cp2 = path.join(ROOT, cur);
  if (!fs.existsSync(bp) || !fs.existsSync(cp2)) continue;
  d2cmp++;
  const bb = fs.readFileSync(bp), cb = fs.readFileSync(cp2);
  if (md5(bb) === md5(cb)) continue;
  const fc = hasFeat(cb), fb = hasFeat(bb);
  if (fc) ng('D2 ' + cur + ' 当前文件含注入特征 ' + JSON.stringify(fc) + ' —— 变异未还原');
  else if (fb) ng('D2 备份 ' + bak + ' 含注入特征 ' + JSON.stringify(fb) + ' —— 恢复源有毒');
  else { d2auto++; }
}
if (d2cmp > 0) ok('D2 已比对 ' + d2cmp + ' 组备份（' + d2auto + ' 组为旧快照差异，合法；'
  + (d2diff.length ? d2diff.length + ' 组未定性' : '0 组未定性') + '）');

/* ------------------------------------------------------------ D3 基准证 */
console.log('\n— D3 基准证：与线上 main 比对（外部干净基准）—');
const ONLINE = path.join(ROOT, '_scan', 'online');
if (fs.existsSync(ONLINE)) {
  for (const n of fs.readdirSync(ONLINE)) {
    const rel = n.replace(/__/g, '/');
    const cp3 = path.join(ROOT, rel);
    if (!fs.existsSync(cp3)) continue;
    if (md5(fs.readFileSync(path.join(ONLINE, n))) === md5(fs.readFileSync(cp3))) {
      ok('D3 ' + rel + ' 与线上一致');
    } else {
      info('D3 ' + rel + ' 与线上不一致（待定性：合法改动 or 污染）');
    }
  }
} else {
  console.log('  -  D3 跳过（无线上基准快照，先跑 _scan/pull.py）');
}

/* ------------------------------------------------------------ D4 开关证 */
console.log('\n— D4 开关证：真源码内 window.__xxx 必须在白名单 —');
const SRCDIRS = ['js', 'admin', 'css'];
const SRCROOTS = ['index.html'];
for (const d of SRCDIRS) {
  const dp = path.join(ROOT, d);
  if (!fs.existsSync(dp)) continue;
  let ents = [];
  try { ents = fs.readdirSync(dp, { withFileTypes: true }); } catch (e) { continue; }
  for (const e of ents) {
    if (!e.isFile() || SKIP_PAT.test(e.name)) continue;
    let s;
    try { s = fs.readFileSync(path.join(dp, e.name), 'utf8'); } catch (err) { continue; }
    const re = /window\.(__[A-Za-z_][A-Za-z0-9_]*)/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(s))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      if (SWITCH_WL.has(m[1])) ok('D4 ' + d + '/' + e.name + ' ' + m[1] + '（白名单：'
        + SWITCH_WL.get(m[1]).slice(0, 24) + '…）');
      else ng('D4 ' + d + '/' + e.name + ' 出现未登记开关 ' + m[1] + ' —— 疑似变异注入残留');
    }
  }
}
for (const f of SRCROOTS) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const s = fs.readFileSync(fp, 'utf8');
  const re = /window\.(__[A-Za-z_][A-Za-z0-9_]*)/g;
  const seen = new Set(); let m;
  while ((m = re.exec(s))) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    if (SWITCH_WL.has(m[1])) ok('D4 ' + f + ' ' + m[1] + '（白名单）');
    else ng('D4 ' + f + ' 出现未登记开关 ' + m[1]);
  }
}


/* ------------------------------------------------------------ D5 线上内容证 */
/* V1.3.8 真事故（本轮靠它抓到）：
 *   本地 js/ui.js 早已清掉 `if (window.__MUT) return;`，本地全量扫描 D1 全绿。
 *   但【线上 main 分支的 js/ui.js 第 2038 行仍然带着这句】—— 污染版本被传上了
 *   生产，而此前所有扫描都只扫本地，没人扫线上。
 *   D3 只比 blob sha，把这种"线上有毒"判成『待定性：合法改动 or 污染』，
 *   人工永远分不清。D5 补上最后一环：拉线上真身内容扫特征串。
 *   只扫与本地不一致的文件（一致的文件内容等同本地，D1 已覆盖）。 */
console.log('\n— D5 线上内容证：与本地不一致的线上文件，拉真身扫特征 —');
const DIFFLIST = path.join(ROOT, '_scan', 'diff.txt');
const SELFTEST = process.argv.includes('--selftest');
let d5n = 0, d5hit = 0;
const https = require('https');
function ghGet(p2, br) {
  return new Promise((res) => {
    const r = https.get('https://api.github.com/repos/q849109815/xiuxian-game/contents/'
      + p2 + '?ref=' + br,
      { headers: { 'User-Agent': 'fullscan', 'Accept': 'application/vnd.github+json' } },
      (resp) => {
        let b = '';
        resp.on('data', (c) => b += c);
        resp.on('end', () => {
          try { res(JSON.parse(b)); } catch (e) { res(null); }
        });
      });
    r.on('error', () => res(null));
    r.setTimeout(20000, () => { r.destroy(); res(null); });
  });
}
(async () => {
  /* 与本地不一致的线上文件清单：由 synccheck.py 产出，这里直接读 */
  let targets = [];
  if (fs.existsSync(DIFFLIST)) {
    targets = fs.readFileSync(DIFFLIST, 'utf8').split('\n')
      .map((l) => l.trim()).filter(Boolean);
  }
  for (const t of targets) {
    /* 自证模式：用本地模拟的"线上真身"代替网络请求。
     * 为什么要这个：D5 的网络版无法安全做变异验证 —— 要证明它抓得住污染，
     * 就得真往生产传一份带 __MUT 的 ui.js，而这正是我们要防的事故本身。
     * 用 _scan/online_sim/ 喂一份污染样本，判据与网络版完全一致。 */
    if (SELFTEST) {
      const sim = path.join(ROOT, '_scan', 'online_sim', t.replace(/\//g, '__'));
      if (!fs.existsSync(sim)) continue;
      const c = fs.readFileSync(sim, 'utf8');
      d5n++;
      let hit = null;
      for (const f of FEATS) if (c.includes(f)) { hit = f; break; }
      if (hit) { d5hit++; ng('D5 线上 ' + t + ' 含注入特征 ' + JSON.stringify(hit)
        + ' —— 污染已进生产，必须重传'); }
      else ok('D5 线上 ' + t + ' 内容洁净');
      continue;
    }
    const br = t.startsWith('data/zb/') ? 'players' : 'main';
    const d = await ghGet(t, br);
    if (!d || !d.content) continue;
    const c = Buffer.from(d.content.replace(/\n/g, ''), 'base64').toString('utf8');
    d5n++;
    let hit = null;
    for (const f of FEATS) if (c.includes(f)) { hit = f; break; }
    if (hit) { d5hit++; ng('D5 线上 ' + t + ' 含注入特征 ' + JSON.stringify(hit)
      + ' —— 污染已进生产，必须重传'); }
    else ok('D5 线上 ' + t + ' 内容洁净');
  }
  if (d5n === 0) console.log('  -  D5 跳过（无 diff.txt 或无线上差异文件）');
  else ok('D5 共核 ' + d5n + ' 个线上差异文件，含特征 ' + d5hit);

  /* -------------------------------------------------------- D6 备份源洁净证 */
  /* V1.3.8 真缺口：仓库根目录躺着 8 个 `.bak_*` 备份（.bak_mut121_js_ui.js 等），
   * 全都在污染状态下拍的，里面带着 `if (window.__MUT) return;`。
   * 而 D1 的 SKIP_PAT 会把 `.bak_` 开头的文件整个跳过 —— 所以它们从没被扫过。
   * 危害：一旦哪个流程拿这些备份当恢复源，污染会被「恢复」回源码，
   * 且工具还会认为『当前与备份一致 → 无需恢复』，把污染保护起来。
   * 判据：任何备份文件（.bak* / 备份目录）都不得含注入特征。 */
  console.log('\n— D6 备份源洁净证：备份/快照不得带污染（否则会恢复出污染）—');
  let d6n = 0, d6hit = 0;
  function walkBak(dir) {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p2 = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'lib'].includes(e.name)) continue;
        if (path.join(ROOT, '_trash') === dir) continue;
        walkBak(p2);
        continue;
      }
      if (!/\.(js|cjs|html|css|json)$/i.test(e.name)) continue;
      /* 只认【真正的恢复源】：名字带 bak/backup 的文件，或 tools/_mutsnap 快照。
       * 反例：tools/_mutround.json 是统计台账，note 里引用了 "__MUT" 这个词
       * 来描述事故本身 —— 它不是恢复源，扫它必然误报（本轮第一版就误报了）。
       * 判据收紧为：路径含 bak/backup，或位于 _mutsnap 快照目录。 */
      const inSnap = p2.includes('_mutsnap');
      if (!/bak/i.test(e.name) && !inSnap) continue;
      let buf;
      try { buf = fs.readFileSync(p2); } catch (err) { continue; }
      if (buf.length > 3 * 1024 * 1024) continue;
      const txt = buf.toString('utf8');
      d6n++;
      for (const f of FEATS) {
        if (txt.includes(f)) {
          d6hit++;
          ng('D6 备份源 ' + path.relative(ROOT, p2) + ' 含注入特征 '
            + JSON.stringify(f) + ' —— 禁止作为恢复源，须归档');
          break;
        }
      }
    }
  }
  walkBak(ROOT);
  if (d6n > 0 && d6hit === 0) ok('D6 ' + d6n + ' 个备份文件全部洁净');

  console.log('\n==========================================================');
  console.log('RESULT: PASS=' + pass + ' FAIL=' + fail);
  if (bad.length) { console.log('\n【确认污染，必须修】'); bad.forEach(b => console.log('  · ' + b)); }
  if (listed.length) { console.log('\n【待人工定性（不自动判污染）】'); listed.forEach(b => console.log('  · ' + b)); }
  process.exit(fail ? 1 : 0);
})();
