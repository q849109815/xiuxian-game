/* =========================================================
 * systems.js —— 功法 / 丹药 / 炼器 / 符箓 / 灵兽 / 洞府 /
 *               奇遇 / 秘境 / 宗门 / 任务 / 论道 / 市场 / 邮件 / 社交
 * 依赖：js/engine.js、js/api.js
 * ========================================================= */

/* C / CT / SC / E 已在 engine.js 顶层声明，浏览器全局作用域内直接复用（不可重复声明） */
const E = () => window.ENGINE;

/* ============ 一、功法 ============ */
function skillDef(id) { return (CT().skills || []).find((s) => s.id === id); }
function ownSkill(p, id) { return (p.skills || []).find((s) => s.id === id); }
function skillFit(p, sk) {
  const fit = CT().skillFit || { same: 1, any: 0.85, diff: 0.55 };
  if (!sk || sk.root === 'any') return fit.any;
  return sk.root === p.root ? fit.same : fit.diff;
}
function learnSkill(p, id) {
  const sk = skillDef(id); if (!sk) return { ok: false, msg: '功法不存在' };
  if (ownSkill(p, id)) return upgradeSkill(p, id);
  p.skills.push({ id, level: 1, exp: 0 });
  return { ok: true, msg: `习得【${sk.name}】` };
}
function skillUpCost(sk, level) {
  const c = CT().skillUpCost || { stoneBase: 100, stoneGrowth: 1.6 };
  return Math.round(c.stoneBase * Math.pow(c.stoneGrowth, level - 1));
}
function upgradeSkill(p, id) {
  const sk = skillDef(id); if (!sk) return { ok: false, msg: '功法不存在' };
  const own = ownSkill(p, id); if (!own) return learnSkill(p, id);
  if (own.level >= sk.maxLevel) return { ok: false, msg: '已达最高层数' };
  const cost = skillUpCost(sk, own.level);
  if (p.stone < cost) return { ok: false, msg: `灵石不足（参悟需 ${cost}）` };
  p.stone -= cost;
  if (Math.random() < 0.75 + 0.02 * (p.bonusWuxing || 0)) {
    own.level++;
    return { ok: true, msg: `参悟成功！【${sk.name}】提升至 ${own.level} 层` };
  }
  return { ok: false, msg: '参悟失败，心神消耗（灵石已付）' };
}
function equipSkill(p, id) {
  const sk = skillDef(id); if (!sk) return { ok: false, msg: '功法不存在' };
  if (!ownSkill(p, id)) return { ok: false, msg: '尚未习得' };
  const cur = p.equipped || [];
  const conflict = (sk.conflict || []).find((x) => cur.includes(x));
  if (conflict) return { ok: false, msg: `与已装备的【${skillDef(conflict).name}】功法冲突` };
  const sameType = cur.filter((x) => { const s = skillDef(x); return s && s.type === sk.type; });
  const limit = sk.type === 'heart' ? 2 : 3;
  if (sameType.length >= limit) return { ok: false, msg: `${sk.type === 'heart' ? '心法' : '功法'}最多装备 ${limit} 个，请先卸下` };
  if (cur.includes(id)) return { ok: false, msg: '已装备' };
  p.equipped = cur.concat([id]);
  return { ok: true, msg: `装备【${sk.name}】` };
}
function unequipSkill(p, id) {
  const i = (p.equipped || []).indexOf(id);
  if (i < 0) return { ok: false, msg: '未装备' };
  p.equipped.splice(i, 1);
  return { ok: true, msg: '已卸下' };
}
function skillPassive(p) {
  const out = {};
  for (const id of (p.equipped || [])) {
    const sk = skillDef(id); if (!sk || !sk.passive) continue;
    const own = ownSkill(p, id); const lv = own ? own.level : 1;
    const fit = skillFit(p, sk);
    const mul = (1 + (lv - 1) * ((CT().skillUpCost || {}).perLevel || 0.12)) * fit;
    for (const k in sk.passive) out[k] = (out[k] || 0) + sk.passive[k] * mul;
  }
  return out;
}

/* ============ 二、丹药（炼丹） ============ */
function alchemyRate(p) {
  const lv = (p.cave.lv && p.cave.lv.alchemy) || 0;
  const sb = E().sectBuff(p);
  return 1 + lv * 0.05 + (sb.alchemyRate || 0);
}
function refine(p, rid) {
  const r = (CT().alchemy.recipes || []).find((x) => x.id === rid);
  if (!r) return { ok: false, msg: '丹方不存在' };
  for (const k in r.cost) if (!E().hasItem(p, k, r.cost[k])) return { ok: false, msg: '药材不足' };
  const cost = C().pills ? 0 : 0;
  if (p.stone < cost) return { ok: false, msg: '灵石不足' };
  for (const k in r.cost) E().consume(p, k, r.cost[k]);
  const rate = Math.min(0.98, r.rate * alchemyRate(p));
  if (Math.random() < rate) {
    E().addPill(p, r.pill, 1);
    return { ok: true, msg: `炼制成功！获得【${r.name}】`, pill: r.pill, exp: r.exp };
  }
  const boom = (CT().alchemy.failBoom || 0.25) / alchemyRate(p);
  if (Math.random() < boom) return { ok: false, msg: '💥 炸丹！丹炉震动，药材尽毁', boom: true };
  return { ok: false, msg: '炼丹失败，药材损耗', exp: Math.round((r.exp || 0) * 0.3) };
}

/* ============ 三、炼器 / 制符 ============ */
function forgeRate(p) {
  const lv = (p.cave.lv && p.cave.lv.forge) || 0;
  const sb = E().sectBuff(p);
  return 1 + lv * 0.05 + (sb.forgeRate || 0);
}
function forge(p, rid) {
  const r = (CT().forge.recipes || []).find((x) => x.id === rid);
  if (!r) return { ok: false, msg: '图样不存在' };
  for (const k in r.cost) if (!E().hasItem(p, k, r.cost[k])) return { ok: false, msg: '矿石不足' };
  for (const k in r.cost) E().consume(p, k, r.cost[k]);
  const rate = Math.min(0.98, r.rate * forgeRate(p));
  if (Math.random() < rate) {
    const it = { id: 'it_' + Math.random().toString(36).slice(2, 9), kind: 'equip', slot: r.slot, q: r.q, level: 0, temper: 0,
      name: `${C().qualities[r.q].name}·${r.name}`, atk: r.base.atk || 0, def: r.base.def || 0, hp: r.base.hp || 0, crit: r.base.crit || 0, mp: 20 };
    E().addItem(p, it);
    return { ok: true, msg: `打造成功！【${it.name}】`, item: it };
  }
  if (Math.random() < (CT().forge.failBoom || 0.3) / forgeRate(p)) return { ok: false, msg: '💥 炉毁器崩，材料全损', boom: true };
  return { ok: false, msg: '炼器失败，材料损耗' };
}
function makeTalisman(p, tid) {
  const t = (CT().talismans || []).find((x) => x.id === tid);
  if (!t) return { ok: false, msg: '符箓不存在' };
  for (const k in t.cost) if (!E().hasItem(p, k, t.cost[k])) return { ok: false, msg: '材料不足' };
  for (const k in t.cost) E().consume(p, k, t.cost[k]);
  E().addItem(p, { id: 'tl_' + Math.random().toString(36).slice(2, 9), kind: 'talisman', ref: t.id, name: t.name, icon: t.icon, desc: t.desc, price: 150, count: 1 });
  return { ok: true, msg: `制符成功！【${t.name}】` };
}
function useTalisman(p, tid) {
  const t = (CT().talismans || []).find((x) => x.id === tid);
  if (!t) return { ok: false, msg: '符箓不存在' };
  if (!E().hasItem(p, tid, 1)) return { ok: false, msg: '符箓不足' };
  E().consume(p, tid, 1);
  return { ok: true, msg: `${t.name} 已激活：${t.desc}`, talisman: t };
}

/* ============ 四、灵兽 ============ */
function createBeast(refId) {
  const base = (CT().beasts || []).find((x) => x.id === refId);
  if (!base) return null;
  return { id: 'bs_' + Math.random().toString(36).slice(2, 9), ref: refId, name: base.name, level: 1, exp: 0, stage: 0, apt: (CT().beast || {}).aptBase || 1 };
}
function captureBeast(p, refId) {
  const cfg = CT().beast || {};
  const luck = E().rootInfo(p).luck || 1;
  const rate = Math.min(0.95, (cfg.captureRate || 0.55) * luck);
  if (Math.random() < rate) {
    const b = createBeast(refId);
    p.beasts.push(b);
    if (p.activeBeast === undefined || p.activeBeast < 0) p.activeBeast = p.beasts.length - 1;
    return { ok: true, msg: `捕捉成功！获得灵兽【${b.name}】`, beast: b };
  }
  return { ok: false, msg: '捕捉失败，灵兽挣脱逃走' };
}
function feedBeast(p, idx, itemId) {
  const b = p.beasts[idx]; if (!b) return { ok: false, msg: '灵兽不存在' };
  const it = p.bag.find((x) => x.id === itemId); if (!it) return { ok: false, msg: '材料不存在' };
  const cfg = CT().beast || {};
  const gain = (it.kind === 'herb' ? cfg.feedExpPerHerb : cfg.feedExpPerMat) * (it.count || 1);
  p.bag = p.bag.filter((x) => x.id !== itemId);
  b.exp += gain;
  b.apt = Math.min(cfg.aptMax || 3, (b.apt || 1) + (cfg.aptPerDevour || 0.05));
  let up = 0;
  while (b.exp >= E().beastExpNeed(b) && (b.level || 1) < (cfg.maxLevel || 20)) { b.exp -= E().beastExpNeed(b); b.level++; up++; }
  return { ok: true, msg: `吞噬 ${it.name}，${b.name} +${gain} 经验，资质 ${b.apt.toFixed(2)}${up ? `，连升 ${up} 级！` : ''}`, up };
}
function advanceBeast(p, idx) {
  const b = p.beasts[idx]; if (!b) return { ok: false, msg: '灵兽不存在' };
  const cfg = CT().beast || {};
  const st = b.stage || 0;
  if (st >= (cfg.maxStage || 5)) return { ok: false, msg: '已达最高阶' };
  const needLv = (cfg.advanceAt || [5, 9, 13, 17, 20])[st];
  if ((b.level || 1) < needLv) return { ok: false, msg: `需等级 ${needLv} 才能进阶` };
  const cost = (cfg.advanceCost || [300, 1200, 4000, 12000, 40000])[st];
  if (p.stone < cost) return { ok: false, msg: `灵石不足（需 ${cost}）` };
  p.stone -= cost;
  if (Math.random() < 0.7) { b.stage = st + 1; return { ok: true, msg: `【${b.name}】进阶成功！第 ${b.stage} 阶` }; }
  return { ok: false, msg: '进阶失败，灵兽受创' };
}
function setActiveBeast(p, idx) {
  if (idx < 0 || idx >= p.beasts.length) { p.activeBeast = -1; return { ok: true, msg: '已撤回灵兽' }; }
  p.activeBeast = idx;
  return { ok: true, msg: `【${p.beasts[idx].name}】出战` };
}
function toggleRide(p) {
  const b = E().activeBeast(p);
  if (!b) return { ok: false, msg: '没有出战灵兽' };
  const st = E().beastStats(b);
  if (!st.ride) return { ok: false, msg: `${st.name} 不可骑乘` };
  p.riding = !p.riding;
  return { ok: true, msg: p.riding ? `骑乘【${st.name}】，身法提升` : '已下坐骑' };
}
function releaseBeast(p, idx) {
  const b = p.beasts[idx]; if (!b) return { ok: false, msg: '灵兽不存在' };
  const price = 200 * (1 + (b.level || 1)) + (b.stage || 0) * 500;
  p.beasts.splice(idx, 1);
  if (p.activeBeast >= p.beasts.length) p.activeBeast = p.beasts.length - 1;
  p.stone += price;
  return { ok: true, msg: `放归【${b.name}】，获得 ${price} 灵石` };
}

/* ============ 五、洞府 ============ */
function buildingDef(id) { return (C().cave.buildings || []).find((b) => b.id === id); }
function buildingCost(p, id) {
  const b = buildingDef(id); if (!b) return Infinity;
  const lv = (p.cave.lv[id] || 0);
  if (lv >= b.maxLevel) return Infinity;
  return Math.round(b.costBase * Math.pow(b.costGrowth, lv));
}
function upgradeBuilding(p, id) {
  const b = buildingDef(id); if (!b) return { ok: false, msg: '建筑不存在' };
  const cost = buildingCost(p, id);
  if (cost === Infinity) return { ok: false, msg: '已达最高等级' };
  if (p.stone < cost) return { ok: false, msg: `灵石不足（需 ${cost}）` };
  p.stone -= cost;
  p.cave.lv[id] = (p.cave.lv[id] || 0) + 1;
  return { ok: true, msg: `【${b.name}】升至 ${p.cave.lv[id]} 级`, level: p.cave.lv[id] };
}
function harvestCave(p) {
  const now = Date.now();
  const hrs = (now - (p.cave.lastHarvest || now)) / 3600000;
  if (hrs < 0.01) return { ok: false, msg: '暂无产出' };
  const cap = 24;
  const h = Math.min(hrs, cap);
  const stone = Math.round(E().caveOutputPerHour(p, 'stone') * h);
  const herb = Math.round(E().caveOutputPerHour(p, 'herb') * h);
  p.cave.lastHarvest = now;
  if (stone <= 0 && herb <= 0) return { ok: false, msg: '尚无产出建筑，先升级灵田/药园' };
  if (stone > 0) p.stone += stone;
  if (herb > 0) E().addHerb(p, 'herb_green', herb);
  return { ok: true, msg: `收获 ${Math.round(h * 60)} 分钟产出：灵石 ${stone}${herb ? `、灵草 ${herb}` : ''}`, stone, herb };
}
function setArray(p, id) {
  const a = (C().cave.arrays || []).find((x) => x.id === id);
  if (!a) return { ok: false, msg: '阵法不存在' };
  if ((a.cost || 0) > 0 && p.stone < a.cost) return { ok: false, msg: `灵石不足（需 ${a.cost}）` };
  if ((a.cost || 0) > 0) p.stone -= a.cost;
  p.cave.array = id;
  return { ok: true, msg: `洞府布置【${a.name}】：${a.desc}` };
}

/* ============ 六、奇遇 / 秘境 ============ */
function rollEncounter(p, mapIndex) {
  const cfg = C();
  if (Math.random() > (cfg.encounterChance || 0.12) * (E().rootInfo(p).luck || 1)) return null;
  const list = cfg.encounters || [];
  const total = list.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  let hit = list[0];
  for (const e of list) { r -= (e.weight || 1); if (r <= 0) { hit = e; break; } }
  const out = { ...hit };
  if (hit.type === 'reward') {
    if (hit.stone) { const s = Math.round(hit.stone[0] + Math.random() * (hit.stone[1] - hit.stone[0])); p.stone += s; out.gotStone = s; }
    if (hit.exp) { const e = Math.round(hit.exp[0] + Math.random() * (hit.exp[1] - hit.exp[0])); E().gainExp(p, e); out.gotExp = e; }
    if (hit.herb) { const map = cfg.maps[mapIndex]; const id = (map && map.herbs && map.herbs[0]) || 'herb_green'; E().addHerb(p, id, hit.herb); out.gotHerb = id; }
    if (hit.ore) { const map = cfg.maps[mapIndex]; const id = (map && map.ores && map.ores[0]) || 'ore_iron'; E().addOre(p, id, hit.ore); out.gotOre = id; }
  }
  if (hit.type === 'beast') {
    const map = cfg.maps[mapIndex];
    const pool = (CT().beasts || []).filter((b) => b.tier <= Math.max(1, Math.ceil((mapIndex + 1) * 1.2)));
    const b = pool[Math.floor(Math.random() * pool.length)];
    out.beastRef = b ? b.id : null; out.beastName = b ? b.name : '灵兽';
  }
  if (hit.type === 'chat') out.line = hit.lines[Math.floor(Math.random() * hit.lines.length)];
  p.stats.encounters = (p.stats.encounters || 0) + 1;
  return out;
}

function dungeonDef(id) { return (C().dungeons || []).find((d) => d.id === id); }
/** 秘境：连续多波 + BOSS，返回结果与逐波日志 */
function runDungeon(p, did) {
  const d = dungeonDef(did);
  if (!d) return { ok: false, msg: '秘境不存在' };
  if (p.realm < d.minRealm) return { ok: false, msg: `需【${C().realms[d.minRealm].name}】境` };
  const a = E().attrs(p);
  let hp = a.hp;
  const rounds = [];
  // 按秘境所需境界匹配对应强度的地图怪物
  let mapIdx = 0;
  C().maps.forEach((m, i) => { if (m.minRealm <= d.minRealm) mapIdx = i; });
  for (let w = 0; w < d.waves; w++) {
    const m = C().maps[mapIdx].monsters[Math.floor(Math.random() * C().maps[mapIdx].monsters.length)];
    const mon = { ...m, hp: Math.round(m.hp * (1 + p.realm * 0.1) * (1 + w * 0.12)) };
    const res = E().battle(p, mon, mapIdx);
    hp = res.php;
    rounds.push({ wave: w + 1, monster: mon.name, icon: mon.icon, win: res.win, round: res.round });
    if (!res.win) break;
    // 每波胜利后调息，恢复 35% 气血（秘境允许喘息）
    hp = Math.min(a.hp, Math.round(hp + a.hp * 0.35));
    rounds[rounds.length - 1].rest = true;
  }
  let win = rounds.length === d.waves && rounds[rounds.length - 1].win;
  if (win) {
    const boss = { ...d.boss, hp: Math.round(d.boss.hp * (1 + p.realm * 0.08)), atk: Math.round(d.boss.atk * (1 + p.realm * 0.06)) };
    const res = E().battle(p, boss, mapIdx);
    hp = res.php;
    win = res.win;
    rounds.push({ wave: 'BOSS', monster: boss.name, icon: boss.icon, win: res.win, round: res.round });
  }
  const out = { ok: true, win, rounds, hpLeft: hp };
  if (win) {
    const rw = d.reward || {};
    if (rw.stone) p.stone += rw.stone;
    if (rw.exp) E().gainExp(p, rw.exp);
    if (rw.herb) E().addHerb(p, (C().maps[mapIdx].herbs || ['herb_green'])[0], rw.herb);
    if (rw.ore) E().addOre(p, (C().maps[mapIdx].ores || ['ore_iron'])[0], rw.ore);
    if (rw.skill) {
      const pool = (CT().skills || []).filter((s) => s.type === 'art');
      const sk = pool[Math.floor(Math.random() * pool.length)];
      if (sk) { learnSkill(p, sk.id); out.skill = sk.name; }
    }
    if (rw.beast) {
      const pool = (CT().beasts || []).filter((b) => b.tier >= 3);
      const b = pool[Math.floor(Math.random() * pool.length)];
      if (b) { const nb = createBeast(b.id); p.beasts.push(nb); out.beast = nb.name; }
    }
    p.stats.dungeon = (p.stats.dungeon || 0) + 1;
    out.reward = rw;
  }
  return out;
}

/* ============ 七、任务 ============ */
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function refreshDaily(p) {
  const t = todayStr();
  if (p.tasks.daily.date !== t) { p.tasks.daily = { date: t, prog: {}, claimed: [] }; }
}
function taskProgress(p, type, n = 1) {
  refreshDaily(p);
  p.tasks.daily.prog[type] = (p.tasks.daily.prog[type] || 0) + n;
  const bi = `bounty`;
  p.tasks.bounty.prog[type] = (p.tasks.bounty.prog[type] || 0) + n;
}
function mainTaskOf(p) { return (SC().tasks.main || [])[p.tasks.mainIdx || 0] || null; }
function checkMain(p) {
  const t = mainTaskOf(p);
  if (!t) return null;
  if (t.type === 'realm' && (p.realm > t.realm || (p.realm === t.realm && p.stage >= t.stage))) return t;
  return null;
}
function claimMain(p) {
  const t = checkMain(p);
  if (!t) return { ok: false, msg: '主线尚未完成' };
  applyReward(p, t.reward);
  p.tasks.mainIdx = (p.tasks.mainIdx || 0) + 1;
  return { ok: true, msg: `完成【${t.name}】，奖励已发放` };
}
function dailyList(p) {
  refreshDaily(p);
  return (SC().tasks.daily || []).map((t) => ({ ...t, prog: p.tasks.daily.prog[t.type] || 0, done: (p.tasks.daily.prog[t.type] || 0) >= t.need, claimed: p.tasks.daily.claimed.includes(t.id) }));
}
function claimDaily(p, id) {
  refreshDaily(p);
  const t = (SC().tasks.daily || []).find((x) => x.id === id);
  if (!t) return { ok: false, msg: '任务不存在' };
  if ((p.tasks.daily.prog[t.type] || 0) < t.need) return { ok: false, msg: '尚未完成' };
  if (p.tasks.daily.claimed.includes(id)) return { ok: false, msg: '已领取' };
  p.tasks.daily.claimed.push(id);
  applyReward(p, t.reward);
  return { ok: true, msg: `领取【${t.name}】奖励` };
}
function bountyList(p) {
  return (SC().tasks.bounty || []).map((t) => ({ ...t, prog: p.tasks.bounty.prog[t.id] || 0, done: (p.tasks.bounty.prog[t.id] || 0) >= t.need, claimed: p.tasks.bounty.claimed.includes(t.id) }));
}
function claimBounty(p, id) {
  const t = (SC().tasks.bounty || []).find((x) => x.id === id);
  if (!t) return { ok: false, msg: '悬赏不存在' };
  if ((p.tasks.bounty.prog[id] || 0) < t.need) return { ok: false, msg: '尚未完成' };
  if (p.tasks.bounty.claimed.includes(id)) return { ok: false, msg: '已领取' };
  p.tasks.bounty.claimed.push(id);
  applyReward(p, t.reward);
  return { ok: true, msg: `领取【${t.name}】赏金` };
}
function applyReward(p, rw) {
  if (!rw) return;
  if (rw.stone) p.stone += rw.stone;
  if (rw.exp) E().gainExp(p, rw.exp);
  if (rw.herb) E().addHerb(p, 'herb_green', rw.herb);
  if (rw.ore) E().addOre(p, 'ore_iron', rw.ore);
  if (rw.skill) learnSkill(p, rw.skill);
  if (rw.pill) E().addPill(p, rw.pill, rw.count || 1);
  if (rw.beast === 'random') { const pool = CT().beasts || []; const b = createBeast(pool[Math.floor(Math.random() * pool.length)].id); p.beasts.push(b); }
  if (rw.rename) p.buffs.rename = (p.buffs.rename || 0) + rw.rename;
  if (rw.contrib && p.sectInfo) p.sectInfo.contrib = (p.sectInfo.contrib || 0) + rw.contrib;
}

/* ============ 八、宗门（共享文件 data/sects.json） ============ */
const SECT_PATH = 'data/sects.json';
async function loadSects() {
  try {
    const d = await readJSON(SECT_PATH, { useCache: true });
    if (d && d.list) return d.list;
  } catch (e) { /* ignore */ }
  const base = (SC().sects || []).map((s) => ({ ...s, members: 0, level: 1, notice: s.desc, leader: null, createdAt: 0 }));
  return base;
}
async function joinSect(p, sid) {
  const list = await loadSects();
  const s = list.find((x) => x.id === sid);
  if (!s) return { ok: false, msg: '宗门不存在' };
  if (p.sect) return { ok: false, msg: '请先退出当前宗门' };
  if (s.levelReq && p.realm < s.levelReq) return { ok: false, msg: `需【${C().realms[s.levelReq].name}】境` };
  p.sect = sid;
  p.sectInfo = { id: sid, rankIdx: 0, contrib: 0, joinedAt: Date.now() };
  await mutateShared(SECT_PATH, (d) => {
    const cur = d && d.list ? d.list : list;
    const t = cur.find((x) => x.id === sid);
    if (t) t.members = (t.members || 0) + 1;
    return { updatedAt: new Date().toISOString(), list: cur };
  }, `join sect ${sid}`).catch(() => {});
  return { ok: true, msg: `加入【${s.name}】` };
}
async function createSect(p, name, rootId) {
  const cost = SC().sectCreateCost || 3000;
  if (p.sect) return { ok: false, msg: '请先退出当前宗门' };
  if (p.stone < cost) return { ok: false, msg: `灵石不足（开宗需 ${cost}）` };
  if (!name || name.length < 2) return { ok: false, msg: '宗门名至少 2 字' };
  p.stone -= cost;
  const id = 's_' + Math.random().toString(36).slice(2, 8);
  const s = { id, name, icon: '🏯', root: rootId || p.root, desc: '新立宗门', buff: { atk: 0.05 }, levelReq: 0, members: 1, level: 1, notice: '宗主立派，广纳门徒', leader: p.name, createdAt: Date.now() };
  await mutateShared(SECT_PATH, (d) => {
    const cur = (d && d.list) ? d.list : [];
    cur.push(s);
    return { updatedAt: new Date().toISOString(), list: cur };
  }, `create sect ${name}`).catch(() => {});
  p.sect = id;
  p.sectInfo = { id, rankIdx: 4, contrib: 0, joinedAt: Date.now() };
  return { ok: true, msg: `开宗立派！【${name}】成立` };
}
async function leaveSect(p) {
  if (!p.sect) return { ok: false, msg: '未加入宗门' };
  const sid = p.sect;
  p.sect = null; p.sectInfo = null;
  await mutateShared(SECT_PATH, (d) => {
    const cur = (d && d.list) ? d.list : [];
    const t = cur.find((x) => x.id === sid);
    if (t) t.members = Math.max(0, (t.members || 0) - 1);
    return { updatedAt: new Date().toISOString(), list: cur };
  }, `leave sect ${sid}`).catch(() => {});
  return { ok: true, msg: '已退出宗门' };
}
function sectRankName(p) {
  const ranks = SC().sectRanks || [];
  return ranks[(p.sectInfo && p.sectInfo.rankIdx) || 0] || '弟子';
}
function doSectTask(p, tid) {
  if (!p.sect) return { ok: false, msg: '未加入宗门' };
  const t = (SC().sectTaskRewards || []).find((x) => x.id === tid);
  if (!t) return { ok: false, msg: '任务不存在' };
  if (t.type === 'kill' && !E().hasItem(p, '__kill', t.need)) {
    // 以当日击杀数近似
  }
  if (t.type === 'stone') {
    if (p.stone < t.need) return { ok: false, msg: '灵石不足' };
    p.stone -= t.need;
  }
  if (t.type === 'herb') {
    let ok = true;
    for (const h of ['herb_green', 'herb_soul', 'herb_fire', 'herb_dark', 'herb_immortal']) {
      if (E().hasItem(p, h, t.need)) { E().consume(p, h, t.need); ok = false; break; }
    }
    if (ok) return { ok: false, msg: `需要 ${t.need} 株灵草` };
  }
  p.sectInfo.contrib = (p.sectInfo.contrib || 0) + t.contrib;
  if (t.stone) p.stone += t.stone;
  if (t.exp) E().gainExp(p, t.exp);
  return { ok: true, msg: `完成【${t.name}】，宗门贡献 +${t.contrib}` };
}
function buySectShop(p, sid) {
  if (!p.sect) return { ok: false, msg: '未加入宗门' };
  const it = (SC().sectShop || []).find((x) => x.id === sid);
  if (!it) return { ok: false, msg: '商品不存在' };
  if ((p.sectInfo.contrib || 0) < it.contrib) return { ok: false, msg: '贡献不足' };
  p.sectInfo.contrib -= it.contrib;
  applyReward(p, it.give);
  return { ok: true, msg: `兑换【${it.name}】` };
}

/* ============ 九、论道台（对战榜单快照） ============ */
function arenaTier(score) {
  const tiers = SC().arena.tiers || [];
  let cur = tiers[0];
  for (const t of tiers) if (score >= t.min) cur = t;
  return cur;
}
function arenaPickOpponent(list, p) {
  if (!list || !list.length) return null;
  const me = p.arena.score || 0;
  const pool = list.filter((x) => x.uid !== p.uid);
  if (!pool.length) return null;
  pool.sort((a, b) => Math.abs(a.power - (window.__mypower || 0)) - Math.abs(b.power - (window.__mypower || 0)));
  const idx = Math.min(pool.length - 1, Math.floor(Math.random() * Math.min(5, pool.length)));
  return pool[idx];
}
function arenaFight(p, opp) {
  const cfg = SC().arena || {};
  const t = todayStr();
  if (p.arena.dayDate !== t) { p.arena.dayDate = t; p.arena.fights = 0; }
  if (p.arena.fights >= (cfg.maxPerDay || 20)) return { ok: false, msg: '今日论道次数已用尽' };
  p.arena.fights++;
  const mon = { name: opp.name, icon: '🧙', hp: Math.round((opp.power || 100) * 2.2), atk: Math.round((opp.power || 100) * 0.16), def: Math.round((opp.power || 100) * 0.1), speed: 12, dodge: 0.08 };
  const res = E().battle(p, mon, Math.min(4, p.realm));
  const out = { ...res, opp, rounds: res.logs.length };
  if (res.win) {
    p.arena.score = Math.max(0, (p.arena.score || 0) + (cfg.winScore || 20));
    p.arena.wins++;
    p.stone += (cfg.winStone || 120);
    E().gainExp(p, cfg.winExp || 400);
  } else {
    p.arena.score = Math.max(0, (p.arena.score || 0) + (cfg.loseScore || -8));
    p.arena.losses++;
  }
  return { ok: true, ...out };
}

/* ============ 十、市场（共享文件 data/market.json） ============ */
const MARKET_PATH = 'data/market.json';
async function marketList() {
  try {
    const d = await readJSON(MARKET_PATH, { useCache: true });
    return (d && d.list) ? d.list : [];
  } catch (e) { return []; }
}
async function marketSell(p, itemId, price) {
  const it = p.bag.find((x) => x.id === itemId);
  if (!it) return { ok: false, msg: '物品不存在' };
  if (it.kind === 'equip' && (p.equip[it.slot] === it)) return { ok: false, msg: '已装备的物品不能出售' };
  const cfg = SC().market || {};
  const list = await marketList();
  if (list.filter((x) => x.seller === p.uid).length >= (cfg.maxList || 8)) return { ok: false, msg: '挂单已达上限' };
  p.bag = p.bag.filter((x) => x.id !== itemId);
  const entry = { id: 'mk_' + Math.random().toString(36).slice(2, 9), seller: p.uid, sellerName: p.name, item: it, price: Math.max(1, Math.round(price)), at: Date.now() };
  await mutateShared(MARKET_PATH, (d) => {
    const cur = (d && d.list) ? d.list : [];
    cur.push(entry);
    return { updatedAt: new Date().toISOString(), list: cur };
  }, `market sell by ${p.name}`);
  return { ok: true, msg: `已挂单【${it.name}】，售价 ${entry.price} 灵石` };
}
async function marketBuy(p, mid) {
  const list = await marketList();
  const e = list.find((x) => x.id === mid);
  if (!e) return { ok: false, msg: '商品不存在' };
  if (e.seller === p.uid) return { ok: false, msg: '不能购买自己的商品' };
  if (p.stone < e.price) return { ok: false, msg: '灵石不足' };
  p.stone -= e.price;
  E().addItem(p, { ...e.item, id: 'i_' + Math.random().toString(36).slice(2, 9) });
  await mutateShared(MARKET_PATH, (d) => {
    const cur = (d && d.list) ? d.list : [];
    const t = cur.find((x) => x.id === mid);
    if (t) { t.sold = true; t.buyer = p.uid; t.buyerName = p.name; }
    return { updatedAt: new Date().toISOString(), list: cur };
  }, `market buy by ${p.name}`);
  return { ok: true, msg: `购入【${e.item.name}】，花费 ${e.price} 灵石` };
}
async function marketCancel(p, mid) {
  let got = null;
  await mutateShared(MARKET_PATH, (d) => {
    const cur = (d && d.list) ? d.list : [];
    const i = cur.findIndex((x) => x.id === mid && x.seller === p.uid);
    if (i < 0) return undefined;
    got = cur[i].item;
    cur.splice(i, 1);
    return { updatedAt: new Date().toISOString(), list: cur };
  }, `market cancel ${mid}`);
  if (got) { E().addItem(p, { ...got, id: 'i_' + Math.random().toString(36).slice(2, 9) }); return { ok: true, msg: '已撤单，物品回到背包' }; }
  return { ok: false, msg: '撤单失败' };
}

/* ============ 十一、聊天 ============ */
const CHAT_PATH = 'data/chat.json';
function chatCooldownLeft(p) {
  return Math.max(0, Math.ceil(((p.lastChatAt || 0) + (SC().chat.cooldownSeconds || 15) * 1000 - Date.now()) / 1000));
}
async function chatSend(p, text) {
  const cd = chatCooldownLeft(p);
  if (cd > 0) return { ok: false, msg: `发言冷却中（${cd} 秒）` };
  const t = String(text || '').trim().slice(0, 60);
  if (!t) return { ok: false, msg: '请输入内容' };
  p.lastChatAt = Date.now();
  await mutateShared(CHAT_PATH, (d) => {
    const cur = (d && d.list) ? d.list : [];
    cur.unshift({ uid: p.uid, name: p.name, avatar: p.avatar, realm: E().realmName(p), text: t, at: Date.now() });
    return { updatedAt: new Date().toISOString(), list: cur.slice(0, (SC().chat.maxMessages || 60)) };
  }, `chat ${p.name}`);
  return { ok: true, msg: '已发送' };
}
async function chatLoad() {
  try { const d = await readJSON(CHAT_PATH, { useCache: true }); return (d && d.list) ? d.list : []; } catch (e) { return []; }
}

/* ============ 十二、邮件 ============ */
function addMail(p, mail) {
  if (!Array.isArray(p.mail)) p.mail = [];
  p.mail.unshift({ id: 'm_' + Math.random().toString(36).slice(2, 9), at: Date.now(), read: false, ...mail });
  p.mail = p.mail.slice(0, (SC().mail.maxKeep || 30));
}
function claimMail(p, mid) {
  const m = (p.mail || []).find((x) => x.id === mid);
  if (!m) return { ok: false, msg: '邮件不存在' };
  if (m.claimed) return { ok: false, msg: '已领取' };
  if (!m.reward) { m.read = true; return { ok: true, msg: '已读' }; }
  m.claimed = true; m.read = true;
  applyReward(p, m.reward);
  return { ok: true, msg: `领取附件：${m.title || '奖励'}` };
}

/* ============ 十三、道侣 / 师徒 ============ */
async function bindDaoLv(p, targetName) {
  if (p.dao.partner) return { ok: false, msg: '已有道侣' };
  const uid = hashUid(targetName);
  const path = playerPath(uid);
  let t = null;
  try { t = await readJSON(path, { useCache: false }); } catch (e) { t = null; }
  if (!t) return { ok: false, msg: '未找到该道友' };
  if (t.dao && t.dao.partner && t.dao.partner !== p.uid) return { ok: false, msg: '对方已有道侣' };
  p.dao.partner = uid; p.dao.partnerName = t.name || targetName;
  return { ok: true, msg: `与【${t.name || targetName}】结为道侣，双修加成生效` };
}
async function bindMaster(p, targetName) {
  if (p.dao.master) return { ok: false, msg: '已有师尊' };
  const uid = hashUid(targetName);
  let t = null;
  try { t = await readJSON(playerPath(uid), { useCache: false }); } catch (e) { t = null; }
  if (!t) return { ok: false, msg: '未找到该道友' };
  p.dao.master = uid; p.dao.masterName = t.name || targetName;
  return { ok: true, msg: `拜【${t.name || targetName}】为师` };
}

window.SYS = {
  skillDef, ownSkill, skillFit, learnSkill, upgradeSkill, equipSkill, unequipSkill, skillPassive, skillUpCost,
  refine, alchemyRate, forge, forgeRate, makeTalisman, useTalisman,
  createBeast, captureBeast, feedBeast, advanceBeast, setActiveBeast, toggleRide, releaseBeast,
  buildingDef, buildingCost, upgradeBuilding, harvestCave, setArray,
  rollEncounter, dungeonDef, runDungeon,
  todayStr, refreshDaily, taskProgress, mainTaskOf, checkMain, claimMain, dailyList, claimDaily, bountyList, claimBounty, applyReward,
  loadSects, joinSect, createSect, leaveSect, sectRankName, doSectTask, buySectShop,
  arenaTier, arenaPickOpponent, arenaFight,
  marketList, marketSell, marketBuy, marketCancel,
  chatSend, chatLoad, chatCooldownLeft,
  addMail, claimMail, bindDaoLv, bindMaster,
  SECT_PATH, MARKET_PATH, CHAT_PATH,
};
