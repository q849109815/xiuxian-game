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
  /* 武器升级费复利率。
   * 平衡分析：关卡金币奖励按「每关 ×1.108」增长（章节间 ×2.8 / 10 关），
   * 而原升级成本按「每级 ×1.16」增长 —— 成本增速长期快于收益增速，
   * 后期单级成本（Lv70 达 843 万）远超单关收益，玩家必然卡死。
   * 配合本轮关卡奖励曲线上调，这里同步下调到 1.14，使两者增速匹配。 */
  GUN_COST_RATE: 1.14,
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
  /* ---------- 章节 CG 过场 ----------
   * EX.cgImg / EX.chapterCg 此前是死配置：CG 图已生成但全项目零引用，
   * 玩家从头到尾看不到任何过场演出。现在进入新章节时播放一次。 */
  cgOf(ch) {
    const map = (EX.chapterCg || {});
    const id = map[ch]; if (!id) return null;
    const src = (EX.cgImg || {})[id]; if (!src) return null;
    return { id: id, src: src };
  },
  /* 是否已播放过；首次进入该章节时返回 CG 数据并登记 */
  cgTake(p, ch) {
    const cg = this.cgOf(ch);
    if (!cg) return null;
    p.cgSeen = p.cgSeen || {};
    if (p.cgSeen[cg.id]) return null;
    p.cgSeen[cg.id] = 1;
    return cg;
  },
  /* 体力消耗：普通 1 / BOSS 3 / 无尽 2 */
  staminaCost(id) {
    if (id === 'endless') return 2;
    const d = this.levelDef(id);
    return d.cond === 'boss' || d.cond === 'bossAll' ? 3 : 1;
  },
  /* 体力：每 5 分钟 +1，上限 100 */
  /* =========================================================
   * 存档类型规范化（sanitize）
   * ---------------------------------------------------------
   * 问题：UI 大量使用 `(p.X || 0)` 兜底，但这个写法【挡不住字符串】。
   *   例：`Math.floor(p.stamina || 0)`，当 p.stamina === 'abc' 时
   *       'abc' 是 truthy → `|| 0` 不生效 → Math.floor('abc') = NaN
   *       → 设置页体力显示成「NaN/100」。
   *   实测（隔离验证）：注入 stamina='abc' → 设置页出现 NaN/100 ✔
   *       注入 stamina=null / gold='abc' / lv='abc' → 干净，无 NaN
   *   触发途径：后台 GM 改字段、热更写入、存档损坏、跨版本残留。
   * 做法：登录后统一把关键字段强制成正确类型，从源头杜绝脏值扩散，
   *   而不是逐个渲染点加保护（UI 里有 18 处同类写法）。
   * ========================================================= */
  NUMS: ['gold','diamond','stamina','lv','xp','tp','ach','evToken','evScore',
         'patrolAcc','patrolT','patrolFast','legionExp','legionContrib',
         'charStar','gunLv','gunAdv','endlessBest','adTotal','staminaAt'],
  /* mailGot / cdkGot 是【数组】（存已领邮件ID、已兑换码），
   * 此前误列进 OBJS → sanitize 把数组改写成对象 {}，
   * 实测：登录后 mailGot=['m1','m2'] → {}，接着执行
   *   `P.mailGot.indexOf(...)` 直接抛 "indexOf is not a function"，
   * 且已领记录清空意味着【邮件、兑换码可以无限重复领取】（可刷奖励）。
   * 现在归入 ARRS。 */
  ARRS: ['bag','skins','titles','frames','mercs','chars','gunOwn','friends',
         'sendStTo','tempBuff','logs','mailGot','cdkGot'],
  OBJS: ['mat','chips','cleared','codex','equip','gems','build','talents',
         'tasks','stats','giftBuy','evShopBuy','achShopBuy','lgShopBuy',
         'adUsed','gunStats'],
  sanitize(p) {
    if (!p || typeof p !== 'object') return p;
    const N = (v, d) => { const n = Number(v); return isFinite(n) ? n : (d || 0); };
    /* 时间戳类字段缺失时不能补 0：
     *   patrolT=0 → 巡逻算成「离线 8 小时」白送金币（此前已修的 BUG 会复活）
     *   staminaAt=0 → 体力瞬间回满
     * 缺失一律补当前时间。 */
    const TS = { patrolT: 1, staminaAt: 1, offlineAt: 1, created: 1, lastSeen: 1 };
    this.NUMS.forEach((k) => {
      if (p[k] == null) { p[k] = TS[k] ? Date.now() : 0; return; }
      p[k] = Math.max(0, N(p[k], 0));
    });
    p.stamina = Math.min(EX.STAMINA_MAX || 100, p.stamina);
    p.gunLv = Math.max(1, p.gunLv || 1);
    if (!p.lv || p.lv < 1) p.lv = 1;   /* 等级最小 1，补 0 会让升级/经验计算异常 */
    if (p.charStar != null) p.charStar = Math.min(5, Math.max(0, p.charStar));
    /* BUG修复（旧存档/损坏存档白屏）：
     * 原写法是 `if (p[k] != null && ...)` —— 只在【字段存在但类型错】时才修正，
     * 字段【整个缺失】时直接跳过，保持 undefined。
     * 实测：删除 cleared / build / talents / tasks 任一字段后调用 UI.home()
     *   全部抛 TypeError（读 undefined 的属性），主界面完全不渲染 → 玩家白屏。
     * 触发途径：旧版本存档（字段后加的）、后台 GM 清空、存档写入被截断。
     * 现在改为【缺失即补齐】：数组补 []、对象补 {}，从源头杜绝。
     * 空集合与"未拥有/未通关"语义等价（如 build 缺失 → 各建筑取默认 1 级）。 */
    this.ARRS.forEach((k) => { if (!Array.isArray(p[k])) p[k] = []; });
    this.OBJS.forEach((k) => { if (!p[k] || typeof p[k] !== 'object' || Array.isArray(p[k])) p[k] = {}; });
    /* 只把【值确实是"数量"】的字典做数值收敛。
     * BUG修复：chips / codex 曾在这个列表里，但它们的值【不是数量】：
     *   chips = { 槽位: 芯片对象 }   → 实测 {s1:{id:'c1',...}} 被 Number() 成 {s1:0}
     *   codex = { 类别: 已解锁ID数组 } → 实测 {z:['z1','z2']} 被 Number() 成 {z:0}
     * 即：玩家每次登录，已装备的芯片与图鉴解锁记录【全部清零】。
     * 现在移出该列表（保留 mat/gems/cleared 等真正的数量字典）。 */
    ['mat','gems','cleared','evShopBuy','achShopBuy','lgShopBuy','giftBuy'].forEach((k) => {
      if (!p[k]) return;
      Object.keys(p[k]).forEach((i) => { const n = Number(p[k][i]); p[k][i] = isFinite(n) ? n : 0; });
    });
    ['uid','name','char','skin','curLevel','gun'].forEach((k) => {
      if (p[k] != null && typeof p[k] !== 'string') p[k] = String(p[k]);
    });
    return p;
  },
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
    if ((p.stamina || 0) < c) return { ok: false, msg: EX.tip('popup.noStaminaCur', { v: c, n: Math.floor(p.stamina) }) };
    p.stamina -= c; p.staminaAt = Date.now();
    return { ok: true, cost: c };
  },
  addStamina(p, v) {
    this.tickStamina(p);
    const before = p.stamina || 0;
    const after = Math.min(EX.STAMINA_MAX, before + v);
    p.stamina = after;
    /* 返回【实际增加量】而不是增加后的总量
     * BUG：此前返回 p.stamina（总量），调用方无从判断到底加没加。
     *   体力已达上限时 Math.min 会把增量截成 0 —— 玩家看广告领体力，
     *   提示「体力 +10」，实际一点没加，而【广告次数已经被 useAd 扣掉了】，
     *   每日 10 次的额度白白蒸发一次。
     * 现在返回实际增量，UI 可据此提示真实数值；staminaFull() 供调用前拦截。 */
    return Math.max(0, after - before);
  },
  staminaFull(p) {
    this.tickStamina(p);
    return (p.stamina || 0) >= EX.STAMINA_MAX;
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
    if ((p.diamond || 0) < s.price) return { ok: false, msg: EX.tip('popup.noDiamond', { v: s.price }) };
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
    if (p.gold < c) return { ok: false, msg: EX.tip('popup.noCoin', { v: this.fmt(c) }) };
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
  /* 按【品质】随机生成一块芯片
   * 严重BUG：此前所有发放点都写 `rollChipById('n'/'e'/'l')`，
   *          但 rollChipById 收的是【芯片定义ID】（CH01~CH08），不是品质码。
   *          chipDef('l') → undefined → `|| EX.chips[0]` 回退
   *          → 无论配的是 chipL(传说) 还是 chipE(精英)，
   *            一律发出 chips[0] = CH01「生命芯片·白」（最垃圾的一档）。
   * 实测：商店 SH09「传说芯片包」980 钻买 chipL:2 → 到手 2 块白色生命芯片；
   *       战令 Lv50「传说芯片×1」→ 白色；免费抽奖「芯片×1」→ 白色。 */
  rollChipByQuality(q) {
    /* 兼容【字母码】与【中文品质名】两种入参
     * 隐患：原映射表只有 n/e/l/white/blue/red，中文 '白'/'蓝'/'红' 不在表里
     *  → Q['蓝'] 为 undefined → `|| '白'` 兜底成【白色】
     *  → rollChipByQuality('蓝') / ('红') 静默返回白芯片，品质被吞掉。
     * 当前调用点都传字母码所以没暴露，但 giveChipByQuality 收的是中文名，
     * 两条路径入参语义不一致，极易写错。现在两种都认。 */
    const Q = { n: '白', e: '蓝', l: '红', white: '白', blue: '蓝', red: '红' };
    const want = Q[q] || (q === '蓝' || q === '红' ? q : '白');
    const pool = (EX.chips || []).filter((c) => c.q === want);
    const use = pool.length ? pool : (EX.chips || []);
    if (!use.length) return null;
    return this.rollChipById(use[Math.floor(Math.random() * use.length)].id);
  },
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
    /* 操作日志：合成（后台「玩家操作日志」页标称覆盖「合成」，此前从未记录） */
    try { this.logAct(p, 'chip', '芯片合成 → ' + this.chipName(nc)); } catch (e) {}
    return { ok: true, msg: '合成成功：' + this.chipName(nc) };
  },
  /* 洗练：钻石重 roll 副词条 */
  rerollChip(p, chipId) {
    const c = (p.bag || []).find((x) => x.id === chipId) ||
      Object.values(p.chips || {}).find((x) => x && x.id === chipId);
    if (!c) return { ok: false, msg: '未找到该芯片' };
    const cost = EX.REROLL_COST[c.q] || 50;
    if ((p.diamond || 0) < cost) return { ok: false, msg: EX.tip('popup.noDiamond', { v: cost }) };
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
    if (p.gold < c) return { ok: false, msg: EX.tip('popup.noCoin', { v: this.fmt(c) }) };
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
    if (p.gold < c) return { ok: false, msg: EX.tip('popup.noCoin', { v: this.fmt(c) }) };
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
    /* 【当前章节】p.ch 全项目【只读不写】：
     *      UI 里两处 `第 ${p.ch || 1} 章`（巡逻面板、主线任务面板）
     *      永远显示「第 1 章」，即使玩家已经打到第 10 章。
     *      这里顺便把 p.ch 同步成真实当前章节（取 已通关最大章 与 curLevel 的较大者）。 */
    const curCh = this.chapterOf(p.curLevel || '1-1') || 1;
    let maxCh = 1;
    for (const id in (p.cleared || {})) {
      const c = Number(String(id).split('-')[0]) || 1;
      if (c > maxCh) maxCh = c;
    }
    p.ch = Math.max(curCh, maxCh);
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
  /* 仓库离线金币的「每小时实际产出」（供面板显示）
   * BUG：基地面板此前写死 `buildings.warehouse.offline(120) × 等级` 显示，
   *   而 offlineCalc 的真实公式是「章节档位 × 等级」：
   *     第1章 32/小时·级、第2~4章 60、第5章+ 140。
   *   实测（仓库 Lv5）：UI 恒显示 600/小时，
   *     第1章实际只有 160（高估 3.75 倍），第6章实际 700（又低估）。
   *   玩家按错误数字决定要不要升级仓库。现在直接返回真实值。 */
  offlineRate(p) {
    const lv = (p.build && p.build.warehouse) || 1;
    const t = this.offlineTier(p);
    const g = t.gold || [20, 40];
    return Math.round((g[0] + (g[1] - g[0]) * 0.6) * lv);
  },
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
    /* BUG：方法名写错（addExp vs 实际的 addXp），且被 try/catch 静默吞掉
     * → 提示写着「经验 +544」，实际 p.xp 纹丝不动，离线经验从来没发过。
     * 现在用正确方法名，并去掉会掩盖问题的空 catch。 */
    if (c.xp > 0 && this.addXp) this.addXp(p, c.xp);
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
      + this.chipVal(p, 'atk');   /* 进阶词条的 dmg 已并入 affixBonus().dmg，勿在此重复相加 */
    const atk = gunBase * (1 + atkUp);
    /* 生命：角色基础 + 天赋 + 医疗站 + 芯片 + 皮肤 */
    const hpUp = this.talentVal(p, 'hp') + this.buildVal(p, 'hp') + this.chipVal(p, 'hp')
      + ((sk && sk.bonus && sk.bonus.hp) || 0);
    const hp = c.hp * (1 + hpUp);
    /* 护甲：角色基础 × (1+天赋) + 芯片；皮肤加成 */
    const armorUp = this.talentVal(p, 'armor') + this.chipVal(p, 'armor')
      + ((sk && sk.bonus && sk.bonus.armor) || 0);
    /* 护甲天赋固定值部分
     * 严重BUG：默认角色 C01 基础护甲就是 0，而天赋是纯百分比（+3%/级），
     * 0 × (1+20×3%) = 0 —— 点满 20 级花掉数十万金币，护甲纹丝不动。
     * 加每级 +3 点固定护甲，基础为 0 的角色也能真正受益。 */
    const armorFlat = (p.talents.t_armor || 0) * 3;
    const armor = c.armor * (1 + armorUp) + armorFlat;
    /* 暴击 */
    /* 武器词条加成（表30） */
    const af = this.affixBonus(p);
    /* 武器自带暴击/暴伤（表44） */
    const gCrit = (g && g.crit) || 0, gCritDmg = (g && g.critDmg) || 1.5;
    const crit = Math.min(0.85, c.crit + gCrit + af.crit + this.talentVal(p, 'crit') + this.chipVal(p, 'crit')
      + ((sk && sk.bonus && sk.bonus.crit) || 0));   /* 进阶 crit 已并入 af.crit */
    const critDmg = gCritDmg + af.critDmg + this.chipVal(p, 'critDmg');
    /* 移速 */
    const spdUp = this.chipVal(p, 'spd') + ((sk && sk.bonus && sk.bonus.spd) || 0);
    const moveSpd = c.spd * this.SPD_MUL * (1 + spdUp);
    return {
      /* 表25 #1：角色等级成长（每级 +攻击6 / +生命80） */
      /* 好友加成：面板写「每个 +0.5% 攻击」，但 attrs 从不读 p.friends
       * → 实测加 10 个好友攻击纹丝不动（26.25 → 26.25）。
       * 现在接入，并设 20 人上限（否则无限加好友可无限堆攻击）。 */
      atk: ((atk + (p.lvBonusAtk || 0)) * (1 + af.dmg) * (1 + this.gemBonus(p).atkPct + this.equipBonus(p).atkPct + this.friendBonus(p))) * (1 + EX.starBonus(p.charStar)),
      hp: ((Math.round(hp) + (p.lvBonusHp || 0)) * (1 + this.gemBonus(p).hpPct + this.equipBonus(p).hpPct)) * (1 + EX.starBonus(p.charStar)),
      gunBase, armor: Math.round(armor),
      /* 护盾（常驻值）
       * 严重BUG：attrs() 此前从不返回 shield，而 battle.js 用
       *   shield: a.shield, maxShield: a.shield  初始化 run，
       *   applyMods() 里 r.shield = Math.max(r.shield, r.mods.shield)
       * → Math.max(undefined, 0) = NaN，run.shield 全程 NaN。
       * 后果：① if (r.shield > 0) 恒为 false，护盾从不吸收伤害
       *       ② 头顶护盾圈（r.shield > 0）从不绘制
       *       ③ 护盾天赋/芯片的常驻加成永远不生效
       *       （仅有 I02 护盾发生器能临时生效，因为那行写了 (r.shield||0)）
       * 现在返回数值（当前配置无护盾天赋/芯片 → 恒 0，但类型正确）。
       * 后台若新增 stat:'shield' 的天赋或芯片主属性，会自动生效。 */
      shield: Math.round(this.talentVal(p, 'shield') + this.chipVal(p, 'shield')),
      mag: g.mag + af.mag,   /* 进阶 mag 已并入 af.mag */
      pierce: g.pierce + af.pierce,   /* 进阶 pierce/pierce2 已并入 af.pierce */
            /* 射程 300→380：僵尸从上方走到射程边缘约需 8 秒（spd 58），
       * 射程太短导致每波实际射击窗口仅 6 秒，玩家清不完一波就超时推进，
       * 僵尸逐波累积 → 防线必破（实测 1-1 也过不去，防线 160/636） */
      pellets: (g.pellets || 1) + af.extra, range: 380, spread: 0,
      crit: Math.min(0.85, crit + this.gemBonus(p).crit),
      critDmg: critDmg + this.gemBonus(p).critDmg,
      rate: g.rate * (1 + af.rate + this.chipVal(p, 'rate') + this.gemBonus(p).ratePct),
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
  /* 装备强化加成
   * BUG：forgeEquip 只写 p.equip[slot].lv，但 attrs() 从不读它
   * → 玩家花几万金币强化 8 个部位，战力数字涨了，
   *   实际攻击/生命/打怪伤害纹丝不动。装备系统等于只涨数字不涨实力。
   * 现在按槽位类型提供真实百分比加成（与宝石同思路，纯百分比不随等级膨胀）。 */
  equipBonus(p) {
    const eq = p.equip || {};
    /* 攻击类槽位 / 生命类槽位 */
    const ATK_SLOTS = ['weapon', 'ring', 'fabao'];
    const HP_SLOTS = ['head', 'cloth', 'neck', 'boot', 'brace'];
    let atkPct = 0, hpPct = 0;
    Object.keys(eq).forEach((k) => {
      const e = eq[k] || {};
      const lv = e.lv || 0, adv = e.adv || 0;
      if (lv <= 0) return;
      /* 每级 +0.8%，每进阶（每 5 级）+1% */
      const v = lv * 0.008 + adv * 0.01;
      if (ATK_SLOTS.indexOf(k) >= 0) atkPct += v;
      else if (HP_SLOTS.indexOf(k) >= 0) hpPct += v;
      else { atkPct += v * 0.5; hpPct += v * 0.5; }
    });
    return { atkPct: atkPct, hpPct: hpPct };
  },

  /* 好友加成：每个 +0.5% 攻击，上限 20 人（+10%） */
  friendBonus(p) {
    const n = Math.min(20, (p.friends || []).length);
    return n * 0.005;
  },

  /* 军团属性加成
   * BUG：军团面板明确写「军团可提供属性加成、军团副本与军团商店」，
   *   但 p.legion 全项目只在 ui.js 出现，attrs() / power() 从不读它
   *   → 加不加军团，属性一模一样（实测：加入前后 atk 26 / hp 1060，纹丝不动）。
   *   玩家花 5000 金币捐一次换 100 贡献，换来的只有商店消费权，
   *   面板承诺的那份「属性加成」从来不存在。
   *   现在按军团贡献给加成：每 1000 贡献 +1% 攻击与生命，上限 10%。
   *   （捐献 5000 金 = 100 贡献，故满加成约需 5 万金币，作为中后期金币出口。） */
  legionBonus(p) {
    if (!p.legion) return { atkPct: 0, hpPct: 0 };
    const c = Math.max(0, Number(p.legionExp || 0));
    const v = Math.min(0.10, Math.floor(c / 1000) * 0.01);
    return { atkPct: v, hpPct: v };
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
      /* 护甲此前既不计入战力、也不参与减伤，属于纯装饰属性 */
      + a.armor * 10
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
  /* 快速巡逻每日次数上限 */
  PATROL_FAST_MAX: 3,
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
    /* 【快速巡逻次数】每日重置
     * BUG：p.patrolFast 全项目【只有读取、没有任何赋值】——
     *      UI 显示 `${p.patrolFast||0}/3`，新号恒为 0；
     *      点按钮必走 `if ((p.patrolFast||0) <= 0) return toast('次数已用完')`。
     *      →「⚡ 快速巡逻」这个按钮从上线起就 100% 不可用，
     *        面板却一直标着「/3」，玩家只会以为是次数被自己用完了。
     * 【巡逻起始时间】p.patrolT 也从没初始化过：
     *      newPlayer 里没有该字段 → UI 用 `p.patrolT || 0`
     *      → now - 0 是天文数字 → hrs 被 min(8,…) 截到 8
     *      → 刚建号就能白领 8 小时巡逻收益。 */
    if (p.patrolDay !== dk) { p.patrolDay = dk; p.patrolFast = this.PATROL_FAST_MAX; }
    if (p.patrolFast == null) p.patrolFast = this.PATROL_FAST_MAX;
    if (!p.patrolT) p.patrolT = Date.now();
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
    const gs = this.addStamina(p, 60);
    /* 体力满时 addStamina 会被上限截断，用真实增量提示，避免「说给60实际给0」 */
    return { ok: true, msg: '月卡奖励：钻石+50 体力+' + gs + '（剩 ' + this.monthCardLeft(p) + ' 天）' };
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
        /* 此前硬编码：无论档位配的是 chipN(普通)/chipE(精英)/chipL(传说)，
         * 一律 rollChipById('l') 且只 push 1 个 —— 品质和数量都被忽略。
         * 当前 PASS_TIERS 只有 Lv50 的 chipL:1 恰好对上，所以没暴露；
         * 一旦后台/热更加一档 chipN:3，会发成「1 个传说芯片」。
         * 而且 catch 是空的：rollChipById 抛错时芯片静默丢失，
         * 玩家点「领取」提示成功、背包里什么都没有。 */
        p.bag = p.bag || [];
        const qmap = { chipN: 'n', chipE: 'e', chipL: 'l', chipRed: 'l', chip: 'n' };
        const q = qmap[k] || 'n';
        const cnt = Math.max(1, Math.min(20, Number(t.rw[k]) || 1));
        let ok = 0;
        for (let i = 0; i < cnt; i++) {
          try { const c = this.rollChipByQuality(q); if (c) { p.bag.push(c); ok++; } }
          catch (e) {}
        }
        /* 全部失败时兜底：折算成稀有金属，避免「领了等于没领」 */
        if (!ok) p.mat.M03 = (p.mat.M03 || 0) + cnt * 2;
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
      /* 抽奖产出精英芯片：同样要走品质入口（此前恒回退白色） */
      try { const c = this.rollChipByQuality('e'); if (c) p.bag.push(c); }
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
    /* 取「UTC+8 日历日」为 YYYYMMDD 整数
     * 严重 BUG 修复：原代码先 +8h 再用 getFullYear()/getMonth()/getDate() 读取，
     *   但这三个是【本地时区】方法，而 +8h 的目的是换算到 UTC+8。
     *   对中国用户（本身就是 UTC+8）等于又加了一次偏移 → 领先 16 小时
     *   → 【每天北京时间 16:00 之后签到，日期会被算成第二天】。
     *   后果：下午4点后签到 → signDay 记为明天；
     *        第二天早上再签 → 命中 `p.signDay === today` → 提示「今日已签到」，
     *        玩家白白少签一天，连续签到（7天50钻）直接断掉。
     *   实测：09-25 15:00 上海 → 20260925 ✔；09-25 16:30 上海 → 20260926 ✘
     * 现在改用 getUTC* 读取（时间已 +8h，UTC 视图即 UTC+8 日历日），全时区正确。 */
    const d = new Date(now + 8 * 3600000);
    const today = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    /* 旧存档矫正：若历史 signDay 是超前写入的错误值（>今天），重置掉，
     * 否则玩家当天会被「今日已签到」锁死。 */
    if (p.signDay && p.signDay > today) { p.signDay = 0; p.signDays = Math.max(0, (p.signDays || 1) - 1); }
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
    if ((p.stamina || 0) < EX.SWEEP_STAMINA) return { ok: false, msg: EX.tip('popup.noStamina', { v: EX.SWEEP_STAMINA }) };
    return { ok: true };
  },
  sweep(p, lvId, times) {
    const lvNum = parseInt(String(lvId).split('-')[1] || '1', 10);
    const ck = this.canSweep(p, lvId);
    if (!ck.ok) return ck;
    const t = Math.max(1, Math.min(EX.SWEEP_MAX, times || 1));
    const cost = EX.SWEEP_STAMINA * t;
    if ((p.stamina || 0) < cost) return { ok: false, msg: EX.tip('popup.noStaminaMax', { v: Math.floor((p.stamina || 0) / EX.SWEEP_STAMINA) }) };
    p.stamina -= cost;
    /* 严重 BUG 修复：此前的扫荡奖励走 EX.sweepRw 的独立公式
     *   gold = (120 + ch*60) × times
     * 第10章单次只有 720 金币，而同一关【手动通关】的关卡奖励是 50090 金币 ——
     * 差了近 70 倍。而且只发 M01 一种金属，关卡奖励里的 M02/M03/芯片/宝石
     * 一律没有。玩家花 5 体力扫荡，拿到的还不如手动通关的零头，
     * 扫荡功能实际上是个「亏本按钮」，没人会点。
     * 现在改为按【关卡真实奖励】发放，手动通关给什么，扫荡就给什么。 */
    const ld = (EX.levels || []).find((x) => x.id === lvId) || null;
    const rw = EX.sweepRw(lvNum, t);
    const goldGet = Math.floor(((ld && ld.rw && ld.rw.gold) || rw.gold) * t);
    p.gold = (p.gold || 0) + goldGet;
    p.mat = p.mat || {};
    const matGet = (ld && ld.rw) ? ld.rw : { M01: rw.M01 };
    Object.keys(matGet).forEach((k) => {
      if (k === 'gold' || k === 'diamond') return;
      p.mat[k] = (p.mat[k] || 0) + (Number(matGet[k]) || 0) * t;
    });
    if (ld && ld.rw && ld.rw.diamond) p.diamond = (p.diamond || 0) + ld.rw.diamond * t;
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
   * 活动奖励领取（表22：EV01~EV06 + 后台新建 ACTxxx）
   * 严重 BUG：ui.js 的 actExtraBtn 此前用 isBuiltin(/^EV\d+$/) 把 6 个内置活动
   *   全部排除 → 配了 rw 的活动（EV01 代币60+芯片、EV02 代币80+M03+钻石20、
   *   EV03 钻石30+M01、EV06 代币120+传说芯片+限定称号 endless_king）
   *   【页面上 data-actrw 领奖按钮数为 0】，奖励从上线起一次都没发出去过。
   * ======================================================== */
  actOf(id) { return (EX.acts || EX.activities || []).find((x) => x.id === id); },
  /* UTC+8 日历日（YYYYMMDD 整数），与 sign() 同一基准 */
  _utc8dayNum() {
    const d = new Date(Date.now() + 8 * 3600000);
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  },
  /* 本期是否已领（带周期重置）。旧档 actRwGot[id] 是数字 1 → 迁移为 {n:1} */
  actRwGot(p, id) {
    const a = this.actOf(id);
    const g = p.actRwGot || (p.actRwGot = {});
    let r = g[id];
    if (!r || typeof r !== 'object') r = g[id] = { n: (typeof r === 'number' && r) ? 1 : 0 };
    this._perReset(r, (a && a.per) || 'once', a && a.n);
    return r.n > 0;
  },
  /* 参与条件校验：内置活动各有门槛，避免无条件白拿 */
  actCondOk(p, a) {
    const c = (a && a.cond) || {};
    if (c.lvMin && (p.lv || 1) < c.lvMin) return { ok: false, msg: '等级不足（需 Lv.' + c.lvMin + '）' };
    if (c.clearedMin && Object.keys(p.cleared || {}).length < c.clearedMin) {
      return { ok: false, msg: '需通关 ' + c.clearedMin + ' 关' };
    }
    if (c.endlessMin && (p.endlessBest || 0) < c.endlessMin) {
      return { ok: false, msg: '需无尽模式达到 ' + c.endlessMin + ' 波' };
    }
    if (c.raidToday && !(p.bossRaidUsed > 0 && (p.bossRaidDate || '') === new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10))) {
      return { ok: false, msg: '需今日先挑战一次 BOSS 突袭' };
    }
    if (c.signToday && p.signDay !== this._utc8dayNum()) return { ok: false, msg: '需先完成今日签到' };
    return { ok: true };
  },
  actRwTake(p, id) {
    const a = this.actOf(id);
    if (!a || !a.rw || !Object.keys(a.rw).length) return { ok: false, msg: '该活动无奖励' };
    if (this.actRwGot(p, id)) return { ok: false, msg: '本期奖励已领取' };
    const c = this.actCondOk(p, a);
    if (!c.ok) return c;
    const g = p.actRwGot || (p.actRwGot = {});
    if (!g[id] || typeof g[id] !== 'object') g[id] = { n: 0 };
    g[id].n = 1; g[id].t = Date.now();
    this.grant(p, a.rw);
    return { ok: true, msg: '已领取「' + (a.n || '活动') + '」奖励' };
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
  _perReset(rec, per, evName) {
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
    /* per: 'ev'（活动期间限购）
     * BUG：此前 'ev' 不进任何分支 → 计数【永不重置】。
     *   活动商店 ES05/ES07/ES08/ES09/ES10/ES12 都是 per:'ev'。
     *   运营的活动是【周期性重开】的（EV02「BOSS突袭」每月1-3日、
     *   ES09/ES12「节日活动」每逢节日重开），但玩家第一轮买满后
     *   计数永久锁死 —— 第二轮、第三轮活动再开，老玩家【一件都买不了】，
     *   攒的活动代币再次变成废纸（代币本身此前也是零产出，已修）。
     * 修法：① 活动名变了立刻重置（后台改活动/换节日）；
     *       ② 按自然月兜底重置（配置里 per:'ev' 的活动都是每月/每季重开）。
     * 注：单机架构拿不到服务端「活动期数」，只能用这两个信号近似，
     *     若运营改为每周重开同名活动，需把下面改成按自然周。 */
    else if (per === 'ev') {
      const mk2 = d.getFullYear() * 100 + (d.getMonth() + 1);
      if (rec.ev != null && rec.ev !== (evName || '')) { rec.n = 0; rec.t = now; }
      if (rec.mk !== mk2) { rec.n = 0; rec.mk = mk2; rec.t = now; }
      rec.ev = evName || '';
    }
    return true;
  },
  achShopBuyItem(p, id) {
    const it = (EX.achShop || []).find((x) => x.id === id);
    if (!it) return { ok: false, msg: '商品不存在' };
    const b = p.achShopBuy || (p.achShopBuy = {});
    const k = this.achShopKey(id);
    if (!b[k]) b[k] = { n: 0, t: Date.now() };
    this._perReset(b[k], it.per, it.ev);
    /* 解锁条件（后台「解锁条件」配的「通关10关」）
     * 此前 need 恒为 0 且从不校验 —— 运营设了门槛，新玩家照样能直接兑换。 */
    if (it.need > 0 && Object.keys(p.cleared || {}).length < it.need) {
      return { ok: false, msg: '需先通关 ' + it.need + ' 关' };
    }
    if (b[k].n >= it.limit) return { ok: false, msg: '已达限购次数（' + it.limit + '）' };
    if ((p.ach || 0) < it.cost) return { ok: false, msg: '成就点不足（需 ' + it.cost + '）' };
    p.ach -= it.cost;
    b[k].n++; b[k].t = Date.now();
    this.grant(p, it.give);
    return { ok: true, msg: '兑换成功：' + it.n };
  },
  /* 按品质随机产出一颗芯片并放入背包
   * 白=普通(CH01~03) / 蓝=精英(CH04~05) / 红=传说(CH06~08) */
  giveChipByQuality(p, q) {
    const pool = (EX.chips || []).filter((c) => c.q === q);
    if (!pool.length) return null;
    const d = pool[Math.floor(Math.random() * pool.length)];
    const c = this.rollChipById(d.id);
    p.bag = p.bag || [];
    p.bag.push(c);
    return c;
  },
  /* =========================================================
   * 称号 / 头像框（此前 grant 写入 p.titles / p.frames 但全项目零读取）
   * ======================================================== */
  titleDef(id) { return (EX.titles || []).find((t) => t.id === id) || null; },
  frameDef(id) { return (EX.frames || []).find((t) => t.id === id) || null; },
  titleName(id) { const t = this.titleDef(id); return t ? t.n : (id || ''); },
  frameName(id) { const t = this.frameDef(id); return t ? t.n : (id || ''); },
  equipTitle(p, id) {
    if (id && (p.titles || []).indexOf(id) < 0) return { ok: false, msg: '未拥有该称号' };
    p.title = id || '';
    return { ok: true, msg: id ? ('已装备称号：' + this.titleName(id)) : '已卸下称号' };
  },
  equipFrame(p, id) {
    if (id && (p.frames || []).indexOf(id) < 0) return { ok: false, msg: '未拥有该头像框' };
    p.frame = id || '';
    return { ok: true, msg: id ? ('已装备头像框：' + this.frameName(id)) : '已卸下头像框' };
  },

  /* 通用发放 */
  grant(p, give) {
    if (!give) return;
    /* 类型守卫
     * BUG（会写脏数据）：表22 活动表里 rw 是【描述字符串】如 '活动代币 + 芯片'。
     * Object.keys('活动代币 + 芯片') 返回 ['0','1','2'...]，
     * 于是 grant 会走进 else 分支执行 p.mat['0'] = '活'、p.mat['1'] = '动'……
     * 结果：点领奖什么也拿不到，还往材料背包里塞进一堆汉字垃圾键。
     * 活动表已把描述改到 rwDesc、真正奖励改为 rw 对象；这里再加一层防御。 */
    if (typeof give !== 'object' || Array.isArray(give)) return;
    p.mat = p.mat || {};
    Object.keys(give).forEach((k) => {
      if (k === 'gold') p.gold = (p.gold || 0) + give[k];
      else if (k === 'diamond') p.diamond = (p.diamond || 0) + give[k];
      else if (k === 'stamina') p.stamina = Math.min(EX.STAMINA_MAX, (p.stamina || 0) + give[k]);
      /* 成就点（表33）
       * BUG：claimTask 里单独处理了 ach，但 grant() 没有该分支，
       *      于是图鉴解锁奖励 codexRw { gold:100, ach:5 } 经 grant 发放时，
       *      ach 掉进 else 写进 p.mat['ach'] —— 而成就商店读的是 p.ach。
       * 结果：界面写着「解锁奖励 +5 成就点」，实际成就点一分没加。 */
      else if (k === 'ach') p.ach = (p.ach || 0) + give[k];
      /* 活动代币（表43 活动商店的唯一货币）
       * BUG：evToken 全项目只有扣减（活动商店消费 engine.js:1180），
       *      从来没有任何一个地方发放 → 玩家代币恒为 0，
       *      表43 十二项商品（含传说芯片、限定皮肤、钻石、体力）一件都买不了。
       * 同时累计到 p.evScore 作为「活动冲榜」积分：
       *      p.evScore 此前从未赋值 → 活动冲榜排名恒 0
       *      → 表33 的 RK08/RK09/RK10 三个奖励（第1名皮肤、传说芯片、钻石）
       *        判定 inRank 恒为 false，玩家一次都领不到。 */
      else if (k === 'evToken' || k === 'ev') {
        const n = Number(give[k]) || 0;
        if (n > 0) { p.evToken = (p.evToken || 0) + n; p.evScore = (p.evScore || 0) + n; }
      }
      /* 消耗品别名兼容（防御）
       * 表16 文档里用 U01/U02 编号，而物品表真实 ID 是 I01/I02（急救包/护盾发生器）。
       * 成就商店 AS05/AS06 曾配成 give:{U01:1}/{U02:1}，兑换提示"成功"，
       * 实际写进 p.mat['U01']，而消耗品使用与背包只读 I01/I02
       * → 花 80/100 成就点兑换，背包消耗页永远 ×0，点了提示"数量不足"。
       * 配置已改为 I01/I02，这里再加一层别名映射，防止后台/热更再写回 U0x。 */
      else if (k === 'U01' || k === 'U02') {
        const real = 'I' + k.slice(1);
        p.mat[real] = (p.mat[real] || 0) + give[k];
      }
      else if (k === 'title') { p.titles = p.titles || []; if (p.titles.indexOf(give[k]) < 0) p.titles.push(give[k]); }
      /* 皮肤
       * BUG（会崩溃）：此处原写 `p.skin = p.skin || []; p.skin.push(...)`。
       * 但 p.skin 是【当前穿戴皮肤 ID】的字符串（newPlayer 里 'sk_c01a'），
       * 拥有的列表才叫 p.skins（数组）。字符串没有 .push，
       * → 一旦奖励里带 skin 就抛 "p.skin.push is not a function"，
       *   不仅皮肤拿不到，Object.keys(give).forEach 整个中断，
       *   同一份奖励里的其他物品也全部丢失。
       * 例如商城 SH08「废土战甲皮肤」(68元) 购买即崩。
       * 现在写入 p.skins 并自动穿戴。 */
      else if (k === 'skin') {
        const sid = give[k];
        if (sid) {
          p.skins = p.skins || [];
          if (p.skins.indexOf(sid) < 0) p.skins.push(sid);
          p.skin = sid;
        }
      }
      else if (k === 'frame') { p.frames = p.frames || []; if (p.frames.indexOf(give[k]) < 0) p.frames.push(give[k]); }
      /* 可镶嵌宝石：give: { gem: 'G_R' } → p.gems['G_R'] += 1
       * 修复：此前商城「红宝石/蓝宝石/绿宝石/紫宝石」发放的是 M05 材料，
       *       买了之后在宝石页永远显示数量 0，镶嵌/合成功能完全用不了 */
      else if (k === 'gem') {
        const gid = give[k];
        if (gid) { p.gems = p.gems || {}; p.gems[gid] = (p.gems[gid] || 0) + 1; }
      }
      /* 芯片包（表32/表35）：chipN 普通 / chipE 精英 / chipL·chipRed 传说
       * BUG：这四个 key 此前会掉进 else 分支写进 p.mat['chipE']，
       *       而芯片真实存放在 p.bag（物品对象数组），芯片面板只读 p.bag。
       * 结果：周礼包(300钻)、月度超值(680钻)、BOSS首杀、传说芯片包(98元)、
       *       战令50级 给的芯片全部"到账"但芯片页永远显示 0，无法装备/合成。
       * 现在按品质随机roll出真实芯片对象推进 p.bag。 */
      /* 品质码芯片（表33 排名奖励 / BOSS 掉落）：C01 白 / C02 蓝 / C03 红
       * BUG：这三个 key 此前掉进 else 写进 p.mat['C03']，
       *      而芯片真实存放在 p.bag → 领了排名奖励，芯片页永远 0 颗。
       * 注意 C01~C04 同时也是【角色 ID】，但角色不会通过 grant 发放
       * （角色靠通关解锁），此处按芯片品质码处理是安全的。 */
      else if (k === 'C01' || k === 'C02' || k === 'C03') {
        const q = k === 'C01' ? '白' : k === 'C02' ? '蓝' : '红';
        const n = Math.max(1, Math.floor(Number(give[k]) || 1));
        for (let i = 0; i < n; i++) this.giveChipByQuality(p, q);
      }
      else if (k === 'chipN' || k === 'chipE' || k === 'chipL' || k === 'chipRed') {
        const q = (k === 'chipN') ? '白' : (k === 'chipE') ? '蓝' : '红';
        const n = Math.max(1, Math.floor(Number(give[k]) || 1));
        for (let i = 0; i < n; i++) this.giveChipByQuality(p, q);
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
    this._perReset(b[k], it.per, it.ev);
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
  /* 图鉴解锁条件提示
   * BUG：图鉴面板此前给「未解锁」格子挂了 data-cdx，点击直接调 codexUnlock
   *      解锁并发奖。新号可把三个图鉴共 30 个未解锁条目一口气点完，
   *      白拿 5900 金币 + 295 成就点（初始金币才 2000、成就点 0），
   *      收集系统与成就商店经济全部失衡。
   * 现在未解锁格子只提示真实解锁途径，不再发放任何奖励。 */
  codexHint(p, kind, id) {
    if (kind === 'zombie') return '❔ 击败该怪物后自动解锁图鉴';
    if (kind === 'gun') return '❔ 装备该武器后自动解锁图鉴';
    if (kind === 'skin') return '❔ 获得该皮肤后自动解锁图鉴';
    return '❔ 未解锁';
  },
  /* 只允许由真实获得途径调用（击杀 / 装备武器 / 获得皮肤），
   * 不得由面板点击直接调用，否则图鉴奖励等于无限白嫖。 */
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
    if ((p.diamond || 0) < cost) return { ok: false, msg: EX.tip('popup.noDiamond', { v: cost }) };
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
  /* 分解【背包里的芯片】
   * BUG：分解面板硬编码列出 P01/P02/C01/C02/C03，全部读 p.mat[id]。
   *   但 C01/C02/C03 是【角色 ID】（幸存者-杰克 / 医疗兵-艾拉 / 重装兵-雷），
   *   芯片真实存放在 p.bag —— p.mat 里永远不会有 C0x。
   *   结果：① 三行显示的是三个【角色名】而不是芯片，玩家会以为能分解角色；
   *        ② 数量恒为 0 → 三个「分解」按钮【永远灰色不可点】；
   *        ③ 一行「一键分解全部」里也混着这三个死条目。
   * 现在改为按品质分解背包芯片（白200 / 蓝500 / 红1200 金币），
   * 优先分解该品质里主属性数值最低的一颗（最不心疼）。 */
  chipCountByQ(p, q) { return (p.bag || []).filter((c) => c.q === q).length; },
  dismantleChip(p, q) {
    const rate = ({ '白': 200, '蓝': 500, '红': 1200 })[q];
    if (!rate) return { ok: false, msg: '未知芯片品质' };
    const list = (p.bag || []).filter((c) => c.q === q);
    if (!list.length) return { ok: false, msg: '背包里没有' + q + '色芯片' };
    /* 挑主属性数值最低的一颗 */
    list.sort((a, b) => (a.main && a.main.v || 0) - (b.main && b.main.v || 0));
    const c = list[0];
    const i = (p.bag || []).findIndex((x) => x.id === c.id);
    if (i < 0) return { ok: false, msg: '未找到该芯片' };
    p.bag.splice(i, 1);
    p.gold = (p.gold || 0) + rate;
    return { ok: true, msg: '分解' + q + '色芯片 → 金币 +' + this.fmt(rate), gold: rate };
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
  /* 词条加成汇总
   * 严重BUG：项目里有【两套并行的词条容器】，而属性计算只认了其中一套的一半。
   *   ① p.gunAffix —— 普通词条（洗练/掉落），走 EX.affixes 表，affixBonus 已覆盖
   *   ② p.gunStats —— 进阶词条（每 5 级进阶解锁），走 EX.gunStats 表
   * 进阶词条此前只有 5 个 k 被 attrs 通过 gunStatVal() 读取
   * （dmg/crit/mag/pierce/rate），其余 7 条【完全无效】：
   *   AF04 暴伤 / AF06 吸血 / AF08 换弹 / AF09 爆炸范围 / AF10 穿透强化 /
   *   AF11 双倍伤害 / AF12 额外子弹
   * 红色品质（AF09~AF12，10% 概率）100% 是废词条 —— 玩家把武器升到 15/20 级
   * 花掉大量材料，提示「解锁词条：双倍伤害」，实测属性纹丝不动。
   * 现在把 gunStats 合并进同一份汇总表（k 名做映射），attrs 里已有的
   * af.xxx 消费点即可全部生效。 */
  affixBonus(p) {
    const b = { dmg: 0, rate: 0, crit: 0, critDmg: 0, pierce: 0, lifesteal: 0,
      mag: 0, reload: 0, er: 0, double: 0, extra: 0 };
    this.gunAffixes(p).forEach((af) => {
      const a = EX.affixOf(af.id); if (!a || !b.hasOwnProperty(a.k)) return;
      if (a.stack) b[a.k] += af.v; else b[a.k] = Math.max(b[a.k], af.v);
    });
    /* 进阶词条：EX.gunStats 的 k 名与 EX.affixes 不一致，这里做映射后累加 */
    const GK = { blastR: 'er', extraB: 'extra', pierce2: 'pierce' };
    const gs = p.gunStats || {};
    for (const s in gs) {
      const st = gs[s]; if (!st) continue;
      const k = GK[st.k] || st.k;
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
      /* 换弹：EX.gunStats 用 -0.2 表示「换弹时间 -0.2 秒」，
       * 而 attrs→battle 的 reloadCut 约定是正数表示减少的秒数
       * （_rt = max(0.3, _rt - reloadCut)）。取绝对值统一符号，
       * 否则进阶抽到 AF08 会让换弹【变慢】0.2 秒，与描述相反。 */
      const v = k === 'reload' ? Math.abs(+st.v || 0) : (+st.v || 0);
      b[k] += v;
    }
    return b;
  },
  /* 洗练：普通消耗金币，传说消耗钻石 */
  rerollAffix(p, legend) {
    const gid = p.gunId || (this.gun(p) || {}).id || 'W01';
    p.gunAffix = p.gunAffix || {};
    p.gunAffix[gid] = p.gunAffix[gid] || [];
    if (legend) {
      const c = EX.AFFIX_REROLL_LEGEND_DIA;
      if ((p.diamond || 0) < c) return { ok: false, msg: EX.tip('popup.noDiamond', { v: c }) };
      p.diamond -= c;
      p.gunAffix[gid] = [EX.rollAffixOne(true), EX.rollAffixOne(true)].slice(0, this.gunSlots(p));
    } else {
      const c = EX.AFFIX_REROLL_GOLD;
      if ((p.gold || 0) < c) return { ok: false, msg: EX.tip('popup.noCoin', { v: this.fmt(c) }) };
      p.gold -= c;
      p.gunAffix[gid] = [];
      for (let i = 0; i < this.gunSlots(p); i++) p.gunAffix[gid].push(EX.rollAffixOne(false));
    }
    return { ok: true, msg: '洗练完成！' };
  },

  /* 宝石合成：3 颗同级 → 1 颗高一级（截图「宝石合成」） */
  gemFuse(p, id) {
    const need = 3;
    if (!((p.gems || {})[id] >= need)) return { ok: false, msg: '需要 ' + need + ' 颗同色宝石' };
    p.gems[id] -= need;
    /* BUG修复：等级此前是全局单一数字 p.gemLv，4 种宝石共享。
     * 用最便宜的红宝石（200 钻）合成，最贵的紫宝石（300 钻）也跟着升级，
     * 宝石之间的成本差异形同虚设。改为每种宝石各自记等级。 */
    const lv = this.gemLvOf(p, id) + 1;
    this.setGemLv(p, id, lv);
    try { this.logAct(p, 'chip', '宝石合成 ' + id + ' → Lv.' + lv); } catch (e) {}
    return { ok: true, msg: '合成成功！宝石等级提升至 Lv.' + lv };
  },
  /* 宝石等级：按种类分别记录（旧档 p.gemLv 是数字，迁移到当前镶嵌的种类上） */
  gemLvOf(p, id) {
    const m = p.gemLv;
    if (m && typeof m === 'object') return m[id] || 0;
    /* 旧档：单一数字，视为当前镶嵌宝石的等级 */
    if (typeof m === 'number') return id && id === p.gemOn ? m : 0;
    return 0;
  },
  setGemLv(p, id, v) {
    if (!p.gemLv || typeof p.gemLv !== 'object') {
      const old = typeof p.gemLv === 'number' ? p.gemLv : 0;
      p.gemLv = {};
      if (old > 0 && p.gemOn) p.gemLv[p.gemOn] = old;
    }
    p.gemLv[id] = Math.max(0, Math.min(this.GEM_MAX_LV, v));
  },
  /* 镶嵌 / 卸下宝石（统一入口）
   * 此前两处逻辑不一致：角色页镶嵌【不扣】数量、宝石页镶嵌【扣 1 颗】，
   * 且两处卸下都不返还 —— 反复镶嵌卸下会让宝石凭空蒸发（实测 10 次蒸发 10 颗）。
   * 现统一为：镶嵌占用 1 颗（背包 -1），卸下/更换时完整返还。 */
  setGem(p, id) {
    const prev = p.gemOn;
    if (prev) { p.gems = p.gems || {}; p.gems[prev] = (p.gems[prev] || 0) + 1; p.gemOn = null; }
    if (!id) { E.save && E.save(p); return { ok: true, msg: '已卸下宝石' }; }
    if (!((p.gems || {})[id] > 0)) return { ok: false, msg: '该宝石数量不足' };
    p.gems[id] -= 1;
    p.gemOn = id;
    const g = (EX.gems || []).find((x) => x.id === id);
    try { this.logAct(p, 'gem', '镶嵌 ' + (g ? g.n : id)); } catch (e) {}
    return { ok: true, msg: '已镶嵌 ' + (g ? g.n : id) };
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
    const lv = Math.max(1, Math.min(this.GEM_MAX_LV, this.gemLvOf(p, id)));
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
    const lv = Math.max(1, Math.min(this.GEM_MAX_LV, this.gemLvOf(p, id)));
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
    this.syncAch(p);
  },
  /* 成就达成标记
   * BUG：UI 用 p.achGot 显示「已完成 x/4」，但 achGot 全项目从未被赋值
   * → 玩家成就全部做完领完，顶部仍显示 0/4，永远看不到进度。
   * 现在在每次战斗结算推进统计后同步一次。 */
  syncAch(p) {
    p.achGot = p.achGot || {};
    for (const a of (EX.tasks.achieve || [])) {
      if (this.taskDone(p, a)) p.achGot[a.id] = Date.now();
    }
    return p.achGot;
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
    /* 累计观看次数（不清零）
     * BUG：后台「广告统计」标称「总观看次数 / 人均观看」，
     * 读的却是 p.adUsed —— 而 adUsed 每天会被清空（见 adLeft 里的 dailyKey 判断）。
     * 结果后台看到的永远是【今日】数据，标签却写着「总」，
     * 运营据此做广告变现分析会严重低估。
     * 这里新增不清零的 adTotal 供后台统计累计值。 */
    p.adTotal = p.adTotal || {};
    p.adTotal[adId] = (p.adTotal[adId] || 0) + 1;
    return { ok: true };
  },
};

window.E = E;
