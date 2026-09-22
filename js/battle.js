/* =========================================================
 * battle.js —— 即时制 ARPG 战斗引擎（多单位同屏 / 自动出手 / 伤害飘字）
 * 资料依据：22_玩法操作指南 第1条「战斗操作」
 * 参考界面：截图32（海面多角色 vs 多怪，持续飘伤害数字，自动/升级控件）
 *
 * 设计要点：
 *  - 不是回合制：所有单位按各自攻速独立计时，到点自动出手
 *  - 我方阵列：主角 + 出战伙伴 + 灵宠 + 傀儡（最多4个）
 *  - 敌方阵列：1~3 只（普通1只 / 精英2只 / BOSS 1只+2小怪）
 *  - 主循环 tick(dtSec) 推进，玩家点技能为「立即释放」
 * ========================================================= */

const BT = {
  on: false,
  auto: true,          // 即时制默认自动战斗
  speed: 1,            // 战斗倍速（1/2/3）
  allies: [],          // 我方单位
  foes: [],            // 敌方单位
  cd: [0, 0, 0, 0],    // 主角技能冷却
  petCd: 0,
  pupCd: 0,
  _p: null,
  _cb: null,
  _t: 0,               // 已战斗时长
  _tickTimer: null,

  /* ---------- 图标 ---------- */
  iconFor(name) {
    const s = String(name || '');
    if (s.indexOf('蛇') >= 0) return '🐍';
    if (s.indexOf('雕') >= 0) return '🦅';
    if (s.indexOf('鳌') >= 0) return '🐢';
    if (s.indexOf('蝎') >= 0) return '🦂';
    if (s.indexOf('猿') >= 0) return '🦍';
    if (s.indexOf('虫') >= 0) return '🐛';
    if (s.indexOf('魂') >= 0) return '👻';
    if (s.indexOf('傀儡') >= 0 || s.indexOf('偶') >= 0) return '🗿';
    if (s.indexOf('海盗') >= 0) return '🏴‍☠️';
    if (s.indexOf('章') >= 0) return '🦑';
    if (s.indexOf('兽') >= 0) return '🦖';
    if (s.indexOf('长') >= 0 || s.indexOf('老') >= 0) return '🧟';
    if (s.indexOf('宫主') >= 0 || s.indexOf('将军') >= 0) return '🧛‍♂️';
    if (s.indexOf('心魔') >= 0) return '🌑';
    return '👹';
  },

  rootOf(def) {
    const s = (def.attr || '') + (def.skill || '') + (def.name || '');
    if (s.indexOf('水') >= 0 || s.indexOf('海') >= 0) return '水';
    if (s.indexOf('火') >= 0 || s.indexOf('焰') >= 0) return '火';
    if (s.indexOf('金') >= 0 || s.indexOf('剑') >= 0 || s.indexOf('鳞') >= 0) return '金';
    if (s.indexOf('木') >= 0 || s.indexOf('毒') >= 0 || s.indexOf('草') >= 0) return '木';
    if (s.indexOf('土') >= 0 || s.indexOf('石') >= 0 || s.indexOf('龟') >= 0) return '土';
    return '水';
  },

  /* ---------- 构造单位 ---------- */
  mkUnit(o) {
    return {
      id: o.id, name: o.name, icon: o.icon || '👹', img: o.img || '',
      side: o.side,                    // 'me' | 'foe'
      hp: o.hp, maxHp: o.maxHp,
      atk: o.atk, def: o.def,
      crit: o.crit || 0.05, dodge: o.dodge || 0.02, hit: o.hit === undefined ? 0.9 : o.hit,
      speed: o.speed || 10,            // 身法：越大出手越快
      atkInt: o.atkInt || 1.0,         // 攻击间隔（秒）
      timer: Math.random() * 0.5,      // 出手计时（错开）
      root: o.root || '金',
      dead: false,
      isHero: !!o.isHero, isPet: !!o.isPet, isPup: !!o.isPup, isMate: !!o.isMate,
      drop: o.drop || '', type: o.type || '野怪',
    };
  },

  /* ---------- 开始战斗 ---------- */
  start(p, foeDef, opt) {
    this.stop(true);
    opt = opt || {};
    this._p = p;
    this._cb = opt.cb || null;
    this._t = 0;
    this.cd = [0, 0, 0, 0];
    this.petCd = 0; this.pupCd = 0;

    const scale = Math.pow(1.75, p.realm);
    const mul = opt.mul || 1;
    const a = E.attrs(p);

    /* --- 我方阵列 --- */
    this.allies = [];
    // 1. 主角
    this.allies.push(this.mkUnit({
      id: 'hero', name: p.name, icon: p.avatar || '🧙',
      img: 'assets/char/' + (p.face || 'hanli') + '.jpg',
      side: 'me', hp: E.maxHp(p), maxHp: E.maxHp(p),
      atk: a.atk, def: a.def, crit: a.crit, dodge: a.dodge, hit: 0.92,
      speed: a.speed || 10, atkInt: Math.max(0.45, 1.25 - (a.speed || 10) / 40),
      root: p.root || '金', isHero: true,
    }));
    // 2. 出战伙伴（最多2）
    const mates = (p.partners || []).filter((x) => x.out).slice(0, 2);
    mates.forEach((m, i) => {
      const lv = m.lv || 1;
      this.allies.push(this.mkUnit({
        id: 'mate' + i, name: m.n || m.name || '道友', icon: '👤',
        side: 'me', hp: Math.round(a.hp * 0.6 * (1 + lv * 0.1)), maxHp: Math.round(a.hp * 0.6 * (1 + lv * 0.1)),
        atk: Math.round(a.atk * 0.55 * (1 + lv * 0.08)), def: Math.round(a.def * 0.7),
        crit: 0.05, dodge: 0.03, hit: 0.88, speed: 9 + i, atkInt: 1.5 - lv * 0.02,
        root: '金', isMate: true,
      }));
    });
    // 3. 灵宠
    if (p.petOut && (p.pets || []).length) {
      const pt = p.pets.find((x) => x.out) || p.pets[0];
      if (pt) {
        const lv = pt.lv || 1;
        this.allies.push(this.mkUnit({
          id: 'pet', name: pt.n || pt.name || '灵宠', icon: '🐾',
          side: 'me', hp: Math.round(a.hp * 0.45 * (1 + lv * 0.12)), maxHp: Math.round(a.hp * 0.45 * (1 + lv * 0.12)),
          atk: Math.round(a.atk * 0.4 * (1 + lv * 0.1)), def: Math.round(a.def * 0.5),
          crit: 0.08, dodge: 0.06, hit: 0.9, speed: 12, atkInt: 1.1,
          root: '木', isPet: true,
        }));
      }
    }
    // 4. 傀儡
    if (p.pupOut && (p.puppets || []).length) {
      const pu = p.puppets[0];
      if (pu) {
        this.allies.push(this.mkUnit({
          id: 'pup', name: pu.n || pu.name || '傀儡', icon: '🗿',
          side: 'me', hp: Math.round(a.hp * 0.7), maxHp: Math.round(a.hp * 0.7),
          atk: Math.round(a.atk * 0.5), def: Math.round(a.def * 1.3),
          crit: 0.03, dodge: 0.01, hit: 0.95, speed: 6, atkInt: 1.9,
          root: '土', isPup: true,
        }));
      }
    }

    /* --- 敌方阵列 --- */
    this.foes = [];
    const mkFoe = (def, idx, isBoss) => {
      const bm = isBoss ? 1.9 : (idx === 0 ? 1 : 0.78);
      return this.mkUnit({
        id: 'foe' + idx, name: def.name || def.n || '妖兽',
        icon: def.icon || this.iconFor(def.name || def.n || ''),
        side: 'foe',
        hp: Math.round((400 * scale + 200) * mul * bm), maxHp: Math.round((400 * scale + 200) * mul * bm),
        atk: Math.round((a.atk * 0.55 + 40 * scale) * mul * bm),
        def: Math.round((a.def * 0.5 + 20 * scale) * bm),
        crit: isBoss ? 0.08 : 0.04, dodge: 0.02, hit: 0.9,
        speed: 8 + p.realm, atkInt: isBoss ? 1.5 : 1.25,
        root: this.rootOf(def), drop: def.drop || def.掉落 || '',
        type: isBoss ? 'BOSS' : (def.type || '野怪'),
      });
    };
    const isBoss = opt.boss || /王|主|首领|母|魔/.test(foeDef.name || '');
    this.foes.push(mkFoe(foeDef, 0, isBoss));
    if (opt.adds) {
      const pool = (CFG.core.monsters || []).filter((m) => (m.name || m.n) !== (foeDef.name || foeDef.n));
      for (let i = 0; i < opt.adds && i < pool.length; i++) {
        this.foes.push(mkFoe(pool[Math.floor(Math.random() * pool.length)], i + 1, false));
      }
    }

    this.on = true;
    // 主角满血满蓝起战
    if (p.hp <= 0) p.hp = E.maxHp(p);
    if (p.mp <= 0) p.mp = E.maxMp(p);

    if (UI && UI.showBattle) UI.showBattle(this);
    this.startTick();
    return { allies: this.allies, foes: this.foes };
  },

  /* ---------- 主循环（即时制核心） ---------- */
  startTick() {
    this.stopTick();
    let last = Date.now();
    this._tickTimer = setInterval(() => {
      if (!this.on) return;
      const now = Date.now();
      const dt = Math.min(0.25, (now - last) / 1000) * this.speed;
      last = now;
      this.tick(dt);
    }, 100);
  },
  stopTick() { if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; } },

  tick(dt) {
    if (!this.on) return;
    this._t += dt;
    const p = this._p;

    // 技能冷却
    for (let i = 0; i < 4; i++) if (this.cd[i] > 0) this.cd[i] = Math.max(0, this.cd[i] - dt);
    if (this.petCd > 0) this.petCd = Math.max(0, this.petCd - dt);
    if (this.pupCd > 0) this.pupCd = Math.max(0, this.pupCd - dt);

    // 自动释放技能（自动战斗时）
    if (this.auto) {
      for (let i = 0; i < 4; i++) {
        const slotId = (p.equipped || [])[i];
        if (!slotId) continue;
        const sk = (EX.skills || []).find((x) => x.id === slotId);
        if (!sk) continue;
        if (this.cd[i] <= 0 && (p.mp || 0) >= (sk.cost || 0)) { this.skill(i, true); break; }
      }
    }

    // 所有存活单位按攻速出手
    const all = this.allies.concat(this.foes).filter((u) => !u.dead);
    for (const u of all) {
      u.timer += dt;
      if (u.timer >= u.atkInt) {
        u.timer = 0;
        this.unitAct(u);
        if (!this.on) return;
      }
    }

    if (UI && UI.updateBattle) UI.updateBattle();
  },

  /** 单个单位出手 */
  unitAct(u) {
    const p = this._p;
    if (u.side === 'me') {
      const targets = this.foes.filter((x) => !x.dead);
      if (!targets.length) return;
      const tg = targets[0];   // 优先打第一个（可改为最低血）
      const r = E.calcDamage(u, tg, 1.0, u.root);
      this.hit(tg, r, u);
    } else {
      // 敌方随机打我方一个（优先主角）
      const targets = this.allies.filter((x) => !x.dead);
      if (!targets.length) return;
      let tg = targets.find((x) => x.isHero) || targets[Math.floor(Math.random() * targets.length)];
      // 20% 概率打其他单位
      if (targets.length > 1 && Math.random() < 0.25) tg = targets[Math.floor(Math.random() * targets.length)];
      const r = E.calcDamage(u, tg, 0.85, u.root);
      this.hit(tg, r, u);
    }
  },

  /** 结算一次打击 */
  hit(target, r, from) {
    if (!target || target.dead) return;
    if (r.dodge) {
      if (UI) UI.floatText('闪避', 'miss', target.side === 'foe' ? 70 : 30, target.side === 'foe' ? 30 : 62);
      return;
    }
    target.hp -= r.dmg;
    if (UI && UI.hitFx) UI.hitFx(target, r.dmg, r.crit, r.counter, from);
    // 主角血量同步回存档
    const hero = this.allies.find((x) => x.isHero);
    if (hero) { this._p.hp = Math.max(0, hero.hp); }
    if (target.hp <= 0) { target.hp = 0; target.dead = true; }
    this.checkEnd();
  },

  checkEnd() {
    if (!this.on) return;
    if (!this.foes.some((x) => !x.dead)) { this.win(); return; }
    if (!this.allies.some((x) => !x.dead)) { this.lose(); return; }
  },

  /* ---------- 玩家操作 ---------- */
  /** 手动普攻（立即出手，重置主角计时） */
  attack() {
    if (!this.on) return;
    const hero = this.allies.find((x) => x.isHero && !x.dead);
    if (!hero) return;
    hero.timer = hero.atkInt;   // 立即触发
    this.unitAct(hero);
    if (UI && UI.heroLunge) UI.heroLunge();
  },

  /** 释放技能槽 0-3 */
  skill(i, silent) {
    if (!this.on || !this._p) return;
    const p = this._p;
    const hero = this.allies.find((x) => x.isHero && !x.dead);
    if (!hero) return;
    const slotId = (p.equipped || [])[i];
    if (!slotId) { if (!silent && UI) UI.toast('该槽位未装配神通', 'err'); return; }
    const sk = (EX.skills || []).find((x) => x.id === slotId);
    if (!sk) return;
    if (this.cd[i] > 0) { if (!silent && UI) UI.toast('【' + (sk.n || sk.name) + '】冷却中 ' + this.cd[i].toFixed(1) + 's', 'err'); return; }
    if ((p.mp || 0) < (sk.cost || 0)) { if (!silent && UI) UI.toast('灵力不足', 'err'); return; }
    p.mp -= (sk.cost || 0);
    this.cd[i] = sk.cd || 4;
    const tg = this.foes.filter((x) => !x.dead)[0];
    if (tg) {
      const r = E.calcDamage(hero, tg, sk.mul || 1.6, sk.w || sk.root || hero.root);
      // 群体技能：打全部
      if (sk.aoe) {
        this.foes.filter((x) => !x.dead).forEach((t) => {
          const rr = E.calcDamage(hero, t, sk.mul || 1.6, sk.w || sk.root || hero.root);
          this.hit(t, rr, hero);
        });
      } else this.hit(tg, r, hero);
      if (UI && UI.floatSkill) UI.floatSkill(sk.n || sk.name, sk.w);
    }
    hero.timer = 0;
    if (UI && UI.heroLunge) UI.heroLunge();
  },

  /** 灵宠技 */
  pet() {
    if (!this.on) return;
    if (this.petCd > 0) { if (UI) UI.toast('灵宠冷却中', 'err'); return; }
    const pet = this.allies.find((x) => x.isPet && !x.dead);
    if (!pet) { if (UI) UI.toast('未出战灵宠', 'err'); return; }
    this.petCd = 12;
    const tg = this.foes.filter((x) => !x.dead)[0];
    if (tg) { const r = E.calcDamage(pet, tg, 2.2, pet.root); this.hit(tg, r, pet); }
    if (UI && UI.floatSkill) UI.floatSkill('灵宠助战', '木');
  },

  /** 傀儡技 */
  puppet() {
    if (!this.on) return;
    if (this.pupCd > 0) { if (UI) UI.toast('傀儡冷却中', 'err'); return; }
    const pup = this.allies.find((x) => x.isPup && !x.dead);
    if (!pup) { if (UI) UI.toast('未出战傀儡', 'err'); return; }
    this.pupCd = 18;
    const tg = this.foes.filter((x) => !x.dead)[0];
    if (tg) { const r = E.calcDamage(pup, tg, 2.8, pup.root); this.hit(tg, r, pup); }
    if (UI && UI.floatSkill) UI.floatSkill('傀儡护主', '土');
  },

  setAuto(v) {
    this.auto = !!v;
    if (UI && UI.updateAuto) UI.updateAuto(this.auto);
  },
  setSpeed(v) { this.speed = v || 1; },
  flee() {
    if (!this.on) return;
    this.on = false;
    this.stopTick();
    if (UI && UI.battleResult) UI.battleResult('flee');
    if (UI && UI.hideBattle) UI.hideBattle();
    if (this._cb) this._cb('flee');
  },

  /* ---------- 结束 ---------- */
  win() {
    if (!this.on) return;
    this.on = false;
    this.stopTick();
    const p = this._p;
    const mins = 6 + Math.random() * 6;
    const exp = Math.round(EX.expPerMin(p.realm) * mins);
    const stone = Math.round(EX.stonePerMin(p.realm) * mins);
    const up = E.gainExp(p, exp);
    p.stone += stone;
    p.stats.battles = (p.stats.battles || 0) + 1;
    p.stats.kills = (p.stats.kills || 0) + this.foes.length;
    // 掉落
    const drops = [];
    this.foes.forEach((f) => {
      if (f.drop && Math.random() < 0.5) { E.addItem(p, f.drop, 1); drops.push(f.drop); }
    });
    if (UI && UI.battleResult) UI.battleResult('win', { exp, stone, drops, up });
    if (UI && UI.hideBattle) UI.hideBattle();
    if (this._cb) this._cb('win', { exp, stone, drops });
  },

  lose() {
    if (!this.on) return;
    this.on = false;
    this.stopTick();
    const p = this._p;
    p.hp = Math.max(1, Math.round(E.maxHp(p) * 0.1));
    p.mp = 0;
    if (UI && UI.battleResult) UI.battleResult('lose');
    if (UI && UI.hideBattle) UI.hideBattle();
    if (this._cb) this._cb('lose');
  },

  stop(silent) {
    this.on = false;
    this.stopTick();
    this.allies = []; this.foes = [];
    if (!silent && UI && UI.hideBattle) UI.hideBattle();
  },

  /** 兼容旧接口 */
  get foe() {
    return this.foes.find((x) => !x.dead) || this.foes[0] || null;
  },
};

window.BT = BT;
