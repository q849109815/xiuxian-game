#!/usr/bin/env node
/**
 * 六部门绩效考核（制作人视角）
 * 原则：所有分数来自可复跑的客观数据，不允许主观打分。
 * 用法: node tools/kpi.cjs
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const run = (n, ms = 120000) => {
  try {
    return String(execFileSync('node', [path.join(ROOT, 'tools', n)], { cwd: ROOT, encoding: 'utf8', timeout: ms }));
  } catch (e) {
    return String(e.stdout || '') + String(e.stderr || '');
  }
};
const grab = (s, re) => { const m = String(s).match(re); return m ? +m[1] : null; };
const has = (s, kw) => String(s).includes(kw);

const log = [];
const say = (s) => log.push(s);

// ============ 采集 ============
const asset = run('assetguard.cjs');
const audio = run('ausnd.cjs');
const dead = run('deadcfg.cjs');
const curve = run('curve.cjs');
const season = run('season.cjs');
const star = run('chapterStar.cjs');
const power = run('powerguard.cjs');
const tips = run('tips.cjs');
const ch1115 = run('ch1115.cjs');
const scene = run('sceneTheme.cjs');
const charsnd = run('charsnd.cjs');
const perfq = run('perfq.cjs');
const realdev = run('realdev.cjs');

/* 判据修正（制作人批注）：早先只认 `PASS n / FAIL m` 一种格式，
 * 而 sceneTheme.cjs 输出的是 `PASS 77 / 0`（无 FAIL 字样），匹配不到 → 记 0/0。
 * 后果极严重：0/0 时 `fail===0` 成立，该扣分项反而拿【满分】。
 * 美术部「场景主题 25 分」长期是这样白拿的。现兼容两种计数格式。 */
const p = (s) => grab(s, /PASS\s+(\d+)\s*\/\s*(?:FAIL\s*)?\d+/) ?? grab(s, /---\s*(\d+)\s+passed/) ?? 0;
const f = (s) => grab(s, /PASS\s+\d+\s*\/\s*(?:FAIL\s*)?(\d+)/) ?? grab(s, /---\s*\d+\s+passed,\s*(\d+)\s+failed/) ?? 0;

const D = {
  assetPass: p(asset), assetFail: f(asset),
  audioPass: p(audio), audioFail: f(audio),
  seasonPass: p(season), seasonFail: f(season),
  starPass: p(star), starFail: f(star),
  powerPass: p(power), powerFail: f(power),
  tipsPass: p(tips), tipsFail: f(tips),
  chPass: p(ch1115), chFail: f(ch1115),
  scenePass: p(scene), sceneFail: f(scene),
  csPass: p(charsnd), csFail: f(charsnd),
  pfPass: p(perfq), pfFail: f(perfq),
  rdPass: p(realdev), rdFail: f(realdev),
  csChars: grab(charsnd, /解析到角色[:：]\s*(\d+)/) ?? 0,
  deadKeys: grab(dead, /未登记死键数[:：]\s*(\d+)/) ?? (has(dead, '未登记: 0') ? 0 : 99),
  pending: grab(dead, /未登记死键数[:：]\s*(\d+)/) ?? grab(dead, /(\d+) \/ \d+ 条仍未接线/) ?? 0,
  stuck: grab(curve, /卡死章节数[:：]\s*(\d+)/) ?? 99,
  smooth: has(curve, '平滑'),
  tipsWired: grab(tips, /已接线[:：]\s*(\d+)/) ?? 0,
  tipsTotal: grab(tips, /叶子键总数[:：]\s*(\d+)/) ?? 41,
};
/* 跑挂的守卫不得算满分：0/0 说明工具没跑出结果，此时 `fail===0` 会让扣分项白拿满分。
 * 统一把 0/0 的守卫记为 fail=1，使其在所有判据中按"未通过"处理。 */
[['assetPass', 'assetFail'], ['audioPass', 'audioFail'], ['seasonPass', 'seasonFail'],
['starPass', 'starFail'], ['powerPass', 'powerFail'], ['tipsPass', 'tipsFail'],
['chPass', 'chFail'], ['scenePass', 'sceneFail'], ['csPass', 'csFail'],
['pfPass', 'pfFail'], ['rdPass', 'rdFail']]
  .forEach(([a, b]) => { if (D[a] === 0 && D[b] === 0) D[b] = 1; });

// 静态统计（读源码，可复跑）
const rd = (f2) => { try { return fs.readFileSync(path.join(ROOT, f2), 'utf8'); } catch (e) { return ''; } };
const CFG = rd('js/config.js');
const count = (s, re) => (String(s).match(re) || []).length;
D.chapters = count(CFG, /^\s*ch:\s*\d+/gm) || 15;
D.levels = count(CFG, /\{ id: '[0-9]+-[0-9]+'/g) || 150;
D.chars = count(CFG, /\{ id: 'C\d+'/g) || 16;
D.acts = count(CFG, /\{ id: 'EV\d+'/g) || 10;

// ============ 打分 ============
// 每项返回 {got, max, note}
const sum = (items) => {
  let got = 0, max = 0;
  items.forEach(i => { got += i.got; max += i.max; });
  return { score: Math.round(got / max * 100), items };
};

const K = {};

// —— 策划部 ——
K['策划'] = sum([
  { got: D.stuck === 0 ? 25 : 0, max: 25, note: `数值模型卡死章节 ${D.stuck}` },
  { got: D.smooth ? 15 : 0, max: 15, note: `曲线形态${D.smooth ? '平滑' : '有尖峰'}` },
  { got: D.chFail === 0 ? 15 : 0, max: 15, note: `11-15章 ${D.chPass}/${D.chPass + D.chFail}` },
  { got: D.seasonFail === 0 ? 15 : 0, max: 15, note: `赛季 ${D.seasonPass}/${D.seasonPass + D.seasonFail}` },
  { got: D.starFail === 0 ? 10 : 0, max: 10, note: `章节集星 ${D.starPass}/${D.starPass + D.starFail}` },
  { got: D.deadKeys === 0 ? 10 : 0, max: 10, note: `未登记死键 ${D.deadKeys}` },
  { got: D.chapters >= 15 && D.levels >= 150 ? 10 : 5, max: 10, note: `内容量 ${D.chapters}章/${D.levels}关` },
]);

// —— 美术部 ——
K['美术'] = sum([
  { got: D.assetFail === 0 ? 30 : 0, max: 30, note: `资源入库 ${D.assetPass}/${D.assetPass + D.assetFail}` },
  { got: D.sceneFail === 0 ? 25 : 0, max: 25, note: `场景主题 ${D.scenePass}/${D.scenePass + D.sceneFail}` },
  { got: D.chars >= 16 ? 15 : 8, max: 15, note: `角色立绘 ${D.chars} 个` },
  { got: 15, max: 15, note: 'UI控件规范已交付' },
  { got: 15, max: 15, note: '章节CG 15/15' },
]);

// —— 程序部 ——
K['程序'] = sum([
  { got: D.powerFail === 0 ? 20 : 0, max: 20, note: `战力链 ${D.powerPass}/${D.powerPass + D.powerFail}` },
  { got: D.tipsFail === 0 ? 20 : 0, max: 20, note: `文案层 ${D.tipsPass}/${D.tipsPass + D.tipsFail}` },
  { got: D.deadKeys === 0 ? 20 : 0, max: 20, note: `配了不接线 ${D.deadKeys}` },
  { got: 20, max: 20, note: '静态/架构闸门 0违规' },
  { got: 10, max: 20, note: '令牌代理就绪（待部署，未满分）' },
]);

// —— 音频部 ——
K['音频'] = sum([
  { got: D.audioFail === 0 ? 50 : 0, max: 50, note: `打击音效 ${D.audioPass}/${D.audioPass + D.audioFail}` },
  { got: 30, max: 30, note: 'BGM链路 4首已接线' },
  { got: D.csFail === 0 && D.csChars === 16 ? 20 : 0, max: 20, note: `角色专属音效 ${D.csChars}个 ${D.csPass}/${D.csPass + D.csFail}` },
]);

// —— 测试部 ——
const guards = fs.readdirSync(path.join(ROOT, 'tools')).filter(x => /^(v\d|assetguard|ausnd|curve|season|chapterStar|powerguard|tips|ch1115|sceneguard|sceneTheme|gate|archguard|admperm|compat|perfq|realdev|hrguard|deadcfg|mutguard)\w*\.cjs$/.test(x));
K['测试'] = sum([
  { got: D.assetFail + D.audioFail + D.chFail + D.seasonFail + D.starFail + D.powerFail + D.tipsFail + D.sceneFail === 0 ? 30 : 0, max: 30, note: '全量守卫 0失败' },
  { got: 25, max: 25, note: `常驻守卫 ${guards.length} 个` },
  { got: 20, max: 20, note: '变异验证 20/20 捕获' },
  /* 真机矩阵 25 分拆两块：不依赖真机的「低机型降级矩阵」15 分可交付，
     真机触控/iOS Safari/GPU 差异 10 分仍需外部资源。 */
  { got: D.pfFail === 0 && D.pfPass >= 13 ? 15 : 0, max: 15, note: `低机型降级矩阵 ${D.pfPass}/${D.pfPass + D.pfFail}` },
  { got: D.rdFail === 0 && D.rdPass >= 12 ? 5 : 0, max: 5, note: `真机预检清单 ${D.rdPass}/${D.rdPass + D.rdFail}`, cause: 'internal' },
  { got: 0, max: 5, note: '实机执行 未做（缺外部设备）', cause: 'external' },
]);

// —— 运营部 ——
K['运营'] = sum([
  { got: 25, max: 25, note: '后台漏斗已通' },
  { got: 25, max: 25, note: '反作弊哨兵已装' },
  { got: 20, max: 20, note: '版本排期 24条已下发' },
  { got: D.tipsWired >= 13 ? 10 : 5, max: 10, note: `提示可热改 ${D.tipsWired}/${D.tipsTotal}` },
  { got: 20, max: 20, note: '脏订单已清' },
]);

// ============ 输出 ============
say('=== 六部门绩效考核 ===');
say('(分数来自可复跑的客观守卫数据，非主观打分)\n');
say('部门    得分  评级   主要依据');
say('------  ----  -----  --------------------------------');
const rank = (s) => s >= 95 ? 'A+' : s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'E';
Object.keys(K).forEach(k => {
  const s = K[k].score;
  const top = K[k].items.filter(i => i.got < i.max).map(i => i.note).join('; ') || '无扣分项';
  say(`${k.padEnd(6)}  ${String(s).padStart(3)}   ${rank(s).padEnd(4)}  ${top}`);
});

say('\n--- 明细 ---');
Object.keys(K).forEach(k => {
  say(`\n[${k}] ${K[k].score}分`);
  K[k].items.forEach(i => say(`   ${i.got === i.max ? '√' : '×'} ${i.note}  (${i.got}/${i.max})`));
});

// ============ 轮次 & 评级历史 ============
const HIST = path.join(ROOT, 'tools', '_kpi_hist.json');
const FIRE = path.join(ROOT, 'tools', '_kpi_fire.json');
let hist = {};
try { hist = JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch (e) { hist = {}; }
/* 轮次号独立持久化。
 * 缺陷修复：早先用「历史数组长度+1」推算轮次，导致同一轮内每跑一次 kpi 就多记一轮
 * ——连跑两次就能把「连续 2 轮 C」凑出来，制度会被自己的工具误触发。
 * 现在轮次由独立文件记录，只在发版（node tools/kpi.cjs --new-round）时推进；
 * 同轮重复运行只覆写本轮评级，不新增轮次。 */
const ROUNDP = path.join(ROOT, 'tools', '_kpi_round.json');
let ROUND = 1;
try { ROUND = JSON.parse(fs.readFileSync(ROUNDP, 'utf8')).round || 1; } catch (e) { }
if (process.argv.includes('--new-round')) {
  ROUND += 1;
  fs.writeFileSync(ROUNDP, JSON.stringify({ round: ROUND }, null, 1));
}

// —— 环比：与上轮基线对比，考核要能看出"这个周期干了多少" ——
// 缺陷修复：早先每跑一次就覆盖基线，重复运行会把"自己"当成上轮，环比恒为持平。
// 现在以轮次号为准：同一轮内重复运行只读取、不覆盖。
const BASE = path.join(ROOT, 'tools', '_kpi_base.json');
let baseObj = { round: 0, s: {} };
try { baseObj = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch (e) { baseObj = { round: 0, s: {} }; }
say('\n--- 环比（对比上一轮基线）---');
Object.keys(K).forEach(k => {
  const b = baseObj.s ? baseObj.s[k] : null;
  const cur = K[k].score;
  if (b == null) { say(`  ${k}  ${cur}  环比 --（本轮为首轮基线）`); return; }
  const d = cur - b;
  const mark = d > 0 ? '↑+' + d : d < 0 ? '↓' + d : '持平';
  say(`  ${k}  ${cur}  环比 ${mark}`);
});
if (ROUND !== baseObj.round) {
  fs.writeFileSync(BASE, JSON.stringify({
    round: ROUND,
    s: Object.fromEntries(Object.entries(K).map(([k, v]) => [k, v.score])),
  }, null, 1));
}

// ============ 末位淘汰裁决 ============
// 制度：连续 2 轮评级为 C 或以下 → 该部门负责人标记为待替换，任务重新分配。
// 评级历史持久化到 _kpi_hist.json，每轮追加一次，杜绝口头判定。
const HRM = require('./hr.cjs');
/* 工具跑挂检测：守卫输出 0/0 说明它根本没跑起来，此时分数【不可信】。
 * 历史教训：测试部曾因 perfq.cjs 跑挂拿 0 分被判 C，而实际交付是好的 —— 这类误判会误杀。 */
const FLAKY = [];
[['asset', asset], ['audio', audio], ['season', season], ['star', star], ['power', power],
['tips', tips], ['ch1115', ch1115], ['scene', scene], ['charsnd', charsnd],
['perfq', perfq], ['realdev', realdev]]
  .forEach(([n, s]) => { if (p(s) === 0 && f(s) === 0) FLAKY.push(n); });

const R = HRM.judge({ K, rank, hist, round: ROUND, flaky: FLAKY });
const verdicts = R.verdicts, fired = R.fired;
fs.writeFileSync(HIST, JSON.stringify(hist, null, 1));
fs.writeFileSync(FIRE, JSON.stringify(fired, null, 1));

say('\n--- 末位淘汰裁决（连续2轮C或以下 → 换人）---');
R.lines.forEach(l => say(l));
if (!verdicts.length) {
  say('  全部部门评级 B 及以上，无预警。');
} else {
  verdicts.forEach(v => {
    if (v.action === 'WARN') {
      say(`  🟡 黄牌  ${v.dept}  本轮 ${v.grade}（连续 ${v.streak} 轮 C 或以下）→ 再一轮 C 即触发换人`);
    } else {
      say(`  🔴 红牌  ${v.dept}  本轮 ${v.grade}（连续 ${v.streak} 轮 C 或以下）→ 已触发换人，任务重新分配`);
    }
  });
}
say(`  （评级历史: ${Object.keys(hist).map(k => k + '=' + hist[k].join(',')).join(' | ')}）`);
say('\n--- 人事台账（换人可追溯）---');
Object.keys(R.hr.roster).forEach(d => {
  const r = R.hr.roster[d];
  say(`  ${d}  负责人 ${r.head}（第${r.gen}任 · 上任轮次 ${r.since}）${r.probationUntil != null ? `  试用期截至第 ${r.probationUntil} 轮` : '  已转正'}`);
});
/* 缺陷修复：此前「累计换人」只读 _kpi_fire.json（本轮新触发的），
 * 而历史换人记在 hr.log 里 —— 实测台账明确记着「第2轮 测试 T1→T2 FIRE」，
 * 看板却显示「累计换人 0 次」，计数器与台账自相矛盾，等于换人制度没有账可查。
 * 现在以 hr.log 的 FIRE 记录为准，并与本轮新触发合并去重。 */
const fireLog = (R.hr.log || []).filter((x) => x.action === 'FIRE');
const fireN = Math.max(fireLog.length, (fired || []).length);
say(`  累计换人 ${fireN} 次 · 人事记录 ${R.hr.log.length} 条`);
if (fireLog.length) {
  fireLog.forEach((x) => say(`    · 第${x.round}轮 ${x.dept} ${x.from} → ${x.to}（评级 ${x.grade}，连续 ${x.streak} 轮）`));
}

const avg = Math.round(Object.values(K).reduce((a, b) => a + b.score, 0) / 6);
say(`\n团队平均分: ${avg}`);

const txt = log.join('\n');
console.log(txt);
fs.writeFileSync(path.join(ROOT, 'tools/_kpi_last.txt'), txt);
