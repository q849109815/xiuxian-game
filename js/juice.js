/* ==========================================================================
 * JUICE —— 打击感 / 爽感引擎
 * --------------------------------------------------------------------------
 * 存在意义：本项目此前"能玩但不好玩"的根因不是数值，而是**反馈缺失**。
 *   实测改造前的战斗反馈清单：
 *     · 顿帧（hitstop）        —— 全项目 0 处，命中与击杀毫无"卡肉感"
 *     · 慢镜头（slow-mo）      —— 全项目 0 处，BOSS 死亡与普通僵尸完全一样
 *     · 震屏幅度               —— 仅开火触发，amp 上限 1.7px、时长 0.09s（几乎看不见）
 *     · 连杀 combo             —— noHitStreak 有统计但**从不显示、从不给收益**
 *     · 全屏闪                 —— 0 处，玩家受伤 / 爆炸没有任何画面冲击
 *   结果是：玩家打不打得死全靠看血条，操作没有任何"手感回报"。
 *
 * 本模块是纯表现层，**不改变任何战斗数值的判定逻辑**（伤害、血量、掉落概率
 * 全部原样），只做三件事：
 *   1) 时间控制：顿帧 / 慢镜头（只缩放 dt，不改状态机）
 *   2) 画面冲击：震屏 / 全屏闪
 *   3) 连杀系统：combo 计数 + 分级反馈 + 金币倍率（唯一影响数值的项，且封顶）
 *
 * 安全约束：
 *   · 全部 try/catch 包裹，任一环节异常都不影响战斗推进；
 *   · 不引用任何外部可选依赖（SND / UI / VO 缺失时静默跳过）；
 *   · 每局开始必须 reset()，不会跨局残留；
 *   · 顿帧有最小间隔节流，成片清怪时不会连续卡死帧率。
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- 可调参数（集中在此，方便手感调优） ---------- */
  var CFG = {
    /* 连杀窗口：多久没击杀就断连（秒）。用真实时间，不受倍速/顿帧影响。 */
    COMBO_WIN: 2.6,
    /* 连杀金币加成：每 1 连杀 +0.8%，封顶 60 连杀 → 最高 ×1.48 */
    COMBO_GOLD_STEP: 0.008,
    COMBO_GOLD_CAP: 60,
    /* 连杀里程碑：达到时给一次强反馈（音效 + 震屏 + 文案） */
    MILESTONE: [5, 10, 20, 35, 50, 75, 100, 150, 200],
    /* 顿帧：时长(秒) / 时间缩放(0=完全冻结) / 最小触发间隔(秒) */
    STOP_KILL: { d: 0.030, s: 0.06, gap: 0.11 },
    STOP_CRIT: { d: 0.038, s: 0.05, gap: 0.16 },
    STOP_HURT: { d: 0.055, s: 0.12, gap: 0.20 },
    STOP_BOSS: { d: 0.090, s: 0.04, gap: 0 },
    /* 震屏：幅度(px) / 时长(秒)。叠加时取较大值，不无限累加。 */
    SHAKE_KILL: 2.2, SHAKE_CRIT: 3.4, SHAKE_HURT: 8.0,
    SHAKE_BLAST: 9.0, SHAKE_BOSS: 18.0, SHAKE_MILE: 7.0,
    /* 慢镜头 */
    SLOW_BOSS: { d: 0.55, s: 0.28 },
    /* 【V1.3.2 · 低机型性能降级】
     * 画质档位 2=高 / 1=中 / 0=低。仅削减表现层（震屏/全屏闪/DOM 刷新频率），
     * 绝不改变战斗逻辑与返回的缩放系数 k——降级后玩法与高画质完全一致。 */
    PERF: {
      auto: true,      /* 是否自动降级 */
      win: 90,         /* 采样窗口帧数 */
      lowFps: 45,      /* 低于此值降一档 */
      critFps: 30,     /* 低于此值直接降到最低档 */
      minFrames: 30,   /* 至少攒够多少帧才开始判定，避免开局抖动误判 */
      shakeMul: [0.40, 0.70, 1.00],  /* 按档位缩放震屏幅度：低/中/高 */
      paintEvery: [2, 1, 1],         /* 按档位：每 N 帧刷一次 DOM */
      flashOn: [false, true, true],  /* 低画质关闭全屏闪（最耗的一项） */
    },
  };

  /* 连杀分级：颜色 + 称号。分级只影响观感，不影响倍率。 */
  var TIERS = [
    { n: 0, cls: 't0', tag: '' },
    { n: 5, cls: 't1', tag: '压制' },
    { n: 10, cls: 't2', tag: '狂热' },
    { n: 20, cls: 't3', tag: '血洗' },
    { n: 35, cls: 't4', tag: '屠戮' },
    { n: 50, cls: 't5', tag: '灭世' },
  ];

  var J = {
    CFG: CFG,
    enabled: true,

    /* --- 时间 --- */
    tsT: 0, tsScale: 1,   /* 顿帧剩余 / 顿帧内时间缩放 */
    slT: 0, slScale: 1,   /* 慢镜头剩余 / 慢镜头缩放 */
    _tsGap: 0,            /* 顿帧节流计时 */

    /* --- 画面 --- */
    shT: 0, shDur: 0, shMag: 0, shX: 0, shY: 0,
    flT: 0, flDur: 0, flA: 0, flCol: '255,255,255',

    /* --- 连杀 --- */
    combo: 0, comboT: 0, comboBest: 0, comboTier: 0, comboPop: 0,

    /* --- 画质档位（低机型降级）--- */
    q: 2, autoQ: true, _fs: [], _pN: 0, _qLog: 0,

    /* --- DOM 缓存 --- */
    _dom: null, _flash: null, _shown: -1, _cls: '', _mulTxt: '',

    /* ================= 生命周期 ================= */
    reset() {
      this.tsT = 0; this.tsScale = 1; this.slT = 0; this.slScale = 1; this._tsGap = 0;
      this.shT = 0; this.shDur = 0; this.shMag = 0; this.shX = 0; this.shY = 0;
      this.flT = 0; this.flDur = 0; this.flA = 0;
      this.combo = 0; this.comboT = 0; this.comboBest = 0; this.comboTier = 0; this.comboPop = 0;
      this._shown = -1; this._cls = ''; this._mulTxt = '';
      this._fs.length = 0;      /* 画质档位本身不重置：它是设备级设定 */
      this._paint(true);
    },

    /* ================= 画质档位（低机型降级）=================
     * 只削表现层，不改战斗逻辑。frame() 返回的缩放系数 k 与档位无关。 */
    getQ() { return this.q; },
    /** 强制设定档位 0/1/2，并关闭自动降级（后台或玩家手动指定时） */
    setQ(n, keepAuto) {
      n = Math.max(0, Math.min(2, n | 0));
      this.q = n;
      if (!keepAuto) this.autoQ = false;
      this._fs.length = 0;
      return n;
    },
    /** 根据采样窗口内的真实帧间隔自动降档。只降不升，避免档位反复横跳。 */
    _autoQ(d) {
      if (!this.autoQ || !CFG.PERF.auto) return;
      if (!(d > 0)) return;
      var W = CFG.PERF;
      var fs = this._fs;
      fs.push(d);
      if (fs.length > W.win) fs.shift();
      if (fs.length < W.minFrames || this.q === 0) return;
      var sum = 0;
      for (var i = 0; i < fs.length; i++) sum += fs[i];
      var fps = fs.length / sum;
      if (fps < W.critFps) {
        this.q = 0; this._fs.length = 0;
      } else if (fps < W.lowFps) {
        this.q = Math.max(0, this.q - 1); this._fs.length = 0;
      }
    },

    /* ================= 时间控制 ================= */
    /** 顿帧：极短时间内把世界时间压到接近 0，制造"卡肉" */
    stop(d, s, gap) {
      if (!this.enabled) return;
      if (gap) {
        if (this._tsGap > 0) return;
        this._tsGap = gap;
      }
      if (d > this.tsT) this.tsT = d;
      if (s < this.tsScale) this.tsScale = s;
    },
    /** 慢镜头：比顿帧长，用于 BOSS 死亡等演出 */
    slow(d, s) {
      if (!this.enabled) return;
      if (d > this.slT) this.slT = d;
      if (s < this.slScale) this.slScale = s;
    },

    /* ================= 画面冲击 ================= */
    /** 震屏：取较大值而非累加，避免爆炸叠加把画面甩飞 */
    shake(mag, dur) {
      if (!this.enabled) return;
      if (!(mag > 0)) return;
      var m = mag * (CFG.PERF.shakeMul[this.q] || 1);
      if (m > this.shMag) this.shMag = m;
      if (dur > this.shT) { this.shT = dur; this.shDur = dur; }
    },
    /** 全屏闪：col 为 "r,g,b" 字符串。低画质档直接跳过（全屏重绘最耗） */
    flash(col, a, dur) {
      if (!this.enabled) return;
      if (!CFG.PERF.flashOn[this.q]) return;
      if (a <= this.flA && this.flT > 0) return;
      this.flCol = col || '255,255,255';
      this.flA = a; this.flT = dur || 0.16; this.flDur = this.flT;
    },

    /* ================= 每帧推进 =================
     * 用【真实 dt】推进（不受顿帧影响），返回本帧战斗逻辑应使用的缩放系数。
     * 必须在 battle 主循环里、tick() 之前调用一次。 */
    frame(dtReal) {
      try {
        var d = Math.min(0.05, Math.max(0, dtReal || 0));

        /* 【V1.3.2】低机型自动降档：只削表现层，k 的计算在下方，不受影响 */
        this._autoQ(d);

        if (this._tsGap > 0) this._tsGap = Math.max(0, this._tsGap - d);

        var k = 1;
        if (this.tsT > 0) { this.tsT -= d; k = this.tsScale; if (this.tsT <= 0) this.tsScale = 1; }
        if (this.slT > 0) { this.slT -= d; k *= this.slScale; if (this.slT <= 0) this.slScale = 1; }

        /* 震屏：按剩余时间线性衰减，高频抖动（用随机而非正弦，更有冲击力） */
        if (this.shT > 0) {
          this.shT = Math.max(0, this.shT - d);
          var amp = this.shMag * (this.shDur > 0 ? (this.shT / this.shDur) : 0);
          amp = amp * amp * 0.75 + amp * 0.25;      /* 后段衰减更快，收得干净 */
          this.shX = (Math.random() * 2 - 1) * amp;
          this.shY = (Math.random() * 2 - 1) * amp * 0.72;
          if (this.shT <= 0) { this.shMag = 0; this.shX = 0; this.shY = 0; }
        } else { this.shX = 0; this.shY = 0; }

        /* 全屏闪 */
        var flEnd = false;
        if (this.flT > 0) { this.flT = Math.max(0, this.flT - d); if (this.flT <= 0) { this.flA = 0; flEnd = true; } }

        /* 连杀窗口 */
        if (this.comboT > 0) {
          this.comboT = Math.max(0, this.comboT - d);
          if (this.comboT <= 0) { this.combo = 0; this.comboTier = 0; }
        }

        /* 低画质档降频刷 DOM；但闪光结束那一帧必须刷一次，否则残留半透明遮罩 */
        this._pN++;
        var every = CFG.PERF.paintEvery[this.q] || 1;
        if (flEnd || this._pN % every === 0) this._paint(false);
        return k;
      } catch (e) {
        return 1;                       /* 兜底：绝不因表现层异常卡住战斗 */
      }
    },

    /* ================= 事件钩子 ================= */

    /** 击杀：返回本只怪的金币倍率（1.0 ~ 1.48） */
    onKill(z, r) {
      try {
        if (!this.enabled) return 1;
        var isBoss = !!(z && (z.isBoss || (z.d && z.d.boss)));

        this.combo++;
        this.comboT = CFG.COMBO_WIN;
        this.comboPop = 1;
        if (this.combo > this.comboBest) this.comboBest = this.combo;

        /* 分级升级 → 里程碑强反馈 */
        var ti = 0;
        for (var i = TIERS.length - 1; i >= 0; i--) { if (this.combo >= TIERS[i].n) { ti = i; break; } }
        var up = ti > this.comboTier;
        this.comboTier = ti;

        if (isBoss) {
          /* BOSS 死亡演出：长顿帧 + 慢镜头 + 大震屏 + 白闪 */
          this.stop(CFG.STOP_BOSS.d, CFG.STOP_BOSS.s, 0);
          this.slow(CFG.SLOW_BOSS.d, CFG.SLOW_BOSS.s);
          this.shake(CFG.SHAKE_BOSS, 0.55);
          this.flash('255,255,255', 0.72, 0.34);
          /* 【AU-02】BOSS 死亡专用音效，此前误用 levelup（升级音） */
          this._snd('boss');
          this._say('击杀 BOSS！');
        } else {
          this.stop(CFG.STOP_KILL.d, CFG.STOP_KILL.s, CFG.STOP_KILL.gap);
          this.shake(CFG.SHAKE_KILL, 0.12);
          /* 【AU-02】普通击杀补 kill 音效，按顿帧节流窗口去重，成片清怪不糊
           * 注意：CFG.STOP_*.gap 单位是「秒」，此处需 ×1000 转毫秒 */
          this._sndGap('kill', Math.max(80, (CFG.STOP_KILL.gap || 0.11) * 1000));
        }

        if (up && ti > 0) {
          var tg = TIERS[ti].tag;
          this.shake(CFG.SHAKE_MILE, 0.26);
          this.flash('255,190,90', 0.30, 0.26);
          /* 【AU-02】连杀里程碑用 upgrade（突破感），里程碑本身稀疏不节流 */
          this._snd('upgrade');
          this._say(this.combo + ' 连杀 · ' + tg);
        }

        /* 金币倍率（封顶，不会破坏经济） */
        return this.goldMul();
      } catch (e) { return 1; }
    },

    /** 命中：暴击给额外顿帧与火花色闪 */
    onHit(dmg, crit) {
      try {
        if (!this.enabled) return;
        if (!crit) return;
        this.stop(CFG.STOP_CRIT.d, CFG.STOP_CRIT.s, CFG.STOP_CRIT.gap);
        this.shake(CFG.SHAKE_CRIT, 0.11);
        /* 【AU-02】暴击用专用 crit 音效（金属高音），非普通 hit（gap 秒→毫秒） */
        this._sndGap('crit', Math.max(80, (CFG.STOP_CRIT.gap || 0.16) * 1000));
      } catch (e) {}
    },

    /** 玩家（防线）受伤：横甩 + 红闪，让玩家立刻知道自己掉血了 */
    onPlayerHurt(dmg) {
      try {
        if (!this.enabled) return;
        this.stop(CFG.STOP_HURT.d, CFG.STOP_HURT.s, CFG.STOP_HURT.gap);
        this.shake(CFG.SHAKE_HURT, 0.30);
        this.flash('255,70,60', 0.30, 0.24);
        /* 【AU-02】受伤是最强的警示音，不节流（错过一次就可能漏掉掉血） */
        this._snd('hurt');
      } catch (e) {}
    },

    /** 爆炸 / 油桶 / 自爆 */
    onBlast(radius) {
      try {
        if (!this.enabled) return;
        var rr = Number(radius) || 72;
        var m = CFG.SHAKE_BLAST * Math.min(1.6, rr / 72);
        this.shake(m, 0.30);
        this.flash('255,180,90', 0.26, 0.20);
        this.stop(0.030, 0.10, 0.14);
        /* 【AU-02】爆炸补 explode 音效，连锁爆炸时段节流去重 */
        this._sndGap('explode', 140);
      } catch (e) {}
    },

    /** 波次推进 / BOSS 登场 */
    onWave(n) {
      try {
        if (!this.enabled) return;
        this.shake(6, 0.34);
        this.flash('255,150,60', 0.22, 0.26);
        /* 【AU-02】波次推进补 wave 音效（每波一次，无需节流） */
        this._snd('wave');
        this._say((window.EX && EX.tip ? EX.tip('sys.waveIn', { v: n }) : ('第 ' + n + ' 波')));
      } catch (e) {}
    },

    /* ================= 查询 ================= */
    goldMul() {
      var c = Math.min(CFG.COMBO_GOLD_CAP, this.combo || 0);
      return 1 + c * CFG.COMBO_GOLD_STEP;
    },
    tierCls() {
      var t = TIERS[this.comboTier] || TIERS[0];
      return t.cls;
    },
    /** 供 draw() 叠加到既有震屏之上 */
    offset() { return [this.shX, this.shY]; },

    /* ================= 私有 ================= */
    _snd(n) { try { if (global.SND && SND.play) SND.play(n); } catch (e) {} },

    /**
     * 【音频部 AU-02 · 带节流音效】
     * 成片清怪时每只都响会糊成噪音，故按 name 各自节流：
     * 同一音效在 gapMs 内只触发一次（首次必响，保证首杀/首暴击听得到）。
     */
    _sndGap(n, gapMs) {
      try {
        if (!global.SND || !SND.play) return;
        var now = (global.performance && performance.now) ? performance.now() : Date.now();
        if (!this._sndAt) this._sndAt = {};
        var last = this._sndAt[n] || 0;
        if (now - last < (gapMs || 0)) return;
        this._sndAt[n] = now;
        SND.play(n);
      } catch (e) {}
    },
    _say(t) {
      try {
        if (global.UI && UI.toast) UI.toast(t, 'ok');
        else if (global.UI && UI.btTalk) UI.btTalk(t);
      } catch (e) {}
    },

    _domGet() {
      if (this._dom) return this._dom;
      try {
        var w = document.getElementById('juiceCombo');
        var f = document.getElementById('juiceFlash');
        this._dom = {
          w: w,
          n: w && document.getElementById('jcNum'),
          b: w && document.getElementById('jcBar'),
          m: w && document.getElementById('jcMul'),
        };
        this._flash = f;
      } catch (e) { this._dom = {}; }
      return this._dom;
    },

    /** 把内部状态刷到 DOM。force=true 时强制全量刷新（reset 用） */
    _paint(force) {
      try {
        var d = this._domGet();
        if (!d) return;

        /* 连杀 HUD */
        if (d.w) {
          var show = this.combo >= 2 && this.comboT > 0;
          if (force || show !== (this._shown === 1)) {
            d.w.classList.toggle('on', !!show);
            this._shown = show ? 1 : 0;
          }
          if (show) {
            if (force || this.combo !== this._lastN) {
              d.w.classList.remove('t0', 't1', 't2', 't3', 't4', 't5');
              d.w.classList.add(this.tierCls());
              this._lastN = this.combo;
            }
            if (d.n && this._nTxt !== String(this.combo)) {
              d.n.textContent = this.combo;
              this._nTxt = String(this.combo);
              /* 弹跳：先放大再回弹 */
              d.w.style.transform = 'translateX(-50%) scale(1.34)';
              var el = d.w;
              if (this._raf) cancelAnimationFrame(this._raf);
              this._raf = requestAnimationFrame(function () {
                requestAnimationFrame(function () { el.style.transform = 'translateX(-50%) scale(1)'; });
              });
            }
            if (d.b) {
              var p = this.comboT / CFG.COMBO_WIN;
              d.b.style.transform = 'scaleX(' + Math.max(0, Math.min(1, p)).toFixed(3) + ')';
            }
            if (d.m) {
              var t = '金币 ×' + this.goldMul().toFixed(2);
              if (t !== this._mulTxt) { d.m.textContent = t; this._mulTxt = t; }
            }
          }
        }

        /* 全屏闪 */
        if (this._flash) {
          var a = this.flT > 0 ? (this.flA * (this.flDur > 0 ? this.flT / this.flDur : 1)) : 0;
          var s = this._flash.style;
          if (a > 0.002) {
            s.background = 'rgb(' + this.flCol + ')';
            s.opacity = a.toFixed(3);
          } else if (s.opacity !== '0') {
            s.opacity = '0';
          }
        }
      } catch (e) {}
    },
  };

  global.JUICE = J;
})(window);
