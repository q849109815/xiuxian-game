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
  cache: {}, fail: {}, pend: {},
  get(src) {
    if (!src) return null;
    const v = this.cache[src];
    if (v) return v;                        /* 已加载成功 */
    if (v === null) {
      /* 关键：正在加载中的 Image 必须保持引用。
       * 旧写法每次调用都 new 一个局部 Image 后就丢掉引用，对象可能被回收，
       * onload/onerror 永远不触发 → 该图永远"加载中" → 角色只能走几何兜底，
       * 美术立绘（抠底立体精灵）实际上一次都没显示过。 */
      /* 仍在加载中：保留引用等待；超过 6 秒仍未回调则判定卡死，重建一个 */
      if (this.pend[src] && Date.now() - (this.fail[src] || 0) < 6000) return null;
      if (!this.pend[src] && Date.now() - (this.fail[src] || 0) < 4000) return null;
    }
    const im = new Image();
    this.pend[src] = im;
    const done = (ok) => {
      if (this.pend[src] === im) delete this.pend[src];
      if (ok) { this.cache[src] = im; delete this.fail[src]; }
      else { this.cache[src] = null; this.fail[src] = Date.now(); }
    };
    im.onload = () => done(true);
    im.onerror = () => done(false);
    im.src = src;
    this.cache[src] = null;                 /* 加载中：先用几何图形兜底 */
    this.fail[src] = Date.now();
    return null;
  },
};

/* =========================================================
 * 立体精灵 SPR：立绘 → 抠底 + 主体裁剪 + 顶亮底暗 + 轮廓光
 * 素材是 256×256 纯色底 JPG（有黑底也有白底），直接 drawImage 到战场上
 * 就是一块"方纸片"，这是画面扁平/有纸质感的主要来源。
 * 首次使用时离线处理一次并缓存：
 *   ① 与底色近似的像素判为背景，做连通域，只保留面积最大的几块（主体）
 *   ② 按主体包围盒裁剪，避免"图大主体小"导致角色在场上显得又小又空
 *   ③ 顶亮底暗 + 底部 AO，模拟顶光照射的体积感
 *   ④ 外扩一圈冷色轮廓光（rim light），让主体从场景里"立"出来
 * 之后每帧只是两次 drawImage，开销可忽略。
 * ========================================================= */
const SPR = {
  cache: {},
  canvas(w, h) {
    try {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      return cv.getContext('2d') ? cv : null;
    } catch (e) { return null; }
  },

  /* 抠背景：tol 为与背景色的距离平方阈值，返回 {cv, w, h, ratio} 或 null */
  cut(im, tol) {
    const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
    if (!w0 || !h0) return null;
    const MAX = 176;                       /* 战斗里显示不超过 176px，缩小以加速 */
    const s = Math.min(1, MAX / Math.max(w0, h0));
    const W = Math.max(2, Math.round(w0 * s)), H = Math.max(2, Math.round(h0 * s));
    const cv = this.canvas(W, H); if (!cv) return null;
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(im, 0, 0, W, H);
    let img;
    try { img = g.getImageData(0, 0, W, H); } catch (e) { return null; }
    const d = img.data, N = W * H;

    /* 背景色：四边各采样 8 点取中位，抗噪（黑底/白底都能适应） */
    const samp = [];
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    for (let k = 0; k < 8; k++) {
      const x = Math.round(k * (W - 1) / 7), y = Math.round(k * (H - 1) / 7);
      samp.push(at(x, 0), at(x, H - 1), at(0, y), at(W - 1, y));
    }
    samp.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
    const bg = samp[Math.floor(samp.length / 2)] || [20, 20, 20];

    const ds = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const r = d[i * 4] - bg[0], gg = d[i * 4 + 1] - bg[1], b = d[i * 4 + 2] - bg[2];
      ds[i] = r * r + gg * gg + b * b;
    }
    /* 连通域：只保留面积最大的几块（主体），零散噪点一并去掉 */
    const comp = new Int32Array(N); comp.fill(-1);
    const sizes = [], st = [];
    for (let i = 0; i < N; i++) {
      if (ds[i] <= tol || comp[i] >= 0) continue;
      const id = sizes.length; let cnt = 0;
      comp[i] = id; st.push(i);
      while (st.length) {
        const j = st.pop(); cnt++;
        const x = j % W, y = (j / W) | 0;
        if (x > 0 && ds[j - 1] > tol && comp[j - 1] < 0) { comp[j - 1] = id; st.push(j - 1); }
        if (x < W - 1 && ds[j + 1] > tol && comp[j + 1] < 0) { comp[j + 1] = id; st.push(j + 1); }
        if (y > 0 && ds[j - W] > tol && comp[j - W] < 0) { comp[j - W] = id; st.push(j - W); }
        if (y < H - 1 && ds[j + W] > tol && comp[j + W] < 0) { comp[j + W] = id; st.push(j + W); }
      }
      sizes.push(cnt);
    }
    const order = sizes.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const keep = new Uint8Array(sizes.length);
    const minS = Math.max(24, N * 0.012);
    let kept = 0;
    for (const o of order) {
      if (o[0] < minS || kept >= 4) break;
      keep[o[1]] = 1; kept++;
    }
    if (!kept && order.length) keep[order[0][1]] = 1;

    let clear = 0;
    for (let i = 0; i < N; i++) {
      const cid = comp[i];
      if (cid < 0 || !keep[cid]) { d[i * 4 + 3] = 0; clear++; }
      /* 软边：颜色仍接近底色的外圈像素降透明度，去掉硬锯齿与残留光晕 */
      else d[i * 4 + 3] = ds[i] > tol * 1.8 ? 255 : 150;
    }
    g.putImageData(img, 0, 0);
    return { cv, w: W, h: H, ratio: clear / N };
  },

  /* 立体化：剪掉空白 → 顶亮底暗 → 轮廓光 */
  build(im) {
    let best = null, bestScore = 1e9;
    /* 自适应阈值：立绘底色深浅不一，试几档取"抠掉比例最接近一半"的那次 */
    for (const tol of [2600, 4200, 1500, 6800]) {
      const t = this.cut(im, tol);
      if (!t || t.ratio > 0.94) continue;
      const sc = Math.abs(t.ratio - 0.5);
      if (sc < bestScore) { bestScore = sc; best = t; }
      if (sc <= 0.22) break;                 /* 已经够好，不必再试其它档 */
    }
    if (!best) return null;

    /* 包围盒裁剪：主体常只占原图中间一小块，不裁剪的话角色会显得又小又空 */
    const src = best.cv, W0 = best.w, H0 = best.h;
    const g0 = src.getContext('2d', { willReadFrequently: true });
    let dd = null;
    try { dd = g0.getImageData(0, 0, W0, H0).data; } catch (e) { dd = null; }
    let x0 = 0, y0 = 0, x1 = W0 - 1, y1 = H0 - 1;
    if (dd) {
      let fx = -1, fy = -1, lx = -1, ly = -1;
      for (let y = 0; y < H0; y++) {
        for (let x = 0; x < W0; x++) {
          if (dd[(y * W0 + x) * 4 + 3] > 8) {
            if (fx < 0 || x < fx) fx = x;
            if (lx < x) lx = x;
            if (fy < 0) fy = y;
            ly = y;
          }
        }
      }
      if (fx < 0) return null;
      x0 = fx; y0 = fy; x1 = lx; y1 = ly;
    }
    const W = Math.max(2, x1 - x0 + 1), H = Math.max(2, y1 - y0 + 1);
    const cv = this.canvas(W, H);
    if (!cv) return null;
    cv.getContext('2d').drawImage(src, x0, y0, W, H, 0, 0, W, H);

    const g = cv.getContext('2d');
    /* 顶亮底暗（顶光 + 底部环境遮蔽） */
    try {
      g.globalCompositeOperation = 'source-atop';
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, 'rgba(255,255,255,0.16)');
      lg.addColorStop(0.42, 'rgba(255,255,255,0)');
      lg.addColorStop(0.78, 'rgba(0,0,0,0.18)');
      lg.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      /* 柱面受光：左暗 - 中偏左亮 - 右暗。平面立绘看起来"扁"的根本原因是
       * 只有平涂色，加上横向明暗后才有圆柱/球体的体积感。 */
      const lg2 = g.createLinearGradient(0, 0, W, 0);
      lg2.addColorStop(0, 'rgba(0,0,0,0.46)');
      lg2.addColorStop(0.28, 'rgba(255,255,255,0.16)');
      lg2.addColorStop(0.56, 'rgba(255,255,255,0.03)');
      lg2.addColorStop(1, 'rgba(0,0,0,0.52)');
      g.fillStyle = lg2; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    } catch (e) {}

    /* 轮廓光：主体外扩一圈冷色，再挖掉主体本身 */
    const pad = 4, rim = this.canvas(W + pad * 2, H + pad * 2);
    let rimCv = null;
    if (rim) {
      const rg = rim.getContext('2d');
      for (const o of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
        rg.drawImage(cv, pad + o[0], pad + o[1]);
      }
      rg.globalCompositeOperation = 'source-in';
      rg.fillStyle = 'rgba(150,220,255,0.45)';
      rg.fillRect(0, 0, W + pad * 2, H + pad * 2);
      rg.globalCompositeOperation = 'destination-out';
      rg.drawImage(cv, pad, pad);
      rimCv = rim;
    }
    /* 真·立体厚度：把主体剪影沿光照反方向（右下）挤出若干层并烘焙成一张
     * "侧壁图"，每帧只多一次 drawImage。挖掉主体后剩下的月牙就是可见的厚度，
     * 这是立绘从"平面贴图"变成"实体块"的关键。 */
    let solid = null;
    try {
      const dep = Math.max(4, Math.min(16, Math.round(Math.min(W, H) * 0.15)));
      const sp2 = dep + 2;
      const sil = this.canvas(W, H);
      const sol = this.canvas(W + sp2, H + sp2);
      if (sil && sol) {
        const ig = sil.getContext('2d');
        ig.drawImage(cv, 0, 0);
        ig.globalCompositeOperation = 'source-in';
        ig.fillStyle = '#0a1222';
        ig.fillRect(0, 0, W, H);
        ig.globalCompositeOperation = 'source-over';
        const sg = sol.getContext('2d');
        for (let i = dep; i >= 1; i--) {
          const k = i / dep;
          sg.globalAlpha = 0.45 + 0.50 * (1 - k);
          sg.drawImage(sil, sp2 + k * dep * 0.92, sp2 + k * dep * 1.20);
        }
        sg.globalAlpha = 1;
        sg.globalCompositeOperation = 'destination-out';
        sg.drawImage(cv, sp2, sp2);
        sg.globalCompositeOperation = 'source-over';
        solid = { cv: sol, pad: sp2, depth: dep };
      }
    } catch (e) { solid = null; }

    return { cv, rim: rimCv, solid, w: W, h: H, pad: pad, ratio: best.ratio };
  },



  /* 每帧最多处理 2 张，避免开局一次性抠图造成掉帧 */
  budget: 2,
  /* 抠图失败允许重试若干次：立绘可能在"已声明尺寸但尚未解码完成"时被读取，
   * 此时整张图是透明的 → 抠图必然失败。旧代码一旦失败就永久缓存 null，
   * 导致该角色此后永远退回矢量兜底，看不到抠底立体立绘。 */
  _rt: {},
  get(src) {
    if (!src) return null;
    const c = this.cache[src];
    if (c) return c;
    if (c === null && (this._rt[src] || 0) >= 8) return null;
    const im = IMG.get(src);
    if (!im || !(im.naturalWidth || im.width)) return null;   /* 图还没加载好：先用几何兜底 */
    if (im.complete === false) return null;                   /* 尚未解码完：等下一帧再抠 */
    if (this.budget <= 0) return null;
    this.budget--;
    this._rt[src] = (this._rt[src] || 0) + 1;
    const r = this.build(im);
    this.cache[src] = r || null;
    return r;
  },
};
if (typeof window !== 'undefined') { window.SPR = SPR; window.IMG = IMG; }
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
    /* 场景：优先用关卡表逐关配置的 scene
     * BUG：此前恒用 sceneFor(def.ch)（按章节号一刀切），
     * 关卡表里 100 关逐个配的 scene 字段从未被消费 —— 实测 86/100 关场景与配置不符
     * （如 1-10 BOSS 关配了 snow，实际渲染 city；第 2 章 10 关全配 tunnel，实际全 factory）。
     * 现在按关卡配置取，缺配/非法值回退按章节推算。 */
    this.scene = (def.scene && this.SCENES[def.scene]) ? def.scene : this.sceneFor(def.ch);
    this.img(this.scene);
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
      gunId: (p && p.gun) || 'W01',
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
    if (r.muzzleT > 0) r.muzzleT = Math.max(0, r.muzzleT - dt);   /* 枪口火光计时 */
    for (const z of r.zombies) if (z.hitT > 0) z.hitT = Math.max(0, z.hitT - dt);
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
      const tz = this.nearest(t.x, t.y, null, t.def.rng + t.lv * 12,
        { preferElite: t.def.preferElite });
      if (!tz) continue;
      t.cd = 1 / (t.def.rate * (1 + t.lv * 0.12));
      /* 炮台伤害此前完全不随章节缩放：
       * 火焰炮台固定 22 伤害，而第 10 章普通僵尸血量 3953（关卡倍率 131.75）
       * → 杀一只要 180 发 / 约 200 秒，后期炮台等于纯装饰，
       *   玩家花 120~180 金币建造 + 升级的钱全部白花。
       * 现在按关卡倍率 rwMul 缩放，与武器/怪物成长同步。 */
      const dmgT = t.def.dmg * (1 + t.lv * 0.35) * (1 + r.mods.dmgMul) * (r.def.rwMul || 1);
      /* 把炮台的元素效果带进子弹（此前只传 el，效果字段全部丢失） */
      this.spawnBullet(t.x, t.y, tz, dmgT, {
        pierce: 0, from: 'turret', el: t.def.el,
        slow: t.def.slow, slowT: t.def.slowT,
        burn: t.def.burn, burnT: t.def.burnT,
        chain: t.def.chain, chainN: t.def.chainN,
      });
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
        this.hurt(z, dmg, Math.random() < r.crit, b.el === '物' ? '物' : (b.el || '物'));
        /* 元素命中效果（冰=减速 / 火=灼烧 / 电=链式）
         * 此前 b.el 除分裂子弹传递外全项目零消费，炮台四种元素
         * 与燃烧瓶 burn:0.7 都是「写了 desc、没有任何实现」。 */
        if (!z.dead) {
          if (b.slow > 0) {
            z.slow = Math.max(z.slow || 0, b.slow);
            z.slowT = Math.max(z.slowT || 0, b.slowT || 1.5);
          }
          if (b.burn > 0) {
            z.burn = Math.max(z.burn || 0, b.burn);
            z.burnT = Math.max(z.burnT || 0, b.burnT || 3);
          }
          if (b.chain > 0 && Math.random() < b.chain) this.chain(z, b.chainN || 2, b.dmg * 0.55);
        }
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
        /* 爆炸：武器自带（榴弹枪 explode:0.6 / er:62）+ 技能&芯片 mods 叠加。
         * 严重BUG：此前只读 r.mods.explode（来自技能/芯片），而子弹创建时
         *   写入的 b.explode = g.explode、b.er = g.er 从未被消费
         * → 武器表 W03 榴弹枪「爆炸弹 explode:0.6 / er:62」完全是装饰，
         *   实测打出去就是普通单发子弹（命中 1 只、爆炸特效 0）。
         * 同时 r.erMul（词条 AF09「爆炸范围+10%」）全项目只有赋值、无消费
         * → 花 50 钻洗出的红色传说词条完全无效。
         * 现在两者合并，并让 erMul 真正作用于半径。 */
        {
          const exB = Number(b.explode || 0), exM = Number(r.mods.explode || 0);
          const ex = exB + exM;
          if (ex > 0) {
            const rad = (Number(b.er) || Number(r.mods.er) || 46) * (Number(r.erMul) || 1);
            this.explode(b.x, b.y, rad, b.dmg * ex);
          }
        }
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
      /* 元素命中效果（此前 el 只用于特效取色，效果字段全项目零消费） */
      slow: Number(opt.slow) || 0, slowT: Number(opt.slowT) || 0,
      burn: Number(opt.burn) || 0, burnT: Number(opt.burnT) || 0,
      chain: Number(opt.chain) || 0, chainN: Number(opt.chainN) || 0,
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
          icon: type === 'drone' ? '🛸' : '🚙',
        };
        r.mercs.push({
          def: sdef, isSummon: true, life: durT, maxLife: durT,
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
        /* 武器元素效果：燃烧瓶 S02 burn:0.7 此前全项目零消费
         * —— 配置里写了「燃烧弹」，实际打中没有任何持续伤害。 */
        el: g.el || '物',
        burn: g.burn || 0, burnT: g.burn ? 3 : 0,
        slow: g.slow || 0, slowT: g.slowT || 0,
        chain: g.chain || 0, chainN: g.chainN || 0,
      });
    }
    /* 枪口火光 / 后坐力：供绘制层做开火反馈 */
    r.muzzleT = 0.07;
    r.aimA = base;
    if (r.mag <= 0) this.reload();
  },

  /* 战斗中切换武器后同步武器数值
   * BUG：战斗中的「🔄 切换」按钮此前只弹一句 toast，不切换任何东西
   * （真正的切换入口 E.switchGun 只在武器库面板里）。而 run 的 atk/rate/
   * mag 等都在 start 时快照，切换武器后必须重算，否则换枪不换数值。 */
  refreshGun() {
    const r = this.run; if (!r || !this.P) return;
    const a = E.attrs(this.P);
    /* BUG：此处原写 `(p && p.gun)`，小写 p 在本作用域根本不存在
     * → 战斗中点「🔄 切换武器」直接抛 ReferenceError: p is not defined，
     *   切换成功后的数值同步和 toast 全部中断（换枪不换数值）。 */
    r.gunId = (this.P && this.P.gun) || r.gunId || 'W01';
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
    /* 表20 公式2：暴击 = 基础 × 暴伤倍率。
     * 严重BUG：此前写成 dmg * (1 + critDmg)，而武器表 critDmg 是**倍率**
     *   （W01~W06 均 1.5，即暴击造成 150% 伤害），于是实际打出 1+1.5=2.5 倍。
     *   实测：平A 4615 → 暴击 12308（2.67 倍，含浮动），比设计值高约 67%。
     *   玩家看到面板「暴击伤害 150%」，实际却是 250%。
     * 现在改为 dmg * critDmg（1.5 倍）。 */
    let d = dmg * (crit ? (Number(r.critDmg) || 1.5) : 1);
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
    z.hitT = 0.12;                          /* 受击闪白（立体精灵叠加高光用） */
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

  nearest(x, y, ex, maxR, opt) {
    /* 狙击炮台 desc「优先攻击精英」此前从未实现 —— 纯按距离选敌，
     * 实测近处的普通僵尸和远处的精英并存时，全程只打近处那只。
     * preferElite：射程内只要有精英/BOSS，就锁定最近的精英；没有才按距离。 */
    if (opt && opt.preferElite) {
      let be = null, bd = maxR || 9999;
      for (const z of this.run.zombies) {
        if (z.dead) continue;
        if (!(z.isBoss || z.boss || (z.d && z.d.elite))) continue;
        const d = Math.hypot(z.x - x, z.y - y);
        if (d < bd) { bd = d; be = z; }
      }
      if (be) return be;
    }
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
    const wall = this.wallY || this.H;
    const hz = wall * 0.10;
    const t = Math.max(0, Math.min(1, (y - hz) / Math.max(1, wall - hz)));
    /* 强透视：远处 0.66 倍 → 近处 1.42 倍（近大远小对比拉开 = 真纵深） */
    return 0.66 + Math.pow(t, 1.25) * 0.76;
  },

  /* 深度雾化：越远越淡（大气透视），返回 0~1 的不透明度系数 */
  depthFog(y) {
    const wall = this.wallY || this.H;
    const hz = wall * 0.10;
    const t = Math.max(0, Math.min(1, (y - hz) / Math.max(1, wall - hz)));
    return 0.55 + Math.pow(t, 0.85) * 0.45;
  },

  /* ===== 真 3D 透视地面：消失点 + 大气雾化 + 明暗纵深条带 + 收敛网格 ===== */
  drawPerspGround(c) {
    const W = this.W, H = this.H, wall = this.wallY || (H - 96);
    const hz = H * 0.10, vpx = W / 2;
    if (!isFinite(W) || !isFinite(H)) return;
    c.save();
    /* 1) 远景大气雾化：越靠近地平线越淡（纵深的关键） */
    const fog = c.createLinearGradient(0, hz - H * 0.05, 0, hz + (wall - hz) * 0.34);
    fog.addColorStop(0, 'rgba(16,26,42,0.78)');
    fog.addColorStop(1, 'rgba(16,26,42,0)');
    c.fillStyle = fog;
    c.fillRect(0, hz - H * 0.05, W, (wall - hz) * 0.34 + H * 0.05);

    /* 2) 地面明暗纵深条带：远密近疏 = 透视压缩 */
    for (let i = 0; i < 16; i++) {
      const t0 = i / 16, t1 = (i + 1) / 16;
      const y0 = hz + Math.pow(t0, 1.9) * (wall - hz);
      const y1 = hz + Math.pow(t1, 1.9) * (wall - hz);
      const a = 0.028 + t0 * 0.052;
      c.fillStyle = (i % 2)
        ? 'rgba(140,190,240,' + a.toFixed(3) + ')'
        : 'rgba(6,12,22,' + (a * 1.6).toFixed(3) + ')';
      c.fillRect(0, y0, W, Math.max(1, y1 - y0));
    }

    /* 3) 横向网格线：消失点处密集，近处稀疏 */
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const y = hz + Math.pow(t, 1.9) * (wall - hz);
      const a = 0.05 + t * 0.26;
      c.strokeStyle = 'rgba(120,175,225,' + a.toFixed(3) + ')';
      c.lineWidth = t < 0.25 ? 0.6 : (t < 0.6 ? 1.0 : 1.6);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }

    /* 4) 纵向网格线：自消失点向下发散（透视收敛） */
    for (let i = -8; i <= 8; i++) {
      const xT = vpx + i * 4;
      const xB = vpx + i * (W / 5.0);
      c.strokeStyle = 'rgba(120,175,225,' + (0.10 + Math.min(0.10, Math.abs(i) * 0.012)).toFixed(3) + ')';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(xT, hz); c.lineTo(xB, wall); c.stroke();
    }

    /* 5) 消失点辉光：远处光源，强化纵深 */
    const gl = c.createRadialGradient(vpx, hz, 0, vpx, hz, Math.max(40, W * 0.55));
    gl.addColorStop(0, 'rgba(150,200,255,0.15)');
    gl.addColorStop(1, 'rgba(150,200,255,0)');
    c.fillStyle = gl;
    c.fillRect(0, hz - H * 0.08, W, (wall - hz) * 0.55 + H * 0.08);

    /* 6) 防线前的地面暖光（玩家脚下最亮 = 近处） */
    const wl = c.createLinearGradient(0, wall - 90, 0, wall);
    wl.addColorStop(0, 'rgba(255,180,90,0)');
    wl.addColorStop(1, 'rgba(255,180,90,0.17)');
    c.fillStyle = wl; c.fillRect(0, wall - 90, W, 90);
    c.restore();
  },

  /* ===== 真 3D 盒体：底边中心 (x,y)，宽 w / 高 h / 进深 dp =====
   * 三面不同亮度（光来自左上）：顶面最亮、正面中间、右侧面最暗。
   * 这是掩体/墙/炮台从"色块"变成"立体物"的关键。 */
  box3d(c, x, y, w, h, dp, face, top, side, rim) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
    const oy = dp * 0.45, ix = Math.min(w * 0.18, w * 0.5);
    const x0 = x - w / 2, x1 = x + w / 2, y1 = y - h;
    c.save();
    /* 右侧面（背光） */
    c.beginPath();
    c.moveTo(x1, y1); c.lineTo(x1 - ix, y1 - oy);
    c.lineTo(x1 - ix, y - oy); c.lineTo(x1, y); c.closePath();
    c.fillStyle = side || 'rgba(0,0,0,.45)'; c.fill();
    /* 顶面（受光最强） */
    c.beginPath();
    c.moveTo(x0, y1); c.lineTo(x0 + ix, y1 - oy);
    c.lineTo(x1 - ix, y1 - oy); c.lineTo(x1, y1); c.closePath();
    c.fillStyle = top || 'rgba(255,255,255,.28)'; c.fill();
    /* 正面 + 环境光衰减渐变 */
    c.fillStyle = face; c.fillRect(x0, y1, w, h);
    const g = c.createLinearGradient(0, y1, 0, y);
    g.addColorStop(0, 'rgba(255,255,255,.10)');
    g.addColorStop(0.38, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.44)');
    c.fillStyle = g; c.fillRect(x0, y1, w, h);
    if (rim) { c.strokeStyle = rim; c.lineWidth = 1.2; c.strokeRect(x0, y1, w, h); }
    /* 顶面棱线高光 */
    c.strokeStyle = 'rgba(255,255,255,.36)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x0, y1); c.lineTo(x1, y1); c.stroke();
    c.restore();
  },

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
      const sc = this.depthScale(t.y);
      const R = 15 * sc;
      /* 接地投影 */
      c.fillStyle = 'rgba(0,0,0,.38)';
      c.beginPath(); c.ellipse(t.x + 3 * sc, t.y + 3 * sc, R * 1.05, R * 0.42, 0, 0, 7); c.fill();
      /* 底座：立体圆柱（俯视可见顶面椭圆） */
      this.cylinder(c, t.x, t.y - R * 0.55, R * 1.7, R * 0.62, '#1b2434', '#3d4a63', R * 0.30);
      c.fillStyle = '#2b3650';
      c.beginPath(); c.ellipse(t.x, t.y - R * 0.55, R * 0.85, R * 0.34, 0, 0, 7); c.fill();
      c.strokeStyle = el.c; c.lineWidth = 2;
      c.beginPath(); c.ellipse(t.x, t.y - R * 0.55, R * 0.85, R * 0.34, 0, 0, 7); c.stroke();
      /* 炮管：带厚度与高光，指向目标 */
      c.save(); c.translate(t.x, t.y - R * 0.35); c.rotate(a);
      const bg = c.createLinearGradient(0, -4 * sc, 0, 4 * sc);
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.42, el.c); bg.addColorStop(1, 'rgba(0,0,0,.55)');
      c.fillStyle = bg;
      c.beginPath();
      if (c.roundRect) c.roundRect(2 * sc, -3.6 * sc, 21 * sc, 7.2 * sc, 2 * sc);
      else c.rect(2 * sc, -3.6 * sc, 21 * sc, 7.2 * sc);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.75)';
      c.beginPath(); c.arc(23 * sc, 0, 2.2 * sc, 0, 7); c.fill();
      c.restore();
      /* 图标与等级 */
      c.font = Math.round(13 * sc) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(t.def.icon, t.x, t.y - R * 0.55);
      c.font = Math.round(9 * sc) + 'px sans-serif'; c.fillStyle = '#ffd76a';
      c.fillText('Lv' + t.lv, t.x, t.y + 12 * sc);
    }
  },

  /* 佣兵 / 召唤物（真 3D）
   * 修复前这里只有一行 20px 平面 emoji fillText，四个问题：
   *   ① 无 depthScale → 佣兵不参与透视，在 3D 场景里像贴上去的标签
   *   ② 无接触阴影 / 受光 / 厚度 → 与地面没有接触感，始终是飘着的纸片
   *   ③ 配置里的 img 立绘（assets/icon/m_sd.jpg 等 4 张）从来没被读过
   *   ④ 召唤物的 id 是 SUM_DRONE / SUM_CAR，而分支判断的是 'drone'/'armored'
   *      → 永不匹配 → 无人机和装甲车都渲染成同一个 🧍 人形 emoji
   * 现在：佣兵走与僵尸相同的立绘抠底 3D 管线，召唤物各有 3D 造型。 */
  drawMercs(c) {
    const r = this.run;
    for (const m of r.mercs) {
      if (!isFinite(m.x) || !isFinite(m.y)) continue;
      const sc = this.depthScale(m.y);

      /* 召唤物离地悬浮：上下浮动 + 更小更淡的投影（强化"离地"体积感） */
      const hover = m.isSummon ? Math.sin((r.time || 0) * 3 + (m.x || 0) * 0.05) * 3 * sc : 0;
      const y = m.y + hover;
      this.shadow3d(c, m.x, m.y + (m.isSummon ? 11 : 5) * sc, (m.isSummon ? 12 : 15) * sc, sc);

      if (m.isSummon && m.def.id === 'SUM_DRONE') { this.drawDrone3d(c, m.x, y, sc, r); }
      else if (m.isSummon && m.def.id === 'SUM_CAR') { this.drawCar3d(c, m.x, y, sc); }
      else {
        const sp = SPR.get(m.def.img);
        if (sp) {
          const h = 46 * sc, w = h * (sp.w / sp.h);
          const bx = m.x - w / 2, by = y + 4 * sc - h;
          /* 厚度侧壁（右下暗面）：让立绘成为实体块 */
          this.drawSolid(c, sp, bx, by, w);
          if (sp.rim) {
            const k = w / sp.w;
            c.drawImage(sp.rim, bx - sp.pad * k, by - sp.pad * k,
              (sp.w + sp.pad * 2) * k, (sp.h + sp.pad * 2) * k);
          }
          c.drawImage(sp.cv, bx, by, w, h);
        } else {
          /* 立绘未就绪时的 3D 兜底：士兵几何体（圆柱躯干+球头+手持枪） */
          this.drawMercShape(c, m.x, y, 15 * sc, m.def);
        }
      }

      /* 存活条：召唤物有时限，按各自的 maxLife 归一化
       * （修复前硬编码 /10，而 durT 最高 8×(1+9×0.1)=15.2s，进度条会撑爆） */
      if (m.isSummon && m.life != null) {
        const mx = m.maxLife || m.life || 1;
        const bw = 24 * sc;
        c.fillStyle = 'rgba(0,0,0,.55)';
        c.fillRect(m.x - bw / 2, m.y + 14 * sc, bw, 2.5);
        c.fillStyle = '#5cd8ff';
        c.fillRect(m.x - bw / 2, m.y + 14 * sc,
          bw * Math.max(0, Math.min(1, m.life / mx)), 2.5);
      }
    }
  },

  /* 佣兵 3D 几何兜底（立绘未加载时用）：与僵尸同款的圆柱+球体建模 */
  drawMercShape(c, x, y, sz, def) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(sz) || sz <= 0) return;
    const cloth = '#2f4a63', clothHi = '#5d87a8';
    const skin = '#c9a887', skinHi = '#f0d7b8';
    c.save();
    /* 腿 */
    this.cylinder(c, x - sz * 0.16, y + sz * 0.16, sz * 0.17, sz * 0.34, cloth, clothHi, sz * 0.06);
    this.cylinder(c, x + sz * 0.16, y + sz * 0.16, sz * 0.17, sz * 0.34, cloth, clothHi, sz * 0.06);
    /* 躯干 + 战术背心暗部 */
    this.cylinder(c, x, y - sz * 0.14, sz * 0.60, sz * 0.42, cloth, clothHi, sz * 0.16);
    c.fillStyle = 'rgba(0,0,0,.20)';
    c.beginPath(); c.ellipse(x, y + sz * 0.02, sz * 0.20, sz * 0.09, 0, 0, 7); c.fill();
    /* 双臂（前伸持枪） */
    this.cylinder(c, x - sz * 0.32, y - sz * 0.06, sz * 0.13, sz * 0.30, skin, skinHi, sz * 0.06);
    this.cylinder(c, x + sz * 0.32, y - sz * 0.06, sz * 0.13, sz * 0.30, skin, skinHi, sz * 0.06);
    /* 头盔（球体 + 高光） */
    const hy = y - sz * 0.38;
    this.sphere(c, x, hy, sz * 0.24, cloth, clothHi);
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.beginPath(); c.ellipse(x - sz * 0.07, hy - sz * 0.11, sz * 0.09, sz * 0.05, -0.5, 0, 7); c.fill();
    /* 面部（暗）+ 护目镜蓝光 */
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.beginPath(); c.ellipse(x, hy + sz * 0.06, sz * 0.15, sz * 0.07, 0, 0, 7); c.fill();
    c.fillStyle = '#7fe9ff'; c.shadowColor = '#7fe9ff'; c.shadowBlur = 5;
    c.fillRect(x - sz * 0.13, hy + sz * 0.02, sz * 0.26, sz * 0.05);
    c.shadowBlur = 0;
    /* 手持武器（横向圆柱，带高光棱） */
    const gx = x + sz * 0.34, gy = y + sz * 0.12;
    const gg = c.createLinearGradient(0, gy - sz * 0.07, 0, gy + sz * 0.07);
    gg.addColorStop(0, '#e8eef6'); gg.addColorStop(0.45, '#8d9bb0'); gg.addColorStop(1, '#39424f');
    c.fillStyle = gg;
    c.beginPath();
    if (c.roundRect) c.roundRect(gx - sz * 0.30, gy - sz * 0.07, sz * 0.62, sz * 0.14, sz * 0.05);
    else c.rect(gx - sz * 0.30, gy - sz * 0.07, sz * 0.62, sz * 0.14);
    c.fill();
    /* 兵种徽记（小图标浮在头顶，便于区分霰弹/机枪/狙击/哨箭） */
    if (def && def.icon) {
      c.font = Math.round(sz * 0.62) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(255,255,255,.92)';
      c.fillText(def.icon, x, hy - sz * 0.42);
    }
    c.restore();
  },

  /* 无人机召唤物：3D 碟形机体 + 旋翼 + 悬停光晕 */
  drawDrone3d(c, x, y, sc, r) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(sc)) return;
    c.save();
    /* 机体：扁圆盘（顶面亮、底面暗） */
    const w = 22 * sc, h = 7 * sc;
    const g = c.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, '#dfe9f5'); g.addColorStop(0.5, '#7f93ad'); g.addColorStop(1, '#37424f');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, 7); c.fill();
    /* 顶盖高光（俯视可见的上面） */
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.beginPath(); c.ellipse(x, y - h * 0.18, w * 0.30, h * 0.24, 0, 0, 7); c.fill();
    /* 旋翼（两侧，随时间旋转的椭圆＝透视下的转动） */
    const ph = (r && r.time ? r.time : 0) * 12;
    c.strokeStyle = 'rgba(190,225,255,.55)'; c.lineWidth = 1.4 * sc;
    for (const sx of [-1, 1]) {
      const rx = x + sx * w * 0.40;
      c.beginPath();
      c.ellipse(rx, y - h * 0.30, 6 * sc * Math.abs(Math.cos(ph + (sx > 0 ? 1.2 : 0))), 1.6 * sc, 0, 0, 7);
      c.stroke();
      c.fillStyle = '#4a5666';
      c.beginPath(); c.arc(rx, y - h * 0.30, 1.8 * sc, 0, 7); c.fill();
    }
    /* 机腹指示灯（发光） */
    c.fillStyle = '#5cd8ff'; c.shadowColor = '#5cd8ff'; c.shadowBlur = 7 * sc;
    c.beginPath(); c.arc(x, y + h * 0.22, 2.4 * sc, 0, 7); c.fill();
    c.shadowBlur = 0;
    c.restore();
  },

  /* 装甲车召唤物：3D 车体（顶面+正面+侧面）+ 炮塔 + 履带 */
  drawCar3d(c, x, y, sc) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(sc)) return;
    c.save();
    const w = 30 * sc, h = 11 * sc;
    /* 履带（下缘暗色实体块，带厚度） */
    c.fillStyle = '#232b36';
    c.beginPath();
    if (c.roundRect) c.roundRect(x - w * 0.5, y + h * 0.10, w, h * 0.42, h * 0.20);
    else c.rect(x - w * 0.5, y + h * 0.10, w, h * 0.42);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.14)';
    c.fillRect(x - w * 0.5, y + h * 0.10, w, 1.4 * sc);
    /* 负重轮 */
    c.fillStyle = '#4b5766';
    for (let i = -2; i <= 2; i++) {
      c.beginPath(); c.arc(x + i * w * 0.19, y + h * 0.31, 2.1 * sc, 0, 7); c.fill();
    }
    /* 车体：顶面 + 正面 + 右侧面 */
    const face = c.createLinearGradient(0, y - h, 0, y + h * 0.2);
    face.addColorStop(0, '#6f7f5f'); face.addColorStop(1, '#39452f');
    this.box3d(c, x, y + h * 0.16, w, h, 6 * sc, face,
      'rgba(190,210,150,.75)', 'rgba(0,0,0,.52)', 'rgba(255,255,255,.22)');
    /* 炮塔（小圆柱 + 顶面） */
    this.cylinder(c, x - w * 0.06, y - h * 0.62, w * 0.34, h * 0.52, '#5c6b4c', '#8ea173', 2 * sc);
    c.fillStyle = '#93a67d';
    c.beginPath(); c.ellipse(x - w * 0.06, y - h * 0.62, w * 0.17, h * 0.13, 0, 0, 7); c.fill();
    /* 炮管（带高光的圆柱，朝右＝朝向尸潮） */
    const bg = c.createLinearGradient(0, y - h * 0.62 - 2.2 * sc, 0, y - h * 0.62 + 2.2 * sc);
    bg.addColorStop(0, '#e6ecf2'); bg.addColorStop(0.45, '#8d9bb0'); bg.addColorStop(1, '#39424f');
    c.fillStyle = bg;
    c.fillRect(x + w * 0.06, y - h * 0.66, w * 0.42, 4.4 * sc);
    c.restore();
  },

  /* 贯穿光束（电磁穿刺 / 高能射线 / 制导激光）
   * 3D 表现：外层辉光柱 → 中层元素色 → 亮白核心，电系带锯齿抖动。
   * 沿光束方向做纵向渐变（近端亮、远端衰减），强化空间纵深。 */
  drawBeam3d(c, f, al) {
    if (!isFinite(f.x) || !isFinite(f.y) || !isFinite(f.a) || !isFinite(f.len)) return;
    const a = Math.max(0, Math.min(1, al));
    const ex = f.x + Math.cos(f.a) * f.len, ey = f.y + Math.sin(f.a) * f.len;
    const col = f.el === '火' ? '255,140,60' : f.el === '冰' ? '92,216,255'
              : f.el === '电' ? '192,140,255' : '255,236,170';
    c.save();
    c.lineCap = 'round';
    /* ① 外层辉光（最宽最淡） */
    c.strokeStyle = 'rgba(' + col + ',' + (a * 0.22).toFixed(3) + ')';
    c.lineWidth = 16 * (0.5 + a * 0.5);
    c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(ex, ey); c.stroke();
    /* ② 中层元素色柱 */
    c.strokeStyle = 'rgba(' + col + ',' + (a * 0.75).toFixed(3) + ')';
    c.lineWidth = 7 * (0.4 + a * 0.6);
    c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(ex, ey); c.stroke();
    /* ③ 亮白核心（细而实，做出"能量束"的体积） */
    const cg = c.createLinearGradient(f.x, f.y, ex, ey);
    cg.addColorStop(0, 'rgba(255,255,255,' + a + ')');
    cg.addColorStop(1, 'rgba(255,255,255,' + (a * 0.15).toFixed(3) + ')');
    c.strokeStyle = cg;
    c.lineWidth = 2.6 * (0.4 + a * 0.6);
    c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(ex, ey); c.stroke();
    /* ④ 电系锯齿：沿光束抖动的分叉电弧，强化"穿刺/射线"的攻击感 */
    if (f.el === '电') {
      c.strokeStyle = 'rgba(235,220,255,' + (a * 0.8).toFixed(3) + ')';
      c.lineWidth = 1.4;
      const seg = 7;
      c.beginPath();
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const jx = f.x + (ex - f.x) * t + (i === 0 || i === seg ? 0 : (Math.random() - 0.5) * 13 * a);
        const jy = f.y + (ey - f.y) * t + (i === 0 || i === seg ? 0 : (Math.random() - 0.5) * 13 * a);
        if (i === 0) c.moveTo(jx, jy); else c.lineTo(jx, jy);
      }
      c.stroke();
    }
    /* ⑤ 枪口起点的爆点光球 */
    const sr = 7 * (0.5 + a * 0.5);
    const sg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, sr);
    sg.addColorStop(0, 'rgba(255,255,255,' + (a * 0.9).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(' + col + ',0)');
    c.fillStyle = sg;
    c.beginPath(); c.arc(f.x, f.y, sr, 0, 7); c.fill();
    c.restore();
  },

  /* =========================================================
   * 3D 立体造型（伪 3D：球体/圆柱光影 + 投影 + 深度缩放）
   * 图片加载失败时使用——此前是扁平色块，被看成"卡片"，
   * 现在用径向/线性渐变模拟受光，做出真正的体积感
   * ========================================================= */

  /* 柔和椭圆投影：距离越远越小越淡 */
  /* 立体厚度侧壁：在主体之前绘制，做出实体块的右下暗面 */
  drawSolid(c, sp, bx, by, w) {
    if (!sp || !sp.solid) return;
    const k = w / sp.w;
    const p = sp.solid.pad * k;
    c.drawImage(sp.solid.cv, bx - p, by - p,
      (sp.w + sp.solid.pad * 2) * k, (sp.h + sp.solid.pad * 2) * k);
  },
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

  /* =========================================================
   * 3D 立体卡片（战斗内：僵尸 / 主角 / 武器）
   * 竖立卡牌：厚度侧面 + 品质描边 + 摆动 + 扫光 + 地面投影
   * 卡面纹理预渲染缓存，避免每帧重建渐变
   * ========================================================= */
  cardTex: {},

  cardStyle(kind) {
    switch (kind) {
      case 'boss':  return { a: '#54131f', b: '#8d2130', edge: '#ff4d6d', hi: 'rgba(255,140,165,.60)' };
      case 'elite': return { a: '#281745', b: '#4b2f78', edge: '#c08cff', hi: 'rgba(205,160,255,.55)' };
      case 'hero':  return { a: '#123043', b: '#1f4d68', edge: '#ffc93c', hi: 'rgba(255,230,160,.60)' };
      case 'gun':   return { a: '#141d2c', b: '#26374f', edge: '#5cd8ff', hi: 'rgba(160,235,255,.55)' };
      default:      return { a: '#152619', b: '#27432e', edge: '#5fd07a', hi: 'rgba(150,240,175,.50)' };
    }
  },

  getCardTex(kind) {
    if (this.cardTex[kind]) return this.cardTex[kind];
    let cv = null;
    try { cv = document.createElement('canvas'); } catch (e) { return null; }
    const W = 80, H = 112, R = 9;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); if (!g) return null;
    const s = this.cardStyle(kind);
    const lg = g.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, s.b); lg.addColorStop(0.45, s.a); lg.addColorStop(1, 'rgba(0,0,0,.62)');
    g.fillStyle = lg;
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, W, H, R); else g.rect(0, 0, W, H);
    g.fill();
    /* 顶部受光 */
    const tg = g.createLinearGradient(0, 0, 0, H * 0.38);
    tg.addColorStop(0, 'rgba(255,255,255,.20)'); tg.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.beginPath(); if (g.roundRect) g.roundRect(0, 0, W, H, R); else g.rect(0, 0, W, H);
    g.clip(); g.fillStyle = tg; g.fillRect(0, 0, W, H); g.restore();
    /* 品质描边 */
    g.strokeStyle = s.edge; g.lineWidth = 5.5;
    g.beginPath();
    if (g.roundRect) g.roundRect(1.3, 1.3, W - 2.6, H - 2.6, R - 1); else g.rect(1.3, 1.3, W - 2.6, H - 2.6);
    g.stroke();
    /* 四角卡角 */
    g.strokeStyle = s.hi; g.lineWidth = 1.7; const L = 10;
    g.beginPath();
    g.moveTo(5, 5 + L); g.lineTo(5, 5); g.lineTo(5 + L, 5);
    g.moveTo(W - 5 - L, 5); g.lineTo(W - 5, 5); g.lineTo(W - 5, 5 + L);
    g.moveTo(5, H - 5 - L); g.lineTo(5, H - 5); g.lineTo(5 + L, H - 5);
    g.moveTo(W - 5 - L, H - 5); g.lineTo(W - 5, H - 5); g.lineTo(W - 5, H - 5 - L);
    g.stroke();
    this.cardTex[kind] = cv;
    return cv;
  },

  /* 竖立 3D 卡牌：底边中心锚点 (x, y)，卡面从 y-h 到 y
     opt: { t 时间, ph 相位, sw 摆动幅度, gloss 扫光 } */
  drawCard(c, x, y, w, h, kind, opt) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
    opt = opt || {};
    const t = opt.t || 0, ph = opt.ph || 0;
    const sw = opt.sw == null ? 1 : opt.sw;
    if (sw <= 0) ph = 0;
    const s = this.cardStyle(kind);
    const rot = Math.sin(t * 1.7 + ph) * 0.055 * sw;
    const dy = Math.sin(t * 1.7 + ph) * (h * 0.028) * sw;
    const th = Math.max(1.6, w * 0.075);
    const R = Math.max(3, w * 0.11);

    c.save();
    /* 地面投影 */
    const shw = w * 0.55 * (1 - Math.abs(rot) * 0.35);
    if (isFinite(shw) && shw > 0) {
      const sg = c.createRadialGradient(x, y, 0, x, y, shw);
      sg.addColorStop(0, 'rgba(0,0,0,.42)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg;
      c.beginPath(); c.ellipse(x, y + 1, shw, shw * 0.34, 0, 0, 7); c.fill();
    }

    c.translate(x, y + dy);
    c.rotate(rot);

    /* 厚度：右下暗面（制造立体厚度） */
    const panel = (px, py, pw, phh) => {
      c.beginPath();
      if (c.roundRect) c.roundRect(px - pw / 2, py - phh, pw, phh, R);
      else c.rect(px - pw / 2, py - phh, pw, phh);
      c.fill();
    };
    c.fillStyle = 'rgba(4,8,16,.88)';
    panel(th * 0.9, th * 0.8, w, h);

    /* 卡面 */
    const tex = this.getCardTex(kind);
    if (tex) {
      try { c.drawImage(tex, -w / 2, -h, w, h); } catch (e) {}
    } else {
      const lg = c.createLinearGradient(-w / 2, -h, w / 2, 0);
      lg.addColorStop(0, s.b); lg.addColorStop(1, 'rgba(0,0,0,.55)');
      c.fillStyle = lg; panel(0, 0, w, h);
      c.strokeStyle = s.edge; c.lineWidth = 2;
      c.beginPath();
      if (c.roundRect) c.roundRect(-w / 2, -h, w, h, R); else c.rect(-w / 2, -h, w, h);
      c.stroke();
    }

    /* 清晰描边：按屏幕尺寸自适应（纹理缩放会让描边被抗锯齿稀释到几乎看不见） */
    c.save();
    c.strokeStyle = s.edge;
    c.lineWidth = Math.max(1.4, w * 0.055);
    if (opt.glow) { c.shadowColor = s.edge; c.shadowBlur = Math.min(14, w * 0.28); }
    c.beginPath();
    if (c.roundRect) c.roundRect(-w / 2, -h, w, h, R); else c.rect(-w / 2, -h, w, h);
    c.stroke();
    c.restore();

    /* 扫光：斜向高光条循环掠过卡面 */
    if (opt.gloss !== false) {
      const prog = ((t * 0.42 + ph * 0.11) % 1 + 1) % 1;
      const gx = -w / 2 - w * 0.45 + prog * (w * 1.9);
      c.save();
      c.beginPath();
      if (c.roundRect) c.roundRect(-w / 2, -h, w, h, R); else c.rect(-w / 2, -h, w, h);
      c.clip();
      const gg = c.createLinearGradient(gx - w * 0.24, -h, gx + w * 0.24, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(0.5, 'rgba(255,255,255,.20)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gg; c.fillRect(-w / 2, -h, w, h);
      c.restore();
    }
    c.restore();
  },

  /* 手持武器：跟随瞄准方向旋转，开火有后坐力与枪口火光。
   * 此前武器只在右侧悬浮成一张卡片，跟人物是分开的，
   * 现在真正握在手上并跟随目标转动。 */
  drawHeldGun(c, r, aim) {
    const g = (window.E && this.P) ? E.gun(this.P) : null;
    if (!g || !isFinite(aim)) return;
    const kick = r.muzzleT > 0 ? 3.2 : 0;
    const hx = r.px + Math.cos(aim) * 9 - Math.cos(aim) * kick;
    const hy = r.py - 10 + Math.sin(aim) * 9 - Math.sin(aim) * kick;
    c.save();
    c.translate(hx, hy);
    c.rotate(aim + Math.PI / 2);            /* 造型默认枪口朝上(-y)，转到瞄准方向 */
    /* 枪在地面上的一小片投影，避免枪看起来浮在空中 */
    c.save();
    c.globalAlpha = 0.25; c.fillStyle = '#000';
    c.beginPath(); c.ellipse(0, 13, 7, 3, 0, 0, 7); c.fill();
    c.restore();
    this.drawGunShape(c, g, 1.05);
    /* 枪口火光 */
    if (r.muzzleT > 0) {
      const bl = 21, a = Math.min(1, r.muzzleT / 0.07);
      const fg = c.createRadialGradient(0, -bl, 0, 0, -bl, 12);
      fg.addColorStop(0, 'rgba(255,248,214,' + (0.95 * a).toFixed(3) + ')');
      fg.addColorStop(0.45, 'rgba(255,176,60,' + (0.62 * a).toFixed(3) + ')');
      fg.addColorStop(1, 'rgba(255,120,20,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(0, -bl, 12, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,242,196,' + (0.9 * a).toFixed(3) + ')';
      c.beginPath();
      c.moveTo(-3, -bl + 3); c.lineTo(0, -bl - 10); c.lineTo(3, -bl + 3);
      c.closePath(); c.fill();
    }
    c.restore();
  },

  /* 武器 3D 卡片：悬浮在主角右上，跟随当前武器变化 */
  drawWeaponCard(c, px, py, t) {
    const r = this.run; if (!r) return;
    const gid = r.gunId || (this.P && this.P.gun) || 'W01';
    const g = (window.EX && EX.guns ? EX.guns.find((x) => x.id === gid) : null)
           || (window.EX && EX.guns ? EX.guns[0] : null);
    if (!g) return;
    const w = 42, h = 56;
    const x = px + 40, y = py - 34 + Math.sin(t * 1.5) * 3;
    this.drawCard(c, x, y, w, h, 'gun', { t: t, ph: 2.2, sw: 0.9, glow: true });
    /* 卡内：3D 枪械 */
    c.save();
    c.translate(x, y - h * 0.52);
    this.drawGunShape(c, g, 1);
    c.restore();
    /* 武器名 */
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 10px sans-serif';
    c.fillStyle = 'rgba(0,0,0,.65)';
    const nw = Math.min(w - 4, (g.n || '').length * 10 + 6);
    c.fillRect(x - nw / 2, y - 13, nw, 12);
    c.fillStyle = '#dff3ff';
    c.fillText(g.n || '', x, y - 7);
    c.restore();
  },

  /* 3D 枪械造型（按 type 区分外形：步枪/散弹/榴弹/狙击/重机枪/投掷） */
  drawGunShape(c, g, k) {
    const ty = g.type || '自动';
    const body = '#5b6a80', bodyHi = '#9fb0c8', dark = '#2b3340';
    c.save();
    c.rotate(-0.30);
    const gg = c.createLinearGradient(-5 * k, 0, 5 * k, 0);
    gg.addColorStop(0, dark); gg.addColorStop(0.45, bodyHi); gg.addColorStop(1, body);
    c.fillStyle = gg;
    /* 枪身 */
    c.beginPath();
    if (c.roundRect) c.roundRect(-3.2 * k, -8 * k, 6.4 * k, 17 * k, 1.6 * k);
    else c.rect(-3.2 * k, -8 * k, 6.4 * k, 17 * k);
    c.fill();
    /* 枪管：狙击最长，散弹/榴弹最粗 */
    let bl = 15, bw = 2.4;
    if (ty === '狙击') { bl = 23; bw = 2.0; }
    else if (ty === '散弹' || ty === '爆炸') { bl = 11; bw = 3.6; }
    else if (ty === '重机枪') { bl = 17; bw = 2.0; }
    const bg = c.createLinearGradient(-bw * k, 0, bw * k, 0);
    bg.addColorStop(0, '#39424f'); bg.addColorStop(0.5, '#b9c6d8'); bg.addColorStop(1, '#2f3742');
    c.fillStyle = bg;
    c.fillRect(-bw * k, (-8 - bl) * k, bw * 2 * k, bl * k);
    /* 重机枪：多管转轮 */
    if (ty === '重机枪') {
      c.fillStyle = '#8e9aad';
      for (let i = -1; i <= 1; i++) c.fillRect((i * 2 - 0.6) * k, (-10 - bl + 4) * k, 1.2 * k, (bl - 5) * k);
      c.fillStyle = '#ffd76a';
      c.beginPath(); c.arc(0, (-9 - bl + 5) * k, 2.2 * k, 0, 7); c.fill();
    }
    /* 枪口 */
    c.fillStyle = '#1b2230';
    c.beginPath(); c.ellipse(0, (-8 - bl) * k, bw * k, 1.4 * k, 0, 0, 7); c.fill();
    if (ty === '狙击') {
      /* 瞄准镜（圆柱 + 蓝光） */
      const sg = c.createLinearGradient(-2.4 * k, 0, 2.4 * k, 0);
      sg.addColorStop(0, '#2b3340'); sg.addColorStop(0.5, '#8e9aad'); sg.addColorStop(1, '#232a36');
      c.fillStyle = sg; c.fillRect(-2.4 * k, -13 * k, 4.8 * k, 9 * k);
      c.fillStyle = '#5cd8ff'; c.beginPath(); c.arc(0, -13.4 * k, 1.3 * k, 0, 7); c.fill();
    }
    /* 弹夹 / 弹鼓 */
    c.fillStyle = '#39424f';
    if (ty === '重机枪') { c.beginPath(); c.arc(0, 2 * k, 4.2 * k, 0, 7); c.fill(); }
    else if (ty === '散弹') { c.fillRect(1.6 * k, -1 * k, 3.4 * k, 8 * k); }
    else { c.beginPath(); if (c.roundRect) c.roundRect(1.8 * k, -1 * k, 3.6 * k, 9 * k, 1.2 * k); else c.rect(1.8 * k, -1 * k, 3.6 * k, 9 * k); c.fill(); }
    /* 握把 */
    c.fillStyle = '#2f3742';
    c.beginPath();
    c.moveTo(-1.6 * k, 7 * k); c.lineTo(1.6 * k, 7 * k); c.lineTo(0.4 * k, 13 * k); c.lineTo(-3.4 * k, 12.6 * k);
    c.closePath(); c.fill();
    /* 高光 */
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 0.9 * k;
    c.beginPath(); c.moveTo(-1.6 * k, -7 * k); c.lineTo(-1.6 * k, 7 * k); c.stroke();
    c.restore();
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
    SPR.budget = 2;                    /* 本帧最多抠 2 张立绘，防止开局掉帧 */
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
      const sc = this.depthScale(o.y);
      const w = o.w * sc, h = o.h * sc, dp = Math.max(6, Math.min(20, w * 0.55));
      const by = o.y + h * 0.36;
      /* 接地投影：随深度拉长并向右下偏（光源左上） */
      c.fillStyle = 'rgba(0,0,0,.36)';
      c.beginPath(); c.ellipse(o.x + dp * 0.34, by + h * 0.06, w * 0.66, h * 0.15, 0, 0, 7); c.fill();
      /* 石块主体：三面立体 */
      const g = c.createLinearGradient(0, by - h, 0, by);
      g.addColorStop(0, '#8593a6'); g.addColorStop(1, '#464f60');
      this.box3d(c, o.x, by, w, h, dp, g,
        'rgba(198,214,236,.58)', 'rgba(0,0,0,.48)', 'rgba(255,255,255,.24)');
      /* 血条（受损才显示） */
      if (hpr < 1) {
        const tx = o.x - w * 0.42, tw = w * 0.84;
        c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(tx, by - h - 8, tw, 3);
        c.fillStyle = hpr > 0.4 ? '#8bc34a' : '#ff7043';
        c.fillRect(tx, by - h - 8, tw * hpr, 3);
      }
    }

    /* 可破坏油桶（表28：击破爆炸） */
    for (const b of (r.barrels || [])) {
      if (b.dead) continue;
      const sc = this.depthScale(b.y);
      const bw = 20 * sc, bh = 26 * sc;
      const by = b.y + bh * 0.42;
      /* 接地投影（右下偏移） */
      c.fillStyle = 'rgba(0,0,0,.36)';
      c.beginPath(); c.ellipse(b.x + 3 * sc, by + 2, bw * 0.66, bh * 0.16, 0, 0, 7); c.fill();
      /* 桶身：立体圆柱（左暗-中亮-右暗） */
      this.cylinder(c, b.x, by - bh, bw, bh, '#c0392b', '#ff7f6e', 3 * sc);
      /* 顶盖：椭圆＝俯视能看到的顶面 */
      c.fillStyle = '#e8564a';
      c.beginPath(); c.ellipse(b.x, by - bh, bw * 0.5, bw * 0.19, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,220,120,.85)'; c.lineWidth = 1.4; c.stroke();
      /* 桶箍（两道，增强圆柱感） */
      c.strokeStyle = 'rgba(0,0,0,.34)'; c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(b.x, by - bh * 0.62, bw * 0.5, bw * 0.11, 0, 0, 7); c.stroke();
      c.beginPath(); c.ellipse(b.x, by - bh * 0.24, bw * 0.5, bw * 0.11, 0, 0, 7); c.stroke();
      /* 危险标记 */
      c.fillStyle = '#ffd76a'; c.font = 'bold ' + Math.round(11 * sc) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', b.x, by - bh * 0.45);
      /* 血量环 */
      const hpr2 = b.hp / b.maxHp;
      if (hpr2 < 1) {
        c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3;
        c.beginPath(); c.arc(b.x, by - bh * 0.5, 15 * sc, 0, 7); c.stroke();
        c.strokeStyle = '#ff5252'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(b.x, by - bh * 0.5, 15 * sc, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpr2); c.stroke();
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
        const rr = f.r * (1.2 - al * 0.5);
        /* 地面透视冲击环（椭圆＝贴地的 3D 圆环） */
        c.strokeStyle = 'rgba(255,150,60,' + (al * 0.55).toFixed(3) + ')'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(f.x, f.y, rr, rr * 0.38, 0, 0, 7); c.stroke();
        /* 立体火球（径向渐变球体） */
        const bg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 0.8));
        bg.addColorStop(0, 'rgba(255,240,200,' + (al * 0.85).toFixed(3) + ')');
        bg.addColorStop(0.45, 'rgba(255,150,60,' + (al * 0.55).toFixed(3) + ')');
        bg.addColorStop(1, 'rgba(255,90,30,0)');
        c.fillStyle = bg;
        c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 0.8), 0, 7); c.fill();
        c.strokeStyle = 'rgba(255,150,60,' + al + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, rr, 0, 7); c.stroke();
      } else if (f.t === 'nova') {
        c.strokeStyle = 'rgba(92,216,255,' + al + ')'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.25 - al * 0.4), 0, 7); c.stroke();
      } else if (f.t === 'bolt') {
        c.strokeStyle = 'rgba(192,140,255,' + al + ')'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke();
      } else if (f.t === 'beam') {
        /* 贯穿光束：电磁穿刺 / 高能射线 / 制导激光。
         * 严重 BUG：这三种技能 push 的是 t:'beam'，而这里此前只有
         * boom/nova/bolt/warn 四个分支 —— beam 没有任何渲染分支，
         * 玩家释放技能后伤害照常结算，画面上却什么都不显示。
         * 现在画成 3D 光束：外辉光 + 亮白核心 + 电系锯齿抖动。 */
        this.drawBeam3d(c, f, al);
      } else if (f.t === 'hitWall') {
        /* 僵尸啃到防线：贴墙的冲击弧 */
        c.strokeStyle = 'rgba(255,90,120,' + al + ')'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(f.x, f.y, f.r * (1.4 - al * 0.5), f.r * 0.45, 0, Math.PI, Math.PI * 2); c.stroke();
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
      if (!isFinite(b.x) || !isFinite(b.y)) continue;
      const bs = this.depthScale(b.y);
      /* 地面投影点：子弹悬空飞行 → 地面上一个淡影，强化 3D 空间感 */
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.beginPath(); c.ellipse(b.x, b.y + 6 * bs, 3.4 * bs, 1.4 * bs, 0, 0, 7); c.fill();
      if (b.enemy) {
        const er = 5 * bs;
        const eg = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, er * 2.1);
        const ec = b.kind === 'poison' ? '123,232,106' : '200,224,90';
        eg.addColorStop(0, 'rgba(255,255,255,.85)');
        eg.addColorStop(0.35, 'rgba(' + ec + ',.95)');
        eg.addColorStop(1, 'rgba(' + ec + ',0)');
        c.fillStyle = eg;
        c.beginPath(); c.arc(b.x, b.y, er * 2.1, 0, 7); c.fill();
      } else {
        /* 拖尾：由粗到细的锥形光迹 */
        const tx = b.x - b.vx * 0.030, ty = b.y - b.vy * 0.030;
        const lg = c.createLinearGradient(b.x, b.y, tx, ty);
        lg.addColorStop(0, 'rgba(255,236,170,.92)');
        lg.addColorStop(1, 'rgba(255,180,60,0)');
        c.strokeStyle = lg; c.lineCap = 'round';
        c.lineWidth = 3.4 * bs;
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(tx, ty); c.stroke();
        /* 弹头：立体发光球（高光偏左上） */
        const hr = 3.2 * bs;
        const hg = c.createRadialGradient(b.x - hr * 0.4, b.y - hr * 0.4, 0, b.x, b.y, hr * 2.0);
        hg.addColorStop(0, 'rgba(255,255,255,.95)');
        hg.addColorStop(0.40, 'rgba(255,215,106,.95)');
        hg.addColorStop(1, 'rgba(255,140,40,0)');
        c.fillStyle = hg;
        c.beginPath(); c.arc(b.x, b.y, hr * 2.0, 0, 7); c.fill();
        c.lineCap = 'butt';
      }
    }

    /* 僵尸 */
    /* 按 y 排序：远的先画，近的后画（2.5D 遮挡关系） */
    const zs = r.zombies.filter((z) => !z.dead).sort((a, b) => a.y - b.y);
    for (const z of zs) {
      const sc = this.depthScale(z.y);
      const sz = (z.isBoss ? 58 : (z.d.elite ? 38 : 32)) * sc;
      this._cardH = 0;
      if (this.card3d) {
        const big1 = !!z.isBoss || !!z.d.elite;
        const cw = sz * 1.14, ch = sz * 1.50;
        this._cardH = ch;
        this.drawCard(c, z.x, z.y + sz * 0.30, cw, ch,
          z.isBoss ? 'boss' : (z.d.elite ? 'elite' : 'zombie'),
          { t: r.time || 0, ph: ((z.id || z.x || 0) % 17) * 0.37,
            sw: z.isBoss ? 1 : 0.5, gloss: big1, glow: big1 });
      } else {
        this.shadow(c, z.x, z.y, sz * 0.55, sc);
      }
      if (z.slowT > 0) { c.fillStyle = 'rgba(92,216,255,0.28)'; c.beginPath(); c.arc(z.x, z.y, sz * 0.62, 0, 7); c.fill(); }
      /* 立体精灵：抠底立绘 + 接触阴影 + 轮廓光 + 走动起伏。
       * 此前是直接 drawImage 一张 256×256 深色底 JPG —— 贴在战场上就是
       * 一块方纸片，这是画面"扁平/有纸质感"的主要来源。 */
      const sp = SPR.get(z.img);
      const bob = Math.sin(((z.animT || 0) * 7) + ((z.id || z.x || 0) % 7)) * sz * 0.04;
      if (sp) {
        const h = sz * 1.72, w = h * (sp.w / sp.h);
        /* 脚底对齐到接触点（裁剪后主体底边就是脚），不再按整图居中 */
        const bx = z.x - w / 2, by = z.y + sz * 0.16 - h + bob;
        /* 接触阴影：越靠近脚底越实，做出"踩在地上"的感觉 */
        this.shadow3d(c, z.x, z.y + sz * 0.18, sz * 0.44, sc);
        /* 立体厚度侧壁（右下暗面），让立绘成为实体块而不是纸片 */
        this.drawSolid(c, sp, bx, by, w);
        if (sp.rim) {
          const k = w / sp.w;
          c.drawImage(sp.rim, bx - sp.pad * k, by - sp.pad * k,
            (sp.w + sp.pad * 2) * k, (sp.h + sp.pad * 2) * k);
        }
        if (z.hitT > 0) {
          c.save();
          c.globalAlpha = Math.min(0.55, z.hitT * 4);
          c.globalCompositeOperation = 'lighter';
          c.drawImage(sp.cv, bx, by, w, h);
          c.restore();
        }
        c.drawImage(sp.cv, bx, by, w, h);
        this._zTop = by;
      } else {
        this.shadow(c, z.x, z.y, sz * 0.55, sc);
        this.drawZombieShape(c, z.x, z.y, sz, z);
        this._zTop = z.y - sz * 0.68;
      }
      if (z.hp < z.maxHp) {
        const bw = sz * 0.95;
        const by = (this._cardH ? (z.y + sz * 0.30 - this._cardH - 5) : (this._zTop - 6));
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(z.x - bw / 2, by, bw, 3.5);
        c.fillStyle = z.isBoss ? '#ff4d6d' : '#5fd07a';
        c.fillRect(z.x - bw / 2, by, bw * Math.max(0, z.hp / z.maxHp), 3.5);
      }
    }

    /* ===== 真 3D 防线城墙：顶面（俯视可见）+ 正面 + 底部暗面 + 立体墙垛 ===== */
    const wy = this.wallY;
    const TOPD = 13;                                  /* 顶面进深：俯视能看到的墙头 */
    /* 墙头顶面（受光最强，暖色） */
    const tg = c.createLinearGradient(0, wy - TOPD, 0, wy);
    tg.addColorStop(0, '#8a6a44'); tg.addColorStop(0.5, '#6d5636'); tg.addColorStop(1, '#54432a');
    c.fillStyle = tg;
    c.fillRect(0, wy - TOPD, W, TOPD);
    /* 顶面砖缝（纵深纹理） */
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 22) {
      c.beginPath(); c.moveTo(x, wy - TOPD); c.lineTo(x, wy); c.stroke();
    }
    /* 顶面/正面交界棱线（高光） */
    c.fillStyle = 'rgba(255,190,90,0.42)';
    c.fillRect(0, wy - 1.5, W, 2.2);
    /* 墙体正面（环境变量：上亮下暗） */
    const wg = c.createLinearGradient(0, wy, 0, wy + 30);
    wg.addColorStop(0, '#4a5568'); wg.addColorStop(0.35, '#2d3748'); wg.addColorStop(1, '#0d1219');
    c.fillStyle = wg;
    c.fillRect(0, wy, W, 30);
    /* 墙面砖块（立体凹凸） */
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1;
    for (let yy = wy + 8; yy < wy + 30; yy += 11) {
      c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke();
    }
    for (let x = 11; x < W; x += 22) {
      c.beginPath(); c.moveTo(x, wy + 8); c.lineTo(x, wy + 30); c.stroke();
    }
    /* 立体墙垛：每个都有顶面 + 正面 + 侧面 */
    for (let x = 0; x < W; x += 26) {
      const bw = 16, bh = 9, bx = x + 3, byy = wy - TOPD + 3;
      this.box3d(c, bx + bw / 2, byy, bw, bh, 7,
        (function () { const g2 = c.createLinearGradient(0, byy - bh, 0, byy);
          g2.addColorStop(0, '#4d5a70'); g2.addColorStop(1, '#2b3444'); return g2; })(),
        'rgba(200,215,240,.50)', 'rgba(0,0,0,.50)', 'rgba(255,255,255,.18)');
      c.fillStyle = 'rgba(255,215,106,0.22)';
      c.fillRect(bx, byy - bh, bw, 2);
    }
    /* 防线受损闪红 */
    const wr = r.wallHp != null ? r.wallHp / r.wallMax : (r.hp / r.maxHp);
    if (wr < 0.35) {
      c.fillStyle = 'rgba(255,60,90,' + (0.12 + (1 - wr / 0.35) * 0.20).toFixed(3) + ')';
      c.fillRect(0, wy - 6, W, 32);
    }

    /* ===== 玩家：立体立绘 + 手持武器（跟随瞄准） ===== */
    /* 瞄准角：朝向最近的僵尸，没有则朝上 */
    let aim = (r.aimA != null ? r.aimA : -Math.PI / 2);
    let nz = null, nd = 1e9;
    for (const z of r.zombies) {
      if (z.dead) continue;
      const dd = (z.x - r.px) * (z.x - r.px) + (z.y - r.py) * (z.y - r.py);
      if (dd < nd) { nd = dd; nz = z; }
    }
    if (nz) aim = Math.atan2(nz.y - r.py, nz.x - r.px);
    r.aimA = aim;

    /* 当前外观：优先皮肤立绘 → 角色立绘 → 头像立绘。
     * 这些都是深色底 JPG，统一走 SPR 抠底 + 轮廓光，避免"方纸片"。 */
    const skl = (window.EX && EX.skins ? EX.skins : []);
    const sk = skl.find((s) => s.id === (this.P && this.P.skin));
    const heroSrc = (sk && sk.img) || this.charImg || (this.P && this.P.avatarImg);
    const hsp = SPR.get(heroSrc);
    let heroDrawn = false;
    if (this.card3d) this.drawCard(c, r.px, r.py + 20, 60, 76, 'hero', { t: r.time || 0, ph: 0, sw: 0.85, glow: true });
    if (hsp) {
      const hh = 62, hw = hh * (hsp.w / hsp.h);
      const bx = r.px - hw / 2, by = r.py + 12 - hh;
      this.shadow3d(c, r.px, r.py + 12, 21, 1);
      this.drawSolid(c, hsp, bx, by, hw);
      if (hsp.rim) {
        const k = hw / hsp.w;
        c.drawImage(hsp.rim, bx - hsp.pad * k, by - hsp.pad * k,
          (hsp.w + hsp.pad * 2) * k, (hsp.h + hsp.pad * 2) * k);
      }
      c.drawImage(hsp.cv, bx, by, hw, hh);
      heroDrawn = true;
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
    /* 手持武器：跟随瞄准方向旋转 + 后坐力 + 枪口火光 */
    this.drawHeldGun(c, r, aim);
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
      const fs = this.depthScale(f.y);
      const px = (f.cls === 'crit' ? 17 : f.cls === 'hurt' ? 14 : 13) * fs;
      c.font = (f.cls === 'crit' ? 'bold ' : '') + px.toFixed(1) + 'px sans-serif';
      c.globalAlpha = al;
      /* 描边：让飘字在 3D 场景里不糊 */
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.65)';
      c.strokeText(f.v, f.x, f.y);
      c.fillStyle = f.cls === 'crit' ? '#ff4d6d' : f.cls === 'hurt' ? '#ff8fa4' : '#ffe9a8';
      c.fillText(f.v, f.x, f.y);
      c.globalAlpha = 1;
    }
  },
};

BT.joy = { x: 0, y: 0 };
BT.speed = 1;
BT.auto = true;
/* 战斗内 3D 卡片（僵尸/主角/武器）。关掉则退回原来的扁平+贴地阴影 */
BT.card3d = (window.EX && EX.CARD3D !== false);
window.BT = BT;
