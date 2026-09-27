/* =========================================================================
 * chibi.js —— Q 版贴图资源层
 *
 * 作用：把二头身 Q 版立绘（assets/chibi/*.png，已抠底透明）接到战斗渲染上。
 * 设计要点：
 *   ① 纯增量 —— 贴图没加载好 / 加载失败 / 该种类没有贴图时，一律返回 null，
 *      渲染端自动退回原来的矢量骨骼画法，绝不会白屏或开天窗。
 *   ② 懒加载 —— 只有真正用到的种类才发请求，开局不拖慢。
 *   ③ 可预载 —— 进关前把本关怪物池 + 当前武器的图一次性拉齐。
 * ========================================================================= */
(function (root) {
  'use strict';

  var BASE = 'assets/chibi/';
  var CACHE = {};   /* key -> {im,w,h,ok} */
  var TRIED = {};   /* key -> 1  已经发起过请求 */

  /* 武器 id → 贴图名（与美术产出一一对应） */
  var GUNMAP = {
    W01: 'w01', W02: 'w02', W03: 'w03', W04: 'w04', W05: 'w05', W06: 'w06',
    W07: 'w07', W08: 'w08', W09: 'w09', W10: 'w10', W11: 'w11', W12: 'w12', W13: 'w13', W14: 'w14',
    S01: 's01', S02: 's02', S03: 's03', S04: 's04', S05: 's05', S06: 's06', S07: 's07', S08: 's08', S09: 's09', S10: 's10'
  };

  /* 开关：整体启用 / 停用（停用后完全走原来的矢量画法） */
  var ON = true;

  function ensure(key) {
    if (!ON || !key) return null;
    var c = CACHE[key];
    if (c) return c.ok ? c : null;
    if (TRIED[key]) return null;
    TRIED[key] = 1;
    var im = new Image();
    im.onload = function () {
      CACHE[key] = { im: im, w: im.naturalWidth || im.width, h: im.naturalHeight || im.height, ok: true };
    };
    im.onerror = function () { CACHE[key] = { im: null, ok: false }; };
    im.src = BASE + key + '.png';
    return null;
  }

  /* 预加载一批（幂等，重复调用无副作用） */
  function preload(keys) {
    if (!ON) return;
    for (var i = 0; i < (keys || []).length; i++) ensure(keys[i]);
  }

  /* 按怪物定义取贴图名：优先 def.chibi，其次按种类名猜（兼容旧数据） */
  function keyOfZombie(def) {
    if (!def) return null;
    if (def.chibi) return def.chibi;
    if (def.isBoss || def.boss) return def.chibiBoss || 'z_boss';
    return null;
  }

  function keyOfGun(id) {
    if (!id) return null;
    return GUNMAP[id] || null;
  }

  /* 画一个 Q 版单位：
   *   c     canvas ctx
   *   key   贴图名
   *   x,y   脚底接触点
   *   h     目标高度（像素）
   *   opt   {bob:上下起伏, tilt:左右倾斜弧度, alpha, flash:受击白闪 0~1}
   * 返回 true 表示已画（调用方据此跳过矢量画法） */
  function draw(c, key, x, y, h, opt) {
    var s = ensure(key);
    if (!s) return false;
    opt = opt || {};
    var w = h * (s.w / s.h);
    var bob = opt.bob || 0;
    var bx = x - w / 2, by = y - h + bob;
    if (opt.tilt) {
      c.save();
      c.translate(x, y);
      c.rotate(opt.tilt);
      c.translate(-x, -y);
    }
    if (opt.alpha != null && opt.alpha < 1) {
      c.save();
      c.globalAlpha = opt.alpha;
      c.drawImage(s.im, bx, by, w, h);
      c.restore();
    } else {
      c.drawImage(s.im, bx, by, w, h);
    }
    /* 受击白闪：叠加一层自身，用 lighter 提亮 */
    if (opt.flash > 0) {
      c.save();
      c.globalAlpha = Math.min(0.6, opt.flash);
      c.globalCompositeOperation = 'lighter';
      c.drawImage(s.im, bx, by, w, h);
      c.restore();
    }
    if (opt.tilt) c.restore();
    return true;
  }

  var API = {
    get BASE() { return BASE; },
    on: function (v) { if (v != null) ON = !!v; return ON; },
    ensure: ensure,
    preload: preload,
    keyOfZombie: keyOfZombie,
    keyOfGun: keyOfGun,
    draw: draw,
    has: function (k) { var c = CACHE[k]; return !!(c && c.ok); },
    ready: function (k) { var c = CACHE[k]; return !!(c && c.ok); },
    size: function (k) { var c = CACHE[k]; return (c && c.ok) ? { w: c.w, h: c.h } : null; },
    GUNMAP: GUNMAP
  };
  root.CHIBI = API;
  if (typeof window !== 'undefined') window.CHIBI = API;
})(typeof window !== 'undefined' ? window : this);
