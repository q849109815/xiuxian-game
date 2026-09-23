/* =========================================================
 * battle.js —— 战斗引擎（俯视角 · 摇杆移动 · 自动射击 · 换弹）
 * 依据资料：
 *   - GD-008 战斗系统（俯视角弹幕、自动瞄准、碰撞判定、穿透击退爆炸）
 *   - 06 操作方案（左侧虚拟摇杆 / WASD，自动瞄准自动开火，R 换弹）
 *   - 09 怪物技能机制表（12 种怪物 AI + BOSS 阶段）
 *   - 10 局内技能表（12 项，含互斥规则）
 * ========================================================= */

const BT = {
  cv: null, ctx: null, W: 360, H: 640,
  P: null, run: null, on: false, paused: false, raf: null, last: 0,
  scene: 'city', _imgs: {}, _heroImg: undefined,

  SCENES: {
    city: 'assets/scene/city.jpg', factory: 'assets/scene/factory.jpg',
    wasteland: 'assets/scene/wasteland.jpg', tunnel: 'assets/scene/tunnel.jpg',
    field: 'assets/scene/field.jpg', snow: 'assets/scene/snow.jpg',
  },

  /* ---------------- 场景 ---------------- */
  sceneFor(ch) { return ['city', 'factory', 'wasteland', 'tunnel', 'field', 'snow'][(ch - 1) % 6]; },
  img(key) {
    if (this._imgs[key] !== undefined) return this._imgs[key];
    const url = this.SCENES[key]; if (!url) { this._imgs[key] = null; return null; }
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { this._imgs[key] = im; }; im.onerror = () => { this._imgs[key] = null; };
    im.src = url; this._imgs[key] = null; return null;
  },

  /* ---------------- 初始化 ---------------- */
  attach(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    if (!this.cv) return;
    const b = this.cv.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    this.W = Math.max(320, b.width || 360); this.H = Math.max(480, b.height || 640);
    this.cv.width = this.W * d; this.cv.height = this.H * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  },

  /* ---------------- 关卡定义（按章节生成） ---------------- */
  /* 关卡定义：资料关卡表（3 章 10 关）；levelId = '1-1' 或 'endless' */
  levelDef(levelId) {
    if (levelId === 'endless') {
      return { id: 'endless', ch: 0, n: '无尽模式', waves: 9999,
        pool: EX.zombies.map((z) => z.id), per: [8, 20], mul: 1.0,
        cond: 'endless', boss: null, scene: 'city', endless: true };
    }
    const d = EX.levels.find((x) => x.id === levelId) || EX.levels[0];
    return {
      id: d.id, ch: d.ch, n: d.id + ' ' + d.n, waves: d.waves,
      pool: d.pool, per: d.per, mul: d.mul, cond: d.cond,
      boss: d.boss || null, scene: d.scene, endless: false, rw: d.rw,
    };
  },

  /* ---------------- 开局 ---------------- */
  start(p, levelNo, opt = {}) {
    const def = this.levelDef(levelNo);
    const a = E.attrs(p);
    this.P = p; this._heroImg = undefined;
    this.scene = this.sceneFor(def.ch); this.img(this.scene);

    const maxHp = a.hp;
    this.run = {
      def, endless: !!opt.endless, ch: def.ch,
      px: this.W / 2, py: this.H * 0.62,
      hp: maxHp, maxHp, shield: a.shield, maxShield: a.shield,
      atk: a.atk, rate: a.rate, range: a.range, pierce: a.pierce, spread: a.spread,
      pellets: a.pellets || 1, crit: a.crit, critDmg: a.critDmg, moveSpd: a.moveSpd,
      mag: a.mag, magMax: a.mag, reloadT: 0, reloading: false,
      shootT: 0,
      wave: 0, waveTotal: def.waves, spawnLeft: 0, spawnT: 0, waveGap: 0,
      def: def, cond: def.cond, mul: def.mul,
      zombies: [], bullets: [], pools: [], efx: [], floats: [], drops: [],
      skills: {}, mods: this.emptyMods(),
      lv: 1, xp: 0, xpNeed: 18,
      gold: 0, kills: 0, time: 0, over: false,
      reviveLeft: a.revive, novaT: 0, auraT: 0,
      poison: 0, poisonT: 0, hitFlash: 0,
      boss: null, bossPhase: 0, warned: false,
    };
    this.on = true; this.paused = false;
    this.startWave(1);
    this.startLoop();
    if (opt.cb) this.cb = opt.cb;
  },

  emptyMods() {
    return { dmgMul: 0, rateMul: 0, spread: 0, pierce: 0, crit: 0, critDmg: 0,
      healOnKill: 0, chain: 0, chainN: 0, auraR: 0, auraDps: 0, knock: 0,
      novaR: 0, novaSlow: 0, novaCd: 0, explode: 0, er: 0, shield: 0, moveMul: 0 };
  },

  startWave(w) {
    const r = this.run, d = r.def;
    r.wave = w;
    /* BOSS 关：最后一波出 BOSS（资料通关条件：击杀BOSS） */
    const isBossWave = (d.cond === 'boss' || d.cond === 'bossAll') && w === d.waves;
    if (isBossWave) {
      if (Array.isArray(d.boss)) d.boss.forEach((b) => this.spawnBoss(b));
      else this.spawnBoss(d.boss);
    }
    /* 每波数量：资料 per[min,max]，随波次递增 */
    const [mn, mx] = d.per || [10, 15];
    const t = d.waves > 1 ? (w - 1) / (d.waves - 1) : 1;
    const base = Math.round(mn + (mx - mn) * t);
    r.spawnLeft = Math.min(60, isBossWave ? Math.round(base * 0.7) : base);
    r.spawnT = 0; r.spawnGap = Math.max(0.18, 0.60 - w * 0.05);
  },

  spawnBoss(id) {
    const d = EX.bosses.find((x) => x.id === id) || EX.bosses[0];
    const r = this.run;
    const mul = (r.mul || 1) * (r.endless ? 1 + (r.wave - 1) * 0.35 : 1);
    const z = this.mkZ(d, mul, Math.round(d.hp * mul));
    z.isBoss = true; z.bossDef = d; z.phase = 0; z.maxHp = z.hp;
    r.boss = z; r.zombies.push(z);
  },

  mkZ(d, mul, hpOverride) {
    const hp = hpOverride != null ? hpOverride : Math.round(d.hp * mul);
    return {
      d, id: d.id, n: d.n, icon: d.icon,
      x: 0, y: 0, hp, maxHp: hp, spd: d.spd, dmg: d.dmg, atkR: d.atkR,
      ai: d.ai, def: d.def || 0, front: d.front || 0, fly: !!d.fly,
      slow: 0, slowT: 0, burn: 0, burnT: 0, atkCd: 0, dashT: 0, facing: 0,
      dead: false, boss: false, xp: d.xp || 4, gold: d.gold || 3,
    };
  },

  randEdge(z) {
    const m = 30;
    const s = Math.floor(Math.random() * 4);
    if (s === 0) { z.x = Math.random() * this.W; z.y = -m; }
    else if (s === 1) { z.x = this.W + m; z.y = Math.random() * this.H; }
    else if (s === 2) { z.x = Math.random() * this.W; z.y = this.H + m; }
    else { z.x = -m; z.y = Math.random() * this.H; }
  },

  startLoop() {
    this.last = performance.now();
    const loop = (t) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
      if (!this.paused) this.tick(dt);
      this.draw();
    };
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  },
  stopLoop() { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; } },

  /* =================================================
   * 主循环
   * ================================================ */
  tick(dt) {
    const r = this.run; if (!r || r.over) return;
    r.time += dt;
    if (r.hitFlash > 0) r.hitFlash -= dt;

    /* --- 玩家移动（摇杆） --- */
    const joy = BT.joy || { x: 0, y: 0 };
    const spd = r.moveSpd * (1 + r.mods.moveMul);
    let mx = joy.x, my = joy.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.08) {
      r.px += mx * spd * dt; r.py += my * spd * dt;
      r.px = Math.max(16, Math.min(this.W - 16, r.px));
      r.py = Math.max(40, Math.min(this.H - 40, r.py));
    }

    /* --- 换弹 --- */
    if (r.reloading) {
      r.reloadT -= dt;
      if (r.reloadT <= 0) { r.reloading = false; r.mag = r.magMax; }
    }

    /* --- 自动瞄准射击 --- */
    r.shootT -= dt;
    if (!r.reloading && r.mag > 0 && r.shootT <= 0) {
      const tg = this.nearest(r.px, r.py, null, r.range);
      if (tg) { r.shootT = 1 / (r.rate * (1 + r.mods.rateMul)); this.shoot(tg); }
    }
    if (!r.reloading && r.mag <= 0) this.reload();

    /* --- 生成 --- */
    if (r.spawnLeft > 0) {
      r.spawnT -= dt;
      if (r.spawnT <= 0) {
        r.spawnT = r.spawnGap;
        const id = r.def.pool[Math.floor(Math.random() * r.def.pool.length)];
        const d = EX.zombies.find((x) => x.id === id) || EX.zombies[0];
        const mul = (r.mul || 1) * (r.endless ? 1 + (r.wave - 1) * 0.35 : 1);
        const z = this.mkZ(d, mul); this.randEdge(z);
        r.zombies.push(z); r.spawnLeft--;
      }
    }

    /* --- 光环：火环 --- */
    if (r.mods.auraR > 0) {
      r.auraT -= dt;
      if (r.auraT <= 0) {
        r.auraT = 0.5;
        const dps = r.mods.auraDps * r.atk;
        for (const z of r.zombies) {
          if (z.dead) continue;
          if (Math.hypot(z.x - r.px, z.y - r.py) < r.mods.auraR) {
            this.hurt(z, dps * 0.5, false, '火');
            if (r.mods.knock) {
              const a = Math.atan2(z.y - r.py, z.x - r.px);
              z.x += Math.cos(a) * 12; z.y += Math.sin(a) * 12;
            }
          }
        }
      }
    }

    /* --- 光环：冰霜新星 --- */
    if (r.mods.novaR > 0) {
      r.novaT -= dt;
      if (r.novaT <= 0) {
        r.novaT = Math.max(1, r.mods.novaCd);
        r.efx.push({ t: 'nova', x: r.px, y: r.py, r: r.mods.novaR, life: 0.45, max: 0.45 });
        for (const z of r.zombies) {
          if (z.dead) continue;
          if (Math.hypot(z.x - r.px, z.y - r.py) < r.mods.novaR) {
            z.slow = Math.max(z.slow, r.mods.novaSlow); z.slowT = 2.2;
          }
        }
      }
    }

    /* --- 中毒 --- */
    if (r.poisonT > 0) {
      r.poisonT -= dt;
      if (Math.floor(r.poisonT * 2) !== Math.floor((r.poisonT + dt) * 2)) {
        this.hurtPlayer(r.poison, '毒');
      }
    }

    /* --- 地面腐蚀液池 --- */
    for (const pl of r.pools) {
      pl.life -= dt;
      if (Math.hypot(r.px - pl.x, r.py - pl.y) < pl.r) this.hurtPlayer(pl.dps * dt, '腐蚀');
    }
    r.pools = r.pools.filter((p) => p.life > 0);

    /* --- 僵尸 --- */
    for (const z of r.zombies) {
      if (z.dead) continue;
      if (z.slowT > 0) { z.slowT -= dt; if (z.slowT <= 0) z.slow = 0; }
      if (z.burnT > 0) { z.burnT -= dt; this.hurt(z, z.burn * r.atk * dt, false, '火'); }
      const sp = z.spd * (1 - (z.slow || 0));
      const dx = r.px - z.x, dy = r.py - z.y;
      const dist = Math.hypot(dx, dy) || 1;
      z.facing = Math.atan2(dy, dx);

      if (z.isBoss) this.bossTick(z, dt, dist);

      if (z.ai === 'ranged') {
        if (dist > z.atkR * 0.75) { z.x += dx / dist * sp * dt * 0.7; z.y += dy / dist * sp * dt * 0.7; }
        z.atkCd -= dt;
        if (z.atkCd <= 0 && dist < z.atkR) {
          z.atkCd = 2.2;
          if (z.d.poison) {
            this.shootEnemy(z, 'poison');
          } else {
            r.pools.push({ x: r.px, y: r.py, r: 44, dps: z.dmg, life: 3.2, max: 3.2 });
          }
        }
      } else if (z.ai === 'rush') {
        z.dashT -= dt;
        const boost = z.dashT > 0 ? 2.4 : 1;
        z.x += dx / dist * sp * boost * dt; z.y += dy / dist * sp * boost * dt;
        if (z.dashT <= -2.5) z.dashT = 0.9;
      } else if (z.ai === 'boomer') {
        z.x += dx / dist * sp * dt; z.y += dy / dist * sp * dt;
        if (dist < z.atkR + 8) { this.boom(z); }
      } else {
        z.x += dx / dist * sp * dt; z.y += dy / dist * sp * dt;
      }

      /* 接触伤害 */
      if (dist < z.atkR * 0.55) {
        z.atkCd -= dt;
        if (z.atkCd <= 0) {
          z.atkCd = 0.9;
          this.hurtPlayer(z.dmg, z.n);
          if (z.isBoss) {
            const a = Math.atan2(r.py - z.y, r.px - z.x);
            r.px += Math.cos(a) * 34; r.py += Math.sin(a) * 34;
          }
        }
      }
    }
    r.zombies = r.zombies.filter((z) => !z.dead);

    /* --- 子弹 --- */
    for (const b of r.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -20 || b.x > this.W + 20 || b.y < -20 || b.y > this.H + 20) b.life = 0;
      if (b.life <= 0) continue;
      for (const z of r.zombies) {
        if (z.dead) continue;
        if (b.hit.indexOf(z) >= 0) continue;
        if (Math.hypot(z.x - b.x, z.y - b.y) > 18) continue;
        b.hit.push(z);
        let dmg = b.dmg;
        if (z.def) dmg *= (1 - z.def);
        if (z.front) {
          const a = Math.atan2(b.y - z.y, b.x - z.x);
          let diff = Math.abs(a - z.facing); while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
          if (diff < 1.1) dmg *= (1 - z.front);
        }
        this.hurt(z, dmg, Math.random() < r.crit, '物');
        if (r.mods.explode > 0) this.explode(b.x, b.y, r.mods.er, b.dmg * r.mods.explode);
        if (r.mods.chain > 0 && Math.random() < r.mods.chain) this.chain(z, r.mods.chainN, b.dmg * 0.55);
        if (b.pierce <= 0) { b.life = 0; break; }
        b.pierce--;
      }
    }
    r.bullets = r.bullets.filter((b) => b.life > 0);

    /* --- 特效/飘字/掉落 --- */
    for (const f of r.efx) f.life -= dt;
    r.efx = r.efx.filter((f) => f.life > 0);
    for (const f of r.floats) { f.life -= dt; f.y -= 26 * dt; }
    r.floats = r.floats.filter((f) => f.life > 0);
    for (const d of r.drops) {
      d.y += 40 * dt;
      const dx = r.px - d.x, dy = r.py - d.y, dd = Math.hypot(dx, dy);
      if (dd < 90) { d.x += dx / dd * 420 * dt; d.y += dy / dd * 420 * dt; }
      if (dd < 26) { this.pick(d); d.get = 1; }
    }
    r.drops = r.drops.filter((d) => !d.get);

    /* --- 波次推进 --- */
    if (r.spawnLeft === 0 && r.zombies.length === 0) {
      if (r.wave >= r.waveTotal) { this.win(); return; }
      if (r.endless) { this.startWave(r.wave + 1); return; }
      r.waveGap -= dt;
      if (r.waveGap <= 0) { this.startWave(r.wave + 1); r.waveGap = 1.4; }
    } else r.waveGap = 1.4;

    /* --- 无尽模式持续加压 --- */
    if (r.endless && r.spawnLeft === 0 && r.zombies.length === 0) this.startWave(r.wave + 1);
  },

  /* ---------------- BOSS ---------------- */
  bossTick(z, dt, dist) {
    const r = this.run, d = z.bossDef;
    const ratio = z.hp / z.maxHp;
    const th = d.skills.filter((s) => typeof s.trig === 'number');
    for (let i = 0; i < th.length; i++) {
      if (ratio <= th[i].trig && z.phase <= i) {
        z.phase = i + 1;
        r.efx.push({ t: 'warn', x: z.x, y: z.y, r: 200, life: 0.8, max: 0.8 });
        UI.toast('⚠️ ' + d.n + ' 进入第 ' + z.phase + ' 阶段：' + th[i].n, 'boss');
        if (th[i].n === '召唤小怪') {
          for (let k = 0; k < 6; k++) {
            const dd = EX.zombies.find((x) => x.id === 'putong');
            const nz = this.mkZ(dd, r.def.hpMul); this.randEdge(nz); r.zombies.push(nz);
          }
        }
        if (th[i].n === '孢子喷吐') {
          for (let k = 0; k < 4; k++) {
            const dd = EX.zombies.find((x) => x.id === 'xiaozombie');
            const nz = this.mkZ(dd, r.def.hpMul);
            nz.x = z.x + (Math.random() - 0.5) * 90; nz.y = z.y + (Math.random() - 0.5) * 90;
            r.zombies.push(nz);
          }
        }
        if (th[i].n === '狂暴') { z.spd *= 1.5; z.dmg *= 1.35; }
      }
    }
  },

  /* ---------------- 射击 ---------------- */
  shoot(tg) {
    const r = this.run;
    if (r.mag <= 0) return;
    r.mag--;
    const base = Math.atan2(tg.y - r.py, tg.x - r.px);
    const n = Math.max(1, Math.round(Number(r.pellets || 1) + Number(r.spread || 0) + Number(r.mods.spread || 0)));
    const dmg = (Number(r.atk) || 1) * (1 + Number(r.mods.dmgMul) || 0);
    const g = E.gun(this.P);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.13;
      const a = base + off + (Math.random() - 0.5) * 0.05;
      r.bullets.push({
        x: r.px, y: r.py - 6, vx: Math.cos(a) * g.bulletSpd, vy: Math.sin(a) * g.bulletSpd,
        dmg, pierce: r.pierce + r.mods.pierce, life: 1.4, hit: [],
        explode: g.explode || r.mods.explode, er: g.er || r.mods.er || 46,
      });
    }
    if (r.mag <= 0) this.reload();
  },

  reload() {
    const r = this.run; if (!r || r.reloading || r.mag >= r.magMax) return;
    r.reloading = true;
    r.reloadT = E.gun(this.P).reload * (1 - Math.min(0.4, (this.P.build?.armory || 0) * 0.01));
  },

  shootEnemy(z, kind) {
    const r = this.run;
    const a = Math.atan2(r.py - z.y, r.px - z.x);
    r.bullets.push({
      x: z.x, y: z.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
      dmg: 0, pierce: 0, life: 2.4, hit: [], enemy: true, kind,
    });
  },

  /* ---------------- 伤害 ---------------- */
  hurt(z, dmg, crit, src) {
    const r = this.run;
    let d = dmg * (1 + (crit ? r.critDmg : 0));
    z.hp -= d;
    this.addFloat(z.x, z.y - 14, Math.round(d), crit ? 'crit' : 'dmg');
    if (z.hp <= 0) this.kill(z);
  },

  hurtPlayer(dmg, src) {
    const r = this.run; if (!r || r.over) return;
    if (src === 'poison') { r.poison = dmg; r.poisonT = 4; return; }
    let d = dmg;
    if (r.shield > 0) {
      const ab = Math.min(r.shield, d); r.shield -= ab; d -= ab;
      if (r.shield <= 0) UI.toast('🛡️ 护盾破碎', 'err');
    }
    r.hp -= d; r.hitFlash = 0.18;
    this.addFloat(r.px, r.py - 26, '-' + Math.round(dmg), 'hurt');
    if (r.hp <= 0) { r.hp = 0; this.onLose(); }
  },

  kill(z) {
    const r = this.run; if (z.dead) return;
    z.dead = true; r.kills++;
    const heal = r.mods.healOnKill;
    if (heal > 0 && r.hp < r.maxHp) r.hp = Math.min(r.maxHp, r.hp + heal);
    r.gold += Math.round(z.gold * (1 + E.talentVal(this.P, 'gold')));
    this.gainXp(z.xp);
    if (z.d.split) {
      const dd = EX.zombies.find((x) => x.id === 'xiaozombie');
      for (let i = 0; i < z.d.split; i++) {
        const nz = this.mkZ(dd, r.def.hpMul);
        nz.x = z.x + (Math.random() - 0.5) * 30; nz.y = z.y + (Math.random() - 0.5) * 30;
        r.zombies.push(nz);
      }
    }
    if (z.ai === 'boomer' && z.d.id !== 'zibao') this.boom(z);
    r.drops.push({ x: z.x, y: z.y, xp: 0, gold: 0 });
  },

  boom(z) {
    const r = this.run;
    r.efx.push({ t: 'boom', x: z.x, y: z.y, r: 72, life: 0.4, max: 0.4 });
    if (Math.hypot(r.px - z.x, r.py - z.y) < 72) this.hurtPlayer(z.dmg, z.n);
    z.dead = true;
  },

  explode(x, y, r2, dmg) {
    const r = this.run;
    r.efx.push({ t: 'boom', x, y, r: r2, life: 0.3, max: 0.3 });
    for (const z of r.zombies) {
      if (z.dead) continue;
      if (Math.hypot(z.x - x, z.y - y) < r2) this.hurt(z, dmg, false, '火');
    }
  },

  chain(z, n, dmg) {
    const r = this.run;
    let cur = z, hitSet = [z];
    for (let i = 0; i < n; i++) {
      let best = null, bd = 130;
      for (const o of r.zombies) {
        if (o.dead || hitSet.indexOf(o) >= 0) continue;
        const d = Math.hypot(o.x - cur.x, o.y - cur.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) break;
      r.efx.push({ t: 'bolt', x1: cur.x, y1: cur.y, x2: best.x, y2: best.y, life: 0.22, max: 0.22 });
      this.hurt(best, dmg, false, '电');
      hitSet.push(best); cur = best;
    }
  },

  pick(d) {
    const r = this.run;
    this.gainXp(Math.max(1, Math.round((d.xp || 2) * (1 + E.talentVal(this.P, 'xp')))));
  },

  gainXp(v) {
    const r = this.run;
    r.xp += v;
    while (r.xp >= r.xpNeed) {
      r.xp -= r.xpNeed; r.lv++;
      r.xpNeed = Math.round(r.xpNeed * 1.28 + 6);
      this.offerSkills();
    }
  },

  /* ---------------- 技能三选一 ---------------- */
  offerSkills() {
    const r = this.run;
    const owned = Object.keys(r.skills);
    let pool = EX.skills.filter((s) => {
      const lv = r.skills[s.id] || 0;
      if (lv >= s.max) return false;
      if (lv === 0 && s.conflict && r.skills[s.conflict]) return false;
      if (lv === 0 && owned.length >= 8) return false;
      return true;
    });
    if (!pool.length) return;
    const picks = [];
    const c = pool.slice();
    for (let i = 0; i < 3 && c.length; i++) picks.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
    this.paused = true;
    this._picks = picks;
    UI.showSkillChoice(picks);
  },
  refreshOffer() {
    if (!this._picks) return;
    this.offerSkills();
  },
  pickSkill(id) {
    const r = this.run;
    r.skills[id] = (r.skills[id] || 0) + 1;
    this.applyMods();
    if (id === 'hudun') { r.maxShield += 120; r.shield = r.maxShield; }
    UI.toast('✨ ' + EX.skills.find((s) => s.id === id).n + ' Lv.' + r.skills[id], 'ok');
    this.paused = false;
  },
  applyMods() {
    const r = this.run;
    r.mods = this.emptyMods();
    for (const id in r.skills) {
      const s = EX.skills.find((x) => x.id === id); if (!s) continue;
      const lv = r.skills[id];
      for (const k in s.mods) r.mods[k] += s.mods[k] * lv;
    }
    r.shield = Math.max(r.shield, r.mods.shield);
    r.maxShield = Math.max(r.maxShield, r.mods.shield);
  },

  addFloat(x, y, v, cls) { this.run.floats.push({ x, y, v: String(v), cls, life: 0.7 }); },

  nearest(x, y, ex, maxR) {
    let best = null, bd = maxR || 9999;
    for (const z of this.run.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  },

  /* ---------------- 结束 ---------------- */
  win() {
    const r = this.run; if (r.over) return;
    r.over = true; this.on = false; this.stopLoop();
    if (this.cb) this.cb('win', { kills: r.kills, time: r.time, rw: { gold: r.gold, diamond: 0 }, lv: r.lv });
  },
  onLose() {
    const r = this.run; if (r.over) return;
    if (r.reviveLeft > 0) {
      r.reviveLeft--;
      r.hp = r.maxHp; r.shield = r.maxShield;
      for (const z of r.zombies.slice()) {
        if (Math.hypot(z.x - r.px, z.y - r.py) < 190) z.dead = true;
      }
      r.zombies = r.zombies.filter((z) => !z.dead);
      UI.toast('💚 复活成功！剩余 ' + r.reviveLeft + ' 次', 'ok');
      return;
    }
    r.over = true; this.on = false; this.stopLoop();
    if (this.cb) this.cb('lose', { kills: r.kills, time: r.time, rw: { gold: Math.floor(r.gold * 0.3), diamond: 0 }, lv: r.lv });
  },
  quit() {
    const r = this.run; if (!r || r.over) return;
    r.over = true; this.on = false; this.stopLoop();
    if (this.cb) this.cb('quit', { kills: r.kills, time: r.time, rw: { gold: Math.floor(r.gold * 0.5), diamond: 0 }, lv: r.lv });
  },
  resume() { this.paused = false; },

  /* =================================================
   * 绘制
   * ================================================ */
  draw() {
    const r = this.run; if (!r) { return; }
    const c = this.ctx; if (!c) return;
    const W = this.W, H = this.H;

    /* 背景 */
    const bg = this.img(this.scene);
    if (bg && bg.complete && bg.naturalWidth) {
      try { c.drawImage(bg, 0, 0, W, H); } catch (e) {}
      c.fillStyle = 'rgba(10,16,28,0.42)'; c.fillRect(0, 0, W, H);
    } else {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a2637'); g.addColorStop(1, '#232f42');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }

    /* 腐蚀液池 */
    for (const p of r.pools) {
      c.fillStyle = 'rgba(120,220,90,0.22)';
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
    }

    /* 特效 */
    for (const f of r.efx) {
      const al = f.life / f.max;
      if (f.t === 'boom') {
        c.strokeStyle = 'rgba(255,150,60,' + al + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.2 - al * 0.5), 0, 7); c.stroke();
      } else if (f.t === 'nova') {
        c.strokeStyle = 'rgba(92,216,255,' + al + ')'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.25 - al * 0.4), 0, 7); c.stroke();
      } else if (f.t === 'bolt') {
        c.strokeStyle = 'rgba(192,140,255,' + al + ')'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke();
      } else if (f.t === 'warn') {
        c.strokeStyle = 'rgba(255,77,109,' + al + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.3 - al * 0.5), 0, 7); c.stroke();
      }
    }

    /* 火环 */
    if (r.mods.auraR > 0) {
      c.strokeStyle = 'rgba(255,122,60,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.arc(r.px, r.py, r.mods.auraR, 0, 7); c.stroke();
    }

    /* 子弹 */
    for (const b of r.bullets) {
      if (b.enemy) {
        c.fillStyle = b.kind === 'poison' ? '#7be86a' : '#c8e05a';
        c.beginPath(); c.arc(b.x, b.y, 5, 0, 7); c.fill();
      } else {
        c.fillStyle = '#ffd76a';
        c.beginPath(); c.arc(b.x, b.y, 3.2, 0, 7); c.fill();
        c.strokeStyle = 'rgba(255,215,106,0.5)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014); c.stroke();
      }
    }

    /* 僵尸 */
    for (const z of r.zombies) {
      if (z.dead) continue;
      const sz = z.isBoss ? 46 : (z.d.elite ? 28 : 24);
      c.font = sz + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (z.slowT > 0) { c.fillStyle = 'rgba(92,216,255,0.28)'; c.beginPath(); c.arc(z.x, z.y, sz * 0.62, 0, 7); c.fill(); }
      c.fillText(z.icon, z.x, z.y);
      if (z.hp < z.maxHp) {
        const bw = sz * 0.9;
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(z.x - bw / 2, z.y - sz * 0.72, bw, 3.5);
        c.fillStyle = z.isBoss ? '#ff4d6d' : '#5fd07a';
        c.fillRect(z.x - bw / 2, z.y - sz * 0.72, bw * Math.max(0, z.hp / z.maxHp), 3.5);
      }
    }

    /* 玩家 */
    const heroImg = this._heroImg !== undefined ? this._heroImg : (() => {
      const url = this.P && this.P.avatarImg; if (!url) { this._heroImg = null; return null; }
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { this._heroImg = im; }; im.onerror = () => { this._heroImg = null; };
      im.src = url; this._heroImg = null; return null;
    })();
    if (heroImg && heroImg.complete && heroImg.naturalWidth) {
      try {
        const hh = 44, hw = hh * heroImg.naturalWidth / heroImg.naturalHeight;
        c.drawImage(heroImg, r.px - hw / 2, r.py - hh + 14, hw, hh);
      } catch (e) {
        c.font = '30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(this.P.avatar || '👨‍🚀', r.px, r.py);
      }
    } else {
      c.font = '30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText((this.P && this.P.avatar) || '👨‍🚀', r.px, r.py);
    }
    if (r.shield > 0) {
      c.strokeStyle = 'rgba(92,216,255,0.75)'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(r.px, r.py, 26, 0, 7); c.stroke();
    }
    if (r.hitFlash > 0) {
      c.fillStyle = 'rgba(255,60,90,' + (r.hitFlash / 0.18) * 0.35 + ')';
      c.fillRect(0, 0, W, H);
    }

    /* 飘字 */
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const f of r.floats) {
      const al = Math.max(0, f.life / 0.7);
      c.font = (f.cls === 'crit' ? 'bold 17px' : f.cls === 'hurt' ? 'bold 14px' : '13px') + ' sans-serif';
      c.fillStyle = f.cls === 'crit' ? '#ff4d6d' : f.cls === 'hurt' ? '#ff8fa4' : '#ffe9a8';
      c.globalAlpha = al; c.fillText(f.v, f.x, f.y); c.globalAlpha = 1;
    }
  },
};

BT.joy = { x: 0, y: 0 };
window.BT = BT;
