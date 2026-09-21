/* =========================================================
 * audio.js —— 凡人修仙传 · 程序化音频引擎
 * 全部由 Web Audio API 实时合成，不依赖任何音频文件：
 *   · BGM：古风五声音阶（宫商角徵羽），5 种场景曲目
 *   · SFX：界面/战斗/系统音效，20 余种
 * 浏览器要求用户交互后才能启动，故首次点击时自动激活。
 * ========================================================= */

const AUDIO = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  on: true, musicOn: true, sfxOn: true, vol: 0.5,
  cur: null, timer: null, step: 0, started: false,

  /* ---------- 初始化 ---------- */
  init() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
      // 轻微混响：用短延迟反馈模拟殿堂感
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.34;
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.62;
      this.musicGain.connect(this.master); this.sfxGain.connect(this.master);
      return true;
    } catch (e) { return false; }
  },
  resume() {
    if (!this.init()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
  },
  setVol(v) {
    this.vol = v;
    if (this.master) this.master.gain.value = v;
    try { localStorage.setItem('xx_vol', String(v)); } catch (e) {}
  },

  /* ---------- 基础音色 ---------- */
  /** 古琴式拨弦：正弦基频 + 少量泛音，快速起音长衰减 */
  pluck(freq, t, dur = 1.4, gain = 0.5, type = 'sine') {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.musicGain);
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    o.connect(g); o.start(t); o.stop(t + dur);
    // 二次泛音，增添古琴的清亮
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(gain * 0.22, t + 0.006);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.55);
    g2.connect(this.musicGain);
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2;
    o2.connect(g2); o2.start(t); o2.stop(t + dur);
  },
  /** 笛/箫式长音：三角波 + 轻微颤音 */
  flute(freq, t, dur = 1.0, gain = 0.28) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.12);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // 颤音
    const lfo = c.createOscillator(); lfo.frequency.value = 5.2;
    const lg = c.createGain(); lg.gain.value = freq * 0.008;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + dur);
  },
  /** 底噪/风声 */
  pad(freq, t, dur = 3.0, gain = 0.10) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + dur);
  },
  /** 鼓点：噪声爆破 */
  drum(t, gain = 0.3, freq = 120) {
    const c = this.ctx;
    const len = 0.22, sr = c.sampleRate;
    const buf = c.createBuffer(1, sr * len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * 6;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.musicGain); src.start(t);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(gain * 0.8, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g2); g2.connect(this.musicGain); o.start(t); o.stop(t + 0.18);
  },

  /* ---------- 五声音阶（宫商角徵羽） ---------- */
  scale(base) {
    // 宫 商 角 徵 羽 → 半音间隔 0,2,4,7,9
    const steps = [0, 2, 4, 7, 9];
    const out = [];
    for (let oct = 0; oct < 3; oct++) for (const s of steps) out.push(base * Math.pow(2, (s + oct * 12) / 12));
    return out;
  },

  /* ---------- 曲目定义 ---------- */
  TRACKS: {
    // 主城/宗门：宁静古琴
    town: { base: 261.63, tempo: 1.15, mood: 'calm', desc: '主城 · 宁静古琴' },
    // 野外：轻柔山水
    wild: { base: 293.66, tempo: 1.0, mood: 'flow', desc: '野外 · 山水清音' },
    // 秘境：神秘悬疑
    dungeon: { base: 220.0, tempo: 0.85, mood: 'dark', desc: '秘境 · 幽深诡谲' },
    // 战斗：紧张激昂
    battle: { base: 329.63, tempo: 0.42, mood: 'fight', desc: '战斗 · 金戈激昂' },
    // 渡劫：宏大压迫
    trial: { base: 196.0, tempo: 0.55, mood: 'epic', desc: '渡劫 · 天威浩荡' },
  },

  /** 播放某曲（切换场景时调用） */
  play(name) {
    if (!this.on || !this.musicOn) return;
    if (!this.init()) return;
    if (this.cur === name && this.timer) return;
    this.stop();
    const tk = this.TRACKS[name];
    if (!tk) return;
    this.cur = name; this.step = 0;
    const notes = this.scale(tk.base);
    const beat = tk.tempo;
    const tick = () => {
      if (!this.ctx || this.cur !== name) return;
      const t = this.ctx.currentTime + 0.05;
      const s = this.step++;
      this.bar(t, tk, notes, s, beat);
    };
    tick();
    this.timer = setInterval(tick, beat * 1000 * 2);
  },
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.cur = null;
  },
  /** 一小节的音符编排 */
  bar(t, tk, notes, s, beat) {
    const m = tk.mood;
    const pick = (i) => notes[i % notes.length];
    if (m === 'calm') {
      // 缓慢散音，偶有高音点缀
      const seq = [0, 2, 4, 3, 5, 4, 2, 1];
      this.pluck(pick(seq[s % 8]), t, 1.6, 0.42);
      if (s % 4 === 2) this.flute(pick(seq[s % 8] + 5) * 2, t + beat * 0.5, 1.1, 0.16);
      if (s % 8 === 0) this.pad(tk.base / 2, t, beat * 6, 0.07);
    } else if (m === 'flow') {
      const seq = [0, 2, 3, 5, 7, 5, 3, 2];
      this.pluck(pick(seq[s % 8]), t, 1.2, 0.38);
      this.pluck(pick(seq[(s + 3) % 8] + 2), t + beat * 0.55, 0.9, 0.22);
      if (s % 4 === 0) this.flute(pick(seq[(s + 2) % 8] + 5) * 2, t, beat * 1.4, 0.14);
    } else if (m === 'dark') {
      const seq = [0, 1, 3, 2, 4, 3, 1, 0];
      this.pluck(pick(seq[s % 8]), t, 2.0, 0.34, 'triangle');
      if (s % 2 === 0) this.pad(tk.base / 2, t, beat * 3, 0.10);
      if (s % 6 === 3) this.pluck(pick(seq[s % 8]) / 2, t + beat * 0.4, 2.4, 0.20, 'sine');
    } else if (m === 'fight') {
      const seq = [7, 5, 4, 5, 7, 9, 7, 5];
      this.pluck(pick(seq[s % 8]), t, 0.5, 0.40);
      this.drum(t, 0.34, 130);
      if (s % 2 === 1) this.drum(t + beat * 0.5, 0.20, 170);
      if (s % 4 === 0) this.flute(pick(seq[s % 8]) * 2, t, beat * 0.8, 0.12);
    } else if (m === 'epic') {
      const seq = [0, 4, 7, 4];
      this.pad(tk.base / 2, t, beat * 3, 0.14);
      this.pluck(pick(seq[s % 4]), t, 2.2, 0.46);
      if (s % 4 === 0) this.drum(t, 0.45, 90);
      if (s % 4 === 2) { this.drum(t, 0.32, 90); this.drum(t + beat * 0.35, 0.26, 110); }
      if (s % 8 === 5) this.flute(pick(seq[s % 4] + 5) * 2, t, beat * 1.6, 0.20);
    }
  },

  /* ---------- 音效 ---------- */
  sfx(name) {
    if (!this.on || !this.sfxOn) return;
    if (!this.init()) return;
    const c = this.ctx, t = c.currentTime + 0.01;
    const beep = (f1, f2, dur, type, gain) => {
      const o = c.createOscillator(); o.type = type || 'sine';
      o.frequency.setValueAtTime(f1, t);
      if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
    };
    const noise = (dur, lo, hi, gain) => {
      const sr = c.sampleRate, len = Math.max(0.02, dur);
      const buf = c.createBuffer(1, sr * len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(lo, t); f.frequency.exponentialRampToValueAtTime(hi, t + dur);
      f.Q.value = 1.2;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
    };

    switch (name) {
      case 'click':    beep(880, 660, 0.06, 'sine', 0.16); break;
      case 'open':     beep(420, 780, 0.14, 'triangle', 0.20); break;
      case 'close':    beep(780, 380, 0.12, 'triangle', 0.18); break;
      case 'gain':     beep(660, 1320, 0.22, 'sine', 0.24); setTimeout(() => this.sfx('gain2'), 90); break;
      case 'gain2':    beep(880, 1760, 0.24, 'sine', 0.20); break;
      case 'error':    beep(240, 140, 0.22, 'square', 0.14); break;
      case 'hit':      noise(0.14, 1400, 300, 0.30); this.drum(t, 0.26, 150); break;
      case 'crit':     noise(0.20, 2400, 400, 0.40); beep(1400, 500, 0.18, 'square', 0.20); break;
      case 'hurt':     noise(0.16, 700, 180, 0.26); break;
      case 'sword':    noise(0.18, 3000, 700, 0.26); break;
      case 'magic':    beep(520, 1040, 0.28, 'triangle', 0.22); break;
      case 'shield':   beep(320, 640, 0.30, 'sine', 0.22); break;
      case 'break':    // 突破
        beep(392, 784, 0.5, 'sine', 0.30);
        setTimeout(() => this.sfx('break2'), 160);
        noise(0.7, 200, 3000, 0.16); break;
      case 'break2':   beep(587, 1174, 0.7, 'sine', 0.26); break;
      case 'alchemy':  beep(300, 520, 0.36, 'sine', 0.20); noise(0.3, 400, 1200, 0.10); break;
      case 'forge':    this.drum(t, 0.34, 200); setTimeout(() => this.drum(c.currentTime + 0.01, 0.24, 260), 130); break;
      case 'enhance':  beep(440, 880, 0.26, 'triangle', 0.24); break;
      case 'fail':     beep(330, 110, 0.42, 'sawtooth', 0.16); break;
      case 'levelup':  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, f, 0.18, 'sine', 0.22), i * 80)); break;
      case 'bottle':   beep(700, 1200, 0.30, 'sine', 0.20); noise(0.2, 900, 2200, 0.08); break;
      case 'chat':     beep(1000, 1000, 0.05, 'sine', 0.12); break;
      case 'mail':     beep(880, 1100, 0.16, 'sine', 0.20); setTimeout(() => this.sfx('mail2'), 110); break;
      case 'mail2':    beep(1100, 1320, 0.18, 'sine', 0.18); break;
      default:         beep(660, 660, 0.08, 'sine', 0.14);
    }
  },

  /* ---------- 设置持久化 ---------- */
  load() {
    try {
      const v = localStorage.getItem('xx_vol');
      if (v !== null) this.vol = parseFloat(v);
      this.on = localStorage.getItem('xx_audio') !== '0';
      this.musicOn = localStorage.getItem('xx_music') !== '0';
      this.sfxOn = localStorage.getItem('xx_sfx') !== '0';
    } catch (e) {}
  },
  save() {
    try {
      localStorage.setItem('xx_audio', this.on ? '1' : '0');
      localStorage.setItem('xx_music', this.musicOn ? '1' : '0');
      localStorage.setItem('xx_sfx', this.sfxOn ? '1' : '0');
      localStorage.setItem('xx_vol', String(this.vol));
    } catch (e) {}
  },
};

window.AUDIO = AUDIO;
