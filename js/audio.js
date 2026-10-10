/* =========================================================
 * audio.js —— 程序化音频（Web Audio 实时合成，零音频文件）
 * 末日题材：低频压抑 BGM + 枪械/爆炸/丧尸音效
 * ========================================================= */

const SND = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  on: true, musicOn: true, sfxOn: true,
  volMusic: 0.28, volSfx: 0.5,
  curBgm: null, bgmTimer: null, started: false,

  /* 浏览器要求用户交互后才能起音 */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.volMusic;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.volSfx;
    this.sfxGain.connect(this.master);
    this.started = true;
    /* 恢复玩家上次的音频设置（此前从不保存，每次刷新都回到默认全开） */
    this.loadCfg();
    this.applyCfg();
  },

  /* ---------- 基础发声器 ---------- */
  tone(freq, dur, opt = {}) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + dur);
    const v = (opt.vol == null ? 0.3 : opt.vol);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + (opt.atk || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(opt.bus || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  },

  /* 噪声（枪声/爆炸/脚步） */
  noise(dur, opt = {}) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = opt.filter || 'lowpass';
    f.frequency.setValueAtTime(opt.freq || 1200, t);
    if (opt.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, opt.freqTo), t + dur);
    const g = this.ctx.createGain();
    const v = (opt.vol == null ? 0.3 : opt.vol);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(opt.bus || this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  },

  /* ---------- 音效库 ---------- */
  play(name) {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'shoot':                       // 枪声：短促噪声爆
        this.noise(0.09, { freq: 2600, freqTo: 500, vol: 0.22 });
        this.tone(180, 0.07, { type: 'square', to: 60, vol: 0.1 });
        break;
      case 'shotgun':
        this.noise(0.22, { freq: 1500, freqTo: 200, vol: 0.32 });
        this.tone(90, 0.2, { type: 'square', to: 40, vol: 0.16 });
        break;
      case 'reload':                      // SX_002 换弹开始：两声金属咔
        this.tone(820, 0.05, { type: 'square', vol: 0.12 });
        setTimeout(() => this.tone(620, 0.07, { type: 'square', vol: 0.12 }), 120);
        break;
      case 'reloadDone':                  // SX_012 换弹完成：上扬确认音
        this.tone(520, 0.06, { type: 'triangle', vol: 0.13 });
        setTimeout(() => this.tone(780, 0.09, { type: 'triangle', vol: 0.15 }), 90);
        break;
      case 'hit':                         // 命中肉体
        this.noise(0.06, { freq: 700, freqTo: 200, vol: 0.14 });
        break;
      case 'crit':                        // 暴击：金属高音
        this.tone(1400, 0.1, { type: 'square', to: 700, vol: 0.2 });
        this.noise(0.07, { freq: 3200, freqTo: 800, vol: 0.16 });
        break;
      case 'kill':                        // 击杀：低沉闷响
        this.noise(0.16, { freq: 500, freqTo: 90, vol: 0.2 });
        this.tone(120, 0.16, { type: 'sine', to: 50, vol: 0.14 });
        break;
      case 'start':                       // 表04 VO_001 进入战斗：低沉号角
        this.tone(160, 0.35, { type: 'sawtooth', to: 240, vol: 0.12 });
        setTimeout(() => this.tone(240, 0.3, { type: 'triangle', vol: 0.1 }), 180);
        break;
      case 'rare':                        // 表04 VO_010 稀有物品：三连上行
        this.tone(660, 0.09, { type: 'triangle', vol: 0.13 });
        setTimeout(() => this.tone(880, 0.09, { type: 'triangle', vol: 0.13 }), 90);
        setTimeout(() => this.tone(1320, 0.16, { type: 'triangle', vol: 0.15 }), 180);
        break;
      case 'burn':                        // 表04 VO_005 火焰僵尸灼烧：低频嘶嘶燃烧
        this.noise(0.5, { freq: 1200, freqTo: 300, vol: 0.2, filter: 'bandpass' });
        this.tone(220, 0.4, { type: 'sawtooth', to: 120, vol: 0.1 });
        break;
      case 'chill':                       // 表04 VO_006 冰霜僵尸寒气：清脆冰裂下行
        this.tone(1600, 0.12, { type: 'triangle', to: 900, vol: 0.14 });
        setTimeout(() => this.tone(1100, 0.16, { type: 'triangle', to: 500, vol: 0.12 }), 110);
        break;
      case 'explode':                     // 爆炸
        this.noise(0.55, { freq: 900, freqTo: 60, vol: 0.42, filter: 'lowpass' });
        this.tone(60, 0.5, { type: 'sine', to: 28, vol: 0.3 });
        break;
      case 'zombie':                      // 丧尸嘶吼
        this.tone(160, 0.35, { type: 'sawtooth', to: 80, vol: 0.1 });
        this.noise(0.3, { freq: 600, freqTo: 180, vol: 0.08 });
        break;
      case 'hurt':                        // 受伤
        this.tone(220, 0.16, { type: 'sawtooth', to: 90, vol: 0.22 });
        break;
      case 'boss':                        // BOSS 登场：低沉警告
        this.tone(70, 1.1, { type: 'sawtooth', to: 42, vol: 0.32 });
        this.tone(105, 1.0, { type: 'square', to: 60, vol: 0.14 });
        break;
      case 'levelup':                     // 升级：上行三音
        [523, 659, 784].forEach((f, i) =>
          setTimeout(() => this.tone(f, 0.22, { type: 'triangle', vol: 0.2 }), i * 90));
        break;
      case 'pick':                        // 拾取
        this.tone(880, 0.09, { type: 'sine', to: 1200, vol: 0.14 });
        break;
      case 'coin':
        this.tone(1046, 0.07, { type: 'triangle', vol: 0.14 });
        setTimeout(() => this.tone(1568, 0.1, { type: 'triangle', vol: 0.12 }), 70);
        break;
      /* 别名兼容
       * BUG：全项目 22 处调用写的是 'get'（16 处：购买/领奖/签到/好友/活动）与
       * 'pickup'（6 处：拾取掉落/开箱/背包使用），但音效表里只有 'coin' / 'pick'。
       * switch 无匹配 → 走 default → 静默无声。
       * 玩家买东西、领奖励、捡掉落物时听不到任何反馈音，却不会报错。
       * 这里补两个别名，比改 22 处调用点更安全（不影响后台热更配置）。 */
      case 'get':                         // 获得奖励：与 coin 同款上扬双音
        this.tone(1046, 0.07, { type: 'triangle', vol: 0.14 });
        setTimeout(() => this.tone(1568, 0.1, { type: 'triangle', vol: 0.12 }), 70);
        break;
      case 'pickup':                      // 拾取：与 pick 同款
        this.tone(880, 0.09, { type: 'sine', to: 1200, vol: 0.14 });
        break;
      /* 治疗音（角色天赋「战地急救」/ 支援武器医疗包回血时播放）
       * BUG：battle.js 调用 SND.play('heal')，但音效表里没有这一条 ——
       *   switch 无匹配 → 走 default → 静默无声，且不报错。
       *   玩家看到防线飘出绿色「+N」回血数字，却听不到任何反馈音。
       *   与 get/pickup 同类（调用了但不存在的音效名），这里补齐。
       * 音色取柔和上行小三度（660 → 880），与拾取的短促感区分开，
       *   音量压到 0.11：治疗每 8 秒触发一次，太响会盖过枪声。 */
      case 'heal':
        this.tone(660, 0.14, { type: 'sine', vol: 0.11 });
        setTimeout(() => this.tone(880, 0.18, { type: 'sine', vol: 0.1 }), 110);
        break;
      case 'win':                         // 胜利：大调琶音
        [523, 659, 784, 1046].forEach((f, i) =>
          setTimeout(() => this.tone(f, 0.4, { type: 'triangle', vol: 0.22 }), i * 130));
        break;
      case 'lose':                        // 失败：下行
        [392, 330, 262, 196].forEach((f, i) =>
          setTimeout(() => this.tone(f, 0.42, { type: 'sawtooth', vol: 0.2 }), i * 170));
        break;
      case 'click':
        this.tone(660, 0.05, { type: 'square', vol: 0.09 });
        break;
      case 'panel':
        this.tone(440, 0.09, { type: 'sine', to: 660, vol: 0.1 });
        break;
      case 'equip':
        this.tone(700, 0.1, { type: 'square', vol: 0.13 });
        setTimeout(() => this.tone(990, 0.14, { type: 'square', vol: 0.12 }), 90);
        break;
      case 'error':
        this.tone(200, 0.18, { type: 'square', to: 120, vol: 0.16 });
        break;
      case 'upgrade':                     // 强化成功
        [659, 880].forEach((f, i) =>
          setTimeout(() => this.tone(f, 0.3, { type: 'triangle', vol: 0.18 }), i * 110));
        break;
      case 'wave':                        // 新波次警报
        this.tone(330, 0.3, { type: 'square', vol: 0.16 });
        setTimeout(() => this.tone(440, 0.35, { type: 'square', vol: 0.16 }), 200);
        break;
      default: break;
    }
  },

  /* ---------- BGM：程序化循环 ---------- */
  /* 末日风格：小调低音 + 不和谐音程，营造压抑感 */
  bgm(name) {
    if (!this.ctx) return;
    if (this.curBgm === name) return;
    this.stopBgm();
    this.curBgm = name;
    if (!this.musicOn) return;
    const P = {
      base: { notes: [55, 65.4, 73.4, 82.4], step: 0.62, type: 'triangle', vol: 0.16 },
      battle: { notes: [58.3, 69.3, 77.8, 87.3], step: 0.34, type: 'sawtooth', vol: 0.14 },
      boss: { notes: [49, 58.3, 65.4, 73.4], step: 0.26, type: 'square', vol: 0.15 },
      endless: { notes: [61.7, 73.4, 82.4, 92.5], step: 0.30, type: 'sawtooth', vol: 0.13 },
    }[name] || null;
    if (!P) return;
    let i = 0;
    const tick = () => {
      if (!this.ctx || this.curBgm !== name || !this.musicOn) return;
      const f = P.notes[i % P.notes.length];
      /* 低音铺底 */
      this.tone(f, P.step * 1.7, { type: P.type, vol: P.vol, bus: this.musicGain, atk: 0.04 });
      /* 高音点缀 */
      if (i % 2 === 0) {
        this.tone(f * 4, P.step * 0.7, { type: 'sine', vol: P.vol * 0.35, bus: this.musicGain, atk: 0.02 });
      }
      /* 末日打击感 */
      if (i % 4 === 2) {
        this.noise(0.1, { freq: 400, freqTo: 80, vol: 0.07, bus: this.musicGain });
      }
      i++;
      this.bgmTimer = setTimeout(tick, P.step * 1000);
    };
    tick();
  },
  stopBgm() { if (this.bgmTimer) { clearTimeout(this.bgmTimer); this.bgmTimer = null; } this.curBgm = null; },

  setMusic(v) {
    this.musicOn = v;
    if (this.musicGain) this.musicGain.gain.value = v ? this.volMusic : 0;
    if (!v) this.stopBgm();
  },
  setSfx(v) {
    this.sfxOn = v;
    if (this.sfxGain) this.sfxGain.gain.value = v ? this.volSfx : 0;
  },
  setVol(m, s) {
    this.volMusic = m; this.volSfx = s;
    if (this.musicGain && this.musicOn) this.musicGain.gain.value = m;
    if (this.sfxGain && this.sfxOn) this.sfxGain.gain.value = s;
  },

  /* =========================================================
   * 音频设置持久化
   * BUG：SND 有完整的 musicOn / sfxOn / volMusic / volSfx 状态，
   * 但设置面板里根本没有音频入口，这些字段全项目零调用（除定义处）。
   * 结果：玩家无法关闭音乐/音效，也无法调音量，且状态从不保存。
   * 现在补上本地持久化，启动时恢复。
   * ========================================================= */
  SKEY: 'zb_snd_cfg',
  loadCfg() {
    try {
      const raw = localStorage.getItem(this.SKEY);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (typeof c.musicOn === 'boolean') this.musicOn = c.musicOn;
      if (typeof c.sfxOn === 'boolean') this.sfxOn = c.sfxOn;
      if (typeof c.volMusic === 'number') this.volMusic = Math.max(0, Math.min(1, c.volMusic));
      if (typeof c.volSfx === 'number') this.volSfx = Math.max(0, Math.min(1, c.volSfx));
    } catch (e) {}
  },
  saveCfg() {
    try {
      localStorage.setItem(this.SKEY, JSON.stringify({
        musicOn: this.musicOn, sfxOn: this.sfxOn,
        volMusic: this.volMusic, volSfx: this.volSfx,
      }));
    } catch (e) {}
  },
  /* 应用已加载的配置到增益节点（init 之后调用） */
  applyCfg() {
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? this.volMusic : 0;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxOn ? this.volSfx : 0;
  },
};

/* 首次交互解锁音频 */
(function () {
  const unlock = () => {
    SND.init();
    SND.applyCfg();
    if (SND.ctx && SND.musicOn) SND.bgm('base');
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  document.addEventListener('touchstart', unlock);
})();

window.SND = SND;


/* ============================================================
 * 表04_配音（VO）运行时
 * 此前全项目零配音：EX.VO 表根本不存在，所有反馈只有合成音效，
 * 没有任何台词/字幕，运营也无法替换或新增。
 * 现在按「触发场景」登记台词，并在这里提供统一播放入口：
 *   ① 若后台/美术提供了真实配音素材（EX.VO[].src）→ 播放人声
 *   ② 否则回退：播合成音效 + 出字幕（表04 的 txt 字段）
 * 素材缺失不会静默无声，也不会报错。
 * ============================================================ */
(function () {
  const VO = {
    on: true,
    cache: {},
    def(id) {
      const t = (typeof EX !== 'undefined' && Array.isArray(EX.VO)) ? EX.VO : [];
      return t.find((x) => x.id === id) || null;
    },
    /* 配音开关（设置页「音频」里可关） */
    setOn(v) { this.on = !!v; try { localStorage.setItem('zb_vo_on', v ? '1' : '0'); } catch (e) {} },
    loadOn() { try { this.on = localStorage.getItem('zb_vo_on') !== '0'; } catch (e) {} },
    say(id, opt) {
      const d = this.def(id);
      if (!d || !this.on) return false;
      try {
        /* ① 真实配音素材（美术按表04 dir 规则放入后自动生效） */
        if (d.src) {
          let a = this.cache[id];
          if (!a) { a = new Audio(d.src); a.preload = 'auto'; this.cache[id] = a; }
          a.currentTime = 0;
          a.volume = (opt && opt.vol != null) ? opt.vol : 0.85;
          const pr = a.play();
          if (pr && pr.catch) pr.catch(() => {});
        } else if (d.sfx && window.SND && SND.ctx && SND.sfxOn) {
          /* ② 回退：合成音效 */
          SND.play(d.sfx);
        }
      } catch (e) {}
      /* ③ 字幕：无论有没有人声都出，保证信息可达 */
      try {
        if (window.UI && UI.subtitle) UI.subtitle(d.txt || '', Number(d.dur) || 1.6);
      } catch (e) {}
      return true;
    },
  };
  VO.loadOn();
  if (typeof window !== 'undefined') window.VO = VO;
})();
