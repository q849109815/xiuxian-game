#!/usr/bin/env node
/**
 * V1.1.0 冲刺3 验收 · 赛季远征（策划 P-13）
 * 不启浏览器：在 Node 里加载真实源码执行（不是正则推断）。
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

console.log('=== V1.1.0 冲刺3 验收：赛季远征 ===\n');

/* ── A. 配置完整性 ── */
const S = CFG.SEASON || null;
ok(!!S, 'A1 赛季配置存在');
ok(S && Number(S.WEEKS) === 4, 'A2 赛季周期 4 周', S && String(S.WEEKS));
ok(S && !!S.EPOCH, 'A3 赛季纪元已配置');
ok(S && S.SCORE && Object.keys(S.SCORE).length === 4, 'A4 积分来源 4 项', S && S.SCORE && String(Object.keys(S.SCORE).length));
const steps = (S && S.STEP) || [];
ok(steps.length === 5, 'A5 奖励阶梯 5 档', String(steps.length));
/* 门槛必须单调递增，否则阶梯逻辑自相矛盾 */
let mono = true;
for (let i = 1; i < steps.length; i++) if (!(Number(steps[i].need) > Number(steps[i - 1].need))) mono = false;
ok(mono, 'A6 阶梯门槛单调递增');
/* 奖励键必须能被 grant 真正发出去（历史上 endW 配了无效键 = 玩家领不到） */
const GRANTABLE = /^(gold|diamond|stamina|ach|evToken|ev|title|skin|frame|gem|chipN|chipE|chipL|chipRed)$/;
const mats = (CFG.mats || CFG.items || []).map((x) => x.id);
let badKey = null;
steps.forEach((x) => Object.keys(x.rw || {}).forEach((k) => {
  if (!GRANTABLE.test(k) && mats.indexOf(k) < 0) badKey = k;
}));
ok(!badKey, 'A7 奖励键全部可发放', badKey || '');
ok(S && Number(S.SCORE_CAP) > 0, 'A8 积分上限已配置');

/* ── B. 引擎方法存在且行为正确 ── */
['seasonKey', 'seasonNo', 'seasonOf', 'addSeasonScore', 'seasonClaimable', 'seasonClaim', 'seasonLeftDays']
  .forEach((m) => ok(typeof E[m] === 'function', 'B 方法存在: ' + m));

const p0 = { gold: 0, diamond: 0, mat: {}, chipE: 0, chipRed: 0 };
ok(E.seasonKey() >= 0, 'B1 赛季序号非负', String(E.seasonKey()));
ok(E.seasonNo() === E.seasonKey() + 1, 'B2 赛季编号 = 序号+1');
ok(E.seasonLeftDays() >= 1 && E.seasonLeftDays() <= 28, 'B3 剩余天数在 1~28', String(E.seasonLeftDays()));

/* 积分累加：4 个来源各自正确 */
const p1 = JSON.parse(JSON.stringify(p0));
const g1 = E.addSeasonScore(p1, 'level');
ok(g1 === 10, 'B4 通关 +10', String(g1));
const g2 = E.addSeasonScore(p1, 'endless');
ok(g2 === 15, 'B5 无尽 +15', String(g2));
const g3 = E.addSeasonScore(p1, 'legionBoss');
ok(g3 === 8, 'B6 军团BOSS +8', String(g3));
const g4 = E.addSeasonScore(p1, 'exped');
ok(g4 === 5, 'B7 远征 +5', String(g4));
ok(p1.season.score === 38, 'B8 累计 38', String(p1.season.score));
const g5 = E.addSeasonScore(p1, 'notExist');
ok(g5 === 0, 'B9 未知来源不加分（返回 0）', String(g5));

/* 赛季切换重置 */
const p2 = JSON.parse(JSON.stringify(p1));
p2.season.k = -999;
const after = E.seasonOf(p2);
ok(after.score === 0 && after.got.length === 0, 'B10 赛季切换重置积分与领取记录');

/* ── C. 领取逻辑 ── */
const p3 = JSON.parse(JSON.stringify(p0));
p3.season = { k: E.seasonKey(), score: 120, got: [] };
ok(E.seasonClaimable(p3).length === 1, 'C1 120 分时 1 档可领', String(E.seasonClaimable(p3).length));
const r1 = E.seasonClaim(p3, 0);
ok(r1.ok === true, 'C2 第 1 档领取成功', r1.msg);
ok(p3.gold === 20000, 'C3 金币真实到账 20000', String(p3.gold));
const r2 = E.seasonClaim(p3, 0);
ok(r2.ok === false, 'C4 重复领取被拒', r2.msg);
const r3 = E.seasonClaim(p3, 1);
ok(r3.ok === false, 'C5 积分不足被拒', r3.msg);
const r4 = E.seasonClaim(p3, 99);
ok(r4.ok === false, 'C6 不存在的档位被拒');

/* 高积分一次性可领多档 */
const p4 = JSON.parse(JSON.stringify(p0));
p4.season = { k: E.seasonKey(), score: 1600, got: [] };
ok(E.seasonClaimable(p4).length === 5, 'C7 1600 分时 5 档全可领', String(E.seasonClaimable(p4).length));

/* ── D. 脏档守卫 ── */
const dirty = [
  { season: null }, { season: 'x' }, { season: [] }, { season: 5 },
  { season: { k: E.seasonKey(), score: 'abc', got: [] } },
  { season: { k: E.seasonKey(), score: NaN, got: null } },
  { season: { k: E.seasonKey(), score: -50, got: 'x' } },
  { season: { k: E.seasonKey(), score: 1e18, got: [] } },
];
let dErr = 0;
dirty.forEach((d, i) => {
  const q = Object.assign(JSON.parse(JSON.stringify(p0)), d);
  try {
    const s = E.seasonOf(q);
    if (typeof s.score !== 'number' || !isFinite(s.score) || s.score < 0) dErr++;
    if (!Array.isArray(s.got)) dErr++;
    E.seasonClaimable(q);
  } catch (e) { dErr++; }
});
ok(dErr === 0, 'D1 脏档 8 组不抛异常且数值合法', '异常 ' + dErr);

/* ── E. 接线：4 个来源必须在源码里真调用（历史上零调用的坑） ── */
const eng = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const src = eng + ui;
[['level', "addSeasonScore(p, 'level')"], ['endless', "addSeasonScore(p, 'endless')"],
 ['legionBoss', "addSeasonScore(p, 'legionBoss')"], ['exped', "addSeasonScore(p, 'exped')"]]
  .forEach(([k, call]) => ok(src.indexOf(call) >= 0, 'E 接线存在: ' + k));
/* UI 必须注册面板与入口 */
ok(/season:\s*\['赛季'/.test(ui), 'E5 面板已注册 season');
ok(/data-p="season"/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), 'E6 主菜单入口已加');
ok(/nav_season\.png/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), 'E7 赛季图标已引用');
ok(fs.existsSync(path.join(ROOT, 'assets/icon/nav_season.png')), 'E8 图标文件存在');

console.log('\n=== 结果：PASS ' + PASS + ' / FAIL ' + FAILS.length + ' ===');
if (FAILS.length) { console.log('失败项：'); FAILS.forEach((f) => console.log('  - ' + f)); process.exit(1); }
