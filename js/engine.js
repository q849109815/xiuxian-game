/* =========================================================
 * engine.js —— 养成引擎
 * 依据资料：GD-003 角色 / GD-004 武器 / GD-005 技能天赋 /
 *           GD-009 装备芯片 / GD-010 基地 / GD-011 任务 / GD-017 数值
 * ========================================================= */

const E = {
  /* 成长曲线（GD-017） */
  GUN_GROW: 0.20,      // 每级 +20% 伤害
  HP_BASE: 220,
  MOVE_BASE: 132,

  fmt(n) {
    n = Math.round(Number(n) || 0);
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(n);
  },
  qi(q) { return EX.qualities.indexOf(q); },

  /* =================================================
   * 新玩家
   * ================================================ */
  newPlayer(uid, name, gender) {
    return {
      uid, name, gender: gender || 'm',
      avatar: gender === 'f' ? '👩‍🚀' : '👨‍🚀',
      avatarImg: gender === 'f' ? 'assets/char/hero_f.jpg' : 'assets/char/hero_m.jpg',
      lv: 1, xp: 0,
      gold: 3000, diamond: 100, shards: 0,
      gun: 'ar', gunLv: 1,
      chips: {}, bag: [],
      talents: {},
      build: { hospital: 1, armory: 1, lab: 1, warehouse: 1 },
      cleared: {},            // { levelNo: stars }
      level: 1,               // 当前可挑战关卡
      endlessBest: 0,
      skin: 'default', skins: ['default'],
      tasks: { mainClaimed: [], dailyProg: {}, dailyClaimed: [], dailyDate: '', achieveClaimed: [] },
      stats: { kills: 0, runs: 0, boss: 0, clears: 0, upgrade: 0 },
      offlineAt: Date.now(),
      mail: [], created: Date.now(), lastSeen: Date.now(),
      renamed: 0,
    };
  },

  /* =================================================
   * 属性汇总（角色 + 武器 + 芯片 + 天赋 + 基地）
   * ================================================ */
  gun(p) { return EX.guns.find((g) => g.id === p.gun) || EX.guns[0]; },
  talentVal(p, stat) {
    const t = EX.talents.find((x) => x.stat === stat);
    if (!t) return 0;
    return (p.talents[t.id] || 0) * t.per;
  },
  buildVal(p, stat) {
    const b = EX.buildings.find((x) => x.stat === stat);
    if (!b) return 0;
    return (p.build[b.id] || 1) * b.per;
  },
  chipVal(p, k) {
    let v = 0;
    for (const s in p.chips || {}) {
      const c = p.chips[s]; if (!c) continue;
      for (const st of c.stats) if (st.k === k) v += st.v;
    }
    return v;
  },

  attrs(p) {
    const g = this.gun(p);
    const gunBase = g.dmg * (1 + (p.gunLv - 1) * this.GUN_GROW);
    const atk = gunBase
      * (1 + this.talentVal(p, 'atk') + this.buildVal(p, 'atk') + this.chipVal(p, 'atk'));
    const hp = this.HP_BASE
      * (1 + this.talentVal(p, 'hp') + this.buildVal(p, 'hp') + this.chipVal(p, 'hp'));
    const crit = Math.min(0.85, 0.05 + this.talentVal(p, 'crit') + this.chipVal(p, 'crit'));
    const critDmg = 1.5 + this.chipVal(p, 'critDmg');
    return {
      atk, hp: Math.round(hp), gunBase,
      rate: g.rate * (1 + this.chipVal(p, 'rate')),
      range: g.range, mag: g.mag, pierce: g.pierce, spread: g.spread,
      crit, critDmg,
      moveSpd: this.MOVE_BASE * (1 + this.chipVal(p, 'move')),
      shield: 0,
      revive: Math.floor(p.talents.t_revive || 0),
      armor: Math.min(0.7, this.talentVal(p, 'armor') + this.chipVal(p, 'armor')),
      goldMul: 1 + this.talentVal(p, 'gold') + this.chipVal(p, 'gold'),
      xpMul: 1 + this.talentVal(p, 'xp') + this.buildVal(p, 'xp') + this.chipVal(p, 'xp'),
    };
  },
  power(p) {
    const a = this.attrs(p);
    return Math.round(a.atk * 12 + a.hp * 0.6 + p.gunLv * 60 + Object.keys(p.chips || {}).length * 220
      + Object.values(p.talents || {}).reduce((s, v) => s + v, 0) * 90);
  },

  /* =================================================
   * 武器（GD-004：等级进阶 + 词条槽）
   * ================================================ */
  gunUpgradeCost(p) { return Math.round(300 * Math.pow(1.28, p.gunLv - 1)); },
  upgradeGun(p) {
    const c = this.gunUpgradeCost(p);
    if (p.gold < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
    p.gold -= c; p.gunLv++; p.stats.upgrade = (p.stats.upgrade || 0) + 1;
    return { ok: true, msg: '🔫 ' + this.gun(p).n + ' 强化至 Lv.' + p.gunLv };
  },
  gunUnlock(p) { return EX.guns.filter((g) => p.cleared && Object.keys(p.cleared).length >= 0); },

  /* =================================================
   * 芯片（GD-009：槽位 / 品质词条 / 拆解 / 合成 / 洗练）
   * ================================================ */
  rollChip(q, slot) {
    const qd = EX.chipQ.find((x) => x.q === q) || EX.chipQ[0];
    const pool = EX.chipStats.slice();
    const out = [];
    for (let i = 0; i < qd.stats && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const st = pool.splice(idx, 1)[0];
      out.push({ k: st.k, v: +(st.base * qd.mul * (0.8 + Math.random() * 0.5)).toFixed(4) });
    }
    return { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), q, stats: out, slot: slot || null };
  },
  chipName(c) {
    return c.q + '品芯片 · ' + c.stats.map((s) => {
      const d = EX.chipStats.find((x) => x.k === s.k);
      return d.n + '+' + (d.unit === '%' ? (s.v * 100).toFixed(1) + '%' : s.v.toFixed(1));
    }).join(' ');
  },
  equipChip(p, chipId, slot) {
    const i = (p.bag || []).findIndex((c) => c.id === chipId);
    if (i < 0) return { ok: false, msg: '未找到该芯片' };
    const c = p.bag[i];
    const old = p.chips[slot];
    p.chips[slot] = c; p.bag.splice(i, 1);
    if (old) p.bag.push(old);
    return { ok: true, msg: '已装备 ' + this.chipName(c) };
  },
  unequipChip(p, slot) {
    const c = p.chips[slot]; if (!c) return { ok: false, msg: '该槽位为空' };
    p.bag.push(c); delete p.chips[slot];
    return { ok: true, msg: '已卸下芯片' };
  },
  dismantleChip(p, chipId) {
    const i = (p.bag || []).findIndex((c) => c.id === chipId);
    if (i < 0) return { ok: false, msg: '未找到该芯片' };
    const c = p.bag[i];
    const qd = EX.chipQ.find((x) => x.q === c.q) || EX.chipQ[0];
    p.bag.splice(i, 1); p.shards += qd.shards;
    return { ok: true, msg: '拆解获得 ' + qd.shards + ' 芯片碎片' };
  },
  fuseChip(p, ids) {
    if (ids.length !== 3) return { ok: false, msg: '合成需要 3 块同品质芯片' };
    const cs = ids.map((id) => (p.bag || []).find((c) => c.id === id));
    if (cs.some((c) => !c)) return { ok: false, msg: '芯片不存在' };
    const q = cs[0].q;
    if (cs.some((c) => c.q !== q)) return { ok: false, msg: '必须为同品质芯片' };
    const qi = this.qi(q);
    if (qi >= EX.qualities.length - 1) return { ok: false, msg: '已是最高品质' };
    const nq = EX.qualities[qi + 1];
    ids.forEach((id) => { const i = p.bag.findIndex((c) => c.id === id); if (i >= 0) p.bag.splice(i, 1); });
    const nc = this.rollChip(nq, null); p.bag.push(nc);
    return { ok: true, msg: '合成成功：' + this.chipName(nc) };
  },
  rerollCost(c) { return 50 * (this.qi(c.q) + 1); },
  rerollChip(p, chipId) {
    const c = (p.bag || []).find((x) => x.id === chipId) || Object.values(p.chips || {}).find((x) => x && x.id === chipId);
    if (!c) return { ok: false, msg: '未找到该芯片' };
    const cost = this.rerollCost(c);
    if (p.diamond < cost) return { ok: false, msg: '钻石不足（需 ' + cost + '）' };
    p.diamond -= cost;
    const nc = this.rollChip(c.q, c.slot);
    c.stats = nc.stats;
    return { ok: true, msg: '洗练完成：' + this.chipName(c) };
  },

  /* =================================================
   * 永久天赋（资料 10 表，8 项）
   * ================================================ */
  talentCost(p, id) {
    const t = EX.talents.find((x) => x.id === id); if (!t) return 0;
    const cur = p.talents[id] || 0;
    return Math.round(t.cost0 * Math.pow(t.costGrow, cur));
  },
  talentUnlocked(p, id) {
    const t = EX.talents.find((x) => x.id === id); if (!t) return false;
    return (p.level || 1) > t.unlock;
  },
  upTalent(p, id) {
    const t = EX.talents.find((x) => x.id === id); if (!t) return { ok: false, msg: '天赋不存在' };
    if (!this.talentUnlocked(p, id)) return { ok: false, msg: '需通关第 ' + (t.unlock + 1) + ' 关解锁' };
    const cur = p.talents[id] || 0;
    if (cur >= t.max) return { ok: false, msg: '已达最高等级' };
    const c = this.talentCost(p, id);
    if (p.gold < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
    p.gold -= c; p.talents[id] = cur + 1;
    return { ok: true, msg: '⭐ ' + t.n + ' Lv.' + p.talents[id] };
  },

  /* =================================================
   * 基地建筑（GD-010：升级 + 离线产出）
   * ================================================ */
  buildCost(p, id) {
    const b = EX.buildings.find((x) => x.id === id); if (!b) return 0;
    return Math.round(b.cost0 * Math.pow(b.grow, (p.build[id] || 1) - 1));
  },
  upBuild(p, id) {
    const b = EX.buildings.find((x) => x.id === id); if (!b) return { ok: false, msg: '建筑不存在' };
    const cur = p.build[id] || 1;
    if (cur >= b.max) return { ok: false, msg: '已达最高等级' };
    const c = this.buildCost(p, id);
    if (p.gold < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
    p.gold -= c; p.build[id] = cur + 1;
    return { ok: true, msg: '🏗️ ' + b.n + ' 升至 Lv.' + p.build[id] };
  },
  offlineIncome(p) {
    const b = EX.buildings.find((x) => x.id === 'warehouse');
    const lv = p.build.warehouse || 1;
    const perHour = b.offline * lv;
    const hrs = Math.min(12, (Date.now() - (p.offlineAt || Date.now())) / 3600000);
    return hrs < 0.05 ? 0 : Math.floor(perHour * hrs);
  },

  /* =================================================
   * 关卡 / 章节 / 星级（资料 07 表）
   * ================================================ */
  levelName(lv) {
    const per = EX.LEVELS_PER_CHAPTER;
    const ch = Math.min(EX.chapters.length, Math.floor((lv - 1) / per) + 1);
    const sub = ((lv - 1) % per) + 1;
    const cd = EX.chapters[ch - 1];
    return cd.n.split(' · ')[0] + ' ' + ch + '-' + sub;
  },
  chapterOf(lv) { return Math.min(EX.chapters.length, Math.floor((lv - 1) / EX.LEVELS_PER_CHAPTER) + 1); },
  maxLevel() { return EX.chapters.length * EX.LEVELS_PER_CHAPTER; },
  starsFor(hpRatio) { return hpRatio > 0.6 ? 3 : hpRatio > 0.3 ? 2 : 1; },
  clearLevel(p, levelNo, hpRatio) {
    const st = this.starsFor(hpRatio);
    p.cleared[levelNo] = Math.max(p.cleared[levelNo] || 0, st);
    p.stats.clears = (p.stats.clears || 0) + 1;
    if (levelNo >= (p.level || 1)) p.level = Math.min(this.maxLevel(), levelNo + 1);
    return st;
  },
  totalStars(p) { return Object.values(p.cleared || {}).reduce((s, v) => s + v, 0); },
  chapterUnlocked(p, ch) {
    return (p.level || 1) > (ch - 1) * EX.LEVELS_PER_CHAPTER;
  },

  /* =================================================
   * 任务（GD-011：主线 / 每日 / 成就）
   * ================================================ */
  taskVal(p, t) {
    switch (t) {
      case 'clear': return Object.keys(p.cleared || {}).length;
      case 'gunLv': return p.gunLv || 1;
      case 'chip': return Object.keys(p.chips || {}).length;
      case 'talent': return Object.values(p.talents || {}).reduce((s, v) => s + v, 0);
      case 'chapter': return this.chapterOf(p.level || 1);
      case 'endless': return p.endlessBest || 0;
      case 'build': return Object.values(p.build || {}).reduce((s, v) => s + v, 0);
      case 'kills': return (p.stats && p.stats.kills) || 0;
      case 'clears': return (p.stats && p.stats.clears) || 0;
      case 'boss': return (p.stats && p.stats.boss) || 0;
      case 'power': return this.power(p);
      case 'endlessBest': return p.endlessBest || 0;
      case 'chipQ': {
        let best = 0;
        for (const s in p.chips || {}) { const c = p.chips[s]; if (c) best = Math.max(best, this.qi(c.q) + 1); }
        return best;
      }
      case 'login': return 1;
      case 'run': return (p.stats && p.stats.runs) || 0;
      case 'kill': return (p.stats && p.stats.kills) || 0;
      case 'upgrade': return (p.stats && p.stats.upgrade) || 0;
      case 'clearDaily': return (p.stats && p.stats.clears) || 0;
      default: return 0;
    }
  },
  taskDone(p, t) { return this.taskVal(p, t.goal.t) >= t.goal.v; },
  dailyKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  resetDaily(p) {
    const k = this.dailyKey();
    if (p.tasks.dailyDate !== k) { p.tasks.dailyDate = k; p.tasks.dailyClaimed = []; p.tasks.dailyProg = {}; }
  },
  claimTask(p, type, id) {
    const list = EX.tasks[type === 'daily' ? 'daily' : type === 'achieve' ? 'achieve' : 'main'];
    const t = list.find((x) => x.id === id); if (!t) return { ok: false, msg: '任务不存在' };
    if (!this.taskDone(p, t)) return { ok: false, msg: '尚未完成' };
    const key = type === 'main' ? 'mainClaimed' : type === 'daily' ? 'dailyClaimed' : 'achieveClaimed';
    if ((p.tasks[key] || []).indexOf(id) >= 0) return { ok: false, msg: '已领取' };
    p.tasks[key] = p.tasks[key] || []; p.tasks[key].push(id);
    p.gold += t.rw.gold || 0; p.diamond += t.rw.dia || 0;
    return { ok: true, msg: '✅ ' + t.n + '：金币 +' + (t.rw.gold || 0) + ' 钻石 +' + (t.rw.dia || 0) };
  },

  /* =================================================
   * 皮肤（GD-003）
   * ================================================ */
  skinUnlocked(p, id) {
    const s = EX.skins.find((x) => x.id === id); if (!s) return false;
    return Object.keys(p.cleared || {}).length >= s.unlock;
  },
  wearSkin(p, id) {
    if (!this.skinUnlocked(p, id)) return { ok: false, msg: '尚未解锁' };
    p.skin = id; return { ok: true, msg: '已更换外观' };
  },
};

window.E = E;
