/* ==========================================================================
 * BTFX —— 战斗视觉强化层（V1.3.97）
 * --------------------------------------------------------------------------
 * 立规原因：V1.3.96 把「静态氛围」补齐了（营火、图标光晕、CSS 能量环），
 *   但真实 Chrome 逐屏取证暴露出战斗态仍不够「炫」：
 *     ① 场景被冷青紫透视网格铺满，与末日废土棕褐主色割裂；
 *     ② 技能专属特效（蘑菇云/冰棱/电磁钻/射线）锚在玩家脚下 y≈794，
 *       大半被底部 HUD 盖住，玩家根本看不见自己放了大招；
 *     ③ 子弹、命中、击杀缺少持续的元素色辉光与拖尾；
 *     ④ 技能释放没有「全屏级」冲击，画面亮度从头到尾一个样。
 *
 * 本模块是**纯表现层**：只读取 BT.run 的既有字段，只往 canvas 上画、
 * 只切一个 DOM class；不写任何战斗状态、不改动伤害/血量/掉落/冷却，
 * 不新增任何文案。整段移除（或 window.BTFX = null）即可逐字节回退。
 *
 * 安全约束：
 *   · 全部 try/catch，任一环节异常都不影响 draw() 与战斗推进；
 *   · 每局 reset，不跨局残留；粒子/光尘有硬上限，低画质自动减量；
 *   · prefers-reduced-motion 下停用全部动态特效（只留静态柔光）；
 *   · 不依赖任何可选库，SND / JUICE / CSS 缺失时静默降级。
 * ========================================================================== */
(function (global) {
  'use strict';

  /* 元素语义色 —— 与 config.js EX.elements 同色系，但拆成 rgb 便于做 alpha */
  var EL = {
    '火': { r: 255, g: 122, b: 56,  core: '255,214,150' },
    '冰': { r: 92,  g: 216, b: 255, core: '225,248,255' },
    '电': { r: 192, g: 140, b: 255, core: '238,222,255' },
    '风': { r: 123, g: 232, b: 160, core: '220,255,232' },
    '毒': { r: 143, g: 209, b: 79,  core: '228,255,190' },
    '物': { r: 255, g: 215, b: 106, core: '255,240,200' },
    '暗': { r: 168, g: 132, b: 255, core: '226,210,255' },
  };
  function col(el) { return EL[el] || EL['物']; }
  function rgba(o, a) { return 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + a.toFixed(3) + ')'; }

  var S = {
    dust: [], parts: [], flash: null, lastEl: '物',
    seen: 0, t: 0, reduce: false, low: false, runRef: null, ready: false,
    casts: 0,   /* 全屏冲击累计触发次数：供取证读取，不受 460ms 时序影响 */
  };

  function init() {
    if (S.ready) return;
    S.ready = true;
    try {
      S.reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { S.reduce = false; }
    /* 低画质档：JUICE 暴露 level 时减半粒子，没有就按正常档 */
    try {
      var lv = global.JUICE && global.JUICE.perf && global.JUICE.perf.level;
      S.low = (typeof lv === 'number' && lv <= 0);
    } catch (e) { S.low = false; }
    /* 常驻元素光尘：缓慢上浮、轻微横摆，替代原先灰扑扑的灰烬观感 */
    var n = S.reduce ? 0 : (S.low ? 8 : 18);
    for (var i = 0; i < n; i++) {
      S.dust.push({
        x: Math.random(), y: Math.random(), r: 0.8 + Math.random() * 1.9,
        sp: 0.006 + Math.random() * 0.014, ph: Math.random() * 7,
        el: ['火', '冰', '电', '风', '物'][i % 5],
      });
    }
  }

  function reset(r) {
    S.parts.length = 0; S.flash = null; S.lastEl = '物'; S.seen = 0; S.runRef = r || null;
  }

  /* ---- 粒子：按元素分形态（圆火星 / 菱形冰晶 / 锯齿电弧 / 绿叶 / 金碎片） ---- */
  function spawn(x, y, el, n, power) {
    var o = col(el), cap = S.low ? 60 : 130;
    n = Math.min(n, cap - S.parts.length);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (0.7 + Math.random() * 1.5) * (power || 1);
      S.parts.push({
        x: x, y: y, vx: Math.cos(a) * v * 62, vy: Math.sin(a) * v * 46 - 26,
        life: 0.32 + Math.random() * 0.5, max: 0.82, sz: 1.2 + Math.random() * 2.6,
        rot: Math.random() * 7, spin: (Math.random() - 0.5) * 9,
        el: el, o: o, seed: Math.random(),
      });
    }
  }

  /* ---- 检测「新出现」的技能/命中特效，触发粒子与全屏冲击 ----
   * 不改动 efx 对象本身，只打一个自定义标记 _btfx；r.efx 每帧会被
   * 引擎 filter 重建，但对象引用仍在，标记天然跟着对象走。 */
  var BIG = { thermo: 1, cryo: 1, pierce: 1, ray: 1, nova: 1, boom: 1, levelup: 1, warn: 1, roar: 1 };
  /* MAJOR = 玩家主动释放的主技能。真实取证发现：温压弹（火）释放后，
   * 场上寒冰炮台自动打出的冰系 nova 会把全屏闪光覆盖成青白，
   * 玩家看不出自己放的是火系大招。伴随型 nova/boom 只补粒子，
   * 不抢闪光色；大范围 BOSS 级冲击波在无闪光时仍允许亮一下。 */
  var MAJOR = { thermo: 1, cryo: 1, pierce: 1, ray: 1, levelup: 1, warn: 1, roar: 1 };
  var SMALL = { crit: 1, die: 1, iceshatter: 1, hitWall: 1, chain: 1, heal: 1, shieldon: 1, coin: 1, shock: 1 };

  function scanEfx(r, W, H, dt) {
    var arr = r.efx || [];
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i];
      if (!f || f._btfx) continue;
      f._btfx = 1;
      var el = f.el || (f.t === 'cryo' || f.t === 'iceshatter' ? '冰'
        : f.t === 'pierce' || f.t === 'ray' || f.t === 'chain' || f.t === 'bolt' ? '电'
        : f.t === 'thermo' || f.t === 'boom' ? '火'
        : f.t === 'heal' || f.t === 'shieldon' ? '风' : S.lastEl);
      if (BIG[f.t]) {
        S.lastEl = el;
        /* 大招锚点若落在底部 HUD 区，向上镜像一份到可见战场中部，
           玩家才真能看见自己放了技能（原始 efx 位置一字不改）。 */
        var ax = f.x != null ? f.x : W * 0.5;
        var ay = f.y != null ? f.y : H * 0.5;
        var visY = ay > H * 0.72 ? Math.max(H * 0.30, ay - H * 0.46) : ay;
        if (!S.reduce) { spawn(ax, ay, el, 20, 1.35); spawn(ax, visY, el, 26, 1.7); }
        var major = !!MAJOR[f.t];
        var allow = major || !S.flash || (Number(f.r) || 0) >= 160;
        if (allow) {
          S.flash = { x: ax, y: visY, el: el, o: col(el), life: 0.48, max: 0.48,
            r: Math.max(90, f.r || 160), srcY: ay };
          S.casts++;
          domFlash(el);
        }
      } else if (SMALL[f.t] && !S.reduce && f.x != null) {
        spawn(f.x, f.y, el, f.t === 'die' ? 9 : 4, 0.7);
      }
    }
  }

  /* DOM 全屏闪光：canvas 会被底部 HUD 盖住，这层走 CSS 覆盖整个战斗界面，
   * 让技能释放的「一下亮起来」穿透 HUD，是本次「炫」最关键的一环。 */
  function domFlash(el) {
    if (S.reduce) return;
    try {
      var b = document.getElementById('battle'); if (!b) return;
      var o = col(el);
      b.style.setProperty('--fx-cast-rgb', o.r + ',' + o.g + ',' + o.b);
      b.classList.remove('fx-cast');
      /* 强制重排以重启动画，连续放技能时每次都能重新亮一下 */
      void b.offsetWidth;
      b.classList.add('fx-cast');
      clearTimeout(S._domT);
      S._domT = setTimeout(function () { try { b.classList.remove('fx-cast'); } catch (e) {} }, 520);
    } catch (e) {}
  }

  /* ---- 画布绘制 ---- */
  function drawDust(c, W, H, dt) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var i = 0; i < S.dust.length; i++) {
      var d = S.dust[i];
      d.y -= d.sp * dt * 10;
      if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      var x = d.x * W + Math.sin(S.t * 0.7 + d.ph) * 9;
      var y = d.y * H;
      var a = (0.20 + Math.sin(S.t * 2 + d.ph) * 0.12) * Math.min(1, Math.min(d.y, 1 - d.y) * 7 + 0.2);
      c.fillStyle = rgba(col(d.el), Math.max(0, a));
      c.beginPath(); c.arc(x, y, d.r, 0, 7); c.fill();
    }
    c.restore();
  }

  function drawAura(c, r, W, H) {
    var o = col(S.lastEl), px = r.px || W * 0.5, py = r.py || H * 0.8;
    var pulse = S.reduce ? 1 : (1 + Math.sin(S.t * 3.1) * 0.13);
    c.save(); c.globalCompositeOperation = 'lighter';
    /* 脚下双层能量环 */
    for (var s = 0; s < 2; s++) {
      var rr = (25 + s * 13) * pulse;
      c.strokeStyle = rgba(o, (0.30 - s * 0.12) * (S.reduce ? 0.7 : 1));
      c.lineWidth = s ? 1.2 : 2.2;
      c.beginPath(); c.ellipse(px, py + 10, rr, rr * 0.34, 0, 0, 7); c.stroke();
    }
    var g = c.createRadialGradient(px, py + 6, 0, px, py + 6, 54 * pulse);
    g.addColorStop(0, rgba(o, 0.20)); g.addColorStop(1, rgba(o, 0));
    c.fillStyle = g; c.beginPath(); c.arc(px, py + 6, 54 * pulse, 0, 7); c.fill();
    c.restore();
  }

  function drawWall(c, r, W, H) {
    var wy = r.wallY || H - 96, o = col(S.lastEl);
    c.save(); c.globalCompositeOperation = 'lighter';
    var g = c.createLinearGradient(0, wy - 7, 0, wy + 7);
    g.addColorStop(0, rgba(o, 0)); g.addColorStop(0.5, rgba(o, 0.30)); g.addColorStop(1, rgba(o, 0));
    c.fillStyle = g; c.fillRect(0, wy - 7, W, 14);
    c.strokeStyle = rgba(o, 0.34); c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(0, wy); c.lineTo(W, wy); c.stroke();
    /* 沿防线流动的光点 */
    if (!S.reduce) {
      for (var i = 0; i < 5; i++) {
        var x = ((S.t * 0.16 + i / 5) % 1) * W;
        c.fillStyle = rgba(o, 0.55);
        c.beginPath(); c.arc(x, wy, 1.8, 0, 7); c.fill();
      }
    }
    c.restore();
  }

  function drawBullets(c, r) {
    var bs = r.bullets || [], n = Math.min(bs.length, S.low ? 16 : 45);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var b = bs[i]; if (!b || !isFinite(b.x) || !isFinite(b.y)) continue;
      var el = b.el || r.gunEl || S.lastEl, o = col(el);
      var ang = isFinite(b.a) ? b.a
        : (isFinite(b.vx) && isFinite(b.vy)) ? Math.atan2(b.vy, b.vx)
        : Math.atan2(b.y - (r.py || 0), b.x - (r.px || 0));
      var len = 15 + Math.min(16, (Math.abs(b.vx || 0) + Math.abs(b.vy || 0)) * 0.03);
      var tx = b.x - Math.cos(ang) * len, ty = b.y - Math.sin(ang) * len;
      var g = c.createLinearGradient(tx, ty, b.x, b.y);
      g.addColorStop(0, rgba(o, 0)); g.addColorStop(1, rgba(o, 0.42));
      c.strokeStyle = g; c.lineWidth = Math.max(1.4, (b.r || 2) * 1.7); c.lineCap = 'round';
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(b.x, b.y); c.stroke();
      c.fillStyle = rgba(o, 0.75);
      c.beginPath(); c.arc(b.x, b.y, Math.max(1.6, (b.r || 2) * 1.05), 0, 7); c.fill();
    }
    c.restore();
  }

  function drawParts(c, dt) {
    var alive = [];
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var i = 0; i < S.parts.length; i++) {
      var p = S.parts[i];
      p.life -= dt; if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt;
      p.vx *= 0.985; p.rot += p.spin * dt;
      var al = Math.max(0, p.life / p.max);
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = rgba(p.o, al * 0.85);
      var sz = p.sz * (0.5 + al * 0.6);
      if (p.el === '冰') {
        c.beginPath(); c.moveTo(0, -sz * 1.8); c.lineTo(sz * 0.7, 0);
        c.lineTo(0, sz * 1.8); c.lineTo(-sz * 0.7, 0); c.closePath(); c.fill();
      } else if (p.el === '电') {
        c.strokeStyle = rgba(p.o, al * 0.9); c.lineWidth = Math.max(0.8, sz * 0.5);
        c.beginPath(); c.moveTo(-sz * 2, sz); c.lineTo(-sz * 0.4, -sz);
        c.lineTo(sz * 0.6, sz); c.lineTo(sz * 2, -sz); c.stroke();
      } else if (p.el === '风' || p.el === '毒') {
        c.beginPath(); c.ellipse(0, 0, sz * 1.5, sz * 0.6, 0, 0, 7); c.fill();
      } else {
        c.beginPath(); c.arc(0, 0, sz, 0, 7); c.fill();
      }
      c.restore();
      alive.push(p);
    }
    S.parts = alive;
    c.restore();
  }

  function drawFlash(c, W, H, dt) {
    var f = S.flash; if (!f) return;
    f.life -= dt; if (f.life <= 0) { S.flash = null; return; }
    var k = 1 - f.life / f.max, al = Math.max(0, f.life / f.max);
    c.save(); c.globalCompositeOperation = 'lighter';

    /* ① 升腾元素光柱：从玩家脚下（被 HUD 盖住）一路冲到战场可见区，
     *    让「放了大招」在纵向也有冲击，而不是只有脚下看不见的一团。 */
    var top = H * 0.16, bot = H * 0.78;
    var w = (16 + 34 * (1 - k)) * (0.6 + al * 0.7);
    var cg = c.createLinearGradient(f.x, bot, f.x, top);
    /* 元素色主导：若中段用近白 core，火/毒在 lighter 叠加下会被冲成青白
     * （真实取证里火系温压弹曾整根发白），辨识度反而丢了。 */
    cg.addColorStop(0, rgba(f.o, al * 0.62));
    cg.addColorStop(0.42, rgba(f.o, al * 0.44));
    cg.addColorStop(0.82, 'rgba(' + f.o.core + ',' + (al * 0.20).toFixed(3) + ')');
    cg.addColorStop(1, rgba(f.o, 0));
    c.fillStyle = cg;
    c.beginPath();
    c.moveTo(f.x - w, bot); c.lineTo(f.x - w * 0.32, top);
    c.lineTo(f.x + w * 0.32, top); c.lineTo(f.x + w, bot);
    c.closePath(); c.fill();

    /* ② 中心径向光爆（提饱和：原 0.34 在真实截图里几乎看不见） */
    var R = f.r * (0.45 + k * 1.2);
    var g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(2, R));
    g.addColorStop(0, rgba(f.o, al * 0.58));
    g.addColorStop(0.38, rgba(f.o, al * 0.42));
    g.addColorStop(1, rgba(f.o, 0));
    c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, Math.max(2, R), 0, 7); c.fill();
    /* 近白核只留中心一小点，避免整片泛白吃掉元素色 */
    var wg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(2, R * 0.24));
    wg.addColorStop(0, 'rgba(' + f.o.core + ',' + (al * 0.72).toFixed(3) + ')');
    wg.addColorStop(1, 'rgba(' + f.o.core + ',0)');
    c.fillStyle = wg; c.beginPath(); c.arc(f.x, f.y, Math.max(2, R * 0.24), 0, 7); c.fill();

    /* ③ 双层冲击环：外圈元素色 + 内圈近白，速度错开 */
    for (var s = 0; s < 2; s++) {
      var rr = Math.max(2, R * (s ? 0.60 : 0.86) * (0.7 + k * 0.5));
      c.strokeStyle = s ? 'rgba(' + f.o.core + ',' + (al * 0.80).toFixed(3) + ')'
        : rgba(f.o, al * 0.72);
      c.lineWidth = Math.max(0.8, (s ? 2.0 : 4.2) * al);
      c.beginPath(); c.arc(f.x, f.y, rr, 0, 7); c.stroke();
    }
    /* ④ 屏幕边缘元素染色：让整个战场「被技能映亮」 */
    var eg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.26, W / 2, H / 2, Math.max(W, H) * 0.78);
    eg.addColorStop(0, rgba(f.o, 0)); eg.addColorStop(1, rgba(f.o, al * 0.30));
    c.fillStyle = eg; c.fillRect(0, 0, W, H);
    c.restore();
  }

  /* ---- 每帧入口：由 battle.js draw() 末尾调用一次 ---- */
  function frame(c, r) {
    if (!c || !r || r.over) return;
    try {
      init();
      if (S.runRef !== r) reset(r);
      var BT = global.BT || {};
      var W = BT.W || c.canvas.clientWidth || 393;
      var H = BT.H || c.canvas.clientHeight || 852;
      var dt = Math.min(0.05, Math.max(0.001, r._btfxDt || 0.016));
      S.t += dt;
      scanEfx(r, W, H, dt);
      drawDust(c, W, H, dt);
      drawBullets(c, r);
      drawAura(c, r, W, H);
      drawWall(c, r, W, H);
      drawParts(c, dt);
      drawFlash(c, W, H, dt);
    } catch (e) { /* 表现层绝不影响战斗 */ }
  }

  global.BTFX = { frame: frame, reset: reset, state: S, EL: EL,
    /* 供变异验证与调试读取：本帧是否真的触发过全屏冲击 */
    lastFlash: function () { return S.flash; },
    castCount: function () { return S.casts; },
    domClass: function () { try { return document.getElementById('battle').className; } catch (e) { return ''; } } };
})(typeof window !== 'undefined' ? window : this);
