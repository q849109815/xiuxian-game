/* =========================================================
 * engine.js v2 —— 角色 / 属性 / 境界 / 修炼 / 战斗 / 物品
 * 数据全部来自云端 data/config/*.json
 * ========================================================= */

const C = () => window.GAME_CONFIG;
const CT = () => window.GAME_CONTENT || {};
const SC = () => window.GAME_SOCIAL || {};

function newPlayer(name, uid, opt = {}) {
  return {
    uid, name, pwd: null,
    gender: opt.gender || 'm',
    avatar: opt.avatar || '🧙',
    root: opt.root || 'mixed',
    sect: opt.sect || null,
    createdAt: Date.now(), lastSeen: Date.now(), lastTick: Date.now(),
    realm: 0, stage: 0, exp: 0,
    stone: 200,
    equip: { weapon: null, armor: null, ring: null, talisman: null },
    bag: [],
    skills: [], equipped: [],
    beasts: [], activeBeast: -1, riding: false,
    cave: { lv: {}, array: 'none', lastHarvest: Date.now(), store: {} },
    tasks: { mainIdx: 0, daily: { date: '', prog: {}, claimed: [] }, bounty: { prog: {}, claimed: [] } },
    sectInfo: null,
    arena: { score: 0, wins: 0, losses: 0, dayDate: '', fights: 0 },
    mail: [],
    karma: 0,
    dao: { partner: null, master: null, apprentices: [] },
    reinc: 0,
    spot: 'valley',
    buffs: { pillAtk: 0, pillExpUntil: 0, rename: 0 },
    codes: [], banned: false, title: '',
    stats: { kills: 0, deaths: 0, battles: 0, breakthrough: 0, offlineMin: 0, meditate: 0, dungeon: 0, encounters: 0, rob: 0 },
  };
}

/** 老存档迁移：layer(9层) → stage(4阶)，补齐新字段 */
function migrate(p) {
  if (!p) return p;
  if (p.stage === undefined && p.layer !== undefined) p.stage = Math.min(3, Math.floor((p.layer || 0) / 3));
  delete p.layer;
  const d = newPlayer(p.name || '无名', p.uid);
  for (const k in d) if (p[k] === undefined) p[k] = d[k];
  if (!p.cave) p.cave = d.cave;
  if (!p.cave.lv) p.cave.lv = {};
  if (!p.cave.store) p.cave.store = {};
  if (!p.tasks) p.tasks = d.tasks;
  if (!p.arena) p.arena = d.arena;
  if (!p.dao) p.dao = d.dao;
  if (!p.buffs) p.buffs = d.buffs;
  if (!p.stats) p.stats = d.stats;
  if (!p.equip) p.equip = d.equip;
  if (p.equip.talisman === undefined) p.equip.talisman = null;
  if (!Array.isArray(p.mail)) p.mail = [];
  if (!Array.isArray(p.skills)) p.skills = [];
  if (!Array.isArray(p.equipped)) p.equipped = [];
  if (!Array.isArray(p.beasts)) p.beasts = [];
  if (!p.root) p.root = 'mixed';
  if (!p.spot) p.spot = 'valley';
  if (p.reinc === undefined) p.reinc = 0;
  if (p.karma === undefined) p.karma = 0;
  return p;
}

/* ---------- 灵根 ---------- */
function rootInfo(p) {
  const rs = C().roots;
  return rs.find((r) => r.id === p.root) || rs.find((r) => r.id === 'mixed');
}
function rollRoot() {
  const cfg = C(), w = cfg.rootWeights || {};
  const ids = cfg.roots.map((r) => r.id);
  const total = ids.reduce((s, id) => s + (w[id] || 1), 0);
  let r = Math.random() * total;
  for (const id of ids) { r -= (w[id] || 1); if (r <= 0) return id; }
  return 'mixed';
}

/* ---------- 境界 ---------- */
function realmName(p) {
  const r = C().realms[p.realm];
  return `${r.name}${C().stages[p.stage]}`;
}
function expNeed(p) {
  const rs = C().realms, r = rs[p.realm];
  return Math.round(r.expBase * Math.pow(r.expGrowth, p.realm * C().stages.length + p.stage));
}
function totalExp(p) {
  let e = p.exp || 0;
  const rs = C().realms, N = C().stages.length;
  for (let i = 0; i < p.realm; i++) e += N * rs[i].expBase * Math.pow(rs[i].expGrowth, i * N + N / 2);
  return Math.round(e);
}
function power(p) {
  const a = attrs(p);
  return Math.round((a.atk * 3 + a.def * 2.4 + a.hp * 0.5 + a.mp * 0.3 + a.crit * 220 + a.critDmg * 60 + a.speed * 4) * (1 + p.realm * 0.28));
}

/* ---------- 属性 ---------- */
function attrs(p) {
  const cfg = C(), b = cfg.baseAttr;
  const gr = cfg.growthPerRealm, gs = cfg.growthPerStage;
  const a = {};
  for (const k in b) a[k] = b[k] + (gr[k] || 0) * p.realm + (gs[k] || 0) * p.stage;

  // 灵根
  const rt = rootInfo(p);
  a.atk *= (rt.atkMul || 1); a.def *= (rt.defMul || 1); a.hp *= 1 + ((rt.expMul || 1) - 1) * 0.3;
  a.luck = rt.luck || 1;

  // 功法被动（含灵根适配度）
  const pass = skillPassive(p);
  for (const k in pass) {
    if (k === 'exp') continue;
    a[k] = (a[k] || 0) * (1 + pass[k]) + (pass['flat_' + k] || 0);
  }

  // 宗门
  const sb = sectBuff(p);
  for (const k in sb) if (k !== 'alchemyRate' && k !== 'forgeRate' && k !== 'rob') a[k] = (a[k] || 0) * (1 + sb[k]);

  // 洞府阵法
  const arr = (cfg.cave.arrays || []).find((x) => x.id === (p.cave && p.cave.array));
  if (arr && arr.buff) for (const k in arr.buff) if (k !== 'exp') a[k] = (a[k] || 0) * (1 + arr.buff[k]);

  // 装备（强化 + 淬灵）
  for (const slot of cfg.slots) {
    const it = p.equip[slot.key];
    if (!it) continue;
    const mul = cfg.qualities[it.q].mul * (1 + (it.level || 0) * cfg.enhance.attrPerLevel) * (1 + (it.temper || 0) * cfg.temper.attrPerLevel);
    a.hp += (it.hp || 0) * mul; a.atk += (it.atk || 0) * mul; a.def += (it.def || 0) * mul;
    a.crit += (it.crit || 0); a.mp += (it.mp || 0) * mul;
  }

  // 出战灵兽（继承主人部分属性）
  const bt = activeBeast(p);
  if (bt) {
    const s = beastStats(bt);
    a.hp += s.hp * 0.5; a.atk += s.atk * 0.6; a.def += s.def * 0.5; a.mp += s.mp * 0.3;
  }

  // 转世加成
  if (p.reinc > 0) { const m = 1 + p.reinc * C().reincarnation.bonusPerLife; a.hp *= m; a.atk *= m; a.def *= m; }

  if (p.buffs && p.buffs.pillAtk > Date.now()) a.atk *= 1.25;
  a.critDmg = a.critDmg || 1.5;
  for (const k of ['hp', 'mp', 'atk', 'def']) a[k] = Math.round(a[k]);
  a.speed = +a.speed.toFixed(1);
  return a;
}

/* ---------- 修炼 ---------- */
function expPerSec(p) {
  const cfg = C();
  let s = cfg.cultivate.basePerSec + attrs(p).atk * cfg.cultivate.perAtk;
  s *= Math.pow(cfg.cultivate.perRealm, p.realm);
  s *= (rootInfo(p).expMul || 1);
  // 修炼地点
  const spot = (cfg.cultivateSpots || []).find((x) => x.id === p.spot) || cfg.cultivateSpots[0];
  if (spot) s *= spot.expMul;
  // 洞府聚灵阵
  const lv = (p.cave && p.cave.lv && p.cave.lv.array) || 0;
  s *= 1 + lv * 0.06;
  const arr = (cfg.cave.arrays || []).find((x) => x.id === (p.cave && p.cave.array));
  if (arr && arr.buff && arr.buff.exp) s *= 1 + arr.buff.exp;
  // 功法被动
  const pass = skillPassive(p);
  if (pass.exp) s *= 1 + pass.exp;
  // 道侣 / 师徒
  if (p.dao && p.dao.partner) s *= 1 + ((SC().relations || {}).daoLvBonus || {}).exp || 0.15;
  if (p.dao && p.dao.master) s *= 1 + (((SC().relations || {}).masterBonus || {}).exp || 0.1);
  if (p.buffs && p.buffs.pillExpUntil > Date.now()) s *= 1.5;
  const ev = window.NOTICE && window.NOTICE.events;
  if (ev && ev.doubleExp) s *= (ev.expMul || 2);
  return s;
}

function gainExp(p, amount) {
  p.exp += amount;
  let ups = 0;
  const N = C().stages.length;
  while (p.exp >= expNeed(p)) {
    p.exp -= expNeed(p);
    p.stage++;
    if (p.stage >= N) {
      p.stage = 0; p.realm++;
      if (p.realm >= C().realms.length) { p.realm = C().realms.length - 1; p.stage = N - 1; p.exp = 0; break; }
    }
    ups++;
  }
  p.stats.breakthrough = (p.stats.breakthrough || 0) + ups;
  return ups;
}

/** 离线结算（含洞府产出） */
function offlineSettle(p) {
  const now = Date.now();
  let sec = (now - (p.lastTick || now)) / 1000;
  const max = C().offlineMaxHours * 3600;
  if (sec < 5) { p.lastTick = now; return { exp: 0, seconds: 0, ups: 0 }; }
  if (sec > max) sec = max;
  const gained = expPerSec(p) * sec;
  const ups = gainExp(p, gained);
  p.stats.offlineMin = Math.round((p.stats.offlineMin || 0) + sec / 60);
  p.lastTick = now;
  return { exp: gained, seconds: sec, ups };
}

/* ---------- 闭关（带冷却） ---------- */
function meditateCdLeft(p) {
  return Math.max(0, Math.ceil(((p.meditateUntil || 0) - Date.now()) / 1000));
}
function meditate(p) {
  const m = C().meditate || { cdSeconds: 300, gainSeconds: 180 };
  const left = meditateCdLeft(p);
  if (left > 0) return { ok: false, msg: `心神未复，还需调息 ${Math.floor(left / 60)}分${left % 60}秒`, left };
  const gain = expPerSec(p) * m.gainSeconds;
  const ups = gainExp(p, gain);
  p.meditateUntil = Date.now() + m.cdSeconds * 1000;
  p.stats.meditate = (p.stats.meditate || 0) + 1;
  return { ok: true, gain, ups, cd: m.cdSeconds, msg: `闭关得 ${Math.round(gain)} 修为` };
}

/* ---------- 突破 / 渡劫 ---------- */
function breakthrough(p) {
  const cfg = C();
  if (p.stage !== cfg.stages.length - 1) return { ok: false, msg: '需先修至本境【巅峰】' };
  if (p.realm >= cfg.realms.length - 1) { p.stage = cfg.stages.length - 1; p.exp = 0; return { ok: false, msg: '已登仙境之巅，天道尽头' }; }
  let rate = Math.max(0.25, cfg.breakthrough.baseRate - p.realm * 0.03);
  // 渡劫丹
  if (hasItem(p, 'pill_break', 1)) { consume(p, 'pill_break', 1); rate += 0.25; }
  if (Math.random() < rate) {
    p.realm++; p.stage = 0; p.exp = 0;
    return { ok: true, msg: `渡劫成功！突破至【${cfg.realms[p.realm].name}初期】`, realm: p.realm };
  }
  p.exp = Math.round(p.exp * cfg.breakthrough.failKeepExp + expNeed(p) * 0.3);
  return { ok: false, msg: '天劫降临，突破失败，修为受损', canReincarnate: true };
}

function reincarnate(p) {
  const cfg = C().reincarnation;
  const keep = Math.round(totalExp(p) * cfg.keepRatio);
  const life = (p.reinc || 0) + 1;
  const fresh = newPlayer(p.name, p.uid, { gender: p.gender, avatar: p.avatar, root: p.root, sect: p.sect });
  fresh.pwd = p.pwd;
  fresh.reinc = life;
  fresh.stone = Math.round(p.stone * 0.5);
  fresh.codes = p.codes || [];
  fresh.createdAt = p.createdAt;
  Object.assign(p, fresh);
  gainExp(p, keep);
  return { ok: true, msg: `转世成功！第 ${life} 世，保留 ${keep} 修为，天赋永久 +${Math.round(life * cfg.bonusPerLife * 100)}%` };
}

/* ---------- 物品 ---------- */
function itemCount(p, ref) {
  let n = 0;
  for (const it of p.bag) if ((it.ref || it.id) === ref) n += (it.count || 1);
  return n;
}
function hasItem(p, ref, n = 1) { return itemCount(p, ref) >= n; }
function consume(p, ref, n = 1) {
  let need = n;
  for (let i = p.bag.length - 1; i >= 0 && need > 0; i--) {
    const it = p.bag[i];
    if ((it.ref || it.id) !== ref) continue;
    const c = it.count || 1;
    if (c <= need) { p.bag.splice(i, 1); need -= c; }
    else { it.count = c - need; need = 0; }
  }
  return need === 0;
}
function addItem(p, item) {
  if (item.count) {
    const ex = p.bag.find((x) => (x.ref || x.id) === (item.ref || item.id));
    if (ex) { ex.count = (ex.count || 1) + item.count; return ex; }
  }
  if (p.bag.length >= 80) p.bag.shift();
  if (!item.id) item.id = 'i_' + Math.random().toString(36).slice(2, 9);
  p.bag.push(item);
  return item;
}
function addHerb(p, ref, n = 1) {
  const h = (CT().herbs || []).find((x) => x.id === ref);
  if (!h) return null;
  return addItem(p, { kind: 'herb', ref, name: h.name, icon: h.icon, price: h.price, count: n, desc: '炼丹材料' });
}
function addOre(p, ref, n = 1) {
  const o = (CT().ores || []).find((x) => x.id === ref);
  if (!o) return null;
  return addItem(p, { kind: 'ore', ref, name: o.name, icon: o.icon, price: o.price, count: n, desc: '炼器材料' });
}
function addPill(p, ref, n = 1) {
  const cfg = C();
  const pl = (cfg.pills || []).find((x) => x.id === ref) || extraPill(ref);
  if (!pl) return null;
  return addItem(p, { kind: 'pill', ref, name: pl.name, icon: pl.icon, desc: pl.desc, price: pl.price || 100, count: n });
}
function extraPill(ref) {
  const map = {
    pill_break: { name: '渡劫丹', icon: '💊', desc: '突破成功率 +25%', price: 600 },
    pill_root: { name: '洗髓丹', icon: '🧬', desc: '可重洗灵根', price: 2000 },
    pill_zen: { name: '悟道金丹', icon: '🌟', desc: '永久悟性 +5', price: 5000 },
  };
  return map[ref];
}

/* ---------- 装备 ---------- */
function randItem(mapIndex, realmIdx) {
  const cfg = C();
  const qRoll = Math.random();
  let q = 0;
  if (qRoll > 0.985) q = 4; else if (qRoll > 0.93) q = 3; else if (qRoll > 0.75) q = 2; else if (qRoll > 0.45) q = 1;
  const slot = cfg.slots[Math.floor(Math.random() * 3)];
  const scale = 1 + realmIdx * 0.9 + mapIndex * 0.6;
  const names = { weapon: ['青锋剑', '玄铁刀', '灵蛇杖', '诛仙剑', '混元幡'], armor: ['玄龟甲', '云锦袍', '锁子金甲', '太极道衣', '麒麟铠'], ring: ['聚灵戒', '养魂环', '破妄戒', '阴阳环', '太虚戒'] };
  const nm = names[slot.key][Math.floor(Math.random() * names[slot.key].length)];
  return {
    id: 'it_' + Math.random().toString(36).slice(2, 9), kind: 'equip', slot: slot.key, q, level: 0, temper: 0,
    name: `${cfg.qualities[q].name}·${nm}`,
    atk: Math.round((slot.key === 'weapon' ? 14 : slot.key === 'ring' ? 6 : 3) * scale * (0.8 + Math.random() * 0.5)),
    def: Math.round((slot.key === 'armor' ? 10 : 3) * scale * (0.8 + Math.random() * 0.5)),
    hp: Math.round((slot.key === 'armor' ? 70 : 25) * scale * (0.8 + Math.random() * 0.5)),
    crit: q >= 3 ? 0.02 : 0, mp: Math.round(10 * scale),
  };
}
function equipItem(p, item) {
  const old = p.equip[item.slot];
  p.equip[item.slot] = item;
  p.bag = p.bag.filter((x) => x.id !== item.id);
  if (old) p.bag.push(old);
}
function enhanceCost(item) {
  const cfg = C();
  return Math.round(cfg.enhance.costBase * Math.pow(cfg.enhance.costGrowth, item.level || 0) * cfg.qualities[item.q].mul);
}
function temperCost(item) {
  const cfg = C();
  return Math.round(cfg.temper.costBase * Math.pow(cfg.temper.costGrowth, item.temper || 0) * cfg.qualities[item.q].mul);
}
function enhance(p, item) {
  const cfg = C();
  if ((item.level || 0) >= cfg.enhance.maxLevel) return { ok: false, msg: '已达最高强化等级' };
  const cost = enhanceCost(item);
  if (p.stone < cost) return { ok: false, msg: `灵石不足（需 ${cost}）` };
  p.stone -= cost;
  if (Math.random() < 1 - (item.level || 0) * 0.06) { item.level = (item.level || 0) + 1; return { ok: true, msg: `强化成功！${item.name} +${item.level}` }; }
  return { ok: false, msg: '强化失败，灵石消散' };
}
function temper(p, item) {
  const cfg = C();
  if ((item.temper || 0) >= cfg.temper.maxLevel) return { ok: false, msg: '已达最高淬灵等级' };
  const cost = temperCost(item);
  if (p.stone < cost) return { ok: false, msg: `灵石不足（需 ${cost}）` };
  p.stone -= cost;
  if (Math.random() < 1 - (item.temper || 0) * 0.1) { item.temper = (item.temper || 0) + 1; return { ok: true, msg: `淬灵成功！${item.name} 淬灵+${item.temper}` }; }
  return { ok: false, msg: '淬灵失败，宝光黯淡' };
}
function devour(p, target, foodId) {
  const idx = p.bag.findIndex((x) => x.id === foodId);
  if (idx < 0) return { ok: false, msg: '材料不存在' };
  const food = p.bag[idx];
  const cfg = C();
  const gain = cfg.devour.expPerQuality * ((food.q || 0) + 1) + (food.level || 0) * 2;
  p.bag.splice(idx, 1);
  const cost = Math.round(cfg.devour.levelPerStage * (1 + (target.level || 0)) * 40);
  if (p.stone < cost) return { ok: false, msg: `灵石不足（炼化需 ${cost}）` };
  p.stone -= cost;
  if ((target.level || 0) < cfg.enhance.maxLevel && Math.random() < 0.7) {
    target.level = (target.level || 0) + 1;
    return { ok: true, msg: `炼化 ${food.name}，${target.name} 强化至 +${target.level}` };
  }
  return { ok: true, msg: `炼化 ${food.name}，宝物汲取了灵韵（+${gain} 经验）`, exp: gain };
}
function sellItem(p, item) {
  const cfg = C();
  let price = 60;
  if (item.kind === 'mat' || item.kind === 'herb' || item.kind === 'ore') price = (item.price || 50) * (item.count || 1);
  else if (item.kind === 'pill') price = (item.price || 100) * (item.count || 1);
  else price = Math.round((60 + (item.atk || 0) * 2 + (item.def || 0) * 2 + (item.hp || 0) * 0.4) * cfg.qualities[item.q || 0].mul * (1 + (item.level || 0) * 0.3 + (item.temper || 0) * 0.4));
  p.stone += price;
  p.bag = p.bag.filter((x) => x.id !== item.id);
  return price;
}
function usePill(p, pill) {
  const id = pill.ref || pill.id;
  if (id === 'pill_hp') return { ok: false, msg: '战斗中自动使用' };
  if (id === 'pill_atk') p.buffs.pillAtk = Date.now() + 10 * 60 * 1000;
  if (id === 'pill_exp') p.buffs.pillExpUntil = Date.now() + 30 * 60 * 1000;
  if (id === 'pill_break') return { ok: false, msg: '渡劫时自动消耗' };
  if (id === 'pill_root') { const r = rollRoot(); p.root = r; return { ok: true, msg: `洗髓成功，灵根变为【${rootInfo(p).name}】`, reroll: true }; }
  if (id === 'pill_zen') { p.bonusWuxing = (p.bonusWuxing || 0) + 5; return { ok: true, msg: '悟道金丹下肚，悟性永久 +5' }; }
  p.bag = p.bag.filter((x) => x.id !== pill.id);
  return { ok: true, msg: `服用${pill.name}，药力发作！` };
}

/* ---------- 战斗 ---------- */
function pickActiveSkill(p, mp, cdMap) {
  const ct = CT();
  const list = (p.equipped || []).map((id) => (ct.skills || []).find((s) => s.id === id)).filter((s) => s && s.active);
  const ready = list.filter((s) => (s.active.mp || 0) <= mp && !(cdMap || {})[s.id]);
  if (!ready.length) return null;
  ready.sort((a, b) => (b.active.mult || 1) - (a.active.mult || 1));
  return ready[0];
}

function battle(player, monster, mapIndex, opt = {}) {
  const a = attrs(player);
  let php = a.hp, mhp = monster.hp, mp = a.mp;
  let round = 0, healUsed = false, shield = 0, burn = 0, slow = 0;
  const cdMap = {}, logs = [];
  const beast = activeBeast(player);
  const bs = beast ? beastStats(beast) : null;

  const hitRoll = (attackerHit, targetDodge) => Math.random() < Math.max(0.35, Math.min(0.98, attackerHit - targetDodge));
  const dmg = (atk, def, crit, critDmg, anticrit, mustCrit) => {
    const base = atk * (0.9 + Math.random() * 0.25) - def * 0.32;
    let v = Math.max(1, Math.round(base));
    let isCrit = mustCrit || (Math.random() < Math.max(0, crit - (anticrit || 0)));
    if (isCrit) v = Math.round(v * critDmg);
    return { v, isCrit };
  };

  while (round < 30 && php > 0 && mhp > 0) {
    round++;
    for (const k in cdMap) if (cdMap[k] > 0) cdMap[k]--;
    const first = (a.speed * (1 - slow)) >= monster.speed;
    const turns = first ? ['p', 'b', 'm'] : ['m', 'p', 'b'];

    for (const who of turns) {
      if (php <= 0 || mhp <= 0) break;
      if (who === 'p') {
        const sk = pickActiveSkill(player, mp, cdMap);
        if (sk) {
          mp -= sk.active.mp || 0;
          cdMap[sk.id] = sk.active.cd || 2;
          const d = dmg(a.atk * (sk.active.mult || 1), monster.def, a.crit, a.critDmg, 0, sk.active.mustCrit);
          mhp -= d.v;
          if (sk.active.lifesteal) php = Math.min(a.hp, php + d.v * sk.active.lifesteal);
          if (sk.active.shield) shield = Math.round(a.hp * sk.active.shield);
          if (sk.active.heal) php = Math.min(a.hp, php + a.hp * sk.active.heal);
          if (sk.active.burn) burn = sk.active.burn;
          if (sk.active.slow) slow = sk.active.slow;
          logs.push({ who: 'p', skill: sk.name, text: `施展【${sk.name}】，对${monster.name}造成 ${d.v} 伤害`, crit: d.isCrit, mhp });
        } else {
          if (!hitRoll(a.hit, monster.dodge || 0.05)) { logs.push({ who: 'p', miss: true, text: `你的一击被${monster.name}闪开` }); }
          else {
            const d = dmg(a.atk, monster.def, a.crit, a.critDmg, 0, false);
            mhp -= d.v;
            logs.push({ who: 'p', text: `你挥出神通，对${monster.name}造成 ${d.v} 伤害`, crit: d.isCrit, mhp });
          }
        }
      } else if (who === 'b') {
        if (!bs) continue;
        const d = dmg(bs.atk * (bs.skillMult || 1.4), monster.def, 0.06, 1.5, 0, Math.random() < 0.2);
        mhp -= d.v;
        logs.push({ who: 'b', beast: bs.name, text: `灵兽 ${bs.name} 施展【${bs.skill}】，造成 ${d.v} 伤害`, crit: d.isCrit, mhp });
      } else {
        if (!hitRoll(0.9, a.dodge)) { logs.push({ who: 'm', miss: true, text: `${monster.name}的攻击被你闪过` }); }
        else {
          const d = dmg(monster.atk, a.def, 0.05, 1.4, a.anticrit, false);
          let v = d.v;
          if (shield > 0) { const abs = Math.min(shield, v); shield -= abs; v -= abs; }
          php -= v;
          logs.push({ who: 'm', text: `${monster.name}反击，你受到 ${v} 点伤害`, php });
          if (!healUsed && php < a.hp * 0.35) {
            const idx = player.bag.findIndex((x) => (x.ref || x.id) === 'pill_hp');
            if (idx >= 0) {
              player.bag[idx].count = (player.bag[idx].count || 1) - 1;
              if (player.bag[idx].count <= 0) player.bag.splice(idx, 1);
              php = Math.min(a.hp, php + a.hp * 0.3); healUsed = true;
              logs.push({ who: 'p', text: '你服下回气丹，气血回升！', heal: true, php });
            }
          }
        }
      }
    }
    if (burn > 0 && mhp > 0) { const bd = Math.round(monster.hp * burn); mhp -= bd; logs.push({ who: 'p', text: `灼烧持续，${monster.name} 损失 ${bd} 气血`, burn: true, mhp }); }
  }
  return { win: mhp <= 0, php: Math.max(0, Math.round(php)), mhp: Math.max(0, Math.round(mhp)), round, logs, mp: Math.max(0, Math.round(mp)) };
}

function battleReward(p, mapIndex, win, monster) {
  const cfg = C();
  const map = cfg.maps[mapIndex];
  const ev = window.NOTICE && window.NOTICE.events;
  let stone = 0, exp = 0, drops = [], ups = 0;
  if (win) {
    stone = Math.round(map.stone * (0.85 + Math.random() * 0.3));
    exp = Math.round(map.exp * (0.85 + Math.random() * 0.3));
    if (ev && ev.doubleStone) stone *= (ev.stoneMul || 2);
    if (ev && ev.doubleExp) exp *= (ev.expMul || 2);
    const rt = rootInfo(p);
    p.stone += stone; ups = gainExp(p, exp);
    p.stats.kills++;
    if (Math.random() < map.dropRate) drops.push(addItem(p, randItem(mapIndex, p.realm)));
    if (map.herbs && Math.random() < 0.45) drops.push(addHerb(p, map.herbs[Math.floor(Math.random() * map.herbs.length)], 1));
    if (map.ores && Math.random() < 0.35) drops.push(addOre(p, map.ores[Math.floor(Math.random() * map.ores.length)], 1));
  } else {
    p.stats.deaths++;
    exp = Math.round(map.exp * 0.1); ups = gainExp(p, exp);
  }
  p.stats.battles++;
  return { stone, exp, drops, ups };
}

function redeemCode(p, code) {
  const cfg = C();
  const key = String(code || '').trim().toUpperCase();
  const g = cfg.giftCodes[key];
  if (!g) return { ok: false, msg: '礼包码无效' };
  if ((p.codes || []).includes(key)) return { ok: false, msg: '该礼包码已领取' };
  p.codes = p.codes || []; p.codes.push(key);
  if (g.stone) p.stone += g.stone;
  if (g.exp) gainExp(p, g.exp);
  if (g.herb) addHerb(p, 'herb_green', g.herb);
  return { ok: true, msg: `领取成功：${g.desc}` };
}


/* ---------- 灵兽 ---------- */
function activeBeast(p) {
  const i = p.activeBeast;
  if (i === undefined || i === null || i < 0) return null;
  return p.beasts[i] || null;
}
function beastStats(b) {
  const ct = CT(), cfg = ct.beast || {};
  const base = (ct.beasts || []).find((x) => x.id === b.ref) || ct.beasts[0];
  const lv = b.level || 1;
  const apt = b.apt || cfg.aptBase || 1;
  const stageMul = 1 + (b.stage || 0) * 0.45;
  return {
    name: b.name || base.name, skill: base.skill, skillMult: base.skillMult,
    hp: Math.round(base.hp * apt * stageMul + (base.growHp || 5) * lv),
    atk: Math.round((base.atk + (base.growAtk || 1) * lv) * apt * stageMul),
    def: Math.round(base.def * apt * stageMul),
    mp: 20 + lv * 5,
    speed: base.speed,
    ride: !!base.ride,
  };
}
function beastExpNeed(b) {
  const cfg = CT().beast || {};
  return Math.round((cfg.levelExpBase || 50) * Math.pow(cfg.levelExpGrowth || 1.35, (b.level || 1) - 1));
}

/* ---------- 宗门 / 洞府增益 ---------- */
function sectBuff(p) {
  const s = (SC().sects || []).find((x) => x.id === p.sect);
  if (!s) return {};
  const info = p.sectInfo || {};
  const rankIdx = info.rankIdx || 0;
  const mul = 1 + rankIdx * 0.12;
  const out = {};
  for (const k in (s.buff || {})) out[k] = s.buff[k] * mul;
  return out;
}
function caveOutputPerHour(p, type) {
  const cfg = C().cave.buildings || [];
  let sum = 0;
  for (const b of cfg) {
    if (b.outType !== type) continue;
    sum += (p.cave.lv[b.id] || 0) * b.outPerHour;
  }
  return sum;
}

/* ---------- 供 systems.js 使用的桩（本文件先定义，systems.js 覆盖增强） ---------- */
window.ENGINE = {
  newPlayer, migrate, activeBeast, beastStats, beastExpNeed, sectBuff, caveOutputPerHour, rootInfo, rollRoot, realmName, expNeed, totalExp, power, attrs,
  expPerSec, gainExp, offlineSettle, meditate, meditateCdLeft, breakthrough, reincarnate,
  itemCount, hasItem, consume, addItem, addHerb, addOre, addPill, extraPill,
  equipItem, randItem, enhance, enhanceCost, temper, temperCost, devour, sellItem, usePill,
  pickActiveSkill, battle, battleReward, redeemCode,
};
