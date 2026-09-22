/* =========================================================
 * battle.js —— 即时制战斗（伪3D 动作 + 伤害飘字 + 自动战斗）
 * 资料依据：22_玩法操作指南 第1条「战斗操作」
 * ========================================================= */

const BT = {
  on: false,
  foe: null,          // {name,icon,hp,maxHp,atk,def,root,w,type,drop}
  auto: false,
  timer: null,
  autoT: null,
  cd: [0, 0, 0, 0],   // 技能冷却（秒）
  petUsed: false,
  puppetUsed: false,
  _p: null,
  _cb: null,

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

  /* ---------- 开始战斗 ---------- */
  start(p, foeDef, opt) {
    this.stop(false);
    opt = opt || {};
    this._p = p;
    this._cb = opt.cb || null;
    const mul = opt.mul || 1;
    const scale = Math.pow(1.75, p.realm);
    const a = E.attrs(p);
    this.foe = {
      name: foeDef.name || foeDef.n || '妖兽',
      icon: foeDef.icon || this.iconFor(foeDef.name || foeDef.n || ''),
      root: this.rootOf(foeDef),
      w: this.rootOf(foeDef),
      maxHp: Math.round((400 * scale + 200) * mul),
      atk: Math.round((a.atk * 0.55 + 40 * scale) * mul),
      def: Math.round((a.def * 0.5 + 20 * scale) * mul),
      sense: 30 * scale,
      crit: 0.04, dodge: 0.02, hit: 0.9,
      speed: 8 + p.realm,
      drop: foeDef.drop || foeDef.掉落 || '',
      type: foeDef.type || '野怪',
    };
    this.foe.hp = this.foe.maxHp;
    if (p.hp <= 0) p.hp = E.maxHp(p);
    if (p.mp <= 0) p.mp = E.maxMp(p);
    this.on = true;
    this.cd = [0, 0, 0, 0];
    this.petUsed = false;
    this.puppetUsed = false;
    if (UI && UI.showBattle) UI.showBattle(this.foe);
    return this.foe;
  },

  stop(silent) {
    this.on = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.autoT) { clearInterval(this.autoT); this.autoT = null; }
    if (!silent && UI && UI.hideBattle) UI.hideBattle();
  },

  /* ---------- 玩家行动 ---------- */
  /** 普攻 */
  attack() {
    if (!this.on || !this._p) return;
    const p = this._p;
    const r = E.calcDamage(p, this.foe, 1.0, p.root);
    this.applyToFoe(r);
    this.heroAct();
    this.afterPlayer();
  },

  /** 技能槽 0-3 */
  skill(i) {
    if (!this.on || !this._p) return;
    const p = this._p;
    const slotId = p.equipped[i];
    if (!slotId) { UI.toast('该槽位未装配神通', 'err'); return; }
    const sk = EX.skills.find((x) => x.id === slotId);
    if (!sk) return;
    if (this.cd[i] > 0) { UI.toast('【' + sk.n + '】冷却中 ' + this.cd[i].toFixed(1) + 's', 'err'); return; }
    if ((p.mp || 0) < sk.cost) { UI.toast('灵力不足', 'err'); return; }
    p.mp -= sk.cost;
    this.cd[i] = sk.cd;
    const r = E.calcDamage(p, this.foe, sk.mul, sk.w);
    this.applyToFoe(r, sk);
    this.heroAct();
    UI.floatSkill(sk.n, sk.w);
    this.afterPlayer();
  },

  /** 灵宠助战 */
  pet() {
    if (!this.on || !this._p) return;
    const p = this._p;
    if (!p.petOut) { UI.toast('未设置出战灵宠', 'err'); return; }
    if (this.petUsed) { UI.toast('灵宠本场已助战', 'err'); return; }
    this.petUsed = true;
    const pet = (p.pets || []).find((x) => x.id === p.petOut);
    const times = pet && pet.evo === '虫王' ? 5 : 3;
    let sum = 0;
    for (let i = 0; i < times; i++) {
      const r = E.calcDamage(p, this.foe, 0.85, '金');
      sum += r.dodge ? 0 : r.dmg;
      if (i === 0) this.applyToFoe(r);
    }
    UI.floatText('灵宠虫潮 ' + E.fmt(sum), 'heal', 60, 30);
    UI.fx('虫潮');
    this.afterPlayer();
  },

  /** 傀儡助战 */
  puppet() {
    if (!this.on || !this._p) return;
    const p = this._p;
    if (!p.puppetOut) { UI.toast('未设置出战傀儡', 'err'); return; }
    if (this.puppetUsed) { UI.toast('傀儡本场已助战', 'err'); return; }
    this.puppetUsed = true;
    const r = E.calcDamage(p, this.foe, 3.2, '土');
    this.applyToFoe(r);
    UI.floatText('曲魂·煞力 ' + E.fmt(r.dmg), 'crit', 40, 30);
    UI.fx('傀儡');
    this.afterPlayer();
  },

  /* ---------- 内部 ---------- */
  applyToFoe(r, sk) {
    if (r.dodge) { UI.floatText('闪避', 'miss', 70, 26); return; }
    this.foe.hp -= r.dmg;
    UI.hitFoe(r.dmg, r.crit, r.counter);
    if (this.foe.hp <= 0) this.foe.hp = 0;
  },

  heroAct() {
    UI.heroLunge();
    UI.fx('剑影');
  },

  afterPlayer() {
    UI.updateBattle();
    if (this.foe.hp <= 0) { setTimeout(() => this.win(), 420); return; }
    // 敌人反击（延迟）
    setTimeout(() => { if (this.on) this.foeAct(); }, 620);
  },

  foeAct() {
    if (!this.on || !this._p) return;
    const p = this._p;
    const r = E.calcDamage(this.foe, p, 0.85, this.foe.w);
    if (r.dodge) { UI.floatText('闪避', 'miss', 30, 74); }
    else {
      p.hp -= r.dmg;
      UI.hitHero(r.dmg, r.crit);
      if (p.hp <= 0) p.hp = 0;
    }
    UI.bossLunge();
    UI.updateBattle();
    if (p.hp <= 0) setTimeout(() => this.lose(), 400);
  },

  /* ---------- 结束 ---------- */
  win() {
    if (!this.on) return;
    const p = this._p;
    const foe = this.foe;
    this.on = false;
    p.stats.battles = (p.stats.battles || 0) + 1;
    p.stats.kills = (p.stats.kills || 0) + 1;
    // 掉落
    const stone = Math.round(E.stonePerMin(p.realm) * (12 + Math.random() * 18));
    const exp = Math.round(EX.expPerMin(p.realm) * (18 + Math.random() * 25));
    p.stone += stone;
    const up = E.gainExp(p, exp);
    // 材料掉落
    const drops = [];
    const pool = (CFG.core.items || []).filter((x) => ['材料', '灵草', '丹药'].indexOf(x.type) >= 0);
    if (pool.length && Math.random() < 0.55) {
      const it = pool[Math.floor(Math.random() * pool.length)];
      E.addItem(p, it.name, 1);
      drops.push(it.name + '×1');
    }
    if (Math.random() < 0.12) { drops.push('妖丹×1'); E.addItem(p, '妖丹', 1); }
    UI.battleResult(true, { stone, exp, up, drops, name: foe.name });
    if (this._cb) { const cb = this._cb; this._cb = null; cb(true); }
    this.stop(true);
    setTimeout(() => UI.hideBattle(), 900);
  },

  lose() {
    if (!this.on) return;
    const p = this._p;
    this.on = false;
    p.stats.battles = (p.stats.battles || 0) + 1;
    p.stats.deaths = (p.stats.deaths || 0) + 1;
    p.hp = Math.round(E.maxHp(p) * 0.35);
    p.mp = Math.round(E.maxMp(p) * 0.5);
    UI.battleResult(false, { name: this.foe.name });
    if (this._cb) { const cb = this._cb; this._cb = null; cb(false); }
    this.stop(true);
    setTimeout(() => UI.hideBattle(), 900);
  },

  flee() {
    if (!this.on) return;
    UI.toast('成功脱离战斗', 'ok');
    this.stop(true);
    UI.hideBattle();
  },

  /* ---------- 自动战斗 ---------- */
  setAuto(v) {
    this.auto = v;
    if (this.autoT) { clearInterval(this.autoT); this.autoT = null; }
    if (v && this.on) {
      this.autoT = setInterval(() => {
        if (!this.on) { clearInterval(this.autoT); this.autoT = null; return; }
        if (this.foe && this.foe.hp <= 0) return;
        // 优先放可用技能，否则普攻
        for (let i = 0; i < 4; i++) {
          const id = this._p.equipped[i];
          if (!id) continue;
          const sk = EX.skills.find((x) => x.id === id);
          if (sk && this.cd[i] <= 0 && (this._p.mp || 0) >= sk.cost) { this.skill(i); return; }
        }
        this.attack();
      }, 900);
    }
    UI.updateAuto(v);
  },

  /* ---------- 冷却 tick ---------- */
  startCdTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (let i = 0; i < 4; i++) if (this.cd[i] > 0) this.cd[i] = Math.max(0, this.cd[i] - 0.1);
      UI.updateCd(this.cd);
    }, 100);
  },
  stopCdTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
};

window.BT = BT;
