#!/usr/bin/env node
/**
 * V1.1.0 冲刺2 验收 · 武器流派 + 第11-15章运行时校验
 * 不启浏览器：直接在 Node 里加载真实源码执行（不是正则推断）。
 *
 * 铁律：每条断言必须能被变异测试证伪 —— 抓不住注入缺陷的断言等于不存在。
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let PASS = 0; const FAILS = [];
const ok = (c, n, d) => { if (c) { PASS++; } else { FAILS.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); } };

/* ── 加载真实源码 ── */
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

console.log('=== V1.1.0 冲刺2 验收：武器流派 + 第11-15章 ===\n');

/* ── A. 武器流派：类型覆盖必须无遗漏 ── */
const schools = CFG.GUN_SCHOOLS || [];
ok(schools.length === 3, 'A1 流派数量为3', '实际 ' + schools.length);

const guns = CFG.guns || CFG.weapons || [];
const allTypes = new Set();
for (const g of guns) if (g.type) allTypes.add(g.type);
const covered = new Set();
for (const s of schools) for (const t of (s.types || [])) covered.add(t);
const missType = [...allTypes].filter(t => !covered.has(t));
ok(guns.length > 0, 'A2 武器表非空', '数量 ' + guns.length);
ok(missType.length === 0, 'A3 全部武器type被流派覆盖', '未覆盖: ' + missType.join(','));

/* 交叉覆盖检查：一个 type 只能属于一个流派，否则档位判定会双算 */
const dupType = {};
for (const s of schools) for (const t of (s.types || [])) (dupType[t] = dupType[t] || []).push(s.id);
const dups = Object.keys(dupType).filter(t => dupType[t].length > 1);
ok(dups.length === 0, 'A4 武器type不跨流派重复', '重复: ' + dups.join(','));

/* ── B. schoolBonus 运行时行为（真实调用） ── */
ok(typeof E.schoolBonus === 'function', 'B1 schoolBonus 存在');

/* schoolBonus 的入参口径：p.gun / p.gun2 是【武器 id 字符串】（见 engine.js），
 * 档位结果在 r.active.tier 与 r.tiers[流派id].tier —— 不是顶层 r.tier。 */
const mkP = (typeA, typeB) => {
  const g = t => guns.find(x => x.type === t);
  return { gun: (g(typeA) || {}).id || null, gun2: (g(typeB) || {}).id || null };
};

/* B2 必须【逐个流派】断言，不能"任一命中即通过"——
 * 变异测试证明：只改坏 sustain 的二档时，"任一命中"版本仍全绿，等于没测。 */
const noT2 = [];
for (const s of schools) {
  const r = E.schoolBonus(mkP(s.types[0], s.types[1] || s.types[0]));
  const t = r && r.tiers && r.tiers[s.id];
  if (!(t && t.n === 2 && t.tier === 2)) noT2.push(s.id);
}
ok(noT2.length === 0, 'B2 三套流派主副同流派均拿二档', '未命中: ' + noT2.join(','));

// B3 跨流派：两个流派各拿一档（顶层加成应是两个一档之和）
let hitCross = null;
for (let i = 0; i < schools.length && !hitCross; i++) {
  for (let j = 0; j < schools.length; j++) {
    if (i === j) continue;
    const r = E.schoolBonus(mkP(schools[i].types[0], schools[j].types[0]));
    const a = r && r.tiers && r.tiers[schools[i].id];
    const b = r && r.tiers && r.tiers[schools[j].id];
    if (a && b && a.tier === 1 && b.tier === 1) { hitCross = { i: schools[i].id, j: schools[j].id }; break; }
  }
}
ok(!!hitCross, 'B3 主副跨流派应各拿一档', hitCross ? '' : '未出现两个一档并存');

// B3b 档位加成必须真的体现在数值上（不能档位命中但加成为 0）
let zeroBonus = null;
for (const s of schools) {
  const r = E.schoolBonus(mkP(s.types[0], s.types[1] || s.types[0]));
  if (!r) continue;
  const sum = ['atkPct', 'crit', 'critDmg', 'erPct', 'slow', 'dot']
    .reduce((a, k) => a + (Number(r[k]) || 0), 0);
  if (!(sum > 0)) zeroBonus = s.id;
}
ok(!zeroBonus, 'B3b 二档加成必须大于0', '流派 ' + zeroBonus + ' 加成合计为0');

// B4 空装/脏档不得抛异常且不得给出加成
for (const dirty of [null, undefined, {}, { gun: null, gun2: null },
  { gun: {}, gun2: {} }, { gun: { type: 123 }, gun2: { type: [] } },
  { gun: { type: null }, gun2: { type: '不存在' } }]) {
  let threw = null, r = null;
  try { r = E.schoolBonus(dirty); } catch (e) { threw = String(e.message).slice(0, 60); }
  ok(!threw, 'B4 脏档不抛异常', threw);
  if (r) {
    for (const k of ['atkPct', 'crit', 'critDmg', 'erPct', 'slow', 'dot']) {
      ok(!(typeof r[k] === 'number' && !isFinite(r[k])), 'B5 加成不得为NaN/Inf', k + '=' + r[k]);
    }
  }
}

/* ── C. 第11-15章运行时：关卡可被真实解析 ── */
const levels = CFG.levels || [];
const chNew = levels.filter(l => {
  const c = parseInt(String(l.id).split('-')[0], 10);
  return c >= 11 && c <= 15;
});
ok(chNew.length === 50, 'C1 第11-15章共50关', '实际 ' + chNew.length);

const zombieIds = new Set((CFG.zombies || []).map(z => z.id));
const bossIds = new Set((CFG.bosses || CFG.boss || []).map(b => b.id));
let poolMiss = [], bossMiss = [];
for (const l of chNew) {
  for (const zid of (l.pool || [])) if (!zombieIds.has(zid)) poolMiss.push(l.id + ':' + zid);
  const bs = l.boss;
  if (bs) for (const b of (Array.isArray(bs) ? bs : [bs])) if (!bossIds.has(b)) bossMiss.push(l.id + ':' + b);
}
ok(poolMiss.length === 0, 'C2 新关卡刷怪池全部有效', poolMiss.slice(0, 5).join(','));
ok(bossMiss.length === 0, 'C3 新关卡BOSS全部有效', bossMiss.slice(0, 5).join(','));

/* C4 新僵尸/BOSS 必须真的被用上（不能配了没人用） */
const newZ = ['tz', 'sw', 'jx'].map(k => k);
const usedZ = new Set();
for (const l of levels) for (const z of (l.pool || [])) usedZ.add(z);
/* 分裂产出的僵尸（如 xiaozombie 由 fenlie 的 split 生成）不在关卡池里，
 * 属于合法来源，不能误判为孤儿 —— 见 battle.js 死亡段 z.d.split 分支。 */
const splitSpawn = new Set();
for (const z of (CFG.zombies || [])) {
  if (z.split) {
    const d = (CFG.zombies || []).find(x => x.id === 'xiaozombie');
    if (d) splitSpawn.add(d.id);
  }
}
const orphanZ = [...zombieIds].filter(id => !usedZ.has(id) && !splitSpawn.has(id));
ok(orphanZ.length === 0, 'C4 无僵尸配了却从不刷出', orphanZ.slice(0, 6).join(','));

const usedB = new Set();
for (const l of levels) { const b = l.boss; if (b) for (const x of (Array.isArray(b) ? b : [b])) usedB.add(x); }
const orphanB = [...bossIds].filter(id => !usedB.has(id));
ok(orphanB.length === 0, 'C5 无BOSS配了却从不登场', orphanB.slice(0, 6).join(','));

/* C6 解锁链：第11章首关必须由第10章末关解锁，链上无断裂 */
const byId = {}; for (const l of levels) byId[l.id] = l;
const chainMiss = [];
for (let c = 11; c <= 15; c++) {
  for (let i = 1; i <= 10; i++) {
    const id = c + '-' + i;
    const l = byId[id];
    if (!l) { chainMiss.push(id + ':缺失'); continue; }
    let need;
    if (i === 1) need = (c - 1) + '-10';
    else need = c + '-' + (i - 1);
    const u = l.unlock || l.need;
    if (u && u !== need) chainMiss.push(id + ':应为' + need + '实为' + u);
    if (!byId[need] && !(c === 11 && i === 1)) chainMiss.push(id + ':前置' + need + '不存在');
  }
}
ok(chainMiss.length === 0, 'C6 第11-15章解锁链无断裂', chainMiss.slice(0, 5).join(','));

/* C7 掉落：新关卡必须有奖励（不能白打） */
const noRw = chNew.filter(l => {
  const r = l.rw || l.reward || l.drop;
  return !r || (typeof r === 'object' && Object.keys(r).length === 0);
});
ok(noRw.length === 0, 'C7 新关卡均有通关奖励', noRw.slice(0, 5).map(l => l.id).join(','));

/* C8 强度递增：章节内 mul 单调不降（防止难度倒挂） */
const mulBad = [];
for (let c = 11; c <= 15; c++) {
  let prev = -1;
  for (let i = 1; i <= 10; i++) {
    const l = byId[c + '-' + i]; if (!l) continue;
    const m = Number(l.mul || 0);
    if (m < prev) mulBad.push(c + '-' + i + '(' + prev + '→' + m + ')');
    prev = m;
  }
}
ok(mulBad.length === 0, 'C8 章节内强度单调不降', mulBad.slice(0, 4).join(','));

/* C9 剧情与CG：15章全有开场文案、CG 图存在且不重复 */
const story = CFG.chapterDesc || null;
const missS = [];
for (let c = 1; c <= 15; c++) if (!story || !story[c]) missS.push(c);
ok(missS.length === 0, 'C9 15章过场文案齐全', '缺: ' + missS.join(','));

const cgMap = CFG.chapterCg || {};
const cgImg = CFG.cgImg || {};
const missCg = [], cgNull = [], cgFiles = [];
for (let c = 1; c <= 15; c++) {
  const k = cgMap[c];
  if (!k) { missCg.push(c); continue; }
  const p = cgImg[k];
  if (!p) { cgNull.push(c + ':' + k); continue; }
  cgFiles.push(p.split('?')[0]);
  if (!fs.existsSync(path.join(ROOT, p.split('?')[0]))) cgNull.push(c + ':' + k + '文件缺失');
}
ok(missCg.length === 0, 'C10 15章均配置CG', '缺: ' + missCg.join(','));
ok(cgNull.length === 0, 'C11 CG图文件均存在', cgNull.slice(0, 4).join(','));
/* C12 第10章与第4章不得再共用同一张CG（历史BUG：最终决战过场被提前消费） */
ok(cgMap[10] && cgMap[10] !== cgMap[4], 'C12 第10章CG不再与第4章同图',
  '10章=' + cgMap[10] + ' 4章=' + cgMap[4]);
const cgSet = new Set(cgFiles);
ok(cgSet.size === cgFiles.length, 'C13 15章CG互不重复', '去重后 ' + cgSet.size + '/' + cgFiles.length);

console.log('\n--- PASS ' + PASS + ' / FAIL ' + FAILS.length + ' ---');
process.exit(FAILS.length ? 1 : 0);
