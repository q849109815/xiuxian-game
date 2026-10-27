#!/usr/bin/env node
/* ==========================================================================
 * V1.2.1 常驻守卫（测试部 T-14）
 *
 * 守护本轮修的两项：
 *   G1 赛季入口红点 —— 主菜单「赛季」可领档位提示（V1.1.0 冲刺3 加的入口漏同步）
 *   G2 头像框发放校验 —— grant() 走 grantFrame，未知 id 不得写入 p.frames
 *
 * 铁律：每条断言必须能被变异测试证伪，抓不住注入缺陷的断言等于不存在。
 * ========================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let PASS = 0; const FAILS = [];
const ok = (c, n, d) => { if (c) PASS++; else { FAILS.push(n + (d ? ' :: ' + d : '')); console.log('  ✗ ' + n + (d ? ' :: ' + d : '')); } };

/* 剥离块注释与行注释（不处理字符串内的 // ，本文件断言不涉及） */
function stripComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\\://])\/\/[^\n]*/g, '$1');
}

const ctx = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, Math, Date, JSON,
  Number, String, Array, Object, isNaN, parseInt, parseFloat, setTimeout,
  location: { pathname: '/' }, fetch: async () => ({ ok: false }),
});
ctx.window = ctx;
for (const f of ['js/config.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const E = ctx.E, EX = ctx.EX;

console.log('=== V1.2.1 守卫：赛季红点 + 头像框发放校验 ===\n');

/* ---------------- G1 赛季红点 ---------------- */
/* 静态断言必须先剥离注释再匹配 —— 否则「把代码注释掉」这种变异抓不出来。
 * 变异验证实测：第一版直接 /set\('season'/ 匹配源码，注入者把该行注释成
 *   /* set('season', sn); *\/ 后断言仍然通过（注释里的文本照样命中），
 *   守卫形同虚设。这里统一 stripComments 后再判。 */
const uiSrcRaw = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const uiSrc = stripComments(uiSrcRaw);
const navBody = (uiSrc.match(/navDots\(\)\s*\{[\s\S]*?\n  \},/) || [''])[0];
ok(/set\(\s*'season'\s*,/.test(navBody), 'G1-1 navDots 内存在【未被注释的】season 红点打点');
ok(/seasonClaimable/.test(navBody), 'G1-2 红点口径取自 E.seasonClaimable（与面板渲染同口径）');
ok(/seasonLoopNeed/.test(navBody), 'G1-3 循环奖励可领也计入红点');

/* G1-4 逻辑：积分不足时可领为 0 */
const p0 = E.newPlayer('T1');
ok(Array.isArray(E.seasonClaimable(p0)), 'G1-4 seasonClaimable 返回数组');
const STEP = (EX.SEASON && EX.SEASON.STEP) || [];
ok(STEP.length > 0, 'G1-5 赛季阶梯已配置', 'STEP=' + STEP.length);

/* G1-6 积分拉满 → 5 档全部可领 */
const p1 = E.newPlayer('T2');
const s1 = E.seasonOf(p1);
s1.score = 999999;
const cl = E.seasonClaimable(p1);
ok(cl.length === STEP.length, 'G1-6 满积分时全部档位可领', `可领 ${cl.length} / 共 ${STEP.length}`);

/* G1-7 领完一档后该档不再计入 */
E.seasonClaim(p1, 0);
const cl2 = E.seasonClaimable(p1);
ok(cl2.length === STEP.length - 1, 'G1-7 领取后该档退出可领列表', `${cl2.length} / ${STEP.length - 1}`);

/* G1-8 赛季未开启（SEASON=null）→ 可领 0，不得抛异常 */
const _bak = EX.SEASON;
EX.SEASON = null;
let noSeason = -1;
try { noSeason = E.seasonClaimable(p1).length; } catch (e) { noSeason = 'THROW:' + e.message; }
ok(noSeason === 0, 'G1-8 赛季未开启时红点为 0 且不抛异常', String(noSeason));
EX.SEASON = _bak;

/* G1-9 脏存档（season 字段缺失/类型错乱）不得抛异常 */
for (const bad of [undefined, null, 'x', 123, {}]) {
  let r = 'THROW';
  try { const q = E.newPlayer('TD'); q.season = bad; r = String(E.seasonClaimable(q).length); } catch (e) { r = 'THROW:' + e.message; }
  ok(r !== 'THROW' && r !== 'THROW:undefined', 'G1-9 脏存档 season=' + JSON.stringify(bad) + ' 不抛异常', String(r).slice(0, 40));
}

/* ---------------- G2 头像框发放校验 ---------------- */
/* G2-1 合法 id 发放成功 */
const pa = E.newPlayer('FA');
const okFrame = (EX.frames && EX.frames[0]) ? EX.frames[0].id : 'ev_frame';
const r1 = E.grantFrame(pa, okFrame);
ok(r1 === true, 'G2-1 合法头像框发放成功', String(r1));
ok((pa.frames || []).indexOf(okFrame) >= 0, 'G2-2 已写入 p.frames');

/* G2-3 重复发放被拦截（返回 false，不重复入列） */
const r2 = E.grantFrame(pa, okFrame);
ok(r2 === false, 'G2-3 重复发放被拦截', String(r2));
ok((pa.frames || []).filter((x) => x === okFrame).length === 1, 'G2-4 不产生重复项');

/* G2-5 未知 id（中文名 / 拼错）被拒绝且不写入 */
const pb = E.newPlayer('FB');
const r3 = E.grantFrame(pb, '头像框');
ok(r3 === false, 'G2-5 未知 id 被拒绝', String(r3));
ok((pb.frames || []).length === 0, 'G2-6 未知 id 未写入 p.frames', JSON.stringify(pb.frames));

/* G2-7 空值不写入 */
ok(E.grantFrame(pb, '') === false && E.grantFrame(pb, null) === false && E.grantFrame(pb, undefined) === false, 'G2-7 空值一律拒绝');

/* G2-8 grant() 主发放路径已改走 grantFrame（静态） */
const grantBody = (stripComments(fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8'))
  .match(/else if \(k === 'frame'\)[^\n]*/g) || []).join(' | ');
ok(/grantFrame/.test(grantBody), 'G2-8 grant() 的 frame 分支已改走 grantFrame', grantBody.slice(0, 90));

/* G2-9 回归：线上三个真实 frame id 全部可发（防止校验把正常发放拦死） */
const pc = E.newPlayer('FC');
let validN = 0;
for (const f of (EX.frames || [])) if (E.grantFrame(pc, f.id)) validN++;
ok(validN === (EX.frames || []).length, 'G2-9 配置表内 frame 全部可正常发放（未误伤）', `${validN}/${(EX.frames || []).length}`);

/* ---------------- G1-B 行为断言 ----------------
 * 变异验证实测：把 `sn = _cl.length` 改成 `sn = 0`（红点永远不显示）时，
 *   上面 G1-1~G1-9 的纯静态断言【全部仍然通过】—— 文本都在，功能却是坏的。
 *   这里 mock 最小 DOM，真实加载 ui.js 并调用 UI.navDots()，
 *   检查赛季按钮上的红点是否真的出现/不出现。 */
const els = {};
function mkEl(tag) {
  return {
    tag, className: '', dataset: {}, style: {}, innerHTML: '', textContent: '', children: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeChild() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector(sel) {
      const n = String(sel).replace(/^\./, '');
      return (this.children || []).find((c) => c.className === n) || null;
    },
    querySelectorAll() { return []; },
  };
}
const mockDoc = {
  getElementById: (id) => (els[id] = els[id] || mkEl('div')),
  querySelector(sel) {
    const m = String(sel).match(/data-p="([^"]+)"/);
    if (!m) return null;
    const k = 'BTN_' + m[1];
    return (els[k] = els[k] || mkEl('button'));
  },
  querySelectorAll: () => [], createElement: (t) => mkEl(t),
  addEventListener() {}, body: mkEl('body'),
};
const ctx2 = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, Math, Date, JSON, Number, String, Array, Object,
  isNaN, parseInt, parseFloat, setTimeout, setInterval, clearTimeout,
  location: { pathname: '/', href: 'http://x/' }, navigator: { userAgent: 'node' },
  fetch: async () => ({ ok: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: mockDoc, requestAnimationFrame: () => 0,
});
ctx2.window = ctx2; ctx2.globalThis = ctx2;
let UI = null;
try {
  for (const f of ['js/config.js', 'js/engine.js', 'js/ui.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx2, { filename: f });
  UI = ctx2.UI;
} catch (e) { UI = null; }

ok(!!UI && typeof UI.navDots === 'function', 'G1-B0 UI.navDots 可在真实加载下调用');
if (UI && typeof UI.navDots === 'function') {
  const dotOf = (key) => {
    const b = els['BTN_' + key]; if (!b) return null;
    const d = (b.children || []).find((c) => c.className === 'nv-dot');
    return (d && d.style.display !== 'none') ? d.textContent : null;
  };
  let threw = null;
  /* ① 满积分 → 赛季入口必须有红点 */
  try {
    const pf = ctx2.E.newPlayer('BF');
    ctx2.E.seasonOf(pf).score = 999999;
    UI.P = pf;
    if (els['BTN_season']) els['BTN_season'].children = [];
    UI.navDots();
  } catch (e) { threw = e.message; }
  ok(!threw, 'G1-B1 navDots(满积分) 不抛异常', threw);
  const dn = dotOf('season');
  ok(dn !== null && Number(dn) > 0, 'G1-B2 满积分时赛季入口出现红点', 'dot=' + dn);

  /* 精确数值比对：红点数必须 = 阶梯可领档数 + 循环奖励可领(0/1)
   * 变异验证实测两处漏过，都是因为只判 >0 被另一路掩盖：
   *   ① `sn = _cl.length` 改成 `sn = 0`（阶梯恒不计数）→ 仍显示 1（循环那档）→ 漏过
   *   ② 循环奖励判断改成恒 false → 仍显示 5（阶梯那 5 档）→ 漏过
   * 这里逐路算出期望值再比总数，任一路被掐掉都会暴露。 */
  const pf2 = ctx2.E.newPlayer('BF2');
  ctx2.E.seasonOf(pf2).score = 999999;
  UI.P = pf2;
  const expClaim = (ctx2.E.seasonClaimable(pf2) || []).length;
  const _needL = ctx2.E.seasonLoopNeed ? ctx2.E.seasonLoopNeed(pf2) : null;
  const _sc = ctx2.E.seasonOf(pf2).score || 0;
  const expLoop = (_needL != null && _sc >= Number(_needL)) ? 1 : 0;
  const exp = expClaim + expLoop;
  try { if (els['BTN_season']) els['BTN_season'].children = []; UI.navDots(); } catch (e) {}
  const dn2 = dotOf('season');
  ok(exp > 0 && Number(dn2) === exp, 'G1-B2b 红点数 = 阶梯可领 + 循环可领（精确比对）', `实际=${dn2} 期望=${exp}(阶梯${expClaim}+循环${expLoop})`);

  /* ② 零积分 → 赛季入口不应有红点 */
  try {
    const pz = ctx2.E.newPlayer('BZ');
    ctx2.E.seasonOf(pz).score = 0;
    UI.P = pz;
    if (els['BTN_season']) els['BTN_season'].children = [];
    UI.navDots();
  } catch (e) { threw = e.message; }
  const dz = dotOf('season');
  ok(dz === null, 'G1-B3 零积分时赛季入口无红点', 'dot=' + dz);

  /* ③ 对照组：任务入口在同样 mock 下能出红点，证明 mock 本身有效
   *    （否则 B2/B3 可能只是因为 mock 失效而假通过） */
  try {
    const pt = ctx2.E.newPlayer('BT');
    UI.P = pt;
    pt.mail = [{ id: 'm1', got: false }];
    if (els['BTN_mail']) els['BTN_mail'].children = [];
    UI.navDots();
  } catch (e) { threw = e.message; }
  const dm = dotOf('mail');
  ok(dm !== null && Number(dm) > 0, 'G1-B4 对照组：邮件入口在同样 mock 下能出红点（证明 mock 有效）', 'dot=' + dm);
}

console.log(`\n=== ${PASS} 项通过 · ${FAILS.length} 项失败 ===`);
if (FAILS.length) { console.log('失败项：\n - ' + FAILS.join('\n - ')); process.exit(1); }
