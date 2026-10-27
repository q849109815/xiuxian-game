#!/usr/bin/env node
/**
 * V1.1.0 六部门意见统一改善 · 验收
 * 覆盖：策划 P-14 军功经济重平衡 / P-15 赛季循环奖
 *       程序 D-14 活跃宝箱与 grant 接线
 *       音频 AU-03 赛季专属音效
 *       美术 A-14 资产入库（由 assetguard 负责，此处只核 V1.1.0 新增项）
 *       运营 O-11 赛季后期目标
 *
 * 铁律：每条断言必须能被变异测试证伪 —— 抓不住注入缺陷的断言等于不存在。
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let PASS = 0; const FAILS = [];
const ok = (c, n, d) => { if (c) PASS++; else { FAILS.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); } };

const ctx = vm.createContext({ console, Math, Date, JSON, Number, String, Array, Object, isNaN, parseInt, parseFloat,
  setTimeout: () => {}, location: { pathname: '/' }, fetch: async () => ({ ok: false }),
  window: null, document: null });
ctx.window = ctx;
for (const f of ['js/config.js', 'js/engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const CFG = ctx.EX, E = ctx.E;

console.log('=== V1.1.0 六部门意见统一改善 · 验收 ===\n');

/* ── A. 策划 P-14：军功经济 ── */
const R = CFG.REALM;
let total = 0; for (let n = 1; n <= R.MAX_LAYER; n++) total += E.realmCost(n);
ok(total >= 20000 && total <= 35000, 'A1 满阶军功总耗落在 2.0~3.5 万（原 82,002 需刷主线22.8遍）', '实际 ' + total);
ok(R.COST_GROW <= 1.06, 'A2 晋升成长系数已下调', '实际 ' + R.COST_GROW);

/* 全部 150 关刷一遍的军功产出 */
const lv = CFG.levels || [];
let perRun = 0;
for (const l of lv) { const ch = Number((E.levelDef ? E.levelDef(l.id) : {}).ch) || 1; perRun += (R.DROP_BASE + R.DROP_STEP * (ch - 1)); }
ok(perRun > 0, 'A3 主线单遍军功产出可计算', 'perRun=' + perRun);
ok(total / perRun < 12, 'A4 满阶不再需要刷主线 20+ 遍', '需 ' + (total / perRun).toFixed(1) + ' 遍');

/* ── B. 程序 D-14：活跃宝箱发军功（此前只在注释里存在） ── */
const mkP = () => ({ gold: 0, diamond: 0, stamina: 0, mat: {}, spirit: 0, realm: 0,
  tasksDone: {}, daily: {}, actBox: { k: 0, got: [] }, season: { k: E.seasonKey(), score: 0, got: [] },
  ach: 0, titles: [], skins: [], frames: [], gems: {}, chips: [], evToken: 0, evScore: 0 });
const ACT = CFG.DAILY_ACT || [];
ok(ACT.length >= 3, 'B1 每日活跃宝箱配置存在', '档数 ' + ACT.length);
for (const b of ACT) {
  const p = mkP();
  /* 造出足够活跃点：直接 stub dailyActPoint */
  const orig = E.dailyActPoint; E.dailyActPoint = () => 999;
  const r = E.actBoxTake(p, b.v);
  E.dailyActPoint = orig;
  const exp = (R.ACT_SPIRIT || {})[String(Number(b.v))] || 0;
  ok(r.ok, 'B2.' + b.v + ' 活跃宝箱可领取', JSON.stringify(r));
  ok(exp > 0 && p.spirit === exp, 'B3.' + b.v + ' 活跃宝箱发放军功 ' + exp, '实际 spirit=' + p.spirit);
}
const daySpirit = ACT.reduce((a, b) => a + ((R.ACT_SPIRIT || {})[String(Number(b.v))] || 0), 0);
ok(daySpirit >= 400 && daySpirit <= 900, 'B4 活跃宝箱日均军功落在 400~900（过高会冲掉通关线）', '实际 ' + daySpirit);

/* ── C. grant / validGive 支持 spirit ── */
{
  const p = mkP();
  ok(E.validGive({ spirit: 500 }), 'C1 validGive 认可 spirit（否则含 spirit 的整档奖励被拒）');
  const got = E.grant(p, { spirit: 500 });
  ok(got === 500 && p.spirit === 500, 'C2 grant 发放 spirit 到 p.spirit', 'got=' + got + ' spirit=' + p.spirit);
  ok(!('spirit' in (p.mat || {})), 'C3 spirit 未掉进材料背包（旧行为：p.mat["spirit"]）', JSON.stringify(Object.keys(p.mat || {})));
  const p2 = mkP(); p2.spirit = 9999999 - 10;
  E.grant(p2, { spirit: 9999 });
  ok(p2.spirit <= (R.SPIRIT_CAP || 9999999), 'C4 军功封顶生效', 'spirit=' + p2.spirit);
  const p3 = mkP();
  E.grant(p3, { spirit: 'abc' }); E.grant(p3, { spirit: -50 }); E.grant(p3, { spirit: NaN });
  ok(p3.spirit === 0, 'C5 脏值不产生 NaN/负值', 'spirit=' + p3.spirit);
}

/* ── D. 策划 P-15 / 运营 O-11：赛季循环奖 ── */
{
  const S = CFG.SEASON;
  ok(!!S.LOOP && !!S.LOOP.rw, 'D1 赛季循环奖已配置');
  const p = mkP();
  const maxNeed = Number(S.STEP[S.STEP.length - 1].need);
  p.season.score = maxNeed + S.LOOP.every;
  const need1 = E.seasonLoopNeed(p);
  ok(need1 === maxNeed + S.LOOP.every, 'D2 首次循环门槛 = 最高档+' + S.LOOP.every, '实际 ' + need1);
  const r1 = E.seasonLoopClaim(p);
  ok(r1.ok, 'D3 够分可领循环奖', JSON.stringify(r1));
  const need2 = E.seasonLoopNeed(p);
  ok(need2 === maxNeed + S.LOOP.every * 2, 'D4 领取后门槛推进（防重复领同一档）', '实际 ' + need2);
  const r2 = E.seasonLoopClaim(p);
  ok(!r2.ok, 'D5 分数不足时拒绝二次领取', JSON.stringify(r2));
  /* 未领满阶梯也能领循环？应仍按门槛判定，不阻断 */
  const p2 = mkP(); p2.season.score = maxNeed + S.LOOP.every * 5;
  let n = 0; for (let i = 0; i < 5; i++) if (E.seasonLoopClaim(p2).ok) n++;
  ok(n === 5, 'D6 高分可连续领多档循环奖', '实际领到 ' + n);
  /* 上限 */
  const p3 = mkP(); p3.season.score = 999999; p3.season.loop = Number(S.LOOP.max) || 99;
  ok(E.seasonLoopNeed(p3) === null, 'D7 达上限后不再给循环档');
  /* 脏档 */
  for (const bad of ['abc', -3, NaN, {}, null, 1.7]) {
    const p4 = mkP(); p4.season.score = 99999; p4.season.loop = bad;
    let threw = false, res = null;
    try { res = E.seasonLoopClaim(p4); } catch (e) { threw = true; }
    ok(!threw, 'D8 脏 loop=' + JSON.stringify(bad) + ' 不抛异常');
    if (!threw && res && res.ok) ok(isFinite(Number(p4.season.loop)), 'D9 脏 loop 领后归为有限数', String(p4.season.loop));
  }
  /* 赛季切换重置 */
  const p5 = mkP(); p5.season.score = 99999; p5.season.loop = 3;
  E.seasonLoopClaim(p5);
  p5.season.k = -1;
  const s2 = E.seasonOf(p5);
  ok(s2.loop === 0 && s2.score === 0, 'D10 新赛季重置积分与循环次数', JSON.stringify({ l: s2.loop, s: s2.score }));
}

/* ── E. 音频 AU-03 ── */
{
  const a = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
  ok(/case\s+'season'/.test(a), 'E1 audio.js 存在 season 分支');
  const u = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
  ok(/SND\.play\('season'\)/.test(u), 'E2 赛季领取调用 season 音效');
  ok(/SND\.play\('realm'\)/.test(u), 'E3 军衔晋升仍用 realm 音效（未被误改）');
}

/* ── F. 文案与实现一致 ── */
{
  const u = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
  ok(/每日活跃宝箱/.test(u), 'F1 军衔面板写明活跃宝箱来源（原只写"活动与运营发放"，无实现）');
  const c = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  ok(!/唯一产出/.test(c), 'F2 config 注释已修正（不再声称"唯一产出"）');
}

/* ── G. 赛季后期不再空转（运营 O-11） ── */
{
  const S = CFG.SEASON;
  const perDay = 10 * S.SCORE.level + S.SCORE.endless + S.SCORE.legionBoss + S.SCORE.exped;
  const maxNeed = Number(S.STEP[S.STEP.length - 1].need);
  const daysToFull = maxNeed / perDay;
  const seasonDays = S.WEEKS * 7;
  ok(daysToFull < seasonDays, 'G1 阶梯可在赛季内领满（否则赛季末才刚够）', daysToFull.toFixed(1) + '/' + seasonDays + '天');
  const emptyDays = seasonDays - daysToFull;
  ok(emptyDays > 0, 'G2 确认存在赛季末空窗（这是 P-15 的立项依据）', '空窗 ' + emptyDays.toFixed(1) + ' 天');
  ok(!!(S.LOOP && S.LOOP.every > 0), 'G3 空窗期由循环奖承接', 'every=' + (S.LOOP && S.LOOP.every));
}

console.log('\n--- PASS ' + PASS + ' / FAIL ' + FAILS.length + ' ---');
process.exit(FAILS.length ? 1 : 0);
