/* =========================================================
 * battle.js —— 战斗引擎（俯视角 · 自动瞄准射击 · 换弹 · 3D 骨骼动画）
 * 依据资料：
 *   - GD-008 战斗系统（俯视角弹幕、自动瞄准、碰撞判定、穿透击退爆炸）
 *   - 06 操作方案（自动瞄准自动开火，R 换弹；虚拟摇杆已移除）
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
  /* 场景图 url 解析：优先读 EX.sceneImg（后台运营配置，可热更），
   * BT.SCENES 仅作兜底。
   * BUG（热更无效）：EX.sceneImg 与 BT.SCENES 是【两份内容完全相同】的映射
   *   （city/factory/wasteland/tunnel/field/snow 六个键、路径逐字一致），
   *   但 img() 与 start() 只读 BT.SCENES 那份硬编码，EX.sceneImg 全项目零引用。
   *   实测：把 EX.sceneImg.city 热更为任意新路径，
   *        BT.img('city') 仍解析到 assets/scene/city.jpg —— 运营改了等于没改。
   *   同类问题此前出在宝箱（双入口各写一份判定）与 BOSS 血量曲线
   *   （声明了却不吃难度曲线），这里同样按「以可热更的配置为准」统一。 */
  sceneUrl(key) {
    const m = (typeof EX !== 'undefined' && EX.sceneImg) || null;
    return (m && m[key]) || this.SCENES[key] || null;
  },
  img(key) {
    const v = this._imgs[key];
    if (v) return v;
    if (v === null && Date.now() - (this._imgFail[key] || 0) < 4000) return null;
    const url = this.sceneUrl(key); if (!url) { this._imgs[key] = null; return null; }
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
    /* attach 每局开战都会调用一次；旧的 resize 监听必须先移除，
     * 否则打了 N 局就累积 N 个监听器，一次转屏会触发 N 次 resize()。 */
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  },
  resize() {
    if (!this.cv) return;
    const cv = this.cv;
    /* 缩放挂在【整个战斗层】而不是画布本身：
     * HUD（暂停/倍速/自动/防线血条…）是 #battle 的绝对定位子元素、按屏幕边缘排版，
     * 只缩放画布的话画面缩到中间、HUD 仍贴屏幕边 → 横屏下按钮悬在画面外的黑边上。
     * 整体缩放 #battle，画面与 HUD 始终对齐。
     * 注：结算/暂停/三选一等 modal 挂在 #app 下、不在 #battle 内，不受缩放影响。 */
    const layer = document.getElementById('battle') || cv.parentElement;
    /* 先复位上一轮留下的缩放，否则 getBoundingClientRect 读到的是【缩放后】的尺寸，
     * 转屏 N 次就会连乘缩小 N 次（画面最后缩成一个点）。
     * 读取 rect 会强制同步布局，复位后立刻量到的是容器真实尺寸，安全。 */
    if (layer && layer.style.transform) { layer.style.transform = ''; layer.style.width = ''; layer.style.height = ''; }
    const b = cv.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    /* 最低可玩区：低于此值防线、血条、按钮会挤成一团 */
    const MINW = 300, MINH = 520;
    this.W = Math.max(MINW, b.width || 390); this.H = Math.max(MINH, b.height || 693);
    this.wallY = this.H - 96;
    cv.width = this.W * d; cv.height = this.H * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    /* 容器小于最低可玩区时等比缩放整个战斗层。
     * 典型场景：手机横屏 852×393 —— 容器高 393 < MINH 520。
     * 修复前：逻辑高度被抬到 520，画布却仍按 CSS 100% 高度（393）显示，
     *   ① 画面被纵向压扁（逻辑 852×520 挤进 852×393，纵向压缩 0.756）
     *   ② wallY = 520-96 = 424 落在可视区 393 之外，玩家看不见自己的防线，
     *      僵尸明明已经推到防线，画面上却还在屏幕外。
     * 修复后：整层等比缩小并居中，画面完整、比例正确、HUD 对齐。
     * 战斗无触摸坐标映射（自动射击），缩放不影响任何操作。 */
    const sx = b.width > 0 ? b.width / this.W : 1;
    const sy = b.height > 0 ? b.height / this.H : 1;
    const s = Math.min(1, sx, sy);
    if (layer) {
      if (s > 0 && s < 0.999) {
        /* 战斗层先撑到【逻辑尺寸】，再整体缩放居中。
         * 只 scale 不撑盒的话：#battle 仍是 852×393，画布 CSS 100% 高 = 393，
         * 位图 852×520 照样被拉伸进 393 高 → 画面依旧纵向压扁。
         * 撑盒后画布 = 852×520 与位图同比，HUD 也按同一坐标系排版，再整体缩放。 */
        layer.style.width = this.W + 'px';
        layer.style.height = this.H + 'px';
        layer.style.transformOrigin = 'top left';
        const ox = (b.width - this.W * s) / 2, oy = (b.height - this.H * s) / 2;
        layer.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
      } else {
        layer.style.transform = ''; layer.style.width = ''; layer.style.height = '';
      }
    }
    this._cvScale = s > 0 ? s : 1;
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
      /* 无尽模式章节：用真实进度章节（回头重打旧关卡不会把档位打回第 1 章） */
      const ch = p ? Math.max(1, (E.progressChapter ? E.progressChapter(p) : (E.chapterOf ? E.chapterOf(p.curLevel || '1-1') : 1))) : 1;
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
    const d = EX.levels.find((x) => x.id === levelId) || EX.levels[0]
      /* 兜底：关卡表被清空时 find 与 [0] 都为 undefined，读 d.id 直接抛错
       * → 进战斗即白屏。给一个可打的内置关卡，保证游戏永远进得去。 */
      || { id: levelId || '1-1', ch: 1, n: '废弃街道', waves: 20, pool: [],
           per: [8, 20], mul: 1, cond: 'clear', boss: null, scene: 'city', rw: { gold: 500 } };
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
    /* 必须把玩家 p 传进去：levelDef 内部靠它算无尽模式的章节 ch 与收益倍率。
     * 此前漏传 → levelDef 里 `p ? ... : 1` 全部走兜底，实测（玩家在 10-10）：
     *   不传 p：ch=1   → 掉落表按第 1 章过滤，后期稀有金属/角色碎片永远掉不出来
     *   传   p：ch=10  → 掉落档位随进度正确提升
     * 后果是「无尽模式越打越深，掉落却永远停在第 1 章水平」，
     * 玩家打到第 50 波拿到的还是新手材料。 */
    const def = this.levelDef(levelNo, p);
    const a = E.attrs(p);
    /* 表16：战斗外使用的消耗品，在开局统一生效
     * 【注意】不能在这里调：此时 this.run 还是【上一局的残骸或未定义】，
     *         applyItem() 会把 护盾/回血/攻击buff 写到旧 run 上，
     *         紧接着下面 `this.run = {...}` 整体覆盖 → 效果全部蒸发。
     *         实测：战斗外用急救包 → 提示「下一场自动生效」→ 开局血量纹丝不动。
     *        必须挪到 run 创建之后（见下方 start 末尾）。 */
    this.charImg = (E.char(p) || {}).img || null;
    this.P = p; this._heroImg = undefined;
    /* Q 版贴图预载：进关立即拉齐本关怪物池 + 当前武器的图，
     * 避免开局先画几帧矢量骨骼、再突变成立绘（视觉上像"变形"）。
     * 预载失败/超时一律自动退回原来的画法，不影响任何玩法。 */
    try {
      if (typeof CHIBI !== 'undefined' && CHIBI && def) {
        const ks = [];
        const pool = def.pool || [];
        const ztab = (typeof EX !== 'undefined' && EX.zombies) ? EX.zombies : [];
        for (const id of pool) {
          for (const z of ztab) if (z.id === id && z.chibi && ks.indexOf(z.chibi) < 0) ks.push(z.chibi);
        }
        const gk = CHIBI.keyOfGun((p && (p.gunId || p.gun)) || null);
        if (gk) ks.push(gk);
        /* 四种 Q 版炮台一并预载：局内随时可能建造，
         * 若不预载会出现先画矢量色块、再突变成立绘的"变形" */
        if (EX.turrets) {
          for (const td of EX.turrets) {
            const tk = CHIBI.keyOfTurret(td.id);
            if (tk && ks.indexOf(tk) < 0) ks.push(tk);
          }
        }
        ks.push('hero_base');
        /* 已雇佣的佣兵一并预载：否则开局先画几何色块、图到了再突变，观感突兀 */
        try {
          for (const mid of (p && p.mercs ? p.mercs : [])) {
            const mk = CHIBI.keyOfMerc(mid);
            if (mk && ks.indexOf(mk) < 0) ks.push(mk);
          }
        } catch (e) { /* 佣兵预载失败不影响战斗 */ }
        CHIBI.preload(ks);
      }
    } catch (e) { /* 预载失败不影响战斗 */ }
    /* 场景：优先用关卡表逐关配置的 scene
     * BUG：此前恒用 sceneFor(def.ch)（按章节号一刀切），
     * 关卡表里 100 关逐个配的 scene 字段从未被消费 —— 实测 86/100 关场景与配置不符
     * （如 1-10 BOSS 关配了 snow，实际渲染 city；第 2 章 10 关全配 tunnel，实际全 factory）。
     * 现在按关卡配置取，缺配/非法值回退按章节推算。 */
    this.scene = (def.scene && this.sceneUrl(def.scene)) ? def.scene : this.sceneFor(def.ch);
    this.img(this.scene);
    /* 无尽模式：按玩家进度章节取关（见 levelDef 注释） */
    if (def.endless && p) def.ch = Math.max(1, (E.progressChapter ? E.progressChapter(p) : (E.chapterOf ? E.chapterOf(p.curLevel || '1-1') : 1)));

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
      /* 角色 id：角色天赋（C02 医疗兵「战地急救」）按此判定 */
      charId: (p && p.char) || 'C01',
      atk: a.atk, rate: a.rate, range: a.range, pierce: a.pierce, spread: a.spread,
      pellets: a.pellets || 1, crit: a.crit, critDmg: a.critDmg, moveSpd: a.moveSpd,
      /* 后坐力倍率（武器表 recoil 低0.55/中1.0/高1.6）
       * 此前 attrs() 已算出 a.recoil，但 run 里【没有这个字段】
       * → 绘制层读 r.recoil 恒为 undefined → Number() 后 NaN → 兜底成 1
       * → 三档后坐力实测完全一致（低1.11/中0.95/高0.57px，且与配表无关）。 */
      recoil: Number(a.recoil) > 0 ? Number(a.recoil) : 1,
      shakeT: 0, shakeX: 0, shakeY: 0,
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
      lv: 1, xp: 0, xpNeed: 18, killXp: 0,   /* killXp：本局击杀经验基数，结算角色经验用 */
      gold: 0, kills: 0, time: 0, over: false,
      /* 无伤连杀：成就 A02「十连斩」的记录源。
       * 此前结算只认「整场满血通关」，然后拿【整场总击杀数】当进度：
       *   掉 1 点血 → 0；满血通关 → 一次跳到几十/几百（v 只有 10，形同虚设）。
       * 且无尽永不 win → 恒 0，该成就在无尽里永远拿不到。
       * 改为按语义记「连续击杀且期间未掉血」的最大段。 */
      noHitStreak: 0, noHitMax: 0,
      reviveLeft: a.revive, novaT: 0, auraT: 0,
      /* 玩家护甲：此前 run 里根本没有这个字段，
       * 而 hurtPlayer() 也不读它 → 护甲养成线（天赋/芯片/皮肤/角色表）全废 */
      armor: Number(a.armor) || 0,
      poison: 0, poisonT: 0, hitFlash: 0,
      /* 麻痹（电磁僵尸「电弧」）：命中后玩家短暂无法开火 */
      paraT: 0,
      boss: null, bossPhase: 0, warned: false,
      /* 难度（普通/困难/恶魔）：倍率在关卡强度 mul 之上再乘一层 */
      diff: (E.diffDef ? E.diffDef(opt.diff).id : 'normal'),
      diffMul: (E.diffMul ? E.diffMul(opt.diff) : { id: 'normal', n: '普通', hp: 1, dmg: 1, cnt: 1, spd: 1, rw: 1, stam: 1 }),
    };
    /* 带上基地已招募的佣兵 */
    const _r = this.run;
    /* 难度收益系数【只作用于结算】，不并入 rwMul
     * 重要：rwMul 同时是【局内经济】的系数（击杀金币、局内升级奖励、炮台购买力）。
     * 若把难度 ×6.5 并进去，恶魔难度一局能升到 Lv16、炮台随便买 ——
     * 玩家实际强度膨胀得比怪物还快，难度越高反而越轻松（实测：恶魔 1-1
     * 局内升级次数 15 次 vs 普通 8 次）。
     * 正确切分：
     *   局内（击杀金币/经验、升级奖励）= 关卡倍率，不随难度放大 → 高难度真的更难
     *   结算（关卡奖励、材料、角色经验）= 再乘难度倍率 → 高难度回报更高 */
    _r.diffRw = _r.diffMul.rw || 1;
    for (const mid of (p.mercs || [])) {
      const md = EX.mercs.find((x) => x.id === mid); if (!md) continue;
      _r.mercs.push({ def: md, x: this.W * (0.28 + _r.mercs.length * 0.18), y: this.H - 74, cd: 0 });
    }
    /* ===== 支援武器槽（p.gun2）=====
     * 医疗包 S07 / 护盾发生器 S08 走这条独立链路：不占出战武器、不参与伤害，
     * 按武器表自己的 rate / mag / reload 自动循环，触发治疗与护盾。
     * 此前这两把枪只能躺在图鉴里（dmg=0 → 装备即必败，只能禁止装备）。 */
    const _sg = (typeof E !== 'undefined' && E.gun2) ? E.gun2(p) : null;
    _r.sup = _sg ? {
      id: _sg.id, n: _sg.n, icon: _sg.icon || '🩹',
      heal: Number(_sg.heal) || 0, shield: Number(_sg.shield) || 0,
      rate: Math.max(0.05, Number(_sg.rate) || 0.5),
      magMax: Math.max(1, Math.round(Number(_sg.mag) || 1)),
      reload: Math.max(0.2, Number(_sg.reload) || 3),
      mag: Math.max(1, Math.round(Number(_sg.mag) || 1)),
      cd: 1.2, reloadT: 0, reloading: false,
      /* 开局给 1.2 秒缓冲，避免刚进场就弹治疗提示 */
    } : null;
    /* 战斗外预置的消耗品：必须在 run 创建【之后】才生效
     * （此前放在 start() 开头，被 this.run = {...} 覆盖，等于白用） */
    try { if (E.applyPendingItems) E.applyPendingItems(p); } catch (e) {}
    /* 局内「刷新选项」次数必须在开局重置。
     * 此前 UI.rfLeft 只在首次为 null 时赋 1（`this.rfLeft == null ? 1 : this.rfLeft`），
     * 于是上一局用掉后值停在 0，之后每一局都永远没有刷新机会（按钮恒灰）。 */
    if (window.UI) UI.rfLeft = 1;
    this.on = true; this.paused = false;
    /* 表04 VO_001 进入战斗：此前整表 10 条里只有 003~008 接了线，
     * VO_001/002/009/010 的台词与合成音效（audio.js 的 sfx 'start'/'wave'/
     * 'upgrade'/'rare'）全都做好了却从没触发过 —— 玩家进关与每波开打
     * 都听不到、也看不到任何提示。这里补上开局这一句。 */
    try { if (window.VO) VO.say('VO_001'); } catch (e) {}
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
    /* 表04 VO_002 波次开始：第 1 波由 VO_001（进入战斗）覆盖，避免开局连出两句 */
    if (w > 1) { try { if (window.VO) VO.say('VO_002'); } catch (e) {} }
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
    /* 难度：每波数量再乘 cntMul（恶魔 ×1.6，封顶放宽到 90 免得倍率被吃掉） */
    const cnt = (r.diffMul && r.diffMul.cnt) || 1;
    /* 每波数量章节倍率
     * 逻辑缺陷：此前每波数量只由关卡表 per 与难度 cnt 决定，与章节无关，
     *   再叠加 90 只硬封顶 —— 后期章节的场上密度上不去。
     *   实测满配玩家打 10-10：20 波共 743 只、252 秒清完，防线只掉 4.9% 血，
     *   全程毫发无伤（剩血 97%），「过关太简单」的根源就在这里：
     *   刷怪速率（约 1.8 只/秒）远低于玩家清理速率（约 3 只/秒），
     *   怪永远在被杀光之前就到不了防线，提高血量/伤害都无效。
     * 现在按章节递增，并放宽封顶（同屏上限另有约束，不会失控）。 */
    const _ch = (r.def && r.def.ch) || d.ch || 1;
    const perMul = (EX.HARD_ON === false) ? 1 : (1 + (_ch - 1) * (EX.WAVE_PER_STEP || 0));
    r.spawnLeft = Math.min(EX.WAVE_PER_CAP || 90,
      Math.round((isBossWave ? base * 0.7 : base) * cnt * perMul));
    r.spawnT = 0; r.spawnGap = Math.max(0.18, 0.60 - w * 0.05);
    /* 本波刷怪统计：供 spawn 处做高威胁怪限流（30% 上限） */
    /* 注意：r.waveTotal 是【总波数】(def.waves)，被波次推进用于判定最后一波。
     * 这里统计的是【本波刷怪数】，必须用不同名字，否则会覆盖总波数，
     * 导致 wave >= 刷怪数 时误判成最后一波 → 提前通关。 */
    r.waveSpawnN = r.spawnLeft; r.waveHiN = 0;
    /* 【表03 FX_WaveStart】波次来袭扫描带：新一波开始时的视觉提示 */
    if (w > 1 && r.efx && r.efx.length < 90) {
      r.efx.push({ t: 'wavestart', x: 0, y: (r.py || 400) - 40, w: this.w || 480, life: 0.7, max: 0.7 });
    }
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
    /* ===== BOSS 血量的章节难度曲线（本次修复）=====
     * 逻辑不一致：mkZ 里普通僵尸的血量走 `d.hp * mul * dm.hp * _hb`，
     *   完整吃到全局难度曲线（HARD_HP_ 系列与章内梯度）；而 BOSS 走 hpOverride
     *   分支 `hpOverride * dm.hp`，【完全跳过 _hb 与章内梯度】。
     *   与此同时，BOSS 的伤害和移速却照常吃了 _db / _sb ——
     *   即"怪变疼了、变快了，唯独 BOSS 没变肉"。
     * 实测后果（模拟玩家，普通难度，BOSS 从出场到死亡的秒数）：
     *     3-10 开垦者  12 秒      8-10 修道士   9 秒
     *     5-10 巢穴之母 17 秒     10-10 尸王    6 秒
     *   章节越往后 BOSS 反而死得越快（终局 BOSS 只活 6 秒），
     *   而配置注释写明的设计意图是「对应武器等级 DPS × 25~40 秒」。
     *   玩家全程剩血 98~100%，终章 BOSS 战毫无存在感。
     * 这里给 BOSS 补一条独立的章节曲线（不乘关卡 mul，避免 5.4 亿不可通关），
     * 章内梯度按半权接入。无尽模式不受影响（无章节，仍走波次递增）。 */
    let _bhb = 1;
    if (!r.endless && typeof EX !== 'undefined' && EX.BOSS_HP_ON !== false) {
      const _bch = Number((r.def && r.def.ch) || 1);
      _bhb = (Number(EX.BOSS_HP_BASE) || 1) + (_bch - 1) * (Number(EX.BOSS_HP_STEP) || 0);
      if (EX.INCH_ON) {
        let _bidx = Number(String((r.def && r.def.id) || '').split('-')[1]);
        if (!isFinite(_bidx) || _bidx < 1 || _bidx > 10) _bidx = 1;
        _bhb *= 1 + (_bidx - 1) * (Number(EX.INCH_HP_STEP) || 0) * (Number(EX.BOSS_INCH_MUL) || 0.5);
      }
    }
    const bossHp = Math.round(d.hp * multi * _bhb * (r.endless ? 1 + (r.wave - 1) * 0.35 : 1));
    const z = this.mkZ(d, mul, bossHp);
    z.isBoss = true; z.bossDef = d; z.phase = 0; z.maxHp = z.hp; z.img = d.img;
    r.boss = z; r.zombies.push(z);
    /* 【表03 FX_BossRoar】BOSS 出场怒吼：此前只有模型变大，没有任何出场演出 */
    if (r.efx && r.efx.length < 90) r.efx.push({ t: 'roar', x: z.x, y: z.y, r: 130, life: 0.9, max: 0.9 });
    /* 表04 VO_003 BOSS出现：此前 BOSS 出场只有画面变化，没有任何语音/字幕提示 */
    try { if (window.VO) VO.say('VO_003'); } catch (e) {}
  },

  mkZ(d, mul, hpOverride) {
    /* 难度倍率：血量/伤害/移速在关卡强度之上再乘一层
     * （恶魔 5.5 倍血 + 2.2 倍伤害，靠的是这里，不是改关卡表） */
    const dm = (this.run && this.run.diffMul) || { hp: 1, dmg: 1, spd: 1 };
    /* 兜底：僵尸表被清空时，关卡 pool 里的 id 全部找不到定义 → d 为 undefined
     * → 读 d.hp 抛错，战斗一开波就崩（整页白屏、无任何提示）。
     * 给一个能打死的占位怪，保证「表坏了也能进战斗」而不是直接玩不了。 */
    if (!d || typeof d !== 'object') {
      d = { id: 'z_placeholder', n: '感染者', icon: '🧟', hp: 100, spd: 58, dmg: 8,
            atkR: 30, gold: 10, xp: 4, def: 0 };
    }
    /* 波次伤害递增（仅无尽）：
     * 此前无尽只放大血量（mul 每波 +0.35），伤害【完全不随波次变】
     *   → 怪越来越肉但打人不痛 → 防线永远满血 → 无尽可以无限刷，
     *     实测 lv25 打到第 50 波仍是 636/636，挑战性为零。
     * 现在伤害同步递增（每波 +10%，上限 4 倍），无尽才真的会失败。 */
    const wv = (this.run && this.run.endless)
      ? Math.min(4, 1 + Math.max(0, (this.run.wave - 1)) * 0.10)
      : 1;
    /* 全局难度曲线（EX.HARD_*）：在「关卡强度 × 难度倍率」之上再乘一层。
     * 系数只取关卡所属章节，同章 10 关一致，避免难度忽高忽低。 */
    let _hb = 1, _db = 1, _sb = 1;
    if (typeof EX !== 'undefined' && EX.HARD_ON) {
      const _ch = Number((this.run && this.run.def && this.run.def.ch) || 1);
      _hb = (Number(EX.HARD_HP_BASE) || 1) + _ch * (Number(EX.HARD_HP_STEP) || 0);
      _db = (Number(EX.HARD_DMG_BASE) || 1) + _ch * (Number(EX.HARD_DMG_STEP) || 0);
      _sb = (Number(EX.HARD_SPD_BASE) || 1) + _ch * (Number(EX.HARD_SPD_STEP) || 0);
      /* 章内梯度：同一章第 1 关最弱、第 10 关最强。
       * 关内序号从关卡 id（如 '5-7'）取，解析失败则退化成第 1 关，
       * 保证任何异常 id 都不会把强度算成 NaN 或 Infinity。 */
      if (EX.INCH_ON) {
        const _id = String((this.run && this.run.def && this.run.def.id) || '');
        const _seg = _id.split('-')[1];
        let _idx = Number(_seg);
        if (!isFinite(_idx) || _idx < 1 || _idx > 10) _idx = 1;
        const _k = _idx - 1;
        _hb *= 1 + _k * (Number(EX.INCH_HP_STEP) || 0);
        _db *= 1 + _k * (Number(EX.INCH_DMG_STEP) || 0);
        _sb *= 1 + _k * (Number(EX.INCH_SPD_STEP) || 0);
      }
    }
    const hp = hpOverride != null ? Math.round(hpOverride * dm.hp) : Math.round(d.hp * mul * dm.hp * _hb);
    return {
      d, id: d.id, n: d.n, icon: d.icon, img: d.img,
      x: 0, y: 0, hp, maxHp: hp, spd: d.spd * dm.spd * _sb, dmg: d.dmg * dm.dmg * wv * _db, atkR: d.atkR,
      ai: d.ai, def: d.def || 0, front: d.front || 0, fly: !!d.fly,
      slow: 0, slowT: 0, burn: 0, burnT: 0, atkCd: 0, dashT: 0, facing: 0,
      /* BOSS 近身（contact）技能的独立冷却，见 update 里的派发 */
      skCd: 0,
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
    /* BUG修复：mapLayouts 只配了 1-1~3-3 共 10 关，关卡表却有 100 关。
     * 原写法 `if (!lay) return` 会在无专属布局时把 obstacles/barrels 清空，
     * 实测 1-5 起（含第 4~10 章全部 70 关）共 90 关战场掩体=0、油桶=0 ——
     * 掩体阻挡、油桶击破爆炸与连锁引爆这两条玩法从第 1 章中段起整体消失，
     * 玩家打到 1-5 就会发现掩体和油桶凭空不见了。
     * 现在无专属布局时按章节生成默认布局，掩体名沿用地图表已有词库。
     * （mapLayouts 里的 terrain 字段此前全项目零读取，这里一并用于命名。） */
    const ch = Math.max(1, Number(r.def.ch) || parseInt(String(r.def.id).split('-')[0], 10) || 1);
    let coverDefs, barrelN;
    if (lay && (lay.covers || []).length) {
      coverDefs = lay.covers || [];
      barrelN = lay.barrels || 0;
    } else {
      const pool = [];
      Object.keys(EX.mapLayouts || {}).forEach((k) => {
        ((EX.mapLayouts[k] || {}).covers || []).forEach((c) => { if (c && c[0]) pool.push(c[0]); });
      });
      if (!pool.length) pool.push('掩体');
      coverDefs = [[pool[(ch - 1) % pool.length], 4 + (ch % 3)]];
      barrelN = 2 + Math.floor(ch / 2);
    }
    /* 掩体：随机分布在中上部战场 */
    let total = 0; coverDefs.forEach((c) => { total += (c && c[1]) || 0; });
    total = Math.min(total, 8);
    for (let i = 0; i < total; i++) {
      const cd = coverDefs[i % coverDefs.length] || ['掩体', 1];
      r.obstacles.push({
        n: cd[0], x: 30 + Math.random() * (this.W - 60),
        y: this.H * 0.22 + Math.random() * (this.H * 0.36),
        w: 22 + Math.random() * 16, h: 12 + Math.random() * 8,
        hp: EX.COVER_HP, maxHp: EX.COVER_HP, dead: false,
      });
    }
    /* 油桶：可破坏，爆炸伤僵尸
     * 注意用 barrelN（默认布局时为按章节推算值），lay 可能为 undefined。 */
    for (let i = 0; i < (barrelN || 0); i++) {
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
  /* ===== 护盾上限 =====
   * 严重BUG：护盾此前【完全没有上限】，而 maxShield 记的是【历史最高值】：
   *   ① 护盾发生器每 11.3s（3.3s 一发 + 8s 换弹）+420 且从不封顶 —— 实测
   *      1-1 普通打完 111 秒就叠到 4200，是防线血量 636 的 6.6 倍；
   *      无尽模式能跑 900s，按同速率是 33000+ ≈ 防线的 50 倍。
   *   ② 更致命：onLose / revive 里写的是 r.shield = r.maxShield，
   *      一旦护盾曾叠到 30000，之后【每次复活都回满 30000 护盾】，
   *      而防线血量才 1000 —— 实测复活后 shield=30000 / hp=1000，永久无敌。
   * 现在统一按「防线最大血量 × SHIELD_CAP_MUL」封顶，护盾只作为一层额外
   * 防护，不再能靠时间堆成无敌。改这一个常量即可整体调节。 */
  SHIELD_CAP_MUL: 1.5,
  shieldCap(r) {
    const wm = Number(r && (r.wallMax != null ? r.wallMax : r.maxHp)) || 0;
    const dyn = wm * this.SHIELD_CAP_MUL;
    /* 天赋/芯片 stat:'shield' 给的是【一次性固定值】，不该被这条持续累积的
     * 封顶削掉（当前配置里没有，但后台热更可能加），取两者较大值。 */
    const fixed = Number(r && r.mods && r.mods.shield) || 0;
    return Math.max(dyn, fixed);
  },
  /* 所有加盾/回盾的入口都要过一遍，避免某条路径绕过封顶 */
  capShield(r) {
    if (!r) return;
    const cap = this.shieldCap(r);
    if (!(cap > 0)) return;
    r.shield = Math.max(0, Math.min(Number(r.shield) || 0, cap));
    r.maxShield = Math.max(0, Math.min(Number(r.maxShield) || 0, cap));
  },
  /* ===== 支援武器槽：自动循环 =====
   * 医疗包：按周期治疗防线；护盾发生器：按周期叠护盾。
   * 用武器表自带的 mag/reload 控制节奏 —— 打完弹匣要换弹，
   * 所以不是「每秒无限回血」，而是有明确空窗期的续航手段。 */
  tickSupport(dt) {
    const r = this.run; if (!r || !r.sup || r.over) return;
    const s = r.sup;
    if (s.reloading) {
      s.reloadT -= dt;
      if (s.reloadT <= 0) { s.reloading = false; s.mag = s.magMax; }
      return;
    }
    s.cd -= dt;
    if (s.cd > 0) return;
    s.cd = 1 / s.rate;
    s.mag--;
    /* 治疗：只补防线，不溢出；已满血时不浪费这一发（不扣弹匣） */
    if (s.heal > 0) {
      const wm = r.wallMax || r.maxHp || 1;
      const cur = (r.wallHp != null ? r.wallHp : r.hp);
      if (cur >= wm - 0.5) { s.mag++; return; }   /* 满血：本次不消耗 */
      r.wallHp = Math.min(wm, cur + s.heal);
      r.hp = r.wallHp;
      if (r.efx && r.efx.length < 90) r.efx.push({ t: 'heal', x: r.px, y: (r.py || 400) - 20, life: 0.7, max: 0.7 });
      try { if (window.UI && UI.toast) UI.toast('🩹 ' + s.n + ' 防线 +' + Math.round(s.heal)); } catch (e) {}
    }
    /* 护盾：叠加，上限同步抬高（否则加了立刻被 maxShield 夹掉）
     * 满盾时不消耗这一发（与治疗一致），避免站着不动也白扔盾。 */
    if (s.shield > 0) {
      const _cap = this.shieldCap(r);
      const _curS = Number(r.shield) || 0;
      if (_cap > 0 && _curS >= _cap - 0.5) { s.mag++; return; }
      r.shield = _curS + s.shield;
      r.maxShield = Math.max(Number(r.maxShield) || 0, r.shield);
      this.capShield(r);
      if (r.efx && r.efx.length < 90) r.efx.push({ t: 'shieldon', x: r.px, y: (r.py || 400) - 20, life: 0.8, max: 0.8 });
      try { if (window.UI && UI.toast) UI.toast('🛡️ ' + s.n + ' 护盾 +' + Math.round(s.shield)); } catch (e) {}
    }
    if (s.mag <= 0) { s.reloading = true; s.reloadT = s.reload; }
  },

  tick(dt) {
    const r = this.run; if (!r || r.over) return;
    r.time += dt;
    if (r.hitFlash > 0) r.hitFlash -= dt;
    if (r.muzzleT > 0) r.muzzleT = Math.max(0, r.muzzleT - dt);   /* 枪口火光计时 */
    /* 屏幕震动衰减：由开火触发，强度按武器表 recoil（低0.55/中1.0/高1.6） */
    if (r.shakeT > 0) {
      r.shakeT = Math.max(0, r.shakeT - dt);
      const amp = (Number(r.recoil) || 1) * 1.7 * (r.shakeT / 0.09);
      r.shakeX = (Math.random() * 2 - 1) * amp;
      r.shakeY = (Math.random() * 2 - 1) * amp * 0.7;
    } else { r.shakeX = 0; r.shakeY = 0; }
    for (const z of r.zombies) if (z.hitT > 0) z.hitT = Math.max(0, z.hitT - dt);
    this.tickBuffs(dt);            /* 消耗品增益计时（I03 攻击 +30%） */
    this.tickSupport(dt);          /* 支援武器槽（医疗包回血 / 护盾发生器加盾） */

    /* --- 瞄准 --- 摇杆已移除，改为全自动锁定最近目标（r.aiming 恒为 false） */
    r.aiming = false;

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
      if (!tg) {
        const rr = (isFinite(Number(r.range)) && Number(r.range) > 0) ? Number(r.range) : 380;
        tg = this.nearest(r.px, r.py, null, rr);
        /* ---- 射程防卡关兜底 ----
         * 现在射程真正生效后，存在一种极端情况：某只僵尸因 AI 或位置原因
         * 永远停在射程外（例如远程僵尸 atkR 大于武器射程、或被卡在地图边缘），
         * 则永远打不到它 → 该波清不完 → 卡死。
         * 兜底：射程内持续 RANGE_STALL_GUARD 秒无目标时，临时解除射程限制，
         * 保证任何局面下玩家都打得出去（正常情况根本不会触发）。 */
        if (!tg) {
          r.noTgT = (Number(r.noTgT) || 0) + dt;
          const guard = Number((typeof EX !== 'undefined' && EX.RANGE_STALL_GUARD) || 2.5);
          if (r.noTgT > guard) tg = this.nearest(r.px, r.py, null, 9999);
        } else { r.noTgT = 0; }
      } else { r.noTgT = 0; }
      if (tg) {
        /* 寒霜减速：冰霜僵尸接触后我方射速下降（r.chillMul < 1） */
        const _cm = (r.chillT > 0 && r.chillMul > 0) ? r.chillMul : 1;
        r.shootT = 1 / Math.max(0.05, r.rate * (1 + r.mods.rateMul) * _cm);
        this.shoot(tg);
      }
    }
    if (!r.reloading && r.mag <= 0) this.reload();

    /* --- 生成 --- */
    /* --- 炮台自动开火 --- */
    for (const t of r.turrets) {
      /* 等级钳制（防御）：炮台的伤害/射程/射速/绘制尺寸全部随 lv 线性放大，
       * 若 lv 被写成 NaN、负数或超出上限（热更/改档/旧档），
       * 会让炮台伤害失控或模型撑爆屏幕。这里统一收紧到 [1, TURRET_MAX_LV]。 */
      t.lv = Math.min(Math.max(Number(t.lv) || 1, 1), EX.TURRET_MAX_LV != null ? EX.TURRET_MAX_LV : 20);
      t.cd -= dt;
      if (t.fire > 0) t.fire -= dt;   /* 开火后坐动画计时（Q 版炮台） */
      if (t.cd > 0) continue;
      const tz = this.nearest(t.x, t.y, null, t.def.rng + t.lv * 12,
        { preferElite: t.def.preferElite });
      if (!tz) continue;
      t.cd = 1 / (t.def.rate * (1 + t.lv * 0.12));
      /* 开火表现：后坐动画 + 炮口元素闪光。
       * 此前炮台开火只飞出一枚子弹，画面上没有任何开火反馈，
       * 玩家分不清炮台到底有没有在工作。 */
      t.fire = 0.22;
      t.ang = Math.atan2(tz.y - t.y, tz.x - t.x);
      if (r.efx && r.efx.length < 90) {
        const mx = t.x + Math.cos(t.ang) * 20, my = t.y - 13 + Math.sin(t.ang) * 20;
        r.efx.push({
          t: 'tfire', x: mx, y: my, a: t.ang, el: t.def.el,
          r: 14 + t.lv * 1.5, life: 0.24, max: 0.24
        });
      }
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
      /* 「点杀精英」：M_JZ 的 desc 承诺优先精英，此前 nearest 纯按距离，
       * 实测近处普通(166) 与远处精英(221) 并存时锁定的是普通僵尸。
       * nearest 已支持 preferElite（狙击炮台在用），这里按配置接上。 */
      const mz = this.nearest(m.x, m.y, null, m.def.rng,
        m.def.elite ? { preferElite: true } : null);
      if (!mz) continue;
      /* 除零防护：后台热更若把 rate 改成 0，1/0 = Infinity
       * → 冷却永远走不完 → 雇佣兵静默失效（不报错，但再也不开火）。
       * 这里兜底为至少 0.05 秒一发。 */
      m.cd = 1 / Math.max(0.05, m.def.rate || 0);
      /* 佣兵伤害同样不随章节缩放（狙击手 90 伤害 vs 第10章 3953 血 = 44 发），
       * 花 800~1600 金币招募的佣兵后期完全打不动，一并按关卡倍率缩放。 */
      const mdmg = m.def.dmg * (1 + r.mods.dmgMul) * (r.def.rwMul || 1);
      /* 「扇形霰弹」：M_SD 的 desc 承诺扇形，此前一律单发（实测一次开火 1 颗）。
       * 现在按 pellets/spread 打出扇形弹幕；pellets 缺省为 1 即保持单发。 */
      const pellets = Math.max(1, Math.floor(Number(m.def.pellets) || 1));
      const spread = Number(m.def.spread) || 0;
      const mercOpt = { pierce: m.def.id === 'M_SJ' ? 3 : 0, from: 'merc', el: '物' };
      if (pellets <= 1 || !spread) {
        this.spawnBullet(m.x, m.y, mz, mdmg, mercOpt);
      } else {
        const a0 = Math.atan2(mz.y - m.y, mz.x - m.x);
        const dist = Math.hypot(mz.x - m.x, mz.y - m.y) || 1;
        for (let s = 0; s < pellets; s++) {
          const a = a0 + (s - (pellets - 1) / 2) * spread;
          this.spawnBullet(m.x, m.y,
            { x: m.x + Math.cos(a) * dist, y: m.y + Math.sin(a) * dist },
            mdmg, mercOpt);
        }
      }
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
        /* ---------------- 刷怪取种：分层 + 限流 ----------------
         * 两个实测出来的逻辑问题：
         * ① 新手期刷高速怪：1-1 怪物池只有 2 种，其中一种是疾跑僵尸（130 速，
         *    普通僵尸才 58）。第 1 关第 1 波就有 50% 概率刷出拦不住的高速怪，
         *    实测装备更好的账号反而更容易输（1-5 恶魔：枪15 存活 / 枪20 团灭）
         *    —— 难度由运气决定，不是由装备决定。
         * ② 高威胁怪无比例上限：整波都可能是疾跑/自爆/重甲，一波直接压垮防线。
         * 现在：第 1~2 章不刷 spd>=110 的怪；单波高威胁怪占比封顶 30%。 */
        const _CH = r.ch || 1;
        const _zOf = (id) => EX.zombies.find((x) => x.id === id);
        const _isHi = (z) => !!z && (z.spd >= 100 || z.dmg >= 26 || z.hp >= 300 || (z.def || 0) >= 0.4);
        let _pool = (r.def.pool || []).filter((id) => {
          const z = _zOf(id);
          if (!z) return false;
          if (_CH <= 2 && z.spd >= 110) return false;   /* 新手期不刷高速怪 */
          return true;
        });
        if (!_pool.length) _pool = (r.def.pool || []).slice();
        if (!_pool.length) _pool = ['putong'];
        let id = _pool[Math.floor(Math.random() * _pool.length)];
        /* 高威胁限流：本波已刷的高威胁数达上限时，改用普通怪（若有） */
        const _hiCap = Math.max(1, Math.ceil((r.waveSpawnN || r.spawnLeft || 1) * 0.30));
        if (_isHi(_zOf(id)) && (r.waveHiN || 0) >= _hiCap) {
          const _low = _pool.filter((x) => !_isHi(_zOf(x)));
          if (_low.length) id = _low[Math.floor(Math.random() * _low.length)];
        }
        const d = _zOf(id) || EX.zombies[0];
        if (_isHi(d)) r.waveHiN = (r.waveHiN || 0) + 1;
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
          /* 锁定目标死亡后【重新锁定】，而不是让整段激光直接消失。
           * BUG：配置 laserDur=3.0（180 帧），但原实现一旦 target.dead
           *   就把 zone 整个删掉。而激光 DPS 极高，往往几帧就把锁定目标打死，
           *   于是"持续灼烧 3 秒"实际只烧了 4 帧（0.07 秒）——
           *   实测（关闭玩家射击、只统计技能伤害，Lv5）：
           *     制导激光  存续 4 帧 / 伤害 2,490
           *     燃油弹    存续 509 帧 / 伤害 14,066
           *     旋风加农  存续 420 帧 / 伤害 4,162
           *     冰暴      存续 390 帧 / 伤害 32,428
           *   同为持续型技能，制导激光的收益只有燃油弹的 1/5.6、冰暴的 1/13，
           *   而它的 desc 写的是「自动锁定最近僵尸持续激光灼烧」——
           *   锁定是"自动"的，就应当在目标倒下后自动换下一个。
           * 现在只有场上真的没有活僵尸时才结束。（激光总时长仍受 life 限制） */
          let tg = zn.target;
          if (!tg || tg.dead) {
            tg = this.nearest(r.px, r.py, null, 9999);
            if (!tg) { r.zones.splice(i, 1); continue; }
            zn.target = tg;
          }
          this.hurt(tg, zn.dps * dt, false, zn.el);
          /* 画面表现改由 drawZoneLaser 负责（真正的持续光束）。
           * 此前这里每帧 push 一个 life=0.08 的 beam：3 秒要产生约 180 个
           * 特效对象挤占 efx（上限 90），画面却只是一条一闪一闪的短光。 */
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

    /* --- 麻痹（电磁僵尸电弧）：期间玩家无法开火 --- */
    if (Number(r.paraT) > 0) { r.paraT -= dt; if (r.paraT <= 0) r.paraT = 0; }

    /* --- 中毒 --- */
    if (r.poisonT > 0) {
      r.poisonT -= dt;
      if (Math.floor(r.poisonT * 2) !== Math.floor((r.poisonT + dt) * 2)) {
        this.hurtPlayer(r.poison, '毒');
      }
    }

    /* --- 火焰僵尸「灼烧」DoT：防线持续掉血 ---
     * 与 poison 同机制：按秒扣血，不吃护甲减免（持续伤害穿透护甲），
     * 但单次伤害很小（8/秒），不会导致难度失控。 */
    if (r.wallBurnT > 0) {
      r.wallBurnT -= dt;
      r.wallHp = Math.max(0, (r.wallHp != null ? r.wallHp : r.hp) - (Number(r.wallBurn) || 0) * dt);
      r.hp = r.wallHp;
      if (r.wallBurnT <= 0) { r.wallBurn = 0; r._burnToast = 0; }
      if (r.wallHp <= 0) { r.wallHp = 0; r.hp = 0; this.onLose(); return; }
    }

    /* --- 冰霜僵尸「寒霜」：我方射速降低 ---
     * 作用于 r.chillMul，在 shoot() 的射速计算里乘上，效果即时可见。 */
    if (r.chillT > 0) {
      r.chillT -= dt;
      r.chillMul = 1 - (Number(r.chill) || 0);
      if (r.chillT <= 0) { r.chill = 0; r.chillMul = 1; r._chillToast = 0; }
    } else if (r.chillMul == null || r.chillMul === 0) { r.chillMul = 1; }
    else if (Number(r.chill) <= 0) { r.chillMul = 1; }

    /* --- 角色天赋：C02 医疗兵「战地急救」 ---
     * desc 白纸黑字写着「自带护甲与治疗天赋」，但治疗那一半从未实装
     * （实测 15 秒 / 243 次采样回血 0 次，与 C01 对照组一致）。
     * 这里按 EX.chars[].talent 配置驱动落地：每 cd 秒回一次，回血量为
     * 防线【最大血量】的 heal 比例，不超过上限。
     * 只在掉血时触发（满血不浪费），并在 HUD 上给一次治疗反馈。 */
    if (r.charId && r.charId !== 'C01') {
      const _ct = (EX.chars || []).find((c) => c.id === r.charId);
      const _tal = _ct && _ct.talent;
      if (_tal && Number(_tal.heal) > 0) {
        const _cd = Math.max(1, Number(_tal.cd) || 8);
        r.talentT = (Number(r.talentT) || 0) + dt;
        if (r.talentT >= _cd) {
          r.talentT = 0;
          const _max = Number(r.wallMax) || Number(r.maxHp) || 0;
          if (_max > 0 && r.wallHp < _max - 0.01) {
            const _hv = Math.min(_max - r.wallHp, _max * Number(_tal.heal));
            r.wallHp = Math.min(_max, (r.wallHp || 0) + _hv);
            r.hp = r.wallHp;
            if (window.SND) SND.play('heal');
            try { this.fx && this.fx.text && this.fx.text('+' + Math.round(_hv), r.px, r.py - 30, '#7dffa8'); } catch (e) {}
          }
        }
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
      /* 动画相位：此前 animT 全项目只有读取、从未赋值，
       * 恒为 undefined → sin(0)=0 → 走路摆动/身体起伏全部静止不动。
       * 这里按 dt 累加，并按实际移动速度缩放（被冰冻减速时步伐变慢）。 */
      const spNow = (z.spd || 40) * (1 - (z.slow || 0));
      z.animT = (z.animT || 0) + dt * (0.55 + Math.min(1.4, spNow / 46));
      if (z.animT > 1e6) z.animT = 0;
      /* 免疫减速的 BOSS（深渊领主「狂暴免疫」阶段）不受任何减速影响 */
      if (z.immuneSlow) { z.slow = 0; z.slowT = 0; }
      else if (z.slowT > 0) { z.slowT -= dt; if (z.slowT <= 0) z.slow = 0; }
      if (z.burnT > 0) { z.burnT -= dt; this.hurt(z, z.burn * r.atk * dt, false, '火'); }
      /* 眩晕优先于减速：stunT>0 时完全定身（速度归零），到期自动恢复 */
      const sp = (z.stunT > 0) ? 0 : z.spd * (1 - (z.slow || 0));
      if (z.stunT > 0) z.stunT -= dt;
      const dx = r.px - z.x, dy = r.py - z.y;
      const dist = Math.hypot(dx, dy) || 1;
      z.facing = Math.atan2(dy, dx);

      if (z.isBoss) {
        this.bossTick(z, dt, dist);
        if (z.skCd > 0) z.skCd -= dt;
      }

      /* 真实玩法：僵尸整体自上而下推进，向防线（屏幕底部）压 */
      /* 掩体减速（表28：障碍物阻挡僵尸推进） */
      const downSp = sp * (z.ai === 'rush' ? (z.dashT > 0 ? 2.2 : 1) : 1) * (this.obsSlow ? this.obsSlow(z) : 1);
      if (z.ai === 'ranged') {
        /* 远程僵尸推进到射程内停下喷吐 */
        if (dist > z.atkR * 0.9) z.y += downSp * dt * 0.85;
        z.atkCd -= dt;
        if (z.atkCd <= 0 && dist < z.atkR) {
          z.atkCd = 2.2;
          /* 远程僵尸的投射物此前一律「在自己脚下生成液池」或发出 dmg:0 的弹，
           * 而玩家在屏幕下方、僵尸停在 120~150px 外 —— 液池永远够不到玩家，
           * 毒弹 dmg 为 0 且没有任何与玩家的碰撞判定。
           * 实测：6 种远程僵尸（含精英「毒僵尸」「护士僵尸」）打满 14 秒，
           *   防线掉血全部为 0 —— 它们的攻击完全无效。
           * 现在统一改为：朝玩家发射真实投射物，命中后按类型结算。 */
          const _zd = z.d || {};
          let _kind = 'acid';
          if (_zd.para || z.id === 'dianci') _kind = 'shock';
          else if (_zd.wind || z.id === 'fengren') _kind = 'wind';
          else if (_zd.poison) _kind = 'poison';
          this.shootEnemy(z, _kind, z.dmg, _zd.pool);
          /* 【表03 FX_WindSlash / FX_PoisonCloud】远程僵尸攻击的可见弹道。
           * 此前风刃僵尸「喷吐」画面上什么都不出现，玩家只看到自己莫名掉血。 */
          if (r.efx && r.efx.length < 90) {
            const ang = Math.atan2((r.py || 400) - z.y, (r.px || 240) - z.x);
            if (z.id === 'fengren' || (z.d && z.d.wind)) {
              r.efx.push({ t: 'wind', x: z.x, y: z.y, r: 44, a: ang, life: 0.45, max: 0.45 });
            } else if ((z.d && z.d.poison) || z.id === 'duwu') {
              r.efx.push({ t: 'poison', x: (z.x + (r.px || 240)) / 2, y: (z.y + (r.py || 400)) / 2, r: 46, life: 0.9, max: 0.9 });
            }
          }
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

      /* 撞上防线：防线掉血，僵尸消失
       * 严重BUG：this.wallY 只在 resize()（由 attach(canvas) 触发）里赋值，
       *   未挂载画布时恒为 undefined → `z.y >= undefined` 恒 false →
       *   僵尸永远撞不到防线，一路跑出屏幕（实测 y 冲到 5471，屏幕才 640）：
       *     ① 僵尸永不消失 → r.zombies 恒非空 → 波次只能等 20 秒超时推进
       *       （实测每波 20.0s，正常清完只要 9.4s，关卡被拖慢一倍）
       *     ② 玩家全程不掉血（实测防线满血 636/636），难度形同虚设
       *     ③ 玩家看不见僵尸（已跑出屏幕），只觉得"怪怎么不刷了"
       *   项目里其它取防线的位置都写了 `this.wallY || this.H` 兜底，
       *   唯独这一处漏了。这里补上同一套兜底。 */
      const _wallY = (this.wallY != null && isFinite(this.wallY)) ? this.wallY : (this.H - 96);
      if (z.y >= _wallY) {
        if (z.isBoss) {
          /* 【BOSS 撞墙自尽】此前 BOSS 撞到防线也是 dead=true 直接消失，
           * 于是"只要不打它、让它走到防线"BOSS 就会自己没掉 —— BOSS 战
           * 形同虚设，而且近战型 BOSS（atkR 46/60/55）根本走不到下面的
           * 接触分支，它的 contact 技能永远零触发。
           * 现在 BOSS 不会自尽：卡在防线前持续攻击，并按 atkCd 节流。 */
          z.y = _wallY - 6;
          z.atkCd -= dt;
          if (z.atkCd <= 0) {
            z.atkCd = 0.9;
            this.hurtPlayer(z.dmg, z.n, z);
            this.bossContactSkill(z);
            r.efx.push({ t: 'hitWall', x: z.x, y: _wallY, life: 0.3, max: 0.3, r: 26 });
            if (window.SND) SND.play('hurt');
          }
          continue;
        }
        this.hurtPlayer(z.dmg, z.n, z);
        z.dead = true; z.hp = 0;
        r.efx.push({ t: 'hitWall', x: z.x, y: _wallY, life: 0.3, max: 0.3, r: 26 });
        if (window.SND) SND.play('hurt');
        continue;
      }

      /* 接触伤害（近身） */
      if (dist < z.atkR * 0.55) {
        z.atkCd -= dt;
        if (z.atkCd <= 0) {
          z.atkCd = 0.9;
          this.hurtPlayer(z.dmg, z.n, z);
          if (z.isBoss) {
            const a = Math.atan2(r.py - z.y, r.px - z.x);
            r.px += Math.cos(a) * 34; r.py += Math.sin(a) * 34;
            this.bossContactSkill(z);
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
      /* 记录本帧起点，供扫掠判定使用（见下方命中检测） */
      b.px0 = b.x; b.py0 = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -20 || b.x > this.W + 20 || b.y < -20 || b.y > this.H + 20) b.life = 0;
      if (b.life <= 0) continue;
      /* 敌方投射物：只与玩家碰撞（此前完全没有命中判定，dmg 还是 0，
       *   六种远程僵尸的攻击等于摆设）。命中后按类型结算并销毁。 */
      if (b.enemy) {
        if (this.segDist(b.px0, b.py0, b.x, b.y, r.px, r.py) < 30) {
          this.enemyBulletHit(b); b.life = 0;
        }
        continue;                       /* 敌方弹不打僵尸，跳过下面的命中循环 */
      }
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
        /* 命中判定：点判定 → 扫掠判定（线段-圆最短距离）
         * 严重BUG：原写法只判断「子弹当前点」到僵尸中心的距离是否 ≤18px，
         *   而子弹每帧位移 = 弹速 × dt。一旦位移超过判定直径(36px)，
         *   子弹会在两帧之间「跨过」僵尸，两端都不满足距离条件 → 直接穿过去。
         * 实测（狙击枪 bspd=1400，僵尸冻结移动，随机距离 60~360px）：
         *   60fps 位移 23px → 命中率 100%
         *   30fps 位移 47px → 命中率 33%
         *   20fps 位移 70px → 命中率 0%（完全打不中）
         *   15fps 位移 93px → 命中率 0%
         * 也就是说：手机一旦掉帧，激光枪(1600)/电磁炮(1500)/狙击枪(1400)
         *   全部变成「打不中的废枪」，玩家只会以为这把枪坏了。
         * 现在改用「本帧起点→终点」这条线段到僵尸中心的最短距离，
         *   无论帧率多低、弹速多快都不会漏判。 */
        if (this.segDist(b.px0, b.py0, b.x, b.y, z.x, z.y) > this.hitR(z)) continue;
        b.hit.push(z);
        let dmg = b.dmg;
        /* z.def 已统一在 hurt() 内应用（对所有伤害来源生效），此处不再重复 */
        if (z.front) {
          const a = Math.atan2(b.y - z.y, b.x - z.x);
          let diff = Math.abs(a - z.facing); while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
          if (diff < 1.1) dmg *= (1 - z.front);
        }
        /* 暴击率 = 武器基础（含宝石加成）+ 技能「暴击强化」加成。
         * 严重BUG：此前只写 `Math.random() < r.crit`，而 r.crit 在 start/切枪时
         *   直接取自 attrs()，【从不叠加 r.mods.crit】——
         *   mods.crit 全项目零引用，等于技能「暴击强化（每级+3%暴击率）」
         *   升到满级 Lv10 也只涨一个数字，实战暴击率纹丝不动。
         *   实测：Lv0 暴击率 10.3% → Lv10 暴击率 10.3%（应为 40%）。
         * 这里在使用处叠加（不能写进 r.crit，否则切枪重算会丢失），并封顶 95%。 */
        const critR = Math.min(0.95, (Number(r.crit) || 0) + (Number(r.mods && r.mods.crit) || 0));
        this.hurt(z, dmg, Math.random() < critR, b.el === '物' ? '物' : (b.el || '物'));
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
          /* 眩晕（闪光弹 S05 stun:1.2）：僵尸完全定身，与减速独立 */
          if (b.stun > 0) {
            z.stunT = Math.max(z.stunT || 0, b.stunT || b.stun);
          }
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
    let th = (d.skills || []).filter((sk) => typeof sk.trig === 'number');
    /* 【BOSS 表 phases 字段此前零消费】
     * 表里每个 BOSS 都声明了 phases: 2/3（共几个阶段），但阶段切换完全由
     * skills 中数值型 trig 的【数量】隐式决定，phases 从头到尾没人读。
     * 实测配置与实现不一致：深渊领主 / 修道士 / 尸王 都声明 3 阶段，
     * 却只有 2 个数值触发点 → 玩家永远看不到第 3 阶段，白写一半配置。
     * 现在按 phases 补齐：声明的阶段数多于触发点时，在最低阈值下方均匀补点。 */
    const want = Math.max(1, Number(d.phases) || th.length);
    if (want > th.length) {
      const lowest = th.length ? Math.min.apply(null, th.map((s) => s.trig)) : 0.5;
      for (let i = th.length; i < want; i++) {
        const t = +(lowest * (1 - (i - th.length + 1) * 0.22)).toFixed(3);
        /* 技能名必须避开 bossCast 的关键词（狂暴/召唤/孢子/震击…），
         * 否则补出来的阶段会误触发「狂暴」分支 ×1.5 移速 ×1.35 伤害，
         * 与下面的渐进强化叠加后 BOSS 残血时移速可达初始 2.6 倍（过难）。
         * 用中性名，让它只走渐进强化，不额外放技能。 */
        if (t > 0.05) th.push({ n: '阶段推进', sk: '属性提升', trig: t });
      }
    }
    for (let i = 0; i < th.length; i++) {
      if (ratio <= th[i].trig && z.phase <= i) {
        z.phase = i + 1;
        /* 阶段递增强化：让「多阶段 BOSS」真的越打越凶
         * （此前阶段只是一次性放技能，BOSS 本体强度全程不随阶段变化，
         *   3 阶段 BOSS 打到残血和刚出场一样弱，阶段感形同虚设） */
        z.dmg = Math.round(z.dmg * 1.07 * 100) / 100;
        z.spd = Math.round(z.spd * 1.05 * 100) / 100;
        r.efx.push({ t: 'warn', x: z.x, y: z.y, r: 200, life: 0.8, max: 0.8 });
        UI.toast('⚠️ ' + d.n + ' 进入第 ' + z.phase + ' 阶段：' + th[i].n, 'boss');
        this.bossCast(z, th[i], i + 1);
      }
    }
  },

  /* BOSS 近身（trig:'contact'）技能派发
   * 6 个 BOSS 各有 1 个 contact 技能（巨爪拍击/铲斗横扫/暗影镰斩/吞噬/
   * 诅咒之杖/巨剑斩击），但 bossTick 只处理数值型 trig（血量阈值），
   * 全项目没有任何地方派发 contact —— 它们在真实战斗中一次都没触发过。
   * 加 7 秒冷却，避免近身 BOSS 每 0.9 秒连放。 */
  bossContactSkill(z) {
    const r = this.run; if (!r || !z) return;
    if (z.skCd > 0) return;
    const csk = ((z.bossDef && z.bossDef.skills) || []).find((s) => s && s.trig === 'contact');
    if (!csk) return;
    z.skCd = 7;
    this.bossCast(z, csk, z.phase || 1);
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

    /* ---- contact 类（近身技能）：一次性爆发，绝不永久叠属性 ----
     * 此前 contact 技能会落到最下面的通用兜底 z.dmg *= 1.2 / z.atkR *= 1.15，
     * 而派发后每 7 秒触发一次 → 打一场 BOSS 战能叠到初始伤害的数倍，
     * BOSS 越打越离谱，且 6 个技能文案各不相同却都只是「给自己加攻」。
     * 现在按名称各自实现真实效果，且都不做永久属性增长。 */
    if (sk.trig === 'contact') {
      const burst = z.dmg * 0.6;
      /* 修道士「诅咒之杖」：远程诅咒，降低玩家攻速
       * 复用寒霜减速（r.chill / r.chillT / r.chillMul）同一套射速系数，
       * 到期由 tick 自动清零，不会永久残留。 */
      if (/诅咒|迟缓|降攻速/.test(n)) {
        r.chill = Math.max(Number(r.chill) || 0, 0.4);
        r.chillT = Math.max(Number(r.chillT) || 0, 8);
        r.chillMul = 1 - r.chill;
        r.efx.push({ t: 'nova', x: r.px, y: (r.py || 0) - 30, r: 150, life: 0.8, max: 0.8, el: '暗' });
        this.addFloat(r.px, (r.py || 0) - 46, '攻速 -40%', 'debuff');
        return;
      }
      /* 铲斗横扫：击退并眩晕 → 短暂无法开火 */
      if (/铲斗/.test(n)) {
        r.efx.push({ t: 'nova', x: z.x, y: z.y, r: 200, life: 0.6, max: 0.6, el: '物' });
        this.hurtPlayer(burst, n);
        r.chill = Math.max(Number(r.chill) || 0, 0.6);
        r.chillT = Math.max(Number(r.chillT) || 0, 2.5);
        r.chillMul = 1 - r.chill;
        this.addFloat(r.px, (r.py || 0) - 46, '眩晕！', 'debuff');
        return;
      }
      /* 巨爪拍击：大范围近战，击退防线（把玩家往后推并造成额外伤害） */
      if (/巨爪/.test(n)) {
        r.efx.push({ t: 'nova', x: z.x, y: z.y, r: 170, life: 0.5, max: 0.5, el: '物' });
        this.hurtPlayer(burst * 1.2, n);
        r.py = Math.min(r.py + 26, this.H - 24);
        this.addFloat(r.px, (r.py || 0) - 46, '被击退！', 'debuff');
        return;
      }
      /* 吞噬：近身大量伤害 */
      if (/吞噬/.test(n)) {
        this.hurtPlayer(burst * 2, n);
        r.efx.push({ t: 'nova', x: r.px, y: (r.py || 0) - 20, r: 120, life: 0.5, max: 0.5, el: '毒' });
        return;
      }
      /* 暗影镰斩 / 巨剑斩击：能量斩击，超大范围 */
      if (/镰斩|斩击/.test(n)) {
        const big = /巨剑/.test(n);
        r.efx.push({ t: 'nova', x: z.x, y: z.y, r: big ? 300 : 210, life: 0.6, max: 0.6, el: '暗' });
        this.hurtPlayer(burst * (big ? 1.4 : 1), n);
        /* 斩击顺带击退附近僵尸，形成"清场"观感 */
        for (const o of r.zombies) {
          if (o.dead || o === z) continue;
          if (Math.hypot(o.x - z.x, o.y - z.y) < (big ? 300 : 210)) o.y -= 30;
        }
        return;
      }
      /* 兜底 contact：只做一次爆发，不改属性 */
      this.hurtPlayer(burst, n);
      return;
    }

    /* 诅咒类（非 contact 触发时的兜底匹配） */
    if (/诅咒|迟缓|降攻速/.test(n)) {
      r.chill = Math.max(Number(r.chill) || 0, 0.4);
      r.chillT = Math.max(Number(r.chillT) || 0, 8);
      r.chillMul = 1 - r.chill;
      r.efx.push({ t: 'nova', x: r.px, y: (r.py || 0) - 30, r: 150, life: 0.8, max: 0.8, el: '暗' });
      this.addFloat(r.px, (r.py || 0) - 46, '攻速 -40%', 'debuff');
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
      /* 等级上限：此前 exist.lv++ 没有封顶，无尽模式可无限升级，
       * 导致伤害/射程/绘制尺寸失控。详见 config.js TURRET_MAX_LV 注释。 */
      const MAXLV = EX.TURRET_MAX_LV != null ? EX.TURRET_MAX_LV : 20;
      if (exist.lv >= MAXLV) return { ok: false, msg: (exist.def && exist.def.n || '炮台') + ' 已达最高 Lv.' + MAXLV };
      /* BUG：升级费用此前按「本次点击的炮台」def.upCost 计算，
       * 但等级加在槽位里已有的那座炮台上 —— 两者不是同一座时，
       * 玩家点火焰炮台，扣的是火焰的价钱，升的却是寒冰的等级。
       * 现在统一按【实际被升级的那座】计价。 */
      const upDef = exist.def || def;
      const cost = Math.round((upDef.upCost != null ? upDef.upCost : def.upCost) * (1 + exist.lv * 0.6));
      if (r.coin < cost) return { ok: false, msg: EX.tip('popup.noCoin', { v: cost }) };
      r.coin -= cost; exist.lv++;
      return { ok: true, msg: '⬆ ' + (upDef.n || def.n) + ' 升至 Lv.' + exist.lv };
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
      /* 温压弹专属：蘑菇云（此前与所有火系技能共用 nova，没有辨识度） */
      r.efx.push({ t: 'thermo', x: r.px, y: r.py, r: rad, life: 0.75, max: 0.75, seed: Math.random() * 6 });
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
      /* 干冰弹专属：冰晶爆散 + 地面霜环扩散（冻结范围可视化） */
      r.efx.push({ t: 'cryo', x: r.px, y: r.py, r: rad, life: 0.7, max: 0.7, seed: Math.random() * 6 });
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
      /* 电磁穿刺专属：旋转电磁钻（此前与高能射线共用 beam 电，两个技能画面完全一样） */
      r.efx.push({ t: 'pierce', x: r.px, y: r.py, a: ang, len: 620, life: 0.5, max: 0.5, el: '电' });
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
      /* 冷却回滚：cd 在本函数开头就已写入，而这里是唯一一个「释放失败」
       * 却仍返回 false 的分支。实测无目标时 r.cd['zhidaojiguang'] 已被设成
       * 3.42s，技能压根没放出来 —— 玩家白等一个完整冷却。
       * 自动战斗（BT.auto 每 0.5s 尝试释放）下更糟：波次间隙反复空放，
       * 等僵尸真正出现时技能永远在冷却中，等于该技能整局失效。
       * 这里把 cd 归零，让下次有目标时能立刻释放。 */
      if (!tg) { r.cd[id] = 0; return { ok: false, msg: '附近没有目标' }; }
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
      /* 高能射线专属：粗能量柱 + 沿束推进的能量环（与电磁穿刺的细钻形成对比） */
      r.efx.push({ t: 'ray', x: r.px, y: r.py, a: ang, len: 700, life: 0.55, max: 0.55, el: '电' });
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
    /* 电磁僵尸「电弧」命中后短暂麻痹：期间完全无法开火，到期自动恢复 */
    if (Number(r.paraT) > 0) return;
    if (r.mag <= 0) return;
    r.mag--;
    const base = Math.atan2(tg.y - r.py, tg.x - r.px);
    /* 弹丸数 = pellets（武器表 + 词条 extra）。
     * BUG：此前把 spread 也算进弹丸数 `pellets + spread + mods.spread`
     *   —— 而 spread 是【散射角度】（单位：度，W01=2 / W02=8 / 狙击=0），
     *   不是数量。一旦武器表的 spread 真正启用（见下方散布角），
     *   突击步枪会变成 3 连发、散弹枪变成 13 颗弹丸（实测伤害 ×2.6）。
     *   这里把数量与角度彻底分开：n 只取 pellets。 */
    const n = Math.max(1, Math.round(Number(r.pellets || 1)));
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
    /* 散布角：此前写死 0.13 弧度，与武器表 spread 完全无关
     *   —— 结果狙击枪（spread 0）和散弹枪（spread 8）的弹幕扇形一模一样，
     *     单发武器（W01 突击步枪 spread 2 / W05 冲锋枪 3）则完全没有散布，
     *     「突击步枪打不准」的手感差异彻底丢失。
     *   现在按武器表 spread（度）转弧度：
     *     多弹丸 → 弹丸间夹角 = spread（散弹枪 8°×4 ≈ 32° 扇形）
     *     单  发 → 随机偏移 ±spread（狙击 0° = 绝对精准，火焰喷射器 ±6°）
     *   散弹枪旧值 0.13 弧度 ≈ 7.4°，新值 8° ≈ 0.1396 弧度，几乎不变，
     *   所以平衡不被打破，只是差异终于按配表生效。 */
    const spRad = (Number(r.spread) || 0) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * spRad;
      const jit = n === 1 ? (Math.random() - 0.5) * spRad * 2
        : (Math.random() - 0.5) * Math.min(0.05, spRad * 0.25);
      const a = base + off + jit;
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
        stun: g.stun || 0, stunT: g.stun || 0,
        burn: g.burn || 0, burnT: g.burn ? 3 : 0,
        /* 严重BUG：武器表的减速字段叫 chill（冰冻枪 W11 chill:0.55 /
         * 烟雾弹 S06 chill:0.5），而这里读的是 g.slow —— 武器表里
         * 【没有任何一把枪有 slow 字段】，于是命中减速恒为 0。
         * 实测（5-5 实战，307 次僵尸采样）：冰冻枪全程减速出现 0 次，
         * 烟雾弹 521 次采样同样 0 次 —— 冰冻枪就是一把换了蓝色子弹
         * 皮肤的普通枪，"冰霜弹/行动迟缓"的描述完全是装饰。
         * 现在 slow 取 g.slow || g.chill，并给冰元素一个兜底时长。 */
        slow: Number(g.slow || g.chill || 0) || 0,
        slowT: Number(g.slowT || (g.chill ? 2.0 : 0)) || 0,
        chain: g.chain || 0, chainN: g.chainN || 0,
      });
    }
    /* 支援型武器：医疗包 heal / 护盾发生器 shield
     * 这两种此前在武器表里只有名字、没有任何实现，装备后开火毫无反应。
     * 护盾减伤链路（hurt 里 r.shield 抵扣）本来就有，这里只负责「加盾」；
     * 因为 attrs 默认 maxShield=0，必须同步抬高上限，否则加了立刻被夹成 0。 */
    if (g.heal > 0) {
      const wm = r.wallMax || r.maxHp || 1;
      r.wallHp = Math.min(wm, (r.wallHp != null ? r.wallHp : r.hp) + g.heal);
      r.hp = r.wallHp;
      r.efx.push({ t: 'nova', x: r.px, y: r.py - 20, life: 0.5, max: 0.5, r: 46 });
      try { if (window.UI && UI.toast) UI.toast('🩹 防线回复 ' + Math.round(g.heal)); } catch (e) {}
      /* 【表03 FX_Heal】治疗光柱：此前回血只有一行 toast，画面上无任何反馈 */
      if (r.efx && r.efx.length < 90) r.efx.push({ t: 'heal', x: r.px, y: (r.py || 400) - 20, life: 0.7, max: 0.7 });
    }
    if (g.shield > 0) {
      r.shield = (Number(r.shield) || 0) + g.shield;
      r.maxShield = Math.max(Number(r.maxShield) || 0, r.shield);
      this.capShield(r);
      r.efx.push({ t: 'nova', x: r.px, y: r.py - 20, life: 0.5, max: 0.5, r: 46 });
      try { if (window.UI && UI.toast) UI.toast('🛡️ 护盾 +' + Math.round(g.shield)); } catch (e) {}
      /* 【表03 FX_ShieldOn】护盾开启：六边形能量罩 */
      if (r.efx && r.efx.length < 90) r.efx.push({ t: 'shieldon', x: r.px, y: (r.py || 400) - 20, life: 0.8, max: 0.8 });
    }
    /* 抛壳：开火反馈的写实细节（此前完全没有） */
    if (r.efx && r.gunId !== 'W09' && r.gunId !== 'W12') {
      r.efx.push({ t: 'shell', x: r.px + 6, y: r.py - 24, a: -1.1, life: 0.5, max: 0.5 });
    }
    /* 枪口火光 / 后坐力：供绘制层做开火反馈 */
    r.muzzleT = 0.07;
    /* 屏幕震动：按武器表 recoil 倍率（低0.55/中1.0/高1.6），高后坐力枪体感更猛 */
    r.shakeT = 0.09;
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

  shootEnemy(z, kind, dmg, poolDur) {
    const r = this.run;
    const a = Math.atan2(r.py - z.y, r.px - z.x);
    r.bullets.push({
      x: z.x, y: z.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
      dmg: Number(dmg) || 0, pierce: 0, life: 2.4, hit: [], enemy: true,
      kind: kind || 'acid', pool: Number(poolDur) || 0,
      dot: Number((z.d && z.d.poison) || 0), src: (z.d && z.d.n) || '',
    });
  },

  /* 敌方投射物命中玩家：按类型结算（毒 / 腐蚀液池 / 风刃 / 电弧麻痹） */
  enemyBulletHit(b) {
    const r = this.run;
    if (Number(b.dmg) > 0) this.hurtPlayer(b.dmg, b.src || '远程');
    if (b.kind === 'poison') {
      /* 中毒 DoT：与 hurtPlayer('poison') 同口径 */
      r.poison = Math.max(Number(r.poison) || 0, Number(b.dot) || 4);
      r.poisonT = Math.max(Number(r.poisonT) || 0, 4);
    } else if (b.kind === 'shock') {
      r.paraT = Math.max(Number(r.paraT) || 0, 0.8);
      if (!r._paraToast) { r._paraToast = 1; try { if (window.SND) SND.play('hit'); } catch (e) {} }
      setTimeout(() => { r._paraToast = 0; }, 1200);
    } else if (b.kind === 'acid') {
      /* 腐蚀液：在玩家脚下留下液池（此前生在僵尸自己脚下，永远打不到人） */
      const dur = Number(b.pool) || 3.2;
      r.pools.push({ x: r.px + (Math.random() * 40 - 20), y: r.py + 20,
        r: 46, dps: (Number(b.dmg) || 8) * 0.6, life: dur, max: dur });
    }
    if (r.efx && r.efx.length < 90) {
      const t = b.kind === 'shock' ? 'shock' : b.kind === 'wind' ? 'wind' : b.kind === 'poison' ? 'poison' : 'explode';
      r.efx.push({ t, x: r.px, y: r.py, r: 42, life: 0.45, max: 0.45 });
    }
  },

  /* 线段 (x1,y1)-(x2,y2) 到点 (px,py) 的最短距离
   * 用于子弹的扫掠命中判定，避免高速子弹在两帧之间穿过目标 */
  segDist(x1, y1, x2, y2, px, py) {
    if (!isFinite(x1) || !isFinite(y1)) return Math.hypot(px - x2, py - y2);
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 <= 0) return Math.hypot(px - x2, py - y2);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  },

  /* 命中半径：大体型僵尸（BOSS/精英）判定圈更大，符合视觉 */
  hitR(z) {
    if (!z) return 18;
    if (z.isBoss) return 34;
    if (z.d && z.d.elite) return 24;
    return 18;
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
    /* 暴伤 = 武器基础倍率 + 技能「暴击强化」的 critDmg 加成。
     * 此前只读 r.critDmg（武器属性），从不叠加 r.mods.critDmg，
     * 而 mods.critDmg 又无任何来源赋值 —— 两头都断，技能的
     * 「提升暴击伤害」等于没写。这里在使用处叠加（与 mods.crit 同口径：
     * 不能写回 r.critDmg，否则切枪重算会丢失）。 */
    let d = dmg * (crit ? ((Number(r.critDmg) || 1.5) + (Number(r.mods && r.mods.critDmg) || 0)) : 1);
    /* 单位减伤率（怪物表 def / BOSS def）：对所有伤害来源统一生效。
     * 此前只在"子弹命中"这一条路径上应用 z.def，技能/爆炸/闪电链/
     * 燃烧/毒池/油桶等 10 处伤害来源全部绕过 → BOSS 的 def(0.2~0.4)
     * 与重甲僵尸 def(0.55) 对技能形同虚设。 */
    /* 边界钳制：此前 defR 直接参与 `d * (1 - defR)`，既无上限也无保底 ——
     *   实测 1000 伤害打 def=1.2 的怪 → 造成伤害 -200（【怪物反而回血】）；
     *   运营按百分比写成 def=55 → 回血 54000；def=1.0 → 伤害恒 0
     *   （完全免疫，关卡永远打不通）。
     *   同为减伤机制：玩家护甲有 min(0.5) 钳制、怪物护甲有 max(1) 保底，
     *   唯独这条裸奔。现在统一钳到 [0, 0.9] 并保证最低 1 点伤害，
     *   正常配置（0.2~0.55）数值不变。 */
    let defR = Number(z.def || 0);
    if (!isFinite(defR)) defR = 0;
    defR = Math.max(0, Math.min(0.9, defR));
    if (defR > 0) d = Math.max(1, d * (1 - defR));
    /* 表20 公式3：最终伤害 = 基础伤害 - 怪物护甲（最低造成 1 点）
     * 此前怪物表无 armor 字段，护甲减伤完全未生效 */
    const armor = Number((z.d && z.d.armor) || 0);
    if (armor > 0) d = Math.max(1, d - armor);
    /* 表20 公式5：吸血 = 最终伤害 × 吸血%
     * 局内技能「吸血」（xixue）描述写的是「造成伤害时回复防线血量，
     *   每级 +1.5% 吸血」，但它的 mods.healOnKill 【只在 kill() 里被读】，
     *   而且是按固定值加血：Lv8 = 0.015×8 = 0.12 点 —— 防线血量动辄
     *   几百上千，杀一只怪回 0.12 血，点满 8 级与没点完全没区别
     *   （实测：Lv0 与 Lv8 的防线血量变化均为 0）。
     * 现在与天赋/芯片吸血（r.ls）同口径，按「造成伤害的百分比」在命中时回血，
     *   与技能描述一致，且等级成长才真正有效。 */
    const ls = Number(r.ls || 0) + Number((r.mods && r.mods.healOnKill) || 0);
    if (ls > 0 && r.wallHp != null && r.wallMax) {
      /* BUG修复：吸血此前【无任何上限】，而单次伤害随武器等级指数成长
       *   （gunLv76 → 单次 ~5.8 万），于是「回血 = 伤害 × 吸血率」在高攻下
       *   一次命中就把防线回满。实测 10-10：
       *     吸血生效   → 防线 9693/9693 满血通关
       *     强制吸血=0 → 防线被打爆判负
       *   即：仅 1.9%~3.7% 的吸血率就完全决定了胜负，防线血量、护甲、
       *   医疗包、护盾发生器、生命类天赋/建筑/宝石全部失去意义。
       * 现在加双重节流（业界通用做法）：单次命中回血 ≤ 防线上限 ×1%，
       *   每秒累计回血 ≤ 防线上限 ×2%。低攻时不触发、吸血手感不变；
       *   高攻时不再一击回满，但仍能持续续航。 */
      const wm = Number(r.wallMax) || 0;
      const sec = Math.floor(Number(r.time) || 0);
      if (r._lsSec !== sec) { r._lsSec = sec; r._lsAcc = 0; }
      let add = Math.min(d * ls, wm * (EX.LS_HIT_CAP != null ? EX.LS_HIT_CAP : 0.01));
      const room = Math.max(0, wm * (EX.LS_SEC_CAP != null ? EX.LS_SEC_CAP : 0.02) - (Number(r._lsAcc) || 0));
      add = Math.min(add, room);
      if (add > 0) {
        r.wallHp = Math.min(wm, r.wallHp + add);
        r.hp = r.wallHp;
        r._lsAcc = (Number(r._lsAcc) || 0) + add;
      }
    }
    z.hp -= d;
    z.hitT = 0.12;                          /* 受击闪白（立体精灵叠加高光用） */
    /* 技能伤害统计（截图51：突击步枪/干冰弹/温压弹/电磁穿刺…） */
    if (r.skillDmg) {
      const k = src || 'gun';
      r.skillDmg[k] = (r.skillDmg[k] || 0) + d;
    }
    this.addFloat(z.x, z.y - 14, Math.round(d), crit ? 'crit' : 'dmg');
    /* 暴击星芒：暴击此前只有数字变色，画面上与普通命中无异 */
    if (crit && r.efx) r.efx.push({ t: 'crit', x: z.x, y: z.y, life: 0.35, max: 0.35 });
    /* 命中火花：3D 粒子向外飞散（子弹打击感，此前命中只有飘字、无任何特效） */
    /* 【表03 FX_IceShatter / FX_PoisonCloud】冰/毒命中的专属反馈。
     * 此前冰霜与毒元素命中在画面上和普通命中完全一样，只有飘字颜色不同。 */
    if (r.efx && r.efx.length < 90) {
      if (src === '冰') r.efx.push({ t: 'iceshatter', x: z.x, y: z.y - 8, life: 0.42, max: 0.42, seed: Math.random() * 6 });
      else if (src === '毒') r.efx.push({ t: 'poison', x: z.x, y: z.y - 6, r: 36, life: 0.75, max: 0.75 });
    }
    if (r.efx && r.efx.length < 90) {
      const ra0 = Math.random() * Math.PI * 2;
      r.efx.push({
        t: 'spark', x: z.x, y: z.y - 12, life: 0.28, max: 0.28,
        n: crit ? 9 : 6, sp: crit ? 130 : 88,
        col: crit ? '255,120,90' : (src === '冰' ? '140,230,255' : src === '电' ? '200,160,255' : '255,215,120'),
        dir: ra0,
      });
    }
    if (z.hp <= 0) this.kill(z);
  },

  hurtPlayer(dmg, src, zo) {
    const r = this.run; if (!r || r.over) return;
    if (src === 'poison') { r.poison = dmg; r.poisonT = 4; return; }
    /* ---- 元素附加：火焰僵尸「灼烧」/ 冰霜僵尸「寒霜」 ----
     * 此前 zombies 表写了 fire:8 / chill:0.35 两个字段，但全项目零消费：
     * 火焰僵尸只是「长得红一点」，冰霜僵尸只是「长得蓝一点」，
     * 和外形完全相同的普通僵尸在数值上没有任何区别。
     * 现在真正实装：
     *   fire  → 防线持续灼烧 DoT（每秒掉血，持续 3 秒，刷新不叠加）
     *   chill → 寒霜减速（我方射速 -35%，持续 2.5 秒，刷新不叠加） */
    if (zo && !zo.dead) {
      const fv = Number(zo.d && zo.d.fire);
      const cv = Number(zo.d && zo.d.chill);
      if (isFinite(fv) && fv > 0) {
        r.wallBurn = Math.max(Number(r.wallBurn) || 0, fv);
        r.wallBurnT = Math.max(Number(r.wallBurnT) || 0, 3);
        if (!r._burnToast) { r._burnToast = 1; try { if (window.VO) VO.say('VO_005'); } catch (e) {} }
        if (window.SND) SND.play('burn');
      }
      if (isFinite(cv) && cv > 0) {
        r.chill = Math.max(Number(r.chill) || 0, Math.min(0.6, cv));
        r.chillT = Math.max(Number(r.chillT) || 0, 2.5);
        if (!r._chillToast) { r._chillToast = 1; try { if (window.VO) VO.say('VO_006'); } catch (e) {} }
        if (window.SND) SND.play('chill');
      }
    }
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
    /* 无伤连杀中断：只有【真正掉血】才算受伤，
     * 被护盾全额吸收（d 已被抵成 0）时防线血量未变，连杀继续 ——
     * 这与玩家「我没掉血」的直觉一致，也让护盾发生器有存在意义。 */
    if (d > 0) r.noHitStreak = 0;
    r.hitFlash = 0.18;
    this.addFloat(r.px, r.py - 26, '-' + Math.round(dmg), 'hurt');
    if (window.SND) SND.play('hurt');
    /* 表04 VO_004 防线告急：低于 30% 提示一次（此前完全没有预警） */
    if (!r._lowWarn && r.wallMax && r.wallHp > 0 && r.wallHp / r.wallMax < 0.3) {
      r._lowWarn = 1;
      try { if (window.VO) VO.say('VO_004'); } catch (e) {}
    }
    if (r.wallHp <= 0) { r.wallHp = 0; r.hp = 0; this.onLose(); }
  },

  kill(z) {
    const r = this.run; if (z.dead) return;
    z.dead = true; r.kills++;
    /* 无伤连杀 +1（受伤时在 hurt() 里清零），并刷新本场最大连杀段 */
    r.noHitStreak = (Number(r.noHitStreak) || 0) + 1;
    if (r.noHitStreak > (Number(r.noHitMax) || 0)) r.noHitMax = r.noHitStreak;
    /* 击杀反馈：此前僵尸是「瞬间消失」，没有任何消散表现 */
    if (r.efx) r.efx.push({ t: 'die', x: z.x, y: z.y, life: 0.62, max: 0.62, seed: Math.random() * 6 });
    /* 击杀冲击环：贴地扩散，成片清怪时连成一片 */
    if (r.efx && r.efx.length < 110) r.efx.push({ t: 'shock', x: z.x, y: z.y + 6, r: 20, life: 0.32, max: 0.32 });
    /* 【表03 FX_CoinDrop】金币掉落：击杀后弹起的金币，掉落物可视化 */
    if (r.efx && r.efx.length < 90) r.efx.push({ t: 'coin', x: z.x + (Math.random() - 0.5) * 10, y: z.y - 6, life: 0.6, max: 0.6 });
    /* 表37 埋点：kill_monster */
    try { OPS.track('kill_monster', { z: z.id || z.n }); } catch (e) {}
    if (r.kills === 1 && window.UI && UI.guideTrigger) UI.guideTrigger('firstKill');
    /* 吸血技能（xixue）的回血已移到 hurt() 按「造成伤害的百分比」结算，
     * 此处不再按固定值加血（原写法 Lv8 只回 0.12 点，等同无效，且会重复回血）。 */
    const gAdd = Math.round(z.gold * (1 + E.talentVal(this.P, 'gold')));
    r.gold += gAdd;
    /* 局内金币（coin）：只用于建造/升级炮台，【不随章节倍率 rwMul 放大】。
     * 严重失衡：coin 此前与 r.gold 共用同一个 gAdd，而 z.gold 内含 rwMul，
     * 于是 coin 也跟着放大，而炮台造价是固定值（120/150/180/220）：
     *   第 1 章整关 840 金 → 可建  7 座
     *   第10章整关 106 万 → 可建 8834 座（相差 1262 倍）
     * 实测后果：后期第 2 波就能建满 4 个槽位并全部升满级，
     *   此后百万金币再无任何用途，炮台的经济取舍彻底归零。
     * 现在取僵尸表的【基础金币】（未乘 rwMul），让各章节「一关能建几座」
     * 保持在同一量级（第1章约 7 座 / 第10章约 22 座，差异只来自波次变多）。 */
    const _tg = Number(E.talentVal(this.P, 'gold')) || 0;
    const _base = Number((z.d && z.d.gold) != null ? z.d.gold : (z.gold || 3)) || 3;
    r.coin = (Number(r.coin) || 0) + Math.round(_base * (1 + _tg));
    /* 经验加成天赋此前只作用于 pick()（拾取掉落），
     * 而击杀这条主要经验来源走的是 gainXp(z.xp)，完全没乘天赋
     * → 实测天赋 Lv0 与 Lv20 击杀经验都是 4，点满 20 级毫无收益。 */
    this.gainXp(Math.max(1, Math.round((z.xp || 2) * (1 + E.talentVal(this.P, 'xp')))));
    /* 累计「本局击杀经验基数」供结算时的角色经验使用。
     * 此前 main.js 结算写死 `kills * 4`：不管杀的是第 1 章普通僵尸
     * 还是第 10 章 BOSS、也不管关卡倍率，每只一律 4 点 ——
     * 实测第 10 章通关 300 杀只给 1200 经验，而 Lv20 升一级要 12302，
     * 等于刷十几关才升 1 级，玩家完全没有推进高关卡的动力。 */
    r.killXp = (r.killXp || 0) + Math.max(1, Math.round(z.xp || 0));
    if (z.d && z.d.split) {
      const dd = EX.zombies.find((x) => x.id === 'xiaozombie');
      for (let i = 0; i < (z.d ? z.d.split : 0); i++) {
        const nz = this.mkZ(dd, (r.def && r.def.mul) || 1);
        nz.x = z.x + (Math.random() - 0.5) * 30; nz.y = z.y + (Math.random() - 0.5) * 30;
        r.zombies.push(nz);
      }
    }
    if (z.ai === 'boomer' && (!z.d || z.d.id !== 'zibao')) this.boom(z);
    /* 表45 全局掉落掉率明细：按怪物来源精确掉落
     * 新增章节阶梯：globalDrops 的 ch 字段是「第几章起才掉」，此前全项目零引用
     * → 第 1 章打精英僵尸也会掉后期才该出现的稀有金属/角色碎片。
     * 现在按当前章节过滤，同一 item 取「已解锁的最高档」，低档自动被覆盖。 */
    const srcName = z.isBoss ? ('BOSS' + (z.bossDef ? z.bossDef.n : ((z.d && z.d.n) || ''))) : ((z.d && z.d.n) || '');
    const curCh = (r.def && r.def.ch) || (r.ch || 1);
    const table = EX.dropFor(srcName, curCh);
    /* 首杀必掉的条目先收集，再统一交给 EX.rollDrop ——
     * 此前这里裸用 d.rate / d.min / d.max 自己判定，
     * 全局稀缺度 DROP_RATE_MUL / DROP_QTY_MUL 对关卡内击杀掉落完全不生效
     * （全项目只有宝箱开箱走了 rollDrop），等于「重新定义掉落」只改了宝箱。
     * 现在与宝箱、扫荡三条路径共用同一入口。 */
    const force = [];
    for (const d of table) {
      if (d.first && !(this.P.firstBossDrop || {})[srcName + d.item]) {
        this.P.firstBossDrop = this.P.firstBossDrop || {};
        this.P.firstBossDrop[srcName + d.item] = 1;
        force.push(d.item);
      }
    }
    const got = EX.rollDrop(table, force);
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
    /* 【表03 FX_ChainLightning】此前链式只推一条直线 bolt，
     * 看不出「在目标间跳跃」的链式感。改为收集所有跳跃点后一次绘制。 */
    const pts = [{ x: z.x, y: z.y }];
    for (let i = 0; i < n; i++) {
      let best = null, bd = 130;
      for (const o of r.zombies) {
        if (o.dead || hitSet.indexOf(o) >= 0) continue;
        const d = Math.hypot(o.x - cur.x, o.y - cur.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) break;
      pts.push({ x: best.x, y: best.y });
      this.hurt(best, dmg, false, '电');
      hitSet.push(best); cur = best;
    }
    if (pts.length > 1 && r.efx && r.efx.length < 90) {
      r.efx.push({ t: 'chain', pts, life: 0.28, max: 0.28 });
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
          /* BUG（静默丢失）：E.giveChipByQuality 在 p.bag 满（BAG_MAX=500）时
           * 返回 null、一颗都不入库，而这里此前【无条件】累加 it.n 并飘字
           * 「芯片+3」——实测满包时飘字说给了 3 颗，bagLen 500→500 纹丝不动。
           * 玩家全程被蒙在鼓里：既不会收到"背包已满"提示，也无从察觉芯片没到。
           * 现在按【实际入库数】计数，并在有淘汰时提示玩家去清理。 */
          let got = 0;
          for (let i = 0; i < it.n; i++) if (E.giveChipByQuality(this.P, qmap[it.item])) got++;
          if (got > 0) {
            /* 局内芯片收获累计：结算面板此前只显示关卡表配的 chip，
             * 战斗中打出来的芯片一行都不显示 */
            r.chipGain = (r.chipGain || 0) + got;
            txt.push('芯片+' + got);
          }
          const lost = it.n - got;
          if (lost > 0) {
            r.chipFull = (r.chipFull || 0) + lost;
            if (!r._chipFullTipped) {
              r._chipFullTipped = true;
              try { if (window.UI && UI.toast) UI.toast('⚠️ 芯片背包已满，' + lost + ' 颗芯片未获得，请到芯片页分解或合成', 'err'); } catch (e) {}
            }
          }
          return;
        }
        this.P.mat[it.item] = (this.P.mat[it.item] || 0) + it.n;
        /* 局内材料收获累计：拾取时背包立刻 +n（有飘字），
         * 但结算面板的 rw.mat 只统计【关卡表奖励】——
         * 实测 1-1 通关实际拿到 158 合金 + 8 零件，面板却只显示 5 合金，
         * 玩家打完不知道自己捞了多少。这里累计供结算面板合并显示。 */
        r.matGain = r.matGain || {};
        r.matGain[it.item] = (r.matGain[it.item] || 0) + it.n;
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
      /* 【表03 FX_LevelUp】升级光柱：此前升级只有弹窗，角色身上没有任何光效 */
      if (r.efx && r.efx.length < 90) r.efx.push({ t: 'levelup', x: r.px, y: r.py, life: 0.9, max: 0.9 });
      /* 升级弹窗（截图52）+ 奖励金币
       * 奖励此前写死 200，与关卡收益倍率脱钩：
       * 第 10 章 rwMul≈131，击杀一只普通僵尸已有 395 金币，
       * 升一级却只给 200 —— 后期「升级」奖励还不如杀半只怪，
       * 局内升级的正反馈完全消失。现在按本关 rwMul 同步缩放。 */
      /* 升级奖励进【局内炮台金币】r.coin，且刻意【不随章节倍率 rwMul 放大】。
       *
       * 此前直接写进 P.gold（永久金币）且按 rwMul 放大，实测三个后果：
       *   ① 结算面板只统计 r.gold + 关卡奖励，这笔钱一行都不显示 ——
       *      1-1 通关实测：面板 1130，实际到账 3230，差的 2100
       *      全部来自这里（局内升 10 级 × 200），玩家看到的与拿到的是两个数；
       *   ② 变成一条绕过结算的刷币通道：第 10 章 rwMul≈131，
       *      一次升级给 26200 永久金币，一局升 15 级 ≈ 39 万 ——
       *      比该关 26 万的关卡奖励还高，且完全不出现在结算上；
       *   ③ 破坏刚调平的局内经济：coin（建炮台用）是不放大的，
       *      升级奖励却按 rwMul 放大，各章节「一关能建几座」的一致性被打破。
       *
       * 现在与击杀 coin 同口径：不放大、只吃金币天赋，升级当场就能拿去建塔，
       * 既保住「局内升级 → 立刻变强」的正反馈，也不再偷偷灌永久金币。 */
      const lvRw = Math.round(200 * (1 + (E.talentVal(this.P, 'gold') || 0)));
      if (window.UI && UI.showLvUp) UI.showLvUp(r.lv, lvRw);
      if (window.UI && UI.guideTrigger) UI.guideTrigger('firstUpgrade');
      r.coin = (Number(r.coin) || 0) + lvRw;
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
    if (!this._picks) return false;
    /* 候选池为空（技能已全满 / 全互斥）时 offerSkills 直接 return，
     * _picks 保持旧值、界面上的三张卡不会有任何变化。
     * 此时若照常扣掉刷新次数，玩家就是「点了没反应还白扣一次」。
     * 返回布尔值，让调用方据此决定要不要扣。 */
    const before = this._picks;
    const idsOf = (arr) => (arr || []).map((s) => (s && s.id) || '').join(',');
    const beforeIds = idsOf(before);
    this.offerSkills();
    /* 只剩 1 个候选（或随机洗牌后恰好又是同一组）时，offerSkills 会新建一个数组，
     * 引用变了但三张卡内容一模一样 —— 界面看着毫无变化，却照样扣掉刷新次数。
     * 改为按「实际给出的技能 id 组合」判断，内容没变就不算刷新成功、不扣次数。 */
    return idsOf(this._picks) !== beforeIds;
  },
  pickSkill(id) {
    const r = this.run;
    const def = EX.skills.find((s) => s.id === id);
    if (!def) return { ok: false, msg: '技能不存在' };
    /* 防连点：选项必须在「当前打开的这一组」里，且选完立刻作废。
     * 此前玩家在同一张卡上快速点两下（手机上手快很常见），两次调用都会
     * 走进来，技能直接 +2 级、升级次数却只消耗 1 次 —— 白拿一级。
     * 现在：没有打开的选项 / 选项已失效 → 直接拒绝。 */
    if (!this._picks || !this._picks.length) return { ok: false, msg: '当前没有可选的升级' };
    if (!this._picks.some((s) => s.id === id)) return { ok: false, msg: '该选项已失效' };
    /* 防御：等级不得越过 def.max。
     * 实测把技能先设成满级再选一次，等级会变成 max+1（10→11），
     * applyMods 随后按 11 级计算加成，超出技能设计上限。
     * 正常流程里 UI 只展示未满级的卡、点不到满级项，但：
     *   ① 快速连点（卡片 on 移除前的几十毫秒窗口）可能连调两次；
     *   ② 后台改档/热更把 max 改小后，旧存档等级会悬在上限之上。
     * 这里统一钳住，并把等级回落到上限。 */
    const cur = Number(r.skills[id]) || 0;
    if (cur >= def.max) {
      if (cur > def.max) r.skills[id] = def.max;
      return { ok: false, msg: def.n + ' 已满级' };
    }
    r.skills[id] = cur + 1;
    this.applyMods();
    /* 死代码已移除：原为 `if (id === 'hudun') { r.maxShield += 120; ... }`
     * 但 EX.skills 里根本没有 id 为 'hudun' 的技能（18 个技能见 config），
     * 该判断恒为 false，从未执行过一次。护盾的正规来源是 I02 护盾发生器
     * 与（未来的）stat:'shield' 天赋/芯片，走 applyItem / applyMods。 */
    UI.toast('✨ ' + def.n + ' Lv.' + r.skills[id], 'ok');
    this._picks = null;      /* 本组选项作废，杜绝同一张卡被点到第二次 */
    this.paused = false;
    /* 连升多级时，选完这一组后若还有未使用的升级次数，继续弹下一组 */
    if (this._pendingOffers > 0) {
      setTimeout(() => { if (this.run && !this.run.over) this.flushOffers(); }, 60);
    }
    return { ok: true, lv: r.skills[id], msg: def.n + ' Lv.' + r.skills[id] };
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
    this.capShield(r);
  },

  /* 飘字：
   * ① 防重叠 —— 高射速武器（16 发/秒）在同一只僵尸身上会瞬间堆出十几段伤害，
   *    此前全部落在同一个 (x,y)，十几串数字完全叠成一坨，玩家只看到一团糊字，
   *    既读不出打了多少，也盖住了僵尸本体。现在按已有飘字做纵向错层，
   *    最多错 4 层，保证每段伤害都读得到。
   * ② 同帧同点合并 —— 散弹/多弹丸一次打出 5 段伤害时，合并成一段显示总伤，
   *    而不是并排 5 串数字互相压住。 */
  addFloat(x, y, v, cls) {
    const fs = this.run.floats;
    if (!fs) return;
    const now = this.run.time || 0;
    /* 同帧同点：合并为累计值（避免多弹丸并排堆叠） */
    for (const f of fs) {
      if (f.cls === cls && Math.abs(f.x - x) < 3 && Math.abs(f.y - y) < 3 && (now - (f.t0 || 0)) < 0.06) {
        f.v = String((Number(f.v) || 0) + (Number(v) || 0));
        f.life = 0.7;
        f.pop = 1;                       /* 合并后做一次弹跳放大 */
        return;
      }
    }
    /* 纵向错层：找一条不与现有飘字打架的水平线 */
    let oy = 0;
    for (let k = 0; k < 4; k++) {
      const ty = y + oy;
      let busy = false;
      for (const f of fs) {
        if (Math.abs(f.x - x) < 24 && Math.abs(f.y - ty) < 13) { busy = true; break; }
      }
      if (!busy) break;
      oy -= 14;
    }
    fs.push({ x, y: y + oy, v: String(v), cls, life: 0.7, t0: now, pop: 1 });
    /* 上限保护：极端情况（几十只僵尸同时被打）下丢弃最旧的，
     * 避免数组无限增长拖慢帧率 */
    if (fs.length > 60) fs.splice(0, fs.length - 60);
  },

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
    try { if (window.VO) VO.say('VO_007'); } catch (e) {}
    const r = this.run; if (r.over) return;
    r.over = true; r.win = true;   /* r.win 此前从未赋值，外部无法判定胜负 */
    /* 表37 埋点：endless_time / level_finish */
    try { if (r.endless) OPS.track('endless_time', { t: Math.floor(r.time) }); } catch (e) {}
    this.sweepDrops(1);
    this.on = false; this.stopLoop();
    if (this.cb) this.cb('win', { kills: r.kills, time: r.time, rw: { gold: r.gold, diamond: 0 }, lv: r.lv });
  },
  /* 复活时统一清除我方身上的持续伤害状态。
   * 此前 onLose 的天赋复活只回血、不清状态，revive 的广告复活只清 poison：
   *   ① 灼烧 wallBurn / 中毒 poison / 寒霜 chill 全部残留；
   *   ② 防线脚下的腐蚀液池 r.pools 也还在；
   * 结果是玩家（花大量金币点满的复活天赋）复活后血量条照样在掉、
   * 射速照样被冻着，血量处于临界时会连续触发 onLose，
   * 把 3 次复活在 1 秒内全部耗光，玩家只会觉得「复活天赋是坏的」。
   * 现在：血量/护盾回满 + 清 DoT + 清掉压在防线上的腐蚀池。 */
  clearDoT(r) {
    if (!r) return;
    r.wallBurn = 0; r.wallBurnT = 0; r._burnToast = 0;
    r.paraT = 0;
    r.poison = 0; r.poisonT = 0;
    r.chill = 0; r.chillT = 0; r.chillMul = 1; r._chillToast = 0;
    if (Array.isArray(r.pools)) {
      const px = r.px != null ? r.px : this.W / 2;
      const py = r.py != null ? r.py : this.H - 58;
      r.pools = r.pools.filter((pl) => !(Math.hypot(px - pl.x, py - pl.y) < (pl.r || 0) + 40));
    }
  },

  onLose() {
    try { if (window.VO) VO.say('VO_008'); } catch (e) {}
    const r = this.run; if (r.over) return;
    if (r.reviveLeft > 0) {
      r.reviveLeft--;
      r.wallHp = r.wallMax != null ? r.wallMax : r.maxHp;
      r.hp = r.wallHp; r.shield = Number(r.maxShield) || 0;
      this.capShield(r);   /* 护盾封顶，否则按历史最高回满 = 复活即无敌 */
      this.clearDoT(r);
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
    this.capShield(r);   /* 同上：护盾按封顶后的值回满，不是历史最高 */
    /* 此前只清了 poison，灼烧/寒霜/腐蚀池同样残留，改走统一清除 */
    this.clearDoT(r);
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

  /* ============================================================
   * 氛围层 A：斜射体积光（god rays）
   * 此前战斗画面只有「背景图 + 两团径向光晕」，是静止且平的，
   * 缺少空气感与光的方向性。这里从画面上方补几道缓慢摆动的柔光束，
   * 用 lighter 叠加，只提亮不遮挡，对任何背景图都成立。
   * ============================================================ */
  drawGodRays(c, W, H, t) {
    if (!c || !isFinite(W) || !isFinite(H)) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const base = W * (0.15 + i * 0.24);
      const sway = Math.sin(t * 0.21 + i * 1.7) * W * 0.05;
      const x = base + sway;
      const wT = W * 0.045, wB = W * 0.17;
      /* 明暗缓慢呼吸，避免光束看起来像贴上去的静态贴图 */
      const al = 0.115 + Math.sin(t * 0.33 + i * 2.1) * 0.040;
      if (al <= 0.005) continue;
      const g = c.createLinearGradient(x, -10, x + W * 0.10, H);
      g.addColorStop(0, 'rgba(255,216,156,' + al.toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(255,190,120,' + (al * 0.40).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,168,88,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - wT, -10);
      c.lineTo(x + wT, -10);
      c.lineTo(x + wB + W * 0.10, H + 10);
      c.lineTo(x - wB + W * 0.10, H + 10);
      c.closePath(); c.fill();
    }
    c.restore();
  },

  /* 灰烬光点精灵：一次性生成离屏贴图，之后只 drawImage。
   * 若每帧为每个粒子新建 createRadialGradient，46 个粒子 × 60fps
   * 会产生 2760 次渐变构造，低端机会掉帧。 */
  _ambSprite() {
    if (this._ambSP) return this._ambSP;
    if (typeof document === 'undefined') return null;
    const s = 32;
    const cv = document.createElement('canvas');
    cv.width = s; cv.height = s;
    const g2 = cv.getContext('2d');
    const rg = g2.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(255,240,206,1)');
    rg.addColorStop(0.34, 'rgba(255,186,110,.62)');
    rg.addColorStop(1, 'rgba(255,138,58,0)');
    g2.fillStyle = rg; g2.fillRect(0, 0, s, s);
    this._ambSP = cv;
    return cv;
  },

  /* ============================================================
   * 氛围层 B：飘浮灰烬 + 暗角
   * ① 灰烬：末日战场该有的悬浮余烬，缓慢上浮 + 横向摆动 + 明暗呼吸，
   *    让画面"有空气在流动"，是成本最低的氛围感来源。
   * ② 暗角：四角压暗、中心提亮，把玩家视线收拢到战场中央，
   *    同时弱化背景图边缘的粗糙拼接感。
   * ============================================================ */
  drawAmbient(c, W, H, t, dt) {
    if (!c || !isFinite(W) || !isFinite(H) || W <= 0 || H <= 0) return;
    const sp = this._ambSprite();
    if (sp) {
      if (!this._amb || !this._ambWH || this._ambWH.W !== W || this._ambWH.H !== H) {
        this._amb = [];
        for (let i = 0; i < 46; i++) {
          this._amb.push({
            x: Math.random() * W, y: Math.random() * H,
            r: 1.1 + Math.random() * 2.6,
            sp: 7 + Math.random() * 19,          /* 上浮速度 px/s */
            dx: (Math.random() - 0.5) * 12,      /* 横向漂移 */
            ph: Math.random() * 6.283,
            a: 0.16 + Math.random() * 0.40,
          });
        }
        this._ambWH = { W: W, H: H };
      }
      const d = (typeof dt === 'number' && isFinite(dt)) ? Math.max(0, Math.min(0.05, dt)) : 0.016;
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (const p of this._amb) {
        p.y -= p.sp * d;
        p.x += (p.dx + Math.sin(t * 0.6 + p.ph) * 8) * d;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + p.ph);   /* 明暗呼吸 */
        const a = p.a * tw;
        if (a <= 0.012) continue;
        const s = p.r * 5.2;
        c.globalAlpha = Math.min(1, a);
        c.drawImage(sp, p.x - s / 2, p.y - s / 2, s, s);
      }
      c.globalAlpha = 1;
      c.restore();
    }
    /* 暗角 */
    c.save();
    const vg = c.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.26,
      W * 0.5, H * 0.52, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(0,0,0,.10)');
    vg.addColorStop(1, 'rgba(0,0,0,.46)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    c.restore();
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
        ? 'rgba(90,225,255,' + (a * 1.5).toFixed(3) + ')'
        : 'rgba(48,14,86,' + (a * 1.7).toFixed(3) + ')';
      c.fillRect(0, y0, W, Math.max(1, y1 - y0));
    }

    /* 3) 横向网格线：消失点处密集，近处稀疏 */
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const y = hz + Math.pow(t, 1.9) * (wall - hz);
      const a = 0.05 + t * 0.26;
      c.strokeStyle = 'rgba(110,240,255,' + Math.min(0.55, a * 1.7).toFixed(3) + ')';
      c.lineWidth = t < 0.25 ? 0.8 : (t < 0.6 ? 1.2 : 2.0);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }

    /* 4) 纵向网格线：自消失点向下发散（透视收敛） */
    for (let i = -8; i <= 8; i++) {
      const xT = vpx + i * 4;
      const xB = vpx + i * (W / 5.0);
      c.strokeStyle = 'rgba(190,110,255,' + (0.16 + Math.min(0.16, Math.abs(i) * 0.016)).toFixed(3) + ')';
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(xT, hz); c.lineTo(xB, wall); c.stroke();
    }

    /* 5) 消失点辉光：远处光源，强化纵深 */
    const gl = c.createRadialGradient(vpx, hz, 0, vpx, hz, Math.max(40, W * 0.55));
    gl.addColorStop(0, 'rgba(120,235,255,0.30)');
    gl.addColorStop(0.5, 'rgba(150,120,255,0.12)');
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
  /* ============================================================
   * 技能持续区域绘制
   * 严重缺失：此前【所有 zone 都画成同一个渐变圆 + 一圈描边】，
   *   旋风加农 / 燃油弹 / 冰暴发生器 / 轰炸机这四种持续技能，
   *   在画面上长得一模一样，只有颜色不同（橙 / 橙 / 蓝 / 橙），
   *   玩家根本分不清脚下是哪一种、范围边界在哪、还剩多久。
   *   另外制导激光的 zone 被 `continue` 跳过、轰炸机 delay 期间也
   *   被 `continue` 跳过 —— 这两处是纯粹的画面缺失。
   * 现在按 zn.t 各自绘制（见下方各 drawZone* 函数），
   *   并补上激光持续光束与轰炸落点预警。
   * ============================================================ */
  drawZones(c) {
    const r = this.run; if (!r.zones) return;
    for (const zn of r.zones) {
      /* 制导激光：zone 上没有 x/y（只有 target 引用），走专属绘制 */
      if (zn.t === 'laser') { this.drawZoneLaser(c, zn); continue; }
      if (!isFinite(zn.x) || !isFinite(zn.y)) continue;
      /* 轰炸机：延时期间画落点预警。
       * 此前 delay>0 直接 continue —— 玩家看不到任何提示，
       * 不知道炸弹会落在哪、什么时候落，只能等它突然炸开。 */
      if (zn.delay != null && zn.delay > 0) {
        if (zn.t === 'bomb') this.drawZoneBombWarn(c, zn);
        continue;
      }
      const a = Math.max(0, Math.min(1, zn.life / (zn.max || 1)));
      if (zn.t === 'vortex') { this.drawZoneVortex(c, zn, a); continue; }
      if (zn.t === 'burn') { this.drawZoneBurn(c, zn, a); continue; }
      if (zn.t === 'storm') { this.drawZoneStorm(c, zn, a); continue; }
      if (zn.t === 'bomb') continue;   /* 已爆发，爆炸表现由 nova 负责 */
      /* 其它区域：保留原渐变圆画法 */
      const col = zn.el === '火' ? '255,122,60' : zn.el === '冰' ? '92,216,255'
                : zn.el === '电' ? '192,140,255' : '123,232,160';
      const rad0 = Math.max(1, zn.r);
      const g = c.createRadialGradient(zn.x, zn.y, 0, zn.x, zn.y, rad0);
      if (g) {
        g.addColorStop(0, 'rgba(' + col + ',' + (0.34 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        c.fillStyle = g;
      } else c.fillStyle = 'rgba(' + col + ',' + (0.2 * a).toFixed(3) + ')';
      c.beginPath(); c.arc(zn.x, zn.y, rad0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(' + col + ',' + (0.6 * a).toFixed(3) + ')';
      c.lineWidth = 2; c.beginPath(); c.arc(zn.x, zn.y, rad0, 0, 7); c.stroke();
    }
  },

  /* 旋风加农：地面旋涡 + 向上收窄的龙卷 + 吸入碎屑 + 高速风刃 */
  drawZoneVortex(c, zn, a) {
    const T = (this.run && this.run.time) || 0;
    const R = Math.max(20, zn.r || 100);
    const cx = zn.x, cy = zn.y;
    c.save();
    /* ① 地面旋涡：3 条螺旋臂绕中心旋转（贴地椭圆透视） */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 3; s++) {
      const off = T * 3.2 + (s / 3) * Math.PI * 2;
      c.beginPath();
      for (let i = 0; i <= 26; i++) {
        const t = i / 26;
        const ang = off + t * Math.PI * 2.4;
        const rr = R * (1 - t * 0.92);
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr * 0.38;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.strokeStyle = 'rgba(150,240,210,' + (0.30 * a).toFixed(3) + ')';
      c.lineWidth = Math.max(0.6, 3 - s * 0.6);
      c.stroke();
    }
    c.restore();
    /* ② 龙卷柱体：由下往上逐层收窄并左右摆动 */
    const H = 96;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const yy = cy - t * H;
      const rr = R * (0.62 - t * 0.30) * (1 + Math.sin(T * 5 + t * 3) * 0.08);
      c.fillStyle = 'rgba(190,250,225,' + (0.075 * a * (1 - t * 0.55)).toFixed(3) + ')';
      c.beginPath();
      c.ellipse(cx + Math.sin(T * 4 + t * 2.2) * 9 * t, yy, Math.max(1, rr), Math.max(0.5, rr * 0.34), 0, 0, 7);
      c.fill();
    }
    /* ③ 吸入碎屑：绕中心螺旋向内并抬升（吸附感的来源） */
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const ph = (T * 1.5 + i / 12) % 1;
      const ang = i * 2.4 + T * 6;
      const rr = R * (1 - ph) * 0.95;
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr * 0.4 - ph * 46;
      const pr = Math.max(0.8, 2.4 * (1 - Math.abs(ph - 0.5) * 2));
      c.fillStyle = 'rgba(215,255,235,' + (0.62 * a * (1 - ph * 0.4)).toFixed(3) + ')';
      c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
    }
    c.restore();
    /* ④ 高速旋转的双风刃（切割感） */
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const ang = T * 7 + i * Math.PI;
      const rr = R * 0.86;
      c.save();
      c.translate(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.42);
      c.rotate(ang + Math.PI / 2);
      c.strokeStyle = 'rgba(180,255,225,' + (0.5 * a).toFixed(3) + ')';
      c.lineWidth = 2.4;
      c.beginPath(); c.arc(0, 0, 13, -0.9, 0.9); c.stroke();
      c.restore();
    }
    c.restore();
    /* ⑤ 范围边界环 */
    c.strokeStyle = 'rgba(140,235,200,' + (0.4 * a).toFixed(3) + ')';
    c.lineWidth = 2;
    c.beginPath(); c.ellipse(cx, cy, R, R * 0.38, 0, 0, 7); c.stroke();
    c.restore();
  },

  /* 燃油弹：焦痕 + 不规则火池 + 跳动火舌 + 上升火星 + 黑烟 */
  drawZoneBurn(c, zn, a) {
    const T = (this.run && this.run.time) || 0;
    const R = Math.max(20, zn.r || 120);
    const cx = zn.x, cy = zn.y;
    c.save();
    /* ① 地面焦痕 */
    const gg = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    gg.addColorStop(0, 'rgba(38,20,14,' + (0.5 * a).toFixed(3) + ')');
    gg.addColorStop(1, 'rgba(30,16,12,0)');
    c.fillStyle = gg;
    c.beginPath(); c.ellipse(cx, cy, R, R * 0.4, 0, 0, 7); c.fill();
    c.globalCompositeOperation = 'lighter';
    /* ② 不规则火池：6 团偏移的火焰叠加，火面在动（不是死板的一个圆） */
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const wob = Math.sin(T * 3.4 + i * 1.7) * 0.20;
      const ox = Math.cos(ang) * R * (0.34 + wob * 0.3);
      const oy = Math.sin(ang) * R * (0.14 + wob * 0.12);
      const rr = Math.max(2, R * (0.34 + Math.sin(T * 4.2 + i) * 0.07));
      const g = c.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
      g.addColorStop(0, 'rgba(255,190,70,' + (0.34 * a).toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(255,110,40,' + (0.20 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(180,50,20,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(cx + ox, cy + oy, rr, rr * 0.5, 0, 0, 7); c.fill();
    }
    /* ③ 跳动火舌（10 根，高度随正弦呼吸） */
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + T * 0.4;
      const rr = R * (0.24 + (((i * 37) % 10) / 10) * 0.62);
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr * 0.42;
      const h = (16 + Math.abs(Math.sin(T * 6 + i * 2.1)) * 26) * (0.7 + a * 0.5);
      const g = c.createLinearGradient(px, py, px, py - h);
      g.addColorStop(0, 'rgba(255,236,170,' + (0.85 * a).toFixed(3) + ')');
      g.addColorStop(0.35, 'rgba(255,150,50,' + (0.6 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,70,20,0)');
      c.fillStyle = g;
      const w = 3.4 + Math.sin(T * 7 + i) * 1.2;
      c.beginPath();
      c.moveTo(px - w, py);
      c.quadraticCurveTo(px - w * 0.3, py - h * 0.6, px, py - h);
      c.quadraticCurveTo(px + w * 0.3, py - h * 0.6, px + w, py);
      c.closePath(); c.fill();
    }
    /* ④ 上升火星 */
    for (let i = 0; i < 9; i++) {
      const sd = i * 1.37;
      const ph = (T * 0.55 + (sd % 1)) % 1;
      const px = cx + Math.cos(sd * 2.4) * R * 0.6 + Math.sin(T * 2 + i) * 6;
      const py = cy + Math.sin(sd * 2.4) * R * 0.24 - ph * 74;
      c.fillStyle = 'rgba(255,' + (170 + Math.floor((1 - ph) * 60)) + ',80,' + ((1 - ph) * 0.72 * a).toFixed(3) + ')';
      c.beginPath(); c.arc(px, py, Math.max(0.7, 2.1 * (1 - ph)), 0, 7); c.fill();
    }
    c.restore();
    /* ⑤ 黑烟（火池的"烧"不只靠火，烟才像真的在烧） */
    for (let i = 0; i < 4; i++) {
      const ph = ((T * 0.32) + i / 4) % 1;
      const px = cx + Math.sin(T * 1.2 + i * 2) * 12;
      const py = cy - 30 - ph * 96;
      c.fillStyle = 'rgba(70,58,54,' + ((1 - ph) * 0.16 * a).toFixed(3) + ')';
      c.beginPath(); c.arc(px, py, 8 + ph * 18, 0, 7); c.fill();
    }
    /* ⑥ 危险边界（虚线，提示别站进去） */
    c.save();
    c.strokeStyle = 'rgba(255,120,50,' + (0.34 * a).toFixed(3) + ')';
    c.lineWidth = 2; c.setLineDash([7, 6]);
    c.beginPath(); c.ellipse(cx, cy, R, R * 0.4, 0, 0, 7); c.stroke();
    c.setLineDash([]);
    c.restore();
  },

  /* 冰暴发生器：霜层 + 反向双层冰环 + 下落冰晶 + 中心寒气 */
  drawZoneStorm(c, zn, a) {
    const T = (this.run && this.run.time) || 0;
    const R = Math.max(20, zn.r || 140);
    const cx = zn.x, cy = zn.y;
    c.save();
    /* ① 地面霜层 */
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(200,245,255,' + (0.30 * a).toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(120,205,255,' + (0.16 * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(70,160,230,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, cy, R, R * 0.4, 0, 0, 7); c.fill();
    /* ② 反向旋转的双层冰环（8 片冰棱 × 2 层） */
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 2; s++) {
      const dir = s === 0 ? 1 : -1;
      const rr = R * (0.92 - s * 0.34);
      for (let i = 0; i < 8; i++) {
        const ang = dir * T * (2.4 - s * 0.9) + (i / 8) * Math.PI * 2;
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr * 0.4;
        c.save(); c.translate(px, py); c.rotate(ang);
        c.fillStyle = 'rgba(225,250,255,' + (0.55 * a).toFixed(3) + ')';
        c.beginPath();
        c.moveTo(0, -5); c.lineTo(3.2, 0); c.lineTo(0, 5); c.lineTo(-3.2, 0);
        c.closePath(); c.fill();
        c.restore();
      }
    }
    c.restore();
    /* ③ 空中下落的冰晶（24 片，下落 + 横向摆动 + 自转） */
    for (let i = 0; i < 24; i++) {
      const sd = i * 1.11;
      const sp = 0.5 + (((i * 7) % 5) * 0.12);
      const ph = ((T * sp) + (sd % 1)) % 1;
      const ang = sd * 2.4;
      const rr = R * (0.15 + (((i * 13) % 10) / 10) * 0.8);
      const px = cx + Math.cos(ang) * rr + Math.sin(T * 2.4 + i) * 9;
      const py = cy - 130 + ph * 150 + Math.sin(ang) * rr * 0.3;
      const sz = 1.6 + (((i * 3) % 4) * 0.5);
      c.save();
      c.translate(px, py); c.rotate(T * 1.6 + i);
      c.strokeStyle = 'rgba(235,252,255,' + ((1 - Math.abs(ph - 0.5) * 1.2) * 0.7 * a).toFixed(3) + ')';
      c.lineWidth = 1.2;
      c.beginPath();
      for (let k = 0; k < 3; k++) {
        const a0 = (k / 3) * Math.PI;
        c.moveTo(-Math.cos(a0) * sz * 2, -Math.sin(a0) * sz * 2);
        c.lineTo(Math.cos(a0) * sz * 2, Math.sin(a0) * sz * 2);
      }
      c.stroke();
      c.restore();
    }
    /* ④ 中心寒气核心 */
    c.save(); c.globalCompositeOperation = 'lighter';
    const cg = c.createRadialGradient(cx, cy - 24, 0, cx, cy - 24, 34);
    cg.addColorStop(0, 'rgba(240,255,255,' + (0.42 * a).toFixed(3) + ')');
    cg.addColorStop(1, 'rgba(90,190,255,0)');
    c.fillStyle = cg;
    c.beginPath(); c.arc(cx, cy - 24, 34, 0, 7); c.fill();
    c.restore();
    /* ⑤ 范围边界环 */
    c.strokeStyle = 'rgba(150,225,255,' + (0.45 * a).toFixed(3) + ')';
    c.lineWidth = 2;
    c.beginPath(); c.ellipse(cx, cy, R, R * 0.4, 0, 0, 7); c.stroke();
    c.restore();
  },

  /* 轰炸机：落点预警（收缩环 + 闪烁十字准星 + 高空落下的炸弹） */
  drawZoneBombWarn(c, zn) {
    const T = (this.run && this.run.time) || 0;
    const R = Math.max(20, zn.r || 95);
    const cx = zn.x, cy = zn.y;
    /* 越接近落点越亮越大（delay 从初值递减到 0） */
    const k = 1 - Math.max(0, Math.min(1, (zn.delay || 0) / 0.7));
    const blink = 0.45 + Math.abs(Math.sin(T * 12)) * 0.55;
    c.save();
    /* ① 外圈锁定环 */
    c.strokeStyle = 'rgba(255,90,80,' + (0.5 * blink).toFixed(3) + ')';
    c.lineWidth = 2.2;
    const r1 = R * (1.15 - k * 0.25);
    c.beginPath(); c.ellipse(cx, cy, r1, r1 * 0.4, 0, 0, 7); c.stroke();
    /* ② 收缩内环（倒计时感） */
    c.strokeStyle = 'rgba(255,190,120,' + (0.7 * blink).toFixed(3) + ')';
    c.lineWidth = 1.8;
    const r2 = Math.max(2, R * (0.9 - k * 0.72));
    c.beginPath(); c.ellipse(cx, cy, r2, r2 * 0.4, 0, 0, 7); c.stroke();
    /* ③ 闪烁十字准星 */
    c.strokeStyle = 'rgba(255,120,90,' + (0.8 * blink).toFixed(3) + ')';
    c.lineWidth = 2;
    const g0 = 10 + k * 8;
    c.beginPath();
    c.moveTo(cx - g0 - 12, cy); c.lineTo(cx - g0, cy);
    c.moveTo(cx + g0, cy); c.lineTo(cx + g0 + 12, cy);
    c.moveTo(cx, cy - g0 * 0.5 - 8); c.lineTo(cx, cy - g0 * 0.5);
    c.moveTo(cx, cy + g0 * 0.5); c.lineTo(cx, cy + g0 * 0.5 + 8);
    c.stroke();
    /* ④ 高空投下的炸弹（带尾焰，从画面上方落向落点） */
    const fall = 1 - Math.max(0, Math.min(1, (zn.delay || 0) / 0.6));
    const by = cy - 260 + fall * 260;
    c.fillStyle = 'rgba(40,44,52,.95)';
    c.beginPath(); c.ellipse(cx, by, 7, 11, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(120,128,142,.95)';
    c.beginPath(); c.ellipse(cx, by - 8, 4, 5, 0, 0, 7); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter';
    const fg = c.createRadialGradient(cx, by - 13, 0, cx, by - 13, 12);
    fg.addColorStop(0, 'rgba(255,200,120,.9)');
    fg.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = fg;
    c.beginPath(); c.arc(cx, by - 13, 12, 0, 7); c.fill();
    c.restore();
    c.restore();
  },

  /* 制导激光：从枪口到目标的持续激光束
   * 缺失：zone.t==='laser' 在 drawZones 里被 `continue` 跳过，
   *   全项目没有别处绘制它。此前靠 update 每帧 push 一个 life=0.08
   *   的 beam 拼出闪烁光束（3 秒要 push 180 个特效对象），
   *   画面上是一条一闪一闪的短光，没有"持续灼烧"的观感。
   * 现在画真正的持续光束：枪口蓄能 + 外辉光 + 闪烁核心 +
   *   沿束流动的能量环 + 目标身上的持续爆燃与溅射电弧。 */
  drawZoneLaser(c, zn) {
    const r = this.run; if (!r) return;
    const tg = zn.target;
    if (!tg || tg.dead) return;
    if (!isFinite(tg.x) || !isFinite(tg.y)) return;
    const T = r.time || 0;
    const x0 = r.px, y0 = (r.py || 0) - 26;
    const x1 = tg.x, y1 = tg.y - 10;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!isFinite(len) || len < 1) return;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const a = Math.max(0, Math.min(1, zn.life / (zn.max || 1)));
    c.save();
    c.translate(x0, y0); c.rotate(ang);
    /* 枪口蓄能核心 */
    c.save(); c.globalCompositeOperation = 'lighter';
    const mg = c.createRadialGradient(0, 0, 0, 0, 0, 16);
    mg.addColorStop(0, 'rgba(255,255,255,.95)');
    mg.addColorStop(0.4, 'rgba(140,200,255,.7)');
    mg.addColorStop(1, 'rgba(90,140,255,0)');
    c.fillStyle = mg;
    c.beginPath(); c.arc(0, 0, 16, 0, 7); c.fill();
    c.restore();
    /* ① 外层辉光 */
    c.save(); c.globalCompositeOperation = 'lighter';
    const og = c.createLinearGradient(0, 0, len, 0);
    og.addColorStop(0, 'rgba(120,190,255,' + (0.55 * a).toFixed(3) + ')');
    og.addColorStop(1, 'rgba(180,140,255,' + (0.42 * a).toFixed(3) + ')');
    c.fillStyle = og;
    c.fillRect(0, -6.5, len, 13);
    c.restore();
    /* ② 亮白核心（高频闪烁 = 激光的电流感） */
    const fl = 0.82 + Math.sin(T * 42) * 0.18;
    c.fillStyle = 'rgba(255,255,255,' + (0.95 * fl * a).toFixed(3) + ')';
    c.fillRect(0, -1.9, len, 3.8);
    /* ③ 沿束流动的能量环（体现"持续"而不是"一瞬"） */
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = ((T * 1.1) + i / 3) % 1;
      const px = ph * len;
      const rg = c.createRadialGradient(px, 0, 0, px, 0, 11);
      rg.addColorStop(0, 'rgba(200,235,255,' + (0.75 * a).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(120,160,255,0)');
      c.fillStyle = rg;
      c.beginPath(); c.arc(px, 0, 11, 0, 7); c.fill();
    }
    c.restore();
    c.restore();
    /* ④ 命中点持续爆燃 + 溅射电弧 */
    c.save(); c.globalCompositeOperation = 'lighter';
    const hr = 26 + Math.sin(T * 22) * 5;
    const hg = c.createRadialGradient(x1, y1, 0, x1, y1, Math.max(1, hr));
    hg.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a).toFixed(3) + ')');
    hg.addColorStop(0.35, 'rgba(150,200,255,' + (0.65 * a).toFixed(3) + ')');
    hg.addColorStop(1, 'rgba(90,140,255,0)');
    c.fillStyle = hg;
    c.beginPath(); c.arc(x1, y1, Math.max(1, hr), 0, 7); c.fill();
    for (let i = 0; i < 4; i++) {
      const a0 = T * 9 + (i / 4) * Math.PI * 2;
      c.strokeStyle = 'rgba(200,230,255,' + (0.6 * a).toFixed(3) + ')';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x1 + Math.cos(a0) * 13 + Math.sin(T * 30 + i) * 4,
               y1 + Math.sin(a0) * 9 + Math.cos(T * 26 + i) * 3);
      c.lineTo(x1 + Math.cos(a0) * 22, y1 + Math.sin(a0) * 15);
      c.stroke();
    }
    c.restore();
  },

  /* 炮台：Q 版贴塔 + 元素氛围 + 开火后坐
   * 重做要点（此前炮台是几何色块，玩家反馈"太难看"）：
   *   ① 四种炮台改用二头身 Q 版立绘 assets/chibi/t_*.png，与主角/僵尸同一套画风
   *   ② 待机呼吸浮动 + 开火后坐位移：以前是纯静态色块，看不出炮台是否在工作
   *   ③ 底座元素光环 + 常驻氛围粒子（雪花/火苗/电弧/蓄能），静止也能分辨属性
   *   ④ 贴图未就绪 / 该种类无图时退回原矢量画法，绝不开天窗 */
  /* ============================================================
   * 掉落物绘制：材料 / 经验 / 金币
   * 严重缺失：r.drops 有完整的生成、下落、磁吸、拾取逻辑（update 里一直在跑），
   *   但全项目【没有任何一处绘制它】—— 玩家击杀僵尸后屏幕上看不到任何掉落，
   *   只看到材料、经验莫名进账，拾取音效凭空响起。
   *   这是"游戏里图片/动画缺失"最直接的一处。
   * 现在补上三类掉落物的可视化（全部带贴地投影，与 3D 场景一致）：
   *   材料 = 对应颜色的菱形晶体，自转 + 上下浮动 + 元素光晕
   *   经验 = 青蓝脉动光球 + 两颗环绕光点
   *   金币 = 旋转金币（宽度随相位变化模拟翻转）+ 金光晕 + 白高光
   * ============================================================ */
  drawDrops(c) {
    const r = this.run;
    if (!r || !r.drops || !r.drops.length) return;
    const T = r.time || 0;
    /* 材料 → 颜色（与背包/图鉴里的材料色一致，便于一眼认出掉了什么） */
    const MCOL = {
      M01: '176,196,222', M02: '255,196,92', M03: '198,140,255',
      M04: '255,120,72', M05: '110,232,214',
    };
    for (const d of r.drops) {
      if (!isFinite(d.x) || !isFinite(d.y)) continue;
      const sc = this.depthScale(d.y);
      const ph = T * 5 + (d.x || 0) * 0.07;
      const bob = Math.sin(ph * 0.62) * 2.4 * sc;
      const y = d.y + bob;
      /* 贴地投影 */
      c.fillStyle = 'rgba(0,0,0,.30)';
      c.beginPath(); c.ellipse(d.x, d.y + 3 * sc, 6 * sc, 2.4 * sc, 0, 0, 7); c.fill();

      const hasItem = !!(d.items && d.items.length);
      const isGold = !hasItem && Number(d.gold) > 0;

      if (hasItem) {
        /* ---- 材料晶体 ---- */
        const it = d.items[0];
        const col = MCOL[it] || '255,214,120';
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g1 = c.createRadialGradient(d.x, y, 0, d.x, y, 11 * sc);
        g1.addColorStop(0, 'rgba(' + col + ',.55)');
        g1.addColorStop(1, 'rgba(' + col + ',0)');
        c.fillStyle = g1;
        c.beginPath(); c.arc(d.x, y, 11 * sc, 0, 7); c.fill();
        c.restore();
        /* 自转菱形晶体 */
        c.save();
        c.translate(d.x, y); c.rotate(ph * 0.85);
        const cr = 5.4 * sc;
        c.fillStyle = 'rgba(' + col + ',.95)';
        c.beginPath(); c.moveTo(0, -cr); c.lineTo(cr * 0.72, 0); c.lineTo(0, cr); c.lineTo(-cr * 0.72, 0);
        c.closePath(); c.fill();
        /* 内部亮面（左上受光） */
        c.fillStyle = 'rgba(255,255,255,.62)';
        c.beginPath(); c.moveTo(0, -cr); c.lineTo(cr * 0.72, 0); c.lineTo(0, 0);
        c.closePath(); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -cr); c.lineTo(cr * 0.72, 0); c.lineTo(0, cr); c.lineTo(-cr * 0.72, 0);
        c.closePath(); c.stroke();
        c.restore();
      } else if (isGold) {
        /* ---- 金币：宽度按 cos 变化 = 翻转感 ---- */
        const r0 = 5.6 * sc;
        const w = r0 * Math.max(0.26, Math.abs(Math.cos(ph * 0.9)));
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g1 = c.createRadialGradient(d.x, y, 0, d.x, y, r0 * 2.6);
        g1.addColorStop(0, 'rgba(255,232,150,.75)');
        g1.addColorStop(1, 'rgba(255,180,40,0)');
        c.fillStyle = g1;
        c.beginPath(); c.arc(d.x, y, r0 * 2.6, 0, 7); c.fill();
        c.restore();
        c.fillStyle = '#ffd76a';
        c.beginPath(); c.ellipse(d.x, y, w, r0, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(150,92,16,.9)'; c.lineWidth = 1.1;
        c.beginPath(); c.ellipse(d.x, y, w, r0, 0, 0, 7); c.stroke();
        if (w > r0 * 0.45) {
          /* 币面高光（只在正面朝上时可见） */
          c.fillStyle = 'rgba(255,255,255,.55)';
          c.beginPath(); c.ellipse(d.x - w * 0.3, y - r0 * 0.3, w * 0.3, r0 * 0.28, -0.5, 0, 7); c.fill();
        }
      } else {
        /* ---- 经验光球 ---- */
        const r0 = 4.4 * sc;
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g1 = c.createRadialGradient(d.x, y, 0, d.x, y, r0 * 2.8);
        g1.addColorStop(0, 'rgba(235,255,255,.95)');
        g1.addColorStop(0.32, 'rgba(110,225,255,.8)');
        g1.addColorStop(1, 'rgba(60,160,240,0)');
        c.fillStyle = g1;
        c.beginPath(); c.arc(d.x, y, r0 * 2.8, 0, 7); c.fill();
        /* 脉动外环 */
        const pr = (ph * 0.5) % 1;
        c.strokeStyle = 'rgba(150,235,255,' + ((1 - pr) * 0.5).toFixed(3) + ')';
        c.lineWidth = 1.4;
        c.beginPath(); c.ellipse(d.x, y, r0 * (1 + pr * 1.9), r0 * (1 + pr * 1.9) * 0.6, 0, 0, 7); c.stroke();
        /* 两颗环绕光点 */
        for (let i = 0; i < 2; i++) {
          const a0 = ph * 1.5 + i * Math.PI;
          c.fillStyle = 'rgba(220,250,255,.9)';
          c.beginPath();
          c.arc(d.x + Math.cos(a0) * r0 * 1.5, y + Math.sin(a0) * r0 * 0.95, 1.5 * sc, 0, 7);
          c.fill();
        }
        c.restore();
      }
    }
  },
  drawTurrets(c) {
    const r = this.run;
    const CB = (typeof window !== 'undefined') ? window.CHIBI : null;
    const T = r.time || 0;
    for (const t of r.turrets) {
      if (!isFinite(t.x) || !isFinite(t.y)) continue;
      /* 与战斗循环同一道钳制：绘制高度 46+lv*1.4、射程 rng+lv*12 都随 lv 放大，
       * 首帧绘制可能早于战斗循环，故此处再收紧一次。 */
      t.lv = Math.min(Math.max(Number(t.lv) || 1, 1), EX.TURRET_MAX_LV != null ? EX.TURRET_MAX_LV : 20);
      const el = EX.elements.find((x) => x.k === t.def.el) || { c: '#ffd76a' };
      const tg = this.nearest(t.x, t.y, null, t.def.rng + t.lv * 12,
        { preferElite: t.def.preferElite });
      const a = tg ? Math.atan2(tg.y - t.y, tg.x - t.x) : -Math.PI / 2;
      const sc = this.depthScale(t.y);
      /* 元素色转 rgb 串（统一用于光环/粒子/徽章） */
      const _hx = String(el.c || '#ffd76a').replace('#', '');
      const _r = parseInt(_hx.slice(0, 2), 16) || 255;
      const _g = parseInt(_hx.slice(2, 4), 16) || 255;
      const _b = parseInt(_hx.slice(4, 6), 16) || 255;
      const rgb = _r + ',' + _g + ',' + _b;
      /* 开火后坐：fire 由 update 递减，fk 呈 0→1→0 的一次脉冲 */
      const fire = Math.max(0, Math.min(0.22, t.fire || 0));
      const fk = fire > 0 ? Math.sin((fire / 0.22) * Math.PI) : 0;
      const bob = Math.sin(T * 2 + (t.x || 0) * 0.03) * 1.3 * sc;
      const kx = -Math.cos(a) * fk * 4.4 * sc;
      const ky = -Math.sin(a) * fk * 1.8 * sc;
      const px = t.x + kx, py = t.y + bob + ky * 0.35;

      /* 接地投影 */
      c.fillStyle = 'rgba(0,0,0,.36)';
      c.beginPath(); c.ellipse(t.x + 2 * sc, t.y + 2 * sc, 16 * sc, 6.5 * sc, 0, 0, 7); c.fill();

      /* 底座元素光环（贴地椭圆，呼吸 + 开火瞬间增亮） */
      const gl = 0.30 + Math.sin(T * 2.4 + (t.x || 0) * 0.02) * 0.08 + fk * 0.4;
      c.strokeStyle = 'rgba(' + rgb + ',' + Math.min(0.9, gl).toFixed(3) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(t.x, t.y + 2 * sc, (14 + t.lv * 0.5) * sc, 5.6 * sc, 0, 0, 7); c.stroke();

      /* Q 版立绘（优先），失败则退回原矢量画法 */
      const key = CB ? CB.keyOfTurret(t.def.id) : null;
      const H = (46 + t.lv * 1.4) * sc;
      let drew = false;
      if (key) drew = CB.draw(c, key, px, py + 3 * sc, H, {});
      if (!drew) {
        const R = 15 * sc;
        this.cylinder(c, px, py - R * 0.55, R * 1.7, R * 0.62, '#1b2434', '#3d4a63', R * 0.30);
        c.fillStyle = '#2b3650';
        c.beginPath(); c.ellipse(px, py - R * 0.55, R * 0.85, R * 0.34, 0, 0, 7); c.fill();
        c.strokeStyle = el.c; c.lineWidth = 2;
        c.beginPath(); c.ellipse(px, py - R * 0.55, R * 0.85, R * 0.34, 0, 0, 7); c.stroke();
        c.save(); c.translate(px, py - R * 0.35); c.rotate(a);
        const bg2 = c.createLinearGradient(0, -4 * sc, 0, 4 * sc);
        bg2.addColorStop(0, '#ffffff'); bg2.addColorStop(0.42, el.c); bg2.addColorStop(1, 'rgba(0,0,0,.55)');
        c.fillStyle = bg2;
        c.beginPath();
        if (c.roundRect) c.roundRect(2 * sc, -3.6 * sc, 21 * sc, 7.2 * sc, 2 * sc);
        else c.rect(2 * sc, -3.6 * sc, 21 * sc, 7.2 * sc);
        c.fill(); c.restore();
        c.font = Math.round(13 * sc) + 'px sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(t.def.icon, px, py - R * 0.55);
      }

      /* 常驻元素氛围粒子（不用开火也能分辨炮台属性） */
      this.drawTurretAura(c, t, rgb, sc, T, fk, a);

      /* 等级徽章：Q 版胶囊牌 */
      const bw = 26 * sc, bh = 13 * sc, bx = t.x - bw / 2, by = t.y + 5 * sc;
      c.fillStyle = 'rgba(26,18,40,.82)';
      c.beginPath();
      if (c.roundRect) c.roundRect(bx, by, bw, bh, bh / 2); else c.rect(bx, by, bw, bh);
      c.fill();
      c.strokeStyle = 'rgba(' + rgb + ',.85)'; c.lineWidth = 1.4;
      c.beginPath();
      if (c.roundRect) c.roundRect(bx, by, bw, bh, bh / 2); else c.rect(bx, by, bw, bh);
      c.stroke();
      c.font = 'bold ' + Math.round(9.5 * sc) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#ffe28a';
      c.fillText('Lv' + t.lv, t.x, by + bh / 2 + 0.5 * sc);
    }
  },

  /* 炮台开火特效：亮核 + 元素辉光 + 沿炮口方向的星芒 + 扩散环 */
  /* 炮台开火特效：按【元素】分成四种截然不同的枪口表现。
   * 修复前：四种炮台共用同一套「亮核 + 辉光 + 四向星芒 + 扩散环」，
   *   只换颜色 —— 寒冰、火焰、电磁、狙击开火是同一个闪光，毫无辨识度，
   *   这也是"攻击画面丑"的直接来源之一。
   * 修复后：
   *   冰   = 六角冰花炸开 + 白霜扩散环 + 冰屑飞散
   *   火   = 爆燃火球 + 双层焰环 + 火星四溅
   *   电   = 扇形放射电弧 + 白紫电球 + 末端电光
   *   狙击 = 细长枪口焰锥 + 白色十字闪 + 贴地冲击环
   * 四种共用一层"亮核辉光"基底，再叠加各自专属层。 */
  drawTurretFire(c, f, al) {
    const el = EX.elements.find((x) => x.k === f.el) || { c: '#ffd76a' };
    const _hx = String(el.c || '#ffd76a').replace('#', '');
    const rgb = (parseInt(_hx.slice(0, 2), 16) || 255) + ',' +
      (parseInt(_hx.slice(2, 4), 16) || 255) + ',' +
      (parseInt(_hx.slice(4, 6), 16) || 255);
    const k = 1 - al;
    const rr = f.r * (0.45 + k * 0.85);
    const aim = f.a || 0;
    c.save();
    c.globalCompositeOperation = 'lighter';
    /* 基底：亮核 + 元素辉光（四种共用，保证开火瞬间都有明确的"亮"） */
    const g1 = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 1.75));
    g1.addColorStop(0, 'rgba(255,255,255,' + (al * 0.9).toFixed(3) + ')');
    g1.addColorStop(0.34, 'rgba(' + rgb + ',' + (al * 0.72).toFixed(3) + ')');
    g1.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g1;
    c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 1.75), 0, 7); c.fill();

    if (f.el === '冰') {
      /* 六角冰花：6 条主刺 + 每条末端的小分叉 */
      c.strokeStyle = 'rgba(226,250,255,' + (al * 0.95).toFixed(3) + ')';
      c.lineWidth = 1.9;
      for (let i = 0; i < 6; i++) {
        const a0 = aim + i * Math.PI / 3 + k * 0.5;
        const L = rr * (1.5 - k * 0.35);
        const ex = f.x + Math.cos(a0) * L, ey = f.y + Math.sin(a0) * L * 0.78;
        c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(ex, ey); c.stroke();
        /* 末端分叉（两个小刺） */
        c.lineWidth = 1.1;
        for (const sg of [-1, 1]) {
          const a1 = a0 + sg * 0.55;
          const L2 = L * 0.42;
          c.beginPath(); c.moveTo(ex, ey);
          c.lineTo(ex + Math.cos(a1) * L2, ey + Math.sin(a1) * L2 * 0.78); c.stroke();
        }
        c.lineWidth = 1.9;
      }
      /* 白霜扩散环（贴地椭圆） */
      c.strokeStyle = 'rgba(200,244,255,' + (al * 0.75).toFixed(3) + ')';
      c.lineWidth = 2.2;
      c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, rr * 1.5), Math.max(1, rr * 0.85), 0, 0, 7); c.stroke();
      /* 冰屑：朝炮口方向扇形飞散的 4 片小菱形 */
      for (let i = 0; i < 4; i++) {
        const t2 = k * 1.15;
        const a2 = aim + (i - 1.5) * 0.34;
        const d2 = rr * (0.9 + t2 * 1.5);
        const px = f.x + Math.cos(a2) * d2, py = f.y + Math.sin(a2) * d2 * 0.72;
        c.save(); c.translate(px, py); c.rotate(a2 + k);
        c.fillStyle = 'rgba(235,252,255,' + (al * 0.85).toFixed(3) + ')';
        c.beginPath(); c.moveTo(2.6, 0); c.lineTo(0, 1.5); c.lineTo(-2.6, 0); c.lineTo(0, -1.5);
        c.closePath(); c.fill(); c.restore();
      }
    } else if (f.el === '火') {
      /* 爆燃火球：白核 → 亮黄 → 橙 → 透明 */
      const g2 = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 2.0));
      g2.addColorStop(0, 'rgba(255,255,235,' + (al * 0.95).toFixed(3) + ')');
      g2.addColorStop(0.26, 'rgba(255,214,110,' + (al * 0.85).toFixed(3) + ')');
      g2.addColorStop(0.6, 'rgba(255,120,40,' + (al * 0.6).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(180,40,10,0)');
      c.fillStyle = g2;
      c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 2.0), 0, 7); c.fill();
      /* 双层焰环（外圈更淡更大） */
      for (let i = 0; i < 2; i++) {
        const rk = 1.15 + i * 0.45;
        c.strokeStyle = 'rgba(' + (i ? '255,150,60' : '255,232,170') + ',' +
          (al * (i ? 0.5 : 0.8)).toFixed(3) + ')';
        c.lineWidth = 2.4 - i * 0.8;
        c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, rr * rk), Math.max(1, rr * rk * 0.7), 0, 0, 7); c.stroke();
      }
      /* 火星四溅：6 颗朝炮口扇形飞散，带下坠 */
      for (let i = 0; i < 6; i++) {
        const a2 = aim + (i / 5 - 0.5) * 1.5;
        const d2 = rr * (0.7 + k * 1.9);
        const px = f.x + Math.cos(a2) * d2;
        const py = f.y + Math.sin(a2) * d2 * 0.72 + k * k * 7;
        const pr = Math.max(0.5, 2.1 * (al - k * 0.35));
        const g3 = c.createRadialGradient(px, py, 0, px, py, pr * 2.2);
        g3.addColorStop(0, 'rgba(255,250,220,' + (al * 0.95).toFixed(3) + ')');
        g3.addColorStop(1, 'rgba(255,140,40,0)');
        c.fillStyle = g3;
        c.beginPath(); c.arc(px, py, pr * 2.2, 0, 7); c.fill();
      }
    } else if (f.el === '电') {
      /* 扇形放射电弧：朝炮口 ±60° 内 4 条锯齿闪电 */
      for (let i = 0; i < 4; i++) {
        const a0 = aim + (i / 3 - 0.5) * 2.0;
        c.strokeStyle = 'rgba(236,220,255,' + (al * 0.92).toFixed(3) + ')';
        c.lineWidth = 1.7;
        c.beginPath(); c.moveTo(f.x, f.y);
        const segs = 4;
        for (let s = 1; s <= segs; s++) {
          const L = rr * (1.7 * s / segs) * (1 - k * 0.25);
          const jt = Math.sin(s * 2.7 + i * 1.9 + k * 6) * 3.4;
          c.lineTo(f.x + Math.cos(a0) * L - Math.sin(a0) * jt,
            f.y + Math.sin(a0) * L * 0.78 + Math.cos(a0) * jt);
        }
        c.stroke();
        /* 第二道细白线（电弧内芯） */
        c.strokeStyle = 'rgba(255,255,255,' + (al * 0.8).toFixed(3) + ')';
        c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(f.x, f.y);
        for (let s = 1; s <= segs; s++) {
          const L = rr * (1.7 * s / segs) * (1 - k * 0.25);
          const jt = Math.sin(s * 2.7 + i * 1.9 + k * 6 + 2.1) * 2.2;
          c.lineTo(f.x + Math.cos(a0) * L - Math.sin(a0) * jt,
            f.y + Math.sin(a0) * L * 0.78 + Math.cos(a0) * jt);
        }
        c.stroke();
      }
      /* 电球炸点 */
      const g2 = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 1.5));
      g2.addColorStop(0, 'rgba(255,255,255,' + (al * 0.95).toFixed(3) + ')');
      g2.addColorStop(0.32, 'rgba(210,175,255,' + (al * 0.8).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g2;
      c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 1.5), 0, 7); c.fill();
      /* 贴地电磁环 */
      c.strokeStyle = 'rgba(' + rgb + ',' + (al * 0.7).toFixed(3) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, rr * 1.35), Math.max(1, rr * 0.72), 0, 0, 7); c.stroke();
    } else {
      /* 狙击 / 物理：细长枪口焰锥 + 白色十字闪 + 贴地冲击环 */
      c.save();
      c.translate(f.x, f.y); c.rotate(aim);
      const fl = rr * 2.3, fw = rr * 0.62;
      const g2 = c.createLinearGradient(0, 0, fl, 0);
      g2.addColorStop(0, 'rgba(255,255,255,' + (al * 0.95).toFixed(3) + ')');
      g2.addColorStop(0.35, 'rgba(255,226,150,' + (al * 0.8).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(255,150,60,0)');
      c.fillStyle = g2;
      c.beginPath(); c.moveTo(0, 0);
      c.lineTo(fl, -fw * 0.34); c.lineTo(fl * 1.12, 0); c.lineTo(fl, fw * 0.34);
      c.closePath(); c.fill();
      c.restore();
      /* 白色十字闪（枪口爆闪） */
      const sl = rr * (1.9 - k * 0.5);
      c.strokeStyle = 'rgba(255,255,255,' + (al * 0.85).toFixed(3) + ')';
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(f.x - sl, f.y); c.lineTo(f.x + sl, f.y);
      c.moveTo(f.x, f.y - sl * 0.7); c.lineTo(f.x, f.y + sl * 0.7);
      c.stroke();
      /* 贴地冲击环 */
      c.strokeStyle = 'rgba(255,238,190,' + (al * 0.7).toFixed(3) + ')';
      c.lineWidth = 2.2;
      c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, rr * 1.5), Math.max(1, rr * 0.55), 0, 0, 7); c.stroke();
    }
    c.restore();
  },

  /* 炮台常驻元素氛围：冰=飘雪 / 火=火苗 / 电=旋转电弧 / 物(狙击)=蓄能环 */
  drawTurretAura(c, t, rgb, sc, T, fk, aim) {
    const bx = t.x, by = t.y - 20 * sc;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const el = t.def.el;
    if (el === '冰') {
      for (let i = 0; i < 4; i++) {
        const ph = T * 1.1 + i * 1.7;
        const fx = bx + Math.cos(ph * 0.7 + i) * 15 * sc;
        const fy = by + ((ph * 14) % 26) * sc - 10 * sc;
        const al = 0.55 * (1 - (((ph * 14) % 26) / 26)) + fk * 0.4;
        c.fillStyle = 'rgba(' + rgb + ',' + Math.min(0.85, al).toFixed(3) + ')';
        c.beginPath(); c.arc(fx, fy, 1.9 * sc, 0, 7); c.fill();
      }
    } else if (el === '火') {
      for (let i = 0; i < 3; i++) {
        const ph = T * 3 + i * 2.1;
        const fx = bx + Math.cos(ph * 0.6 + i * 2) * 11 * sc;
        const fy = by - 4 * sc - ((ph * 9) % 14) * sc;
        const al = 0.6 * (1 - (((ph * 9) % 14) / 14)) + fk * 0.4;
        const rr = (2.6 - (((ph * 9) % 14) / 14) * 1.4) * sc;
        const g2 = c.createRadialGradient(fx, fy, 0, fx, fy, rr * 2);
        g2.addColorStop(0, 'rgba(255,240,190,' + Math.min(0.9, al).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(' + rgb + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(fx, fy, rr * 2, 0, 7); c.fill();
      }
    } else if (el === '电') {
      /* 旋转电弧环：三段锯齿折线绕底座转 */
      const rot = T * 2.2;
      for (let i = 0; i < 3; i++) {
        const a0 = rot + (i / 3) * Math.PI * 2;
        c.strokeStyle = 'rgba(' + rgb + ',' + (0.5 + fk * 0.45).toFixed(3) + ')';
        c.lineWidth = 1.6;
        c.beginPath();
        for (let k = 0; k < 4; k++) {
          const aa = a0 + k * 0.28;
          const rr2 = (13 + (k % 2 ? 3.5 : 0)) * sc;
          const xx = bx + Math.cos(aa) * rr2, yy = by - 6 * sc + Math.sin(aa) * rr2 * 0.42;
          if (k === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy);
        }
        c.stroke();
      }
    } else {
      /* 狙击（物）：蓄能红环，随冷却进度收缩 —— 快开火时环最小最亮 */
      const cdMax = 1 / (t.def.rate * (1 + t.lv * 0.12));
      const pr = 1 - Math.max(0, Math.min(1, (t.cd || 0) / cdMax));
      const rr2 = (16 - pr * 7) * sc;
      c.strokeStyle = 'rgba(255,90,90,' + (0.28 + pr * 0.6).toFixed(3) + ')';
      c.lineWidth = 1.8 + pr * 1.2;
      c.beginPath(); c.ellipse(bx, by - 4 * sc, rr2, rr2 * 0.4, 0, 0, 7); c.stroke();
      if (pr > 0.82) {
        c.fillStyle = 'rgba(255,120,120,' + ((pr - 0.82) / 0.18 * 0.7).toFixed(3) + ')';
        c.beginPath(); c.arc(bx + Math.cos(aim) * 18 * sc, by - 6 * sc + Math.sin(aim) * 7 * sc, 2.4 * sc, 0, 7); c.fill();
      }
    }
    c.restore();
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
        /* Q 版佣兵贴图优先：已抠底透明 PNG，与同场僵尸/主角/炮台同一画风。
         * 贴图没到位 / 该佣兵没有贴图 → 自动退回立绘或几何兜底，不会开天窗。 */
        let mChi = false;
        const _mk = (!m.isSummon && typeof CHIBI !== 'undefined' && CHIBI)
          ? (CHIBI.keyOfMerc(m.def && m.def.id) || null) : null;
        if (_mk && (CHIBI.ready(_mk) || CHIBI.ensure(_mk))) {
          mChi = CHIBI.draw(c, _mk, m.x, y + 4 * sc, 50 * sc, {
            bob: Math.sin((r.time || 0) * 4 + (m.x || 0) * 0.05) * 1.1 * sc
          });
        }
        if (mChi) { /* Q 版已绘制：跳过立绘与几何两套画法 */ }
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

  /* 元素三段色（核心 / 主体 / 余晖）—— 与子弹、炮台开火共用同一套配色，
   * 保证「同一个元素在任何地方都是同一个颜色」，玩家能一眼分辨。
   * 元素表 EX.elements 里只有 火/冰/电/风/物，毒与暗是技能专属，在此补齐。 */
  elRGB(el) {
    if (el === '火') return ['255,248,214', '255,150,52', '220,60,16'];
    if (el === '冰') return ['235,252,255', '120,220,255', '52,140,235'];
    if (el === '电') return ['242,232,255', '186,132,255', '116,54,235'];
    if (el === '毒') return ['232,255,208', '146,236,96', '66,176,38'];
    if (el === '风') return ['232,255,240', '123,232,160', '40,170,110'];
    if (el === '暗') return ['236,214,255', '150,86,220', '58,20,96'];
    return ['255,248,222', '255,208,96', '236,132,32'];
  },

  /* 爆炸（boom）：按【元素】分成七种截然不同的爆开表现。
   * 此前不管火/冰/电/毒/物，boom 一律画同一个橙色火球 ——
   * 玩家释放冰冻手雷、电磁穿刺看到的也是一团火，元素感完全丢失。
   * 现在每种元素有自己的爆开形态、碎片与颜色。 */
  drawBoom(c, f, al) {
    if (!isFinite(f.x) || !isFinite(f.y)) return;
    const a = Math.max(0, Math.min(1, al));
    const k = 1 - a;
    const el = f.el || '火';
    const [c0, c1, c2] = this.elRGB(el);
    const rr = Math.max(1, (Number(f.r) || 60) * (1.2 - a * 0.5));
    const seed = f.seed || ((f.x || 0) * 0.037 + (f.y || 0) * 0.021);
    c.save();
    c.globalCompositeOperation = 'lighter';

    /* 贴地冲击环（所有元素共有，给出"炸在地面上"的透视锚点） */
    c.strokeStyle = 'rgba(' + c1 + ',' + (a * 0.55).toFixed(3) + ')';
    c.lineWidth = 3;
    c.beginPath(); c.ellipse(f.x, f.y, rr, rr * 0.38, 0, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(' + c0 + ',' + (a * 0.6).toFixed(3) + ')';
    c.lineWidth = 2.4;
    c.beginPath(); c.ellipse(f.x, f.y, rr * 1.35, rr * 0.5, 0, 0, 7); c.stroke();

    if (el === '冰') {
      /* 冰：蓝白晶核 + 六角冰棱向外刺出 + 8 片飞散冰屑 + 寒霜外环 */
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 0.9));
      g.addColorStop(0, 'rgba(' + c0 + ',' + (a * 0.9).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(' + c1 + ',' + (a * 0.6).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + c2 + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 0.9), 0, 7); c.fill();
      c.strokeStyle = 'rgba(235,252,255,' + (a * 0.95).toFixed(3) + ')';
      c.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const ang = seed + i * Math.PI / 3 + k * 0.6;
        const L = rr * (1.05 - k * 0.3);
        c.beginPath();
        c.moveTo(f.x + Math.cos(ang) * rr * 0.2, f.y + Math.sin(ang) * rr * 0.16);
        c.lineTo(f.x + Math.cos(ang) * L, f.y + Math.sin(ang) * L * 0.78);
        c.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const ang = seed * 1.7 + i * 0.79;
        const d = rr * (0.7 + k * 1.6);
        const px = f.x + Math.cos(ang) * d, py = f.y + Math.sin(ang) * d * 0.7;
        c.save(); c.translate(px, py); c.rotate(ang + k * 2);
        c.fillStyle = 'rgba(235,252,255,' + (a * 0.85).toFixed(3) + ')';
        c.beginPath(); c.moveTo(3.4, 0); c.lineTo(0, 1.9); c.lineTo(-3.4, 0); c.lineTo(0, -1.9);
        c.closePath(); c.fill(); c.restore();
      }
    } else if (el === '电') {
      /* 电：球形闪电核心（明暗闪烁）+ 5 条放射锯齿电弧 + 白色爆闪环 */
      const fl = 0.7 + Math.sin(k * 40) * 0.3;
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 0.85 * fl));
      g.addColorStop(0, 'rgba(255,255,255,' + (a * 0.95).toFixed(3) + ')');
      g.addColorStop(0.4, 'rgba(' + c1 + ',' + (a * 0.75).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + c2 + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 0.85 * fl), 0, 7); c.fill();
      for (let i = 0; i < 5; i++) {
        const ang = seed * 2.1 + i * (Math.PI * 2 / 5);
        c.strokeStyle = 'rgba(245,235,255,' + (a * 0.9).toFixed(3) + ')';
        c.lineWidth = 1.8;
        c.beginPath(); c.moveTo(f.x, f.y);
        for (let s = 1; s <= 4; s++) {
          const L = rr * (1.35 * s / 4) * (1 - k * 0.2);
          const j = Math.sin(seed * 7 + i * 3 + s * 2.3 + k * 12) * rr * 0.16;
          c.lineTo(f.x + Math.cos(ang) * L - Math.sin(ang) * j,
                   f.y + Math.sin(ang) * L * 0.78 + Math.cos(ang) * j * 0.78);
        }
        c.stroke();
      }
      c.strokeStyle = 'rgba(255,255,255,' + (a * 0.7 * fl).toFixed(3) + ')';
      c.lineWidth = 2.6;
      c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 1.1), 0, 7); c.stroke();
    } else if (el === '毒') {
      /* 毒：酸液蘑菇云（上涌下坠）+ 6 团翻滚毒雾 + 下坠液滴 */
      const g = c.createRadialGradient(f.x, f.y - rr * 0.25, 0, f.x, f.y - rr * 0.25, Math.max(1, rr * 1.1));
      g.addColorStop(0, 'rgba(' + c0 + ',' + (a * 0.8).toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(' + c1 + ',' + (a * 0.5).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + c2 + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(f.x, f.y - rr * 0.25, Math.max(1, rr * 1.1), 0, 7); c.fill();
      for (let i = 0; i < 6; i++) {
        const t2 = (k * 0.9 + i * 0.13) % 1;
        const ang = seed + i * 1.05;
        const d = rr * (0.35 + t2 * 1.15);
        const px = f.x + Math.cos(ang) * d;
        const py = f.y + Math.sin(ang) * d * 0.6 - t2 * rr * 0.75;
        const pr = Math.max(1, rr * (0.3 + t2 * 0.28));
        const g2 = c.createRadialGradient(px, py, 0, px, py, pr);
        g2.addColorStop(0, 'rgba(' + c0 + ',' + ((1 - t2) * 0.45 * a).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
      }
      for (let i = 0; i < 4; i++) {
        const ang = seed * 3 + i * 1.6;
        const d = rr * (0.5 + k * 1.2);
        const px = f.x + Math.cos(ang) * d, py = f.y + Math.sin(ang) * d * 0.6 + k * k * 10;
        c.fillStyle = 'rgba(' + c1 + ',' + (a * 0.75).toFixed(3) + ')';
        c.beginPath(); c.ellipse(px, py, 2.2, 3.1, 0, 0, 7); c.fill();
      }
    } else if (el === '风') {
      /* 风：三道弯月风刃向外旋切 + 青绿气旋环 + 气流点 */
      for (let i = 0; i < 3; i++) {
        const ang = seed * 1.3 + i * Math.PI * 2 / 3 + k * 2.2;
        const d = rr * (0.75 + k * 0.95);
        c.save(); c.translate(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d * 0.7);
        c.rotate(ang);
        c.strokeStyle = 'rgba(' + c0 + ',' + (a * 0.85).toFixed(3) + ')';
        c.lineWidth = 2.6;
        c.beginPath(); c.arc(0, 0, Math.max(1, rr * 0.42), -0.9, 0.9); c.stroke();
        c.restore();
      }
      c.strokeStyle = 'rgba(' + c1 + ',' + (a * 0.55).toFixed(3) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, rr * 1.15), Math.max(1, rr * 0.62), 0, 0, 7); c.stroke();
    } else if (el === '暗') {
      /* 暗：内缩的湮灭球（越到后期越往中心塌）+ 紫色残影环 + 外溢暗雾 */
      const inr = Math.max(1, rr * (0.95 - k * 0.55));
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, inr);
      g.addColorStop(0, 'rgba(20,4,36,' + (a * 0.92).toFixed(3) + ')');
      g.addColorStop(0.62, 'rgba(' + c1 + ',' + (a * 0.7).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + c2 + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(f.x, f.y, inr, 0, 7); c.fill();
      for (let i = 0; i < 3; i++) {
        const rk = 1.25 + i * 0.34 + k * 0.5;
        c.strokeStyle = 'rgba(' + c0 + ',' + (a * (0.5 - i * 0.13)).toFixed(3) + ')';
        c.lineWidth = 2.2 - i * 0.6;
        c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * rk), 0, 7); c.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const ang = seed * 2.7 + i * 1.26;
        const d = rr * (0.6 + k * 1.3);
        const px = f.x + Math.cos(ang) * d, py = f.y + Math.sin(ang) * d * 0.68 - k * 6;
        const pr = Math.max(1, rr * 0.3);
        const g2 = c.createRadialGradient(px, py, 0, px, py, pr);
        g2.addColorStop(0, 'rgba(' + c1 + ',' + (a * 0.4).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
      }
    } else if (el === '物') {
      /* 物：碎石爆散（无火） —— 土黄冲击云 + 8 块翻滚石块 + 尘土环 */
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 0.85));
      g.addColorStop(0, 'rgba(255,246,214,' + (a * 0.7).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(206,168,110,' + (a * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,92,56,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 0.85), 0, 7); c.fill();
      for (let i = 0; i < 8; i++) {
        const ang = seed * 1.9 + i * 0.785;
        const d = rr * (0.55 + k * 1.5);
        const px = f.x + Math.cos(ang) * d, py = f.y + Math.sin(ang) * d * 0.68 + k * k * 12;
        c.save(); c.translate(px, py); c.rotate(ang + k * 5);
        c.fillStyle = 'rgba(188,158,116,' + (a * 0.85).toFixed(3) + ')';
        c.beginPath(); c.moveTo(3.6, 0); c.lineTo(0.6, 2.6); c.lineTo(-3.6, 0.6); c.lineTo(-1.2, -2.4);
        c.closePath(); c.fill(); c.restore();
      }
    } else {
      /* 火（默认）：熔核火球 + 双层焰环 + 6 颗带下坠的火星 + 上升烟柱 */
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr * 0.9));
      g.addColorStop(0, 'rgba(' + c0 + ',' + (a * 0.9).toFixed(3) + ')');
      g.addColorStop(0.42, 'rgba(' + c1 + ',' + (a * 0.6).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + c2 + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(f.x, f.y, Math.max(1, rr * 0.9), 0, 7); c.fill();
      for (let i = 0; i < 2; i++) {
        const rk = 1.1 + i * 0.5;
        c.strokeStyle = 'rgba(' + (i ? c1 : c0) + ',' + (a * (i ? 0.5 : 0.8)).toFixed(3) + ')';
        c.lineWidth = 2.6 - i * 0.9;
        c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, rr * rk), Math.max(1, rr * rk * 0.6), 0, 0, 7); c.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const ang = seed * 1.4 + i * 1.05;
        const d = rr * (0.6 + k * 1.7);
        const px = f.x + Math.cos(ang) * d, py = f.y + Math.sin(ang) * d * 0.68 + k * k * 8;
        const pr = Math.max(0.5, 2.3 * (a - k * 0.3));
        const g3 = c.createRadialGradient(px, py, 0, px, py, Math.max(0.5, pr * 2.2));
        g3.addColorStop(0, 'rgba(255,250,220,' + (a * 0.95).toFixed(3) + ')');
        g3.addColorStop(1, 'rgba(255,140,40,0)');
        c.fillStyle = g3;
        c.beginPath(); c.arc(px, py, Math.max(0.5, pr * 2.2), 0, 7); c.fill();
      }
    }
    c.restore();
  },

  /* 冲击波（nova）：按【元素】分化。
   * 此前 nova 固定一条青色圆环 —— BOSS 的暗影冲击、毒雾领域
   * 和冰冻新星画出来完全一样，玩家无法预判接下来要吃什么伤害。 */
  drawNova(c, f, al) {
    if (!isFinite(f.x) || !isFinite(f.y)) return;
    const a = Math.max(0, Math.min(1, al));
    const k = 1 - a;
    const el = f.el || '物';
    const [c0, c1, c2] = this.elRGB(el);
    const R = Math.max(1, (Number(f.r) || 46) * (1.25 - a * 0.4));
    const seed = f.seed || ((f.x || 0) * 0.031 + (f.y || 0) * 0.017);
    c.save();
    c.globalCompositeOperation = 'lighter';

    /* 主冲击环（所有元素共有，标出伤害范围边界） */
    c.strokeStyle = 'rgba(' + c1 + ',' + a.toFixed(3) + ')';
    c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(f.x, f.y, R, R * 0.72, 0, 0, 7); c.stroke();
    /* 外圈余波（更淡更大，强化扩散感） */
    c.strokeStyle = 'rgba(' + c0 + ',' + (a * 0.42).toFixed(3) + ')';
    c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(f.x, f.y, R * 1.22, R * 0.88, 0, 0, 7); c.stroke();

    if (el === '火') {
      /* 火：环上挂 12 团翻滚火舌 */
      for (let i = 0; i < 12; i++) {
        const ang = seed + i * Math.PI / 6 + k * 0.8;
        const px = f.x + Math.cos(ang) * R, py = f.y + Math.sin(ang) * R * 0.72;
        const pr = Math.max(1, R * 0.11 * (0.6 + Math.sin(i * 2.1 + k * 6) * 0.4));
        const g = c.createRadialGradient(px, py, 0, px, py, pr * 2);
        g.addColorStop(0, 'rgba(' + c0 + ',' + (a * 0.8).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(px, py, pr * 2, 0, 7); c.fill();
      }
    } else if (el === '冰') {
      /* 冰：霜环 + 环上 10 片自转冰晶 */
      for (let i = 0; i < 10; i++) {
        const ang = seed * 1.6 + i * Math.PI / 5 - k * 1.1;
        const px = f.x + Math.cos(ang) * R, py = f.y + Math.sin(ang) * R * 0.72;
        c.save(); c.translate(px, py); c.rotate(ang + k * 3);
        c.strokeStyle = 'rgba(235,252,255,' + (a * 0.85).toFixed(3) + ')';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(-R * 0.09, 0); c.lineTo(R * 0.09, 0);
        c.moveTo(0, -R * 0.07); c.lineTo(0, R * 0.07);
        c.stroke(); c.restore();
      }
    } else if (el === '电') {
      /* 电：环上 4 处放电节点，每处射出锯齿电弧 */
      for (let i = 0; i < 4; i++) {
        const ang = seed * 2.3 + i * Math.PI / 2;
        c.strokeStyle = 'rgba(245,235,255,' + (a * 0.85).toFixed(3) + ')';
        c.lineWidth = 1.7;
        c.beginPath();
        c.moveTo(f.x + Math.cos(ang) * R * 0.55, f.y + Math.sin(ang) * R * 0.4);
        for (let s = 1; s <= 3; s++) {
          const j = Math.sin(seed * 9 + i * 4 + s * 2.1 + k * 15) * R * 0.1;
          c.lineTo(f.x + Math.cos(ang) * R * (0.55 + 0.15 * s) - Math.sin(ang) * j,
                   f.y + Math.sin(ang) * R * (0.4 + 0.11 * s) + Math.cos(ang) * j);
        }
        c.stroke();
      }
    } else if (el === '毒') {
      /* 毒：环内填一层翻滚毒沼（半透明绿雾，看得出是持续伤害区） */
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, R));
      g.addColorStop(0, 'rgba(' + c0 + ',' + (a * 0.22).toFixed(3) + ')');
      g.addColorStop(0.7, 'rgba(' + c1 + ',' + (a * 0.18).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + c2 + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, R), Math.max(1, R * 0.72), 0, 0, 7); c.fill();
      for (let i = 0; i < 7; i++) {
        const ang = seed + i * 0.9;
        const d = R * (0.4 + ((k * 0.8 + i * 0.14) % 1) * 0.55);
        const px = f.x + Math.cos(ang) * d, py = f.y + Math.sin(ang) * d * 0.7;
        const pr = Math.max(1, R * 0.13);
        const g2 = c.createRadialGradient(px, py, 0, px, py, pr);
        g2.addColorStop(0, 'rgba(' + c0 + ',' + (a * 0.3).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
      }
    } else if (el === '暗') {
      /* 暗：双向环（外扩 + 内缩），中间夹紫色残影，做出"湮灭"观感 */
      c.strokeStyle = 'rgba(' + c1 + ',' + (a * 0.75).toFixed(3) + ')';
      c.lineWidth = 2.2;
      c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, R * (0.55 + k * 0.35)), Math.max(1, R * (0.4 + k * 0.26)), 0, 0, 7); c.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = seed * 2.9 + i * 1.05;
        const d = R * (0.85 + Math.sin(k * 7 + i) * 0.1);
        const px = f.x + Math.cos(ang) * d, py = f.y + Math.sin(ang) * d * 0.72;
        const pr = Math.max(1, R * 0.16);
        const g = c.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0, 'rgba(' + c1 + ',' + (a * 0.5).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
      }
    } else if (el === '风') {
      /* 风：三道同向弯月气刃绕环旋转 */
      for (let i = 0; i < 3; i++) {
        const ang = seed * 1.1 + i * Math.PI * 2 / 3 + k * 2.6;
        const px = f.x + Math.cos(ang) * R, py = f.y + Math.sin(ang) * R * 0.72;
        c.save(); c.translate(px, py); c.rotate(ang);
        c.strokeStyle = 'rgba(' + c0 + ',' + (a * 0.8).toFixed(3) + ')';
        c.lineWidth = 2.4;
        c.beginPath(); c.arc(0, 0, Math.max(1, R * 0.3), -1.0, 1.0); c.stroke();
        c.restore();
      }
    } else {
      /* 物（默认）：白色冲击环 + 4 道放射裂纹 */
      for (let i = 0; i < 4; i++) {
        const ang = seed + i * Math.PI / 2 + k * 0.5;
        c.strokeStyle = 'rgba(' + c0 + ',' + (a * 0.6).toFixed(3) + ')';
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(f.x + Math.cos(ang) * R * 0.5, f.y + Math.sin(ang) * R * 0.36);
        c.lineTo(f.x + Math.cos(ang) * R * 1.05, f.y + Math.sin(ang) * R * 0.76);
        c.stroke();
      }
    }
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
    if (r.muzzleT > 0) this.drawMuzzle(c, g, 21, Math.min(1, r.muzzleT / 0.07));
    c.restore();
  },

  /* 枪口焰：按【武器类型】分成七种截然不同的开火表现。
   * 此前所有武器共用同一个橙色圆光 —— 散弹枪、狙击枪、激光枪、
   * 火焰喷射器开火长得一模一样，玩家换枪毫无"换了一把枪"的感觉。
   * 坐标系：已 translate 到握把、rotate 到瞄准方向，枪口在 (0,-bl)。 */
  drawMuzzle(c, g, bl, a) {
    const ty = g.type || '自动';
    c.save();
    c.globalCompositeOperation = 'lighter';
    if (ty === '能量') {
      /* 激光枪 / 等离子枪：无火焰，纯能量闪光 + 十字星芒 + 环 */
      const g1 = c.createRadialGradient(0, -bl, 0, 0, -bl, 15);
      g1.addColorStop(0, 'rgba(255,255,255,' + (0.95 * a).toFixed(3) + ')');
      g1.addColorStop(0.35, 'rgba(120,232,255,' + (0.7 * a).toFixed(3) + ')');
      g1.addColorStop(1, 'rgba(60,120,255,0)');
      c.fillStyle = g1;
      c.beginPath(); c.arc(0, -bl, 15, 0, 7); c.fill();
      c.strokeStyle = 'rgba(220,250,255,' + (0.9 * a).toFixed(3) + ')';
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(0, -bl - 13); c.lineTo(0, -bl + 13);
      c.moveTo(-11, -bl); c.lineTo(11, -bl);
      c.stroke();
      c.strokeStyle = 'rgba(150,220,255,' + (0.6 * a).toFixed(3) + ')';
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, -bl, 8 + (1 - a) * 8, 0, 7); c.stroke();
    } else if (ty === '喷射') {
      /* 火焰喷射器 / 冰冻枪：持续喷流（更宽更长）+ 翻滚团块 */
      const ice = (g.chill || g.slow) ? 1 : 0;
      const c0 = ice ? '235,252,255' : '255,248,214';
      const c1 = ice ? '120,220,255' : '255,150,52';
      const c2 = ice ? '52,140,235' : '220,60,16';
      const g2 = c.createRadialGradient(0, -bl - 14, 0, 0, -bl - 14, 22);
      g2.addColorStop(0, 'rgba(' + c0 + ',' + (0.85 * a).toFixed(3) + ')');
      g2.addColorStop(0.4, 'rgba(' + c1 + ',' + (0.55 * a).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(' + c2 + ',0)');
      c.fillStyle = g2;
      c.beginPath(); c.ellipse(0, -bl - 14, 13, 22, 0, 0, 7); c.fill();
      for (let i = 0; i < 5; i++) {
        const py = -bl - 6 - i * 7;
        const pr = 4.5 + Math.sin(i * 2.3 + a * 8) * 2.2;
        const g3 = c.createRadialGradient(0, py, 0, 0, py, pr * 2);
        g3.addColorStop(0, 'rgba(' + c0 + ',' + (0.6 * a).toFixed(3) + ')');
        g3.addColorStop(1, 'rgba(' + c1 + ',0)');
        c.fillStyle = g3;
        c.beginPath(); c.arc(0, py, pr * 2, 0, 7); c.fill();
      }
    } else if (ty === '狙击') {
      /* 狙击枪 / 电磁炮：细长焰锥（高初速感）+ 白色爆闪十字 */
      const g4 = c.createRadialGradient(0, -bl, 0, 0, -bl, 10);
      g4.addColorStop(0, 'rgba(255,255,255,' + (0.95 * a).toFixed(3) + ')');
      g4.addColorStop(0.4, 'rgba(255,214,140,' + (0.6 * a).toFixed(3) + ')');
      g4.addColorStop(1, 'rgba(255,120,20,0)');
      c.fillStyle = g4;
      c.beginPath(); c.arc(0, -bl, 10, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,246,214,' + (0.9 * a).toFixed(3) + ')';
      c.beginPath();
      c.moveTo(-2.2, -bl + 2); c.lineTo(0, -bl - 22); c.lineTo(2.2, -bl + 2);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,' + (0.8 * a).toFixed(3) + ')';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-9, -bl); c.lineTo(9, -bl);
      c.moveTo(0, -bl - 9); c.lineTo(0, -bl + 9);
      c.stroke();
    } else if (ty === '散弹') {
      /* 散弹枪：宽扇形喷焰（一次性大片火光，体现"喷"） */
      const g5 = c.createRadialGradient(0, -bl, 0, 0, -bl, 18);
      g5.addColorStop(0, 'rgba(255,252,230,' + (0.95 * a).toFixed(3) + ')');
      g5.addColorStop(0.45, 'rgba(255,168,54,' + (0.7 * a).toFixed(3) + ')');
      g5.addColorStop(1, 'rgba(220,70,16,0)');
      c.fillStyle = g5;
      c.beginPath(); c.arc(0, -bl, 18, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,236,180,' + (0.85 * a).toFixed(3) + ')';
      for (let i = -2; i <= 2; i++) {
        const ang = i * 0.32;
        c.save(); c.translate(0, -bl); c.rotate(ang);
        c.beginPath();
        c.moveTo(-2.6, 2); c.lineTo(0, -14); c.lineTo(2.6, 2);
        c.closePath(); c.fill();
        c.restore();
      }
    } else if (ty === '爆炸') {
      /* 榴弹枪 / 火箭筒：厚重爆焰 + 烟环（低沉的"轰"） */
      const g6 = c.createRadialGradient(0, -bl, 0, 0, -bl, 16);
      g6.addColorStop(0, 'rgba(255,240,190,' + (0.9 * a).toFixed(3) + ')');
      g6.addColorStop(0.42, 'rgba(255,140,40,' + (0.65 * a).toFixed(3) + ')');
      g6.addColorStop(1, 'rgba(160,40,10,0)');
      c.fillStyle = g6;
      c.beginPath(); c.arc(0, -bl, 16, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,196,110,' + (0.7 * a).toFixed(3) + ')';
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, -bl, 11 + (1 - a) * 12, 0, 7); c.stroke();
      c.strokeStyle = 'rgba(120,110,100,' + (0.35 * a).toFixed(3) + ')';
      c.lineWidth = 2.4;
      c.beginPath(); c.arc(0, -bl, 17 + (1 - a) * 16, 0, 7); c.stroke();
    } else if (ty === '近战') {
      /* 链锯枪：无焰，改为橙白火花四溅（锯齿切割的金属感） */
      c.fillStyle = 'rgba(255,250,220,' + (0.9 * a).toFixed(3) + ')';
      for (let i = 0; i < 7; i++) {
        const ang = -Math.PI / 2 + (i - 3) * 0.36 + Math.sin(i * 3.1 + a * 12) * 0.2;
        const d = 8 + ((i * 7 + a * 30) % 14);
        const px = Math.cos(ang) * d, py = -bl + Math.sin(ang) * d;
        const pr = 1.5 + Math.sin(i * 2.7) * 0.6;
        c.beginPath(); c.arc(px, py, Math.max(0.4, pr), 0, 7); c.fill();
      }
    } else {
      /* 自动 / 重机枪：短促锥形焰（节奏快、不抢戏） */
      const g7 = c.createRadialGradient(0, -bl, 0, 0, -bl, 12);
      g7.addColorStop(0, 'rgba(255,248,214,' + (0.95 * a).toFixed(3) + ')');
      g7.addColorStop(0.45, 'rgba(255,176,60,' + (0.62 * a).toFixed(3) + ')');
      g7.addColorStop(1, 'rgba(255,120,20,0)');
      c.fillStyle = g7;
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

  /* =========================================================
   * 真 3D 骨骼人形（可动模型）
   * 旧实现的两处硬伤：
   *  ① 角色是"一张抠底立绘 + 阴影" —— 本质是平面纸片，贴在 3D 场景里必然扁平
   *  ② animT 全项目只有读取、从未赋值 → 恒为 undefined → sin(0)=0，动画完全静止
   * 现在改为多部件程序化骨骼模型：
   *   - 每条腿分大腿/小腿两段（膝盖弯曲），走路循环交替摆动 + 抬脚
   *   - 躯干随步伐上下起伏 + 左右轻倾
   *   - 手臂与腿反相摆动，前伸抓挠
   *   - 头部随步伐晃动，眼睛/嘴独立绘制
   *   - 每个部件都是圆柱或球体，带横向受光渐变（左暗-中亮-右暗）
   * → 真正"会动"的立体角色，不再是纸片
   * ========================================================= */

  /* 肢体：两点之间的锥形柱体，沿垂直方向做受光渐变（立体感来源） */
  limb(c, x1, y1, x2, y2, w, base, hi) {
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2) || !isFinite(w) || w <= 0) return;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * w * 0.5, ny = dx / len * w * 0.5;
    const g = c.createLinearGradient(x1 - nx, y1 - ny, x1 + nx, y1 + ny);
    g.addColorStop(0, 'rgba(0,0,0,.42)');
    g.addColorStop(0.40, base);
    g.addColorStop(0.60, hi);
    g.addColorStop(1, 'rgba(0,0,0,.46)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x1 + nx, y1 + ny);
    c.lineTo(x2 + nx * 0.86, y2 + ny * 0.86);
    c.lineTo(x2 - nx * 0.86, y2 - ny * 0.86);
    c.lineTo(x1 - nx, y1 - ny);
    c.closePath(); c.fill();
  },

  /* 躯干：上宽下窄的锥柱 + 顶肩 + 纵向明暗 */
  torso3d(c, x, y, w, h, base, hi, bend) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
    const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,.44)');
    g.addColorStop(0.30, base);
    g.addColorStop(0.55, hi);
    g.addColorStop(0.78, base);
    g.addColorStop(1, 'rgba(0,0,0,.50)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - w * 0.30, y);
    c.lineTo(x + w * 0.30, y);
    c.lineTo(x + w * 0.52, y + h * 0.30);
    c.lineTo(x + w * 0.44, y + h);
    c.lineTo(x - w * 0.44, y + h);
    c.lineTo(x - w * 0.52, y + h * 0.30);
    c.closePath(); c.fill();
    /* 肩部横板（顶面受光） */
    c.fillStyle = 'rgba(255,255,255,.14)';
    c.beginPath(); c.ellipse(x, y + h * 0.06, w * 0.52, h * 0.10, 0, 0, 7); c.fill();
    if (bend) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - w * 0.4, y + h * 0.55, w * 0.8, h * 0.2); }
  },

  /* 主绘制：o = {x,y,sz,ph,stride,skin,skinHi,cloth,clothHi,face,
   *              armReach, frozen, shield, big, eye, aim, gun, kick} */
  figure3d(c, o) {
    const x = o.x, y = o.y, sz = o.sz;
    if (!isFinite(x) || !isFinite(y) || !isFinite(sz) || sz <= 0) return;
    const ph = o.ph || 0;
    const stride = o.stride == null ? 1 : Math.max(0, Math.min(1.6, o.stride));
    const skin = o.skin || '#73996d', skinHi = o.skinHi || '#a8d69f';
    const cloth = o.cloth || '#3d5140', clothHi = o.clothHi || '#6b866e';
    const frozen = !!o.frozen;

    /* —— 走路循环（步频 6.2rad/s）—— */
    const cyc = ph * 6.2;
    const sA = Math.sin(cyc) * stride;            /* A 侧肢体相位 */
    const sB = Math.sin(cyc + Math.PI) * stride;  /* B 侧反相 */
    const liftA = Math.max(0, Math.sin(cyc)) * sz * 0.085 * stride;   /* 抬脚 */
    const liftB = Math.max(0, Math.sin(cyc + Math.PI)) * sz * 0.085 * stride;
    const bob = Math.abs(Math.sin(cyc)) * sz * 0.055 * stride;        /* 身体起伏 */
    const sway = Math.sin(cyc * 0.5) * sz * 0.035 * stride;           /* 左右晃 */

    c.save();
    /* —— 地面投影：随起伏缩放（抬脚时影子变小）—— */
    const shS = 1 - Math.abs(Math.sin(cyc)) * 0.14 * stride;
    this.shadow3d(c, x, y + sz * 0.10, sz * 0.46 * shS, sz / 24);

    const hipY = y - sz * 0.30 - bob;      /* 髋 */
    const shY = y - sz * 0.66 - bob;       /* 肩 */
    const legW = sz * 0.155, armW = sz * 0.135;
    const spread = sz * 0.145;

    /* —— 后侧腿（先画，压暗＝在身后）—— */
    c.save(); c.globalAlpha = 0.72;
    const kneeBx = x + spread + sB * sz * 0.09, kneeBy = hipY + sz * 0.20 - liftB;
    this.limb(c, x + spread * 0.5, hipY, kneeBx, kneeBy, legW * 0.92, cloth, clothHi);
    this.limb(c, kneeBx, kneeBy, x + spread + sB * sz * 0.05, y - liftB, legW * 0.80, cloth, clothHi);
    c.restore();
    /* —— 后侧手臂 —— */
    c.save(); c.globalAlpha = 0.72;
    const elbBx = x + spread * 1.9 + sB * sz * 0.07, elbBy = shY + sz * 0.20;
    this.limb(c, x + spread * 1.1, shY + sz * 0.04, elbBx, elbBy, armW * 0.88, skin, skinHi);
    this.limb(c, elbBx, elbBy, x + spread * 1.7 - sB * sz * 0.06, shY + sz * 0.44, armW * 0.78, skin, skinHi);
    c.restore();

    /* —— 躯干 —— */
    this.torso3d(c, x + sway, shY, sz * 0.62, sz * 0.40, cloth, clothHi, true);
    /* 胸腹暗部（破布层次） */
    c.fillStyle = 'rgba(0,0,0,.20)';
    c.beginPath(); c.ellipse(x + sway, shY + sz * 0.26, sz * 0.20, sz * 0.09, 0, 0, 7); c.fill();

    /* —— 前侧腿 —— */
    const kneeAx = x - spread + sA * sz * 0.09, kneeAy = hipY + sz * 0.20 - liftA;
    this.limb(c, x - spread * 0.5, hipY, kneeAx, kneeAy, legW, cloth, clothHi);
    this.limb(c, kneeAx, kneeAy, x - spread + sA * sz * 0.05, y - liftA, legW * 0.88, cloth, clothHi);
    /* 脚（两只有厚度的暗块，随抬脚离地） */
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.beginPath(); c.ellipse(x - spread + sA * sz * 0.05, y - liftA + sz * 0.02, sz * 0.11, sz * 0.05, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(x + spread + sB * sz * 0.05, y - liftB + sz * 0.02, sz * 0.11, sz * 0.05, 0, 0, 7); c.fill();

    /* —— 前侧手臂（僵尸前伸抓挠；主角持枪时改为指向 aim）—— */
    if (o.gun && isFinite(o.aim)) {
      const gx = Math.cos(o.aim) * sz * 0.42, gy = Math.sin(o.aim) * sz * 0.42;
      const k = o.kick || 0;
      this.limb(c, x - spread * 1.0, shY + sz * 0.06, x + gx * 0.55, shY + sz * 0.10 + gy * 0.55, armW, skin, skinHi);
      this.limb(c, x + gx * 0.55, shY + sz * 0.10 + gy * 0.55,
        x + gx - Math.cos(o.aim) * k, shY + sz * 0.12 + gy - Math.sin(o.aim) * k, armW * 0.86, skin, skinHi);
    } else {
      const reach = o.armReach == null ? 1 : o.armReach;
      const elbAx = x - spread * 1.9 + sA * sz * 0.07, elbAy = shY + sz * 0.24;
      const handAy = shY + sz * (0.52 + 0.10 * reach) + sA * sz * 0.10;
      this.limb(c, x - spread * 1.1, shY + sz * 0.05, elbAx, elbAy, armW, skin, skinHi);
      this.limb(c, elbAx, elbAy, x - spread * 1.5 - sA * sz * 0.05, handAy, armW * 0.86, skin, skinHi);
      /* 手（球） */
      this.sphere(c, x - spread * 1.5 - sA * sz * 0.05, handAy, sz * 0.085, skin, skinHi);
    }
    /* 后手球 */
    this.sphere(c, x + spread * 1.7 - sB * sz * 0.06, shY + sz * 0.46, sz * 0.075, skin, skinHi);

    /* —— 头（球体 + 晃动）—— */
    const hx = x + sway + Math.sin(cyc * 0.9) * sz * 0.022 * stride;
    const hy = shY - sz * 0.24 - bob * 0.4;
    this.sphere(c, hx, hy, sz * 0.255, skin, skinHi);
    /* 头顶高光 */
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.beginPath(); c.ellipse(hx - sz * 0.075, hy - sz * 0.115, sz * 0.095, sz * 0.055, -0.5, 0, 7); c.fill();
    /* 眼窝（凹陷） */
    c.fillStyle = 'rgba(0,0,0,.40)';
    c.beginPath(); c.ellipse(hx, hy + sz * 0.025, sz * 0.165, sz * 0.075, 0, 0, 7); c.fill();
    /* 发光眼睛 */
    const eye = frozen ? '#7fe9ff' : (o.eye || (o.big ? '#ff5a5a' : '#ffe066'));
    c.fillStyle = eye; c.shadowColor = eye; c.shadowBlur = 6 * (sz / 24);
    c.beginPath(); c.arc(hx - sz * 0.095, hy + sz * 0.012, sz * 0.045, 0, 7); c.fill();
    c.beginPath(); c.arc(hx + sz * 0.095, hy + sz * 0.012, sz * 0.045, 0, 7); c.fill();
    c.shadowBlur = 0;
    /* 张口 + 牙 */
    c.fillStyle = '#241a1a';
    c.beginPath(); c.ellipse(hx, hy + sz * 0.125, sz * 0.068, sz * 0.045, 0, 0, 7); c.fill();
    c.fillStyle = '#e8e2d0';
    c.fillRect(hx - sz * 0.038, hy + sz * 0.098, sz * 0.020, sz * 0.030);
    c.fillRect(hx + sz * 0.018, hy + sz * 0.098, sz * 0.020, sz * 0.030);

    /* BOSS/精英：头顶红色等级环 */
    if (o.big) {
      c.fillStyle = '#ff4d6d';
      c.beginPath(); c.arc(hx, hy - sz * 0.36, sz * 0.10, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.font = 'bold ' + Math.round(sz * 0.13) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', hx, hy - sz * 0.35);
    }
    /* 护盾僵尸：正面盾牌（有厚度） */
    if (o.shield) {
      const sw = sz * 0.50, sh = sz * 0.42;
      c.save();
      c.translate(x, y - sz * 0.30);
      c.fillStyle = 'rgba(0,0,0,.32)';
      c.beginPath(); c.ellipse(3, 4, sw * 0.5, sh * 0.5, 0, 0, 7); c.fill();
      const sg = c.createLinearGradient(-sw / 2, 0, sw / 2, 0);
      sg.addColorStop(0, '#6b7a8c'); sg.addColorStop(0.45, '#c8d4e2'); sg.addColorStop(1, '#4a5566');
      c.fillStyle = sg;
      c.beginPath();
      if (c.roundRect) c.roundRect(-sw / 2, -sh / 2, sw, sh, 4); else c.rect(-sw / 2, -sh / 2, sw, sh);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.stroke();
      c.restore();
    }
    /* 冰冻状态：整体罩冰蓝 */
    if (frozen) {
      c.fillStyle = 'rgba(120,220,255,.28)';
      c.beginPath(); c.arc(x, y - sz * 0.38, sz * 0.60, 0, 7); c.fill();
      c.strokeStyle = 'rgba(190,245,255,.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y - sz * 0.38, sz * 0.60, 0, 7); c.stroke();
    }
    c.restore();
  },

  /* ===================================================================
   * 高质感角色渲染 v2（人物 / 怪物 / 武器 / 弹道 / 命中特效）
   *
   * 旧版是"球体 + 圆柱"直接堆叠：没有描边、没有环境反射光、
   * 头身比约 1:2.3（Q 版木偶感）、主角手里根本没有枪 —— 这是画面
   * "廉价 / 纸片 / 难看"的主要来源。
   *
   * 新版统一光照模型：
   *   主光：左上 (-0.6,-0.8)  → 顶部受亮
   *   环境反射光：右下冷色     → 暗部不死黑，体积能"转"过去
   *   描边：每个体块深色外轮廓（卡通渲染质感的关键一步）
   *   接触阴影 + 边缘冷光 rim → 角色从背景里"立"起来
   * 头身比调整为约 1:3.6，并补上真实的武器模型（按武器 type 分型）。
   * =================================================================== */

  /* 横向材质渐变：左暗 → 中亮 → 右暗 → 右下冷色反射光 */
  matG(c, x0, x1, base, hi, amb) {
    try {
      const g = c.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(30,18,64,.26)');
      g.addColorStop(0.13, base);
      g.addColorStop(0.36, hi);
      g.addColorStop(0.62, base);
      g.addColorStop(0.87, 'rgba(24,12,54,.22)');
      g.addColorStop(1, amb || 'rgba(120,235,255,.62)');
      return g;
    } catch (e) { return base; }
  },

  /* 竖向材质渐变（用于盔甲板 / 胸甲等大面积） */
  matV(c, y0, y1, base, hi) {
    try {
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, hi);
      g.addColorStop(0.40, base);
      g.addColorStop(0.84, 'rgba(22,12,52,.22)');
      g.addColorStop(1, 'rgba(120,215,255,.34)');
      return g;
    } catch (e) { return base; }
  },

  /* 描边：卡通渲染的质感关键（让体块之间有明确分界） */
  ink(c, lw, col) {
    if (lw > 0) {
      c.strokeStyle = col || 'rgba(6,9,14,.82)';
      c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round';
      c.stroke();
    }
  },

  /* 立体四肢：带描边的锥形肢体（远侧肢体自动压暗） */
  limbInk(c, x1, y1, x2, y2, w, base, hi, lw, dim) {
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2) || !(w > 0)) return;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * w * 0.5, ny = dx / len * w * 0.5;
    c.save();
    if (dim) c.globalAlpha = dim;
    c.beginPath();
    c.moveTo(x1 + nx, y1 + ny);
    c.lineTo(x2 + nx * 0.82, y2 + ny * 0.82);
    c.lineTo(x2 - nx * 0.82, y2 - ny * 0.82);
    c.lineTo(x1 - nx, y1 - ny);
    c.closePath();
    c.fillStyle = this.matG(c, x1 - nx * 1.6, x1 + nx * 1.6, base, hi);
    c.fill();
    this.ink(c, lw);
    c.restore();
  },

  /* 立体球体（头 / 关节）：受光 + 描边 + 顶部高光 */
  ballInk(c, x, y, r, base, hi, lw) {
    if (!isFinite(x) || !isFinite(y) || !(r > 0)) return;
    try {
      const g = c.createRadialGradient(x - r * 0.36, y - r * 0.42, r * 0.08, x, y, r * 1.16);
      g.addColorStop(0, hi);
      g.addColorStop(0.46, base);
      g.addColorStop(0.84, 'rgba(26,14,56,.20)');
      g.addColorStop(1, 'rgba(110,230,255,.58)');
      c.fillStyle = g;
    } catch (e) { c.fillStyle = base; }
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    this.ink(c, lw);
  },

  /* ---------- 武器模型（主角 / 佣兵手持） ----------
   * 局部坐标：原点＝握把，+X＝枪口方向。按武器表 type 分型：
   * 自动 / 散弹 / 狙击 / 爆炸 / 激光，各自有可辨识的剪影。 */
  drawWeapon3d(c, hx, hy, ang, type, sz, kick, flash, t) {
    if (!isFinite(hx) || !isFinite(hy) || !isFinite(ang) || !(sz > 0)) return;
    const k = sz / 46;
    const metal = '#3a4350', metalHi = '#8f9daf', metalDk = '#1c222b';
    const wood = '#5a4632', woodHi = '#8a6b48';
    /* 各型参数：枪管长 / 管粗 / 是否瞄准镜 / 是否弹鼓 / 是否能量 */
    let barrel = 30, btube = 1.5, scope = false, drum = false, energy = false, pump = false, thick = 0;
    let mini = false, thrown = false;
    if (type === '狙击') { barrel = 42; btube = 1.5; scope = true; }
    else if (type === '散弹') { barrel = 26; btube = 2.7; pump = true; thick = 0.5; }
    else if (type === '爆炸') { barrel = 22; btube = 3.3; drum = true; thick = 1; }
    else if (type === '重机枪' || type === '机枪') { barrel = 32; btube = 3.6; mini = true; drum = true; thick = 0.6; }
    else if (type === '投掷') { thrown = true; }
    else if (type === '激光' || type === '能量') { barrel = 28; btube = 2.0; energy = true; }
    else if (type === '冲锋') { barrel = 24; btube = 1.5; }

    c.save();
    c.translate(hx, hy);
    c.rotate(ang);
    c.translate(-kick * k, 0);
    const lw = Math.max(0.7, 1.1 * k);

    /* —— 投掷物（手雷 / 燃烧瓶）：手持小型物件，无枪身 —— */
    if (thrown) {
      const r0 = 4.6 * k;
      /* 瓶体 / 弹体：球形 + 顶部受光 */
      this.ballInk(c, 2 * k, 0, r0, '#3f4a3a', '#7d8f6a', lw);
      /* 瓶颈 */
      c.beginPath();
      c.rect(2 * k + r0 * 0.5, -1.5 * k, 3.2 * k, 3.0 * k);
      c.fillStyle = this.matV(c, -1.5 * k, 1.5 * k, '#2c3328', '#5c6a4c'); c.fill();
      this.ink(c, lw * 0.7);
      /* 引信（发光火花，随时间跳动） */
      const sp = 0.6 + Math.abs(Math.sin((t || 0) * 9)) * 0.4;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const fg = c.createRadialGradient(2 * k + r0 * 0.5 + 3.4 * k, 0, 0, 2 * k + r0 * 0.5 + 3.4 * k, 0, 5.5 * k * sp);
      fg.addColorStop(0, 'rgba(255,250,214,.95)');
      fg.addColorStop(0.4, 'rgba(255,176,60,.70)');
      fg.addColorStop(1, 'rgba(255,110,20,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(2 * k + r0 * 0.5 + 3.4 * k, 0, 5.5 * k * sp, 0, 7); c.fill();
      c.restore();
      /* 握持的手 */
      this.ballInk(c, -1 * k, 1.5 * k, 3.0 * k, '#e0b58a', '#ffd8ac', lw * 0.6);
      c.restore();
      return;
    }

    /* —— 枪托 —— */
    c.beginPath();
    c.moveTo(-16 * k, -5.2 * k); c.lineTo(-7 * k, -4.2 * k);
    c.lineTo(-7 * k, 4.0 * k); c.lineTo(-15 * k, 5.6 * k);
    c.closePath();
    c.fillStyle = this.matV(c, -5.2 * k, 5.6 * k, wood, woodHi); c.fill();
    this.ink(c, lw);
    /* —— 机匣 —— */
    c.beginPath();
    if (c.roundRect) c.roundRect(-8 * k, -4.4 * k - thick * k, 17 * k, 8.6 * k + thick * k, 1.6 * k);
    else c.rect(-8 * k, -4.4 * k - thick * k, 17 * k, 8.6 * k + thick * k);
    c.fillStyle = this.matV(c, -4.4 * k, 4.2 * k, metal, metalHi); c.fill();
    this.ink(c, lw);
    /* 机匣顶：导轨（细高光棱） */
    c.fillStyle = 'rgba(210,226,245,.34)';
    c.fillRect(-7 * k, -4.0 * k - thick * k, 15 * k, 1.1 * k);
    /* —— 弹匣 / 弹鼓 —— */
    if (drum) {
      c.beginPath(); c.arc(1 * k, 7.4 * k, 4.4 * k, 0, 7);
      c.fillStyle = this.matV(c, 3 * k, 11.8 * k, '#2f3742', '#5d6b7c'); c.fill();
      this.ink(c, lw);
    } else {
      c.beginPath();
      c.moveTo(0.5 * k, 3.4 * k); c.lineTo(5.6 * k, 3.4 * k);
      c.lineTo(4.6 * k, 10.6 * k); c.lineTo(-0.4 * k, 10.6 * k);
      c.closePath();
      c.fillStyle = this.matV(c, 3.4 * k, 10.6 * k, '#2c333d', '#59677a'); c.fill();
      this.ink(c, lw);
    }
    /* —— 握把 —— */
    c.beginPath();
    c.moveTo(-6 * k, 3.2 * k); c.lineTo(-0.6 * k, 3.2 * k);
    c.lineTo(-2.4 * k, 9.4 * k); c.lineTo(-7.6 * k, 9.4 * k);
    c.closePath();
    c.fillStyle = this.matV(c, 3.2 * k, 9.4 * k, '#262c35', '#4e5a68'); c.fill();
    this.ink(c, lw);
    /* —— 护木 / 泵动 —— */
    c.beginPath();
    if (c.roundRect) c.roundRect(10 * k, -2.9 * k - thick * k, (pump ? 12 : 11) * k, 5.8 * k + thick * k * 2, 1.5 * k);
    else c.rect(10 * k, -2.9 * k - thick * k, (pump ? 12 : 11) * k, 5.8 * k + thick * k * 2);
    c.fillStyle = this.matV(c, -2.9 * k, 2.9 * k, pump ? '#4a3b2a' : metal, pump ? '#7a6244' : metalHi);
    c.fill();
    this.ink(c, lw);
    if (pump) { /* 泵动握把纹路 */
      c.strokeStyle = 'rgba(0,0,0,.34)'; c.lineWidth = 0.9 * k;
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo((12 + i * 2.4) * k, -2.4 * k); c.lineTo((12 + i * 2.4) * k, 2.4 * k); c.stroke();
      }
    }
    /* —— 枪管 —— */
    const bx0 = (pump ? 20 : 19) * k, blen = (barrel - (pump ? 20 : 19)) * k;
    if (mini) {
      /* 加特林：旋转的三根管束（随时间滚动，做出"转轮"感） */
      const roll = ((t || 0) * 9) % 1;
      for (let i = 0; i < 3; i++) {
        const off = ((i / 3 + roll) % 1 - 0.5) * btube * 1.7 * k;
        c.beginPath(); c.rect(bx0, off - btube * 0.62 * k, blen, btube * 1.24 * k);
        c.fillStyle = this.matV(c, off - btube * 0.62 * k, off + btube * 0.62 * k, metalDk, metalHi);
        c.fill(); this.ink(c, lw * 0.55);
        c.fillStyle = 'rgba(226,238,252,.34)';
        c.fillRect(bx0, off - btube * 0.62 * k, blen, Math.max(0.5, btube * 0.30 * k));
      }
      /* 枪口环（把管束箍在一起） */
      c.beginPath();
      c.ellipse(barrel * k, 0, btube * 0.55 * k, btube * 1.35 * k, 0, 0, 7);
      c.fillStyle = this.matV(c, -btube * 1.35 * k, btube * 1.35 * k, '#232a34', '#68758a'); c.fill();
      this.ink(c, lw * 0.6);
    } else {
      c.beginPath();
      c.rect(bx0, -btube * k, blen, btube * 2 * k);
      c.fillStyle = this.matV(c, -btube * k, btube * k, metalDk, metalHi); c.fill();
      this.ink(c, lw * 0.8);
      /* 枪管上沿高光（圆柱感） */
      c.fillStyle = 'rgba(226,238,252,.42)';
      c.fillRect(bx0, -btube * k, blen, Math.max(0.6, btube * 0.42 * k));
    }
    /* —— 准星 —— */
    c.fillStyle = '#22282f';
    c.fillRect((barrel - 7) * k, -btube * k - 3.0 * k, 1.3 * k, 3.0 * k);
    /* —— 瞄准镜（狙击） —— */
    if (scope) {
      c.beginPath();
      if (c.roundRect) c.roundRect(-2 * k, -9.2 * k, 13 * k, 4.6 * k, 2.2 * k);
      else c.rect(-2 * k, -9.2 * k, 13 * k, 4.6 * k);
      c.fillStyle = this.matV(c, -9.2 * k, -4.6 * k, '#242c36', '#69788b'); c.fill();
      this.ink(c, lw * 0.9);
      /* 镜片（冷光） */
      c.fillStyle = 'rgba(120,220,255,.85)';
      c.beginPath(); c.ellipse(10.6 * k, -6.9 * k, 1.5 * k, 2.0 * k, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)';
      c.beginPath(); c.ellipse(9.9 * k, -7.6 * k, 0.7 * k, 0.9 * k, 0, 0, 7); c.fill();
    }
    /* —— 能量武器：枪管充能辉光 —— */
    if (energy) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const eg = c.createLinearGradient(18 * k, 0, barrel * k, 0);
      eg.addColorStop(0, 'rgba(120,220,255,0)');
      eg.addColorStop(1, 'rgba(150,235,255,.55)');
      c.fillStyle = eg;
      c.fillRect(18 * k, -btube * 1.9 * k, (barrel - 18) * k, btube * 3.8 * k);
      c.restore();
    }
    /* —— 枪口火焰（开火瞬间） —— */
    if (flash > 0) {
      const a = Math.min(1, flash / 0.07);
      const fx = barrel * k, fy = 0;
      c.save();
      c.globalCompositeOperation = 'lighter';
      /* 三层：外辉光 → 中焰 → 白核 */
      const gg = c.createRadialGradient(fx, fy, 0, fx, fy, 13 * k * a + 3);
      gg.addColorStop(0, 'rgba(255,248,214,' + (a * 0.95).toFixed(3) + ')');
      gg.addColorStop(0.35, 'rgba(255,186,72,' + (a * 0.75).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(255,120,30,0)');
      c.fillStyle = gg;
      c.beginPath(); c.arc(fx, fy, 6.5 * k * a + 1.5, 0, 7); c.fill();
      /* 星芒（四向尖刺，随角度抖动） */
      c.fillStyle = 'rgba(255,236,180,' + (a * 0.9).toFixed(3) + ')';
      c.beginPath();
      const spikes = 4;
      for (let i = 0; i < spikes * 2; i++) {
        const an = (i / (spikes * 2)) * Math.PI * 2;
        const rr = (i % 2 === 0 ? 1 : 0.34) * (6 * k * a + 1.2);
        const px = fx + Math.cos(an) * rr, py = fy + Math.sin(an) * rr * 0.68;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill();
      c.restore();
    }
    c.restore();
  },

  /* ---------- 3D 僵尸（按种类改变体型 / 姿态 / 质感） ---------- */
  drawZombieShape(c, x, y, sz, z) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(sz) || sz <= 0) return;
    const d = (z && z.d) || {};
    const boss = !!z.isBoss, elite = !!d.elite;
    const armored = !!d.armor, toxic = !!d.poison, fiery = !!d.fire;
    const frozen = !!(z && z.slowT > 0);
    const moving = z && (z.slow || 0) < 0.9;

    /* 配色：普通腐绿 / BOSS 冷灰 / 精英紫 / 毒系亮绿 / 火系焦褐 / 装甲铁灰 */
    let skin = '#6fc44a', skinHi = '#d8ff96', cloth = '#2f6b33', clothHi = '#63c255';
    if (boss)         { skin = '#38c6f0'; skinHi = '#b4f6ff'; cloth = '#164a78'; clothHi = '#3d94e0'; }
    else if (elite)   { skin = '#b45cff'; skinHi = '#f0c0ff'; cloth = '#4a1f8c'; clothHi = '#8f4ae8'; }
    else if (toxic)   { skin = '#93e83a'; skinHi = '#e4ff8a'; cloth = '#2b7024'; clothHi = '#5ec63f'; }
    else if (fiery)   { skin = '#ff8a34'; skinHi = '#ffd48a'; cloth = '#7a2814'; clothHi = '#cf5c26'; }
    else if (armored) { skin = '#a8dc86'; skinHi = '#eeffc4'; cloth = '#40583c'; clothHi = '#86b478'; }

    /* 形态：驼背程度 / 体宽 —— 这是"种类可辨识"的关键 */
    const hunch  = boss ? 0.10 : (armored ? 0.01 : (elite ? 0.05 : 0.14));
    const wide   = boss ? 1.26 : (armored ? 1.22 : (toxic ? 1.14 : 1.0));
    const stride = boss ? 0.5 : (moving ? 1 : 0.22);
    const ph = z.animT || 0, cyc = ph * 6.2;
    const sA = Math.sin(cyc) * stride, sB = Math.sin(cyc + Math.PI) * stride;
    const liftA = Math.max(0, Math.sin(cyc)) * sz * 0.085 * stride;
    const liftB = Math.max(0, Math.sin(cyc + Math.PI)) * sz * 0.085 * stride;
    const bob = Math.abs(Math.sin(cyc)) * sz * 0.05 * stride;
    const sway = Math.sin(cyc * 0.5) * sz * 0.03 * stride;

    const lw = Math.max(0.8, sz * 0.042);
    const INK = 'rgba(8,12,18,.62)';
    /* 头身比约 1:3.6（旧版 1:2.3 太 Q，像木偶） */
    const headR = sz * (boss ? 0.185 : 0.155);

    c.save();
    /* 接触阴影（抬脚时变小） */
    const shS = 1 - Math.abs(Math.sin(cyc)) * 0.14 * stride;
    this.shadow3d(c, x, y + sz * 0.10, sz * 0.46 * shS * wide, sz / 24);
    /* 元素辉光：每型僵尸脚下一圈自己的光晕（绚丽 + 远距离辨识） */
    if (boss || elite || toxic || fiery) {
      const gc = boss ? '64,214,255' : (elite ? '190,110,255' : (toxic ? '146,236,96' : '255,140,52'));
      c.save();
      c.globalCompositeOperation = 'lighter';
      const gg2 = c.createRadialGradient(x, y + sz * 0.06, 0, x, y + sz * 0.06, sz * 1.05 * wide);
      gg2.addColorStop(0, 'rgba(' + gc + ',.30)');
      gg2.addColorStop(0.5, 'rgba(' + gc + ',.10)');
      gg2.addColorStop(1, 'rgba(' + gc + ',0)');
      c.fillStyle = gg2;
      c.beginPath(); c.ellipse(x, y + sz * 0.06, sz * 1.05 * wide, sz * 0.44 * wide, 0, 0, 7); c.fill();
      c.restore();
    }

    const hipY = y - sz * 0.32 - bob;
    const shY  = y - sz * (0.74 - hunch) - bob;
    const legW = sz * 0.145 * wide, armW = sz * 0.115 * wide;
    const spread = sz * 0.125 * wide;
    const cx = x + sway;

    /* —— 远侧腿 / 臂（压暗＝在身后） —— */
    c.save(); c.globalAlpha = 0.68;
    this.limbInk(c, cx + spread * 0.5, hipY, cx + spread + sB * sz * 0.085, hipY + sz * 0.20 - liftB, legW * 0.92, cloth, clothHi, lw, 0);
    this.limbInk(c, cx + spread + sB * sz * 0.085, hipY + sz * 0.20 - liftB, cx + spread + sB * sz * 0.05, y - liftB, legW * 0.80, cloth, clothHi, lw, 0);
    c.restore();
    c.save(); c.globalAlpha = 0.68;
    this.limbInk(c, cx + spread * 1.0, shY + sz * 0.04, cx + spread * 1.95 + sB * sz * 0.06, shY + sz * 0.22, armW * 0.9, skin, skinHi, lw, 0);
    this.limbInk(c, cx + spread * 1.95 + sB * sz * 0.06, shY + sz * 0.22, cx + spread * 2.1 - sB * sz * 0.05, shY + sz * 0.50, armW * 0.8, skin, skinHi, lw, 0);
    c.restore();

    /* —— 躯干（破烂上衣：主体 + 下摆破布） —— */
    const tw = sz * 0.52 * wide, th = sz * 0.40;
    c.beginPath();
    c.moveTo(cx - tw * 0.42, shY);
    c.quadraticCurveTo(cx - tw * 0.62, shY + th * 0.55, cx - tw * 0.50, shY + th);
    c.lineTo(cx + tw * 0.50, shY + th);
    c.quadraticCurveTo(cx + tw * 0.62, shY + th * 0.55, cx + tw * 0.42, shY);
    c.closePath();
    c.fillStyle = this.matG(c, cx - tw * 0.62, cx + tw * 0.62, cloth, clothHi);
    c.fill(); this.ink(c, lw, INK);
    /* 破布下摆（锯齿边＝撕烂的衣服） */
    c.beginPath();
    c.moveTo(cx - tw * 0.50, shY + th * 0.94);
    for (let i = 0; i < 5; i++) {
      const px = cx - tw * 0.50 + (tw / 4) * i;
      c.lineTo(px + tw * 0.12, shY + th * (1.02 + (i % 2 ? 0.14 : 0.03)));
    }
    c.lineTo(cx + tw * 0.50, shY + th * 0.94);
    c.closePath();
    c.fillStyle = this.matG(c, cx - tw * 0.5, cx + tw * 0.5, cloth, clothHi);
    c.fill(); this.ink(c, lw * 0.8, INK);
    /* 胸腹暗部 + 暴露的肋骨（腐肉质感） */
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.beginPath(); c.ellipse(cx, shY + th * 0.34, tw * 0.34, th * 0.15, 0, 0, 7); c.fill();
    if (!armored) {
      c.strokeStyle = 'rgba(228,232,206,.30)'; c.lineWidth = Math.max(0.6, sz * 0.022);
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(cx - tw * 0.22, shY + th * (0.30 + i * 0.13));
        c.quadraticCurveTo(cx, shY + th * (0.36 + i * 0.13), cx + tw * 0.22, shY + th * (0.30 + i * 0.13));
        c.stroke();
      }
    }
    /* 装甲僵尸：胸甲 + 肩甲（金属板，有厚度） */
    if (armored || boss) {
      c.beginPath();
      if (c.roundRect) c.roundRect(cx - tw * 0.44, shY + th * 0.06, tw * 0.88, th * 0.62, sz * 0.05);
      else c.rect(cx - tw * 0.44, shY + th * 0.06, tw * 0.88, th * 0.62);
      c.fillStyle = this.matV(c, shY + th * 0.06, shY + th * 0.68, '#4a5350', '#93a29c');
      c.fill(); this.ink(c, lw * 0.9, INK);
      c.fillStyle = 'rgba(226,238,252,.26)';
      c.fillRect(cx - tw * 0.40, shY + th * 0.10, tw * 0.80, sz * 0.026);
      /* 肩甲（两个圆角块，带厚度） */
      for (const sx of [-1, 1]) {
        c.beginPath();
        if (c.roundRect) c.roundRect(cx + sx * tw * 0.46 - tw * 0.20, shY - sz * 0.03, tw * 0.40, th * 0.30, sz * 0.05);
        else c.rect(cx + sx * tw * 0.46 - tw * 0.20, shY - sz * 0.03, tw * 0.40, th * 0.30);
        c.fillStyle = this.matV(c, shY - sz * 0.03, shY + th * 0.27, '#414a47', '#8b9a94');
        c.fill(); this.ink(c, lw * 0.8, INK);
      }
    }

    /* —— 近侧腿 —— */
    this.limbInk(c, cx - spread * 0.5, hipY, cx - spread + sA * sz * 0.085, hipY + sz * 0.20 - liftA, legW, cloth, clothHi, lw, 0);
    this.limbInk(c, cx - spread + sA * sz * 0.085, hipY + sz * 0.20 - liftA, cx - spread + sA * sz * 0.05, y - liftA, legW * 0.88, cloth, clothHi, lw, 0);
    /* 破鞋（两只，随抬脚离地） */
    for (const [fx2, fl] of [[cx - spread + sA * sz * 0.05, liftA], [cx + spread + sB * sz * 0.05, liftB]]) {
      c.beginPath();
      if (c.roundRect) c.roundRect(fx2 - sz * 0.10, y - fl - sz * 0.045, sz * 0.20, sz * 0.09, sz * 0.03);
      else c.rect(fx2 - sz * 0.10, y - fl - sz * 0.045, sz * 0.20, sz * 0.09);
      c.fillStyle = '#22262b'; c.fill(); this.ink(c, lw * 0.7, INK);
    }

    /* —— 近侧手臂（前伸抓挠，僵尸特征） —— */
    const elbAx = cx - spread * 1.95 + sA * sz * 0.06, elbAy = shY + sz * 0.26;
    const handAy = shY + sz * 0.54 + sA * sz * 0.09;
    this.limbInk(c, cx - spread * 1.0, shY + sz * 0.05, elbAx, elbAy, armW, skin, skinHi, lw, 0);
    this.limbInk(c, elbAx, elbAy, cx - spread * 2.1 - sA * sz * 0.05, handAy, armW * 0.86, skin, skinHi, lw, 0);
    /* 爪手（三指，僵尸特征） */
    const hxx = cx - spread * 2.1 - sA * sz * 0.05;
    this.ballInk(c, hxx, handAy, sz * 0.072, skin, skinHi, lw * 0.7);
    c.strokeStyle = 'rgba(238,240,214,.62)'; c.lineWidth = Math.max(0.6, sz * 0.024);
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(hxx - sz * 0.03, handAy + i * sz * 0.028);
      c.lineTo(hxx - sz * 0.11, handAy + i * sz * 0.040);
      c.stroke();
    }
    this.ballInk(c, cx + spread * 2.1 - sB * sz * 0.05, shY + sz * 0.50, sz * 0.065, skin, skinHi, lw * 0.7);

    /* —— 头 —— */
    const hx = cx + Math.sin(cyc * 0.9) * sz * 0.02 * stride;
    const hy = shY - headR * 1.15 - bob * 0.4;
    this.ballInk(c, hx, hy, headR, skin, skinHi, lw);
    /* 头顶高光 + 右下冷色边缘光（让头从背景里"立"起来） */
    c.fillStyle = 'rgba(255,255,255,.20)';
    c.beginPath(); c.ellipse(hx - headR * 0.34, hy - headR * 0.46, headR * 0.40, headR * 0.24, -0.5, 0, 7); c.fill();
    c.strokeStyle = 'rgba(130,190,255,.30)'; c.lineWidth = Math.max(0.7, headR * 0.14);
    c.beginPath(); c.arc(hx, hy, headR * 0.96, -0.35, 0.95); c.stroke();
    /* 眼窝（凹陷） */
    c.fillStyle = 'rgba(0,0,0,.42)';
    c.beginPath(); c.ellipse(hx, hy + headR * 0.12, headR * 0.60, headR * 0.28, 0, 0, 7); c.fill();
    /* 发光眼（冻结变冰蓝 / 火系橙 / BOSS 红） */
    const eye = frozen ? '#8ceeff' : (fiery ? '#ff8a3c' : (boss ? '#ff5a5a' : '#ffe066'));
    c.save();
    c.fillStyle = eye; c.shadowColor = eye; c.shadowBlur = 6 * (sz / 26);
    c.beginPath(); c.arc(hx - headR * 0.34, hy + headR * 0.06, headR * 0.17, 0, 7); c.fill();
    c.beginPath(); c.arc(hx + headR * 0.34, hy + headR * 0.06, headR * 0.17, 0, 7); c.fill();
    c.restore();
    /* 张口 + 獠牙 */
    c.fillStyle = '#1d1414';
    c.beginPath(); c.ellipse(hx, hy + headR * 0.48, headR * 0.26, headR * 0.17, 0, 0, 7); c.fill();
    c.fillStyle = '#e8e2d0';
    c.fillRect(hx - headR * 0.15, hy + headR * 0.36, headR * 0.09, headR * 0.13);
    c.fillRect(hx + headR * 0.06, hy + headR * 0.36, headR * 0.09, headR * 0.13);

    /* 毒系：体表脓包（气泡） */
    if (toxic) {
      for (let i = 0; i < 4; i++) {
        const an = i * 1.9 + 0.6;
        this.ballInk(c, cx + Math.cos(an) * tw * 0.34, shY + th * (0.22 + (i % 3) * 0.22), headR * 0.24, '#7fbf52', '#c6f39a', lw * 0.6);
      }
    }
    /* 火系：身上跳动的小火苗 */
    if (fiery) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const fy2 = shY + th * (0.15 + i * 0.28) - (ph * 12 % 10) * 0.4;
        const fg = c.createRadialGradient(cx, fy2, 0, cx, fy2, sz * 0.13);
        fg.addColorStop(0, 'rgba(255,220,140,.55)');
        fg.addColorStop(1, 'rgba(255,110,30,0)');
        c.fillStyle = fg;
        c.beginPath(); c.arc(cx + Math.sin(ph * 3 + i) * sz * 0.06, fy2, sz * 0.13, 0, 7); c.fill();
      }
      c.restore();
    }
    /* 冰冻：整体冰罩 */
    if (frozen) {
      c.fillStyle = 'rgba(120,220,255,.26)';
      c.beginPath(); c.arc(cx, shY + th * 0.3, sz * 0.62 * wide, 0, 7); c.fill();
      c.strokeStyle = 'rgba(190,245,255,.62)'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(cx, shY + th * 0.3, sz * 0.62 * wide, 0, 7); c.stroke();
    }
    /* BOSS / 精英：头顶等级环 */
    if (boss || elite) {
      const by2 = hy - headR * 1.5;
      c.fillStyle = boss ? '#ff4d6d' : '#c08cff';
      c.beginPath(); c.arc(hx, by2, headR * 0.44, 0, 7); c.fill();
      this.ink(c, lw * 0.8, 'rgba(0,0,0,.5)');
      c.fillStyle = 'rgba(255,255,255,.92)';
      c.font = 'bold ' + Math.round(headR * 0.62) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', hx, by2 + headR * 0.03);
    }
    /* 护盾僵尸：正面盾牌（有厚度 + 金属高光） */
    if (d.front) {
      const sw = sz * 0.48, sh = sz * 0.44;
      c.save();
      c.translate(cx - sz * 0.10, y - sz * 0.42);
      c.fillStyle = 'rgba(0,0,0,.30)';
      c.beginPath(); c.ellipse(3, 4, sw * 0.5, sh * 0.5, 0, 0, 7); c.fill();
      c.beginPath();
      c.moveTo(-sw * 0.5, -sh * 0.46); c.lineTo(sw * 0.5, -sh * 0.46);
      c.lineTo(sw * 0.42, sh * 0.34); c.lineTo(0, sh * 0.5); c.lineTo(-sw * 0.42, sh * 0.34);
      c.closePath();
      c.fillStyle = this.matV(c, -sh * 0.46, sh * 0.5, '#5b6674', '#c3d2e2');
      c.fill(); this.ink(c, lw, INK);
      c.fillStyle = 'rgba(226,238,252,.34)';
      c.fillRect(-sw * 0.34, -sh * 0.30, sw * 0.68, sz * 0.028);
      c.fillStyle = 'rgba(0,0,0,.28)';
      c.beginPath(); c.arc(0, 0, sw * 0.16, 0, 7); c.fill();
      c.restore();
    }
    c.restore();
  },

  /* ---------- 3D 主角（末日士兵）：战术装备 + 真实武器 + 开火反馈 ---------- */
  drawHeroShape(c, x, y) {
    if (!isFinite(x) || !isFinite(y)) return;
    const r = this.run || {};
    const t = r.time || 0;
    const sz = 54;                          /* 原 46：手机屏上过小，细节全糊 */
    const lw = Math.max(1.0, sz * 0.048);
    const INK = 'rgba(8,12,18,.62)';
    const headR = sz * 0.155;

    /* 瞄准：锁定最近的存活僵尸 */
    let aim = -Math.PI / 2, nz = null, nd = 1e9;
    for (const z of (r.zombies || [])) {
      if (z.dead) continue;
      const dd = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
      if (dd < nd) { nd = dd; nz = z; }
    }
    if (nz) aim = Math.atan2(nz.y - (y - sz * 0.60), nz.x - x);

    /* 武器类型（决定枪的剪影） */
    let gtype = '自动';
    try {
      const g = (typeof E !== 'undefined' && E.gun && this.P) ? E.gun(this.P) : null;
      if (g && g.type) gtype = g.type;
      else if (r.gunId) {
        const gg = (EX && EX.guns ? EX.guns : []).find((q) => q.id === r.gunId);
        if (gg && gg.type) gtype = gg.type;
      }
    } catch (e) {}

    /* 呼吸（站立小幅起伏）+ 开火后坐（身体微后仰） */
    const breathe = Math.sin(t * 1.5) * sz * 0.012;
    const fire = r.muzzleT > 0 ? 1 : 0;
    /* 后坐位移按武器表 recoil 倍率（低0.55/中1.0/高1.6）
     * 此前写死 0.030，狙击枪与加特林后仰完全一致，配表零消费。 */
    const rcMul = Number(r.recoil) > 0 ? Number(r.recoil) : 1;
    const recoil = fire * sz * 0.030 * rcMul;
    const kick = fire ? 4.2 * rcMul : 0;
    const bob = breathe;

    const hipY = y - sz * 0.32 - bob;
    const shY  = y - sz * 0.74 - bob;
    const spread = sz * 0.115;
    const legW = sz * 0.145, armW = sz * 0.118;
    const cx = x - recoil * 0.5;

    /* 军绿制服配色 */
    const uniform = '#4f9a3e', uniformHi = '#c8f78a';
    const vest = '#33692c', vestHi = '#8ce05a';
    const skin = '#f2b478', skinHi = '#ffe4bc';
    const gear = '#2f5a26', gearHi = '#a2dc6a';

    c.save();
    /* 接触阴影 */
    this.shadow3d(c, x, y + sz * 0.10, sz * 0.46, sz / 24);
    /* 主角辉光：暖金 + 青边，让主角从暗场里亮出来 */
    c.save();
    c.globalCompositeOperation = 'lighter';
    const hg2 = c.createRadialGradient(x, y - sz * 0.42, 0, x, y - sz * 0.42, sz * 1.25);
    hg2.addColorStop(0, 'rgba(255,214,110,.20)');
    hg2.addColorStop(0.42, 'rgba(90,230,255,.10)');
    hg2.addColorStop(1, 'rgba(90,230,255,0)');
    c.fillStyle = hg2;
    c.beginPath(); c.ellipse(x, y - sz * 0.42, sz * 1.25, sz * 1.05, 0, 0, 7); c.fill();
    c.restore();
    /* 脚下金色选中光环（表示玩家） */
    c.save();
    c.strokeStyle = 'rgba(255,214,80,.95)'; c.lineWidth = 2.4;
    c.shadowColor = 'rgba(255,196,40,.95)'; c.shadowBlur = 10;
    c.beginPath(); c.ellipse(x, y + sz * 0.10, sz * 0.44, sz * 0.17, 0, 0, 7); c.stroke();
    c.restore();

    /* —— 远侧腿（压暗） —— */
    c.save(); c.globalAlpha = 0.66;
    this.limbInk(c, cx + spread * 0.55, hipY, cx + spread * 0.95, hipY + sz * 0.17, legW * 0.94, uniform, uniformHi, lw, 0);
    this.limbInk(c, cx + spread * 0.95, hipY + sz * 0.17, cx + spread * 0.90, y - sz * 0.02, legW * 0.82, gear, gearHi, lw, 0);
    c.restore();
    /* —— 近侧腿 + 战术靴 —— */
    this.limbInk(c, cx - spread * 0.55, hipY, cx - spread * 0.95, hipY + sz * 0.17, legW, uniform, uniformHi, lw, 0);
    this.limbInk(c, cx - spread * 0.95, hipY + sz * 0.17, cx - spread * 0.90, y - sz * 0.02, legW * 0.86, gear, gearHi, lw, 0);
    for (const sx of [-1, 1]) {
      const bx = cx + sx * spread * 0.90;
      c.beginPath();
      if (c.roundRect) c.roundRect(bx - sz * 0.105, y - sz * 0.075, sz * 0.21, sz * 0.085, sz * 0.028);
      else c.rect(bx - sz * 0.105, y - sz * 0.075, sz * 0.21, sz * 0.085);
      c.fillStyle = this.matV(c, y - sz * 0.075, y, '#3a4331', '#75855c');
      c.fill(); this.ink(c, lw * 0.7, INK);
    }

    /* —— 躯干（制服） —— */
    const tw = sz * 0.50, th = sz * 0.42;
    c.beginPath();
    c.moveTo(cx - tw * 0.40, shY);
    c.quadraticCurveTo(cx - tw * 0.58, shY + th * 0.55, cx - tw * 0.46, shY + th);
    c.lineTo(cx + tw * 0.46, shY + th);
    c.quadraticCurveTo(cx + tw * 0.58, shY + th * 0.55, cx + tw * 0.40, shY);
    c.closePath();
    c.fillStyle = this.matG(c, cx - tw * 0.58, cx + tw * 0.58, uniform, uniformHi);
    c.fill(); this.ink(c, lw, INK);
    /* 战术背心（带弹匣袋 + 肩垫） */
    c.beginPath();
    if (c.roundRect) c.roundRect(cx - tw * 0.44, shY + th * 0.04, tw * 0.88, th * 0.70, sz * 0.05);
    else c.rect(cx - tw * 0.44, shY + th * 0.04, tw * 0.88, th * 0.70);
    c.fillStyle = this.matV(c, shY + th * 0.04, shY + th * 0.74, vest, vestHi);
    c.fill(); this.ink(c, lw * 0.9, INK);
    /* 弹匣袋（三个） */
    for (let i = -1; i <= 1; i++) {
      const px = cx + i * tw * 0.28;
      c.beginPath();
      if (c.roundRect) c.roundRect(px - tw * 0.10, shY + th * 0.30, tw * 0.20, th * 0.30, sz * 0.022);
      else c.rect(px - tw * 0.10, shY + th * 0.30, tw * 0.20, th * 0.30);
      c.fillStyle = this.matV(c, shY + th * 0.30, shY + th * 0.60, '#3d4a2c', '#758a52');
      c.fill(); this.ink(c, lw * 0.6, INK);
      c.fillStyle = 'rgba(230,240,252,.22)';
      c.fillRect(px - tw * 0.09, shY + th * 0.32, tw * 0.18, sz * 0.018);
    }
    /* 腰带 */
    c.fillStyle = '#2a3038';
    c.fillRect(cx - tw * 0.46, shY + th * 0.78, tw * 0.92, sz * 0.05);
    this.ink(c, lw * 0.6, INK);
    c.fillStyle = '#c9a24a';
    c.fillRect(cx - sz * 0.055, shY + th * 0.78, sz * 0.11, sz * 0.05);
    /* 肩垫（两侧小圆角块） */
    for (const sx of [-1, 1]) {
      c.beginPath();
      if (c.roundRect) c.roundRect(cx + sx * tw * 0.44 - tw * 0.16, shY - sz * 0.02, tw * 0.32, th * 0.26, sz * 0.04);
      else c.rect(cx + sx * tw * 0.44 - tw * 0.16, shY - sz * 0.02, tw * 0.32, th * 0.26);
      c.fillStyle = this.matV(c, shY - sz * 0.02, shY + th * 0.24, '#47562f', '#7f9460');
      c.fill(); this.ink(c, lw * 0.7, INK);
    }
    /* 背包（身后，露出上缘） */
    c.beginPath();
    if (c.roundRect) c.roundRect(cx - tw * 0.72, shY + th * 0.06, tw * 0.30, th * 0.60, sz * 0.04);
    else c.rect(cx - tw * 0.72, shY + th * 0.06, tw * 0.30, th * 0.60);
    c.fillStyle = this.matV(c, shY + th * 0.06, shY + th * 0.66, '#3f4d2d', '#778c56');
    c.fill(); this.ink(c, lw * 0.7, INK);

    /* —— 头 + 战术头盔 —— */
    const hx = cx + Math.sin(t * 1.5) * sz * 0.012;
    const hy = shY - headR * 1.10;
    this.ballInk(c, hx, hy, headR, skin, skinHi, lw * 0.8);
    /* 面罩（下半脸） */
    c.fillStyle = 'rgba(26,32,42,.82)';
    c.beginPath(); c.ellipse(hx, hy + headR * 0.42, headR * 0.72, headR * 0.40, 0, 0, 7); c.fill();
    /* 头盔（半球 + 盔沿 + 高光） */
    c.beginPath(); c.arc(hx, hy - headR * 0.06, headR * 1.10, Math.PI * 1.03, Math.PI * 1.97); c.closePath();
    c.fillStyle = this.matV(c, hy - headR * 1.16, hy + headR * 0.10, '#5c7046', '#9db468');
    c.fill(); this.ink(c, lw, INK);
    c.fillStyle = '#2c3850';
    c.beginPath(); c.ellipse(hx, hy - headR * 0.10, headR * 1.16, headR * 0.34, 0, 0, 7); c.fill();
    /* 头盔顶高光弧 */
    c.strokeStyle = 'rgba(226,238,252,.38)'; c.lineWidth = Math.max(0.8, headR * 0.16);
    c.beginPath(); c.arc(hx, hy - headR * 0.06, headR * 0.92, Math.PI * 1.18, Math.PI * 1.72); c.stroke();
    /* 夜视仪（左侧伸出的镜筒，发光） */
    c.save();
    c.fillStyle = '#28303c';
    c.beginPath();
    if (c.roundRect) c.roundRect(hx - headR * 1.30, hy - headR * 0.16, headR * 0.62, headR * 0.44, headR * 0.16);
    else c.rect(hx - headR * 1.30, hy - headR * 0.16, headR * 0.62, headR * 0.44);
    c.fill(); this.ink(c, lw * 0.6, INK);
    c.fillStyle = '#7ef0a0'; c.shadowColor = '#7ef0a0'; c.shadowBlur = 5;
    c.beginPath(); c.arc(hx - headR * 1.34, hy + headR * 0.06, headR * 0.15, 0, 7); c.fill();
    c.restore();

    /* —— 远侧臂（托枪） —— */
    const gx = Math.cos(aim) * sz * 0.40, gy = Math.sin(aim) * sz * 0.40;
    c.save(); c.globalAlpha = 0.7;
    this.limbInk(c, cx + spread * 1.0, shY + sz * 0.06, cx + gx * 0.42 - sz * 0.02, shY + sz * 0.14 + gy * 0.34, armW * 0.9, uniform, uniformHi, lw, 0);
    c.restore();
    /* —— 近侧臂（扣扳机，前伸到握把） —— */
    const gripX = cx + Math.cos(aim) * sz * 0.46, gripY = shY + sz * 0.16 + Math.sin(aim) * sz * 0.28;
    this.limbInk(c, cx - spread * 1.0, shY + sz * 0.06, cx + gx * 0.50, shY + sz * 0.16 + gy * 0.42, armW, uniform, uniformHi, lw, 0);
    this.limbInk(c, cx + gx * 0.50, shY + sz * 0.16 + gy * 0.42, gripX, gripY, armW * 0.86, skin, skinHi, lw, 0);
    this.ballInk(c, gripX, gripY, sz * 0.062, skin, skinHi, lw * 0.6);

    /* —— 武器（真实的枪，按 type 分型） —— */
    this.drawWeapon3d(c, gripX, gripY, aim, gtype, sz, kick, r.muzzleT || 0, t);

    c.restore();
  },

  draw() {
    SPR.budget = 2;                    /* 本帧最多抠 2 张立绘，防止开局掉帧 */
    const cc = this.ctx || (this.cv && this.cv.getContext('2d'));
    const r = this.run; if (!r) { return; }
    const c = this.ctx; if (!c) return;
    const W = this.W, H = this.H;

    /* 屏幕震动：开火后整场画面轻微抖动，强度按武器表 recoil（低0.55/中1.0/高1.6） */
    const _shk = (r && r.shakeT > 0) ? 1 : 0;
    if (_shk) {
      c.save();
      c.translate(Number(r.shakeX) || 0, Number(r.shakeY) || 0);
    }

    /* 背景 */
    const bg = this.img(this.scene);
    if (bg && bg.complete && bg.naturalWidth) {
      try { c.drawImage(bg, 0, 0, W, H); } catch (e) {}
      c.fillStyle = 'rgba(10,16,28,0.20)'; c.fillRect(0, 0, W, H);
      /* 氛围光：左上青 / 右下品红，让画面有色彩倾向而不是一片灰 */
      let ag = c.createRadialGradient(W * 0.16, H * 0.12, 0, W * 0.16, H * 0.12, Math.max(W, H) * 0.78);
      ag.addColorStop(0, 'rgba(64,214,255,0.20)');
      ag.addColorStop(1, 'rgba(64,214,255,0)');
      c.fillStyle = ag; c.fillRect(0, 0, W, H);
      ag = c.createRadialGradient(W * 0.88, H * 0.86, 0, W * 0.88, H * 0.86, Math.max(W, H) * 0.72);
      ag.addColorStop(0, 'rgba(255,74,168,0.18)');
      ag.addColorStop(1, 'rgba(255,74,168,0)');
      c.fillStyle = ag; c.fillRect(0, 0, W, H);
    } else {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#12203c'); g.addColorStop(0.55, '#1b2a52'); g.addColorStop(1, '#2a1c46');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      let ag = c.createRadialGradient(W * 0.18, H * 0.14, 0, W * 0.18, H * 0.14, Math.max(W, H) * 0.8);
      ag.addColorStop(0, 'rgba(64,214,255,0.22)'); ag.addColorStop(1, 'rgba(64,214,255,0)');
      c.fillStyle = ag; c.fillRect(0, 0, W, H);
    }

    /* 2.5D 透视地面网格（产生纵深） */
    this.drawPerspGround(c);

    /* 氛围层 A：斜射体积光
     * 必须画在地面【之后】：体积光是空气中的散射，若画在地面之下会被
     * 地面网格完全覆盖（实测关掉后画面几乎无变化）。用 lighter 叠加，
     * 只提亮不遮挡，因此也不会糊住后面的僵尸。 */
    this.drawGodRays(c, W, H, r.time || 0);

    /* ---- 射程指示环 ----
     * 射程真正生效后，玩家必须能看见"我能打到多远"，否则短射程武器
     * （散弹 259px / 电击棒 253px）在玩家眼里就是"经常不开枪"的 BUG。
     * 画一条极淡的虚线椭圆，只在射程小于战场纵深时才画（狙击覆盖全场则不画）。 */
    try {
      const rr = Number(r.range) || 0;
      if (rr > 0 && rr < Math.max(W, H) * 0.98) {
        c.save();
        c.setLineDash([5, 7]);
        c.strokeStyle = 'rgba(120,220,255,0.16)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.ellipse(r.px, r.py, rr, rr * 0.34, 0, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    } catch (e) {}

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
    /* 地面腐蚀液池：翻滚酸泡 + 边缘脉动 + 按寿命淡出。
     * 修复前：只有一个静态半透明绿圆 —— 而它是【持续掉血的危险区域】，
     *   既看不出边界、也看不出还剩多久，消失时还会整块"啪"地不见。
     * 现在：外圈脉动危险环（贴地椭圆，符合透视）+ 内部翻滚酸泡
     *   + 寿命末端整体淡出，玩家能一眼判断"这里不能站、还要站多久"。 */
    for (const p of r.pools) {
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      const mx = Number(p.max) || Number(p.life) || 4;
      const lk = Math.max(0, Math.min(1, (Number(p.life) || 0) / Math.max(0.001, mx)));
      const sc = this.depthScale(p.y);
      const T = r.time || 0;
      const pr = Number(p.r) || 52;
      const fade = 0.35 + lk * 0.65;          /* 快消失时整体变淡 */
      /* 池体（贴地椭圆，带纵深） */
      const g1 = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, pr);
      g1.addColorStop(0, 'rgba(150,240,110,' + (0.34 * fade).toFixed(3) + ')');
      g1.addColorStop(0.72, 'rgba(110,205,80,' + (0.26 * fade).toFixed(3) + ')');
      g1.addColorStop(1, 'rgba(70,150,50,0)');
      c.fillStyle = g1;
      c.beginPath(); c.ellipse(p.x, p.y, pr, pr * 0.52, 0, 0, 7); c.fill();
      /* 脉动危险环 */
      const pul = 0.5 + Math.sin(T * 2.6 + p.x * 0.05) * 0.5;
      c.strokeStyle = 'rgba(170,255,120,' + ((0.28 + pul * 0.26) * fade).toFixed(3) + ')';
      c.lineWidth = 1.8;
      c.beginPath(); c.ellipse(p.x, p.y, pr * (0.96 + pul * 0.05), pr * 0.52 * (0.96 + pul * 0.05), 0, 0, 7); c.stroke();
      /* 翻滚酸泡：6 颗在池内上下起伏 + 明暗呼吸 */
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const sd = (p.x || 0) * 0.03 + i * 1.7;
        const t2 = (T * 0.55 + i * 0.17) % 1;
        const bx = p.x + Math.cos(sd * 1.9) * pr * 0.72;
        const by = p.y + Math.sin(sd * 2.6) * pr * 0.34 - t2 * 9 * sc;
        const br = (1.6 + Math.sin(T * 3 + i) * 0.6) * sc;
        const a2 = (1 - t2) * 0.55 * fade;
        const g2 = c.createRadialGradient(bx, by, 0, bx, by, br * 2.6);
        g2.addColorStop(0, 'rgba(225,255,190,' + a2.toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(120,220,90,0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(bx, by, br * 2.6, 0, 7); c.fill();
      }
      c.restore();
    }

    /* 掉落物（材料 / 经验 / 金币） */
    this.drawDrops(c);

    /* 特效 */
    for (const f of r.efx) {
      const al = f.life / f.max;
      if (f.t === 'boom') {
        /* 爆炸按元素分化（此前一律橙色火球，冰/电/毒炸开也是一团火） */
        this.drawBoom(c, f, al);
      } else if (f.t === 'nova') {
        /* 冲击波按元素分化（此前一律青色圆环） */
        this.drawNova(c, f, al);
      } else if (f.t === 'shell') {
        /* 抛壳：开火时从枪侧弹出的弹壳，带翻转与落地 */
        const sk = 1 - al;
        const sx = f.x + Math.cos(f.a || 0) * (6 + sk * 26);
        const sy = f.y + Math.sin(f.a || 0) * (4 + sk * 14) + sk * sk * 30;
        c.save(); c.translate(sx, sy); c.rotate((f.a || 0) + sk * 9);
        c.fillStyle = 'rgba(226,182,88,' + (al * 0.9).toFixed(3) + ')';
        c.fillRect(-2.6, -1.4, 5.2, 2.8);
        c.fillStyle = 'rgba(255,236,180,' + (al * 0.7).toFixed(3) + ')';
        c.fillRect(-2.6, -1.4, 5.2, 1);
        c.restore();
      } else if (f.t === 'tfire') {
        /* 炮台开火：炮口元素星芒 + 扩散环。
         * 此前炮台开火只飞出一枚子弹，画面上没有任何开火反馈，
         * 玩家分不清炮台到底有没有在工作。 */
        this.drawTurretFire(c, f, al);
      } else if (f.t === 'bolt') {
        c.strokeStyle = 'rgba(192,140,255,' + al + ')'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke();
      } else if (f.t === 'thermo') {
        /* 温压弹：高温高压 —— 蘑菇云 + 双层冲击环 + 飞散火星。
         * 此前温压弹与所有火系技能共用 nova，玩家看不出这是"温压弹"。 */
        const k = 1 - al;
        const R = Math.max(20, f.r || 96);
        /* ① 双层冲击环（一快一慢，体现"高压"） */
        for (let s = 0; s < 2; s++) {
          const kk = Math.max(0, Math.min(1, k * (1.5 - s * 0.45)));
          const rr = Math.max(1, R * (0.25 + kk * (1.0 - s * 0.28)));
          c.strokeStyle = 'rgba(' + (s ? '255,196,120' : '255,120,50') + ',' + ((1 - kk) * (0.75 - s * 0.25)).toFixed(3) + ')';
          c.lineWidth = Math.max(0.5, (s ? 2.2 : 4) * (1 - kk * 0.6));
          c.beginPath(); c.ellipse(f.x, f.y, rr, rr * 0.38, 0, 0, 7); c.stroke();
        }
        c.save(); c.globalCompositeOperation = 'lighter';
        /* ② 蘑菇云：烟柱 + 伞盖 */
        const stemH = 34 + k * 44;
        const sg = c.createLinearGradient(f.x, f.y, f.x, f.y - stemH);
        sg.addColorStop(0, 'rgba(255,240,190,' + (al * 0.8).toFixed(3) + ')');
        sg.addColorStop(0.5, 'rgba(255,130,50,' + (al * 0.5).toFixed(3) + ')');
        sg.addColorStop(1, 'rgba(180,60,20,0)');
        c.fillStyle = sg;
        c.beginPath();
        c.ellipse(f.x, f.y - stemH * 0.45, Math.max(1, R * 0.22 * (1 + k * 0.5)), stemH * 0.5, 0, 0, 7);
        c.fill();
        const capR = Math.max(2, R * (0.34 + k * 0.62));
        const capY = f.y - stemH * (0.82 + k * 0.12);
        const cg = c.createRadialGradient(f.x, capY, 0, f.x, capY, capR);
        cg.addColorStop(0, 'rgba(255,235,190,' + (al * 0.72).toFixed(3) + ')');
        cg.addColorStop(0.45, 'rgba(255,120,40,' + (al * 0.42).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(150,50,20,0)');
        c.fillStyle = cg;
        c.beginPath(); c.ellipse(f.x, capY, capR, capR * 0.62, 0, 0, 7); c.fill();
        /* ③ 飞散火星 */
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * Math.PI * 2 + (f.seed || 0);
          const sp = k * R * (0.9 + (((i * 7) % 5) * 0.08));
          const px = f.x + Math.cos(a0) * sp;
          const py = f.y + Math.sin(a0) * sp * 0.44 - k * 26 + k * k * 34;
          c.fillStyle = 'rgba(255,' + (150 + ((i * 11) % 90)) + ',60,' + (al * 0.85).toFixed(3) + ')';
          c.beginPath(); c.arc(px, py, Math.max(0.8, 3 * al), 0, 7); c.fill();
        }
        c.restore();
      } else if (f.t === 'cryo') {
        /* 干冰弹：地面霜环扩散 + 冰棱爆散 + 中心爆闪。
         * 冻结是"范围控制"，画面必须让玩家看清冻结到哪里。 */
        const k = 1 - al;
        const R = Math.max(20, f.r || 120);
        /* ① 霜环扩散 */
        const rr = Math.max(1, R * (0.2 + k * 0.85));
        const fg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        fg.addColorStop(0, 'rgba(210,245,255,' + ((1 - k) * 0.26).toFixed(3) + ')');
        fg.addColorStop(1, 'rgba(120,200,255,0)');
        c.fillStyle = fg;
        c.beginPath(); c.ellipse(f.x, f.y, rr, rr * 0.38, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(150,230,255,' + ((1 - k) * 0.7).toFixed(3) + ')';
        c.lineWidth = Math.max(0.5, 3 * (1 - k * 0.5));
        c.beginPath(); c.ellipse(f.x, f.y, rr, rr * 0.38, 0, 0, 7); c.stroke();
        /* ② 冰棱爆散（10 片，边飞边自转） */
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
          const a0 = (i / 10) * Math.PI * 2 + (f.seed || 0);
          const sp = k * R * (0.55 + (((i * 5) % 6) * 0.09));
          const px = f.x + Math.cos(a0) * sp;
          const py = f.y + Math.sin(a0) * sp * 0.5 - k * 18 + k * k * 22;
          c.save(); c.translate(px, py); c.rotate(a0 + k * 5);
          const s2 = (1 - k * 0.4) * (2.6 + (((i * 3) % 4) * 0.9));
          c.fillStyle = 'rgba(230,250,255,' + (al * 0.9).toFixed(3) + ')';
          c.beginPath();
          c.moveTo(0, -s2 * 2.2); c.lineTo(s2 * 0.78, 0); c.lineTo(0, s2 * 2.2); c.lineTo(-s2 * 0.78, 0);
          c.closePath(); c.fill();
          c.restore();
        }
        /* ③ 中心爆闪 */
        const cr = Math.max(2, 34 * (1 - k * 0.5) + 6);
        const cg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, cr);
        cg.addColorStop(0, 'rgba(255,255,255,' + (al * 0.9).toFixed(3) + ')');
        cg.addColorStop(0.4, 'rgba(150,225,255,' + (al * 0.5).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(80,170,240,0)');
        c.fillStyle = cg;
        c.beginPath(); c.arc(f.x, f.y, cr, 0, 7); c.fill();
        c.restore();
      } else if (f.t === 'pierce') {
        /* 电磁穿刺：一条会旋转的电磁钻 —— 螺旋螺纹 + 抖动核心 + 前端钻头。
         * 此前与高能射线共用 beam 电，两个技能画面完全一样。 */
        const T = (this.run && this.run.time) || 0;
        const ang = f.a || 0, len = Math.max(1, f.len || 620);
        c.save();
        c.translate(f.x, f.y); c.rotate(ang);
        /* ① 外辉光 */
        c.save(); c.globalCompositeOperation = 'lighter';
        const og = c.createLinearGradient(0, -14, 0, 14);
        og.addColorStop(0, 'rgba(150,110,255,0)');
        og.addColorStop(0.5, 'rgba(190,150,255,' + (al * 0.55).toFixed(3) + ')');
        og.addColorStop(1, 'rgba(150,110,255,0)');
        c.fillStyle = og;
        c.fillRect(0, -14, len, 28);
        c.restore();
        /* ② 螺旋螺纹沿束推进（"钻"的感觉）：12 道密螺纹，色偏青紫 */
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 12; i++) {
          const t = (i / 12 + T * 2.4) % 1;
          const px = t * len;
          const w = Math.max(1, 8 - t * 4.4);
          c.strokeStyle = 'rgba(' + (i % 2 ? '150,235,255' : '210,180,255') + ',' + ((1 - t * 0.5) * al * 0.85).toFixed(3) + ')';
          c.lineWidth = 2.2;
          c.beginPath(); c.ellipse(px, 0, w * 0.36, w, 0, 0, 7); c.stroke();
        }
        /* 绕束自旋的青色电弧（与高能射线的"宽柱"拉开区分） */
        for (let i = 0; i < 3; i++) {
          const t = ((T * 1.7) + i / 3) % 1;
          const px = t * len;
          c.strokeStyle = 'rgba(120,240,255,' + (al * 0.55).toFixed(3) + ')';
          c.lineWidth = 1.3;
          c.beginPath();
          c.moveTo(px - 6, Math.sin(T * 26 + i) * 4);
          c.lineTo(px, Math.sin(T * 26 + i + 1) * 7);
          c.lineTo(px + 6, Math.sin(T * 26 + i + 2) * 4);
          c.stroke();
        }
        c.restore();
        /* ③ 抖动核心（细而亮，锯齿电流） */
        c.strokeStyle = 'rgba(235,255,255,' + (al * 0.95).toFixed(3) + ')';
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(0, 0);
        const seg = 14;
        for (let i = 1; i <= seg; i++) {
          const t = i / seg;
          const jitter = (i % 2 ? 1 : -1) * (1 - t * 0.4) * (2.6 + Math.sin(T * 30 + i) * 1.6);
          c.lineTo(t * len, jitter);
        }
        c.stroke();
        /* ④ 前端钻头 */
        c.save(); c.globalCompositeOperation = 'lighter';
        c.fillStyle = 'rgba(235,220,255,' + (al * 0.9).toFixed(3) + ')';
        c.beginPath();
        c.moveTo(len, 0); c.lineTo(len - 20, -9); c.lineTo(len - 14, 0); c.lineTo(len - 20, 9);
        c.closePath(); c.fill();
        c.restore();
        c.restore();
      } else if (f.t === 'ray') {
        /* 高能射线：粗能量柱 + 沿束推进的能量环 + 出口爆闪。
         * 与电磁穿刺（细钻）形成对比：一个是"贯穿炮"，一个是"穿刺钻"。 */
        const T = (this.run && this.run.time) || 0;
        const ang = f.a || 0, len = Math.max(1, f.len || 700);
        c.save();
        c.translate(f.x, f.y); c.rotate(ang);
        /* ① 三层粗能量柱（越外层越淡）：比电磁穿刺明显更宽，颜色偏白紫 */
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let s = 0; s < 3; s++) {
          const w = 27 - s * 7;
          const og = c.createLinearGradient(0, -w, 0, w);
          og.addColorStop(0, 'rgba(150,110,255,0)');
          og.addColorStop(0.5, 'rgba(' + (s === 2 ? '255,255,255' : '205,175,255') + ',' + (al * (0.34 + s * 0.24)).toFixed(3) + ')');
          og.addColorStop(1, 'rgba(150,110,255,0)');
          c.fillStyle = og;
          c.fillRect(0, -w, len, w * 2);
        }
        c.restore();
        /* ② 沿束推进的能量环（横向脉冲，宽椭圆） */
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const t = ((T * 1.4) + i / 3) % 1;
          const px = t * len;
          const rg = c.createRadialGradient(px, 0, 0, px, 0, 26);
          rg.addColorStop(0, 'rgba(255,245,255,' + (al * 0.9).toFixed(3) + ')');
          rg.addColorStop(0.5, 'rgba(200,160,255,' + (al * 0.5).toFixed(3) + ')');
          rg.addColorStop(1, 'rgba(140,90,255,0)');
          c.fillStyle = rg;
          c.beginPath(); c.ellipse(px, 0, 11, 26, 0, 0, 7); c.fill();
        }
        /* 柱体横向光纹（"炮"的充能感） */
        for (let i = 0; i < 6; i++) {
          const t = ((T * 0.9) + i / 6) % 1;
          const px = t * len;
          c.fillStyle = 'rgba(255,255,255,' + (al * 0.30).toFixed(3) + ')';
          c.fillRect(px, -20, 3, 40);
        }
        c.restore();
        /* ③ 核心亮线（比电磁穿刺更粗） */
        c.fillStyle = 'rgba(255,255,255,' + (al * 0.9).toFixed(3) + ')';
        c.fillRect(0, -4.4, len, 8.8);
        c.restore();
        /* ④ 出口爆闪 */
        const ex = f.x + Math.cos(ang) * len, ey = f.y + Math.sin(ang) * len;
        c.save(); c.globalCompositeOperation = 'lighter';
        const er = Math.max(2, 30 * al + 6);
        const eg = c.createRadialGradient(ex, ey, 0, ex, ey, er);
        eg.addColorStop(0, 'rgba(255,255,255,' + (al * 0.85).toFixed(3) + ')');
        eg.addColorStop(0.4, 'rgba(180,140,255,' + (al * 0.55).toFixed(3) + ')');
        eg.addColorStop(1, 'rgba(120,80,255,0)');
        c.fillStyle = eg;
        c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();
        c.restore();
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
      } else if (f.t === 'spark') {
        /* 命中火花：立体粒子 + 贴地冲击环（子弹打击特效） */
        const sp = (1 - al) * (f.sp || 88);
        c.save();
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < (f.n || 6); i++) {
          const a = (f.dir || 0) + (i / (f.n || 6)) * Math.PI * 2;
          const px = f.x + Math.cos(a) * sp, py = f.y + Math.sin(a) * sp * 0.72;
          const pr = Math.max(0.6, 2.6 * al);
          const pg = c.createRadialGradient(px, py, 0, px, py, pr * 2.4);
          pg.addColorStop(0, 'rgba(255,255,255,' + (al * 0.95).toFixed(3) + ')');
          pg.addColorStop(0.4, 'rgba(' + f.col + ',' + (al * 0.8).toFixed(3) + ')');
          pg.addColorStop(1, 'rgba(' + f.col + ',0)');
          c.fillStyle = pg;
          c.beginPath(); c.arc(px, py, pr * 2.4, 0, 7); c.fill();
        }
        /* 中心闪光 */
        const cg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, 12 * al + 2);
        cg.addColorStop(0, 'rgba(255,255,255,' + (al * 0.9).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(' + f.col + ',0)');
        c.fillStyle = cg;
        c.beginPath(); c.arc(f.x, f.y, 12 * al + 2, 0, 7); c.fill();
        c.restore();
        /* 贴地椭圆冲击环（透视） */
        c.strokeStyle = 'rgba(' + f.col + ',' + (al * 0.5).toFixed(3) + ')';
        c.lineWidth = 1.6;
        c.beginPath(); c.ellipse(f.x, f.y + 10, 10 + sp * 0.22, (10 + sp * 0.22) * 0.36, 0, 0, 7); c.stroke();
      } else if (f.t === 'warn') {
        c.strokeStyle = 'rgba(255,77,109,' + al + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1.3 - al * 0.5), 0, 7); c.stroke();
      } else if (f.t === 'crit') {
        /* 暴击星芒：金色十字光线 + 扩散双环。
         * 此前暴击只有伤害数字变化，画面上与普通命中毫无区别，
         * 玩家完全感觉不到「这一枪暴击了」。 */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al, rr = 9 + k * 27;
        c.strokeStyle = 'rgba(255,214,90,' + (al * 0.95).toFixed(3) + ')'; c.lineWidth = 2.6;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + 0.4;
          c.beginPath();
          c.moveTo(f.x + Math.cos(a) * rr * 0.32, f.y + Math.sin(a) * rr * 0.26);
          c.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.8);
          c.stroke();
        }
        c.beginPath(); c.arc(f.x, f.y, rr * 0.5, 0, 7); c.stroke();
        c.restore();
      } else if (f.t === 'die') {
        /* 死亡爆碎：
         * 此前只有 7 颗绿色小点向上飘，僵尸倒下几乎没有存在感，
         * 打一大片时画面上「怪没了」但看不出是怎么没的。
         * 现在三层叠加：
         *   ① 暗红血雾（贴地扩散的椭圆，随寿命淡出）
         *   ② 14 颗绿色尸毒粒子向外飞散（带重力下坠）
         *   ③ 6 片白色碎块高速抛飞（碎肉/骨屑的打击感）
         * 全部用 lighter 叠加，成片击杀时画面会有明显的爆裂感。 */
        const k = 1 - al;
        /* ① 血雾 */
        c.save();
        const mr = 10 + k * 26;
        const bg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, mr);
        bg.addColorStop(0, 'rgba(150,40,44,' + (al * 0.42).toFixed(3) + ')');
        bg.addColorStop(1, 'rgba(120,30,34,0)');
        c.fillStyle = bg;
        c.beginPath(); c.ellipse(f.x, f.y + 4, mr, mr * 0.55, 0, 0, 7); c.fill();
        c.restore();
        /* ②③ 粒子与碎块 */
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + (f.seed || 0);
          const sp2 = 20 + k * 30;
          const px2 = f.x + Math.cos(a) * sp2;
          const py2 = f.y + Math.sin(a) * sp2 * 0.62 - k * 22 + k * k * 26;
          const pr = Math.max(0.8, 4.2 * al);
          const pg = c.createRadialGradient(px2, py2, 0, px2, py2, pr * 2.2);
          pg.addColorStop(0, 'rgba(190,255,170,' + (al * 0.9).toFixed(3) + ')');
          pg.addColorStop(0.45, 'rgba(120,220,110,' + (al * 0.6).toFixed(3) + ')');
          pg.addColorStop(1, 'rgba(120,220,110,0)');
          c.fillStyle = pg; c.beginPath(); c.arc(px2, py2, pr * 2.2, 0, 7); c.fill();
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.7 + (f.seed || 0);
          const sp3 = 14 + k * 46;
          const px3 = f.x + Math.cos(a) * sp3;
          const py3 = f.y + Math.sin(a) * sp3 * 0.5 - k * 16 + k * k * 46;
          c.fillStyle = 'rgba(255,248,232,' + (al * 0.75).toFixed(3) + ')';
          c.beginPath(); c.ellipse(px3, py3, 2.4 * al + 0.6, 1.5 * al + 0.4, a, 0, 7); c.fill();
        }
        c.restore();
      } else if (f.t === 'shock') {
        /* 地面冲击波：贴地扩散椭圆环（爆炸/重击的地面反馈） */
        const k = 1 - al;
        c.strokeStyle = 'rgba(255,238,190,' + (al * 0.72).toFixed(3) + ')';
        c.lineWidth = Math.max(0.5, 3.5 * (1 - k * 0.5));
        c.beginPath(); c.ellipse(f.x, f.y, f.r * (0.3 + k * 1.15), f.r * (0.3 + k * 1.15) * 0.36, 0, 0, 7); c.stroke();
      } else if (f.t === 'shell') {
        /* 抛壳：开火时弹出的一枚小弹壳，带旋转与抛物线 */
        const k = 1 - al;
        c.save();
        c.translate(f.x + Math.cos(f.a || 0) * k * 30, f.y - k * 20 + k * k * 32);
        c.rotate((f.a || 0) + k * 8);
        c.fillStyle = 'rgba(255,208,96,' + al.toFixed(3) + ')';
        c.fillRect(-2.5, -1.2, 5, 2.4);
        c.restore();
      } else if (f.t === 'chain') {
        /* 【表03 FX_ChainLightning】闪电链：在多个目标间跳跃的锯齿电弧。
         * 此前电磁类技能只有直线 beam，没有「链式跳跃」的表现。 */
        c.save(); c.globalCompositeOperation = 'lighter';
        const pts = f.pts || [];
        for (let i = 0; i + 1 < pts.length; i++) {
          const a0 = pts[i], a1 = pts[i + 1];
          c.strokeStyle = 'rgba(190,150,255,' + (al * 0.55).toFixed(3) + ')'; c.lineWidth = 6;
          c.beginPath(); c.moveTo(a0.x, a0.y);
          const seg = 5;
          for (let j = 1; j <= seg; j++) {
            const tt = j / seg;
            const jx = (j === seg) ? 0 : (Math.random() - 0.5) * 14 * al;
            const jy = (j === seg) ? 0 : (Math.random() - 0.5) * 14 * al;
            c.lineTo(a0.x + (a1.x - a0.x) * tt + jx, a0.y + (a1.y - a0.y) * tt + jy);
          }
          c.stroke();
          c.strokeStyle = 'rgba(245,235,255,' + (al * 0.95).toFixed(3) + ')'; c.lineWidth = 1.8;
          c.stroke();
        }
        c.restore();
      } else if (f.t === 'heal') {
        /* 【表03 FX_Heal】治疗：防线处升起绿色十字与回复光柱（医疗包 S07） */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al, up = 34 * k;
        const hg = c.createLinearGradient(f.x, f.y - up - 26, f.x, f.y + 6);
        hg.addColorStop(0, 'rgba(150,255,180,0)');
        hg.addColorStop(0.5, 'rgba(120,255,160,' + (al * 0.55).toFixed(3) + ')');
        hg.addColorStop(1, 'rgba(90,230,140,' + (al * 0.2).toFixed(3) + ')');
        c.fillStyle = hg; c.fillRect(f.x - 13, f.y - up - 26, 26, 32);
        c.strokeStyle = 'rgba(190,255,205,' + (al * 0.9).toFixed(3) + ')'; c.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          const yy = f.y - up - i * 12;
          c.beginPath(); c.moveTo(f.x - 9, yy); c.lineTo(f.x + 9, yy); c.stroke();
        }
        c.beginPath(); c.moveTo(f.x, f.y - up - 12); c.lineTo(f.x, f.y - up - 36); c.stroke();
        c.restore();
      } else if (f.t === 'shieldon') {
        /* 【表03 FX_ShieldOn】护盾开启：六边形能量罩扩散（护盾发生器 S08） */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al, rr = 26 + k * 34;
        c.strokeStyle = 'rgba(120,205,255,' + (al * 0.9).toFixed(3) + ')'; c.lineWidth = 2.6;
        c.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = i / 6 * Math.PI * 2 - Math.PI / 2;
          const px = f.x + Math.cos(a) * rr, py = f.y + Math.sin(a) * rr * 0.85;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
        const sg = c.createRadialGradient(f.x, f.y, rr * 0.4, f.x, f.y, rr);
        sg.addColorStop(0, 'rgba(120,205,255,0)');
        sg.addColorStop(1, 'rgba(140,220,255,' + (al * 0.32).toFixed(3) + ')');
        c.fillStyle = sg; c.beginPath(); c.arc(f.x, f.y, rr, 0, 7); c.fill();
        c.restore();
      } else if (f.t === 'iceshatter') {
        /* 【表03 FX_IceShatter】冰霜碎裂：冰元素命中的碎片迸裂（冰冻枪 W11） */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + (f.seed || 0);
          const px = f.x + Math.cos(a) * k * 26, py = f.y + Math.sin(a) * k * 20 - k * 8;
          c.save(); c.translate(px, py); c.rotate(a + k * 3);
          c.fillStyle = 'rgba(200,240,255,' + (al * 0.9).toFixed(3) + ')';
          c.beginPath(); c.moveTo(0, -5 * al - 1); c.lineTo(3 * al + 1, 2); c.lineTo(-3 * al - 1, 3); c.closePath(); c.fill();
          c.strokeStyle = 'rgba(255,255,255,' + (al * 0.7).toFixed(3) + ')'; c.lineWidth = 0.8; c.stroke();
          c.restore();
        }
        c.strokeStyle = 'rgba(170,235,255,' + (al * 0.8).toFixed(3) + ')'; c.lineWidth = 2;
        c.beginPath(); c.arc(f.x, f.y - 8, 10 + k * 22, 0, 7); c.stroke();
        c.restore();
      } else if (f.t === 'poison') {
        /* 【表03 FX_PoisonCloud】毒雾扩散：翻滚的绿色毒气团（毒元素/毒僵尸） */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al, rr = (f.r || 34) * (0.5 + k * 0.8);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + k * 1.4;
          const px = f.x + Math.cos(a) * rr * 0.55, py = f.y + Math.sin(a) * rr * 0.4 - k * 10;
          const pg = c.createRadialGradient(px, py, 0, px, py, rr * 0.75);
          pg.addColorStop(0, 'rgba(150,240,80,' + (al * 0.42).toFixed(3) + ')');
          pg.addColorStop(0.6, 'rgba(110,200,60,' + (al * 0.2).toFixed(3) + ')');
          pg.addColorStop(1, 'rgba(80,160,50,0)');
          c.fillStyle = pg; c.beginPath(); c.arc(px, py, rr * 0.75, 0, 7); c.fill();
        }
        c.restore();
      } else if (f.t === 'wind') {
        /* 【表03 FX_WindSlash】风刃：横扫的青绿弧形气刃（风刃僵尸） */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al;
        for (let i = 0; i < 3; i++) {
          const off = i * 0.22;
          c.strokeStyle = 'rgba(' + (i === 1 ? '235,255,250' : '150,240,200') + ',' + (al * (0.85 - off)).toFixed(3) + ')';
          c.lineWidth = 3.4 - i * 0.9;
          c.beginPath();
          const rr = (f.r || 42) * (1 + k * 0.7) + i * 7;
          c.arc(f.x, f.y, Math.max(1, rr), (f.a || 0) - 0.75 + k * 1.3, (f.a || 0) + 0.75 + k * 1.3);
          c.stroke();
        }
        c.restore();
      } else if (f.t === 'coin') {
        /* 【表03 FX_CoinDrop】金币掉落：击杀后弹起的金币（此前击杀只有飘字） */
        c.save();
        const k = 1 - al;
        const cy = f.y - (k * 30 - k * k * 46);
        c.globalCompositeOperation = 'lighter';
        const cg2 = c.createRadialGradient(f.x, cy, 0, f.x, cy, 9);
        cg2.addColorStop(0, 'rgba(255,246,180,' + (al * 0.9).toFixed(3) + ')');
        cg2.addColorStop(1, 'rgba(255,205,60,0)');
        c.fillStyle = cg2; c.beginPath(); c.arc(f.x, cy, 9, 0, 7); c.fill();
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(255,214,74,' + al.toFixed(3) + ')';
        c.beginPath(); c.ellipse(f.x, cy, 4.2, 4.2 * Math.abs(Math.cos(k * 9)), 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(190,140,20,' + (al * 0.8).toFixed(3) + ')'; c.lineWidth = 0.9; c.stroke();
        c.restore();
      } else if (f.t === 'roar') {
        /* 【表03 FX_BossRoar】BOSS怒吼：地面裂纹式扩散冲击环 + 红色警示 */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al;
        for (let i = 0; i < 3; i++) {
          const rr = (f.r || 120) * (0.25 + (k + i * 0.22) * 1.1);
          const aa = Math.max(0, al - i * 0.22);
          if (aa <= 0) continue;
          c.strokeStyle = 'rgba(255,90,120,' + (aa * 0.7).toFixed(3) + ')';
          c.lineWidth = 5 - i * 1.2;
          c.beginPath(); c.ellipse(f.x, f.y, Math.max(1, rr), Math.max(1, rr * 0.36), 0, 0, 7); c.stroke();
        }
        const rg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, (f.r || 120) * 0.8);
        rg.addColorStop(0, 'rgba(255,120,140,' + (al * 0.35).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(255,60,90,0)');
        c.fillStyle = rg; c.beginPath(); c.arc(f.x, f.y, (f.r || 120) * 0.8, 0, 7); c.fill();
        c.restore();
      } else if (f.t === 'wavestart') {
        /* 【表03 FX_WaveStart】波次来袭：屏幕中上方的斜向扫描警示带 */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al;
        const yy = f.y - 40 + k * 26;
        const lg = c.createLinearGradient(0, yy - 22, 0, yy + 22);
        lg.addColorStop(0, 'rgba(92,216,255,0)');
        lg.addColorStop(0.5, 'rgba(92,216,255,' + (al * 0.34).toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(92,216,255,0)');
        c.fillStyle = lg; c.fillRect(0, yy - 22, f.w || 480, 44);
        c.strokeStyle = 'rgba(190,245,255,' + (al * 0.85).toFixed(3) + ')'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, yy); c.lineTo(f.w || 480, yy); c.stroke();
        c.restore();
      } else if (f.t === 'levelup') {
        /* 【表03 FX_LevelUp】升级光效：角色脚下升起的光柱与上升光点 */
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = 1 - al;
        const lg2 = c.createLinearGradient(f.x, f.y, f.x, f.y - 90);
        lg2.addColorStop(0, 'rgba(255,214,90,' + (al * 0.5).toFixed(3) + ')');
        lg2.addColorStop(1, 'rgba(255,214,90,0)');
        c.fillStyle = lg2; c.fillRect(f.x - 20, f.y - 90, 40, 90);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const px = f.x + Math.cos(a) * (14 + k * 16), py = f.y - k * (24 + i * 6);
          c.fillStyle = 'rgba(255,240,170,' + (al * 0.9).toFixed(3) + ')';
          c.beginPath(); c.arc(px, py, 2.2 * al + 0.6, 0, 7); c.fill();
        }
        c.strokeStyle = 'rgba(255,224,120,' + (al * 0.8).toFixed(3) + ')'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(f.x, f.y, 22 + k * 30, (22 + k * 30) * 0.36, 0, 0, 7); c.stroke();
        c.restore();
      }
    }

    /* 火环 */
    if (r.mods.auraR > 0) {
      c.strokeStyle = 'rgba(255,122,60,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.arc(r.px, r.py, r.mods.auraR, 0, 7); c.stroke();
    }

    /* 子弹：按元素分型的曳光弹
     * 旧版所有武器都是同一种黄色小球，看不出武器/元素差异。
     * 新版：拖尾（沿速度反向的锥形）+ 弹头亮核 + 外辉光 + 地面光斑反射。 */
    /* ============================================================
     * 子弹外观：按【元素】分成六种完全不同的弹体形态
     * 修复前：所有元素共用同一套「锥形拖尾 + 圆辉光 + 亮核」，
     *   只换三个颜色变量 —— 冰、火、电、毒、风打出来是同一个形状，
     *   画面谈不上"特效"，玩家也分不清自己打的是什么元素。
     * 修复后：
     *   火 = 翻滚火球（三层焰瓣 + 上升火星 + 烟迹）
     *   冰 = 旋转冰锥（菱形晶体 + 十字寒芒 + 碎冰屑）
     *   电 = 链式电弧（锯齿拖尾 + 随机分叉 + 白热电球）
     *   毒 = 酸液球（翻滚液球 + 表面气泡 + 滴落液滴）
     *   风 = 弯月风刃（双弧刃光 + 旋转气流）
     *   物 = 曳光尖弹（锐利弹头 + 速度线 + 金色余晖）
     * 全部程序化绘制，随弹速拉伸、随透视缩放，不依赖贴图。
     * ============================================================ */
    const TT = r.time || 0;
    for (const b of r.bullets) {
      if (!isFinite(b.x) || !isFinite(b.y)) continue;
      const bs = this.depthScale(b.y);
      /* 地面投影点：子弹悬空飞行 → 地面上一个淡影，强化 3D 空间感 */
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.beginPath(); c.ellipse(b.x, b.y + 6 * bs, 3.4 * bs, 1.4 * bs, 0, 0, 7); c.fill();

      if (b.enemy) {
        /* 敌方投射物：毒液 / 酸球（外圈毒雾 + 内亮核 + 拖尾液滴） */
        const er = 5 * bs;
        const ec = b.kind === 'poison' ? '123,232,106' : '200,224,90';
        c.save();
        c.globalCompositeOperation = 'lighter';
        const tr = c.createLinearGradient(b.x, b.y, b.x - b.vx * 0.05, b.y - b.vy * 0.05);
        tr.addColorStop(0, 'rgba(' + ec + ',.55)');
        tr.addColorStop(1, 'rgba(' + ec + ',0)');
        c.fillStyle = tr;
        c.beginPath(); c.ellipse(b.x - b.vx * 0.025, b.y - b.vy * 0.025,
          Math.max(3, er * 1.7), Math.max(1.4, er * 0.8), Math.atan2(b.vy, b.vx), 0, 7); c.fill();
        const eg = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, er * 2.1);
        eg.addColorStop(0, 'rgba(255,255,255,.90)');
        eg.addColorStop(0.35, 'rgba(' + ec + ',.95)');
        eg.addColorStop(1, 'rgba(' + ec + ',0)');
        c.fillStyle = eg;
        c.beginPath(); c.arc(b.x, b.y, er * 2.1, 0, 7); c.fill();
        c.restore();
        continue;
      }

      /* 玩家弹：按元素取三段色（核心 / 主体 / 余晖） */
      const el = b.el || '物';
      let c0, c1, c2;
      if (el === '火')      { c0 = '255,248,214'; c1 = '255,150,52';  c2 = '220,60,16'; }
      else if (el === '冰') { c0 = '235,252,255'; c1 = '120,220,255'; c2 = '52,140,235'; }
      else if (el === '电') { c0 = '242,232,255'; c1 = '186,132,255'; c2 = '116,54,235'; }
      else if (el === '毒') { c0 = '232,255,208'; c1 = '146,236,96';  c2 = '66,176,38'; }
      else if (el === '风') { c0 = '232,255,240'; c1 = '123,232,160'; c2 = '40,170,110'; }
      else                  { c0 = '255,248,222'; c1 = '255,208,96';  c2 = '236,132,32'; }

      const ang = Math.atan2(b.vy, b.vx);
      const spd = Math.hypot(b.vx || 0, b.vy || 0) || 520;
      /* 拖尾长度随弹速：狙击（1400）拖尾明显更长 → 高速感 */
      const tl = Math.max(10, Math.min(34, spd * 0.024)) * bs;
      /* 每颗弹独立的抖动相位（位置相关，避免同屏子弹同步闪烁） */
      const ph = TT * 9 + (b.x || 0) * 0.055 + (b.y || 0) * 0.03;

      c.save();
      c.globalCompositeOperation = 'lighter';

      if (el === '火') {
        /* ---- 火：烟迹 + 三层火球 + 翻滚焰瓣 + 上升火星 ---- */
        c.save();
        c.translate(b.x, b.y); c.rotate(ang);
        const tg = c.createLinearGradient(0, 0, -tl, 0);
        tg.addColorStop(0, 'rgba(255,205,110,.85)');
        tg.addColorStop(0.34, 'rgba(255,125,40,.52)');
        tg.addColorStop(1, 'rgba(120,38,10,0)');
        c.fillStyle = tg;
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(-tl * 0.5, -3.4 * bs, -tl, 0);
        c.quadraticCurveTo(-tl * 0.5, 3.4 * bs, 0, 0);
        c.closePath(); c.fill();
        c.restore();
        const fr = 4.0 * bs;
        /* 外焰 */
        const g1 = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, fr * 2.7);
        g1.addColorStop(0, 'rgba(255,255,235,.95)');
        g1.addColorStop(0.26, 'rgba(255,205,85,.88)');
        g1.addColorStop(0.60, 'rgba(255,120,40,.62)');
        g1.addColorStop(1, 'rgba(170,40,10,0)');
        c.fillStyle = g1;
        c.beginPath(); c.arc(b.x, b.y, fr * 2.7, 0, 7); c.fill();
        /* 翻滚焰瓣：4 片随相位伸缩的椭圆火舌 */
        for (let i = 0; i < 4; i++) {
          const a0 = ph * 0.62 + i * Math.PI / 2;
          const L = fr * (1.45 + Math.sin(ph * 1.7 + i * 2.2) * 0.5);
          const px2 = b.x + Math.cos(a0) * fr * 0.55, py2 = b.y + Math.sin(a0) * fr * 0.42;
          c.save(); c.translate(px2, py2); c.rotate(a0);
          c.fillStyle = 'rgba(255,' + (155 + Math.round(55 * Math.sin(ph + i * 1.7))) + ',60,.42)';
          c.beginPath(); c.ellipse(L * 0.55, 0, L * 0.62, L * 0.34, 0, 0, 7); c.fill();
          c.restore();
        }
        /* 上升火星 */
        for (let i = 0; i < 3; i++) {
          const t2 = (ph * 0.30 + i * 0.34) % 1;
          const mx = b.x + Math.sin(ph * 0.8 + i * 3) * 4.2 * bs - Math.cos(ang) * t2 * tl * 0.5;
          const my = b.y - 2 * bs - t2 * 13 * bs;
          c.fillStyle = 'rgba(255,' + (205 - Math.round(t2 * 95)) + ',75,' + ((1 - t2) * 0.85).toFixed(3) + ')';
          c.beginPath(); c.arc(mx, my, (1.6 - t2 * 1.1) * bs + 0.4, 0, 7); c.fill();
        }
      } else if (el === '冰') {
        /* ---- 冰：霜雾拖尾 + 长菱形冰锥 + 十字寒芒 + 碎冰屑 ---- */
        c.save();
        c.translate(b.x, b.y); c.rotate(ang);
        const tg = c.createLinearGradient(0, 0, -tl, 0);
        tg.addColorStop(0, 'rgba(215,248,255,.72)');
        tg.addColorStop(0.4, 'rgba(' + c1 + ',.34)');
        tg.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = tg;
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(-tl * 0.5, -2.1 * bs, -tl, 0);
        c.quadraticCurveTo(-tl * 0.5, 2.1 * bs, 0, 0);
        c.closePath(); c.fill();
        /* 冰锥主体：沿弹道拉长的菱形（前端尖、后端略钝） */
        const bl = 6.6 * bs, bw = 3.1 * bs;
        c.fillStyle = 'rgba(228,250,255,.95)';
        c.beginPath(); c.moveTo(bl, 0); c.lineTo(-bl * 0.15, bw); c.lineTo(-bl * 0.8, 0); c.lineTo(-bl * 0.15, -bw);
        c.closePath(); c.fill();
        /* 内部亮芯 */
        c.fillStyle = 'rgba(130,225,255,.92)';
        c.beginPath(); c.moveTo(bl * 0.58, 0); c.lineTo(-bl * 0.1, bw * 0.48); c.lineTo(-bl * 0.45, 0); c.lineTo(-bl * 0.1, -bw * 0.48);
        c.closePath(); c.fill();
        /* 白色高光（左上受光） */
        c.fillStyle = 'rgba(255,255,255,.85)';
        c.beginPath(); c.ellipse(bl * 0.18, -bw * 0.3, bl * 0.26, bw * 0.2, 0, 0, 7); c.fill();
        c.restore();
        /* 十字寒芒：两条细长光刺，长度随时间呼吸 */
        const sl = (7.5 + Math.sin(ph * 1.4) * 2.2) * bs;
        c.strokeStyle = 'rgba(215,248,255,.8)'; c.lineWidth = 1.5 * bs;
        c.beginPath();
        c.moveTo(b.x - sl, b.y); c.lineTo(b.x + sl, b.y);
        c.moveTo(b.x, b.y - sl * 0.72); c.lineTo(b.x, b.y + sl * 0.72);
        c.stroke();
        /* 碎冰屑：拖尾后方 3 片小菱形，缓慢自转 */
        for (let i = 0; i < 3; i++) {
          const t2 = (ph * 0.22 + i * 0.36) % 1;
          const dx = b.x - Math.cos(ang) * tl * (0.35 + t2 * 0.6) + Math.sin(ang) * Math.sin(ph + i * 2) * 3 * bs;
          const dy = b.y - Math.sin(ang) * tl * (0.35 + t2 * 0.6) * 0.5;
          c.save(); c.translate(dx, dy); c.rotate(ph * 0.9 + i);
          c.fillStyle = 'rgba(220,250,255,' + ((1 - t2) * 0.7).toFixed(3) + ')';
          c.beginPath(); c.moveTo(1.9 * bs, 0); c.lineTo(0, 1.1 * bs); c.lineTo(-1.9 * bs, 0); c.lineTo(0, -1.1 * bs);
          c.closePath(); c.fill(); c.restore();
        }
        /* 冷辉光 */
        const g2 = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, 7.5 * bs);
        g2.addColorStop(0, 'rgba(' + c1 + ',.42)');
        g2.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(b.x, b.y, 7.5 * bs, 0, 7); c.fill();
      } else if (el === '电') {
        /* ---- 电：锯齿拖尾 + 白热电球 + 三条随机分叉电弧 ---- */
        c.save();
        c.translate(b.x, b.y); c.rotate(ang);
        c.strokeStyle = 'rgba(205,165,255,.72)'; c.lineWidth = 1.9 * bs;
        c.beginPath(); c.moveTo(0, 0);
        for (let i = 1; i <= 4; i++) {
          const k = -tl * (i / 4);
          c.lineTo(k, Math.sin(ph * 2.1 + i * 2.3) * 3.4 * bs * (i / 4));
        }
        c.stroke();
        /* 第二道并行细弧（双线更有电的感觉） */
        c.strokeStyle = 'rgba(240,225,255,.5)'; c.lineWidth = 0.9 * bs;
        c.beginPath(); c.moveTo(0, 0);
        for (let i = 1; i <= 4; i++) {
          const k = -tl * (i / 4);
          c.lineTo(k, Math.sin(ph * 2.1 + i * 2.3 + 1.9) * 2.6 * bs * (i / 4));
        }
        c.stroke();
        c.restore();
        /* 电球：紫辉 + 白核 */
        const g2 = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, 8 * bs);
        g2.addColorStop(0, 'rgba(255,255,255,.95)');
        g2.addColorStop(0.3, 'rgba(214,180,255,.85)');
        g2.addColorStop(0.66, 'rgba(' + c2 + ',.55)');
        g2.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(b.x, b.y, 8 * bs, 0, 7); c.fill();
        /* 分叉电弧：3 条向外锯齿，方向绕核心旋转 */
        for (let i = 0; i < 3; i++) {
          const a0 = ph * 1.25 + i * 2.0944;
          c.strokeStyle = 'rgba(232,214,255,.9)'; c.lineWidth = 1.4 * bs;
          c.beginPath(); c.moveTo(b.x, b.y);
          for (let k = 1; k <= 3; k++) {
            const L = 3.6 * bs * k;
            const jt = Math.sin(ph * 3.2 + i * 2 + k * 1.7) * 2.1 * bs;
            const nx = b.x + Math.cos(a0) * L - Math.sin(a0) * jt;
            const ny = b.y + Math.sin(a0) * L * 0.78 + Math.cos(a0) * jt;
            c.lineTo(nx, ny);
          }
          c.stroke();
        }
      } else if (el === '毒') {
        /* ---- 毒：翻滚酸球 + 表面气泡 + 滴落液滴 ---- */
        c.save();
        c.translate(b.x, b.y); c.rotate(ang);
        const tg = c.createLinearGradient(0, 0, -tl, 0);
        tg.addColorStop(0, 'rgba(' + c1 + ',.55)');
        tg.addColorStop(0.5, 'rgba(' + c2 + ',.28)');
        tg.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = tg;
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(-tl * 0.5, -2.6 * bs, -tl, 0);
        c.quadraticCurveTo(-tl * 0.5, 2.6 * bs, 0, 0);
        c.closePath(); c.fill();
        c.restore();
        /* 液球：随相位轻微挤压（果冻感） */
        const sq = 1 + Math.sin(ph * 1.5) * 0.16;
        const gr = 4.4 * bs;
        const g2 = c.createRadialGradient(b.x - gr * 0.3, b.y - gr * 0.3, 0, b.x, b.y, gr * 2.2);
        g2.addColorStop(0, 'rgba(240,255,225,.95)');
        g2.addColorStop(0.34, 'rgba(' + c1 + ',.9)');
        g2.addColorStop(0.7, 'rgba(' + c2 + ',.6)');
        g2.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.ellipse(b.x, b.y, gr * 1.5 * sq, gr * 1.5 / sq, 0, 0, 7); c.fill();
        /* 表面气泡：2 个亮点在球内游走 */
        for (let i = 0; i < 2; i++) {
          const a0 = ph * 0.9 + i * 2.4;
          const bx2 = b.x + Math.cos(a0) * gr * 0.6, by2 = b.y + Math.sin(a0) * gr * 0.5;
          c.fillStyle = 'rgba(255,255,255,.6)';
          c.beginPath(); c.arc(bx2, by2, 1.25 * bs, 0, 7); c.fill();
        }
        /* 滴落液滴：拖尾下方 2 颗，带下坠 */
        for (let i = 0; i < 2; i++) {
          const t2 = (ph * 0.28 + i * 0.5) % 1;
          const dx = b.x - Math.cos(ang) * tl * (0.4 + t2 * 0.5);
          const dy = b.y - Math.sin(ang) * tl * (0.4 + t2 * 0.5) * 0.5 + t2 * 6 * bs;
          c.fillStyle = 'rgba(' + c1 + ',' + ((1 - t2) * 0.65).toFixed(3) + ')';
          c.beginPath(); c.ellipse(dx, dy, 1.7 * bs, 2.4 * bs, 0, 0, 7); c.fill();
        }
      } else if (el === '风') {
        /* ---- 风：双弧风刃 + 旋转气流点 ---- */
        c.save();
        c.translate(b.x, b.y); c.rotate(ang);
        for (let s = 0; s < 2; s++) {
          const sg = s ? 1 : -1;
          const rr = 7 * bs;
          c.strokeStyle = 'rgba(' + (s ? c1 : c0) + ',' + (s ? 0.75 : 0.9) + ')';
          c.lineWidth = (s ? 2.0 : 2.6) * bs;
          c.beginPath();
          c.arc(-tl * 0.3, 0, rr * (s ? 1.5 : 1), -0.9 * sg, 0.9 * sg);
          c.stroke();
        }
        c.restore();
        const g2 = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, 7 * bs);
        g2.addColorStop(0, 'rgba(240,255,246,.9)');
        g2.addColorStop(0.4, 'rgba(' + c1 + ',.6)');
        g2.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(b.x, b.y, 7 * bs, 0, 7); c.fill();
        /* 旋转气流点：3 粒绕核心转的青色小点 */
        for (let i = 0; i < 3; i++) {
          const a0 = ph * 1.8 + i * 2.0944;
          const rr2 = 5.2 * bs;
          c.fillStyle = 'rgba(' + c0 + ',.85)';
          c.beginPath();
          c.arc(b.x + Math.cos(a0) * rr2, b.y + Math.sin(a0) * rr2 * 0.72, 1.4 * bs, 0, 7);
          c.fill();
        }
      } else {
        /* ---- 物（默认/狙击/散弹）：锐利曳光尖弹 + 速度线 ---- */
        c.save();
        c.translate(b.x, b.y); c.rotate(ang);
        const tg = c.createLinearGradient(0, 0, -tl, 0);
        tg.addColorStop(0, 'rgba(' + c0 + ',1)');
        tg.addColorStop(0.28, 'rgba(' + c1 + ',.80)');
        tg.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = tg;
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(-tl * 0.45, -2.6 * bs, -tl, 0);
        c.quadraticCurveTo(-tl * 0.45, 2.6 * bs, 0, 0);
        c.closePath(); c.fill();
        /* 尖弹头（比原圆核更锐利，子弹感更强） */
        const pl = 6.2 * bs, pw = 2.5 * bs;
        c.fillStyle = 'rgba(255,255,255,.96)';
        c.beginPath(); c.moveTo(pl, 0); c.lineTo(pl * 0.1, pw); c.lineTo(-pl * 0.55, 0); c.lineTo(pl * 0.1, -pw);
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(' + c1 + ',.9)';
        c.beginPath(); c.moveTo(pl * 0.72, 0); c.lineTo(pl * 0.1, pw * 0.6); c.lineTo(-pl * 0.35, 0); c.lineTo(pl * 0.1, -pw * 0.6);
        c.closePath(); c.fill();
        /* 速度线：两条平行细线，高速弹更明显 */
        const vl = tl * 0.75;
        c.strokeStyle = 'rgba(' + c0 + ',.55)'; c.lineWidth = 1.1 * bs;
        c.beginPath();
        c.moveTo(-vl, -3.6 * bs); c.lineTo(-vl * 0.25, -3.6 * bs);
        c.moveTo(-vl, 3.6 * bs); c.lineTo(-vl * 0.25, 3.6 * bs);
        c.stroke();
        c.restore();
        const hr = 3.0 * bs;
        const gg = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, hr * 3.2);
        gg.addColorStop(0, 'rgba(' + c1 + ',.75)');
        gg.addColorStop(0.45, 'rgba(' + c2 + ',.3)');
        gg.addColorStop(1, 'rgba(' + c2 + ',0)');
        c.fillStyle = gg;
        c.beginPath(); c.arc(b.x, b.y, hr * 2.4, 0, 7); c.fill();
      }
      c.restore();
      /* 地面光斑反射：子弹在地面投下一小片元素色光 */
      const gl = c.createRadialGradient(b.x, b.y + 7 * bs, 0, b.x, b.y + 7 * bs, 7 * bs);
      gl.addColorStop(0, 'rgba(' + c1 + ',.42)');
      gl.addColorStop(1, 'rgba(' + c1 + ',0)');
      c.fillStyle = gl;
      c.beginPath(); c.ellipse(b.x, b.y + 7 * bs, 7 * bs, 3 * bs, 0, 0, 7); c.fill();
    }
    /* 僵尸 */
    /* 按 y 排序：远的先画，近的后画（2.5D 遮挡关系） */
    const zs = r.zombies.filter((z) => !z.dead).sort((a, b) => a.y - b.y);
    for (const z of zs) {
      /* 受击动作反馈：被打中的瞬间横向一颤 + 向后一顿（0.12s 内衰减）。
       * 此前受击只有一层闪白贴图，僵尸"纹丝不动"地站着掉血，
       * 玩家感觉不到自己打中了，打击感几乎为零。 */
      const _hs = (z.hitT > 0) ? Math.min(1, z.hitT * 8) : 0;
      if (_hs > 0) {
        c.save();
        c.translate(Math.sin((z.hitT || 0) * 95) * 3.4 * _hs, -2.8 * _hs);
      }
      const sc = this.depthScale(z.y);
      const sz = (z.isBoss ? 58 : ((z.d && z.d.elite) ? 38 : 32)) * sc;
      this._cardH = 0;
      if (this.card3d) {
        const big1 = !!z.isBoss || !!(z.d && z.d.elite);
        const cw = sz * 1.14, ch = sz * 1.50;
        this._cardH = ch;
        this.drawCard(c, z.x, z.y + sz * 0.30, cw, ch,
          z.isBoss ? 'boss' : ((z.d && z.d.elite) ? 'elite' : 'zombie'),
          { t: r.time || 0, ph: ((z.id || z.x || 0) % 17) * 0.37,
            sw: z.isBoss ? 1 : 0.5, gloss: big1, glow: big1 });
      } else {
        this.shadow(c, z.x, z.y, sz * 0.55, sc);
      }
      if (z.slowT > 0) { c.fillStyle = 'rgba(92,216,255,0.28)'; c.beginPath(); c.arc(z.x, z.y, sz * 0.62, 0, 7); c.fill(); }
      /* 立体精灵：抠底立绘 + 接触阴影 + 轮廓光 + 走动起伏。
       * 此前是直接 drawImage 一张 256×256 深色底 JPG —— 贴在战场上就是
       * 一块方纸片，这是画面"扁平/有纸质感"的主要来源。 */
      /* 默认走"真 3D 骨骼模型"（会动的立体角色）。
       * 立绘（SPR）本质是平面图片，贴在 3D 场景里必然呈现纸片感，
       * 只有在 BT.spriteMode=true 时才退回立绘。 */
      const sp = this.spriteMode ? SPR.get(z.img) : null;
      const bob = Math.sin(((z.animT || 0) * 7) + ((z.id || z.x || 0) % 7)) * sz * 0.04;
      /* Q 版二头身贴图优先：已抠底透明 PNG，带描边与自身配色。
       * 贴图没到位 / 该种类没有贴图 → 自动退回立绘或矢量骨骼，不会开天窗。 */
      let zChi = false;
      const _ck = (z && z.d && z.d.chibi) || null;
      if (_ck && typeof CHIBI !== 'undefined' && CHIBI && (CHIBI.ready(_ck) || CHIBI.ensure(_ck))) {
        this.shadow3d(c, z.x, z.y + sz * 0.18, sz * 0.44, sc);
        zChi = CHIBI.draw(c, _ck, z.x, z.y + sz * 0.16, sz * 1.80, {
          bob: bob,
          flash: (z.hitT > 0) ? Math.min(0.6, z.hitT * 4) : 0,
          tilt: ((z.slow || 0) < 0.9) ? Math.sin((z.animT || 0) * 6.2) * 0.05 : 0
        });
        if (zChi) this._zTop = z.y + sz * 0.16 - sz * 1.80;
      }
      if (zChi) { /* Q 版已绘制：跳过立绘与矢量两套画法 */ }
      else if (sp) {
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
      if (_hs > 0) c.restore();
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

    /* ---- 表03 FX_Stun：眩晕星环 ----
     * 闪光弹 S05 的 stun 此前只有「不动了」，画面上没有任何标记，
     * 玩家分不清「僵尸被定住」还是「僵尸卡住了」。现在头顶转星环。 */
    try {
      const tt = r.time || 0;
      for (const z of r.zombies) {
        if (z.dead || !(Number(z.stunT) > 0)) continue;
        const sy = z.y - (z.isBoss ? 62 : 40);
        c.save(); c.globalCompositeOperation = 'lighter';
        c.translate(z.x, sy); c.rotate(tt * 3.6);
        const sa = Math.min(1, z.stunT / 0.6) * 0.9;
        c.strokeStyle = 'rgba(255,226,120,' + sa.toFixed(3) + ')'; c.lineWidth = 2.2;
        for (let i = 0; i < 3; i++) {
          const a0 = i * Math.PI * 2 / 3;
          c.beginPath();
          c.moveTo(Math.cos(a0) * 4.5, Math.sin(a0) * 3.4);
          c.lineTo(Math.cos(a0) * 13, Math.sin(a0) * 9.8);
          c.stroke();
        }
        const sg2 = c.createRadialGradient(0, 0, 0, 0, 0, 16);
        sg2.addColorStop(0, 'rgba(255,236,160,' + (sa * 0.32).toFixed(3) + ')');
        sg2.addColorStop(1, 'rgba(255,210,90,0)');
        c.fillStyle = sg2; c.beginPath(); c.arc(0, 0, 16, 0, 7); c.fill();
        c.restore();
      }
    } catch (e) {}

    /* ---- 表03 特效帧：灼烧 / 寒霜持续光环 ----
     * 参数全部取自 EX.VFX（帧数/尺寸/时长），美术把帧序列放进
     * 对应 dir 后即可替换成真素材；没有素材时用 canvas 图元按同样参数回退，
     * 保证「表配了就一定看得到东西」。 */
    try {
      const t = r.time || 0;
      if (Number(r.wallBurnT) > 0) {
        const vd = (typeof EX !== 'undefined' && EX.vfxDef) ? (EX.vfxDef('FX_Burn_Dot') || {}) : {};
        const sz = Number(vd.size) || 72;
        const ph = Math.sin(t * 9) * 0.5 + 0.5;
        c.save();
        const g2 = c.createRadialGradient(r.px, (this.wallY || H - 96), 0, r.px, (this.wallY || H - 96), sz);
        g2.addColorStop(0, 'rgba(255,150,60,' + (0.28 + ph * 0.18).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(255,90,20,0)');
        c.fillStyle = g2;
        c.fillRect(r.px - sz, (this.wallY || H - 96) - sz, sz * 2, sz * 2);
        c.restore();
      }
      if (Number(r.chillT) > 0) {
        const vd = (typeof EX !== 'undefined' && EX.vfxDef) ? (EX.vfxDef('FX_Chill_Aura') || {}) : {};
        const sz = Number(vd.size) || 72;
        const ph = Math.sin(t * 5) * 0.5 + 0.5;
        c.save();
        c.strokeStyle = 'rgba(120,220,255,' + (0.30 + ph * 0.22).toFixed(3) + ')';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(r.px, r.py, sz * (0.8 + ph * 0.2), sz * 0.34 * (0.8 + ph * 0.2), 0, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    } catch (e) {}

    /* ---- 元素状态徽标：灼烧 / 寒霜 ----
     * 火焰/冰霜僵尸的元素效果此前零实装，玩家被打死都不知道为什么。
     * 这里在主角头顶挂出计时徽标，效果可读、可预期。 */
    try {
      let bx = (r.px || 0) - 30, by = (r.py || 0) - 62;
      const badge = (txt, col, ratio) => {
        c.save();
        c.font = 'bold 11px system-ui,sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const w = 46;
        c.fillStyle = 'rgba(8,12,20,0.72)';
        c.fillRect(bx - w / 2, by - 8, w, 16);
        c.fillStyle = col;
        c.fillRect(bx - w / 2, by + 6, w * Math.max(0, Math.min(1, ratio)), 2);
        c.fillStyle = col;
        c.fillText(txt, bx, by);
        c.restore();
        by -= 20;
      };
      if (Number(r.wallBurnT) > 0) badge('🔥 灼烧', '#ff9a3c', Number(r.wallBurnT) / 3);
      if (Number(r.chillT) > 0) badge('❄️ 寒霜', '#5fd8ff', Number(r.chillT) / 2.5);
      if (Number(r.paraT) > 0) badge('⚡ 麻痹', '#c79bff', Number(r.paraT) / 0.8);
    } catch (e) {}

    /* 当前外观：优先皮肤立绘 → 角色立绘 → 头像立绘。
     * 这些都是深色底 JPG，统一走 SPR 抠底 + 轮廓光，避免"方纸片"。 */
    const skl = (window.EX && EX.skins ? EX.skins : []);
    const sk = skl.find((s) => s.id === (this.P && this.P.skin));
    const heroSrc = (sk && sk.img) || this.charImg || (this.P && this.P.avatarImg);
    const hsp = this.spriteMode ? SPR.get(heroSrc) : null;
    let heroDrawn = false;
    /* Q 版主角：按当前武器取对应贴图（图里已含枪械，故后续不再重画手持武器） */
    let heroChi = false;
    {
      let _g = null;
      try { _g = (typeof E !== 'undefined' && E.gun && this.P) ? E.gun(this.P) : null; } catch (e) { _g = null; }
      const _gid = (_g && (_g.id || _g.gun)) || (this.P && (this.P.gunId || this.P.gun)) || null;
      const _hk = (typeof CHIBI !== 'undefined' && CHIBI) ? (CHIBI.keyOfGun(_gid) || 'hero_base') : null;
      if (_hk && (CHIBI.ready(_hk) || CHIBI.ensure(_hk))) {
        const _hb = Math.sin((r.time || 0) * 4) * 1.2;
        this.shadow3d(c, r.px, r.py + 12, 22, 1);
        heroChi = CHIBI.draw(c, _hk, r.px, r.py + 12, 78, { bob: _hb });
        if (heroChi) heroDrawn = true;
      }
    }
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
      c.save();
      /* 3D 骨骼士兵：整体放大到与立绘一致（细节更清晰） */
      c.translate(r.px, r.py); c.scale(1.15, 1.15); c.translate(-r.px, -r.py);
      this.drawHeroShape(c, r.px, r.py);
      c.restore();
    }
    /* 手持武器：跟随瞄准方向旋转 + 后坐力 + 枪口火光
     * Q 版贴图里已经画了枪，再叠加一次会出现两把枪，故此处跳过。 */
    if (!heroChi) this.drawHeldGun(c, r, aim);
    /* 枪口环境照明：开火瞬间以玩家为中心向外照亮一小片地面与空气。
     * 此前枪口火光只是枪口那一小簇，画面其余部分完全不受影响，
     * 高射速武器连发时缺少「战场被火光映亮」的爽感。 */
    if (r.muzzleT > 0) {
      const ma = Math.min(1, r.muzzleT / 0.07);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const mr = 124, my = r.py - 14;
      const mg = c.createRadialGradient(r.px, my, 0, r.px, my, mr);
      mg.addColorStop(0, 'rgba(255,206,128,' + (0.30 * ma).toFixed(3) + ')');
      mg.addColorStop(0.42, 'rgba(255,164,72,' + (0.13 * ma).toFixed(3) + ')');
      mg.addColorStop(1, 'rgba(255,130,40,0)');
      c.fillStyle = mg;
      c.beginPath(); c.arc(r.px, my, mr, 0, 7); c.fill();
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

    /* 飘字：弹出弹跳 + 双层描边 + 元素配色，让每段伤害都读得清、看得爽 */
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const f of r.floats) {
      const al = Math.max(0, f.life / 0.7);
      const fs = this.depthScale(f.y);
      /* 出现瞬间弹一下再回落（0.7s 寿命的前 0.18s），打击感来源之一 */
      const age = 0.7 - f.life;
      const pop = age < 0.18 ? 1 + (1 - age / 0.18) * 0.45 : 1;
      const px = (f.cls === 'crit' ? 19 : f.cls === 'hurt' ? 15 : 14) * fs * pop;
      c.font = 'bold ' + px.toFixed(1) + 'px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
      c.globalAlpha = Math.min(1, al * 1.35);
      /* 双层描边：外层黑（保证在任何场景上都读得清）+ 内层亮（勾边提亮） */
      c.lineJoin = 'round';
      c.lineWidth = Math.max(2.5, px * 0.28); c.strokeStyle = 'rgba(0,0,0,.85)';
      c.strokeText(f.v, f.x, f.y);
      if (f.cls === 'crit') {
        c.lineWidth = Math.max(1, px * 0.09); c.strokeStyle = 'rgba(255,255,255,.55)';
        c.strokeText(f.v, f.x, f.y);
      }
      c.fillStyle = f.cls === 'crit' ? '#ff5a72' : f.cls === 'hurt' ? '#ff8fa4' : '#ffe9a8';
      c.fillText(f.v, f.x, f.y);
      c.globalAlpha = 1;
    }

    /* 氛围层 B：飘浮灰烬 + 暗角（画在最顶层，覆盖全画面，不参与遮挡关系） */
    {
      const _nt = (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();
      const _dt = this._ambT ? Math.max(0, Math.min(0.05, (_nt - this._ambT) / 1000)) : 0.016;
      this._ambT = _nt;
      this.drawAmbient(c, W, H, r.time || 0, _dt);
    }

    /* 屏幕震动收尾：与 draw() 开头的 save/translate 配对 */
    if (_shk) c.restore();
  },
};

/* 摇杆已移除：保留字段仅为兼容旧调用，不再驱动移动 */
BT.joy = { x: 0, y: 0 };
BT.speed = 1;
BT.auto = true;
/* 战斗内 3D 卡片（僵尸/主角/武器）。关掉则退回原来的扁平+贴地阴影 */
BT.card3d = (window.EX && EX.CARD3D !== false);
/* true=使用平面立绘（纸片感），false=使用真 3D 骨骼模型（会动，默认） */
BT.spriteMode = false;
window.BT = BT;
