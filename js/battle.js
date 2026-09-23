/* =========================================================
 * battle.js —— Canvas 战斗引擎（竖屏 2D 俯视角 割草塔防）
 * 还原《向僵尸开炮》：自动锁敌开火 / 波次尸潮 / 升级三选一 /
 *      能量主动技能 / 炮台建造 / 防线生命
 * ========================================================= */

const BT = {
  cv: null, ctx: null, W: 360, H: 640,
  run: null,          // 本局运行时状态
  P: null,            // 玩家存档引用
  on: false,
  raf: null, lastT: 0,
  paused: false,
  _cb: null,
  dpr: 1,

  /* ---------------- 初始化 ---------------- */
  attach(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    if (!this.cv) return;
    const box = this.cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cv.width = Math.round(box.width * dpr);
    this.cv.height = Math.round(box.height * dpr);
    this.cv.style.width = box.width + 'px';
    this.cv.style.height = box.height + 'px';
  },

  /* ---------------- 开一局 ---------------- */
  start(p, levelNo, opt) {
    opt = opt || {};
    this.P = p;
    this._cb = opt.cb || null;
    const endless = !!opt.endless;
    const def = E.levelDef(levelNo, endless);
    const a = E.attrs(p);

    this.run = {
      endless, def, levelNo,
      wave: 0, waveTotal: def.waves,
      spawnLeft: 0, spawnT: 0, spawnGap: 1,
      bossSpawned: false,
      // 玩家
      px: this.W / 2, py: this.H - 84,
      atk: a.atk, rate: a.rate, range: a.range, pierce: a.pierce, spread: a.spread,
      crit: a.crit, critDmg: a.critDmg, cdr: a.cdr,
      wallHp: a.wallHp, wallMax: a.wallHp,
      shootT: 0,
      // 局内成长
      lv: 1, xp: 0, xpNeed: 26,
      skills: {},            // id -> 等级
      actives: [],           // 已学主动技能（最多5）
      energy: 0, energyMax: 100,
      cds: {},               // id -> 剩余冷却
      gold: 0, kills: 0, time: 0,
      // 实体
      zombies: [], bullets: [], fx: [], drops: [], floats: [], summons: [], turrets: [],
      turretSlots: [
        { x: 62, y: 250, t: null }, { x: 180, y: 210, t: null }, { x: 298, y: 250, t: null },
      ],
      mods: this.emptyMods(),
      choosing: null,
      over: null,
    };
    // 火核/初始技能（枪械流开局送一个）
    this.grantSkill('lianfa');
    this.applyMods();
    this.on = true; this.paused = false;
    this.startWave(1);
    this.startLoop();
    return this.run;
  },

  emptyMods() {
    return {
      dmgMul: 0, rateMul: 0, rangeMul: 0, pierce: 0, spread: 0, extra: 0,
      split: 0, split4: 0, bounce: 0, explode: 0, er: 0,
      crit: 0, critDmg: 0, heal: 0, goldMul: 0, xpMul: 0, magnet: 0,
      wallHp: 0, dr: 0, exec: 0, slowTime: 0, burnTime: 0,
    };
  },

  /* ---------------- 波次 ---------------- */
  startWave(w) {
    const r = this.run, d = r.def;
    r.wave = w;
    r.spawnLeft = Math.round(d.countBase * (1 + (w - 1) * 0.22));
    r.spawnGap = Math.max(0.15, 0.9 - w * 0.05);
    r.spawnT = 0.6;
    if (d.isBoss && w === d.waves && !r.bossSpawned) { r.bossSpawned = true; this.spawnBoss(); }
  },

  spawnBoss() {
    const r = this.run, b = r.def.boss;
    if (!b) return;
    const hp = Math.round(b.hp * r.def.hpMul);
    r.zombies.push(this.mkZ(b, 1, hp));
    if (typeof UI !== 'undefined' && UI && UI.toast) UI.toast('⚠️ BOSS ' + b.n + ' 降临！', 'boss');
  },

  mkZ(d, mul, hpOverride) {
    const r = this.run;
    const hp = hpOverride !== undefined ? hpOverride : Math.round(d.hp * r.def.hpMul * (mul || 1));
    return {
      def: d, x: 30 + Math.random() * (this.W - 60), y: -30,
      hp, maxHp: hp, r: d.r, spd: d.spd * (0.9 + Math.random() * 0.2),
      dmg: Math.round(d.dmg * r.def.dmgMul),
      slow: 0, slowT: 0, burn: 0, burnT: 0, poison: 0,
      revive: d.revive ? 1 : 0, dead: false, hitT: 0,
      gold: Math.round(d.gold * Math.pow(E.GOLD_GROW, r.def.n - 1)), xp: Math.round(d.xp * 1.6),
      boss: !!d.boss, fly: !!d.fly, stealth: !!d.stealth, alpha: 1,
    };
  },

  /* ---------------- 主循环 ---------------- */
  startLoop() {
    this.stopLoop();
    this.lastT = performance.now();
    const step = (t) => {
      if (!this.on) return;
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      if (!this.paused) { this.tick(dt); }
      this.draw();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },
  stopLoop() { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; } },

  tick(dt) {
    const r = this.run; if (!r || r.over) return;
    r.time += dt;

    /* --- 生成 --- */
    if (r.spawnLeft > 0) {
      r.spawnT -= dt;
      if (r.spawnT <= 0) {
        r.spawnT = r.spawnGap;
        const id = r.def.pool[Math.floor(Math.random() * r.def.pool.length)];
        const d = EX.zombies.find((x) => x.id === id) || EX.zombies[0];
        r.zombies.push(this.mkZ(d, 1));
        r.spawnLeft--;
      }
    }

    /* --- 玩家射击 --- */
    const rate = r.rate * (1 + r.mods.rateMul);
    r.shootT -= dt;
    if (r.shootT <= 0 && r.zombies.length) {
      r.shootT = 1 / rate;
      this.shoot();
    }

    /* --- 僵尸 --- */
    const wallY = this.H - 40;
    for (const z of r.zombies) {
      if (z.dead) continue;
      // 减速/燃烧
      if (z.slowT > 0) { z.slowT -= dt; if (z.slowT <= 0) z.slow = 0; }
      if (z.burnT > 0) {
        z.burnT -= dt;
        const dps = z.burn * r.atk * (1 + r.mods.dmgMul);
        this.hurt(z, dps * dt, false, null);
        if (z.burnT <= 0) z.burn = 0;
      }
      if (z.hitT > 0) z.hitT -= dt;
      // 隐身闪烁
      z.alpha = z.stealth ? (0.35 + 0.45 * Math.abs(Math.sin(r.time * 2.2))) : 1;
      // 移动（向下冲防线）
      const sp = z.spd * (1 - z.slow);
      z.y += sp * dt;
      // 略微横向靠近玩家
      if (!z.boss) z.x += (r.px - z.x) * 0.12 * dt;
      // 撞防线
      if (z.y >= wallY - z.r) {
        z.y = wallY - z.r;
        const dmg = z.dmg * dt * (1 - Math.min(0.7, r.mods.dr));
        r.wallHp -= dmg;
        if (r.wallHp <= 0) { this.lose(); return; }
      }
      // 自爆
      if (z.def.boom && z.y > wallY - 120) {
        this.hurt(z, 1e9, false, null);
        r.wallHp -= z.dmg * 1.5;
        this.addFx({ t: 'boom', x: z.x, y: z.y, r: 70, life: 0.3, max: 0.3, c: '#ff7a3c' });
        if (r.wallHp <= 0) { this.lose(); return; }
      }
    }
    // 清理死亡
    r.zombies = r.zombies.filter((z) => !z.dead);

    /* --- 子弹 --- */
    for (const b of r.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > this.W + 20 || b.y < -20 || b.y > this.H + 20) { b.dead = true; continue; }
      for (const z of r.zombies) {
        if (z.dead || (b.hit && b.hit.indexOf(z) >= 0)) continue;
        const dx = z.x - b.x, dy = z.y - b.y;
        if (dx * dx + dy * dy <= (z.r + 6) * (z.r + 6)) {
          b.hit = b.hit || []; b.hit.push(z);
          this.hurt(z, b.dmg, Math.random() < r.crit, b);
          // 分裂
          if (b.split > 0) this.doSplit(b, z, b.split, 2);
          if (b.split4 > 0) this.doSplit(b, z, 4, 4);
          // 爆炸
          if (b.explode > 0) this.doExplode(b.x, b.y, b.er, b.dmg * b.explode, b.el);
          // 弹射
          if (b.bounce > 0) {
            const nx = this.nearest(z.x, z.y, z);
            if (nx) {
              const a2 = Math.atan2(nx.y - b.y, nx.x - b.x);
              const sp = Math.hypot(b.vx, b.vy);
              b.vx = Math.cos(a2) * sp; b.vy = Math.sin(a2) * sp;
              b.bounce--; b.life = 1.2;
            } else { b.dead = true; }
          } else if (b.pierce <= 0) { b.dead = true; }
          b.pierce--;
          if (b.pierce < 0) b.dead = true;
          break;
        }
      }
    }
    r.bullets = r.bullets.filter((b) => !b.dead);

    /* --- 召唤物 --- */
    for (const s of r.summons) {
      s.life -= dt;
      if (s.life <= 0) { s.dead = true; continue; }
      s.t -= dt;
      if (s.t <= 0) {
        s.t = s.gap;
        if (s.kind === 'car') {
          // 装甲车冲撞
          for (const z of r.zombies) {
            if (Math.abs(z.x - s.x) < 46 && Math.abs(z.y - s.y) < 46) this.hurt(z, s.dmg, false, null);
          }
        } else {
          const tg = this.nearest(s.x, s.y, null);
          if (tg) {
            const a2 = Math.atan2(tg.y - s.y, tg.x - s.x);
            r.bullets.push({
              x: s.x, y: s.y, vx: Math.cos(a2) * 420, vy: Math.sin(a2) * 420,
              dmg: s.dmg, pierce: 1, life: 1.4, r: 4, c: '#ffd76a', el: '物', hit: [],
            });
          }
        }
      }
      if (s.kind === 'car') { s.y -= 26 * dt; if (s.y < 120) s.y = 120; }
      if (s.kind === 'drone') { s.a += dt * 2.6; s.x = r.px + Math.cos(s.a) * 62; s.y = r.py - 44 + Math.sin(s.a) * 22; }
    }
    r.summons = r.summons.filter((s) => !s.dead);

    /* --- 炮台 --- */
    for (const t of r.turrets) {
      t.cd -= dt;
      if (t.cd <= 0) {
        const tg = this.nearest(t.x, t.y, null, t.range);
        if (tg) {
          t.cd = t.gap;
          const a2 = Math.atan2(tg.y - t.y, tg.x - t.x);
          r.bullets.push({
            x: t.x, y: t.y, vx: Math.cos(a2) * 460, vy: Math.sin(a2) * 460,
            dmg: t.dmg, pierce: t.kind === 'snipe' ? 2 : 0, life: 1.2, r: 4,
            c: t.color, el: t.el, hit: [],
          });
        }
      }
    }

    /* --- 特效 --- */
    for (const f of r.fx) {
      f.life -= dt;
      if (f.t === 'field' || f.t === 'vortex') {
        f.tick = (f.tick || 0) + dt;
        if (f.tick >= 0.25) {
          f.tick = 0;
          for (const z of r.zombies) {
            const d2 = (z.x - f.x) * (z.x - f.x) + (z.y - f.y) * (z.y - f.y);
            if (d2 <= f.r * f.r) {
              if (f.t === 'vortex' && f.pull) {
                const a2 = Math.atan2(f.y - z.y, f.x - z.x);
                z.x += Math.cos(a2) * 60 * dt * f.pull; z.y += Math.sin(a2) * 60 * dt * f.pull;
              }
              this.hurt(z, f.dps * 0.25, false, null);
              if (f.slow) { z.slow = Math.max(z.slow, f.slow); z.slowT = Math.max(z.slowT, f.time); }
            }
          }
        }
      }
    }
    r.fx = r.fx.filter((f) => f.life > 0);

    /* --- 掉落 & 吸附 --- */
    const mag = 78 + r.mods.magnet;
    for (const d of r.drops) {
      // 掉落物缓慢下坠（向玩家方向），避免遗留远处无法拾取
      d.y += 46 * dt;
      const dx = r.px - d.x, dy = r.py - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < mag) { d.x += dx / dist * 380 * dt; d.y += dy / dist * 380 * dt; }
      if (dist < 30) {
        d.dead = true;
        if (d.k === 'xp') this.gainXp(d.v);
        else r.gold += Math.round(d.v * (1 + r.mods.goldMul) * (E.attrs(this.P).goldMul || 1));
      } else d.life -= dt;
    }
    r.drops = r.drops.filter((d) => !d.dead && d.life > 0);

    /* --- 飘字 --- */
    for (const f of r.floats) { f.life -= dt; f.y -= 34 * dt; }
    r.floats = r.floats.filter((f) => f.life > 0);
    if (r.floats.length > 40) r.floats.splice(0, r.floats.length - 40);

    /* --- 能量 --- */
    r.energy = Math.min(r.energyMax, r.energy + 7.5 * dt * (1 + (E.attrs(this.P).cdr || 0)));
    for (const k in r.cds) if (r.cds[k] > 0) r.cds[k] = Math.max(0, r.cds[k] - dt);

    /* --- 波次推进 --- */
    if (r.spawnLeft === 0 && r.zombies.length === 0) {
      if (r.wave >= r.waveTotal) { this.win(); return; }
      this.startWave(r.wave + 1);
      if (typeof UI !== 'undefined' && UI && UI.toast) UI.toast('第 ' + (r.wave) + ' 波来袭', 'ok');
    }
  },

  /* ---------------- 射击 ---------------- */
  shoot() {
    const r = this.run;
    const tg = this.nearest(r.px, r.py, null, r.range * (1 + r.mods.rangeMul));
    if (!tg) return;
    const base = Math.atan2(tg.y - r.py, tg.x - r.px);
    const n = Math.max(1, Math.round(r.spread + r.mods.spread));
    // 连发：一次齐射多发（不用 setTimeout，保证首帧即有输出）
    const shots = 1 + Math.round(r.mods.extra);
    const dmg = r.atk * (1 + r.mods.dmgMul);
    for (let s = 0; s < shots; s++) {
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.14;
        const jitter = (Math.random() - 0.5) * 0.05;
        const a2 = base + off + jitter;
        r.bullets.push({
          x: r.px + s * 3 - (shots - 1) * 1.5, y: r.py - 10,
          vx: Math.cos(a2) * 560, vy: Math.sin(a2) * 560,
          dmg, pierce: r.pierce + r.mods.pierce, life: 1.3,
          r: 4, c: '#ffd76a', el: '物', hit: [],
          split: Math.floor(r.mods.split), split4: Math.floor(r.mods.split4),
          bounce: Math.floor(r.mods.bounce),
          explode: r.mods.explode, er: r.mods.er || 46,
        });
      }
    }
  },

  doSplit(b, z, n, dirs) {
    const sp = 380;
    for (let i = 0; i < dirs; i++) {
      const a2 = dirs === 2 ? (i === 0 ? -0.5 : 0.5) : (i * Math.PI / 2);
      const ba = Math.atan2(b.vy, b.vx) + a2;
      this.run.bullets.push({
        x: z.x, y: z.y, vx: Math.cos(ba) * sp, vy: Math.sin(ba) * sp,
        dmg: b.dmg * 0.55, pierce: 1, life: 0.7, r: 3, c: b.c, el: b.el, hit: [],
      });
    }
  },

  doExplode(x, y, r, dmg, el) {
    this.addFx({ t: 'boom', x, y, r, life: 0.28, max: 0.28, c: el === '火' ? '#ff7a3c' : '#ffd76a' });
    for (const z of this.run.zombies) {
      const d2 = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
      if (d2 <= r * r) this.hurt(z, dmg, false, null);
    }
  },

  nearest(x, y, exclude, maxR) {
    let best = null, bd = maxR ? maxR * maxR : 1e9;
    for (const z of this.run.zombies) {
      if (z.dead || z === exclude) continue;
      const d2 = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
      if (d2 < bd) { bd = d2; best = z; }
    }
    return best;
  },

  /* ---------------- 伤害 ---------------- */
  hurt(z, dmg, crit, src) {
    if (z.dead) return;
    const r = this.run;
    let d = dmg;
    const el = src ? src.el : null;
    // 元素抗性
    if (z.def.res && el === z.def.res) d *= 0.45;
    if (z.def.def) d *= (1 - z.def.def);
    if (crit) d *= (1 + r.critDmg + r.mods.critDmg);
    // 秒杀
    if (!z.boss && Math.random() < r.mods.exec) d = z.hp + 1;
    z.hp -= d;
    z.hitT = 0.12;
    this.addFloat(z.x, z.y - z.r, Math.round(d), crit ? 'crit' : 'norm');
    if (z.hp <= 0) this.kill(z);
  },

  kill(z) {
    if (z.dead) return;
    const r = this.run;
    if (z.revive > 0 && !z.boss) {
      z.revive--; z.hp = z.maxHp * 0.5; z.y -= 40;
      this.addFloat(z.x, z.y, '复活', 'heal');
      return;
    }
    z.dead = true;
    r.kills++;
    if (z.boss) this.P.stats.boss = (this.P.stats.boss || 0) + 1;
    // 掉落
    r.drops.push({ k: 'xp', x: z.x, y: z.y, v: z.xp * (1 + r.mods.xpMul), life: 14 });
    if (Math.random() < 0.62) r.drops.push({ k: 'gold', x: z.x + 8, y: z.y, v: z.gold, life: 14 });
    // 杀怪回血
    if (r.mods.heal) r.wallHp = Math.min(r.wallMax, r.wallHp + r.mods.heal);
    this.addFx({ t: 'die', x: z.x, y: z.y, r: z.r + 8, life: 0.22, max: 0.22, c: '#ff6b6b' });
  },

  addFloat(x, y, v, cls) {
    this.run.floats.push({ x, y, v: '' + v, cls, life: 0.75, max: 0.75 });
  },
  addFx(f) { this.run.fx.push(f); },

  /* ---------------- 升级 & 技能 ---------------- */
  grantSkill(id) {
    const r = this.run;
    r.skills[id] = (r.skills[id] || 0) + 1;
    const s = EX.skills.find((x) => x.id === id);
    if (s && s.kind === 'active' && r.actives.indexOf(id) < 0 && r.actives.length < 5) r.actives.push(id);
  },

  gainXp(v) {
    const r = this.run;
    r.xp += v;
    while (r.xp >= r.xpNeed) {
      r.xp -= r.xpNeed;
      r.lv++;
      r.xpNeed = Math.round(26 * Math.pow(1.28, r.lv - 1));
      this.offerSkills();
    }
  },

  offerSkills() {
    const r = this.run;
    const pool = EX.skills.filter((s) => (r.skills[s.id] || 0) < 10);
    const picks = [];
    const bag = pool.slice();
    while (picks.length < 3 && bag.length) {
      const i = Math.floor(Math.random() * bag.length);
      picks.push(bag.splice(i, 1)[0]);
    }
    if (!picks.length) return;
    r.choosing = picks;
    this.paused = true;
    if (typeof UI !== 'undefined' && UI && UI.showSkillChoice) UI.showSkillChoice(picks);
  },

  pickSkill(id) {
    const r = this.run;
    r.choosing = null;
    const s = EX.skills.find((x) => x.id === id);
    if (!s) return this.resume();
    r.skills[id] = (r.skills[id] || 0) + 1;
    if (s.kind === 'active' && r.actives.indexOf(id) < 0 && r.actives.length < 5) r.actives.push(id);
    this.applyMods();
    if (typeof UI !== 'undefined' && UI && UI.toast) UI.toast('学会【' + s.n + '】Lv.' + r.skills[id], 'ok');
    this.resume();
  },
  refreshOffer() {
    const r = this.run;
    this.offerSkills();
  },

  applyMods() {
    const r = this.run;
    r.mods = this.emptyMods();
    for (const id in r.skills) {
      const s = EX.skills.find((x) => x.id === id);
      if (!s || !s.p0) continue;
      const L = r.skills[id];
      for (const k in s.p0) {
        const v = s.p0[k] + (s.pg && s.pg[k] ? s.pg[k] : 0) * (L - 1);
        r.mods[k] = (r.mods[k] || 0) + v;
      }
    }
    // 防线加成即时生效
    const base = E.attrs(this.P).wallHp;
    r.wallMax = base + r.mods.wallHp;
    r.wallHp = Math.min(r.wallMax, r.wallHp + (r.wallMax - base));
  },
  resume() { this.paused = false; },

  skillParam(id) {
    const r = this.run;
    const s = EX.skills.find((x) => x.id === id);
    const L = r.skills[id] || 1;
    const p = {};
    for (const k in s.p0) p[k] = s.p0[k] + (s.pg && s.pg[k] ? s.pg[k] : 0) * (L - 1);
    return p;
  },

  /* ---------------- 释放主动技能 ---------------- */
  cast(id) {
    const r = this.run; if (!r || r.over) return;
    const s = EX.skills.find((x) => x.id === id);
    if (!s || s.kind !== 'active') return;
    const L = r.skills[id] || 0;
    if (!L) return;
    if (r.cds[id] > 0) { if (typeof UI !== 'undefined' && UI && UI.toast) UI.toast('冷却中', 'err'); return; }
    const cost = s.cost;
    if (r.energy < cost) { if (typeof UI !== 'undefined' && UI && UI.toast) UI.toast('能量不足', 'err'); return; }
    r.energy -= cost;
    r.cds[id] = s.cd * (1 - Math.min(0.6, r.cdr));
    const p = this.skillParam(id);
    const dmgBase = r.atk * (1 + r.mods.dmgMul);

    switch (s.fx) {
      case 'explode': {
        // 打向最密集处
        let tx = r.px, ty = 200, bestN = -1;
        for (const z of r.zombies) {
          let n = 0;
          for (const o of r.zombies) if (Math.hypot(o.x - z.x, o.y - z.y) < p.r) n++;
          if (n > bestN) { bestN = n; tx = z.x; ty = z.y; }
        }
        if (!r.zombies.length) { tx = r.px; ty = 220; }
        this.addFx({ t: 'boom', x: tx, y: ty, r: p.r, life: 0.35, max: 0.35, c: '#ff7a3c' });
        for (const z of r.zombies) {
          if (Math.hypot(z.x - tx, z.y - ty) <= p.r) {
            this.hurt(z, dmgBase * p.dmg, Math.random() < r.crit, null);
            z.burn = p.burn; z.burnT = 3.2;
          }
        }
        this.addFx({ t: 'field', x: tx, y: ty, r: p.r, dps: dmgBase * p.burn, life: 3.2, max: 3.2, c: '#ff7a3c' });
        break;
      }
      case 'freeze': {
        let tx = r.px, ty = 220;
        const tg = this.nearest(r.px, r.py);
        if (tg) { tx = tg.x; ty = tg.y; }
        this.addFx({ t: 'boom', x: tx, y: ty, r: p.r, life: 0.4, max: 0.4, c: '#5cd8ff' });
        for (const z of r.zombies) {
          if (Math.hypot(z.x - tx, z.y - ty) <= p.r) {
            this.hurt(z, dmgBase * p.dmg, false, null);
            if (!z.def.immune) { z.slow = Math.max(z.slow, p.slow); z.slowT = p.time; }
          }
        }
        break;
      }
      case 'chain': {
        let cur = this.nearest(r.px, r.py);
        let hit = 0, px = r.px, py = r.py;
        const chain = Math.round(p.chain);
        const used = [];
        while (cur && hit < chain) {
          used.push(cur);
          this.addFx({ t: 'bolt', x1: px, y1: py, x2: cur.x, y2: cur.y, life: 0.22, max: 0.22, c: '#c08cff' });
          const dmg = dmgBase * p.dmg * (1 + hit * 0.18) + cur.maxHp * p.pct;
          this.hurt(cur, dmg, false, null);
          px = cur.x; py = cur.y; hit++;
          cur = this.nearest(px, py, cur, 200);
        }
        break;
      }
      case 'laser': {
        const tg = this.nearest(r.px, r.py);
        const a2 = tg ? Math.atan2(tg.y - r.py, tg.x - r.px) : -Math.PI / 2;
        this.addFx({ t: 'laser', x: r.px, y: r.py, a: a2, len: 700, w: p.w, life: p.time, max: p.time, c: '#c08cff' });
        const tickDmg = dmgBase * p.dmg / Math.max(0.2, p.time);
        for (const z of r.zombies) {
          // 点到直线距离
          const dx = z.x - r.px, dy = z.y - r.py;
          const proj = dx * Math.cos(a2) + dy * Math.sin(a2);
          if (proj < 0) continue;
          const perp = Math.abs(dx * -Math.sin(a2) + dy * Math.cos(a2));
          if (perp <= p.w + z.r) this.hurt(z, tickDmg, false, null);
        }
        // 持续伤害
        const fxObj = { t: 'beam', x: r.px, y: r.py, a: a2, w: p.w, dps: tickDmg, life: p.time, max: p.time, c: '#c08cff' };
        fxObj.tick = 0;
        this.addFx(fxObj);
        break;
      }
      case 'vortex': {
        this.addFx({ t: 'vortex', x: r.px, y: 250, r: p.r, dps: dmgBase * p.dmg, pull: p.pull, life: 4, max: 4, c: '#7be8a0' });
        break;
      }
      case 'wave': {
        this.addFx({ t: 'boom', x: r.px, y: r.py - 60, r: p.w, life: 0.3, max: 0.3, c: '#7be8a0' });
        for (const z of r.zombies) {
          if (z.y < r.py && Math.abs(z.x - r.px) < p.w) this.hurt(z, dmgBase * p.dmg, false, null);
        }
        break;
      }
      case 'summon': {
        if (id === 'zhuangjia') {
          r.summons.push({ kind: 'car', x: r.px, y: r.py - 40, dmg: dmgBase * p.dmg, gap: 0.35, t: 0, life: p.time, hp: p.hp });
        } else if (id === 'wurenji') {
          for (let i = 0; i < Math.round(p.n); i++) {
            r.summons.push({ kind: 'drone', x: r.px, y: r.py - 44, a: i * 2.1, dmg: dmgBase * p.dmg, gap: 0.5, t: 0, life: p.time });
          }
        } else {
          r.summons.push({ kind: 'plane', x: r.px, y: 60, dmg: dmgBase * p.dmg, gap: 0.22, t: 0, life: p.time });
        }
        break;
      }
    }
  },

  /* ---------------- 炮台 ---------------- */
  TURRET_TYPES: [
    { k: 'ice', n: '寒冰炮台', icon: '❄️', cost: 120, dmg: 14, gap: 1.1, range: 150, color: '#5cd8ff', el: '冰' },
    { k: 'fire', n: '火焰炮台', icon: '🔥', cost: 150, dmg: 22, gap: 1.4, range: 140, color: '#ff7a3c', el: '火' },
    { k: 'elec', n: '电磁炮台', icon: '⚡', cost: 200, dmg: 30, gap: 1.6, range: 165, color: '#c08cff', el: '电' },
    { k: 'snipe', n: '狙击炮台', icon: '🎯', cost: 260, dmg: 58, gap: 2.2, range: 240, color: '#ffd76a', el: '物' },
  ],
  buildTurret(slotIdx, typeIdx) {
    const r = this.run;
    const slot = r.turretSlots[slotIdx];
    if (!slot || slot.t) return { ok: false, msg: '该位置已有炮台' };
    const t = this.TURRET_TYPES[typeIdx];
    if (r.gold < t.cost) return { ok: false, msg: '金币不足' };
    r.gold -= t.cost;
    slot.t = { ...t, cd: 0 };
    r.turrets.push({ x: slot.x, y: slot.y, ...t, cd: 0 });
    return { ok: true, msg: '建造【' + t.n + '】' };
  },

  /* ---------------- 结束 ---------------- */
  win() {
    const r = this.run; if (r.over) return;
    r.over = 'win';
    this.on = false; this.stopLoop();
    const P = this.P;
    P.stats.wins = (P.stats.wins || 0) + 1;
    P.stats.kills = (P.stats.kills || 0) + r.kills;
    P.stats.runs = (P.stats.runs || 0) + 1;
    P.stats.time = (P.stats.time || 0) + Math.round(r.time);
    const rw = E.clearReward(r.levelNo, true);
    P.gold += rw.gold; P.diamond += rw.diamond;
    E.addExp(P, rw.exp);
    if (!r.endless && r.levelNo >= P.maxLevel) { P.maxLevel = r.levelNo + 1; P.level = P.maxLevel; }
    if (r.endless && r.levelNo > (P.endlessBest || 0)) P.endlessBest = r.levelNo;
    if (this._cb) this._cb('win', { rw, kills: r.kills, time: r.time, gold: r.gold });
  },
  lose() {
    const r = this.run; if (r.over) return;
    r.over = 'lose';
    r.wallHp = 0;
    this.on = false; this.stopLoop();
    const P = this.P;
    P.stats.runs = (P.stats.runs || 0) + 1;
    P.stats.kills = (P.stats.kills || 0) + r.kills;
    const rw = E.clearReward(r.levelNo, false);
    P.gold += rw.gold; E.addExp(P, rw.exp);
    if (r.endless && r.levelNo - 1 > (P.endlessBest || 0)) P.endlessBest = Math.max(0, r.levelNo - 1);
    if (this._cb) this._cb('lose', { rw, kills: r.kills, time: r.time, gold: r.gold });
  },
  quit() {
    const r = this.run; if (!r || r.over) return;
    r.over = 'quit';
    this.on = false; this.stopLoop();
    const P = this.P;
    P.stats.runs = (P.stats.runs || 0) + 1;
    P.stats.kills = (P.stats.kills || 0) + r.kills;
    const rw = E.clearReward(r.levelNo, false);
    P.gold += rw.gold;
    if (this._cb) this._cb('quit', { rw, kills: r.kills, time: r.time, gold: r.gold });
  },

  /* ---------------- 绘制 ---------------- */
  draw() {
    const c = this.ctx, r = this.run;
    if (!c) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const kw = this.cv.width / this.dpr / this.W, kh = this.cv.height / this.dpr / this.H;
    c.scale(kw, kh);

    /* 背景：末日废墟 */
    const g = c.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#1a2637'); g.addColorStop(0.55, '#222f42'); g.addColorStop(1, '#2c1c0c');
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
    // 地面网格（透视感）
    c.strokeStyle = 'rgba(120,150,190,0.10)'; c.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = (this.H) * (i / 8);
      c.beginPath(); c.moveTo(0, y); c.lineTo(this.W, y); c.stroke();
    }
    for (let i = -4; i <= 4; i++) {
      c.beginPath(); c.moveTo(this.W / 2 + i * 16, 0); c.lineTo(this.W / 2 + i * 60, this.H); c.stroke();
    }
    // 废墟剪影
    c.fillStyle = 'rgba(10,16,28,0.55)';
    [[20, 110, 34, 60], [300, 120, 40, 52], [70, 150, 26, 40], [260, 158, 30, 36]].forEach((b) => {
      c.fillRect(b[0], b[1], b[2], b[3]);
    });
    if (!r) return;

    /* 炮台 */
    r.turretSlots.forEach((s, i) => {
      if (s.t) {
        c.fillStyle = 'rgba(30,42,60,0.9)';
        c.beginPath(); c.arc(s.x, s.y, 17, 0, 7); c.fill();
        c.strokeStyle = s.t.color; c.lineWidth = 2; c.stroke();
        c.font = '16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(s.t.icon, s.x, s.y + 1);
      } else {
        c.strokeStyle = 'rgba(150,180,220,0.28)'; c.lineWidth = 1.5;
        c.setLineDash([4, 4]);
        c.beginPath(); c.arc(s.x, s.y, 15, 0, 7); c.stroke();
        c.setLineDash([]);
      }
    });

    /* 特效（地面层） */
    for (const f of r.fx) {
      const a = Math.max(0, f.life / f.max);
      if (f.t === 'field') {
        c.fillStyle = 'rgba(255,122,60,' + (0.22 * a) + ')';
        c.beginPath(); c.arc(f.x, f.y, f.r, 0, 7); c.fill();
      } else if (f.t === 'vortex') {
        c.save(); c.translate(f.x, f.y); c.rotate((1 - a) * 12);
        c.strokeStyle = 'rgba(123,232,160,' + (0.6 * a) + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, f.r * (0.4 + 0.6 * a), 0, 5.2); c.stroke();
        c.restore();
      } else if (f.t === 'laser' || f.t === 'beam') {
        c.save(); c.translate(f.x, f.y); c.rotate(f.a);
        const grd = c.createLinearGradient(0, 0, f.len, 0);
        grd.addColorStop(0, 'rgba(192,140,255,' + (0.9 * a) + ')');
        grd.addColorStop(1, 'rgba(192,140,255,0)');
        c.fillStyle = grd; c.fillRect(0, -f.w, f.len, f.w * 2);
        c.restore();
      }
    }

    /* 掉落 */
    for (const d of r.drops) {
      if (d.k === 'xp') {
        c.fillStyle = '#5ce88a';
        c.beginPath(); c.arc(d.x, d.y, 4, 0, 7); c.fill();
        c.strokeStyle = 'rgba(92,232,138,0.4)'; c.lineWidth = 1;
        c.beginPath(); c.arc(d.x, d.y, 7, 0, 7); c.stroke();
      } else {
        c.fillStyle = '#ffd76a';
        c.beginPath(); c.arc(d.x, d.y, 4.5, 0, 7); c.fill();
        c.fillStyle = '#8a6a10'; c.font = '7px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('¤', d.x, d.y + 0.5);
      }
    }

    /* 僵尸 */
    for (const z of r.zombies) {
      c.save();
      c.globalAlpha = z.alpha;
      if (z.hitT > 0) { c.translate(2, 0); }
      // 影子
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(z.x, z.y + z.r * 0.85, z.r * 0.8, z.r * 0.3, 0, 0, 7); c.fill();
      c.font = (z.boss ? 40 : (z.def.elite ? 30 : 24)) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(z.def.icon, z.x, z.y);
      // 血条
      if (z.hp < z.maxHp) {
        const w = z.boss ? 90 : 30, h = z.boss ? 6 : 3.5;
        const bx = z.x - w / 2, by = z.y - z.r - (z.boss ? 12 : 8);
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(bx, by, w, h);
        c.fillStyle = z.boss ? '#ff4d6d' : '#ff7a3c';
        c.fillRect(bx, by, w * Math.max(0, z.hp / z.maxHp), h);
      }
      // 状态
      if (z.slowT > 0) { c.fillStyle = 'rgba(92,216,255,0.75)'; c.fillRect(z.x - z.r, z.y - z.r - 4, z.r * 2, 2); }
      if (z.burnT > 0) { c.fillStyle = 'rgba(255,122,60,0.8)'; c.fillRect(z.x - z.r, z.y - z.r - 2, z.r * 2, 2); }
      c.restore();
    }

    /* 子弹 */
    for (const b of r.bullets) {
      c.fillStyle = b.c;
      c.shadowColor = b.c; c.shadowBlur = 6;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
      c.shadowBlur = 0;
    }

    /* 召唤物 */
    for (const s of r.summons) {
      c.font = '26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(s.kind === 'car' ? '🚙' : s.kind === 'drone' ? '🛸' : '✈️', s.x, s.y);
    }

    /* 玩家 */
    c.save();
    // 光环
    const t = performance.now() / 1000;
    c.strokeStyle = 'rgba(255,215,106,0.35)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(r.px, r.py + 14, 22 + Math.sin(t * 3) * 2, 8, 0, 0, 7); c.stroke();
    c.font = '32px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(this.P.avatar || '👨‍🚀', r.px, r.py);
    // 炮管指向
    const tg = this.nearest(r.px, r.py);
    const ang = tg ? Math.atan2(tg.y - r.py, tg.x - r.px) : -Math.PI / 2;
    c.save(); c.translate(r.px, r.py); c.rotate(ang);
    c.fillStyle = '#ffd76a'; c.fillRect(0, -3, 20, 6);
    c.restore();
    c.restore();

    /* 特效（上层） */
    for (const f of r.fx) {
      const a = Math.max(0, f.life / f.max);
      if (f.t === 'boom') {
        c.fillStyle = 'rgba(255,150,80,' + (0.5 * a) + ')';
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.1 - a * 0.5), 0, 7); c.fill();
        c.strokeStyle = 'rgba(255,215,106,' + a + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.2 - a * 0.5), 0, 7); c.stroke();
      } else if (f.t === 'bolt') {
        c.strokeStyle = f.c; c.lineWidth = 3; c.globalAlpha = a;
        c.beginPath(); c.moveTo(f.x1, f.y1);
        const mx = (f.x1 + f.x2) / 2 + (Math.random() - 0.5) * 26;
        const my = (f.y1 + f.y2) / 2 + (Math.random() - 0.5) * 26;
        c.lineTo(mx, my); c.lineTo(f.x2, f.y2); c.stroke();
        c.globalAlpha = 1;
      } else if (f.t === 'die') {
        c.strokeStyle = 'rgba(255,107,107,' + a + ')'; c.lineWidth = 2;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.4 - a), 0, 7); c.stroke();
      }
    }

    /* 飘字 */
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const f of r.floats) {
      const a = Math.max(0, f.life / f.max);
      c.globalAlpha = a;
      if (f.cls === 'crit') { c.font = 'bold 17px sans-serif'; c.fillStyle = '#ff4d6d'; }
      else if (f.cls === 'heal') { c.font = '13px sans-serif'; c.fillStyle = '#5ce88a'; }
      else { c.font = '13px sans-serif'; c.fillStyle = '#ffffff'; }
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3;
      c.strokeText(f.v, f.x, f.y); c.fillText(f.v, f.x, f.y);
      c.globalAlpha = 1;
    }

    /* 防线（底部城墙） */
    const wallY = this.H - 40;
    c.fillStyle = 'rgba(60,44,26,0.9)';
    c.fillRect(0, wallY, this.W, 40);
    c.fillStyle = 'rgba(116,92,60,0.9)';
    for (let i = 0; i < 9; i++) c.fillRect(i * 42 + 2, wallY + 4, 38, 16);
    // 防线血条
    const wp = Math.max(0, r.wallHp / r.wallMax);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(8, wallY - 12, this.W - 16, 8);
    c.fillStyle = wp > 0.5 ? '#5fd07a' : wp > 0.25 ? '#ffa030' : '#ff4d6d';
    c.fillRect(8, wallY - 12, (this.W - 16) * wp, 8);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
    c.strokeRect(8, wallY - 12, this.W - 16, 8);
    c.fillStyle = '#fff'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
    c.fillText('防线 ' + Math.ceil(r.wallHp) + ' / ' + Math.ceil(r.wallMax), this.W / 2, wallY - 16);
  },

  /* ---------------- 输入 ---------------- */
  moveTo(x) {
    const r = this.run; if (!r) return;
    const box = this.cv.getBoundingClientRect();
    const lx = (x - box.left) / box.width * this.W;
    r.px = Math.max(24, Math.min(this.W - 24, lx));
  },
};

window.BT = BT;
