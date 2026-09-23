/* =========================================================
 * engine.js —— 养成引擎
 * 依据资料：GD-003角色 / GD-004武器 / GD-005技能天赋 /
 *   GD-007关卡 / GD-009芯片 / GD-010基地 / GD-011任务 /
 *   GD-017数值 / 伤害公式(10) / 成长曲线 / 解锁条件
 * ========================================================= */

const E = {
  /* 武器：线性成长，每级 +20%；每 5 级进阶一次 */
  GUN_GROW: 0.20,
  SPD_MUL: 22,          // 资料移速 6.0 → 像素 132

  fmt(n) {
    n = Math.round(Number(n) || 0);
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(n);
  },
  qi(q) { return EX.qualities.indexOf(q); },
  item(id) { return EX.items.find((x) => x.id === id); },
  itemName(id) { const t = this.item(id); return t ? t.n : (id === 'gold' ? '金币' : id === 'diamond' ? '钻石' : id); },

  /* =================================================
   * 新玩家
   * ================================================ */
  newPlayer(uid, name, gender) {
    return {
      uid, name, gender: gender || 'm',
      char: 'C01',                 // 当前角色
      chars: ['C01'],              // 已解锁角色
      skin: 'sk_c01a', skins: ['sk_c01a'],
      avatar: '🧑‍🚀', avatarImg: gender === 'f' ? 'assets/char/hero_f.jpg' : 'assets/char/hero_m.jpg',
      lv: 1, xp: 0,
      gold: 2000, diamond: 100, ach: 0,
      /* 材料（资料物品表） */
      mat: { M01: 0, M02: 0, M03: 0, M04: 0, M05: 0, P01: 0, P02: 0 },
      /* 消耗品 */
      use: { I01: 0, I02: 0, I03: 0 },
      gun: 'W01', gunLv: 1, gunAdv: 0, gunStats: {},   // 武器等级/进阶/词条
      gunOwn: ['W01'],
      chips: {}, bag: [],
      talents: {},
      build: { hospital: 1, armory: 1, lab: 1, warehouse: 1 },
      cleared: {},            // { '1-1': stars }
      curLevel: '1-1',
      endlessBest: 0, endlessTime: 0,
      stamina: 100, staminaAt: Date.now(),
      tasks: { mainClaimed: [], dailyClaimed: [], dailyDate: '', dailyProg: {},
        weeklyClaimed: [], weeklyKey: '', weeklyProg: {}, achieveClaimed: [] },
      stats: { kills: 0, runs: 0, bossKill: 0, noHitBest: 0, endlessBest: 0 },
      adUsed: {}, adDate: '',
      guide: {},               // 引导完成标记
      offlineAt: Date.now(),
      mail: [], created: Date.now(), lastSeen: Date.now(),
    };
  },

  /* =================================================
   * 关卡（资料关卡表：3 章 10 关）
   * ================================================ */
  levels() { return EX.levels; },
  levelDef(id) { return EX.levels.find((x) => x.id === id) || EX.levels[0]; },
  levelIdx(id) { const i = EX.levels.findIndex((x) => x.id === id); return i < 0 ? 0 : i; },
  nextLevel(id) {
    const i = this.levelIdx(id);
    return i < EX.levels.length - 1 ? EX.levels[i + 1].id : null;
  },
  /* 关卡是否已解锁：前一关通关 */
  levelUnlocked(p, id) {
    const d = this.levelDef(id);
    if (!d.unlock) return true;
    return !!p.cleared[d.unlock];
  },
  /* 当前可挑战的下一关 */
  curLevel(p) {
    for (const l of EX.levels) if (!p.cleared[l.id]) return l.id;
    return EX.levels[EX.levels.length - 1].id;
  },
  levelName(id) {
    const d = this.levelDef(id);
    return d.id + ' ' + d.n;
  },
  chapterOf(id) { return this.levelDef(id).ch; },
  /* 体力消耗：普通 1 / BOSS 3 / 无尽 2 */
  staminaCost(id) {
    if (id === 'endless') return 2;
    const d = this.levelDef(id);
    return d.cond === 'boss' || d.cond === 'bossAll' ? 3 : 1;
  },
  /* 体力：每 5 分钟 +1，上限 100 */
  tickStamina(p) {
    const now = Date.now();
    const add = Math.floor((now - (p.staminaAt || now)) / EX.STAMINA_MS);
    if (add > 0) {
      p.stamina = Math.min(EX.STAMINA_MAX, (p.stamina || 0) + add);
      p.staminaAt = now;
    }
    return p.stamina;
  },
  spendStamina(p, id) {
    this.tickStamina(p);
    const c = this.staminaCost(id);
    if ((p.stamina || 0) < c) return { ok: false, msg: '体力不足（需 ' + c + '，当前 ' + Math.floor(p.stamina) + '）' };
    p.stamina -= c; p.staminaAt = Date.now();
    return { ok: true, cost: c };
  },
  addStamina(p, v) {
    this.tickStamina(p);
    p.stamina = Math.min(EX.STAMINA_MAX, (p.stamina || 0) + v);
    return p.stamina;
  },

  /* =================================================
   * 角色 / 皮肤
   * ================================================ */
  char(p) { return EX.chars.find((c) => c.id === p.char) || EX.chars[0]; },
  charUnlocked(p, id) {
    const c = EX.chars.find((x) => x.id === id); if (!c) return false;
    if (!c.unlockLv) return true;
    return !!p.cleared[c.unlockLv];
  },
  skin(p) { return EX.skins.find((s) => s.id === p.skin) || EX.skins[0]; },
  skinOf(charId) { return EX.skins.filter((s) => s.char === charId); },
  switchChar(p, id) {
    if (!this.charUnlocked(p, id)) {
      const c = EX.chars.find((x) => x.id === id);
      return { ok: false, msg: '需通关 ' + (c ? c.unlockLv : '?') + ' 解锁' };
    }
    p.char = id;
    const s = this.skinOf(id).find((x) => (p.skins || []).indexOf(x.id) >= 0);
    p.skin = s ? s.id : this.skinOf(id)[0].id;
    return { ok: true, msg: '已切换为 ' + this.char(p).n };
  },
  buySkin(p, skinId) {
    const s = EX.skins.find((x) => x.id === skinId); if (!s) return { ok: false, msg: '皮肤不存在' };
    if ((p.skins || []).indexOf(skinId) >= 0) return { ok: false, msg: '已拥有' };
    if (!this.charUnlocked(p, s.char)) return { ok: false, msg: '角色未解锁' };
    if ((p.diamond || 0) < s.price) return { ok: false, msg: '钻石不足（需 ' + s.price + '）' };
    p.diamond -= s.price; p.skins.push(skinId); p.skin = skinId;
    return { ok: true, msg: '已解锁 ' + s.n };
  },

  /* =================================================
   * 武器（资料武器表 10 把 + 进阶）
   * ================================================ */
  gun(p) { return EX.guns.find((g) => g.id === p.gun) || EX.guns[0]; },
  gunUnlocked(p, id) {
    const g = EX.guns.find((x) => x.id === id); if (!g) return false;
    if (!g.unlockLv) return true;
    return !!p.cleared[g.unlockLv];
  },
  switchGun(p, id) {
    if (!this.gunUnlocked(p, id)) {
      const g = EX.guns.find((x) => x.id === id);
      return { ok: false, msg: '需通关 ' + (g ? g.unlockLv : '?') + ' 解锁' };
    }
    if ((p.gunOwn || []).indexOf(id) < 0) p.gunOwn.push(id);
    p.gun = id;
    return { ok: true, msg: '已装备 ' + this.gun(p).n };
  },
  /* 进阶等级：每 5 级一次 */
  advOf(lv) {
    let a = 0;
    for (let i = 0; i < EX.gunAdvance.length; i++) if (lv >= EX.gunAdvance[i].lv) a = i;
    return a;
  },
  advInfo(lv) { return EX.gunAdvance[this.advOf(lv)]; },
  /* 升级：金币，线性 +20% */
  gunUpgradeCost(p) { return Math.round(300 * Math.pow(1.28, p.gunLv - 1)); },
  upgradeGun(p) {
    const c = this.gunUpgradeCost(p);
    if (p.gold < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
    p.gold -= c; p.gunLv++;
    const oldA = this.advOf(p.gunLv - 1), newA = this.advOf(p.gunLv);
    let extra = '';
    if (newA > oldA) {
      p.gunAdv = newA;
      /* 进阶解锁新词条槽 */
      const slot = EX.gunAdvance[newA].slot;
      const pool = EX.gunStats.slice();
      const st = pool[Math.floor(Math.random() * pool.length)];
      p.gunStats = p.gunStats || {};
      p.gunStats['s' + slot] = { k: st.k, v: +(st.base * (1 + newA * 0.5)).toFixed(4) };
      extra = ' ⬆进阶至' + EX.gunAdvance[newA].q + '品，解锁词条：' + st.n;
    }
    return { ok: true, msg: '🔫 ' + this.gun(p).n + ' → Lv.' + p.gunLv + extra };
  },
  gunStatVal(p, k) {
    let v = 0;
    for (const s in p.gunStats || {}) { const st = p.gunStats[s]; if (st && st.k === k) v += st.v; }
    return v;
  },

  /* =================================================
   * 芯片（资料芯片表 8 个固定）
   * ================================================ */
  chipDef(id) { return EX.chips.find((c) => c.id === id); },
  rollChipById(defId) {
    const d = this.chipDef(defId) || EX.chips[0];
    const subs = [];
    for (const k of d.subPool || []) {
      const sd = EX.chipSubStats.find((x) => x.k === k);
      if (sd) subs.push({ k, v: +(sd.base * (0.8 + Math.random() * 0.6)).toFixed(4) });
    }
    return { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      def: d.id, q: d.q, main: { ...d.main }, stats: subs, slot: null };
  },
  chipName(c) {
    const d = this.chipDef(c.def); if (!d) return '芯片';
    const mn = ({ hp: '生命', atk: '攻击', armor: '护甲', crit: '暴击率' })[c.main.k] || c.main.k;
    const unit = c.main.k === 'crit' ? '%' : '%';
    let s = d.n + '（' + mn + '+' + (c.main.v * 100).toFixed(0) + unit + '）';
    if (c.stats && c.stats.length) {
      s += ' ' + c.stats.map((x) => {
        const sd = EX.chipSubStats.find((y) => y.k === x.k);
        return (sd ? sd.n : x.k) + '+' + (x.v * 100).toFixed(1) + '%';
      }).join(' ');
    }
    return s;
  },
  chipUnlocked(p) { return !!p.cleared['1-4']; },     // 资料：通关1-4解锁
  equipChip(p, chipId, slot) {
    if (!this.chipUnlocked(p)) return { ok: false, msg: '需通关 1-4 解锁芯片系统' };
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
  /* 拆解 → 按品质给材料碎片 */
  dismantleChip(p, chipId) {
    const i = (p.bag || []).findIndex((c) => c.id === chipId);
    if (i < 0) return { ok: false, msg: '未找到该芯片' };
    const c = p.bag[i];
    const gain = { '白': 1, '蓝': 3, '红': 9 }[c.q] || 1;
    p.bag.splice(i, 1);
    p.mat.P01 = (p.mat.P01 || 0) + gain;
    return { ok: true, msg: '拆解获得 枪械碎片 ×' + gain };
  },
  /* 合成：3 块同品质 → 升一级（资料：3x普通芯片 / 3x精英芯片） */
  fuseChip(p, ids) {
    if (ids.length !== 3) return { ok: false, msg: '合成需要 3 块同品质芯片' };
    const cs = ids.map((id) => (p.bag || []).find((c) => c.id === id));
    if (cs.some((c) => !c)) return { ok: false, msg: '芯片不存在' };
    const q = cs[0].q;
    if (cs.some((c) => c.q !== q)) return { ok: false, msg: '必须为同品质芯片' };
    let target;
    if (q === '白') target = ['CH04', 'CH05'][Math.floor(Math.random() * 2)];
    else if (q === '蓝') target = ['CH06', 'CH07', 'CH08'][Math.floor(Math.random() * 3)];
    else return { ok: false, msg: '红品已是最高品质' };
    ids.forEach((id) => { const i = p.bag.findIndex((c) => c.id === id); if (i >= 0) p.bag.splice(i, 1); });
    const nc = this.rollChipById(target); p.bag.push(nc);
    return { ok: true, msg: '合成成功：' + this.chipName(nc) };
  },
  /* 洗练：钻石重 roll 副词条 */
  rerollChip(p, chipId) {
    const c = (p.bag || []).find((x) => x.id === chipId) ||
      Object.values(p.chips || {}).find((x) => x && x.id === chipId);
    if (!c) return { ok: false, msg: '未找到该芯片' };
    const cost = EX.REROLL_COST[c.q] || 50;
    if ((p.diamond || 0) < cost) return { ok: false, msg: '钻石不足（需 ' + cost + '）' };
    const d = this.chipDef(c.def);
    if (!d || !(d.subPool || []).length) return { ok: false, msg: '该芯片无副词条可洗' };
    p.diamond -= cost;
    c.stats = (d.subPool || []).map((k) => {
      const sd = EX.chipSubStats.find((y) => y.k === k);
      return { k, v: +(sd.base * (0.8 + Math.random() * 0.6)).toFixed(4) };
    });
    return { ok: true, msg: '洗练完成：' + this.chipName(c) };
  },
  chipVal(p, k) {
    let v = 0;
    for (const s in p.chips || {}) {
      const c = p.chips[s]; if (!c) continue;
      if (c.main && c.main.k === k) v += c.main.v;
      for (const st of c.stats || []) if (st.k === k) v += st.v;
    }
    return v;
  },

  /* =================================================
   * 天赋
   * ================================================ */
  talentVal(p, stat) {
    const t = EX.talents.find((x) => x.stat === stat);
    if (!t) return 0;
    return (p.talents[t.id] || 0) * t.per;
  },
  talentUnlocked(p, id) {
    const t = EX.talents.find((x) => x.id === id); if (!t) return false;
    if (!t.unlock) return true;
    return !!p.cleared[t.unlock];
  },
  talentCost(p, id) {
    const t = EX.talents.find((x) => x.id === id); if (!t) return 0;
    return Math.round(t.cost0 * Math.pow(t.costGrow, p.talents[id] || 0));
  },
  upTalent(p, id) {
    const t = EX.talents.find((x) => x.id === id); if (!t) return { ok: false, msg: '天赋不存在' };
    if (!this.talentUnlocked(p, id)) return { ok: false, msg: '需通关 ' + t.unlock + ' 解锁' };
    const cur = p.talents[id] || 0;
    if (cur >= t.max) return { ok: false, msg: '已达最高等级' };
    const c = this.talentCost(p, id);
    if (p.gold < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
    p.gold -= c; p.talents[id] = cur + 1;
    return { ok: true, msg: '⭐ ' + t.n + ' Lv.' + p.talents[id] };
  },

  /* =================================================
   * 基地建筑
   * ================================================ */
  buildVal(p, stat) {
    const b = EX.buildings.find((x) => x.stat === stat);
    if (!b) return 0;
    return (p.build[b.id] || 1) * b.per;
  },
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
    const perHour = (b.offline || 120) * lv;
    const hrs = Math.min(12, (Date.now() - (p.offlineAt || Date.now())) / 3600000);
    return hrs < 0.05 ? 0 : Math.floor(perHour * hrs);
  },

  /* =================================================
   * 属性汇总（资料伤害公式）
   * 基础伤害 = 武器伤害 × (1 + 攻击强化%)
   * ================================================ */
  attrs(p) {
    const c = this.char(p), g = this.gun(p);
    const sk = this.skin(p);
    /* 武器面板伤害：线性成长 */
    const gunBase = g.dmg * (1 + (p.gunLv - 1) * this.GUN_GROW);
    /* 攻击强化%（天赋 + 军械库 + 芯片 + 武器词条） */
    const atkUp = this.talentVal(p, 'atk') + this.buildVal(p, 'atk')
      + this.chipVal(p, 'atk') + this.gunStatVal(p, 'dmg');
    const atk = gunBase * (1 + atkUp);
    /* 生命：角色基础 + 天赋 + 医疗站 + 芯片 + 皮肤 */
    const hpUp = this.talentVal(p, 'hp') + this.buildVal(p, 'hp') + this.chipVal(p, 'hp')
      + ((sk && sk.bonus && sk.bonus.hp) || 0);
    const hp = c.hp * (1 + hpUp);
    /* 护甲：角色基础 × (1+天赋) + 芯片；皮肤加成 */
    const armorUp = this.talentVal(p, 'armor') + this.chipVal(p, 'armor')
      + ((sk && sk.bonus && sk.bonus.armor) || 0);
    const armor = c.armor * (1 + armorUp);
    /* 暴击 */
    const crit = Math.min(0.85, c.crit + this.talentVal(p, 'crit') + this.chipVal(p, 'crit')
      + ((sk && sk.bonus && sk.bonus.crit) || 0) + this.gunStatVal(p, 'crit'));
    const critDmg = 1.5 + this.chipVal(p, 'critDmg');
    /* 移速 */
    const spdUp = this.chipVal(p, 'spd') + ((sk && sk.bonus && sk.bonus.spd) || 0);
    const moveSpd = c.spd * this.SPD_MUL * (1 + spdUp);
    return {
      atk, hp: Math.round(hp), gunBase, armor: Math.round(armor),
      rate: g.rate * (1 + this.chipVal(p, 'rate') + this.gunStatVal(p, 'rate')),
      mag: g.mag + Math.round(this.gunStatVal(p, 'mag')),
      pierce: g.pierce + Math.floor(this.gunStatVal(p, 'pierce')),
      pellets: g.pellets || 1, range: 300, spread: 0,
      crit, critDmg,
      moveSpd: Math.round(moveSpd),
      ls: this.talentVal(p, 'ls') + this.chipVal(p, 'ls'),
      revive: Math.floor(p.talents.t_revive || 0),
      goldMul: 1 + this.talentVal(p, 'gold'),
      xpMul: 1 + this.talentVal(p, 'xp') + this.buildVal(p, 'xp'),
      charName: c.n, gunName: g.n,
    };
  },
  power(p) {
    const a = this.attrs(p);
    return Math.round(a.atk * 12 + a.hp * 0.6 + p.gunLv * 60
      + Object.keys(p.chips || {}).length * 220
      + Object.values(p.talents || {}).reduce((s, v) => s + v, 0) * 90);
  },

  /* =================================================
   * 关卡结算 / 星级
   * ================================================ */
  starsFor(hpRatio) { return hpRatio > 0.6 ? 3 : hpRatio > 0.3 ? 2 : 1; },
  clearLevel(p, id, hpRatio) {
    const st = this.starsFor(hpRatio);
    p.cleared[id] = Math.max(p.cleared[id] || 0, st);
    /* 解锁下一关（关卡表 unlock 链自动生效） */
    const nx = this.nextLevel(id);
    if (nx) p.curLevel = nx;
    return st;
  },
  totalStars(p) { return Object.values(p.cleared || {}).reduce((s, v) => s + v, 0); },
  /* 无尽解锁：通关 3-3 */
  endlessUnlocked(p) { return !!p.cleared[EX.ENDLESS_UNLOCK]; },
  /* 各系统解锁（资料 05 表） */
  sysUnlocked(p, k) {
    switch (k) {
      case 'gun': return !!p.cleared['1-2'];      // 武器养成 通关1-2
      case 'chip': return !!p.cleared['1-4'];     // 芯片装配 通关1-4
      case 'talent': return !!p.cleared['1-3'];   // 永久天赋 通关1-3
      case 'endless': return !!p.cleared['3-3'];  // 无尽 通关3-3
      default: return true;
    }
  },

  /* =================================================
   * 任务（资料任务表：主线3/每日3/每周2/成就4）
   * ================================================ */
  dailyKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  weekKey() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;              // 周一为 0
    d.setDate(d.getDate() - day);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  },
  resetTasks(p) {
    const dk = this.dailyKey(), wk = this.weekKey();
    if (p.tasks.dailyDate !== dk) { p.tasks.dailyDate = dk; p.tasks.dailyClaimed = []; p.tasks.dailyProg = {}; }
    if (p.tasks.weeklyKey !== wk) { p.tasks.weeklyKey = wk; p.tasks.weeklyClaimed = []; p.tasks.weeklyProg = {}; }
  },
  /* 各类进度值 */
  taskVal(p, t) {
    const st = p.stats || {};
    const dp = p.tasks.dailyProg || {}, wp = p.tasks.weeklyProg || {};
    switch (t) {
      case 'clearLv': return 0;                       // 由具体 id 判断
      case 'kills': return st.kills || 0;
      case 'login': return 1;
      case 'dailyClear': return dp.clear || 0;
      case 'dailyKill': return dp.kill || 0;
      case 'weekClear': return wp.clear || 0;
      case 'weekKill': return wp.kill || 0;
      case 'noHitKill': return st.noHitBest || 0;
      case 'bossKill': return st.bossKill || 0;
      case 'endlessTime': return p.endlessTime || 0;
      default: return 0;
    }
  },
  taskDone(p, t) {
    if (t.cond.t === 'clearLv') return !!p.cleared[t.cond.v];
    return this.taskVal(p, t.cond.t) >= t.cond.v;
  },
  taskProg(p, t) {
    if (t.cond.t === 'clearLv') return p.cleared[t.cond.v] ? 1 : 0;
    return Math.min(this.taskVal(p, t.cond.t), t.cond.v);
  },
  claimTask(p, type, id) {
    const list = (EX.tasks[type] || []);
    const t = list.find((x) => x.id === id); if (!t) return { ok: false, msg: '任务不存在' };
    if (!this.taskDone(p, t)) return { ok: false, msg: '尚未完成' };
    const key = { main: 'mainClaimed', daily: 'dailyClaimed', weekly: 'weeklyClaimed', achieve: 'achieveClaimed' }[type];
    p.tasks[key] = p.tasks[key] || [];
    if (p.tasks[key].indexOf(id) >= 0) return { ok: false, msg: '已领取' };
    p.tasks[key].push(id);
    let txt = [];
    for (const k in t.rw) {
      const v = t.rw[k];
      if (k === 'gold') p.gold += v;
      else if (k === 'diamond') p.diamond += v;
      else if (k === 'ach') p.ach = (p.ach || 0) + v;
      else p.mat[k] = (p.mat[k] || 0) + v;
      txt.push(this.itemName(k) + '+' + v);
    }
    return { ok: true, msg: '✅ ' + t.n + '：' + txt.join(' ') };
  },
  /* 战斗后推进任务计数 */
  pushStats(p, { kills, clear, boss, noHit, endlessSec }) {
    const st = p.stats;
    st.kills = (st.kills || 0) + (kills || 0);
    if (boss) st.bossKill = (st.bossKill || 0) + boss;
    if (noHit) st.noHitBest = Math.max(st.noHitBest || 0, noHit);
    if (endlessSec) p.endlessTime = Math.max(p.endlessTime || 0, Math.floor(endlessSec));
    this.resetTasks(p);
    const dp = p.tasks.dailyProg, wp = p.tasks.weeklyProg;
    if (clear) { dp.clear = (dp.clear || 0) + 1; wp.clear = (wp.clear || 0) + 1; }
    dp.kill = (dp.kill || 0) + (kills || 0);
    wp.kill = (wp.kill || 0) + (kills || 0);
  },

  /* =================================================
   * 广告（资料广告位：每日上限）
   * ================================================ */
  adLeft(p, adId) {
    this.resetTasks(p);
    const d = EX.ads.find((x) => x.id === adId); if (!d) return 0;
    p.adUsed = p.adUsed || {};
    if (p.adDate !== this.dailyKey()) { p.adDate = this.dailyKey(); p.adUsed = {}; }
    return Math.max(0, d.limit - (p.adUsed[adId] || 0));
  },
  useAd(p, adId) {
    if (this.adLeft(p, adId) <= 0) return { ok: false, msg: '今日次数已用完' };
    p.adUsed[adId] = (p.adUsed[adId] || 0) + 1;
    return { ok: true };
  },
};

window.E = E;
