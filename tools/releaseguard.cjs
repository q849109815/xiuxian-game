#!/usr/bin/env node
/* ==========================================================================
 * 【发布流程守卫】tools/releaseguard.cjs
 *
 * 背景（制作人铁律）：
 *   改动上传了但版本号没变 -> 玩家缓存命中旧 ?v= -> 拿到旧文件（甚至被污染的旧文件）
 *   -> 表现「明明修了还是坏的」-> 玩家投诉。
 *
 * 因此把「每次发布版本号必须在末尾 +1」固化成流程，并用本守卫强制校验。
 * 用法： node tools/releaseguard.cjs
 * 退出码： 0 全部通过 / 1 有失败
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const VER_FILE = path.join(ROOT, 'tools', '.version.json');
const REL_FILE = path.join(ROOT, 'tools', '.lastrelease.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

let PASS = 0, FAIL = 0;
const ok = (n, d) => { PASS++; console.log('  √ ' + n + (d ? '  ' + d : '')); };
const no = (n, d) => { FAIL++; console.log('  ✗ ' + n + (d ? '  ' + d : '')); };

function curVer() {
  try { return JSON.parse(fs.readFileSync(VER_FILE, 'utf8')).v; } catch (e) { return null; }
}
function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}

/* 版本号规范性：PATCH <= 99。
 * 背景：旧「末尾追加 1」让版本号膨胀到 1.3.72111111111111（14 个 1），玩家可见却不可读。
 * V1.3.73 起 PATCH 改为十进制递增并在满 99 时进位 MINOR，这里守住不再膨胀。 */
const MAX_PATCH = 99;
function isMalformed(v) {
  const seg = String(v || '').split('.');
  if (seg.length !== 3) return true;
  const n = Number(seg[2]);
  return !Number.isFinite(n) || n > MAX_PATCH;
}
/* 合法重设点判定：前一条畸形 + 当前条规范 = 「膨胀版本号拉回规范区间」，
   这是 V1.3.73 一次性整改，不属于版本回退，必须放行但单独标注。 */
function isResetPoint(prev, cur, tag) {
  return isMalformed(prev) && !isMalformed(cur) && /基线重设/.test(tag || '');
}

console.log('=== 发布流程守卫 ===');
const V = curVer();
if (!V) { console.log('  ✗ 读不到当前版本号'); process.exit(1); }
console.log('  当前版本 V' + V + '\n');

/* R1 CHANGELOG 版本号序列严格递增 */
console.log('— R1 版本单调：CHANGELOG 中版本号必须严格递增 —');
const cl = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : '';
const ents = [...cl.matchAll(/^##\s*V?([\d.]+)（([^）]*)）[^\n]*/gm)].map(m => ({ v: m[1], tag: m[2] }));
const vs = ents.map(e => e.v);
let mono = true, badAt = '', resets = 0;
for (let i = 1; i < vs.length; i++) {
  if (cmpVer(vs[i], vs[i - 1]) > 0) continue;
  /* 重设点：畸形版本号拉回规范区间（V1.3.73 一次性整改），不计入递增违规 */
  if (isResetPoint(vs[i - 1], vs[i], ents[i].tag)) { resets++; continue; }
  mono = false; badAt = vs[i - 1] + ' -> ' + vs[i]; break;
}
mono ? ok('R1 版本序列递增', vs.length + ' 条，最新 V' + (vs[vs.length - 1] || '-') +
          (resets ? '（含 ' + resets + ' 个基线重设点，已单独放行）' : ''))
     : no('R1 版本序列未递增', badAt);

/* R2 全站版本戳统一 */
console.log('— R2 版本统一：?v= / config version / manifest / IMG_V 全部一致 —');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const stamps = [...idx.matchAll(/\?v=([\w.\-]+)/g)].map(m => m[1]);
const uniq = [...new Set(stamps)];
uniq.length === 1 && uniq[0] === V ? ok('R2 index.html ?v= 统一', uniq[0] + '（' + stamps.length + ' 处）')
                                   : no('R2 index.html ?v= 不统一', uniq.join('/') + ' 期望 ' + V);
const cfg = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
const cv = (cfg.match(/HOT_UPDATE:\s*\{[\s\S]*?version:\s*'([\w.\-]+)'/) || [])[1];
cv === V ? ok('R2 config version 一致', cv) : no('R2 config version 不一致', String(cv) + ' 期望 ' + V);
const mv = [...new Set([...cfg.matchAll(/ver\s*:\s*'([\w.\-]+)'/g)].map(m => m[1]))];
mv.length === 1 && mv[0] === V ? ok('R2 manifest ver 一致', mv[0] + '（' + mv.length + ' 项）')
                               : no('R2 manifest ver 不一致', mv.join('/') + ' 期望 ' + V);
const uiv = (fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8').match(/const\s+IMG_V\s*=\s*'([\w.\-]+)'/) || [])[1];
uiv === V ? ok('R2 ui.js IMG_V 一致', uiv) : no('R2 ui.js IMG_V 不一致', String(uiv) + ' 期望 ' + V);

/* R3 本次相对上次发布必须升版 */
console.log('— R3 已升版：当前版本必须不同于上次发布基线 —');
if (fs.existsSync(REL_FILE)) {
  const last = JSON.parse(fs.readFileSync(REL_FILE, 'utf8')).v;
  /* 语义修正：发布完成后，当前版本自然等于基线，这是正常状态，不能判失败。
     本项真正要拦的是「版本回退」（有人把版本号改小 = 缓存可能被判为旧版）。
     「有改动但没升版」的拦截交给 push.py 的 version_gate —— 它只在真有文件要上传时才拦。 */
  if (cmpVer(V, last) >= 0) ok('R3 版本未回退', 'V' + last + ' -> V' + V + (V === last ? '（已发布状态）' : '（已升版）'));
  else if (isMalformed(last) && !isMalformed(V)) ok('R3 基线重设（畸形版本拉回规范区间）', 'V' + last + ' -> V' + V);
  else no('R3 版本回退', 'V' + last + ' -> V' + V + '（版本号变小，判定异常）');
} else {
  ok('R3 无基线记录（首次，放行）', 'V' + V);
}

/* R4 manifest 覆盖 */
console.log('— R4 覆盖：manifest 必须覆盖 index.html 全部 css/js —');
const refs = [...idx.matchAll(/(?:src|href)="([^"]+\.(?:css|js))(?:\?[^"]*)?"/g)].map(m => m[1]);
/* 只取 HOT_UPDATE.manifest 数组内的 p，避免把配置里其它 path 字段算进来 */
const mblk = (cfg.match(/HOT_UPDATE:\s*\{[\s\S]*?manifest:\s*\[([\s\S]*?)\n\s*\]/) || [])[1] || '';
const man = [...mblk.matchAll(/p\s*:\s*'([^']+)'/g)].map(m => m[1]);
/* 下限断言：0/0 一律判失败。历史上多次出现「判据写错导致扫到 0 条却报绿」 */
if (refs.length < 10 || man.length < 10) {
  no('R4 扫描数量异常（判据失效？）', '引用 ' + refs.length + ' / manifest ' + man.length + '，均不应少于 10');
} else {
  const miss = refs.filter(r => !man.includes(r));
  miss.length === 0 ? ok('R4 manifest 全覆盖', refs.length + ' 个引用 / ' + man.length + ' 项')
                    : no('R4 manifest 漏登记', miss.join(','));
}

/* R5 流程固化：bump1 与版本闸门不得被删 */
console.log('— R5 流程固化：bump1 与版本闸门必须存在 —');
const ver = fs.readFileSync(path.join(ROOT, 'tools', 'ver.cjs'), 'utf8');
/* 判据收紧：只查 'bump1' 字样不够（改名成 __bump1_x 仍能子串匹配到）。
   必须同时验证 bump1 分支的真实实现（末尾追加 '1'）存在。 */
/MAX_PATCH/.test(ver) ? ok('R5 ver.cjs 有 PATCH 上限（防膨胀）') : no('R5 ver.cjs 缺 PATCH 上限');
/function\s+assertNorm/.test(ver) ? ok('R5 ver.cjs 有版本号规范性校验') : no('R5 ver.cjs 缺规范性校验');
/kind === 'reset'/.test(ver) ? ok('R5 ver.cjs 有 reset 基线重设') : no('R5 ver.cjs 缺 reset');
/* 必须拦住 bump1：旧做法会让版本号无限追加 1，已废弃，调用即报错退出 */
/process\.exit\(2\);/.test(ver) && /bump1 已废弃/.test(ver)
  ? ok('R5 bump1 已废弃并拦截') : no('R5 bump1 未被拦截（版本号会膨胀）');
/assertInc/.test(ver) ? ok('R5 ver.cjs 有递增校验') : no('R5 ver.cjs 缺递增校验');
const py = fs.readFileSync(path.join(ROOT, 'tools', 'push.py'), 'utf8');
/def version_gate/.test(py) ? ok('R5 push.py 有版本闸门') : no('R5 push.py 缺版本闸门');
/def mark_released/.test(py) ? ok('R5 push.py 记录发布基线') : no('R5 push.py 缺基线记录');
const dashc = fs.existsSync(path.join(ROOT, 'tools', 'dash.cjs')) ? fs.readFileSync(path.join(ROOT, 'tools', 'dash.cjs'), 'utf8') : '';
/releaseguard/.test(dashc) ? ok('R5 dash.cjs 已接入本守卫') : no('R5 dash.cjs 未接入本守卫');

/* R6 版本号规范性：当前版本 + 最新一条 CHANGELOG 都不得是畸形串 */
console.log('— R6 版本号规范：不得再出现 1.3.72111111111111 这类膨胀串 —');
isMalformed(V) ? no('R6 当前版本号畸形', 'V' + V + '（PATCH 段 > ' + MAX_PATCH + '，玩家可见却不可读）')
               : ok('R6 当前版本号规范', 'V' + V + '（PATCH <= ' + MAX_PATCH + '）');
const lastV = vs[vs.length - 1];
isMalformed(lastV) ? no('R6 CHANGELOG 最新版本号畸形', 'V' + lastV)
                   : ok('R6 CHANGELOG 最新版本号规范', 'V' + lastV);

console.log('\n==========================================================');
console.log('RESULT: PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL ? 1 : 0);
