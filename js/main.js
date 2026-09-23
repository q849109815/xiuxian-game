/* =========================================================
 * main.js —— 启动 / 登录 / 摇杆输入 / 战斗流程 / 存档
 * 依据资料 06 操作方案（移动端摇杆 + PC 备选）
 *        08 跳转流程（16 步）
 * ========================================================= */

let P = null, UID = null, saveT = null, hudT = null;
let battleMode = 'normal', battleLevel = '1-1';

const MAIN = {
  savePath: null,

  async boot() {
    const steps = [['正在装填弹药…', 12], ['加载武器数据…', 34], ['连接云端存档…', 58], ['读取先锋官档案…', 80], ['准备完毕', 100]];
    for (const [txt, v] of steps) {
      const b = document.getElementById('ldBar'), t = document.getElementById('ldTxt');
      if (b) b.style.width = v + '%'; if (t) t.textContent = txt;
      await new Promise((r) => setTimeout(r, 180));
    }
    await CFG.load();
    await Net.init().catch(() => {});
    const n = document.getElementById('lgNet');
    if (n) n.textContent = Net.online ? '● 已连接' : '○ 离线（可单机游玩）';
    UI.show('login');
  },

  async login(name, gender) {
    UID = localStorage.getItem('zb_uid');
    if (!UID) { UID = 'u' + Math.random().toString(36).slice(2, 8); localStorage.setItem('zb_uid', UID); }
    const path = 'data/zb/players/' + UID + '.json';
    let p = null;
    try { const r = await Net.read(path); if (r && r.data) p = r.data; } catch (e) {}
    if (!p) {
      p = E.newPlayer(UID, name, gender);
      UI.toast('欢迎加入，先锋官！', 'ok');
    } else { p.name = p.name || name; p.lastSeen = Date.now(); }
    P = p; window.P = p; UI.P = p;
    this.savePath = path;
    this.migrate(p);
    UI.home(); UI.show('home');
    await this.claimMail();
    this.startSave(); this.loadLeaderboard();
  },

  /* 旧档字段补全 */
  migrate(p) {
    p.char = p.char || 'C01'; p.chars = p.chars || ['C01'];
    p.skin = p.skin || 'sk_c01a'; p.skins = p.skins || ['sk_c01a'];
    p.mat = p.mat || { M01: 0, M02: 0, M03: 0, M04: 0, M05: 0, P01: 0, P02: 0 };
    p.use = p.use || { I01: 0, I02: 0, I03: 0 };
    p.gun = p.gun || 'W01'; p.gunLv = p.gunLv || 1; p.gunAdv = p.gunAdv || 0;
    p.gunStats = p.gunStats || {}; p.gunOwn = p.gunOwn || ['W01'];
    p.chips = p.chips || {}; p.bag = p.bag || []; p.talents = p.talents || {};
    p.build = p.build || { hospital: 1, armory: 1, lab: 1, warehouse: 1 };
    p.cleared = p.cleared || {}; p.curLevel = p.curLevel || '1-1';
    p.stamina = p.stamina == null ? 100 : p.stamina;
    p.staminaAt = p.staminaAt || Date.now();
    p.tasks = p.tasks || { mainClaimed: [], dailyClaimed: [], dailyDate: '', dailyProg: {},
      weeklyClaimed: [], weeklyKey: '', weeklyProg: {}, achieveClaimed: [] };
    p.stats = p.stats || { kills: 0, runs: 0, bossKill: 0, noHitBest: 0, endlessBest: 0 };
    p.guide = p.guide || {}; p.ach = p.ach || 0; p.endlessTime = p.endlessTime || 0;
    p.mail = p.mail || [];
    E.resetTasks(p); E.tickStamina(p);
  },

  async save() {
    if (!P || !this.savePath) return;
    P.lastSeen = Date.now(); P.offlineAt = Date.now();
    try { await Net.write(this.savePath, P); } catch (e) {}
    this.uploadRank();
  },
  startSave() { if (saveT) clearInterval(saveT); saveT = setInterval(() => { if (P) this.save(); }, 30000); },
  async uploadRank() {
    if (!P || !Net.online) return;
    try {
      const r = await Net.read('data/zb/leaderboard.json');
      const lb = (r && r.data && r.data.list) ? r.data.list : [];
      const row = { u: P.uid, n: P.name, lv: E.curLevel(P), pw: E.power(P), eb: P.endlessBest || 0 };
      const i = lb.findIndex((x) => x.u === P.uid);
      if (i >= 0) lb[i] = row; else lb.push(row);
      lb.sort((a, b) => (b.eb || 0) - (a.eb || 0) || b.pw - a.pw);
      await Net.write('data/zb/leaderboard.json', { list: lb.slice(0, 50), updated: Date.now() });
    } catch (e) {}
  },
  async loadLeaderboard() {
    try { const r = await Net.read('data/zb/leaderboard.json'); window.LB = (r && r.data && r.data.list) ? r.data.list.slice(0, 30) : []; }
    catch (e) { window.LB = []; }
  },
  async claimMail() {
    if (!P || !(P.mail || []).length) return;
    let ch = false;
    for (const m of P.mail) {
      if (m.got) continue;
      m.got = 1; ch = true;
      P.gold += m.gold || 0; P.diamond += m.dia || 0;
      UI.toast('📮 ' + (m.t || '邮件') + '：金币+' + E.fmt(m.gold || 0) + ' 钻石+' + (m.dia || 0), 'ok');
    }
    if (ch) { UI.home(); await this.save(); }
  },
  toast(m, c) { UI.toast(m, c); },
};

/* =========================================================
 * 战斗流程（资料 08 跳转流程）
 * ========================================================= */
function startBattle(mode, levelId) {
  if (!P) return;
  battleMode = mode;
  let id = levelId;
  if (mode === 'endless') {
    if (!E.endlessUnlocked(P)) { UI.toast('无尽模式需通关 3-3 解锁', 'err'); return; }
    id = 'endless';
  } else {
    id = levelId || E.curLevel(P);
    if (!E.levelUnlocked(P, id)) { UI.toast('该关卡尚未解锁', 'err'); return; }
  }
  /* 体力检查 */
  const sp = E.spendStamina(P, id);
  if (!sp.ok) { UI.toast(sp.msg, 'err'); return; }
  battleLevel = id;

  UI.show('battle');
  /* 音频：战斗 BGM */
  if (window.SND) {
    const isBoss = BT.run && (BT.run.def.cond === 'boss' || BT.run.def.cond === 'bossAll');
    SND.bgm(id === 'endless' ? 'endless' : isBoss ? 'boss' : 'battle');
  }
  BT.joy = { x: 0, y: 0 };
  const knob = document.getElementById('joyKnob');
  if (knob) knob.style.transform = 'translate(0,0)';
  BT.attach(document.getElementById('C'));
  BT.start(P, id, { endless: id === 'endless', cb: onBattleEnd });
  UI.btInit(P, id, id === 'endless');
  if (hudT) clearInterval(hudT);
  hudT = setInterval(() => { if (BT.on || (BT.run && !BT.run.over)) UI.btTick(); }, 100);

  /* 引导：移动 / 射击 */
  if (!P.guide[1]) { P.guide[1] = 1; UI.toast('① 拖动左下摇杆移动角色', 'ok'); }
  else if (!P.guide[2]) { P.guide[2] = 1; UI.toast('② 自动瞄准射击，怪物来袭', 'ok'); }
}

function onBattleEnd(res, d) {
  if (hudT) { clearInterval(hudT); hudT = null; }
  if (window.SND) { SND.play(res === 'win' ? 'win' : 'lose'); SND.bgm('base'); }
  const r = BT.run;
  const kills = d.kills || 0;
  const endless = r.endless;
  /* 资料奖励表 */
  let rw = { gold: 0, diamond: 0 };
  if (res === 'win') {
    const def = r.def;
    if (endless) {
      rw.gold = 100 + r.wave * 20;
      P.endlessBest = Math.max(P.endlessBest || 0, r.wave);
    } else {
      const lr = def.rw || {};
      rw.gold = lr.gold || 0;
      for (const k in lr) {
        if (k === 'gold') continue;
        if (k === 'chip') { for (let i = 0; i < lr[k]; i++) P.bag.push(E.rollChipById('CH01')); }
        else P.mat[k] = (P.mat[k] || 0) + lr[k];
      }
    }
  } else {
    rw.gold = Math.floor((d.rw && d.rw.gold) || 0);
  }
  /* 关卡掉落金币 */
  rw.gold += Math.round((d.rw && d.rw.gold) || 0);
  P.gold += rw.gold; P.diamond += rw.diamond;

  /* 统计与任务推进 */
  const stars = (res === 'win' && !endless) ? E.clearLevel(P, r.def.id, r.maxHp ? r.hp / r.maxHp : 0) : 0;
  const isBoss = !endless && (r.def.cond === 'boss' || r.def.cond === 'bossAll');
  E.pushStats(P, {
    kills, clear: res === 'win' ? 1 : 0,
    boss: (isBoss && res === 'win') ? 1 : 0,
    noHit: (res === 'win' && r.hp >= r.maxHp) ? kills : 0,
    endlessSec: endless ? r.time : 0,
  });
  if (endless) P.endlessTime = Math.max(P.endlessTime || 0, Math.floor(r.time));

  /* 引导标记 */
  if (res === 'win') { P.guide[5] = 1; P.guide[6] = 1; }
  if (!P.guide[3]) P.guide[3] = 1;

  UI.home();
  UI.showResult(res, { kills, time: r.time, rw, stars });
  if (stars) UI.toast('⭐ 获得 ' + stars + ' 星评价', 'ok');
  MAIN.save();
}

/* =========================================================
 * 输入：虚拟摇杆 + 键盘（资料 06）
 * ========================================================= */
function bindJoystick() {
  const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob');
  if (!joy) return;
  const R = 34;
  let id = null, cx = 0, cy = 0;
  const setFrom = (tx, ty) => {
    let dx = tx - cx, dy = ty - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    BT.joy.x = dx / R; BT.joy.y = dy / R;
    if (knob) knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const down = (e) => {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const b = joy.getBoundingClientRect();
    cx = b.left + b.width / 2; cy = b.top + b.height / 2;
    id = t.identifier; setFrom(t.clientX, t.clientY); e.preventDefault();
  };
  const move = (e) => {
    if (id === null) return;
    const ts = e.changedTouches ? Array.from(e.changedTouches) : [e];
    const t = ts.find((x) => x.identifier === id); if (!t) return;
    setFrom(t.clientX, t.clientY); e.preventDefault();
  };
  const up = (e) => {
    if (id === null) return;
    const ts = e.changedTouches ? Array.from(e.changedTouches) : [e];
    if (!ts.some((x) => x.identifier === id)) return;
    id = null; BT.joy.x = 0; BT.joy.y = 0;
    if (knob) knob.style.transform = 'translate(0,0)';
  };
  joy.addEventListener('touchstart', down, { passive: false });
  joy.addEventListener('touchmove', move, { passive: false });
  joy.addEventListener('touchend', up); joy.addEventListener('touchcancel', up);
  joy.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function bindKeys() {
  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); keys[k] = 1;
    if (!BT.on) return;
    if (k === 'r') BT.reload();
    if (k === 'escape') { BT.paused = true; document.getElementById('pause').classList.add('on'); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = 0; });
  setInterval(() => {
    if (!BT.on) return;
    let x = 0, y = 0;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    if (x || y) { BT.joy.x = x; BT.joy.y = y; }
  }, 40);
}

/* =========================================================
 * 事件绑定
 * ========================================================= */
function bindAll() {
  let gender = 'm';
  $$('#lgGender .gd').forEach((b) => {
    b.onclick = () => { gender = b.dataset.g; $$('#lgGender .gd').forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
  });
  const lb = document.getElementById('lgBtn');
  if (lb) lb.onclick = async () => {
    const nm = (document.getElementById('lgName').value || '').trim() || '先锋官';
    if (nm.length < 2) { UI.toast('代号至少 2 个字', 'err'); return; }
    UI.toast('正在进入战区…'); await MAIN.login(nm, gender);
  };

  const hg = document.getElementById('hmGo');
  if (hg) hg.onclick = () => UI.open('level');
  const he = document.getElementById('hmEndless');
  if (he) he.onclick = () => startBattle('endless');

  $$('.hm-nav .hn').forEach((b) => { b.onclick = () => UI.open(b.dataset.p); });

  const px = document.getElementById('pnX'); if (px) px.onclick = () => UI.close();
  const pm = document.getElementById('pnMask'); if (pm) pm.onclick = () => UI.close();

  const bp = document.getElementById('btPause');
  if (bp) bp.onclick = () => { BT.paused = true; document.getElementById('pause').classList.add('on'); };
  const pr = document.getElementById('psResume');
  if (pr) pr.onclick = () => { BT.paused = false; document.getElementById('pause').classList.remove('on'); };
  const pq = document.getElementById('psQuit');
  if (pq) pq.onclick = () => { document.getElementById('pause').classList.remove('on'); BT.quit(); };

  const rl = document.getElementById('btReload');
  if (rl) rl.onclick = () => BT.reload();

  const cr = document.getElementById('chRefresh');
  if (cr) cr.onclick = () => { UI.toast('已刷新选项', 'ok'); BT.refreshOffer(); };

  const ra = document.getElementById('rsAgain');
  if (ra) ra.onclick = () => { UI.hideResult(); startBattle(battleMode, battleLevel); };
  const rn = document.getElementById('rsNext');
  if (rn) rn.onclick = () => {
    UI.hideResult();
    if (battleMode === 'endless') startBattle('endless');
    else {
      const nx = E.nextLevel(battleLevel);
      if (nx) startBattle('normal', nx); else { UI.home(); UI.show('home'); }
    }
  };
  const rb = document.getElementById('rsBack');
  if (rb) rb.onclick = () => { UI.hideResult(); UI.home(); UI.show('home'); if (window.SND) SND.bgm('base'); };

  document.addEventListener('visibilitychange', () => { if (document.hidden && BT.on) BT.paused = true; });
  window.addEventListener('beforeunload', () => { if (P) MAIN.save(); });

  bindJoystick(); bindKeys();
}

window.addEventListener('DOMContentLoaded', async () => {
  bindAll();
  await MAIN.boot();
});

window.MAIN = MAIN;
window.startBattle = startBattle;
