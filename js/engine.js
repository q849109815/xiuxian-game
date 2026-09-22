/* =========================================================
 * engine.js —— 核心数值引擎
 * 玩家数据模型 / 属性 / 战力 / 五行克制 / 境界突破
 * ========================================================= */

const E = {
  /* ============ 创建角色 ============ */
  newPlayer(uid, name, pwd, opt) {
    const root = opt.root || '金';
    const g = EX.roots.find((x) => x.k === root) || EX.roots[0];
    return {
      uid, name, pwd: this.hash(pwd),
      avatar: opt.avatar || '🧙', avatarId: 'a1',
      gender: opt.gender || 'm',
      root, rootName: g.n,
      realm: 0, layer: 0, exp: 0,          // 境界/小层/当前层修为
      hp: 0, mp: 0,                        // 当前气血灵力（0=满）
      stone: 200, jade: 0,
      createdAt: Date.now(), lastSeen: Date.now(),
      bag: [],                             // {id,uid?,n,cnt,type,q,slot,atk,def,hp,lv}
      equip: {},                           // {slotKey: item}
      skills: ['S1'],                      // 已学神通
      equipped: ['S1', null, null, null],  // 技能栏 1-4
      pets: [],                            // 灵宠
      petOut: null,
      puppets: [],                         // 傀儡
      puppetOut: null,
      partners: [],                        // 伙伴
      titles: ['T01'], titleCur: 'T01',
      avatars: ['a1'],
      cave: { lv: { field: 1, array: 1, close: 1, alchemy: 1, forge: 1 }, last: 0, seeds: [] },
      quest: { main: 0, done: [], side: [], bounty: [] },
      stats: { kills: 0, deaths: 0, battles: 0, breaks: 0, encounter: 0, dungeon: 0, online: 0 },
      sect: null,
      map: 'M1',
      lastTick: Date.now(),
      mail: [],
      autoFight: false,
    };
  },

  hash(s) {
    let h = 0;
    for (let i = 0; i < String(s).length; i++) { h = ((h << 5) - h) + String(s).charCodeAt(i); h |= 0; }
    return (h >>> 0).toString(36);
  },

  /* ============ 属性计算 ============ */
  attrs(p) {
    if (!p) return { ...EX.baseAttr, power: 0 };
    const r = EX.realmMul(p.realm);
    const rm = CFG.realm(p.realm);
    const bonus = rm.bonus || {};
    const all = 1 + (bonus.all || 0);

    let a = {
      hp: EX.baseAttr.hp * r * all,
      mp: EX.baseAttr.mp * r * all,
      atk: EX.baseAttr.atk * r * all,
      def: EX.baseAttr.def * r * all,
      sense: EX.baseAttr.sense * r * all,
      speed: EX.baseAttr.speed * (1 + p.realm * 0.1),
      crit: EX.baseAttr.crit + p.realm * 0.004,
      dodge: EX.baseAttr.dodge + p.realm * 0.003,
      hit: EX.baseAttr.hit,
    };
    // 境界专属加成
    if (bonus.atk) a.atk *= (1 + bonus.atk);
    if (bonus.def) a.def *= (1 + bonus.def);
    if (bonus.mp) a.mp *= (1 + bonus.mp);
    if (bonus.sense) a.sense *= (1 + bonus.sense);

    // 灵根加成
    const rk = p.root;
    if (rk === '金') a.atk *= 1.12;
    else if (rk === '土') { a.def *= 1.12; a.hp *= 1.1; }
    else if (rk === '水') { a.mp *= 1.15; a.sense *= 1.12; }
    else if (rk === '火') a.atk *= 1.1, a.crit += 0.03;
    else if (rk === '木') a.hp *= 1.12;

    // 装备
    for (const k in (p.equip || {})) {
      const it = p.equip[k];
      if (!it) continue;
      const m = 1 + (it.lv || 0) * 0.12;
      a.atk += (it.atk || 0) * m;
      a.def += (it.def || 0) * m;
      a.hp += (it.hp || 0) * m;
      a.mp += (it.mp || 0) * m || 0;
      a.sense += (it.sense || 0) * m || 0;
    }
    // 功法/法宝加成（已装备的法宝类）
    for (const sk of (p.skills || [])) {
      const d = CFG.skillById(sk);
      if (!d) continue;
      if ((d.eff || '').indexOf('剑伤') >= 0) a.atk *= 1.3;
      if ((d.eff || '').indexOf('神识') >= 0) a.sense *= 1.4;
      if ((d.eff || '').indexOf('法力') >= 0) a.mp *= 1.5;
      if ((d.eff || '').indexOf('神魂') >= 0) a.sense *= 1.5;
      if ((d.eff || '').indexOf('全属性') >= 0) { a.atk *= 1.3; a.def *= 1.3; a.hp *= 1.3; a.mp *= 1.3; }
      if ((d.eff || '').indexOf('遁速') >= 0) a.speed *= 1.3;
      if ((d.eff || '').indexOf('防御') >= 0) a.def *= 1.15;
      if ((d.eff || '').indexOf('攻击') >= 0) a.atk *= 1.1;
      if ((d.eff || '').indexOf('修炼速度') >= 0) a.speed *= 1.05;
    }
    // 灵宠出战
    if (p.petOut) {
      const pet = (p.pets || []).find((x) => x.id === p.petOut);
      if (pet) {
        const m = 1 + (pet.lv || 1) * 0.15;
        a.atk += 30 * m; a.hp += 200 * m;
        if (pet.evo === '虫王') a.atk *= 1.25;
      }
    }
    // 傀儡出战
    if (p.puppetOut) {
      const pu = (p.puppets || []).find((x) => x.id === p.puppetOut);
      if (pu) { a.atk += 80 * (1 + (pu.lv || 1) * 0.2); a.def += 40; }
    }
    // 称号
    const t = EX.titles.find((x) => x.id === p.titleCur);
    if (t) for (const k in (t.buff || {})) {
      if (k === 'all') { a.atk *= (1 + t.buff[k]); a.def *= (1 + t.buff[k]); a.hp *= (1 + t.buff[k]); a.mp *= (1 + t.buff[k]); }
      else if (k === 'crit') a.crit += t.buff[k];
      else if (a[k] !== undefined) a[k] *= (1 + t.buff[k]);
    }
    // 洞府聚灵阵
    const cl = (p.cave && p.cave.lv && p.cave.lv.array) || 1;
    a.mp *= (1 + cl * 0.05);
    return a;
  },

  power(p) {
    const a = this.attrs(p);
    return Math.round(a.atk * 2.4 + a.def * 2.8 + a.hp * 0.35 + a.mp * 0.5 + a.sense * 1.2 + a.crit * 800 + a.speed * 12);
  },

  maxHp(p) { return Math.round(this.attrs(p).hp); },
  maxMp(p) { return Math.round(this.attrs(p).mp); },

  /* ============ 五行克制 ============ */
  /** 返回伤害倍率：克制1.35，被克0.75，其余1 */
  counterMul(atkW, defW) {
    if (!atkW || !defW) return 1;
    if (EX.counter[atkW] === defW) return 1.35;
    if (EX.counter[defW] === atkW) return 0.75;
    return 1;
  },

  /* ============ 伤害计算 ============ */
  /** defP 可以是玩家，也可以是战斗体(foe)；战斗体直接用自身数值 */
  foeAttrs(d) {
    if (!d) return { hp: 1, mp: 0, atk: 0, def: 0, sense: 0, speed: 0, crit: 0, dodge: 0, hit: 0.9 };
    if (d.maxHp !== undefined) return {      // 战斗体
      hp: d.maxHp || 1, mp: d.sense || 0, atk: d.atk || 0, def: d.def || 0,
      sense: d.sense || 0, speed: d.speed || 0, crit: d.crit || 0,
      dodge: d.dodge || 0, hit: d.hit === undefined ? 0.9 : d.hit,
    };
    return this.attrs(d);                     // 玩家
  },

  calcDamage(atkP, defP, mul, skillW) {
    // 攻方可能是玩家，也可能是战斗体(foe)，统一用 foeAttrs 识别
    const A = this.foeAttrs(atkP), D = this.foeAttrs(defP);
    const cw = this.counterMul(skillW, defP ? defP.root : null);
    let dmg = A.atk * (mul || 1) * cw;
    // 防御减伤
    dmg *= (1 - Math.min(0.62, D.def / (D.def + 900)));
    // 暴击
    const crit = Math.random() < A.crit;
    if (crit) dmg *= 1.85;
    // 闪避
    const dodge = Math.random() < (D.dodge || 0);
    // 浮动
    dmg *= 0.9 + Math.random() * 0.2;
    return { dmg: Math.max(1, Math.round(dmg)), crit, dodge, counter: cw };
  },

  /* ============ 修为与境界 ============ */
  expNeed(p) { return EX.expNeed(p.realm, p.layer); },
  layerMax(p) { return EX.layerCount(p.realm); },

  /** 加修为，自动升级小层 */
  gainExp(p, n) {
    p.exp += n;
    let up = 0;
    let guard = 0;
    const maxL = this.layerMax(p);
    while (guard++ < 200) {
      const need = this.expNeed(p);
      // 已到本境界最高层且修为已满 → 停满，不再计入升级（避免「修为精进」刷屏）
      if (p.layer >= maxL - 1 && p.exp >= need) { p.exp = need; break; }
      if (p.exp < need) break;
      p.exp -= need;
      p.layer++;
      up++;
      if (p.layer >= maxL) { p.layer = maxL - 1; p.exp = need; break; }
    }
    return up;
  },

  /** 是否已圆满（可突破） */
  isFull(p) {
    return p.layer >= this.layerMax(p) - 1 && p.exp >= this.expNeed(p) * 0.999;
  },

  /** 突破到大境界：需丹药 + 心魔/渡劫 */
  canBreak(p) {
    if (!this.isFull(p)) return { ok: false, msg: '修为未圆满' };
    if (p.realm >= CFG.realmCount - 1) return { ok: false, msg: '已至顶峰' };
    const rm = CFG.realm(p.realm);
    const cond = rm.breakCond || '';
    // 找需要的丹药（突破条件里含"丹"）
    let needPill = null;
    const mm = cond.match(/([\u4e00-\u9fa5]+丹)/);
    if (mm) needPill = mm[1];
    if (needPill) {
      const own = (p.bag || []).some((x) => (x.n || '').indexOf(needPill) >= 0);
      if (!own) return { ok: false, msg: '需要【' + needPill + '】（炼丹/副本获取）', pill: needPill };
    }
    return { ok: true, msg: '可以突破', pill: needPill };
  },

  doBreak(p) {
    const c = this.canBreak(p);
    if (!c.ok) return c;
    // 消耗丹药
    if (c.pill) {
      const i = (p.bag || []).findIndex((x) => (x.n || '').indexOf(c.pill) >= 0);
      if (i >= 0) { p.bag[i].cnt--; if (p.bag[i].cnt <= 0) p.bag.splice(i, 1); }
    }
    // 成功率：基础 + 丹药加成
    let rate = 0.55;
    if (c.pill === '降尘丹') rate += 0.2;
    if (c.pill === '凝婴丹') rate += 0.15;
    rate = Math.min(0.95, rate);
    const win = Math.random() < rate;
    if (win) {
      p.realm++; p.layer = 0; p.exp = 0;
      p.stats.breaks = (p.stats.breaks || 0) + 1;
      p.hp = 0; p.mp = 0;
      // 解锁奖励
      const rm = CFG.realm(p.realm);
      return { ok: true, msg: '突破成功！晋升【' + rm.name + '】', unlock: rm.unlock, realm: p.realm };
    }
    // 失败惩罚
    const rm = CFG.realm(p.realm);
    const pen = rm.failPenalty || '';
    if (pen.indexOf('重创') >= 0 || pen.indexOf('跌落') >= 0) {
      p.exp = Math.round(p.exp * 0.5);
      if (p.realm > 0 && Math.random() < 0.3) { p.realm--; p.layer = EX.layerCount(p.realm) - 1; p.exp = Math.round(EX.expNeed(p.realm, p.layer) * 0.8); }
      return { ok: false, msg: '渡劫失败，身受重创，修为大损', hard: true };
    }
    p.exp = Math.round(p.exp * 0.7);
    return { ok: false, msg: '突破失败，修为受损（' + Math.round(rate * 100) + '% 成功率）' };
  },

  /* ============ 背包 ============ */
  addItem(p, name, cnt, extra) {
    cnt = cnt || 1;
    const def = CFG.itemByName(name) || {};
    const ex = (p.bag || []).find((x) => x.n === name && !x.lv);
    if (ex && def.type !== '装备') { ex.cnt += cnt; return ex; }
    const it = {
      n: name, cnt, type: def.type || extra?.type || '材料',
      q: def.q || extra?.q || '下品',
      icon: extra?.icon || this.iconFor(def.type),
      atk: extra?.atk || 0, def: extra?.def || 0, hp: extra?.hp || 0,
      mp: extra?.mp || 0, sense: extra?.sense || 0,
      slot: extra?.slot || null, lv: 0,
    };
    p.bag = p.bag || [];
    p.bag.push(it);
    if (p.bag.length > 120) p.bag.shift();
    return it;
  },

  iconFor(type) {
    const m = { '丹药': '💊', '灵草': '🌿', '材料': '🪨', '货币': '💎', '法宝': '🔮', '符箓': '📜', '装备': '⚔️', '功法': '📕', '道具': '🎒' };
    return m[type] || '📦';
  },

  hasItem(p, name, cnt) {
    const it = (p.bag || []).find((x) => x.n === name);
    return it && (it.cnt || 0) >= (cnt || 1);
  },
  useItem(p, name, cnt) {
    const it = (p.bag || []).find((x) => x.n === name);
    if (!it) return false;
    it.cnt -= (cnt || 1);
    if (it.cnt <= 0) p.bag.splice(p.bag.indexOf(it), 1);
    return true;
  },

  /* ============ 装备 ============ */
  equipItem(p, idx) {
    const it = p.bag[idx];
    if (!it || !it.slot) return { ok: false, msg: '不可装备' };
    const old = p.equip[it.slot];
    p.equip[it.slot] = it;
    p.bag.splice(idx, 1);
    if (old) p.bag.push(old);
    return { ok: true, msg: '已装备【' + it.n + '】' };
  },
  unequip(p, slot) {
    const it = p.equip[slot];
    if (!it) return { ok: false, msg: '空槽位' };
    delete p.equip[slot];
    p.bag.push(it);
    return { ok: true, msg: '已卸下' };
  },

  /* ============ 任务 ============ */
  curMain(p) {
    const list = CFG.mainQuests();
    return list[Math.min(p.quest.main, list.length - 1)];
  },
  mainProgress(p) {
    const list = CFG.mainQuests();
    return { cur: Math.min(p.quest.main, list.length), total: list.length, done: p.quest.main >= list.length };
  },

  /* ============ 离线收益 ============ */
  offline(p, minutes) {
    minutes = Math.min(minutes, 720);
    if (minutes < 1) return null;
    const exp = Math.round(EX.expPerMin(p.realm) * minutes * 0.6);
    const stone = Math.round(EX.stonePerMin(p.realm) * minutes * 0.6);
    const up = this.gainExp(p, exp);
    p.stone += stone;
    return { exp, stone, up, minutes };
  },

  /* ============ 每秒 tick ============ */
  tick(p, dtSec) {
    const m = dtSec / 60;
    const caveMul = 1 + ((p.cave?.lv?.array || 1) - 1) * 0.1;
    const exp = EX.expPerMin(p.realm) * m * caveMul;
    const up = this.gainExp(p, exp);
    p.stone += EX.stonePerMin(p.realm) * m;
    p.lastTick = Date.now();
    // 灵力自然回复
    if (p.mp < this.maxMp(p)) p.mp = Math.min(this.maxMp(p), p.mp + this.maxMp(p) * 0.02 * dtSec);
    if (p.hp < this.maxHp(p)) p.hp = Math.min(this.maxHp(p), p.hp + this.maxHp(p) * 0.01 * dtSec);
    return up;
  },

  fmt(n) {
    n = Math.round(n || 0);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
    return '' + n;
  },
};

window.E = E;
