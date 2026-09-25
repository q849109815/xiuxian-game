/* =========================================================
 * battle.js —— 战斗引擎（俯视角 · 摇杆移动 · 自动射击 · 换弹）
 * 依据资料：
 *   - GD-008 战斗系统（俯视角弹幕、自动瞄准、碰撞判定、穿透击退爆炸）
 *   - 06 操作方案（左侧虚拟摇杆 / WASD，自动瞄准自动开火，R 换弹）
 *   - 09 怪物技能机制表（12 种怪物 AI + BOSS 阶段）
 *   - 10 局内技能表（12 项，含互斥规则）
 * ========================================================= */

/* 素材图缓存 */
const IMG = {
  cache: {}, fail: {},
  get(src) {
    if (!src) return null;
    const v = this.cache[src];
    if (v) return v;                        /* 已加载成功 */
    if (v === null) {                       /* 曾失败/加载中：4 秒后才重试，避免狂刷请求 */
      if (Date.now() - (this.fail[src] || 0) < 4000) return null;
    }
    const im = new Image();
    im.onload = () => { this.cache[src] = im; delete this.fail[src]; };
    im.onerror = () => { this.cache[src] = null; this.fail[src] = Date.now(); };
    im.src = src;
    this.cache[src] = null;                 /* 加载中：先用几何图形兜底 */
    this.fail[src] = Date.now();
    return null;
  },
};

const BT = {
  cv: null, ctx: null, W: 360, H: 640,
  P: null, run: null, on: false, paused: false, raf: null, last: 0,
  scene: 'city', _imgs: {}, _imgFail: {}, _heroImg: undefined,

  SCENES: {
    city: 'assets/scene/city.jpg', factory: 'assets/scene/factory.jpg',
    wasteland: 'assets/scene/wasteland.jpg', tunnel: 'assets/scene/tunnel.jpg',
    field: 'assets/scene/field.jpg', snow: 'assets/scene/snow.jpg',
  },

  /* ---------------- 场景 ---------------- */
  sceneFor(ch) {
    /* 保护：ch<=0（无尽/异常）时原先会取到下标 -1 → undefined → 场景图永远空白 */
    const i = Math.max(0, (Number(ch) || 1) - 1) % 6;
    return ['city', 'factory', 'wasteland', 'tunnel', 'field', 'snow'][i];
  },
  img(key) {
    const v = this._imgs[key];
    if (v) return v;
    if (v === null && Date.now() - (this._imgFail[key] || 0) < 4000) return null;
    const url = this.SCENES[key]; if (!url) { this._imgs[key] = null; return null; }
    this._imgFail[key] = Date.now();
    const im = new Image();
    im.onload = () => { this._imgs[key] = im; };
    im.onerror = () => { this._imgs[key] = null; };
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
    this.W = Math.max(300, b.width || 390); this.H = Math.max(520, b.height || 693);
    this.wallY = this.H - 96;
    this.cv.width = this.W * d; this.cv.height = this.H * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  },

  /* ---------------- 关卡定义（按章节生成） ---------------- */
  /* 关卡定义：资料关卡表（3 章 10 关）；levelId = '1-1' 或 'endless' */
  levelDef(levelId, p) {
    if (levelId === 'endless') {
      /* 无尽模式 ch 原先写死 0，带来两个连带故障：
       *   ① sceneFor(0) → 数组下标 -1 → undefined → 场景图永远加载不到
       *   ② dropFor(src, 0) 把章节当成 1 → 精英僵尸只掉最低档材料，
       *      后期该有的稀有金属/碎片全部掉不出来
       * 现在按玩家当前进度章节取值，无尽打越深掉落档越高。 */
      const ch = p ? Math.max(1, (E.chapterOf ? E.chapterOf(p.curLevel || '1-1') : 1)) : 1;
      /* 严重BUG：无尽模式此前【没有 rwMul 字段】
       *   run.rwMul = def.rwMul → undefined
       *   mkZ(): z.gold = Math.round((d.gold||3) * undefined) = NaN
       *          z.xp   = NaN
       * 实测后果（无尽模式）：
       *   ① r.gold 恒 NaN → 结算 Math.floor(NaN*0.3)||0 = 0，击杀一分钱拿不到
       *   ② r.xp  恒 NaN → 局内等级永远卡在 Lv.1
       *      → 升级从不发生 → 技能三选一【一次都不出现】
       *      无尽模式只能靠初始属性硬打，实测 12 波即阵亡
       * 现在按玩家当前进度关卡的倍率取值，无尽收益随进度提升。 */
      const curId = p && E.curLevel ? E.curLevel(p) : '1-1';
      const curD = (EX.levels || []).find((x) => x.id === curId);
      return { id: 'endless', ch: ch, n: '无尽模式', waves: 9999,
        pool: EX.zombies.map((z) => z.id), per: [8, 20], mul: 1.0,
        rwMul: Math.max(1, (curD && curD.mul) || 1),
        cond: 'endless', boss: null, scene: 'city', endless: true };
    }
    const d = EX.levels.find((x) => x.id === levelId) || EX.levels[0];
    return {
      id: d.id, ch: d.ch,
      /* 截图格式「1.城市大街」= 章节号.关卡名。
       * 此前拼成 "1-1 废弃街道"，UI 再补章节前缀 → 显示成 "1.1-1 废弃街道"（编号重复） */
      n: d.n, waves: d.waves,
      pool: d.pool, per: d.per, mul: d.mul, cond: d.cond,
      boss: d.boss || null, scene: d.scene, endless: false, rw: d.rw,
      /* 章节收益系数：击杀金币/经验按关卡倍率同步放大，
       * 使后期"刷关攒钱 → 升级武器 → 突破"的循环成立 */
      rwMul: Math.max(1, d.mul || 1),
    };
  },

  /* ---------------- 开局 ---------------- */
  start(p, levelNo, opt = {}) {
    /* 表37 埋点：level_start */
    try { OPS.track('level_start', { lv: levelNo, pw: E.power(p) }); } catch (e) {}
    const def = this.levelDef(levelNo);
    const a = E.attrs(p);
    /* 表16：战斗外使用的消耗品，在开局统一生效
     * 【注意】不能在这里调：此时 this.run 还是【上一局的残骸或未定义】，
     *         applyItem() 会把 护盾/回血/攻击buff 写到旧 run 上，
     *         紧接着下面 `this.run = {...}` 整体覆盖 → 效果全部蒸发。
     *         实测：战斗外用急救包 → 提示「下一场自动生效」→ 开局血量纹丝不动。
     *        必须挪到 run 创建之后（见下方 start 末尾）。 */
    this.charImg = (E.char(p) || {}).img || null;
    this.P = p; this._heroImg = undefined;
    this.scene = this.sceneFor(def.ch); this.img(this.scene);
    /* 无尽模式：按玩家进度章节取关（见 levelDef 注释） */
    if (def.endless && p) def.ch = Math.max(1, (E.chapterOf ? E.chapterOf(p.curLevel || '1-1') : 1));

    const maxHp = a.hp;
    this.run = {
      skillDmg: {},
      obstacles: [],      /* 掩体（阻挡子弹/僵尸） */
      barrels: [],        /* 可破坏油桶（击破爆炸） */
      def, endless: !!opt.endless, ch: def.ch,
      px: this.W / 2, py: this.H - 58,
      aimX: 0, aimY: -1, aiming: false,
      /* 防线血量（真实玩法：漏怪突破即失败） */
      wallMax: Math.round(maxHp * 0.6), wallHp: Math.round(maxHp * 0.6),
      hp: Math.round(maxHp * 0.6), maxHp: Math.round(maxHp * 0.6),
      /* 兜底：即使 attrs() 因热更/旧版本没返回 shield，也不能是 undefined
       * （undefined 经 Math.max 会变成 NaN，护盾系统整体失效） */
      shield: Number(a.shield) || 0, maxShield: Number(a.shield) || 0,
      turrets: [], mercs: [], coin: 0, cd: {},
      atk: a.atk, rate: a.rate, range: a.range, pierce: a.pierce, spread: a.spread,
      pellets: a.pellets || 1, crit: a.crit, critDmg: a.critDmg, moveSpd: a.moveSpd,
      dmgMin: a.dmgMin, dmgMax: a.dmgMax, ls: a.ls, erMul: a.erMul, reloadCut: a.reloadCut,
      mag: a.mag, magMax: a.mag, reloadT: 0, reloading: false,
      shootT: 0,
      wave: 0, waveTotal: def.waves, spawnLeft: 0, spawnT: 0, waveGap: 0,
      def: def, cond: def.cond, mul: def.mul,
      /* 章节收益系数
       * 严重BUG：mkZ() 里用 this.run.rwMul 算僵尸的金币/经验，
       * 但 run 对象里从来没有 rwMul 这个字段（只有 mul，而 levelDef 把
       * 倍率放在 def.rwMul 上）→ undefined 参与乘法：
       *   z.gold = Math.round((d.gold||3) * undefined) = NaN
       *   z.xp   = NaN
       * 于是 r.gold / r.coin / r.xp 全部变 NaN：
       *   ① 击杀金币恒为 0（结算处 `|| 0` 兜底才没暴露）
       *   ② 局内金币 NaN → 炮台判断 `r.coin < cost` 恒为 false
       *      → 建造/升级不扣钱、可无限白嫖
       *   ③ 局内经验 NaN → 战斗中永远升不了级
       * 现在把 def.rwMul 同步到 run 上。 */
      /* 兜底：任何模式/关卡若漏配 rwMul，退化用 def.mul，
       * 绝不让它变成 undefined 参与乘法（NaN 会静默污染金币/经验/等级） */
      rwMul: (def.rwMul != null && isFinite(def.rwMul)) ? def.rwMul : Math.max(1, def.mul || 1),
      /* 连升多级的待选技能次数，开局清零 */
      _pendingOffers: 0,
      zombies: [], bullets: [], pools: [], efx: [], floats: [], drops: [],
      /* 主动技能产生的持续区域（燃烧/旋风/激光/冰暴）
       * 此前 11 个主动技能（温压弹/干冰弹/制导激光/燃油弹…）的 mods
       * 在 battle.js 里零引用，选了只涨等级数字，战斗效果为零。 */
      zones: [],
      skills: {}, mods: this.emptyMods(),
      lv: 1, xp: 0, xpNeed: 18,
      gold: 0, kills: 0, time: 0, over: false,
      reviveLeft: a.revive, novaT: 0, auraT: 0,
      /* 玩家护甲：此前 run 里根本没有这个字段，
       * 而 hurtPlayer() 也不读它 → 护甲养成线（天赋/芯片/皮肤/角色表）全废 */
      armor: Number(a.armor) || 0,
      poison: 0, poisonT: 0, hitFlash: 0,
      boss: null, bossPhase: 0, warned: false,
    };
    /* 带上基地已招募的佣兵 */
    const _r = this.run;
    for (const mid of (p.mercs || [])) {
      const md = EX.mercs.find((x) => x.id === mid); if (!md) continue;
      _r.mercs.push({ def: md, x: this.W * (0.28 + _r.mercs.length * 0.18), y: this.H - 74, cd: 0 });
    }
    /* 战斗外预置的消耗品：必须在 run 创建【之后】才生效
     * （此前放在 start() 开头，被 this.run = {...} 覆盖，等于白用） */
    try { if (E.applyPendingItems) E.applyPendingItems(p); } catch (e) {}
    this.on = true; this.paused = false;
    this.startWave(1);
    this.startLoop();
    if (opt.cb) this.cb = opt.cb;
  },

  emptyMods() {
    return { dmgMul: 0, rateMul: 0, spread: 0, pierce: 0, crit: 0, critDmg: 0,
      healOnKill: 0, chain: 0, chainN: 0, auraR: 0, auraDps: 0, knock: 0,
      novaR: 0, novaSlow: 0, novaCd: 0, explode: 0, er: 0, shield: 0, moveMul: 0,
      /* 分裂子弹（被动 fenliezidan）：此前该键既不在 emptyMods 里、
       * mods.split 也全项目零引用 → 技能说明"命中后分裂成多枚"从未发生 */
      split: 0 };
  },

  startWave(w) {
    const r = this.run, d = r.def;
    r.wave = w;
    r.waveT = 0;              /* 重置波次计时（配合超时推进） */
    r.waveMaxT = (d.cond === 'boss' || d.cond === 'bossAll') && w === d.waves ? 999 : 20;
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
    /* BOSS 血量：bosses 表里的 hp 已是「按章节设计好的最终值」
     * （依据对应武器等级 DPS × 25~40 秒），若再乘关卡 mul，
     * 第10章尸王会变成 410万 × 131.75 = 5.4亿，需打 4000 秒 —— 完全不可通关。
     * 无尽模式保留波次递增。 */
    /* 双 BOSS 关（第3/8章）同时出场两只，总血量翻倍会过难，各按 0.6 折 */
    const multi = Array.isArray(r.def && r.def.boss) ? 0.6 : 1;
    const bossHp = Math.round(d.hp * multi * (r.endless ? 1 + (r.wave - 1) * 0.35 : 1));
    const z = this.mkZ(d, mul, bossHp);
    z.isBoss = true; z.bossDef = d; z.phase = 0; z.maxHp = z.hp; z.img = d.img;
    r.boss = z; r.zombies.push(z);
  },

  mkZ(d, mul, hpOverride) {
    const hp = hpOverride != null ? hpOverride : Math.round(d.hp * mul);
    return {
      d, id: d.id, n: d.n, icon: d.icon, img: d.img,
      x: 0, y: 0, hp, maxHp: hp, spd: d.spd, dmg: d.dmg, atkR: d.atkR,
      ai: d.ai, def: d.def || 0, front: d.front || 0, fly: !!d.fly,
      slow: 0, slowT: 0, burn: 0, burnT: 0, atkCd: 0, dashT: 0, facing: 0,
      dead: false, boss: false,
      /* 击杀金币/经验随章节缩放：
       * 原为固定值（普通僵尸 3 金币），后期武器升级需数千万，
       * 杀怪收益完全可忽略 → 只能靠关卡奖励，循环断裂。
       * 按关卡 mul 同步放大，使"多刷几关攒钱升级"成立 */
      xp: Math.round((d.xp || 4) * (this.run ? this.run.rwMul : 1)),
      gold: Math.round((d.gold || 3) * (this.run ? this.run.rwMul : 1)),
    };
  },

  randEdge(z) {
    const m = 30;
    const s = Math.floor(Math.random() * 4);
    /* 真实玩法：僵尸从屏幕上方成波次向下推进 */
    z.x = 24 + Math.random() * (this.W - 48);
    z.y = -m;
  },

  /* ---------------- 地图障碍物（表28） ---------------- */
  spawnObstacles() {
    const r = this.run; if (!r) return;
    r.obstacles = []; r.barrels = [];
    const lay = (EX.mapLayouts || {})[r.def.id];
    if (!lay) return;
    /* 掩体：随机分布在中上部战场 */
    const coverDefs = lay.covers || [];
    let total = 0; coverDefs.forEach((c) => { total += c[1]; });
    total = Math.min(total, 8);
    for (let i = 0; i < total; i++) {
      const cd = coverDefs[i % coverDefs.length];
      r.obstacles.push({
        n: cd[0], x: 30 + Math.random() * (this.W - 60),
        y: this.H * 0.22 + Math.random() * (this.H * 0.36),
        w: 22 + Math.random() * 16, h: 12 + Math.random() * 8,
        hp: EX.COVER_HP, maxHp: EX.COVER_HP, dead: false,
      });
    }
    /* 油桶：可破坏，爆炸伤僵尸 */
    for (let i = 0; i < (lay.barrels || 0); i++) {
      r.barrels.push({
        x: 28 + Math.random() * (this.W - 56),
        y: this.H * 0.24 + Math.random() * (this.H * 0.34),
        hp: EX.BARREL_HP, maxHp: EX.BARREL_HP, dead: false, r: 13,
      });
    }
  },
  /* 油桶爆炸：范围伤害僵尸 + 连锁引爆附近油桶 */
  blowBarrel(b) {
    const r = this.run; if (!r || b.dead) return;
    b.dead = true;
    this.addFloat(b.x, b.y - 10, 'BOOM', 'crit');
    if (window.SND) SND.play('explode');
    const R = EX.BARREL_R;
    (r.zombies || []).forEach((z) => {
      if (z.dead) return;
      const d = Math.hypot(z.x - b.x, z.y - b.y);
      if (d <= R) this.hurt(z, EX.BARREL_DMG, false, 'barrel');
    });
    /* 连锁引爆 */
    (r.barrels || []).forEach((o) => {
      if (o === b || o.dead) return;
      if (Math.hypot(o.x - b.x, o.y - b.y) <= R * 0.75) setTimeout(() => this.blowBarrel(o), 110);
    });
  },
  /* 子弹是否击中障碍物/油桶 */
  hitObstacle(x, y) {
    const r = this.run; if (!r) return null;
    for (const b of (r.barrels || [])) {
      if (b.dead) continue;
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 3) return { t: 'barrel', o: b };
    }
    for (const o of (r.obstacles || [])) {
      if (o.dead) continue;
      if (x >= o.x - o.w / 2 && x <= o.x + o.w / 2 && y >= o.y - o.h / 2 && y <= o.y + o.h / 2) return { t: 'cover', o: o };
    }
    return null;
  },
  /* 僵尸被掩体阻挡（绕行减速） */
  obsSlow(z) {
    const r = this.run; if (!r) return 1;
    /* 飞行僵尸越过地面障碍（表27：skill '飞行'），不受掩体减速
     * 此前 z.fly 字段在 mkZ 里赋值后从未被使用，飞行僵尸和地面僵尸
     * 一样被掩体减速 45%，"越过地面障碍"的设计等于没实现。 */
    if (z.fly) return 1;
    for (const o of (r.obstacles || [])) {
      if (o.dead) continue;
      if (Math.abs(z.x - o.x) < o.w / 2 + 8 && Math.abs(z.y - o.y) < o.h / 2 + 8) return 0.55;
    }
    return 1;
  },

  startLoop() {
    /* 开局台词（截图45/46） */
    if (window.UI && UI.btIntroTalk) setTimeout(() => UI.btIntroTalk(this.run), 700);
    this.spawnObstacles();
    /* 表21：进入第一关触发移动引导 */
    if (window.UI && UI.guideTrigger) UI.guideTrigger('enter');
    this.last = performance.now();
    const loop = (t) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
      if (!this.paused) this.tick(dt * (BT.speed || 1));
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
    this.tickBuffs(dt);            /* 消耗品增益计时（I03 攻击 +30%） */

    /* --- 玩家移动（摇杆） --- */
    const joy = BT.joy || { x: 0, y: 0 };
    const spd = r.moveSpd * (1 + r.mods.moveMul);
    let mx = joy.x, my = joy.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.08) {
      /* 真实玩法：玩家固定在底部防线，不跑位；摇杆=瞄准方向 */
      if (mx || my) { r.aimX = mx; r.aimY = my; r.aiming = true; }
      else r.aiming = false;
    }

    /* --- 换弹 --- */
    if (r.reloading) {
      r.reloadT -= dt;
      if (r.reloadT <= 0) {
        r.reloading = false; r.mag = r.magMax;
        /* 表41 SX_012 换弹完成音效 */
        if (window.SND) SND.play('reloadDone');
      }
    }

    /* --- 自动瞄准射击 --- */
    r.shootT -= dt;
    if (!r.reloading && r.mag > 0 && r.shootT <= 0) {
      /* 瞄准：拖动=按方向；否则自动锁定最近僵尸 */
      let tg = null;
      if (r.aiming) {
        const ax = r.aimX, ay = r.aimY;
        let best = null, bestD = 1e9;
        for (const z of r.zombies) {
          if (z.dead) continue;
          const vx = z.x - r.px, vy = z.y - r.py;
          const proj = vx * ax + vy * ay;
          if (proj <= 0) continue;
          const perp = Math.abs(vx * ay - vy * ax);
          if (perp < 70 && proj < bestD) { bestD = proj; best = z; }
        }
        tg = best;
      }
      if (!tg) tg = this.nearest(r.px, r.py, null, r.range);
      if (tg) { r.shootT = 1 / (r.rate * (1 + r.mods.rateMul)); this.shoot(tg); }
    }
    if (!r.reloading && r.mag <= 0) this.reload();

    /* --- 生成 --- */
    /* --- 炮台自动开火 --- */
    for (const t of r.turrets) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      const tz = this.nearest(t.x, t.y, null, t.def.rng + t.lv * 12);
      if (!tz) continue;
      t.cd = 1 / (t.def.rate * (1 + t.lv * 0.12));
      /* 炮台伤害此前完全不随章节缩放：
       * 火焰炮台固定 22 伤害，而第 10 章普通僵尸血量 3953（关卡倍率 131.75）
       * → 杀一只要 180 发 / 约 200 秒，后期炮台等于纯装饰，
       *   玩家花 120~180 金币建造 + 升级的钱全部白花。
       * 现在按关卡倍率 rwMul 缩放，与武器/怪物成长同步。 */
      const dmgT = t.def.dmg * (1 + t.lv * 0.35) * (1 + r.mods.dmgMul) * (r.def.rwMul || 1);
      this.spawnBullet(t.x, t.y, tz, dmgT, { pierce: 0, from: 'turret', el: t.def.el });
    }

    /* --- 佣兵 / 召唤物自动开火 --- */
    for (let i = r.mercs.length - 1; i >= 0; i--) {
      const m = r.mercs[i];
      if (m.isSummon) {
        m.life -= dt;
        if (m.life <= 0) { r.mercs.splice(i, 1); continue; }
      }
      m.cd -= dt;
      if (m.cd > 0) continue;
      const mz = this.nearest(m.x, m.y, null, m.def.rng);
      if (!mz) continue;
      /* 除零防护：后台热更若把 rate 改成 0，1/0 = Infinity
       * → 冷却永远走不完 → 雇佣兵静默失效（不报错，但再也不开火）。
       * 这里兜底为至少 0.05 秒一发。 */
      m.cd = 1 / Math.max(0.05, m.def.rate || 0);
      /* 佣兵伤害同样不随章节缩放（狙击手 90 伤害 vs 第10章 3953 血 = 44 发），
       * 花 800~1600 金币招募的佣兵后期完全打不动，一并按关卡倍率缩放。 */
      this.spawnBullet(m.x, m.y, mz, m.def.dmg * (1 + r.mods.dmgMul) * (r.def.rwMul || 1),
        { pierce: m.def.id === 'M_SJ' ? 3 : 0, from: 'merc', el: '物' });
    }

    /* --- 主动技能冷却 --- */
    for (const k in r.cd) if (r.cd[k] > 0) r.cd[k] -= dt;

    /* --- 自动战斗：冷却好了自动释放主动/召唤技能 ---
     * 严重 BUG：BT.auto 此前全项目零读取（只有初始化 BT.auto = true），
     * 「🤖 自动战斗」按钮点击后只切换了这一个变量 + 弹 toast + 按钮高亮，
     * 战斗逻辑完全不看它。而主动技能（温压弹/干冰弹/电磁穿刺…）只有
     * 玩家手动点技能格才会释放 —— 玩家以为开了自动，实际什么都没发生。
     * 现在 auto 为真时按 0.5s 节流自动释放（与人工点击节奏接近）。
     * 注：tick 在 paused 时不会被主循环调用，技能三选一期间不会误放。 */
    if (BT.auto) {
      r._autoT = (r._autoT || 0) + dt;
      if (r._autoT >= (BT.autoGap || 0.5)) {
        r._autoT = 0;
        const live = (r.zombies || []).some((z) => !z.dead);
        if (live) {
          for (const id in r.skills) {
            const d = EX.skills.find((x) => x.id === id);
            if (!d || d.kind === 'passive') continue;
            if ((r.cd[id] || 0) > 0) continue;
            this.castSkill(id);
            break;               /* 每次只放一个，避免一瞬间全部倾泻 */
          }
        }
      }
    }

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

    /* --- 主动技能持续区域（燃烧/旋风/激光/冰暴/轰炸） ---
     * 技能释放后留下的 zone，每帧对范围内僵尸结算伤害/减速 */
    if (r.zones && r.zones.length) {
      for (let i = r.zones.length - 1; i >= 0; i--) {
        const zn = r.zones[i];
        zn.life -= dt;
        if (zn.life <= 0) { r.zones.splice(i, 1); continue; }
        if (zn.delay != null && zn.delay > 0) { zn.delay -= dt; continue; }
        /* 轰炸：延时结束后一次性爆发 */
        if (zn.t === 'bomb' && zn.burst != null && !zn.done) {
          zn.done = true;
          r.efx.push({ t: 'nova', x: zn.x, y: zn.y, r: zn.r, life: 0.4, max: 0.4, el: zn.el });
          for (const z of r.zombies) {
            if (z.dead) continue;
            if (Math.hypot(z.x - zn.x, z.y - zn.y) <= zn.r) this.hurt(z, zn.burst, true, zn.el);
          }
          continue;
        }
        if (zn.t === 'laser') {
          const tg = zn.target;
          if (!tg || tg.dead) { r.zones.splice(i, 1); continue; }
          this.hurt(tg, zn.dps * dt, false, zn.el);
          r.efx.push({ t: 'beam', x: r.px, y: r.py,
            a: Math.atan2(tg.y - r.py, tg.x - r.px),
            len: Math.hypot(tg.x - r.px, tg.y - r.py), life: 0.08, max: 0.08, el: zn.el });
          continue;
        }
        /* 区域型：旋风 / 燃烧 / 冰暴 */
        for (const z of r.zombies) {
          if (z.dead) continue;
          const d = Math.hypot(z.x - zn.x, z.y - zn.y);
          if (d > zn.r) continue;
          if (zn.dps) this.hurt(z, zn.dps * dt, false, zn.el);
          if (zn.slow) { z.slow = Math.max(z.slow || 0, zn.slow); z.slowT = Math.max(z.slowT || 0, 0.4); }
          /* 旋风吸附：把僵尸往中心拽 */
          if (zn.t === 'vortex' && d > 6) {
            const a = Math.atan2(zn.y - z.y, zn.x - z.x);
            z.x += Math.cos(a) * 46 * dt; z.y += Math.sin(a) * 46 * dt;
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
      /* 免疫减速的 BOSS（深渊领主「狂暴免疫」阶段）不受任何减速影响 */
      if (z.immuneSlow) { z.slow = 0; z.slowT = 0; }
      else if (z.slowT > 0) { z.slowT -= dt; if (z.slowT <= 0) z.slow = 0; }
      if (z.burnT > 0) { z.burnT -= dt; this.hurt(z, z.burn * r.atk * dt, false, '火'); }
      const sp = z.spd * (1 - (z.slow || 0));
      const dx = r.px - z.x, dy = r.py - z.y;
      const dist = Math.hypot(dx, dy) || 1;
      z.facing = Math.atan2(dy, dx);

      if (z.isBoss) this.bossTick(z, dt, dist);

      /* 真实玩法：僵尸整体自上而下推进，向防线（屏幕底部）压 */
      /* 掩体减速（表28：障碍物阻挡僵尸推进） */
      const downSp = sp * (z.ai === 'rush' ? (z.dashT > 0 ? 2.2 : 1) : 1) * (this.obsSlow ? this.obsSlow(z) : 1);
      if (z.ai === 'ranged') {
        /* 远程僵尸推进到射程内停下喷吐 */
        if (dist > z.atkR * 0.9) z.y += downSp * dt * 0.85;
        z.atkCd -= dt;
        if (z.atkCd <= 0 && dist < z.atkR) {
          z.atkCd = 2.2;
          if (z.d.poison) this.shootEnemy(z, 'poison');
          else r.pools.push({ x: z.x, y: z.y + 30, r: 44, dps: z.dmg, life: 3.2, max: 3.2 });
        }
      } else if (z.ai === 'rush') {
        z.dashT -= dt;
        z.y += downSp * dt;
        if (z.dashT <= -2.5) z.dashT = 0.9;
      } else if (z.ai === 'boomer') {
        z.y += downSp * dt;
        if (dist < z.atkR + 8) this.boom(z);
      } else {
        z.y += downSp * dt;
      }
      /* 轻微横向摆动，避免完全直线 */
      if (z.wobble == null) z.wobble = Math.random() * 6.28;
      z.wobble += dt * 1.4;
      z.x += Math.sin(z.wobble) * 8 * dt;
      z.x = Math.max(14, Math.min(this.W - 14, z.x));
      z.facing = Math.PI / 2;

      /* 撞上防线：防线掉血，僵尸消失 */
      if (z.y >= this.wallY) {
        this.hurtPlayer(z.dmg, z.n);
        z.dead = true; z.hp = 0;
        r.efx.push({ t: 'hitWall', x: z.x, y: this.wallY, life: 0.3, max: 0.3, r: 26 });
        if (window.SND) SND.play('hurt');
        continue;
      }

      /* 接触伤害（近身） */
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
      /* 防御：坐标/速度非有限值的一律作废。
       * 此前 bulletSpd 拼错导致 vx=NaN，而所有比较对 NaN 恒为 false，
       * 子弹既不出界也不被剔除，还会“命中”僵尸 —— 静默且极难排查。 */
      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.vx) || !isFinite(b.vy)) { b.life = 0; continue; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -20 || b.x > this.W + 20 || b.y < -20 || b.y > this.H + 20) b.life = 0;
      if (b.life <= 0) continue;
      /* 子弹击中障碍物/油桶（表28） */
      const ob = this.hitObstacle(b.x, b.y);
      if (ob) {
        if (ob.t === 'barrel') {
          ob.o.hp -= b.dmg;
          if (ob.o.hp <= 0) this.blowBarrel(ob.o);
          else this.addFloat(b.x, b.y, Math.round(b.dmg), 'dmg');
        } else {
          ob.o.hp -= b.dmg;
          this.addFloat(b.x, b.y, Math.round(b.dmg), 'dmg');
          if (ob.o.hp <= 0) { ob.o.dead = true; this.addFloat(ob.o.x, ob.o.y, '碎裂', 'dmg'); }
        }
        if (b.pierce <= 0) { b.life = 0; continue; }
        b.pierce--;
      }
      for (const z of r.zombies) {
        if (z.dead) continue;
        if (b.hit.indexOf(z) >= 0) continue;
        if (Math.hypot(z.x - b.x, z.y - b.y) > 18) continue;
        b.hit.push(z);
        let dmg = b.dmg;
        /* z.def 已统一在 hurt() 内应用（对所有伤害来源生效），此处不再重复 */
        if (z.front) {
          const a = Math.atan2(b.y - z.y, b.x - z.x);
          let diff = Math.abs(a - z.facing); while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
          if (diff < 1.1) dmg *= (1 - z.front);
        }
        this.hurt(z, dmg, Math.random() < r.crit, '物');
        /* 分裂子弹（被动 fenliezidan）：命中后向两侧散射 N 枚子弹。
         * isSplit 守卫避免分裂出的子弹再次分裂导致指数爆炸；
         * 上限 8 枚，防止 Lv10（split=20）时同屏子弹数失控。 */
        if (r.mods.split > 0 && !b.isSplit) {
          const n = Math.min(8, Math.round(Number(r.mods.split) || 0));
          const base = Math.atan2(b.vy, b.vx);
          for (let i = 0; i < n; i++) {
            const ang = base + (i - (n - 1) / 2) * 0.42;
            r.bullets.push({
              x: z.x, y: z.y, vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520,
              dmg: b.dmg * 0.55, pierce: 0, life: 0.8, hit: [z],
              from: 'split', el: b.el || '物', isSplit: true, explode: 0, er: 0,
            });
          }
        }
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
      /* 掉落穿透兜底：掉落物只会向下飘（40px/s），若横向离玩家较远，
       * 它会一路落到玩家下方并飞出屏幕 —— 磁吸半径 90 失效后永远捡不到，
       * 一局几百次击杀的素材就这么白白蒸发，且战斗结束也不补发。
       * 这里改成：只要落过玩家所在高度就强力回收，不再让它飞走。 */
      if (d.y > r.py + 20) {
        const n = Math.max(1, dd);
        d.x += dx / n * 900 * dt; d.y += dy / n * 900 * dt;
      }
      if (dd < 26) { this.pick(d); d.get = 1; }
    }
    r.drops = r.drops.filter((d) => !d.get);

    /* --- 波次推进 ---
     * 原逻辑：必须当前波「全部清空」才推进下一波。
     * 问题：20 波 × 15 只，一关要打 20 分钟以上，且只要有 1 只
     *       僵尸卡在射程外（远程/飞行）整关就永不推进。
     * 改为：清空 或 波次超时 任一满足即推进（真实尸潮是持续压上的） */
    r.waveT = (r.waveT || 0) + dt;
    const waveTimeout = r.waveT >= (r.waveMaxT || 20);
    if ((r.spawnLeft === 0 && r.zombies.length === 0) || waveTimeout) {
      if (r.wave >= r.waveTotal) {
        /* 最后一波：仍需清完场上僵尸才算通关 */
        if (r.zombies.length === 0) { this.win(); return; }
        /* 死锁修复：远程/飞行僵尸会停在射程外（atkR > 玩家射程 380）持续攻击，
         * 玩家永远打不到它 → 场上僵尸数恒 > 0 → 永远无法 win。
         * 实测 1-5 防线满血 2076/2076 却判负，就是这个原因。
         * 兜底：最后一波超时 25 秒后强制清场通关；
         * 但 BOSS 存活时不触发（BOSS 必须打死，否则靠防线破判负）。 */
        const bossAlive = r.zombies.some((z) => z.isBoss && !z.dead);
        if (!bossAlive) {
          r.lastWaveT = (r.lastWaveT || 0) + dt;
          if (r.lastWaveT > 25) { r.zombies.length = 0; this.win(); return; }
        }
      } else {
        r.lastWaveT = 0;
        r.waveT = 0;
        if (r.endless) { this.startWave(r.wave + 1); return; }
        r.waveGap -= dt;
        if (r.waveGap <= 0 || waveTimeout) { this.startWave(r.wave + 1); r.waveGap = 1.4; }
      }
    } else r.waveGap = 1.4;

    /* --- 无尽模式持续加压 --- */
    if (r.endless && r.spawnLeft === 0 && r.zombies.length === 0) this.startWave(r.wave + 1);
  },

  /* ---------------- BOSS ---------------- */
  bossTick(z, dt, dist) {
    const r = this.run, d = z.bossDef;
    const ratio = z.hp / z.maxHp;
    const th = (d.skills || []).filter((sk) => typeof sk.trig === 'number');
    for (let i = 0; i < th.length; i++) {
      if (ratio <= th[i].trig && z.phase <= i) {
        z.phase = i + 1;
        r.efx.push({ t: 'warn', x: z.x, y: z.y, r: 200, life: 0.8, max: 0.8 });
        UI.toast('⚠️ ' + d.n + ' 进入第 ' + z.phase + ' 阶段：' + th[i].n, 'boss');
        this.bossCast(z, th[i], i + 1);
      }
    }
  },

  /* BOSS 阶段技能的实际效果
   * BUG：8 个 BOSS 共 24 个技能，此前只按名字精确匹配了 3 个
   *（召唤小怪 / 孢子喷吐 / 狂暴），其余 21 个（铲斗横扫、产卵、
   *  地面震击、深渊召唤、亡者复苏、瘟疫领域…）全部只弹一句提示，
   *  没有任何实际效果。而且「尸王狂暴」「狂暴免疫」这类变体名
   *  连"狂暴"都匹配不上，导致后期 BOSS 的狂暴也从未触发。
   * 现在按关键词归类实现，所有技能名都能落到具体效果。 */
  bossCast(z, sk, phase) {
    const r = this.run;
    const n = sk.n || '';
    const hpMul = (r.def && r.def.mul) || 1;      /* 注意：levels 里是 mul，不是 hpMul */

    /* 召唤 / 孵化类：产卵、亡者复苏、深渊召唤、召唤小怪 */
    if (/召唤|复苏|产卵|孵化/.test(n)) {
      const cnt = 4 + phase * 2;
      const pool = /产卵|孵化/.test(n) ? 'xiaozombie' : 'putong';
      for (let k = 0; k < cnt; k++) {
        const dd = EX.zombies.find((x) => x.id === pool) || EX.zombies[0];
        const nz = this.mkZ(dd, hpMul);
        nz.x = z.x + (Math.random() - 0.5) * 110;
        nz.y = z.y + (Math.random() - 0.5) * 80;
        if (/产卵/.test(n)) { nz.x = z.x + (Math.random() - 0.5) * 90; nz.y = z.y + (Math.random() - 0.5) * 90; }
        r.zombies.push(nz);
      }
      return;
    }

    /* 孢子 / 喷吐类：分裂出小僵尸 */
    if (/孢子|喷吐|酸液|呕吐|腐蚀/.test(n)) {
      const cnt = 3 + phase;
      for (let k = 0; k < cnt; k++) {
        const dd = EX.zombies.find((x) => x.id === 'xiaozombie') || EX.zombies[0];
        const nz = this.mkZ(dd, hpMul);
        nz.x = z.x + (Math.random() - 0.5) * 100;
        nz.y = z.y + (Math.random() - 0.5) * 90;
        r.zombies.push(nz);
      }
      /* 酸液/呕吐额外留下腐蚀池 */
      if (/酸液|呕吐|腐蚀/.test(n)) {
        for (let k = 0; k < 2; k++) {
          r.pools.push({
            x: r.px + (Math.random() - 0.5) * 200, y: r.py - 40 + (Math.random() - 0.5) * 60,
            r: 52, dps: z.dmg * 0.5, life: 4 + phase, max: 4 + phase,
          });
        }
      }
      return;
    }

    /* 狂暴类：攻速移速提升；含"免疫"则额外免疫减速 */
    if (/狂暴|免疫/.test(n)) {
      z.spd *= 1.5; z.dmg *= 1.35; z.atkCd = 0;
      if (/免疫/.test(n)) z.immuneSlow = true;
      return;
    }

    /* 震击 / 领域 / 仪式类：全屏冲击，击退僵尸并震伤 */
    if (/震击|领域|仪式|暗红/.test(n)) {
      r.efx.push({ t: 'nova', x: z.x, y: z.y, r: 260, life: 0.7, max: 0.7, el: '物' });
      for (const o of r.zombies) {
        if (o.dead || o === z) continue;
        const a = Math.atan2(o.y - z.y, o.x - z.x);
        const dd2 = Math.hypot(o.x - z.x, o.y - z.y);
        if (dd2 < 260) { o.x += Math.cos(a) * 40; o.y += Math.sin(a) * 40; }
      }
      /* 瘟疫/暗红仪式额外留下毒领域 */
      if (/瘟疫|暗红/.test(n)) {
        for (let k = 0; k < 3; k++) {
          r.pools.push({
            x: r.px + (Math.random() - 0.5) * 240, y: r.py - 30 + (Math.random() - 0.5) * 70,
            r: 58, dps: z.dmg * 0.6, life: 5, max: 5,
          });
        }
      }
      this.hurtPlayer(z.dmg * 0.35, n);
      return;
    }

    /* 其余 contact 类（巨爪拍击/铲斗横扫/暗影镰斩/吞噬/诅咒之杖/巨剑斩击）
     * 在接触时由 hurtPlayer 分支增强，此处给一次阶段性强化 */
    z.dmg *= 1.2;
    z.atkR *= 1.15;
    return;
  },


  blast(pos, radius, dmg, el) {
    const r = this.run; if (!r) return;
    /* BUG：此处写的是 this.efx，但 BT 上根本没有 efx 属性（特效数组是 run.efx）
     * → 一旦调用就抛 TypeError: Cannot read properties of undefined (reading 'push')
     * 实测确认：BT.efx === undefined，BT.blast(...) 直接抛错。
     * 目前 blast() 无调用者（爆炸走内联实现），但这是颗地雷，改为 r.efx。 */
    r.efx.push({ t: 'boom', x: pos.x, y: pos.y, r: radius, life: 0.36, max: 0.36, el: el || '火' });
    if (window.SND) SND.play('explode');
    for (const z of r.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - pos.x, z.y - pos.y);
      if (d <= radius) this.hurt(z, dmg * (1 - d / radius * 0.4), false, el);
    }
  },

  /* 通用子弹生成（玩家/炮台/佣兵共用） */
  /* 通用子弹生成（玩家/炮台/佣兵共用） */
  spawnBullet(x, y, tg, dmg, opt = {}) {
    const r = this.run;
    const a = Math.atan2(tg.y - y, tg.x - x);
    const spd = 520;
    r.bullets.push({
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      dmg, pierce: opt.pierce || 0, life: 1.3, hit: [],
      from: opt.from || 'player', el: opt.el || '物',
      explode: 0, er: 0,
    });
  },

  /* 建造/升级炮台（局内金币） */
  buildTurret(slotKey, turretId) {
    const r = this.run; if (!r) return { ok: false, msg: '未进入战斗' };
    /* 局内金币异常（NaN/负数）时按 0 处理
     * 此前 r.coin 因 rwMul 缺失变成 NaN，而 `NaN < cost` 恒为 false，
     * 导致建造/升级既不扣钱也不报错 —— 炮台可以无限白嫖。
     * 这里加一道防护，避免同类问题再次静默放行。 */
    if (r.coin == null || !isFinite(r.coin) || r.coin < 0) r.coin = 0;
    const def = EX.turrets.find((t) => t.id === turretId); if (!def) return { ok: false, msg: '炮台不存在' };
    const slot = EX.turretSlots.find((s) => s.k === slotKey); if (!slot) return { ok: false, msg: '槽位不存在' };
    const exist = r.turrets.find((t) => t.k === slotKey);
    if (exist) {
      const cost = Math.round(def.upCost * (1 + exist.lv * 0.6));
      if (r.coin < cost) return { ok: false, msg: EX.tip('popup.noCoin', { v: cost }) };
      r.coin -= cost; exist.lv++;
      return { ok: true, msg: '⬆ ' + def.n + ' 升至 Lv.' + exist.lv };
    }
    if (r.coin < def.cost) return { ok: false, msg: EX.tip('popup.noCoin', { v: def.cost }) };
    r.coin -= def.cost;
    r.turrets.push({ k: slotKey, def, lv: 1, cd: 0,
      x: this.W * slot.x, y: this.H * slot.y });
    return { ok: true, msg: '🔧 已建造 ' + def.n };
  },

  /* 释放主动技能 */
  castSkill(id) {
    const r = this.run; if (!r) return { ok: false, msg: '未进入战斗' };
    const lv = r.skills[id] || 0; if (!lv) return { ok: false, msg: '尚未学习该技能' };
    const def = EX.skills.find((x) => x.id === id); if (!def) return { ok: false, msg: '技能不存在' };
    /* BUG：此处原写 def.kind !== 'periodic'，而配置里根本没有 periodic 这个 kind
     * （实际只有 active / summon / passive）→ 全部 18 个技能一律被判为"被动"，
     * 包括 9 个 active 和 2 个 summon。玩家点技能按钮只看到"为被动技能，自动生效"，
     * 实际什么都没发生。现在按真实 kind 判断。 */
    if (def.kind === 'passive') return { ok: false, msg: def.n + ' 为被动技能，自动生效' };
    if ((r.cd[id] || 0) > 0) return { ok: false, msg: def.n + ' 冷却中 ' + r.cd[id].toFixed(1) + 's' };
    r.cd[id] = (def.cd || 5) * (1 - Math.min(0.4, (lv - 1) * 0.06));   /* 每级 -6% 冷却 */
    const m = def.mods || {};
    if (window.SND) SND.play(def.el === '火' ? 'explode' : def.el === '冰' ? 'pick' : 'crit');

    /* 技能伤害总系数（EX.SKILL_DMG_K）：修复 11 个技能后统一校准强度，
     * 详见 config.js 注释。缺省为 1，不改变历史行为。 */
    const dmgBase = (r.atk || 1) * (r.def.rwMul || 1) * (EX.SKILL_DMG_K != null ? EX.SKILL_DMG_K : 1);
    let hit = 0;

    if (id === 'wenyadan') {
      /* 温压弹：以玩家为中心大范围爆炸 */
      const rad = m.blastR * (1 + (lv - 1) * 0.08);
      const dmg = dmgBase * m.blastMul * (1 + (lv - 1) * 0.15);
      r.efx.push({ t: 'nova', x: r.px, y: r.py, r: rad, life: 0.5, max: 0.5, el: '火' });
      for (const z of r.zombies) {
        if (z.dead) continue;
        if (Math.hypot(z.x - r.px, z.y - r.py) <= rad) { this.hurt(z, dmg, true, '火'); hit++; }
      }
      return { ok: true, msg: '温压弹：命中 ' + hit + ' 只' };
    }

    if (id === 'ganbingdan') {
      /* 干冰弹：范围内僵尸冻结 */
      const rad = m.freezeR * (1 + (lv - 1) * 0.07);
      const dur = m.freeze * (1 + (lv - 1) * 0.12);
      r.efx.push({ t: 'nova', x: r.px, y: r.py, r: rad, life: 0.5, max: 0.5, el: '冰' });
      for (const z of r.zombies) {
        if (z.dead) continue;
        if (Math.hypot(z.x - r.px, z.y - r.py) <= rad) { z.slow = 1; z.slowT = dur; hit++; }
      }
      return { ok: true, msg: '干冰弹：冻结 ' + hit + ' 只（' + dur.toFixed(1) + 's）' };
    }

    if (id === 'diancichuan') {
      /* 电磁穿刺：向最近目标方向穿透一条直线 */
      const tg = this.nearest(r.px, r.py, null, 9999);
      const ang = tg ? Math.atan2(tg.y - r.py, tg.x - r.px) : -Math.PI / 2;
      const n = Math.round(m.pierceN * (1 + (lv - 1) * 0.1));
      const dmg = dmgBase * m.chainMul * (1 + (lv - 1) * 0.12);
      r.efx.push({ t: 'beam', x: r.px, y: r.py, a: ang, len: 620, life: 0.35, max: 0.35, el: '电' });
      for (const z of r.zombies) {
        if (z.dead || hit >= n) continue;
        const da = Math.abs(Math.atan2(z.y - r.py, z.x - r.px) - ang);
        if (Math.min(da, Math.PI * 2 - da) < 0.13) { this.hurt(z, dmg, true, '电'); hit++; }
      }
      return { ok: true, msg: '电磁穿刺：贯穿 ' + hit + ' 只' };
    }

    if (id === 'xuanfengjianong') {
      /* 旋风加农：生成吸附旋风，持续切割 */
      const rad = m.vortexR * (1 + (lv - 1) * 0.08);
      r.zones.push({ t: 'vortex', x: r.px + 140, y: r.py - 40, r: rad,
        dps: dmgBase * m.vortexDps * (1 + (lv - 1) * 0.14), life: 5 + lv * 0.4,
        max: 5 + lv * 0.4, el: '风' });
      return { ok: true, msg: '旋风加农：生成旋风' };
    }

    if (id === 'zhidaojiguang') {
      /* 制导激光：锁定最近僵尸持续灼烧 */
      const tg = this.nearest(r.px, r.py, null, 9999);
      if (!tg) return { ok: false, msg: '附近没有目标' };
      r.zones.push({ t: 'laser', target: tg,
        dps: dmgBase * m.laserDps * (1 + (lv - 1) * 0.15), life: m.laserDur,
        max: m.laserDur, el: '电' });
      return { ok: true, msg: '制导激光：锁定目标' };
    }

    if (id === 'ranyoudan') {
      /* 燃油弹：地面持续燃烧区域 */
      const rad = m.burnR * (1 + (lv - 1) * 0.08);
      r.zones.push({ t: 'burn', x: r.px + 130, y: r.py + 10, r: rad,
        dps: dmgBase * m.burnDps * (1 + (lv - 1) * 0.13), life: 6 + lv * 0.5,
        max: 6 + lv * 0.5, el: '火' });
      return { ok: true, msg: '燃油弹：地面燃烧' };
    }

    if (id === 'gaonengshexian') {
      /* 高能射线：贯穿射线，对高血量目标额外增伤 */
      const n = Math.round(m.rayPierce * (1 + (lv - 1) * 0.08));
      const dmg = dmgBase * m.rayMul * (1 + (lv - 1) * 0.14);
      const tg = this.nearest(r.px, r.py, null, 9999);
      const ang = tg ? Math.atan2(tg.y - r.py, tg.x - r.px) : -Math.PI / 2;
      r.efx.push({ t: 'beam', x: r.px, y: r.py, a: ang, len: 700, life: 0.45, max: 0.45, el: '电' });
      for (const z of r.zombies) {
        if (z.dead || hit >= n) continue;
        const da = Math.abs(Math.atan2(z.y - r.py, z.x - r.px) - ang);
        if (Math.min(da, Math.PI * 2 - da) < 0.16) {
          const bonus = z.maxHp > dmgBase * 8 ? 1.5 : 1;   /* 高血量目标额外增伤 */
          this.hurt(z, dmg * bonus, true, '电'); hit++;
        }
      }
      return { ok: true, msg: '高能射线：贯穿 ' + hit + ' 只' };
    }

    if (id === 'hongzhaji') {
      /* 轰炸机：全场多次轰炸 */
      const n = Math.round(m.bombN * (1 + (lv - 1) * 0.1));
      for (let i = 0; i < n; i++) {
        const bx = 60 + Math.random() * (this.W - 120);
        const by = 150 + Math.random() * (this.H - 340);
        const dmg = dmgBase * m.bombMul * (1 + (lv - 1) * 0.12);
        r.zones.push({ t: 'bomb', x: bx, y: by, r: 95, dps: 0, burst: dmg,
          delay: i * 0.22, life: 0.6 + i * 0.22, max: 0.6 + i * 0.22, el: '火' });
      }
      return { ok: true, msg: '轰炸机：' + n + ' 次轰炸' };
    }

    if (id === 'bingbao') {
      /* 冰暴发生器：全场大幅减速并持续伤害
       * 注：原代码里写的是 id === 'bingshuang'，而配置里根本没有这个 id，
       *     所以这段实现从来没被触发过。 */
      const rad = m.stormR * (1 + (lv - 1) * 0.08);
      r.zones.push({ t: 'storm', x: r.px + 100, y: r.py - 30, r: rad,
        dps: dmgBase * m.stormDps * (1 + (lv - 1) * 0.14), slow: 0.65,
        life: 4.5 + lv * 0.4, max: 4.5 + lv * 0.4, el: '冰' });
      return { ok: true, msg: '冰暴发生器：冰暴降临' };
    }

    /* ---- 召唤类 ---- */
    if (def.kind === 'summon') {
      const type = m.summon;
      const durT = (m.dur || 8) * (1 + (lv - 1) * 0.1);
      const cnt = type === 'drone' ? Math.min(4, 1 + Math.floor((lv - 1) / 2)) : 1;
      for (let i = 0; i < cnt; i++) {
        const sdef = {
          rng: type === 'drone' ? 190 : 150,
          rate: type === 'drone' ? 2.2 : 1.4,
          dmg: (type === 'drone' ? 0.55 : 1.35) * dmgBase,
          id: type === 'drone' ? 'SUM_DRONE' : 'SUM_CAR',
          n: type === 'drone' ? '无人机' : '装甲车',
        };
        r.mercs.push({
          def: sdef, isSummon: true, life: durT,
          x: r.px + (type === 'drone' ? -60 + i * 45 : 120),
          y: r.py - (type === 'drone' ? 46 + i * 10 : 0),
          cd: 0,
        });
      }
      return { ok: true, msg: def.n + '：召唤 ' + cnt + ' 个（' + durT.toFixed(0) + 's）' };
    }

    return { ok: true, msg: def.n + ' 释放' };
  },

  shoot(tg) {
    const r = this.run;
    if (r.mag <= 0) return;
    r.mag--;
    const base = Math.atan2(tg.y - r.py, tg.x - r.px);
    const n = Math.max(1, Math.round(Number(r.pellets || 1) + Number(r.spread || 0) + Number(r.mods.spread || 0)));
    const g = E.gun(this.P);
    const A = E.attrs(this.P) || {};
    let dmg = (Number(r.atk) || 1) * (1 + Number(r.mods.dmgMul) || 0);
    /* 伤害浮动区间（表44：如突击步枪 22-28） */
    if (r.dmgMin != null && r.dmgMax != null && r.dmgMax > r.dmgMin) {
      dmg = r.dmgMin + Math.random() * (r.dmgMax - r.dmgMin);
      dmg *= (1 + Number(r.mods.dmgMul) || 0);
    }
    /* 消耗品 I03 攻击增幅药剂：攻击 +30% 持续 30 秒 */
    if (r.buffAtk > 0 && r.buffAtkT > 0) dmg *= (1 + r.buffAtk);
    /* 双倍伤害词条 AF11 */
    if (A.doubleChance && Math.random() < A.doubleChance) { dmg *= 2; r._dbl = true; }
    else r._dbl = false;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.13;
      const a = base + off + (Math.random() - 0.5) * 0.05;
      /* 子弹速度：武器表字段是 bspd（400~1400），此前写成 g.bulletSpd
       * —— 该字段在配置里根本不存在，结果 vx/vy 全为 NaN。
       * NaN 的两重危害：
       *   ① 画面上看不到子弹（canvas 忽略 NaN 坐标），玩家开枪像没反应；
       *   ② `Math.hypot(z.x-NaN,…) > 18` 恒为 false → 判定“命中”，
       *      子弹无视距离直接打到僵尸，武器 range/bspd 的差异化全部失效。 */
      const bs = (isFinite(g.bspd) && g.bspd > 0) ? g.bspd : 520;
      r.bullets.push({
        x: r.px, y: r.py - 6, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs,
        dmg, pierce: r.pierce + r.mods.pierce, life: 1.4, hit: [],
        explode: g.explode || r.mods.explode, er: g.er || r.mods.er || 46,
      });
    }
    if (r.mag <= 0) this.reload();
  },

  /* 战斗中切换武器后同步武器数值
   * BUG：战斗中的「🔄 切换」按钮此前只弹一句 toast，不切换任何东西
   * （真正的切换入口 E.switchGun 只在武器库面板里）。而 run 的 atk/rate/
   * mag 等都在 start 时快照，切换武器后必须重算，否则换枪不换数值。 */
  refreshGun() {
    const r = this.run; if (!r || !this.P) return;
    const a = E.attrs(this.P);
    r.atk = a.atk; r.rate = a.rate; r.range = a.range; r.pierce = a.pierce;
    r.spread = a.spread; r.pellets = a.pellets || 1; r.crit = a.crit;
    r.critDmg = a.critDmg; r.moveSpd = a.moveSpd;
    r.dmgMin = a.dmgMin; r.dmgMax = a.dmgMax; r.ls = a.ls;
    r.erMul = a.erMul; r.reloadCut = a.reloadCut;
    r.mag = a.mag; r.magMax = a.mag;
    r.reloading = false; r.reloadT = 0; r.shootT = 0;
  },

  reload() {
    const r = this.run; if (!r || r.reloading || r.mag >= r.magMax) return;
    r.reloading = true;
    /* 换弹时间：军械库加成 + 词条 AF08 换弹-0.2秒 */
    let _rt = E.gun(this.P).reload * (1 - Math.min(0.4, (this.P.build?.armory || 0) * 0.01));
    _rt = Math.max(0.3, _rt - (r.reloadCut || 0));
    r.reloadT = _rt;
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
    /* 表20 公式2：暴击 = 基础 × (1 + 暴击伤害%) */
    let d = dmg * (1 + (crit ? r.critDmg : 0));
    /* 单位减伤率（怪物表 def / BOSS def）：对所有伤害来源统一生效。
     * 此前只在"子弹命中"这一条路径上应用 z.def，技能/爆炸/闪电链/
     * 燃烧/毒池/油桶等 10 处伤害来源全部绕过 → BOSS 的 def(0.2~0.4)
     * 与重甲僵尸 def(0.55) 对技能形同虚设。 */
    const defR = Number(z.def || 0);
    if (defR > 0) d = d * (1 - defR);
    /* 表20 公式3：最终伤害 = 基础伤害 - 怪物护甲（最低造成 1 点）
     * 此前怪物表无 armor 字段，护甲减伤完全未生效 */
    const armor = Number((z.d && z.d.armor) || 0);
    if (armor > 0) d = Math.max(1, d - armor);
    /* 表20 公式5：吸血 = 最终伤害 × 吸血% */
    const ls = Number(r.ls || 0);
    if (ls > 0 && r.wallHp != null && r.wallMax) {
      r.wallHp = Math.min(r.wallMax, r.wallHp + d * ls);
      r.hp = r.wallHp;
    }
    z.hp -= d;
    /* 技能伤害统计（截图51：突击步枪/干冰弹/温压弹/电磁穿刺…） */
    if (r.skillDmg) {
      const k = src || 'gun';
      r.skillDmg[k] = (r.skillDmg[k] || 0) + d;
    }
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
    /* 真实玩法：伤害打在防线血量上，漏怪突破 → 防线归零 → 失败 */
    /* 玩家护甲减伤（角色基础 + 天赋 + 芯片 + 皮肤）
     * 严重BUG：attrs().armor 此前全项目零消费 —— 实测把角色护甲设成
     * 0 / 50 / 200，防线掉血都是 100，一模一样。
     * 护甲天赋(max20) / 护甲芯片(CH03) / 护甲皮肤(装甲骑士+20% 等) /
     * 角色表 armor 字段，四条养成线全是「涨数字不涨实力」；
     * 而战力还因「天赋点数×90」虚涨 1800，玩家更难察觉。
     * 用收益递减公式（上限 50%），避免高护甲直接免疫。 */
    const ar = Number(r.armor || 0);
    if (ar > 0) d = Math.max(1, d * (1 - Math.min(0.5, ar / (ar + 120))));
    r.wallHp = Math.max(0, (r.wallHp != null ? r.wallHp : r.hp) - d);
    r.hp = r.wallHp;
    r.hitFlash = 0.18;
    this.addFloat(r.px, r.py - 26, '-' + Math.round(dmg), 'hurt');
    if (window.SND) SND.play('hurt');
    if (r.wallHp <= 0) { r.wallHp = 0; r.hp = 0; this.onLose(); }
  },

  kill(z) {
    const r = this.run; if (z.dead) return;
    z.dead = true; r.kills++;
    /* 表37 埋点：kill_monster */
    try { OPS.track('kill_monster', { z: z.id || z.n }); } catch (e) {}
    if (r.kills === 1 && window.UI && UI.guideTrigger) UI.guideTrigger('firstKill');
    const heal = r.mods.healOnKill;
    if (heal > 0 && r.hp < r.maxHp) r.hp = Math.min(r.maxHp, r.hp + heal);
    const gAdd = Math.round(z.gold * (1 + E.talentVal(this.P, 'gold')));
    r.gold += gAdd;
    r.coin = (r.coin || 0) + gAdd;   /* 局内金币：用于建造/升级炮台 */
    /* 经验加成天赋此前只作用于 pick()（拾取掉落），
     * 而击杀这条主要经验来源走的是 gainXp(z.xp)，完全没乘天赋
     * → 实测天赋 Lv0 与 Lv20 击杀经验都是 4，点满 20 级毫无收益。 */
    this.gainXp(Math.max(1, Math.round((z.xp || 2) * (1 + E.talentVal(this.P, 'xp')))));
    if (z.d.split) {
      const dd = EX.zombies.find((x) => x.id === 'xiaozombie');
      for (let i = 0; i < z.d.split; i++) {
        const nz = this.mkZ(dd, (r.def && r.def.mul) || 1);
        nz.x = z.x + (Math.random() - 0.5) * 30; nz.y = z.y + (Math.random() - 0.5) * 30;
        r.zombies.push(nz);
      }
    }
    if (z.ai === 'boomer' && z.d.id !== 'zibao') this.boom(z);
    /* 表45 全局掉落掉率明细：按怪物来源精确掉落
     * 新增章节阶梯：globalDrops 的 ch 字段是「第几章起才掉」，此前全项目零引用
     * → 第 1 章打精英僵尸也会掉后期才该出现的稀有金属/角色碎片。
     * 现在按当前章节过滤，同一 item 取「已解锁的最高档」，低档自动被覆盖。 */
    const srcName = z.isBoss ? ('BOSS' + (z.bossDef ? z.bossDef.n : (z.d.n || ''))) : (z.d.n || '');
    const curCh = (r.def && r.def.ch) || (r.ch || 1);
    const table = EX.dropFor(srcName, curCh);
    const got = [];
    for (const d of table) {
      /* 首杀必掉 */
      const firstKill = d.first && !(this.P.firstBossDrop || {})[srcName + d.item];
      if (firstKill || Math.random() < d.rate) {
        if (firstKill) { this.P.firstBossDrop = this.P.firstBossDrop || {}; this.P.firstBossDrop[srcName + d.item] = 1; }
        const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        got.push({ item: d.item, n: n });
      }
    }
    if (got.length) {
      r.drops.push({ x: z.x, y: z.y, xp: 0, gold: 0, items: got });
    } else {
      r.drops.push({ x: z.x, y: z.y, xp: z.xp || 0, gold: 0 });
    }
    /* 图鉴解锁（表29：首次击杀解锁怪物图鉴） */
    if (window.E && E.codexUnlock) {
      const u = E.codexUnlock(this.P, 'zombie', z.id);
      if (u.ok && window.UI) UI.toast(u.msg, 'ok');
    }
  },

  boom(z) {
    const r = this.run;
    if (z._boomed) return;
    z._boomed = true;
    r.efx.push({ t: 'boom', x: z.x, y: z.y, r: 72, life: 0.4, max: 0.4 });
    if (Math.hypot(r.px - z.x, r.py - z.y) < 72) this.hurtPlayer(z.dmg, z.n);
    /* 自爆僵尸贴脸自爆时此前只置 dead=true，不走 kill()
     * → 不计入击杀数、不给金币/经验、不触发掉落：
     * 玩家明明把它打"没了"却颗粒无收，还挨了一次爆炸伤害。
     * 现在统一走 kill() 发放奖励；kill() 内对 zibao 不会回调 boom
     * （_boomed 守卫 + z.d.id !== 'zibao' 判断），不会递归。 */
    if (!z.dead) this.kill(z);
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
    /* 表45：掉落物品入包 */
    if (d.items && d.items.length && this.P) {
      this.P.mat = this.P.mat || {};
      const txt = [];
      d.items.forEach((it) => {
        /* 严重 BUG 修复：掉落表里的芯片写的是品质码 C01/C02/C03
         * （白/精英/传说，见 config drops 的 q 字段），
         * 但这里无条件写进 p.mat['C01'] —— 而【芯片真实存放在 p.bag】，
         * 芯片面板只读 p.bag。
         * 结果：8 个 BOSS 共 20+ 条芯片掉落，玩家打完 BOSS 飘字显示
         * 「芯片+1」，实际芯片页永远 0 颗，既不能装备也不能合成。
         * 现在按品质码生成真实芯片推进 p.bag。 */
        const qmap = { C01: '白', C02: '蓝', C03: '红' };
        if (qmap[it.item] && window.E && E.giveChipByQuality) {
          for (let i = 0; i < it.n; i++) E.giveChipByQuality(this.P, qmap[it.item]);
          txt.push('芯片+' + it.n);
          return;
        }
        this.P.mat[it.item] = (this.P.mat[it.item] || 0) + it.n;
        txt.push((E.itemName ? E.itemName(it.item) : it.item) + '+' + it.n);
      });
      this.addFloat(d.x, d.y - 12, txt.join(' '), 'gold');
      if (window.SND) SND.play('pickup');
    }
  },

  gainXp(v) {
    const r = this.run;
    r.xp += v;
    while (r.xp >= r.xpNeed) {
      r.xp -= r.xpNeed; r.lv++;
      r.xpNeed = Math.round(r.xpNeed * 1.28 + 6);
      /* 升级弹窗（截图52）+ 奖励 R币 */
      if (window.UI && UI.showLvUp) UI.showLvUp(r.lv, 200);
      if (window.UI && UI.guideTrigger) UI.guideTrigger('firstUpgrade');
      if (this.P) { this.P.gold = (this.P.gold || 0) + 200; }
      /* 严重BUG：此前每升一级立刻 offerSkills()，
       * 一次吃掉大量经验连升 5 级就会连调 5 次：
       *  ① this._picks 被后一次覆盖 → 玩家只能看到最后 1 组候选，
       *     另外 4 次升级的技能选择被静默吞掉（实测连升5级只给1次选择）；
       *  ② UI.showSkillChoice 连调 5 次，倒计时 interval 被反复 clear 重设，
       *     只剩最后一个计时器在跑。
       * 改为累计待选次数，循环结束后只弹一次；选完若还有待选次数再弹下一次。 */
      this._pendingOffers = (this._pendingOffers || 0) + 1;
    }
    if (this._pendingOffers > 0 && !this.paused) this.flushOffers();
  },
  /* 弹出一次技能三选一；若无候选则消耗掉这次机会，避免卡住 */
  flushOffers() {
    if (!this._pendingOffers || this._pendingOffers <= 0) return;
    this._pendingOffers--;
    const before = Object.keys(this.run ? this.run.skills : {}).length;
    this.offerSkills();
    /* 候选池为空（技能已满/全互斥）时 offerSkills 直接 return 且不暂停，
     * 此时要把剩余待选次数继续消化掉，否则玩家一直等一个不会出现的弹窗 */
    if (!this.paused && this._pendingOffers > 0) {
      const after = Object.keys(this.run ? this.run.skills : {}).length;
      if (after === before) { this.flushOffers(); return; }
      /* 极端情况兜底：避免无限递归 */
      if (this._pendingOffers > 0) this._pendingOffers = 0;
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
    /* 表26 用例3(P0)：互斥技能不出现在同一选项
     * 在候选里剔除与已选中技能互斥的项，避免同屏出现冲突组合 */
    for (let i = 0; i < 3 && c.length; i++) {
      let pick = null;
      for (let guard = 0; guard < c.length; guard++) {
        const cand = c[Math.floor(Math.random() * c.length)];
        const clash = picks.some((p2) => p2.conflict === cand.id || cand.conflict === p2.id);
        if (!clash) { pick = cand; break; }
      }
      if (!pick) pick = c[Math.floor(Math.random() * c.length)];   /* 全冲突则兜底 */
      c.splice(c.indexOf(pick), 1);
      picks.push(pick);
    }
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
    /* 死代码已移除：原为 `if (id === 'hudun') { r.maxShield += 120; ... }`
     * 但 EX.skills 里根本没有 id 为 'hudun' 的技能（18 个技能见 config），
     * 该判断恒为 false，从未执行过一次。护盾的正规来源是 I02 护盾发生器
     * 与（未来的）stat:'shield' 天赋/芯片，走 applyItem / applyMods。 */
    UI.toast('✨ ' + EX.skills.find((s) => s.id === id).n + ' Lv.' + r.skills[id], 'ok');
    this.paused = false;
    /* 连升多级时，选完这一组后若还有未使用的升级次数，继续弹下一组 */
    if (this._pendingOffers > 0) {
      setTimeout(() => { if (this.run && !this.run.over) this.flushOffers(); }, 60);
    }
  },
  applyMods() {
    const r = this.run;
    r.mods = this.emptyMods();
    for (const id in r.skills) {
      const s = EX.skills.find((x) => x.id === id); if (!s) continue;
      /* 只把「被动」技能的 mods 累加为常驻加成。
       * 主动/召唤技能的 mods 是释放时用的专属字段（blastR、summon:'drone'…），
       * 此前被一并累加进来，导致：
       *   ① r.mods.summon = 'armored' * lv = NaN（字符串参与乘法）
       *   ② 主动效果被错误地当成永久被动叠加
       * 现在主动效果只在 castSkill 释放时读取 def.mods，不再混入 r.mods。 */
      if (s.kind !== 'passive') continue;
      const lv = r.skills[id];
      for (const k in s.mods) {
        const v = s.mods[k];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        r.mods[k] = (Number(r.mods[k]) || 0) + v * lv;
      }
    }
    /* Number() 兜底：r.shield 为 undefined/NaN 时 Math.max 会再次污染成 NaN */
    r.shield = Math.max(Number(r.shield) || 0, Number(r.mods.shield) || 0);
    r.maxShield = Math.max(Number(r.maxShield) || 0, Number(r.mods.shield) || 0);
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
  /* 结算地面残留掉落：一局几百次击杀，总有掉落物来不及被捡走，
   * 此前战斗一结束就直接丢弃，玩家打完了却拿不到素材。
   * 现在结束时统一补发（胜利全给，失败/退出给一半）。 */
  sweepDrops(ratio) {
    const r = this.run; if (!r || !r.drops) return 0;
    let n = 0;
    r.drops.forEach((d) => {
      if (d.get) return;
      d.get = 1;
      if (ratio >= 1) { this.pick(d); n++; return; }
      if (Math.random() < ratio) { this.pick(d); n++; }
    });
    r.drops = r.drops.filter((d) => !d.get);
    return n;
  },

  win() {
    const r = this.run; if (r.over) return;
    r.over = true; r.win = true;   /* r.win 此前从未赋值，外部无法判定胜负 */
    /* 表37 埋点：endless_time / level_finish */
    try { if (r.endless) OPS.track('endless_time', { t: Math.floor(r.time) }); } catch (e) {}
    this.sweepDrops(1);
    this.on = false; this.stopLoop();
    if (this.cb) this.cb('win', { kills: r.kills, time: r.time, rw: { gold: r.gold, diamond: 0 }, lv: r.lv });
  },
  onLose() {
    const r = this.run; if (r.over) return;
    if (r.reviveLeft > 0) {
      r.reviveLeft--;
      r.wallHp = r.wallMax != null ? r.wallMax : r.maxHp;
      r.hp = r.wallHp; r.shield = Number(r.maxShield) || 0;
      for (const z of r.zombies.slice()) {
        if (Math.hypot(z.x - r.px, z.y - r.py) < 190) z.dead = true;
      }
      r.zombies = r.zombies.filter((z) => !z.dead);
      UI.toast('💚 复活成功！剩余 ' + r.reviveLeft + ' 次', 'ok');
      return;
    }
    r.over = true; r.win = false; this.on = false; this.stopLoop();
    this.sweepDrops(0.5);
    if (this.cb) this.cb('lose', { kills: r.kills, time: r.time, rw: { gold: Math.floor(r.gold * 0.3), diamond: 0 }, lv: r.lv });
  },
  /* =========================================================
   * 表24 AD01 / 表26 用例5：看广告「原地」复活
   * 此前实现是 startBattle() 重开整关（波次/击杀/技能全清空），
   * 与文档"原地复活、满状态"不符。现在保留当前进度，仅恢复血量
   * ========================================================= */
  revive() {
    const r = this.run;
    if (!r) return { ok: false, msg: '当前无战斗' };
    r.over = false;
    r.wallHp = (r.wallMax != null ? r.wallMax : r.maxHp);
    r.hp = r.wallHp;
    r.shield = r.maxShield || 0;
    r.poison = 0; r.poisonT = 0;
    /* 清掉贴近防线的僵尸，避免复活瞬间再次被秒 */
    for (const z of r.zombies.slice()) {
      if (Math.hypot(z.x - (r.px || this.W / 2), z.y - (r.py || this.H - 58)) < 190) {
        z.dead = true;
        this.addFloat(z.x, z.y - 14, '清除', 'dmg');
      }
    }
    r.zombies = r.zombies.filter((z) => !z.dead);
    r.bullets.length = 0;
    r.mag = r.magMax; r.reloading = false; r.reloadT = 0;
    this.on = true;
    this.startLoop();
    return { ok: true, msg: '原地复活成功！防线已回满' };
  },

  quit() {
    const r = this.run; if (!r || r.over) return;
    r.over = true; this.on = false; this.stopLoop();
    this.sweepDrops(0.5);
    if (this.cb) this.cb('quit', { kills: r.kills, time: r.time, rw: { gold: Math.floor(r.gold * 0.5), diamond: 0 }, lv: r.lv });
  },
  resume() { this.paused = false; },

  /* =================================================
   * 绘制
   * ================================================ */
  /* ===== 2.5D 透视：近大远小 ===== */
  /* 消耗品增益计时（I03 攻击 +30% 持续 30 秒） */
  tickBuffs(dt) {
    const r = this.run; if (!r) return;
    if (r.buffAtkT > 0) {
      r.buffAtkT -= dt;
      if (r.buffAtkT <= 0) { r.buffAtkT = 0; r.buffAtk = 0; }
    }
  },

  depthScale(y) {
    const t = Math.max(0, Math.min(1, y / (this.wallY || this.H)));
    return 0.80 + Math.pow(t, 1.2) * 0.42;      /* 远处 0.80 倍 → 近处 1.22 倍（弱透视，贴近平视俯瞰） */
  },

  /* ===== 2.5D 透视地面网格 ===== */
  drawPerspGround(c) {
    const W = this.W, H = this.H, wall = this.wallY;
    const vanishY = H * 0.10, vanishX = W / 2;
    /* 横向线：远处密、近处疏（幂次分布制造纵深） */
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = vanishY + Math.pow(t, 1.9) * (wall - vanishY);
      const a = 0.05 + t * 0.22;
      c.strokeStyle = 'rgba(120,170,220,' + a.toFixed(3) + ')';
      c.lineWidth = t < 0.3 ? 0.6 : 1.1;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    /* 纵向线：从消失点向下发散 */
    for (let i = -7; i <= 7; i++) {
      const xT = vanishX + i * 6;
      const xB = vanishX + i * (W / 5.5);
      c.strokeStyle = 'rgba(120,170,220,0.13)';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(xT, vanishY); c.lineTo(xB, wall); c.stroke();
    }
    /* 地平线雾 */
    const g = c.createLinearGradient(0, vanishY - 10, 0, vanishY + H * 0.16);
    g.addColorStop(0, 'rgba(6,10,18,0.85)');
    g.addColorStop(1, 'rgba(6,10,18,0)');
    c.fillStyle = g; c.fillRect(0, vanishY - 10, W, H * 0.18);
  },

  /* ===== 贴地阴影（2.5D 关键） ===== */
  shadow(c, x, y, r, sc) {
    c.fillStyle = 'rgba(0,0,0,0.34)';
    c.beginPath();
    c.ellipse(x, y + r * 0.42 * sc, r * 0.62 * sc, r * 0.20 * sc, 0, 0, 7);
    c.fill();
  },

  /* 主动技能区域：燃烧/旋风/冰暴/轰炸范围 */
  drawZones(c) {
    const r = this.run; if (!r.zones) return;
    for (const zn of r.zones) {
      if (zn.t === 'laser') continue;
      if (zn.delay != null && zn.delay > 0) continue;
      const a = Math.max(0, Math.min(1, zn.life / (zn.max || 1)));
      const col = zn.el === '火' ? '255,122,60' : zn.el === '冰' ? '92,216,255'
                : zn.el === '电' ? '192,140,255' : '123,232,160';
      const g = c.createRadialGradient(zn.x, zn.y, 0, zn.x, zn.y, Math.max(1, zn.r));
      if (g) {
        g.addColorStop(0, 'rgba(' + col + ',' + (0.34 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        c.fillStyle = g;
      } else c.fillStyle = 'rgba(' + col + ',' + (0.2 * a).toFixed(3) + ')';
      c.beginPath(); c.arc(zn.x, zn.y, zn.r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(' + col + ',' + (0.6 * a).toFixed(3) + ')';
      c.lineWidth = 2; c.beginPath(); c.arc(zn.x, zn.y, zn.r, 0, 7); c.stroke();
    }
  },

  /* 炮台：底座 + 炮管指向目标 */
  drawTurrets(c) {
    const r = this.run;
    for (const t of r.turrets) {
      const el = EX.elements.find((x) => x.k === t.def.el) || { c: '#ffd76a' };
      const tg = this.nearest(t.x, t.y, null, t.def.rng + t.lv * 12);
      const a = tg ? Math.atan2(tg.y - t.y, tg.x - t.x) : -Math.PI / 2;
      /* 底座 */
      c.fillStyle = 'rgba(20,28,42,0.92)';
      c.beginPath(); c.arc(t.x, t.y, 15, 0, 7); c.fill();
      c.strokeStyle = el.c; c.lineWidth = 2;
      c.beginPath(); c.arc(t.x, t.y, 15, 0, 7); c.stroke();
      /* 炮管 */
      c.save(); c.translate(t.x, t.y); c.rotate(a);
      c.fillStyle = el.c; c.fillRect(4, -3.5, 20, 7);
      c.restore();
      /* 图标与等级 */
      c.font = '13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(t.def.icon, t.x, t.y - 1);
      c.font = '9px sans-serif'; c.fillStyle = '#ffd76a';
      c.fillText('Lv' + t.lv, t.x, t.y + 22);
    }
  },

  /* 佣兵 / 召唤物 */
  drawMercs(c) {
    const r = this.run;
    for (const m of r.mercs) {
      c.font = '20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(m.def.id === 'armored' ? '🚙' : m.def.id === 'drone' ? '🛸' : (m.def.icon || '🧍'),
        m.x, m.y);
      if (m.isSummon && m.life != null) {
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillRect(m.x - 12, m.y + 13, 24, 2.5);
        c.fillStyle = '#5cd8ff';
        c.fillRect(m.x - 12, m.y + 13, 24 * Math.max(0, Math.min(1, m.life / 10)), 2.5);
      }
    }
  },

  /* =========================================================
   * 3D 立体造型（伪 3D：球体/圆柱光影 + 投影 + 深度缩放）
   * 图片加载失败时使用——此前是扁平色块，被看成"卡片"，
   * 现在用径向/线性渐变模拟受光，做出真正的体积感
   * ========================================================= */

  /* 柔和椭圆投影：距离越远越小越淡 */
  shadow3d(c, x, y, r, sc) {
    /* 防护：非有限值会让 createRadialGradient 抛错并中断整帧绘制 */
    if (!isFinite(x) || !isFinite(y) || !isFinite(r) || r <= 0) return;
    c.save();
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,.45)');
    g.addColorStop(0.6, 'rgba(0,0,0,.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x, y, r, r * 0.42, 0, 0, 7); c.fill();
    c.restore();
  },

  /* 球体：径向渐变（光来自左上 → 高光偏左上，右下暗） */
  sphere(c, x, y, r, base, hi) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(r) || r <= 0) return;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.15);
    g.addColorStop(0, hi);
    g.addColorStop(0.55, base);
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  },

  /* 圆柱：横截面受光（左暗-中亮-右暗），做出鼓起的立体感 */
  cylinder(c, x, y, w, h, base, hi, r) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
    const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,.42)');
    g.addColorStop(0.28, base);
    g.addColorStop(0.46, hi);
    g.addColorStop(0.72, base);
    g.addColorStop(1, 'rgba(0,0,0,.48)');
    c.fillStyle = g;
    c.beginPath();
    if (c.roundRect) c.roundRect(x - w / 2, y, w, h, r == null ? Math.min(w, h) * 0.3 : r);
    else c.rect(x - w / 2, y, w, h);
    c.fill();
  },

  /* ---------- 3D 僵尸 ---------- */
  drawZombieShape(c, x, y, sz, z) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(sz) || sz <= 0) return;
    const d = (z && z.d) || {};
    const big = !!z.isBoss || !!d.elite;
    const S = sz / 24;                       /* 缩放系数 */
    const skin = big ? '#5d8290' : '#73996d';
    const skinHi = big ? '#9fd0dd' : '#a8d69f';
    const cloth = big ? '#2f4550' : '#3d5140';
    const clothHi = big ? '#577786' : '#6b866e';

    c.save();
    this.shadow3d(c, x, y + sz * 0.52, sz * 0.5, S);

    /* 腿（两根圆柱，带前后错开＝立体） */
    this.cylinder(c, x - sz * 0.15, y + sz * 0.16, sz * 0.16, sz * 0.34, cloth, clothHi, sz * 0.06);
    this.cylinder(c, x + sz * 0.15, y + sz * 0.16, sz * 0.16, sz * 0.34, cloth, clothHi, sz * 0.06);

    /* 躯干（椭球感：圆柱 + 顶肩） */
    this.cylinder(c, x, y - sz * 0.14, sz * 0.62, sz * 0.42, cloth, clothHi, sz * 0.16);
    /* 胸腹破布层次（暗部） */
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.beginPath(); c.ellipse(x, y + sz * 0.02, sz * 0.22, sz * 0.10, 0, 0, 7); c.fill();

    /* 前伸双臂（圆柱 + 手球） */
    const swing = Math.sin((z.animT || 0) * 6) * sz * 0.05;
    this.cylinder(c, x - sz * 0.36, y - sz * 0.08 + swing, sz * 0.14, sz * 0.32, skin, skinHi, sz * 0.06);
    this.cylinder(c, x + sz * 0.36, y - sz * 0.08 - swing, sz * 0.14, sz * 0.32, skin, skinHi, sz * 0.06);
    this.sphere(c, x - sz * 0.36, y + sz * 0.26 + swing, sz * 0.09, skin, skinHi);
    this.sphere(c, x + sz * 0.36, y + sz * 0.26 - swing, sz * 0.09, skin, skinHi);

    /* 头（球体 + 下颌阴影） */
    const hy = y - sz * 0.36;
    this.sphere(c, x, hy, sz * 0.26, skin, skinHi);
    /* 头顶高光 */
    c.fillStyle = 'rgba(255,255,255,.20)';
    c.beginPath(); c.ellipse(x - sz * 0.08, hy - sz * 0.12, sz * 0.10, sz * 0.06, -0.5, 0, 7); c.fill();

    /* 眼窝（凹陷暗） */
    c.fillStyle = 'rgba(0,0,0,.42)';
    c.beginPath(); c.ellipse(x, hy + sz * 0.02, sz * 0.17, sz * 0.08, 0, 0, 7); c.fill();
    /* 发光眼睛 */
    const eye = z && z.slowT > 0 ? '#7fe9ff' : (big ? '#ff5a5a' : '#ffe066');
    c.fillStyle = eye; c.shadowColor = eye; c.shadowBlur = 6 * S;
    c.beginPath(); c.arc(x - sz * 0.10, hy + sz * 0.01, sz * 0.045, 0, 7); c.fill();
    c.beginPath(); c.arc(x + sz * 0.10, hy + sz * 0.01, sz * 0.045, 0, 7); c.fill();
    c.shadowBlur = 0;

    /* 嘴（张口） */
    c.fillStyle = '#241a1a';
    c.beginPath(); c.ellipse(x, hy + sz * 0.13, sz * 0.07, sz * 0.045, 0, 0, 7); c.fill();
    /* 牙 */
    c.fillStyle = '#e8e2d0';
    c.fillRect(x - sz * 0.04, hy + sz * 0.10, sz * 0.02, sz * 0.03);
    c.fillRect(x + sz * 0.02, hy + sz * 0.10, sz * 0.02, sz * 0.03);

    /* BOSS/精英：头顶红色等级环 */
    if (big) {
      c.fillStyle = '#ff4d6d';
      c.beginPath(); c.arc(x, hy - sz * 0.36, sz * 0.10, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.font = 'bold ' + Math.round(sz * 0.13) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', x, hy - sz * 0.35);
    }
    /* 护盾僵尸：正面盾牌（有厚度） */
    if (d.front) {
      const sw = sz * 0.5, sh = sz * 0.42;
      c.save();
      c.translate(x, y - sz * 0.05);
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.beginPath(); c.ellipse(3, 4, sw * 0.5, sh * 0.5, 0, 0, 7); c.fill();
      const sg = c.createLinearGradient(-sw / 2, 0, sw / 2, 0);
      sg.addColorStop(0, '#6b7a8c'); sg.addColorStop(.45, '#c8d4e2'); sg.addColorStop(1, '#4a5566');
      c.fillStyle = sg;
      c.beginPath();
      if (c.roundRect) c.roundRect(-sw / 2, -sh / 2, sw, sh, 4); else c.rect(-sw / 2, -sh / 2, sw, sh);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.stroke();
      c.restore();
    }
    /* 冰冻状态：整体罩一层冰蓝 */
    if (z && z.slowT > 0) {
      c.fillStyle = 'rgba(120,220,255,.30)';
      c.beginPath(); c.arc(x, y, sz * 0.62, 0, 7); c.fill();
      c.strokeStyle = 'rgba(190,245,255,.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, sz * 0.62, 0, 7); c.stroke();
    }
    c.restore();
  },

  /* ---------- 3D 主角（末日士兵） ---------- */
  drawHeroShape(c, x, y) {
    const S = 1;
    c.save();
    /* 地面投影 */
    this.shadow3d(c, x, y + 20, 22, S);

    /* 腿（两根圆柱，立体受光） */
    this.cylinder(c, x - 7.5, y + 4, 9, 15, '#2b374c', '#48597a', 3);
    this.cylinder(c, x + 7.5, y + 4, 9, 15, '#2b374c', '#48597a', 3);
    c.beginPath(); c.roundRect ? c.roundRect(x - 12, y + 4, 9, 15, 3) : c.rect(x - 12, y + 4, 9, 15); c.fill();
    c.beginPath(); c.roundRect ? c.roundRect(x + 3, y + 4, 9, 15, 3) : c.rect(x + 3, y + 4, 9, 15); c.fill();

    /* 靴子 */
    c.fillStyle = '#1a2230';
    c.beginPath(); c.roundRect ? c.roundRect(x - 13, y + 16, 11, 5, 2) : c.rect(x - 13, y + 16, 11, 5); c.fill();
    c.beginPath(); c.roundRect ? c.roundRect(x + 2, y + 16, 11, 5, 2) : c.rect(x + 2, y + 16, 11, 5); c.fill();

    /* 躯干（战术夹克，圆柱受光） */
    this.cylinder(c, x, y - 12, 26, 20, '#41536e', '#6d84a8', 7);
    /* 胸口护甲（凸起，高光） */
    c.fillStyle = 'rgba(255,190,90,.55)';
    c.beginPath(); c.roundRect ? c.roundRect(x - 8, y - 9, 16, 5, 2) : c.rect(x - 8, y - 9, 16, 5); c.fill();
    /* 腰带 */
    c.fillStyle = '#20293a';
    c.fillRect(x - 13, y - 1, 26, 4);
    c.fillStyle = '#ffd76a';
    c.fillRect(x - 4, y - 1, 8, 4);

    /* 手臂（两侧圆柱，右臂持枪前伸） */
    this.cylinder(c, x - 15, y - 10, 7, 16, '#3a4a63', '#5e739a', 3);
    this.cylinder(c, x + 13, y - 11, 7, 14, '#3a4a63', '#5e739a', 3);

    /* 头（球体 + 肤色） */
    const hy = y - 22;
    this.sphere(c, x, hy, 8.5, '#e3b98d', '#ffd9ae');
    /* 战术头盔（半球 + 高光） */
    c.save();
    c.beginPath(); c.arc(x, hy - 1, 9.5, Math.PI * 1.02, Math.PI * 1.98); c.fill();
    const hg = c.createLinearGradient(x - 9, hy - 10, x + 9, hy + 2);
    hg.addColorStop(0, '#4c5f7d'); hg.addColorStop(.5, '#7d92b3'); hg.addColorStop(1, '#33415a');
    c.fillStyle = hg; c.fill();
    c.restore();
    /* 帽檐 */
    c.fillStyle = '#2c3850';
    c.beginPath(); c.ellipse(x, hy - 2, 10, 3.2, 0, 0, 7); c.fill();
    /* 护目镜（发光） */
    c.fillStyle = '#5cd8ff'; c.shadowColor = '#5cd8ff'; c.shadowBlur = 5;
    c.beginPath(); c.roundRect ? c.roundRect(x - 7, hy - 1, 14, 3.5, 1.6) : c.rect(x - 7, hy - 1, 14, 3.5); c.fill();
    c.shadowBlur = 0;

    /* 枪（立体：枪管 + 枪身 + 高光） */
    c.save();
    c.translate(x + 15, y - 8);
    c.rotate(-0.12);
    /* 枪身 */
    const gg = c.createLinearGradient(-4, 0, 4, 0);
    gg.addColorStop(0, '#3a4250'); gg.addColorStop(.5, '#79859a'); gg.addColorStop(1, '#2b323d');
    c.fillStyle = gg;
    c.beginPath(); c.roundRect ? c.roundRect(-3.5, -14, 7, 26, 2) : c.rect(-3.5, -14, 7, 26); c.fill();
    /* 枪管（前伸） */
    c.fillStyle = '#8e9aad';
    c.fillRect(-2, -20, 4, 8);
    /* 枪口火光点 */
    c.fillStyle = '#ffd76a';
    c.beginPath(); c.arc(0, -20, 2, 0, 7); c.fill();
    /* 弹夹（前凸，有厚度） */
    c.fillStyle = '#39424f';
    c.beginPath(); c.roundRect ? c.roundRect(2, -2, 5, 10, 1.5) : c.rect(2, -2, 5, 10); c.fill();
    c.restore();

    /* 头顶选中光环（金色，表示玩家） */
    c.strokeStyle = 'rgba(255,201,60,.55)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y + 20, 20, 8, 0, 0, 7); c.stroke();
    c.restore();
  },

  draw() {
    const cc = this.ctx || (this.cv && this.cv.getContext('2d'));
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

    /* 2.5D 透视地面网格（产生纵深） */
    this.drawPerspGround(c);

    /* 障碍物：掩体（表28） */
    for (const o of (r.obstacles || [])) {
      if (o.dead) continue;
      const hpr = o.hp / o.maxHp;
      /* 阴影 */
      c.fillStyle = 'rgba(0,0,0,.34)';
      c.beginPath(); c.ellipse(o.x, o.y + o.h / 2 + 2, o.w * 0.55, o.h * 0.3, 0, 0, 7); c.fill();
      /* 主体：石块/金属灰 */
      const g = c.createLinearGradient(o.x, o.y - o.h / 2, o.x, o.y + o.h / 2);
      g.addColorStop(0, '#7d8899'); g.addColorStop(1, '#464f60');
      c.fillStyle = g;
      c.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1.5;
      c.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      /* 顶部高光 */
      c.fillStyle = 'rgba(255,255,255,.14)';
      c.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, 3);
      /* 血条（受损才显示） */
      if (hpr < 1) {
        c.fillStyle = 'rgba(0,0,0,.55)';
        c.fillRect(o.x - o.w / 2, o.y - o.h / 2 - 6, o.w, 3);
        c.fillStyle = hpr > 0.4 ? '#8bc34a' : '#ff7043';
        c.fillRect(o.x - o.w / 2, o.y - o.h / 2 - 6, o.w * hpr, 3);
      }
    }

    /* 可破坏油桶（表28：击破爆炸） */
    for (const b of (r.barrels || [])) {
      if (b.dead) continue;
      c.fillStyle = 'rgba(0,0,0,.34)';
      c.beginPath(); c.ellipse(b.x, b.y + 10, 12, 5, 0, 0, 7); c.fill();
      /* 桶身：红橙色危险物 */
      const g2 = c.createLinearGradient(b.x - 10, b.y, b.x + 10, b.y);
      g2.addColorStop(0, '#c0392b'); g2.addColorStop(0.5, '#e74c3c'); g2.addColorStop(1, '#922b21');
      c.fillStyle = g2;
      c.beginPath(); c.roundRect ? c.roundRect(b.x - 10, b.y - 13, 20, 26, 3) : c.rect(b.x - 10, b.y - 13, 20, 26);
      c.fill();
      c.strokeStyle = 'rgba(255,220,120,.8)'; c.lineWidth = 1.5; c.stroke();
      /* 危险标记 */
      c.fillStyle = '#ffd76a'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
      c.fillText('!', b.x, b.y + 4);
      /* 血量环 */
      const hpr2 = b.hp / b.maxHp;
      if (hpr2 < 1) {
        c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3;
        c.beginPath(); c.arc(b.x, b.y, 15, 0, 7); c.stroke();
        c.strokeStyle = '#ff5252'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(b.x, b.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpr2); c.stroke();
      }
    }

    /* 炮台（部署在防线前方） */
    this.drawZones(c);
    this.drawTurrets(c);

    /* 佣兵 / 召唤物 */
    this.drawMercs(c);

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
    /* 按 y 排序：远的先画，近的后画（2.5D 遮挡关系） */
    const zs = r.zombies.filter((z) => !z.dead).sort((a, b) => a.y - b.y);
    for (const z of zs) {
      const sc = this.depthScale(z.y);
      const sz = (z.isBoss ? 58 : (z.d.elite ? 38 : 32)) * sc;
      this.shadow(c, z.x, z.y, sz * 0.55, sc);
      if (z.slowT > 0) { c.fillStyle = 'rgba(92,216,255,0.28)'; c.beginPath(); c.arc(z.x, z.y, sz * 0.62, 0, 7); c.fill(); }
      const zim = IMG.get(z.img);
      if (zim) {
        const w = sz * 1.55, h = sz * 1.55;
        c.drawImage(zim, z.x - w / 2, z.y - h * 0.62, w, h);
      } else {
        this.drawZombieShape(c, z.x, z.y, sz, z);
      }
      if (z.hp < z.maxHp) {
        const bw = sz * 0.95;
        const by = z.y - sz * 0.68;
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(z.x - bw / 2, by, bw, 3.5);
        c.fillStyle = z.isBoss ? '#ff4d6d' : '#5fd07a';
        c.fillRect(z.x - bw / 2, by, bw * Math.max(0, z.hp / z.maxHp), 3.5);
      }
    }

    /* ===== 2.5D 立体防线（底部城墙） ===== */
    const wy = this.wallY;
    const wg = c.createLinearGradient(0, wy - 6, 0, wy + 34);
    wg.addColorStop(0, '#4a5568'); wg.addColorStop(0.35, '#2d3748'); wg.addColorStop(1, '#151b26');
    c.fillStyle = wg;
    c.fillRect(0, wy - 4, W, 30);
    /* 城墙顶面高光（伪 3D 厚度） */
    c.fillStyle = 'rgba(255,165,60,0.30)';
    c.fillRect(0, wy - 6, W, 3);
    /* 墙垛 */
    c.fillStyle = '#3a4557';
    for (let x = 0; x < W; x += 26) {
      c.fillRect(x + 3, wy - 11, 16, 8);
      c.fillStyle = 'rgba(255,215,106,0.18)';
      c.fillRect(x + 3, wy - 11, 16, 2);
      c.fillStyle = '#3a4557';
    }
    /* 防线受损闪红 */
    const wr = r.wallHp != null ? r.wallHp / r.wallMax : (r.hp / r.maxHp);
    if (wr < 0.35) {
      c.fillStyle = 'rgba(255,60,90,' + (0.12 + (1 - wr / 0.35) * 0.20).toFixed(3) + ')';
      c.fillRect(0, wy - 6, W, 32);
    }

    /* 玩家 */
    /* 人物立绘：加载失败时允许 4 秒后重试；始终有几何士兵兜底 */
    if (this._heroImg === undefined || (this._heroImg === null
        && Date.now() - (this._heroFail || 0) > 4000)) {
      this._heroFail = Date.now();
      const url = this.P && this.P.avatarImg;
      if (!url) { this._heroImg = null; }
      else {
        const im = new Image();
        im.onload = () => { this._heroImg = im; };
        im.onerror = () => { this._heroImg = null; };
        im.src = url;
        if (this._heroImg === undefined) this._heroImg = null;
      }
    }
    const heroImg = this._heroImg;
    let heroDrawn = false;
    if (heroImg && heroImg.complete && heroImg.naturalWidth) {
      try {
        const hh = 54, hw = hh * heroImg.naturalWidth / heroImg.naturalHeight;
        c.drawImage(heroImg, r.px - hw / 2, r.py - hh + 14, hw, hh);
        heroDrawn = true;
      } catch (e) {}
    }
    if (!heroDrawn) {
      const cim = IMG.get(this.charImg);
      if (cim) { c.drawImage(cim, r.px - 26, r.py - 26, 52, 52); heroDrawn = true; }
    }
    if (!heroDrawn) {
      c.save();
      /* 几何士兵：整体放大到与立绘一致（3D 细节更清晰） */
      c.translate(r.px, r.py); c.scale(1.15, 1.15); c.translate(-r.px, -r.py);
      this.drawHeroShape(c, r.px, r.py);
      c.restore();
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
BT.speed = 1;
BT.auto = true;
window.BT = BT;
