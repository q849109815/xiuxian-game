#!/usr/bin/env node
/**
 * V1.2.0 验收 · 章节集星奖励（策划 P-17）
 * 在 Node 里加载真实源码执行，不是正则推断。
 *
 * 铁律：每条断言必须能被变异测试证伪 —— 抓不住注入缺陷的断言等于不存在。
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let PASS = 0; const FAILS = [];
const ok = (c, n, d) => { if (c) { PASS++; } else { FAILS.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); } };

const ctx = vm.createContext({
  console, Math, Date, JSON, Number, String, Array, Object, isNaN, parseInt, parseFloat,
  setTimeout, location: { pathname: '/' },
  fetch: async () => ({ ok: false }),
  window: null, document: null,
});
ctx.window = ctx;
for (const f of ['js/config.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const CFG = ctx.EX, E = ctx.E;

console.log('=== V1.2.0 验收：章节集星奖励 ===\n');

/* ── A. 配置合法性 ── */
const T = CFG.chapterStarRw || [];
ok(Array.isArray(T) && T.length === 3, 'A1 集星档位 3 档', String(T.length));
let mono = true;
for (let i = 1; i < T.length; i++) if (!(Number(T[i].star) > Number(T[i - 1].star))) mono = false;
ok(mono, 'A2 门槛单调递增');
ok(T.length && Number(T[2].star) === 30, 'A3 满档 = 30 星（一章 10 关 × 3 星）', T.length ? String(T[2].star) : '');
/* 奖励键必须落在 grant 白名单：历史上活动 rw 写中文 → 塞进 p.mat['钻石'] 垃圾键 */
const WHITE = ['gold', 'diamond', 'stamina', 'xp', 'ach', 'tp', 'chipN', 'chipE', 'chipL', 'chipRed', 'evToken', 'evScore'];
let badKey = '';
T.forEach((t, i) => Object.keys(t.rw || {}).forEach((k) => { if (!WHITE.includes(k)) badKey += t.star + ':' + k + ' '; }));
ok(!badKey, 'A4 奖励键全部在发放白名单内', badKey);
let cnKey = '';
T.forEach((t) => Object.keys(t.rw || {}).forEach((k) => { if (/[一-龥]/.test(k)) cnKey += k + ' '; }));
ok(!cnKey, 'A5 无中文奖励键（邮件金币污染同源防护）', cnKey);
/* 首档门槛必须 = 10：一章 10 关，全通 1 星即可拿第一档（中途目标要够得着） */
ok(T.length && Number(T[0].star) === 10, 'A6 首档门槛 = 10（10 关各 1 星即达）', T.length ? String(T[0].star) : '');
ok(T.length && Number(T[1].star) === 20, 'A7 二档门槛 = 20', T.length ? String(T[1].star) : '');

/* ── B. 章节缩放 ── */
ok(E.chapterStarScale(1) === 1, 'B1 第 1 章缩放 = 1', String(E.chapterStarScale(1)));
let incMono = true, prev = 0;
for (let c = 1; c <= 15; c++) { const v = E.chapterStarScale(c); if (v < prev) incMono = false; prev = v; }
ok(incMono, 'B2 缩放随章节单调不降（后期不会倒挂）');
ok(E.chapterStarScale(15) > E.chapterStarScale(1), 'B3 末章缩放高于首章', E.chapterStarScale(1) + '→' + E.chapterStarScale(15));

/* ── C. 状态判定 ── */
const mk = () => ({ cleared: {}, diffCleared: { normal: {}, hard: {}, hell: {} }, gold: 0, diamond: 0, mat: {}, stamina: 0, chStarRw: {} });
/* 星级按难度独立存于 p.diffCleared[diff][lvId]（E.diffStars 的真实口径） */
const full = (q, c, d) => E.levels().filter((x) => Number(x.ch) === c).forEach((l) => { q.cleared[l.id] = 3; (q.diffCleared[d] = q.diffCleared[d] || {})[l.id] = 3; });
let p = mk();
let s = E.chapterStarState(p, 1, 'normal');
ok(s.stars === 0, 'C1 新号 0 星', String(s.stars));
ok(s.maxStars === 30, 'C2 满星上限 30', String(s.maxStars));
ok(s.tiers.every((t) => !t.can), 'C3 0 星时三档均不可领');
ok(s.tiers.every((t) => !t.got), 'C4 0 星时三档均未领取');

/* 满星：把第 1 章 10 关都打成 3 星 */
p = mk();
full(p, 1, 'normal');
s = E.chapterStarState(p, 1, 'normal');
ok(s.stars === 30, 'C5 满星 = 30', String(s.stars));
ok(s.tiers.every((t) => t.can), 'C6 满星时三档均可领');
/* 奖励必须真的有数值，否则"领了等于没领" */
ok(s.tiers.every((t) => Object.values(t.rw).every((v) => Number(v) > 0)), 'C7 三档奖励数值均 > 0');

/* ── D. 领取行为 ── */
const g0 = p.gold;
const r1 = E.claimChapterStar(p, 1, 'normal', 0);
ok(r1.ok === true, 'D1 首档领取成功');
ok(p.gold > g0, 'D2 金币实际入账', g0 + '→' + p.gold);
ok(p.chStarRw['normal:1'][0] === 1, 'D3 已领标记写入');
const r2 = E.claimChapterStar(p, 1, 'normal', 0);
ok(r2.ok === false, 'D4 重复领取被拒绝');
const g1 = p.gold;
E.claimChapterStar(p, 1, 'normal', 0);
ok(p.gold === g1, 'D5 重复领取不发货（金币未再增加）');

/* 星数不足 */
p = mk();
E.levels().filter((x) => Number(x.ch) === 1).slice(0, 4).forEach((l) => { p.cleared[l.id] = 3; p.diffCleared.normal[l.id] = 3; });
const r3 = E.claimChapterStar(p, 1, 'normal', 2);
ok(r3.ok === false, 'D6 星数不足时拒绝（12 星要 30 星档）');
ok(!(p.chStarRw['normal:1'] || [])[2], 'D7 拒绝时不记账');
const r4 = E.claimChapterStar(p, 1, 'normal', 0);
ok(r4.ok === true, 'D8 12 星可领 10 星档');

/* 越界档位 */
ok(E.claimChapterStar(p, 1, 'normal', 99).ok === false, 'D9 越界档位拒绝');

/* ── E. 难度独立 ── */
p = mk();
full(p, 1, 'normal'); full(p, 1, 'hard');
E.claimChapterStar(p, 1, 'normal', 0);
const hs = E.chapterStarState(p, 1, 'hard');
ok(hs.tiers[0].can === true, 'E1 普通档已领不影响困难档（按难度独立）', JSON.stringify(hs.tiers[0]));
ok(E.chapterStarState(p, 1, 'normal').tiers[0].got === true, 'E2 普通档自身记账正确');

/* ── F. 15 章全覆盖 ── */
let allOk = true, bad = '';
for (let c = 1; c <= 15; c++) {
  const q = mk();
  full(q, c, 'normal');
  const st = E.chapterStarState(q, c, 'normal');
  if (st.stars !== 30) { allOk = false; bad += 'ch' + c + '星' + st.stars + ' '; }
  if (!st.tiers.every((t) => t.can)) { allOk = false; bad += 'ch' + c + '不可领 '; }
  for (let i = 0; i < 3; i++) if (!E.claimChapterStar(q, c, 'normal', i).ok) { allOk = false; bad += 'ch' + c + '档' + i + '失败 '; }
}
ok(allOk, 'F1 15 章逐章满星均可领三档', bad);

/* ── G. 脏数据不崩 ── */
const dirts = [
  { cleared: null, chStarRw: null },
  { cleared: {}, chStarRw: 'x' },
  { cleared: {}, chStarRw: { 'normal:1': 'bad' } },
  { cleared: { '1-1': 'abc' }, chStarRw: {} },
  { cleared: { '1-1': -5 }, chStarRw: {} },
  { cleared: { '1-1': 3 }, chStarRw: { 'normal:1': [1, 1, 1, 1, 1] } },
  {},
];
let dOk = true, dErr = '';
dirts.forEach((d, i) => {
  try {
    const st = E.chapterStarState(d, 1, 'normal');
    if (!st || typeof st.stars !== 'number' || isNaN(st.stars)) { dOk = false; dErr += '#' + i + 'stars非法 '; }
    E.claimChapterStar(d, 1, 'normal', 0);
  } catch (e) { dOk = false; dErr += '#' + i + '抛错:' + e.message + ' '; }
});
ok(dOk, 'G1 脏存档不抛错 / 无 NaN', dErr);

/* ── H. UI 接线（防止"配了零调用"） ── */
const uiSrc = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
ok(/data-csr=/.test(uiSrc), 'H1 UI 渲染集星按钮');
ok(/claimChapterStar\s*\(/.test(uiSrc), 'H2 UI 真调用了领取方法（非死配置）');
ok(/\[data-csr\]/.test(uiSrc), 'H3 UI 绑定了点击事件');

console.log('\n--- ' + PASS + ' passed, ' + FAILS.length + ' failed ---');
if (FAILS.length) { console.log(FAILS.join('\n')); process.exit(1); }
