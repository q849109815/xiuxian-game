/* =========================================================
 * engine.js —— 养成引擎
 * 依据资料：GD-003角色 / GD-004武器 / GD-005技能天赋 /
 *   GD-007关卡 / GD-009芯片 / GD-010基地 / GD-011任务 /
 *   GD-017数值 / 伤害公式(10) / 成长曲线 / 解锁条件
 * ========================================================= */

const E = {
  /* 武器：线性成长，每级 +20%；每 5 级进阶一次 */
  GUN_GROW: 0.20,
  /* =========================================================
   * 数值平衡常数（卡关 → 攒金币 → 升级武器 → 突破 循环）
   * ========================================================= */
  GUN_GROW_RATE: 1.078,      /* 武器攻击复利率：每级 ×1.078 */
  GUN_COST_RATE: 1.16,       /* 武器升级费复利率（原 1.28 过快，Lv84 即卡死）*/
  GUN_COST_BASE: 300,
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
      lv: 1, xp: 0, tp: 3,
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
      mercs: [],              // 已招募佣兵（酒馆）
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
  /* 判空防御：p 为空时会抛 "Cannot read properties of null (reading 'char')"，
   * 例如军团面板在未加入分支里用 this.P（尚未赋值）调用 E.power(this.P)，
   * 首次渲染即整页崩溃。 */
  char(p) {
    if (!p) return EX.chars[0];
    return EX.chars.find((c) => c.id === p.char) || EX.chars[0];
  },
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
    try { this.codexUnlock(p, 'skin', skinId); } catch (e) {}
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
    try { this.codexUnlock(p, 'gun', id); } catch (e) {}
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
  /* 武器升级费用：300 × 1.16^(lv-1)
   * 原 1.28 增长过快：Lv80 需 1170亿、Lv84 金币不足永久卡死 */
  gunUpgradeCost(p) {
    return Math.round(this.GUN_COST_BASE * Math.pow(this.GUN_COST_RATE, p.gunLv - 1));
  },
  upgradeGun(p) {
    const c = this.gunUpgradeCost(p);
    if (p.gold < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
    p.gold -= c; p.gunLv++;
    const oldA = this.advOf(p.gunLv - 1), newA = this.advOf(p.gunLv);
    let extra = '';
    if (newA > oldA) {
      p.gunAdv = newA;
      /* 进阶解锁新词条槽（表30：按品质加权 蓝60%/紫30%/红10%） */
      const slot = EX.gunAdvance[newA].slot;
      const st = this.rollGunAffix(p, p.gun);
      p.gunStats = p.gunStats || {};
      p.gunStats['s' + slot] = { id: st.id, k: st.k, n: st.n, q: st.q, v: +(st.v * (1 + newA * 0.5)).toFixed(4) };
      extra = ' ⬆进阶至' + EX.gunAdvance[newA].q + '品，解锁词条：' + st.n;
    }
        this.logAct(p, 'gunup', '武器升级 Lv.' + p.gunLv);
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
  /* 天赋点：每 10 级 +1（表25 #1「每10级解锁新技能槽」），初始赠送 3 点 */
  TP_INIT: 3,
  tpOf(p) { return p.tp == null ? this.TP_INIT : (p.tp || 0); },
  upTalent(p, id) {
    const t = EX.talents.find((x) => x.id === id); if (!t) return { ok: false, msg: '天赋不存在' };
    if (!this.talentUnlocked(p, id)) return { ok: false, msg: '需通关 ' + t.unlock + ' 解锁' };
    const cur = p.talents[id] || 0;
    if (cur >= t.max) return { ok: false, msg: '已达最高等级' };
    /* BUG修复：此前天赋点只发不扣、且不足时不拦截，导致可无限刷属性。
     * 表25 #7「金币点选」→ 金币为主消耗；天赋点为额外门槛（每10级+1） */
    const tp = this.tpOf(p);
    if (tp <= 0) return { ok: false, msg: '天赋点不足（每升 10 级 +1 点）' };
    const c = this.talentCost(p, id);
    if (p.gold < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
    p.gold -= c; p.tp = tp - 1; p.talents[id] = cur + 1;
    return { ok: true, msg: '⭐ ' + t.n + ' Lv.' + p.talents[id] + '（剩 ' + p.tp + ' 天赋点）' };
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
  /* =========================================================
   * 表34 离线挂机产出表（P1）
   * 此前只产金币；文档要求同时产出「金属 + 经验」，且上限 8 小时
   * 场景档位按已通关最高章节自动匹配：
   *   ≥5 章 → 已通关最高关卡（金币50-200/金属2-5/经验100-300）
   *   ≥2 章 → 已通关普通关（金币30-80/金属1-3/经验80-150）
   *   其余   → 挂机关卡1-1（金币20-40/金属1/经验50-80）
   * ========================================================= */
  OFFLINE_TIERS: [
    { minCh: 5, gold: [50, 200], metal: [2, 5], xp: [100, 300], n: '最高关卡' },
    { minCh: 2, gold: [30, 80], metal: [1, 3], xp: [80, 150], n: '普通关' },
    { minCh: 0, gold: [20, 40], metal: [1, 1], xp: [50, 80], n: '关卡 1-1' },
  ],
  /* 巡逻收益（远征堡垒）：按已解锁章节取档位
   * BUG修复：p.patrolRate 从没被赋值过，UI 里一直用 `p.patrolRate || 16`，
   *          导致无论玩家打到第几章，巡逻收益永远是 16 金币/小时，
   *          表 patrolRateByCh（16→250）形同废纸 */
  patrolRateOf(p) {
    const arr = (EX.patrolRateByCh || [16]);
    /* chapterOf 收的是关卡 id，不是玩家对象 */
    const ch = Math.max(1, Math.min(arr.length, this.chapterOf(p.curLevel || '1-1') || 1));
    return arr[ch - 1];
  },
  syncPatrol(p) {
    const r = this.patrolRateOf(p);
    if (p.patrolRate !== r) p.patrolRate = r;
    return p.patrolRate;
  },
  offlineTier(p) {
    const ch = this.maxChapter ? this.maxChapter(p) : 1;
    let maxCh = 1;
    for (const id in (p.cleared || {})) {
      const c = Number(String(id).split('-')[0]) || 1;
      if (c > maxCh) maxCh = c;
    }
    const use = Math.max(ch, maxCh);
    return this.OFFLINE_TIERS.find((t) => use >= t.minCh) || this.OFFLINE_TIERS[2];
  },
  /* 返回 {hrs, gold, metal, xp, tier}，仅计算不发放 */
  offlineCalc(p) {
    const b = EX.buildings.find((x) => x.id === 'warehouse');
    const lv = p.build.warehouse || 1;
    const t = this.offlineTier(p);
    const hrsRaw = (Date.now() - (p.offlineAt || Date.now())) / 3600000;
    const hrs = Math.min(8, Math.max(0, hrsRaw));           /* 表34：上限 8 小时 */
    if (hrs < 0.05) return { hrs: 0, gold: 0, metal: 0, xp: 0, tier: t };
    const mul = lv;                                          /* 仓库等级放大金币 */
    const pick = (r) => Math.round((r[0] + (r[1] - r[0]) * 0.6) * hrs);
    return {
      hrs, tier: t,
      gold: pick(t.gold) * mul,
      metal: pick(t.metal),
      xp: pick(t.xp),
    };
  },
  /* 兼容旧调用：只返回金币 */
  offlineIncome(p) { return this.offlineCalc(p).gold; },
  /* 领取离线收益（金币 + 金属 + 经验） */
  offlineClaim(p) {
    const c = this.offlineCalc(p);
    if (c.gold <= 0 && c.metal <= 0 && c.xp <= 0) {
      p.offlineAt = Date.now();
      return { ok: false, msg: '离线时间太短，暂无可领收益' };
    }
    p.gold = (p.gold || 0) + c.gold;
    p.mat.M01 = (p.mat.M01 || 0) + c.metal;
    p.offlineAt = Date.now();
    if (c.xp > 0) { try { this.addExp(p, c.xp); } catch (e) {} }
    const h = Math.floor(c.hrs), m = Math.round((c.hrs - h) * 60);
    return { ok: true, msg: `离线 ${h}小时${m}分（${c.tier.n}）：金币 +${c.gold} 金属 +${c.metal} 经验 +${c.xp}` };
  },

  /* =========================================================
   * 表25 #1 角色等级：击杀经验升级，前期快后期慢（对数曲线）
   * 此前 p.xp 一直在累加，但 p.lv 永远停在 1 —— 升级系统完全没实现
   * 每级 +生命 +攻击；每 10 级 +1 天赋点（表25：每10级解锁新技能槽）
   * ========================================================= */
  xpNeed(lv) {
    return Math.round(50 * Math.pow(Math.max(1, lv), 1.45));   /* 对数曲线 */
  },
  addXp(p, amt) {
    amt = Math.round(Number(amt) || 0);
    if (amt <= 0) return { ok: false, lv: p.lv, ups: 0 };
    p.xp = (p.xp || 0) + amt;
    let ups = 0, guard = 0;
    while (guard++ < 200) {
      const need = this.xpNeed(p.lv || 1);
      if ((p.xp || 0) < need) break;
      p.xp -= need;
      p.lv = (p.lv || 1) + 1;
      ups++;
      p.lvBonusHp = (p.lvBonusHp || 0) + 80;   /* 每级 +生命 */
      p.lvBonusAtk = (p.lvBonusAtk || 0) + 6;  /* 每级 +攻击 */
      if (p.lv % 10 === 0) p.tp = (p.tp || 0) + 1;   /* 每10级 +1天赋点 */
    }
    if (ups > 0) {
      try { if (window.UI && UI.showLvUp) UI.showLvUp(p.lv, 0); } catch (e) {}
      try { OPS.track('level_up', { lv: p.lv }); } catch (e) {}
    }
    return { ok: true, lv: p.lv, ups, msg: ups > 0 ? ('升级！Lv.' + p.lv + (ups > 1 ? '（连升 ' + ups + ' 级）' : '')) : '' };
  },
  xpProgress(p) {
    const need = this.xpNeed(p.lv || 1);
    return { cur: Math.floor(p.xp || 0), need, pct: Math.min(100, (p.xp || 0) / need * 100) };
  },

  /* =================================================
   * 属性汇总（资料伤害公式）
   * 基础伤害 = 武器伤害 × (1 + 攻击强化%)
   * ================================================ */
  attrs(p) {
    const c = this.char(p), g = this.gun(p);
    const sk = this.skin(p);
    /* 武器面板伤害：复利（指数）成长
     * 原为线性 `1 + (gunLv-1) * GUN_GROW`，导致：
     *   攻击 Lv1=26 → Lv80=441（仅 17 倍）
     *   费用 Lv1=300 → Lv80=1170亿（39 亿倍）
     * 收益线性 vs 成本指数 → Lv84 永久卡死，且后期越打越轻松。
     * 改复利后收益与成本同为指数，卡关→攒金币→升级→突破 的循环才成立。 */
    const gunBase = g.dmg * Math.pow(this.GUN_GROW_RATE || 1.078, p.gunLv - 1);
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
    /* 武器词条加成（表30） */
    const af = this.affixBonus(p);
    /* 武器自带暴击/暴伤（表44） */
    const gCrit = (g && g.crit) || 0, gCritDmg = (g && g.critDmg) || 1.5;
    const crit = Math.min(0.85, c.crit + gCrit + af.crit + this.talentVal(p, 'crit') + this.chipVal(p, 'crit')
      + ((sk && sk.bonus && sk.bonus.crit) || 0) + this.gunStatVal(p, 'crit'));
    const critDmg = gCritDmg + af.critDmg + this.chipVal(p, 'critDmg');
    /* 移速 */
    const spdUp = this.chipVal(p, 'spd') + ((sk && sk.bonus && sk.bonus.spd) || 0);
    const moveSpd = c.spd * this.SPD_MUL * (1 + spdUp);
    return {
      /* 表25 #1：角色等级成长（每级 +攻击6 / +生命80） */
      atk: ((atk + (p.lvBonusAtk || 0)) * (1 + af.dmg) * (1 + this.gemBonus(p).atkPct)) * (1 + EX.starBonus(p.charStar)),
      hp: ((Math.round(hp) + (p.lvBonusHp || 0)) * (1 + this.gemBonus(p).hpPct)) * (1 + EX.starBonus(p.charStar)),
      gunBase, armor: Math.round(armor),
      mag: g.mag + af.mag + Math.round(this.gunStatVal(p, 'mag')),
      pierce: g.pierce + af.pierce + Math.floor(this.gunStatVal(p, 'pierce')),
            /* 射程 300→380：僵尸从上方走到射程边缘约需 8 秒（spd 58），
       * 射程太短导致每波实际射击窗口仅 6 秒，玩家清不完一波就超时推进，
       * 僵尸逐波累积 → 防线必破（实测 1-1 也过不去，防线 160/636） */
      pellets: (g.pellets || 1) + af.extra, range: 380, spread: 0,
      crit: Math.min(0.85, crit + this.gemBonus(p).crit),
      critDmg: critDmg + this.gemBonus(p).critDmg,
      rate: g.rate * (1 + af.rate + this.chipVal(p, 'rate') + this.gunStatVal(p, 'rate') + this.gemBonus(p).ratePct),
      moveSpd: Math.round(moveSpd),
      /* 词条额外项：吸血 / 换弹 / 爆炸范围 / 双倍概率 */
      reloadCut: af.reload, erMul: 1 + af.er, doubleChance: af.double,
      /* 表44 伤害浮动区间：必须随武器等级等比缩放
       * 严重BUG：此前直接返回表里写死的 g.dmgMin/g.dmgMax（突击步枪 22-28），
       * 而 battle.shoot() 命中区间后 `dmg = dmgMin + rand*(dmgMax-dmgMin)`，
       * 会完全覆盖按武器等级算出的伤害 —— 结果武器从 Lv1 升到 Lv80，
       * 每发子弹始终是 22~28 点，升级对伤害毫无影响。
       * 正确做法：把区间按 gunBase 等比放大（22/25=0.88 ~ 28/25=1.12） */
      dmgMin: (g.dmgMin != null && g.dmg) ? gunBase * (g.dmgMin / g.dmg) : null,
      dmgMax: (g.dmgMax != null && g.dmg) ? gunBase * (g.dmgMax / g.dmg) : null,
      ls: this.talentVal(p, 'ls') + this.chipVal(p, 'ls') + af.lifesteal + this.gemBonus(p).ls,
      revive: Math.floor(p.talents.t_revive || 0),
      goldMul: 1 + this.talentVal(p, 'gold'),
      xpMul: 1 + this.talentVal(p, 'xp') + this.buildVal(p, 'xp'),
      charName: c.n, gunName: g.n,
    };
  },
  power(p) {
    const a = this.attrs(p);
    const gb = this.gemBonus(p);
    const eq = p.equip || {};
    const eqP = Object.values(eq).reduce((s, e) => s + (e.lv || 0) * 45 + (e.adv || 0) * 160, 0);
    /* BUG修复：a.atk / a.hp 里已经乘过宝石百分比，
     * 这里再 `(a.atk * gb.atkPct) * 6` 属于重复计算宝石加成。
     * 同时战力只认攻击/生命，导致镶嵌紫宝石（暴伤+攻速）战力纹丝不动，
     * 与"战力代表强度"的直觉不符 —— 补上暴击/暴伤/攻速/吸血权重 */
    return Math.round(a.atk * 12 + a.hp * 0.6 + p.gunLv * 60
      + Object.keys(p.chips || {}).length * 220
      + Object.values(p.talents || {}).reduce((s, v) => s + v, 0) * 90
      + a.crit * 800 + Math.max(0, a.critDmg - 1.5) * 200
      + a.rate * 15 + a.ls * 500
      + eqP) * (1 + EX.starBonus(p.charStar));
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
    /* 通关后同步巡逻收益档位（进入新章节时提升） */
    try { this.syncPatrol(p); } catch (e) {}
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
  /* 把 YYYYMMDD 整数转成时间戳，算出真实相隔天数（跨月/跨年也正确） */
  ymdToTs(n) {
    const y = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100;
    return Date.UTC(y, m - 1, d);
  },
  dayDiff(a, b) {
    if (!a || !b) return 999;
    return Math.round((this.ymdToTs(b) - this.ymdToTs(a)) / 864e5);
  },
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
  /* =========================================================
   * 表35 礼包限购判定
   * 支持：once 一次性 / daily 每日 / weekly 每周 / monthly 每月
   *      level 按关卡等级分批 / bossFirst 首杀BOSS后免费领
   * ========================================================= */
  giftKey(g) {
    const t = (g.limit && g.limit.t) || 'once';
    if (t === 'daily') { const d = new Date(Date.now() + 8 * 3600000); return d.toISOString().slice(0, 10); }
    if (t === 'weekly') {
      const d = new Date(Date.now() + 8 * 3600000);
      const y = new Date(Date.now() + 8 * 3600000);
      const day = (d.getUTCDay() + 6) % 7;            /* 周一为一周起点 */
      y.setUTCDate(d.getUTCDate() - day);
      return y.toISOString().slice(0, 10);
    }
    if (t === 'monthly') { const d = new Date(Date.now() + 8 * 3600000); return d.toISOString().slice(0, 7); }
    return 'all';                                      /* once / level / bossFirst */
  },

  /* 返回 {ok, msg, left} —— ok 表示还能买 */
  giftCan(p, g) {
    const L = g.limit || { t: 'once', v: 1 };
    const rec = (p.giftBuy || (p.giftBuy = {}))[g.id] || { n: 0, k: '' };
    const k = this.giftKey(g);

    if (L.t === 'level') {
      /* 每通关 v 关可领 1 次
       * 注意：curLevel() 返回的是关卡ID字符串（如 "1-1"），不能直接参与运算，
       *       此前用它做除法得到 NaN，导致提示"再通 NaN 关解锁" */
      const lv = Object.keys(p.cleared || {}).length;
      const allow = Math.floor(lv / (L.v || 5));
      const left = Math.max(0, allow - rec.n);
      return left > 0 ? { ok: true, left, msg: '可领 ' + left + ' 次' }
                      : { ok: false, left: 0, msg: '再通 ' + ((rec.n + 1) * (L.v || 5) - lv) + ' 关解锁' };
    }
    if (L.t === 'bossFirst') {
      const bk = (p.stats && p.stats.bossKill) || 0;
      if (bk <= 0) return { ok: false, left: 0, msg: '需先击杀 1 个 BOSS' };
      if (rec.n >= (L.v || 1)) return { ok: false, left: 0, msg: '已领取' };
      return { ok: true, left: 1, msg: '免费领取' };
    }
    /* 周期型：周期 key 变了就重置计数 */
    const used = (rec.k === k) ? rec.n : 0;
    const left = Math.max(0, (L.v || 1) - used);
    const nameMap = { once: '限购', daily: '今日', weekly: '本周', monthly: '本月' };
    return left > 0 ? { ok: true, left, msg: (nameMap[L.t] || '') + '可买 ' + left + ' 次' }
                    : { ok: false, left: 0, msg: (nameMap[L.t] || '') + '已售罄' };
  },

  /* =========================================================
   * 表22 活动 EV04 首充双倍：首次充值钻石翻倍（仅 1 次）
   * ========================================================= */
  firstRechargeUsed(p) { return !!p.firstRech; },
  /* 购买钻石类商品时调用，返回实际发放数量 */
  applyFirstRecharge(p, diamondAmt) {
    if (p.firstRech) return { amt: diamondAmt, doubled: false };
    if (diamondAmt <= 0) return { amt: diamondAmt, doubled: false };
    p.firstRech = 1;
    return { amt: diamondAmt * 2, doubled: true };
  },

  /* =========================================================
   * 表22 活动 EV02 BOSS突袭：每日 3 次挑战
   * ========================================================= */
  bossRaidLeft(p) {
    const d = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if ((p.bossRaidDate || '') !== d) return 3;
    return Math.max(0, 3 - (p.bossRaidUsed || 0));
  },
  bossRaidStart(p) {
    if (this.bossRaidLeft(p) <= 0) return { ok: false, msg: '今日挑战次数已用完（每日 3 次）' };
    const d = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if ((p.bossRaidDate || '') !== d) { p.bossRaidDate = d; p.bossRaidUsed = 0; }
    p.bossRaidUsed = (p.bossRaidUsed || 0) + 1;
    return { ok: true, msg: 'BOSS突袭开始！剩余 ' + this.bossRaidLeft(p) + ' 次' };
  },

  /* =========================================================
   * 表16 消耗品使用（I01 急救包 / I02 护盾发生器 / I03 攻击增幅药剂 / I04 宝箱）
   * 此前数据在背包里但无任何使用入口（P0/P1 内容缺失）
   * 战斗中立即生效；战斗外使用则记为「下一场生效」的预置增益
   * ========================================================= */
  ITEM_USE: {
    I01: { n: '急救包', desc: '恢复防线生命 50%', battle: true },
    I02: { n: '护盾发生器', desc: '获得护盾（吸收伤害）', battle: true },
    I03: { n: '攻击增幅药剂', desc: '攻击 +30%，持续 30 秒', battle: true },
    I04: { n: '宝箱', desc: '开启获得材料', battle: false },
  },

  /* 使用消耗品。返回 {ok,msg} */
  useItem(p, id) {
    const def = this.ITEM_USE[id];
    if (!def) return { ok: false, msg: '该物品不可使用' };
    if ((p.mat[id] || 0) <= 0) return { ok: false, msg: '数量不足' };

    /* I04 宝箱：直接开（表31 DR11） */
    if (id === 'I04') {
      p.mat[id]--;
      const rw = this.openBox(p, 1);
      return { ok: true, msg: '开启宝箱：' + rw };
    }

    const inBattle = !!(window.BT && BT.run && !BT.over);
    if (inBattle) {
      const r = this.applyItem(p, id);
      if (!r.ok) return r;
      p.mat[id]--;
      return { ok: true, msg: def.n + '：' + def.desc };
    }
    /* 战斗外：预置到下一场 */
    p.mat[id]--;
    p.pendingItem = p.pendingItem || {};
    p.pendingItem[id] = (p.pendingItem[id] || 0) + 1;
    return { ok: true, msg: def.n + ' 已准备，进入下一场战斗自动生效' };
  },

  /* 实际生效（战斗内调用） */
  applyItem(p, id) {
    const r = window.BT && BT.run;
    if (!r) return { ok: false, msg: '未在战斗中' };
    if (id === 'I01') {
      const heal = Math.round((r.wallMax || r.maxHp || 1000) * 0.5);
      r.wallHp = Math.min((r.wallMax || r.maxHp), (r.wallHp || 0) + heal);
      r.hp = r.wallHp;
      return { ok: true, heal };
    }
    if (id === 'I02') {
      const sh = Math.round((r.wallMax || r.maxHp || 1000) * 0.3);
      r.shield = (r.shield || 0) + sh;
      r.maxShield = Math.max(r.maxShield || 0, r.shield);
      return { ok: true, shield: sh };
    }
    if (id === 'I03') {
      r.buffAtk = 0.30;
      r.buffAtkT = 30;                 /* 30 秒 */
      return { ok: true, atk: 0.3 };
    }
    return { ok: false, msg: '不可在战斗中使用' };
  },

  /* 战斗开始时应用预置消耗品 */
  applyPendingItems(p) {
    const pd = p.pendingItem || {};
    let n = 0;
    for (const id in pd) {
      const c = pd[id] || 0;
      for (let i = 0; i < c; i++) { if (this.applyItem(p, id).ok) n++; }
    }
    if (n) p.pendingItem = {};
    return n;
  },

  /* I04 开箱（表31 DR11：合金 70% 3-5 个） */
  openBox(p, n) {
    n = Math.max(1, Math.min(10, n | 0));
    if ((p.mat.I04 || 0) < n) return '宝箱数量不足';
    p.mat.I04 -= n;
    let total = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.70) {
        const c = 3 + Math.floor(Math.random() * 3);      /* 3-5 */
        p.mat.M02 = (p.mat.M02 || 0) + c; total += c;
      }
    }
    return total > 0 ? ('合金 ×' + total) : '未获得材料（下次再试）';
  },

  /* =========================================================
   * 表19 月卡（SH05）：购买后 30 天内每日领 钻石50 + 体力60
   * ========================================================= */
  monthCardLeft(p) {
    const mc = p.monthCard;
    if (!mc || !mc.until) return 0;
    if (Date.now() > mc.until) return 0;
    return Math.ceil((mc.until - Date.now()) / 86400000);
  },
  /* 每日领取，返回 {ok,msg} */
  monthCardClaim(p) {
    if (this.monthCardLeft(p) <= 0) return { ok: false, msg: '月卡未开通或已过期' };
    const d = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (p.monthCard.last === d) return { ok: false, msg: '今日已领取' };
    p.monthCard.last = d;
    p.diamond = (p.diamond || 0) + 50;
    this.addStamina(p, 60);
    return { ok: true, msg: '月卡奖励：钻石+50 体力+60（剩 ' + this.monthCardLeft(p) + ' 天）' };
  },

  /* =========================================================
   * 表19 战令（SH06 普通 / SH07 进阶）：按通关关卡数解锁奖励档位
   * ========================================================= */
  PASS_TIERS: [
    { lv: 1, n: '金币×1000', rw: { gold: 1000 } },
    { lv: 3, n: '金属×30', rw: { M01: 30 } },
    { lv: 5, n: '钻石×50', rw: { diamond: 50 } },
    { lv: 10, n: '合金×20', rw: { M02: 20 } },
    { lv: 15, n: '钻石×100', rw: { diamond: 100 } },
    { lv: 20, n: '枪械碎片×20', rw: { P01: 20 } },
    { lv: 30, n: '稀有金属×10', rw: { M03: 10 } },
    { lv: 40, n: '钻石×200', rw: { diamond: 200 } },
    { lv: 50, n: '传说芯片×1', rw: { chipL: 1 } },
  ],
  passLevel(p) { return Object.keys(p.cleared || {}).length; },
  /* adv=true 才能领进阶档（含额外钻石） */
  passClaim(p, lvIdx, adv) {
    const t = this.PASS_TIERS[lvIdx];
    if (!t) return { ok: false, msg: '档位不存在' };
    if (this.passLevel(p) < t.lv) return { ok: false, msg: '通关 ' + t.lv + ' 关解锁' };
    const key = 'p' + lvIdx + (adv ? 'a' : 'n');
    const got = ((p.passClaimed || (p.passClaimed = {}))[key]);
    if (got) return { ok: false, msg: '已领取' };
    if (adv && !(p.passAdv)) return { ok: false, msg: '需先购买进阶战令' };
    p.passClaimed[key] = 1;
    for (const k in t.rw) {
      if (k === 'gold') p.gold = (p.gold || 0) + t.rw[k];
      else if (k === 'diamond') p.diamond = (p.diamond || 0) + t.rw[k];
      else if (/^chip/.test(k)) {
        p.bag = p.bag || [];
        try { const c = this.rollChipById ? this.rollChipById('l') : null; if (c) p.bag.push(c); } catch (e) {}
      }
      else p.mat[k] = (p.mat[k] || 0) + t.rw[k];
    }
    if (adv) p.diamond = (p.diamond || 0) + 30;         /* 进阶额外奖励 */
    return { ok: true, msg: '战令 Lv.' + t.lv + '：' + t.n };
  },

  /* ===== 表24 广告位 AD04 免费抽奖 / AD05 开箱 ===== */
  /* 免费抽奖：随机产出，稀有度权重固定 */
  adDraw(p) {
    const pool = [
      { w: 40, t: 'gold', v: 800, n: '金币 ×800' },
      { w: 25, t: 'mat', k: 'M01', v: 20, n: '金属 ×20' },
      { w: 15, t: 'mat', k: 'M02', v: 10, n: '合金 ×10' },
      { w: 10, t: 'diamond', v: 20, n: '钻石 ×20' },
      { w: 7, t: 'mat', k: 'M03', v: 5, n: '稀有金属 ×5' },
      { w: 3, t: 'chip', v: 1, n: '芯片 ×1' },
    ];
    const tot = pool.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * tot, hit = pool[0];
    for (const x of pool) { if (r < x.w) { hit = x; break; } r -= x.w; }
    if (hit.t === 'gold') p.gold = (p.gold || 0) + hit.v;
    else if (hit.t === 'diamond') p.diamond = (p.diamond || 0) + hit.v;
    else if (hit.t === 'chip') {
      p.bag = p.bag || [];
      try { const c = this.rollChipById ? this.rollChipById('e') : null; if (c) p.bag.push(c); }
      catch (e) { p.mat.M03 = (p.mat.M03 || 0) + 2; }
    }
    else p.mat[hit.k] = (p.mat[hit.k] || 0) + hit.v;
    return { ok: true, n: hit.n };
  },

  /* 额外宝箱（AD05）：给宝箱道具，可在背包开启 */
  adBoxReward(p) {
    p.mat = p.mat || {};
    p.mat.I04 = (p.mat.I04 || 0) + 1;          /* I04 = 宝箱，背包可开启 */
    return { ok: true, n: '宝箱 ×1（背包内开启）' };
  },

  /* 记录一次购买 */
  giftMark(p, g) {
    const rec = (p.giftBuy || (p.giftBuy = {}))[g.id] || { n: 0, k: '' };
    const k = this.giftKey(g);
    const L = g.limit || { t: 'once', v: 1 };
    if (L.t === 'level' || L.t === 'once' || L.t === 'bossFirst') {
      p.giftBuy[g.id] = { n: rec.n + 1, k: 'all' };
    } else {
      p.giftBuy[g.id] = (rec.k === k) ? { n: rec.n + 1, k } : { n: 1, k };
    }
  },

  /* 存档保存（转发到 MAIN.save）
   * 修复：ui.js 中 15 处 E.save(p) 调用此前因方法不存在而抛错，
   * 导致"提示已雇佣/已加入"但数据实际未保存、后续界面刷新也被中断 */
  save(p) {
    try {
      if (p && window.P === p) P = p;         /* 确保全局引用同步 */
      if (window.MAIN && typeof MAIN.save === 'function') {
        const r = MAIN.save();
        if (r && typeof r.catch === 'function') r.catch(() => {});
        return true;
      }
      /* 兜底：MAIN 不可用时直接写本地 */
      if (p && window.Net && window.MAIN && MAIN.savePath) {
        Net.write(MAIN.savePath, p).catch(() => {});
        return true;
      }
      return false;
    } catch (e) { return false; }
  },

  taskDone(p, t) {
    if (t.cond.t === 'clearLv') return !!p.cleared[t.cond.v];
    return this.taskVal(p, t.cond.t) >= t.cond.v;
  },
  /* 每日签到（UTC+8 跨天，防改系统时间） */
  sign(p) {
    const now = Date.now();
    if (p.signLast && now < p.signLast - 3600000) {
      return { ok: false, msg: '时间异常，无法签到' };
    }
    const d = new Date(now + 8 * 3600000);
    const today = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    if (p.signDay === today) return { ok: false, msg: '今日已签到' };
    /* 严重 BUG 修复：此前用 YYYYMMDD 两个整数相减是否为 1 判断「连续」。
     * 9月30日(20260930) → 10月1日(20261001) 差值是 71，不是 1；
     * 12月31日 → 1月1日 差值是 8870。
     * 结果：只要签到跨月或跨年，连续天数一律归零 —— 玩家攒的进度凭空消失。
     * 现在改成按「真实日期差」判断，跨月跨年都能正确延续。 */
    const cont = (p.signDay && this.dayDiff(p.signDay, today) === 1);
    const cnt = cont ? p.signDays : 0;
    p.signDays = Math.min(7, (cnt || 0) + 1);
    p.signDay = today; p.signLast = now;
    const rw = { gold: 100 * p.signDays, diamond: p.signDays >= 7 ? 50 : 0 };
    p.gold += rw.gold; p.diamond += rw.diamond;
    return { ok: true, msg: '签到成功 第' + p.signDays + '天 🪙' + rw.gold + (rw.diamond ? ' 💎' + rw.diamond : '') };
  },

  /* =========================================================
   * 扫荡系统（表29：已通关关卡快速扫荡，消耗体力）
   * ======================================================== */
  canSweep(p, lvId) {
    /* BUG修复：通关记录写在 p.cleared[id]，此前读的是从未赋值的 p.stars，
     * 导致已通关关卡也判定"需先通关该关卡"，扫荡功能完全不可用 */
    const st = (p.cleared || {})[lvId] || 0;
    if (!st) return { ok: false, msg: '需先通关该关卡' };
    if ((p.stamina || 0) < EX.SWEEP_STAMINA) return { ok: false, msg: '体力不足（需 ' + EX.SWEEP_STAMINA + '）' };
    return { ok: true };
  },
  sweep(p, lvId, times) {
    const lvNum = parseInt(String(lvId).split('-')[1] || '1', 10);
    const ck = this.canSweep(p, lvId);
    if (!ck.ok) return ck;
    const t = Math.max(1, Math.min(EX.SWEEP_MAX, times || 1));
    const cost = EX.SWEEP_STAMINA * t;
    if ((p.stamina || 0) < cost) return { ok: false, msg: '体力不足，最多可扫荡 ' + Math.floor((p.stamina || 0) / EX.SWEEP_STAMINA) + ' 次' };
    p.stamina -= cost;
    const rw = EX.sweepRw(lvNum, t);
    p.gold = (p.gold || 0) + rw.gold;
    p.mat = p.mat || {};
    p.mat.M01 = (p.mat.M01 || 0) + rw.M01;
    /* 表25 #1：经验走角色等级系统（自动升级） */
    const lr = this.addXp(p, rw.xp);
    return { ok: true, msg: '扫荡 ' + t + ' 次完成！' + (lr.msg ? ' ' + lr.msg : ''), rw: rw, cost: cost, ups: lr.ups };
  },

  /* =========================================================
   * 角色升星（表15/42：角色碎片升星，每星 +8% 全属性）
   * ======================================================== */
  starUp(p) {
    const cur = p.charStar || 0;
    if (cur >= EX.STAR_MAX) return { ok: false, msg: '已达最高星级' };
    const need = EX.starCost[cur + 1] || 999;
    const have = (p.mat || {}).P02 || 0;
    if (have < need) return { ok: false, msg: '角色碎片不足（需 ' + need + '，现有 ' + have + '）' };
    p.mat.P02 = have - need;
    p.charStar = cur + 1;
    return { ok: true, msg: '升星成功！当前 ' + p.charStar + ' 星（全属性 +' + Math.round(p.charStar * 8) + '%）' };
  },

  /* =========================================================
   * 成就商店（表42：消耗成就点，限购按 日/周/月/终身）
   * ======================================================== */
  achShopKey(id) { return 'as_' + id; },
  achShopBought(p, id) {
    const b = p.achShopBuy || (p.achShopBuy = {});
    const it = (EX.achShop || []).find((x) => x.id === id);
    if (!it) return 0;
    const k = this.achShopKey(id);
    const rec = b[k] || { n: 0, t: 0 };
    if (!this._perReset(rec, it.per)) return rec.n;
    return rec.n;
  },
  /* 限购周期重置
   * 严重 BUG 修复：此前用「距上次购买超过 24 小时」判断，是滚动计时。
   * 玩家今晚 23:00 买满，明早 00:30 再来买，只过了 1.5 小时 → 仍判定为同一天，
   * 限购不刷新，玩家白白少一天额度。运营意义上的「每日限购」应按自然日跨天算。
   * 周 / 月同理，改为按自然周、自然月（周一为周起点）。 */
  _perReset(rec, per) {
    const now = Date.now();
    const d = new Date(now + 8 * 36e5);          /* UTC+8 业务日 */
    if (per === 'day') {
      const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      if (rec.dk !== key) { rec.n = 0; rec.dk = key; rec.t = now; }
    } else if (per === 'week') {
      /* 自然周：以周一为起点 */
      const day = (d.getDay() + 6) % 7;           /* 周一=0 */
      const mon = new Date(d.getTime() - day * 864e5);
      const key = mon.getFullYear() * 10000 + (mon.getMonth() + 1) * 100 + mon.getDate();
      if (rec.wk !== key) { rec.n = 0; rec.wk = key; rec.t = now; }
    } else if (per === 'month') {
      const key = d.getFullYear() * 100 + (d.getMonth() + 1);
      if (rec.mk !== key) { rec.n = 0; rec.mk = key; rec.t = now; }
    } else if (per === 'once') { /* 终身 */ }
    return true;
  },
  achShopBuyItem(p, id) {
    const it = (EX.achShop || []).find((x) => x.id === id);
    if (!it) return { ok: false, msg: '商品不存在' };
    const b = p.achShopBuy || (p.achShopBuy = {});
    const k = this.achShopKey(id);
    if (!b[k]) b[k] = { n: 0, t: Date.now() };
    this._perReset(b[k], it.per);
    if (b[k].n >= it.limit) return { ok: false, msg: '已达限购次数（' + it.limit + '）' };
    if ((p.ach || 0) < it.cost) return { ok: false, msg: '成就点不足（需 ' + it.cost + '）' };
    p.ach -= it.cost;
    b[k].n++; b[k].t = Date.now();
    this.grant(p, it.give);
    return { ok: true, msg: '兑换成功：' + it.n };
  },
  /* 通用发放 */
  grant(p, give) {
    if (!give) return;
    p.mat = p.mat || {};
    Object.keys(give).forEach((k) => {
      if (k === 'gold') p.gold = (p.gold || 0) + give[k];
      else if (k === 'diamond') p.diamond = (p.diamond || 0) + give[k];
      else if (k === 'stamina') p.stamina = Math.min(EX.STAMINA_MAX, (p.stamina || 0) + give[k]);
      else if (k === 'title') { p.titles = p.titles || []; if (p.titles.indexOf(give[k]) < 0) p.titles.push(give[k]); }
      else if (k === 'skin') { p.skin = p.skin || []; if (p.skin.indexOf(give[k]) < 0) p.skin.push(give[k]); }
      else if (k === 'frame') { p.frames = p.frames || []; if (p.frames.indexOf(give[k]) < 0) p.frames.push(give[k]); }
      /* 可镶嵌宝石：give: { gem: 'G_R' } → p.gems['G_R'] += 1
       * 修复：此前商城「红宝石/蓝宝石/绿宝石/紫宝石」发放的是 M05 材料，
       *       买了之后在宝石页永远显示数量 0，镶嵌/合成功能完全用不了 */
      else if (k === 'gem') {
        const gid = give[k];
        if (gid) { p.gems = p.gems || {}; p.gems[gid] = (p.gems[gid] || 0) + 1; }
      }
      else p.mat[k] = (p.mat[k] || 0) + give[k];
    });
  },

  /* =========================================================
   * 活动商店（表43：消耗活动代币）
   * ======================================================== */
  eventShopBuy(p, id) {
    const it = (EX.eventShop || []).find((x) => x.id === id);
    if (!it) return { ok: false, msg: '商品不存在' };
    const b = p.evShopBuy || (p.evShopBuy = {});
    const k = 'es_' + id;
    if (!b[k]) b[k] = { n: 0, t: Date.now() };
    this._perReset(b[k], it.per);
    if (b[k].n >= it.limit) return { ok: false, msg: '已达限购次数（' + it.limit + '）' };
    if ((p.evToken || 0) < it.cost) return { ok: false, msg: '活动代币不足（需 ' + it.cost + '）' };
    p.evToken -= it.cost;
    b[k].n++; b[k].t = Date.now();
    this.grant(p, it.give);
    return { ok: true, msg: '兑换成功：' + it.n };
  },

  /* =========================================================
   * 排行榜奖励（表33：按排名发奖到邮件）
   * ======================================================== */
  rankRewardFor(board, rank) {
    const list = (EX.rankRewards || []).filter((x) => x.board === board);
    const hit = list.find((x) => rank >= x.lo && rank <= x.hi);
    return hit || null;
  },
  claimRankRw(p, board, rank) {
    const rw = this.rankRewardFor(board, rank);
    if (!rw) return { ok: false, msg: '该名次无奖励' };
    const key = 'rk_' + board + '_' + rw.id;
    p.rankRwGot = p.rankRwGot || {};
    if (p.rankRwGot[key]) return { ok: false, msg: '已领取过该奖励' };
    p.rankRwGot[key] = 1;
    this.grant(p, rw.rw);
    return { ok: true, msg: '领取 ' + board + ' ' + rw.rank + ' 奖励成功！' };
  },

  /* =========================================================
   * 图鉴收集（表29：首次解锁领奖）
   * ======================================================== */
  /* 图鉴回填：玩家已拥有但历史未记账的武器/皮肤，一次性补录
   * 修复：此前只有怪物击杀会解锁图鉴，武器(10条)/皮肤(11条)永远为 0 */
  codexBackfill(p) {
    if (!p.codex) p.codex = {};
    let n = 0;
    const add = (kind, id) => {
      if (!id) return;
      p.codex[kind] = p.codex[kind] || [];
      if (p.codex[kind].indexOf(id) < 0) { p.codex[kind].push(id); n++; }
    };
    (p.gunOwn || []).forEach((g) => add('gun', g));
    (p.skins || []).forEach((sk) => add('skin', sk));
    return n;
  },
  codexUnlock(p, kind, id) {
    p.codex = p.codex || {};
    p.codex[kind] = p.codex[kind] || [];
    if (p.codex[kind].indexOf(id) >= 0) return { ok: false, msg: '', already: true };
    p.codex[kind].push(id);
    const rw = (EX.codexRw || {})[kind] || {};
    this.grant(p, rw);
    return { ok: true, msg: '图鉴解锁！+' + (rw.gold || 0) + ' 金币', rw: rw };
  },
  codexCount(p) {
    const c = p.codex || {};
    let got = 0, all = 0;
    (EX.codexKinds || []).forEach((k) => {
      const list = EX.codexOf(k.k) || [];
      all += list.length;
      got += (c[k.k] || []).length;
    });
    return { got: got, all: all };
  },

  /* =========================================================
   * 武器词条（表30 武器词条池 AF01~AF12）
   * 进阶解锁词条槽，可消耗钻石洗练
   * ======================================================== */
  /* 词条槽位 = 武器自带槽位(表44 slots) + 进阶加成
   * BUG修复：此前只读 gunAdvance[白阶].slot = 0，与生成词条所用的
   *          gunSlots(武器表 slots=2) 不一致，导致明明有 2 条词条却
   *          提示"需先进阶武器才解锁词条槽"，洗练功能完全不可用 */
  gunAffixSlots(p, gunId) {
    const base = this.gunSlots(p);                    /* 武器自带槽位 */
    const adv = Math.max(0, Math.min(4, p.gunAdv || 0));
    const row = (EX.gunAdvance || [])[adv];
    const byAdv = row ? (row.slot || 0) : 0;
    return Math.max(base, byAdv);
  },
  rollGunAffix(p, gunId) {
    const pool = EX.gunStats || [];
    /* 按品质加权：蓝 60% / 紫 30% / 红 10% */
    const r = Math.random();
    const q = r < 0.60 ? '蓝' : r < 0.90 ? '紫' : '红';
    const cand = pool.filter((x) => x.q === q);
    const list = cand.length ? cand : pool;
    const a = list[Math.floor(Math.random() * list.length)];
    return { id: a.id, k: a.k, n: a.n, q: a.q, v: a.base };
  },
  gunAffixBonus(p) {
    const out = { dmg: 0, rate: 0, crit: 0, critDmg: 0, pierce: 0, lifesteal: 0,
      mag: 0, reload: 0, blastR: 0, pierce2: 0, double: 0, extraB: 0 };
    const gid = p.gunId || 'W01';
    const aff = (p.gunAffix || {})[gid] || [];
    aff.forEach((a) => { if (a && out[a.k] != null) out[a.k] += a.v; });
    return out;
  },
  /* 洗练：消耗钻石重随机全部词条 */
  /* 旧入口：此前写入 p.gunStats，而属性计算 gunAffixBonus 读的是
   *          p.gunAffix[gid] —— 两套存储导致洗练后属性完全不变。
   * 统一转发到 rerollAffix（写 p.gunAffix，属性即时生效） */
  rerollGun(p, gunId) {
    const slots = this.gunAffixSlots(p, gunId);
    if (slots <= 0) return { ok: false, msg: '需先进阶武器才解锁词条槽' };
    const r = this.rerollAffix(p, false);
    if (r.ok) r.msg = '洗练完成！';
    return r;
  },
  rerollGunOld(p, gunId) {
    const gid = gunId || p.gun || 'W01';
    const slots = this.gunAffixSlots(p, gid);
    if (slots <= 0) return { ok: false, msg: '需先进阶武器才解锁词条槽' };
    const cost = EX.REROLL_GUN_COST || 20;
    if ((p.diamond || 0) < cost) return { ok: false, msg: '钻石不足（需 ' + cost + '）' };
    p.diamond -= cost;
    p.gunStats = p.gunStats || {};
    /* 与进阶解锁保持同一套 key：s1 ~ s{slot} */
    const names = [];
    for (let i = 1; i <= slots; i++) {
      const st = this.rollGunAffix(p, gid);
      const adv = this.advOf(p.gunLv);
      p.gunStats['s' + i] = { id: st.id, k: st.k, n: st.n, q: st.q, v: +(st.v * (1 + adv * 0.5)).toFixed(4) };
      names.push(st.n);
    }
    return { ok: true, msg: '洗练成功！获得 ' + names.join('、') };
  },
  /* 进阶时自动补齐新解锁槽位的词条 */
  fillGunAffix(p, gunId) {
    const slots = this.gunAffixSlots(p, gunId);
    p.gunAffix = p.gunAffix || {};
    const cur = p.gunAffix[gunId] || [];
    while (cur.length < slots) cur.push(this.rollGunAffix(p, gunId));
    cur.length = slots;
    p.gunAffix[gunId] = cur;
    return cur;
  },

  /* =========================================================
   * 新手引导（表21：12 个引导节点）
   * ======================================================== */
  guideDone(p, id) {
    p.guide = p.guide || {};
    if (p.guide[id]) return false;
    p.guide[id] = 1;
    return true;
  },
  guideNext(p) {
    /* 返回下一个未完成且已满足触发条件的强制引导 */
    const g = (EX.guides || []).find((x) => x.must && !(p.guide || {})[x.id]);
    return g || null;
  },

  /* =========================================================
   * 武器词条系统（表30 AF01~AF12 + 表44 词条槽位）
   * ======================================================== */
  /* =========================================================
   * 宝箱开箱 / 活动掉落（表31 DR11 / DR12）
   * ======================================================== */
  /* =========================================================
   * 背包碎片分解（表05 第9项：分解碎片 → 金币）
   * ======================================================== */
  DISMANTLE_RATE: { P01: 60, P02: 120, C01: 200, C02: 500, C03: 1200 },
  canDismantle(id) { return !!this.DISMANTLE_RATE[id]; },
  dismantleMat(p, id, n) {
    const rate = this.DISMANTLE_RATE[id];
    if (!rate) return { ok: false, msg: '该物品无法分解' };
    const have = (p.mat || {})[id] || 0;
    if (have < 1) return { ok: false, msg: '数量不足' };
    const t = Math.max(1, Math.min(have, n || 1));
    p.mat[id] = have - t;
    const gold = rate * t;
    p.gold = (p.gold || 0) + gold;
    return { ok: true, msg: '分解 ' + this.itemName(id) + '×' + t + ' → 金币 +' + this.fmt(gold), gold: gold };
  },
  dismantleAll(p) {
    let gold = 0, cnt = 0;
    Object.keys(this.DISMANTLE_RATE).forEach((id) => {
      const have = (p.mat || {})[id] || 0;
      if (have > 0) { gold += this.DISMANTLE_RATE[id] * have; cnt += have; p.mat[id] = 0; }
    });
    if (!cnt) return { ok: false, msg: '没有可分解的物品' };
    p.gold = (p.gold || 0) + gold;
    return { ok: true, msg: '分解 ' + cnt + ' 个 → 金币 +' + this.fmt(gold), gold: gold };
  },

  openChest(p, times) {
    const t = Math.max(1, Math.min(10, times || 1));
    const have = (p.mat || {}).I04 || 0;   /* 宝箱道具 I04 */
    if (have < t) return { ok: false, msg: '宝箱不足（现有 ' + have + '）' };
    p.mat.I04 = have - t;
    const got = {};
    for (let i = 0; i < t; i++) {
      const list = EX.dropBySrc('宝箱开箱') || [];
      const r = EX.rollDrop(list);
      r.forEach((g) => { got[g.item] = (got[g.item] || 0) + g.n; });
    }
    this.grantByMap(p, got);
    const txt = Object.keys(got).map((k) => this.itemName(k) + '×' + got[k]).join('、') || '（本次未出货）';
    return { ok: true, msg: '开启 ' + t + ' 个宝箱：' + txt };
  },
  /* 活动掉落结算（表31 DR12：精英芯片 30%） */
  eventDropRoll(p) {
    const list = EX.dropBySrc('活动掉落') || [];
    const r = EX.rollDrop(list);
    r.forEach((g) => { p.mat = p.mat || {}; p.mat[g.item] = (p.mat[g.item] || 0) + g.n; });
    return r;
  },
  grantByMap(p, map) {
    p.mat = p.mat || {};
    Object.keys(map || {}).forEach((k) => {
      if (k === 'gold') p.gold = (p.gold || 0) + map[k];
      else if (k === 'diamond') p.diamond = (p.diamond || 0) + map[k];
      else p.mat[k] = (p.mat[k] || 0) + map[k];
    });
  },

  /* 玩家行为日志（后台「日志查询 → 玩家操作」读取，只保留最近 60 条） */
  logAct(p, t, d) {
    if (!p) return;
    p.logs = p.logs || [];
    p.logs.unshift({ t: t, d: d || '', at: Date.now() });
    if (p.logs.length > 60) p.logs.length = 60;
  },

  gunSlots(p) {
    const g = this.gun(p); return (g && g.slots) || 2;
  },
  /* 当前武器的词条列表 */
  gunAffixes(p) {
    p.gunAffix = p.gunAffix || {};
    const gid = p.gunId || (this.gun(p) || {}).id || 'W01';
    if (!p.gunAffix[gid]) p.gunAffix[gid] = [];
    const sl = this.gunSlots(p);
    /* 槽位变化时补齐/裁剪 */
    while (p.gunAffix[gid].length < sl) p.gunAffix[gid].push(EX.rollAffixOne(false));
    if (p.gunAffix[gid].length > sl) p.gunAffix[gid].length = sl;
    return p.gunAffix[gid];
  },
  /* 词条加成汇总 */
  affixBonus(p) {
    const b = { dmg: 0, rate: 0, crit: 0, critDmg: 0, pierce: 0, lifesteal: 0,
      mag: 0, reload: 0, er: 0, double: 0, extra: 0 };
    this.gunAffixes(p).forEach((af) => {
      const a = EX.affixOf(af.id); if (!a || !b.hasOwnProperty(a.k)) return;
      if (a.stack) b[a.k] += af.v; else b[a.k] = Math.max(b[a.k], af.v);
    });
    return b;
  },
  /* 洗练：普通消耗金币，传说消耗钻石 */
  rerollAffix(p, legend) {
    const gid = p.gunId || (this.gun(p) || {}).id || 'W01';
    p.gunAffix = p.gunAffix || {};
    p.gunAffix[gid] = p.gunAffix[gid] || [];
    if (legend) {
      const c = EX.AFFIX_REROLL_LEGEND_DIA;
      if ((p.diamond || 0) < c) return { ok: false, msg: '钻石不足（需 ' + c + '）' };
      p.diamond -= c;
      p.gunAffix[gid] = [EX.rollAffixOne(true), EX.rollAffixOne(true)].slice(0, this.gunSlots(p));
    } else {
      const c = EX.AFFIX_REROLL_GOLD;
      if ((p.gold || 0) < c) return { ok: false, msg: '金币不足（需 ' + this.fmt(c) + '）' };
      p.gold -= c;
      p.gunAffix[gid] = [];
      for (let i = 0; i < this.gunSlots(p); i++) p.gunAffix[gid].push(EX.rollAffixOne(false));
    }
    return { ok: true, msg: '洗练完成！' };
  },

  /* 宝石合成：3 颗同级 → 1 颗高一级（截图「宝石合成」） */
  gemFuse(p, id) {
    const tiers = ['G_R', 'G_B', 'G_G', 'G_P'];
    const need = 3;
    if (!((p.gems || {})[id] >= need)) return { ok: false, msg: '需要 ' + need + ' 颗同色宝石' };
    p.gems[id] -= need;
    p.gemLv = (p.gemLv || 0) + 1;
    const lv = p.gemLv;
    return { ok: true, msg: '合成成功！宝石等级提升至 Lv.' + lv };
  },
  /* 宝石属性加成
   * BUG修复（两处）：
   *  1) 此前只读 p.gemLv（合成等级），镶嵌写入的 p.gemOn 完全不参与计算
   *     → 玩家镶嵌红宝石后攻击 +0，镶嵌功能形同虚设
   *  2) 加成不分种类，红/蓝/绿/紫一律给 攻击+1200 生命+2000 暴击+15%
   *     → 与宝石表 desc 完全不符
   * 现按表：镶嵌种类决定加成类型，合成等级决定倍率 */
  /* 宝石加成（改为百分比，每级数值）
   * 原表给的固定值（攻击+1200 等）是按满级武器设计的终值，
   * 直接套在新手身上会 +4600% 攻击、战力从 1011 飙到 22611 —— 完全失衡。
   * 改为百分比后自动适配全期：前期温和，后期随属性增长。
   * Lv.10 时等效强度 ≈ 原表终值区间（攻击 +60% ≈ 满级武器 +1600 攻击）。 */
  /* 宝石加成改为「百分比」，且只与宝石合成等级有关，
   * 与角色等级、武器等级完全无关（避免前期一颗宝石秒天秒地）
   *
   * 阶梯 = base + (Lv-1) * step，最高 GEM_MAX_LV 级
   *
   *  等级   红宝石(攻击)  蓝宝石(生命/暴击)  绿宝石(生命/吸血)  紫宝石(暴伤/攻速)
   *  Lv1       +6%          +8% / +1%          +5% / +0.5%        +8% / +1.5%
   *  Lv2      +10%         +13% / +2%          +8% / +1.0%       +14% / +2.5%
   *  Lv3      +14%         +18% / +3%         +11% / +1.5%       +20% / +3.5%
   *  Lv4      +18%         +23% / +4%         +14% / +2.0%       +26% / +4.5%
   *  Lv5      +22%         +28% / +5%         +17% / +2.5%       +32% / +5.5%
   *  ...     每级 +4%       +5% / +1%          +3% / +0.5%        +6% / +1%
   *  Lv10     +42%         +53% / +10%        +32% / +5.0%       +62% / +10.5%
   */
  GEM_MAX_LV: 10,
  GEM_BASE: {
    G_R: { atkPct: 0.06, hpPct: 0,    crit: 0,    critDmg: 0,   ls: 0,     ratePct: 0 },
    G_B: { atkPct: 0,    hpPct: 0.08, crit: 0.01, critDmg: 0,   ls: 0,     ratePct: 0 },
    G_G: { atkPct: 0,    hpPct: 0.05, crit: 0,    critDmg: 0,   ls: 0.005, ratePct: 0 },
    G_P: { atkPct: 0,    hpPct: 0,    crit: 0,    critDmg: 0.08, ls: 0,    ratePct: 0.015 },
  },
  GEM_STEP: {
    G_R: { atkPct: 0.04, hpPct: 0,    crit: 0,    critDmg: 0,   ls: 0,     ratePct: 0 },
    G_B: { atkPct: 0,    hpPct: 0.05, crit: 0.01, critDmg: 0,   ls: 0,     ratePct: 0 },
    G_G: { atkPct: 0,    hpPct: 0.03, crit: 0,    critDmg: 0,   ls: 0.005, ratePct: 0 },
    G_P: { atkPct: 0,    hpPct: 0,    crit: 0,    critDmg: 0.06, ls: 0,    ratePct: 0.01 },
  },
  /* 面板展示用：把百分比换算成当前属性上的绝对值 */
  GEM_TXT: { atkPct: '攻击', hpPct: '生命', critDmg: '暴伤', ratePct: '攻速', ls: '吸血', crit: '暴击' },
  gemBonus(p) {
    const zero = { atkPct: 0, hpPct: 0, crit: 0, critDmg: 0, ls: 0, ratePct: 0 };
    const id = p.gemOn;
    if (!id) return zero;
    const base = this.GEM_BASE[id], step = this.GEM_STEP[id];
    if (!base) return zero;
    const lv = Math.max(1, Math.min(this.GEM_MAX_LV, p.gemLv || 0));
    const out = {};
    for (const k in zero) {
      const b = base[k] || 0, st = (step && step[k]) || 0;
      out[k] = b + st * (lv - 1);
    }
    return out;
  },
  /* 指定宝石在当前合成等级下的加成文案（用于列表逐行展示） */
  gemBonusOf(p, id) {
    const base = this.GEM_BASE[id], step = this.GEM_STEP[id];
    if (!base) return '—';
    const lv = Math.max(1, Math.min(this.GEM_MAX_LV, p.gemLv || 0));
    const parts = [];
    ['atkPct', 'hpPct', 'critDmg', 'ratePct', 'ls', 'crit'].forEach((k) => {
      const v = (base[k] || 0) + ((step && step[k]) || 0) * (lv - 1);
      if (v > 0) parts.push(this.GEM_TXT[k] + ' +' + (v * 100).toFixed(v < 0.02 ? 1 : 0) + '%');
    });
    return parts.length ? parts.join(' · ') : '—';
  },
  /* 面板展示：返回人类可读的加成文案（如「攻击 +6% · 暴击 +1%」） */
  gemBonusTxt(p) {
    const gb = this.gemBonus(p);
    const parts = [];
    const pctKeys = ['atkPct', 'hpPct', 'critDmg', 'ratePct', 'ls', 'crit'];
    pctKeys.forEach((k) => {
      const v = gb[k] || 0;
      if (v > 0) parts.push(this.GEM_TXT[k] + ' +' + (v * 100).toFixed(v < 0.02 ? 1 : 0) + '%');
    });
    return parts.length ? parts.join(' · ') : '无加成';
  },
  /* 宝石加成的绝对数值（仅用于面板展示） */
  gemBonusFlat(p) {
    const a = this.attrs(p), gb = this.gemBonus(p);
    return { atk: Math.round(a.atk - a.atk / (1 + gb.atkPct || 1)),
      hp: Math.round(a.hp - a.hp / (1 + (gb.hpPct || 0))) };
  },
  /* 装备锻造：强化 + 进阶（截图「装备设造 / 装备锻造」） */
  forgeEquip(p, slot) {
    const eq = p.equip || (p.equip = {});
    const cur = eq[slot] || { lv: 0 };
    const cost = 500 + cur.lv * 300;
    if ((p.gold || 0) < cost) return { ok: false, msg: '金币不足，需要 ' + cost };
    if (cur.lv >= 20) return { ok: false, msg: '已达最高强化等级' };
    p.gold -= cost;
    cur.lv = (cur.lv || 0) + 1;
    /* 每 5 级进阶一次 */
    if (cur.lv % 5 === 0) cur.adv = (cur.adv || 0) + 1;
    eq[slot] = cur;
    return { ok: true, msg: '强化成功！' + slot + ' Lv.' + cur.lv + (cur.lv % 5 === 0 ? ' · 进阶 +1' : '') };
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
  /* =========================================================
   * 每日关卡挑战次数（截图51：「今日剩余次数：3/3」）
   * 此前结算页把「广告剩余次数(AD02=10次)」当成挑战次数显示，
   * 出现「10/3」这种分子大于分母的错误数据
   * ========================================================= */
  RUN_DAILY: 3,
  runLeft(p) {
    if (p.runDate !== this.dailyKey()) { p.runDate = this.dailyKey(); p.runUsed = 0; }
    return Math.max(0, this.RUN_DAILY - (p.runUsed || 0));
  },
  useRun(p) {
    if (this.runLeft(p) <= 0) return { ok: false, msg: '今日挑战次数已用完（每日 ' + this.RUN_DAILY + ' 次）' };
    p.runUsed = (p.runUsed || 0) + 1;
    return { ok: true, msg: 'ok' };
  },

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
