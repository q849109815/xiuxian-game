/* =========================================================
 * engine.js —— 修仙玩法核心：属性/修为/突破/战斗/掉落/离线收益
 * 数据格式见 newPlayer()，所有数值来自云端 data/config/game.json
 * ========================================================= */

const C = () => window.GAME_CONFIG;

function newPlayer(name, uid) {
  return {
    uid, name,
    pwd: null,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    lastTick: Date.now(),
    realm: 0, layer: 0, exp: 0,
    stone: 0,
    equip: { weapon: null, armor: null, ring: null },
    bag: [],
    buffs: { pillAtk: 0, pillExpUntil: 0 },
    stats: { kills: 0, deaths: 0, breakthrough: 0, battles: 0, offlineMin: 0 },
    codes: [],
    banned: false,
    title: '',
  };
}

/* ---------- 属性计算 ---------- */
function realmName(p) {
  const rs = C().realms;
  return `${rs[p.realm].name}${p.layer + 1}层`;
}

function expNeed(p) {
  const rs = C().realms;
  const r = rs[p.realm];
  const idx = p.realm * 9 + p.layer;
  return Math.round(r.expBase * Math.pow(r.expGrowth, idx));
}

function totalExp(p) {
  // 用于排行：把境界折算成一个大数字
  let e = p.exp || 0;
  const rs = C().realms;
  for (let i = 0; i < p.realm; i++) e += 9 * rs[i].expBase * Math.pow(rs[i].expGrowth, i * 9 + 4);
  return Math.round(e);
}

function attrs(p) {
  const cfg = C();
  const b = cfg.baseAttr;
  const a = {
    hp: b.hp + cfg.growthPerRealm.hp * p.realm + cfg.growthPerLayer.hp * p.layer,
    atk: b.atk + cfg.growthPerRealm.atk * p.realm + cfg.growthPerLayer.atk * p.layer,
    def: b.def + cfg.growthPerRealm.def * p.realm + cfg.growthPerLayer.def * p.layer,
    crit: b.crit + cfg.growthPerRealm.crit * p.realm + cfg.growthPerLayer.crit * p.layer,
    critDmg: b.critDmg + cfg.growthPerRealm.critDmg * p.realm + cfg.growthPerLayer.critDmg * p.layer,
    speed: b.speed + cfg.growthPerRealm.speed * p.realm + cfg.growthPerLayer.speed * p.layer,
  };
  for (const slot of cfg.slots) {
    const it = p.equip[slot.key];
    if (!it) continue;
    const mul = cfg.qualities[it.q].mul * (1 + (it.level || 0) * cfg.enhance.attrPerLevel);
    a.hp += (it.hp || 0) * mul;
    a.atk += (it.atk || 0) * mul;
    a.def += (it.def || 0) * mul;
  }
  if (p.buffs && p.buffs.pillAtk > Date.now()) a.atk *= 1.25;
  a.hp = Math.round(a.hp); a.atk = Math.round(a.atk); a.def = Math.round(a.def);
  return a;
}

function power(p) {
  const a = attrs(p);
  return Math.round((a.atk * 3 + a.def * 2 + a.hp * 0.5 + a.crit * 200 + a.critDmg * 60) * (1 + p.realm * 0.25));
}

/* ---------- 修炼 ---------- */
function expPerSec(p) {
  const cfg = C();
  const a = attrs(p);
  let s = cfg.cultivate.basePerSec + a.atk * cfg.cultivate.perAtk;
  s *= Math.pow(cfg.cultivate.perRealm, p.realm);
  if (p.buffs && p.buffs.pillExpUntil > Date.now()) s *= 1.5;
  const ev = window.NOTICE && window.NOTICE.events;
  if (ev && ev.doubleExp) s *= (ev.expMul || 2);
  return s;
}

function gainExp(p, amount) {
  p.exp += amount;
  let ups = 0;
  const rs = C().realms;
  while (p.exp >= expNeed(p)) {
    p.exp -= expNeed(p);
    p.layer++;
    if (p.layer >= 9) {
      p.layer = 0; p.realm++;
      if (p.realm >= rs.length) { p.realm = rs.length - 1; p.layer = 8; p.exp = 0; break; }
    }
    ups++;
    p.stats.breakthrough += ups;
  }
  return ups;
}

/** 离线结算：返回 { exp, seconds } */
function offlineSettle(p) {
  const now = Date.now();
  let sec = (now - (p.lastTick || now)) / 1000;
  const max = C().offlineMaxHours * 3600;
  if (sec < 5) { p.lastTick = now; return { exp: 0, seconds: 0 }; }
  if (sec > max) sec = max;
  const gained = expPerSec(p) * sec;
  const ups = gainExp(p, gained);
  p.stats.offlineMin = Math.round((p.stats.offlineMin || 0) + sec / 60);
  p.lastTick = now;
  return { exp: gained, seconds: sec, ups };
}

/* ---------- 闭关（主动修炼，带冷却，防无限刷） ---------- */
function meditateCdLeft(p) {
  const until = p.meditateUntil || 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function meditate(p) {
  const cfg = C();
  const m = cfg.meditate || { cdSeconds: 300, gainSeconds: 180, stoneCostBase: 0 };
  const left = meditateCdLeft(p);
  if (left > 0) {
    const mm = Math.floor(left / 60), ss = left % 60;
    return { ok: false, msg: `心神未复，还需调息 ${mm}分${ss}秒`, left };
  }
  const cost = Math.round((m.stoneCostBase || 0) * Math.pow(1.8, p.realm));
  if (cost > 0 && p.stone < cost) return { ok: false, msg: `灵石不足（闭关需 ${cost}）`, left: 0 };
  if (cost > 0) p.stone -= cost;

  const gain = expPerSec(p) * m.gainSeconds;
  const ups = gainExp(p, gain);
  p.meditateUntil = Date.now() + m.cdSeconds * 1000;
  return { ok: true, gain, ups, cost, cd: m.cdSeconds, msg: `闭关 ${Math.round(m.gainSeconds / 60)} 刻，得 ${Math.round(gain)} 修为` };
}

/* ---------- 突破（大境界渡劫） ---------- */
function breakthrough(p) {
  const cfg = C();
  if (p.layer !== 8) return { ok: false, msg: '需先修满本境九层' };
  // 已满级：真仙九层，再无可进之境
  if (p.realm >= cfg.realms.length - 1) {
    p.realm = cfg.realms.length - 1; p.layer = 8; p.exp = 0;
    return { ok: false, msg: '已登仙境之巅，天道尽头，无可再进' };
  }
  const rate = Math.max(0.25, cfg.breakthrough.baseRate - p.realm * 0.03);
  const lucky = Math.random() < rate;
  if (lucky) {
    p.realm++; p.layer = 0; p.exp = 0;
    return { ok: true, msg: `渡劫成功！突破至【${cfg.realms[p.realm].name}】` };
  }
  p.exp = Math.round(p.exp * cfg.breakthrough.failKeepExp + expNeed(p) * 0.3);
  return { ok: false, msg: '天劫降临，突破失败，修为受损但道心更坚' };
}

/* ---------- 装备 / 掉落 ---------- */
function randItem(mapIndex, realmIdx) {
  const cfg = C();
  const qRoll = Math.random();
  let q = 0;
  if (qRoll > 0.985) q = 4; else if (qRoll > 0.93) q = 3; else if (qRoll > 0.75) q = 2; else if (qRoll > 0.45) q = 1;
  const slot = cfg.slots[Math.floor(Math.random() * cfg.slots.length)];
  const scale = 1 + realmIdx * 0.9 + mapIndex * 0.6;
  const names = { weapon: ['青锋剑', '玄铁刀', '灵蛇杖', '诛仙剑', '混元幡'], armor: ['玄龟甲', '云锦袍', '锁子金甲', '太极道衣', '麒麟铠'], ring: ['聚灵戒', '养魂环', '破妄戒', '阴阳环', '太虚戒'] };
  const nm = names[slot.key][Math.floor(Math.random() * names[slot.key].length)];
  const item = {
    id: 'it_' + Math.random().toString(36).slice(2, 9),
    kind: 'equip', slot: slot.key, q, level: 0,
    name: `${cfg.qualities[q].name}·${nm}`,
    atk: Math.round((slot.key === 'weapon' ? 14 : slot.key === 'ring' ? 6 : 3) * scale * (0.8 + Math.random() * 0.5)),
    def: Math.round((slot.key === 'armor' ? 10 : 3) * scale * (0.8 + Math.random() * 0.5)),
    hp: Math.round((slot.key === 'armor' ? 70 : 25) * scale * (0.8 + Math.random() * 0.5)),
    from: mapIndex,
  };
  return item;
}

function randMat(mapIndex) {
  const cfg = C();
  const m = cfg.mats[Math.min(cfg.mats.length - 1, Math.floor(mapIndex / 2))];
  return { id: 'mt_' + Math.random().toString(36).slice(2, 9), kind: 'mat', ref: m.id, name: m.name, icon: m.icon, price: m.price, count: 1 + Math.floor(Math.random() * 3) };
}

function addItem(p, item) {
  if (item.kind === 'mat') {
    const ex = p.bag.find((x) => x.kind === 'mat' && x.ref === item.ref);
    if (ex) { ex.count += item.count; return ex; }
  }
  if (p.bag.length >= 60) p.bag.shift(); // 背包上限
  p.bag.push(item);
  return item;
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

function enhance(p, item) {
  const cfg = C();
  if ((item.level || 0) >= cfg.enhance.maxLevel) return { ok: false, msg: '已达最高强化等级' };
  const cost = enhanceCost(item);
  if (p.stone < cost) return { ok: false, msg: `灵石不足（需 ${cost}）` };
  p.stone -= cost;
  const rate = 1 - (item.level || 0) * 0.06;
  if (Math.random() < rate) { item.level = (item.level || 0) + 1; return { ok: true, msg: `强化成功！${item.name} +${item.level}`, level: item.level }; }
  return { ok: false, msg: '强化失败，灵石消散（等级不变）' };
}

function sellItem(p, item) {
  const cfg = C();
  let price = 60;
  if (item.kind === 'mat') price = item.price * item.count;
  else price = Math.round((60 + (item.atk + item.def) * 2 + item.hp) * cfg.qualities[item.q].mul * (1 + (item.level || 0) * 0.3));
  p.stone += price;
  p.bag = p.bag.filter((x) => x.id !== item.id);
  return price;
}

function usePill(p, pill) {
  if (pill.id === 'pill_hp') return { ok: false, msg: '战斗中自动使用' };
  if (pill.id === 'pill_atk') { p.buffs.pillAtk = Date.now() + 10 * 60 * 1000; }
  if (pill.id === 'pill_exp') { p.buffs.pillExpUntil = Date.now() + 30 * 60 * 1000; }
  p.bag = p.bag.filter((x) => x.id !== pill.id);
  return { ok: true, msg: `服用${pill.name}，药力发作！` };
}

/* ---------- 战斗：回合制，返回结果与逐回合战报 ---------- */
function battle(player, monster, mapIndex, logCb) {
  const a = attrs(player);
  let php = a.hp, mhp = monster.hp;
  let round = 0, healUsed = false;
  const logs = [];
  const dmg = (atk, def, crit, critDmg) => {
    const base = atk * (0.9 + Math.random() * 0.25) - def * 0.55;
    const v = Math.max(1, Math.round(base));
    const isCrit = Math.random() < crit;
    return { v: isCrit ? Math.round(v * critDmg) : v, isCrit };
  };
  while (round < 30 && php > 0 && mhp > 0) {
    round++;
    const first = a.speed >= monster.speed;
    const turns = first ? ['p', 'm'] : ['m', 'p'];
    for (const who of turns) {
      if (php <= 0 || mhp <= 0) break;
      if (who === 'p') {
        const d = dmg(a.atk, monster.def, a.crit, a.critDmg);
        mhp -= d.v;
        logs.push({ who: 'p', text: `你挥出神通，对${monster.name}造成 ${d.v} 点伤害`, crit: d.isCrit, mhp });
      } else {
        const d = dmg(monster.atk, a.def, 0.05, 1.4);
        php -= d.v;
        logs.push({ who: 'm', text: `${monster.name}反击，你受到 ${d.v} 点伤害`, crit: d.isCrit, php });
        // 自动吃回气丹
        if (!healUsed && php < a.hp * 0.35) {
          const idx = player.bag.findIndex((x) => (x.ref || x.id) === 'pill_hp');
          if (idx >= 0) {
            player.bag.splice(idx, 1);
            php = Math.min(a.hp, php + a.hp * 0.3);
            healUsed = true;
            logs.push({ who: 'p', text: `你服下回气丹，气血回升！`, heal: true, php });
          }
        }
      }
    }
  }
  return { win: mhp <= 0, php: Math.max(0, Math.round(php)), mhp: Math.max(0, Math.round(mhp)), round, logs };
}

function battleReward(p, mapIndex, win) {
  const cfg = C();
  const map = cfg.maps[mapIndex];
  const ev = window.NOTICE && window.NOTICE.events;
  let stone = 0, exp = 0, drops = [];
  if (win) {
    stone = Math.round(map.stone * (0.85 + Math.random() * 0.3));
    exp = Math.round(map.exp * (0.85 + Math.random() * 0.3));
    if (ev && ev.doubleStone) stone *= (ev.stoneMul || 2);
    if (ev && ev.doubleExp) exp *= (ev.expMul || 2);
    p.stone += stone;
    ups = gainExp(p, exp);
    p.stats.kills++;
    if (Math.random() < map.dropRate) drops.push(addItem(p, randItem(mapIndex, p.realm)));
    if (Math.random() < 0.5) drops.push(addItem(p, randMat(mapIndex)));
  } else {
    p.stats.deaths++;
    stone = 0; exp = Math.round(map.exp * 0.1);
    ups = gainExp(p, exp);
  }
  p.stats.battles++;
  return { stone, exp, drops, ups };
}

/* ---------- 礼包码 ---------- */
function redeemCode(p, code) {
  const cfg = C();
  const g = cfg.giftCodes[code.trim().toUpperCase()];
  if (!g) return { ok: false, msg: '礼包码无效' };
  if (p.codes.includes(code.trim().toUpperCase())) return { ok: false, msg: '该礼包码已领取' };
  p.codes.push(code.trim().toUpperCase());
  if (g.stone) p.stone += g.stone;
  if (g.exp) gainExp(p, g.exp);
  return { ok: true, msg: `领取成功：${g.desc}` };
}

window.ENGINE = { newPlayer, realmName, expNeed, totalExp, attrs, power, expPerSec, gainExp, offlineSettle, meditate, meditateCdLeft, breakthrough, battle, battleReward, enhance, enhanceCost, sellItem, usePill, equipItem, addItem, redeemCode };
