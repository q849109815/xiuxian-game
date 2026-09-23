/* =========================================================
 * engine.js —— 玩家数据 / 养成系统 / 关卡生成
 * ========================================================= */

const E = {

  /* ---------- 新角色 ---------- */
  newPlayer(uid, name, gender) {
    return {
      uid, name, gender: gender || 'm',
      avatar: gender === 'f' ? '👩‍🚀' : '👨‍🚀',
      lv: 1, exp: 0,
      level: 1, maxLevel: 1, endlessBest: 0,
      gold: 500, diamond: 100,
      gun: 'g1', gunLv: 1,
      equip: { head: null, cloth: null, shoe: null, arm: null, pants: null, glove: null },
      gems: {},
      bag: [],
      mercs: [],
      techs: {},
      wallLv: 1,
      stats: { kills: 0, runs: 0, wins: 0, boss: 0, time: 0 },
      lastSeen: Date.now(), created: Date.now(),
    };
  },

  /* ---------- 工具 ---------- */
  fmt(n) {
    n = Math.round(n || 0);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
    return '' + n;
  },
  qi(q) { const i = EX.qualities.findIndex((x) => x.n === q); return i < 0 ? 0 : i; },
  qMul(q) { return (EX.qualities.find((x) => x.n === q) || { mul: 1 }).mul; },
  qColor(q) { return (EX.qualities.find((x) => x.n === q) || { c: '#888' }).c; },

  /* ---------- 账号经验 ---------- */
  xpNeed(lv) { return Math.round(100 * Math.pow(1.16, lv - 1)); },
  addExp(p, v) {
    p.exp += v;
    let up = 0;
    while (p.exp >= this.xpNeed(p.lv)) { p.exp -= this.xpNeed(p.lv); p.lv++; up++; }
    return up;
  },

  /* ---------- 枪械 ---------- */
  gun(p) { return EX.guns.find((x) => x.id === p.gun) || EX.guns[0]; },
  /* 枪械：乘性成长（主指数来源），与僵尸血量曲线匹配 */
  GUN_GROW: 1.20,
  gunAtk(p) { return Math.round(this.gun(p).dmg * Math.pow(this.GUN_GROW, p.gunLv - 1)); },
  gunUpgradeCost(p) { return Math.round(300 * Math.pow(1.26, p.gunLv - 1)); },
  upgradeGun(p) {
    const c = this.gunUpgradeCost(p);
    if (p.gold < c) return { ok: false, msg: '金币不足' };
    p.gold -= c; p.gunLv++;
    return { ok: true, msg: '枪械强化至 Lv.' + p.gunLv };
  },

  /* ---------- 装备生成 ---------- */
  rollEquip(slot, lvHint) {
    const L = Math.max(1, lvHint || 1);
    const qs = ['白', '绿', '蓝', '紫', '橙', '红'];
    let idx = 0;
    const r = Math.random();
    if (r > 0.94) idx = 4; else if (r > 0.8) idx = 3; else if (r > 0.55) idx = 2; else if (r > 0.25) idx = 1;
    const q = qs[Math.min(idx, 5 - Math.floor(L / 60))];
    const base = Math.round((18 + L * 3.2) * this.qMul(q));
    const it = {
      id: 'eq' + Math.random().toString(36).slice(2, 8),
      slot, q, lv: 0,
      atk: Math.round(base * (0.8 + Math.random() * 0.5)),
      def: Math.round(base * (0.5 + Math.random() * 0.4)),
      hp: Math.round(base * (3 + Math.random() * 2)),
      subs: [],
    };
    // 蓝品以上带副词条
    const nsub = Math.max(0, idx - 1);
    for (let i = 0; i < nsub; i++) it.subs.push(this.rollSub());
    return it;
  },
  rollSub() {
    const keys = [['atk', 0.06, '攻击'], ['def', 0.05, '防御'], ['hp', 0.05, '生命'],
      ['crit', 0.03, '暴击率'], ['cdr', 0.025, '冷却缩减'], ['dmg', 0.05, '伤害']];
    const [k, base, n] = keys[Math.floor(Math.random() * keys.length)];
    return { k, n, v: +(base * (0.7 + Math.random() * 0.8)).toFixed(3) };
  },

  /* ---------- 装备锻造 ---------- */
  forgeCost(it) { return Math.round(120 * Math.pow(1.22, it.lv)); },
  forge(p, slot) {
    const it = p.equip[slot];
    if (!it) return { ok: false, msg: '该部位未装备' };
    if (it.lv >= 50) return { ok: false, msg: '已达强化上限' };
    const c = this.forgeCost(it);
    if (p.gold < c) return { ok: false, msg: '金币不足' };
    p.gold -= c; it.lv++;
    it.atk = Math.round(it.atk * 1.06); it.def = Math.round(it.def * 1.06); it.hp = Math.round(it.hp * 1.06);
    return { ok: true, msg: '强化成功 +' + it.lv };
  },

  /* ---------- 升品 ---------- */
  upQuality(p, slot) {
    const it = p.equip[slot];
    if (!it) return { ok: false, msg: '该部位未装备' };
    const i = this.qi(it.q);
    if (i >= 5) return { ok: false, msg: '已是最高品质' };
    const cost = Math.round(400 * Math.pow(2.2, i));
    if (p.gold < cost) return { ok: false, msg: '金币不足（需 ' + this.fmt(cost) + '）' };
    p.gold -= cost;
    it.q = EX.qualities[i + 1].n;
    const m = this.qMul(it.q) / this.qMul(EX.qualities[i].n);
    it.atk = Math.round(it.atk * m); it.def = Math.round(it.def * m); it.hp = Math.round(it.hp * m);
    if (i + 1 >= 2) it.subs.push(this.rollSub());
    return { ok: true, msg: '升品成功 → ' + it.q };
  },

  /* ---------- 洗炼 ---------- */
  reroll(p, slot) {
    const it = p.equip[slot];
    if (!it) return { ok: false, msg: '该部位未装备' };
    if (this.qi(it.q) < 2) return { ok: false, msg: '蓝色品质以上才能洗炼' };
    const cost = Math.round(600 * Math.pow(1.9, this.qi(it.q)));
    if (p.gold < cost) return { ok: false, msg: '金币不足（需 ' + this.fmt(cost) + '）' };
    p.gold -= cost;
    it.subs = it.subs.map(() => this.rollSub());
    return { ok: true, msg: '洗炼完成' };
  },

  /* ---------- 分解 ---------- */
  decompose(p, idx) {
    const it = p.bag[idx];
    if (!it) return { ok: false, msg: '物品不存在' };
    p.bag.splice(idx, 1);
    const got = Math.round(40 * Math.pow(1.8, this.qi(it.q)));
    p.gold += got;
    return { ok: true, msg: '分解获得 ' + this.fmt(got) + ' 金币' };
  },

  /* ---------- 宝石 ---------- */
  socketGem(p, slot, gemId) {
    const it = p.equip[slot];
    if (!it) return { ok: false, msg: '该部位未装备' };
    if (this.qi(it.q) < 2) return { ok: false, msg: '蓝色品质以上才能镶宝石' };
    p.gems[slot] = gemId;
    return { ok: true, msg: '镶嵌成功' };
  },

  /* ---------- 佣兵 ---------- */
  recruitCost(id) {
    const m = EX.mercs.find((x) => x.id === id);
    return { gold: Math.round(800 * Math.pow(2.4, this.qi(m.q))), diamond: this.qi(m.q) >= 4 ? 50 : 0 };
  },
  recruit(p, id) {
    if (p.mercs.some((m) => m.id === id)) return { ok: false, msg: '已拥有该佣兵' };
    const c = this.recruitCost(id);
    if (p.gold < c.gold) return { ok: false, msg: '金币不足' };
    if (p.diamond < (c.diamond || 0)) return { ok: false, msg: '钻石不足' };
    p.gold -= c.gold; p.diamond -= (c.diamond || 0);
    p.mercs.push({ id, lv: 1, out: p.mercs.length < 2 });
    return { ok: true, msg: '招募成功' };
  },
  mercUpgradeCost(m) { return Math.round(500 * Math.pow(1.4, m.lv - 1)); },
  upMerc(p, id) {
    const m = p.mercs.find((x) => x.id === id);
    if (!m) return { ok: false, msg: '未拥有' };
    const c = this.mercUpgradeCost(m);
    if (p.gold < c) return { ok: false, msg: '金币不足' };
    p.gold -= c; m.lv++;
    return { ok: true, msg: '佣兵升至 Lv.' + m.lv };
  },

  /* ---------- 科技 ---------- */
  techCost(id, cur) {
    const t = EX.techs.find((x) => x.id === id);
    return Math.round(t.base * Math.pow(t.grow, cur));
  },
  upTech(p, id) {
    const t = EX.techs.find((x) => x.id === id);
    const cur = p.techs[id] || 0;
    if (cur >= t.max) return { ok: false, msg: '已满级' };
    const c = this.techCost(id, cur);
    if (p.gold < c) return { ok: false, msg: '金币不足' };
    p.gold -= c; p.techs[id] = cur + 1;
    return { ok: true, msg: t.n + ' 提升至 Lv.' + (cur + 1) };
  },

  /* ---------- 防线 ---------- */
  wallCost(p) { return Math.round(500 * Math.pow(1.45, p.wallLv - 1)); },
  upWall(p) {
    const c = this.wallCost(p);
    if (p.gold < c) return { ok: false, msg: '金币不足' };
    p.gold -= c; p.wallLv++;
    return { ok: true, msg: '防线强化至 Lv.' + p.wallLv };
  },

  /* ---------- 综合属性（局外养成汇总） ---------- */
  attrs(p) {
    let base = this.gunAtk(p), range = this.gun(p).range, rate = this.gun(p).rate;
    let pierce = this.gun(p).pierce, spread = this.gun(p).spread || 1;
    let crit = 0.05, critDmg = 0.5, wallHp = 1000, cdr = 0, goldMul = 1;
    let flat = 0, mult = 1;   // 装备固定值 + 总倍率

    // 装备：固定值（前期有用） + 品质/锻造成倍率（后期主导）
    EX.slots.forEach((s) => {
      const it = p.equip[s.k];
      if (!it) return;
      flat += it.atk; wallHp += it.hp;
      mult += (this.qMul(it.q) - 1) * 0.06 + (it.lv || 0) * 0.006;
      (it.subs || []).forEach((sb) => {
        if (sb.k === 'atk') flat += Math.round(flat * sb.v) + Math.round(base * sb.v * 0.3);
        if (sb.k === 'hp') wallHp = Math.round(wallHp * (1 + sb.v));
        if (sb.k === 'crit') crit += sb.v;
        if (sb.k === 'cdr') cdr += sb.v;
        if (sb.k === 'dmg') mult += sb.v * 0.5;
        if (sb.k === 'def') wallHp = Math.round(wallHp * (1 + sb.v * 0.6));
      });
    });
    // 宝石
    Object.values(p.gems || {}).forEach((gid) => {
      const g = EX.gems.find((x) => x.id === gid);
      if (!g) return;
      if (g.id === 'gm1') crit += g.v;
      if (g.id === 'gm2') cdr += g.v;
      if (g.id === 'gm3') pierce += g.v;
      if (g.id === 'gm4') spread += g.v;
      if (g.id === 'gm5') atk = Math.round(atk * (1 + g.v));
      if (g.id === 'gm10') atk = Math.round(atk * (1 + g.v));
      if (g.id === 'gm12') critDmg += g.v;
    });
    // 科技
    const t = p.techs || {};
    mult += (t.t1 || 0) * 0.02;
    range = Math.round(range * (1 + (t.t2 || 0) * 0.015));
    rate = rate * (1 + (t.t3 || 0) * 0.02);
    wallHp = Math.round(wallHp * (1 + (t.t4 || 0) * 0.03));
    cdr += (t.t5 || 0) * 0.025;
    goldMul += (t.t6 || 0) * 0.03;
    // 防线等级
    wallHp = Math.round(wallHp * (1 + (p.wallLv - 1) * 0.22));
    // 佣兵出战（按当前战力百分比加成，后期仍有意义）
    let mercPct = 0;
    (p.mercs || []).filter((m) => m.out).forEach((m) => {
      const d = EX.mercs.find((x) => x.id === m.id);
      if (d) mercPct += 0.06 + (m.lv - 1) * 0.01;
    });
    mult += mercPct;
    cdr = Math.min(0.6, cdr);
    crit = Math.min(0.75, crit);

    const atk = Math.round((base * mult) + flat);
    return { atk, base, mult, flat, range, rate, pierce, spread, crit, critDmg, wallHp, cdr, goldMul };
  },

  power(p) {
    const a = this.attrs(p);
    return Math.round(a.atk * 12 + a.wallHp * 0.6 + a.crit * 900 + (p.lv || 1) * 220 + (p.maxLevel || 1) * 320);
  },

  /* ---------- 关卡定义 ---------- */
  /* 血量成长：需与枪械 GUN_GROW=1.18 及装备/科技倍率匹配 */
  HP_GROW: 1.082,
  DMG_GROW: 1.072,
  GOLD_GROW: 1.16,
  levelDef(n, endless) {
    const isBoss = n % 10 === 0;
    const waves = Math.min(9, 3 + Math.floor(n / 14));
    const hpMul = Math.pow(this.HP_GROW, n - 1) * (endless ? Math.pow(1.04, n) : 1);
    const dmgMul = Math.pow(this.DMG_GROW, n - 1);
    // 僵尸池
    let pool = ['z1', 'z2'];
    if (n >= 12) pool.push('z3');
    if (n >= 20) pool.push('z4');
    if (n >= 28) pool.push('z5');
    if (n >= 36) pool.push('z7');
    if (n >= 45) pool.push('z6');
    if (n >= 55) pool.push('z8');
    if (n >= 65) pool.push('z9');
    if (n >= 75) pool.push('z10');
    if (n >= 100) pool.push('z11');
    const boss = isBoss ? EX.bosses[Math.min(EX.bosses.length - 1, Math.floor(n / 10) - 1)] : null;
    return {
      n, waves, isBoss, boss, pool,
      hpMul, dmgMul,
      countBase: Math.min(26, 6 + Math.floor(n * 0.30)),
      name: this.levelName(n),
    };
  },
  levelName(n) {
    const scenes = ['城市大街', '废弃工厂', '辐射废墟', '地下隧道', '麦田荒野', '雪原哨站', '雾境迷宫', '深渊裂谷'];
    return '第' + n + '关 · ' + scenes[Math.floor((n - 1) / 30) % scenes.length];
  },

  /* ---------- 通关奖励 ---------- */
  clearReward(n, win) {
    const gold = Math.round(60 * Math.pow(this.GOLD_GROW, n - 1) * (win ? 1 : 0.35));
    const diamond = win && n % 10 === 0 ? 20 + Math.floor(n / 10) : (win ? 4 : 1);
    return { gold, diamond, exp: Math.round(30 + n * 8) };
  },
};

window.E = E;
