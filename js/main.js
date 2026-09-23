/* =========================================================
 * main.js —— 启动 / 登录 / 摇杆输入 / 战斗流程 / 存档
 * 依据资料 06 操作方案：移动端摇杆 + PC 键鼠备选
 * ========================================================= */

let P = null, UID = null, saveT = null, hudT = null;
let battleMode = 'normal';

const MAIN = {
  savePath: null,

  async boot() {
    const steps = [['正在装填弹药…', 12], ['加载武器数据…', 34], ['连接云端存档…', 58], ['读取先锋官档案…', 80], ['准备完毕', 100]];
    for (const [txt, v] of steps) {
      const b = document.getElementById('ldBar'), t = document.getElementById('ldTxt');
      if (b) b.style.width = v + '%'; if (t) t.textContent = txt;
      await sleep(180);
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
      p.gold = 3000; p.diamond = 100;
      p.bag.push(E.rollChip('绿', null));
      UI.toast('欢迎加入，先锋官！已发放新手芯片', 'ok');
    } else { p.name = p.name || name; p.lastSeen = Date.now(); }
    P = p; window.P = p; UI.P = p;
    this.savePath = path;
    /* 兼容旧档缺失字段 */
    p.chips = p.chips || {}; p.bag = p.bag || []; p.talents = p.talents || {};
    p.build = p.build || { hospital: 1, armory: 1, lab: 1, warehouse: 1 };
    p.cleared = p.cleared || {}; p.tasks = p.tasks || { mainClaimed: [], dailyProg: {}, dailyClaimed: [], dailyDate: '', achieveClaimed: [] };
    p.stats = p.stats || { kills: 0, runs: 0, boss: 0, clears: 0, upgrade: 0 };
    E.resetDaily(p);
    UI.home(); UI.show('home');
    await this.claimMail();
    this.startSave(); this.loadLeaderboard();
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
      const row = { u: P.uid, n: P.name, lv: P.level || 1, pw: E.power(P), eb: P.endlessBest || 0 };
      const i = lb.findIndex((x) => x.u === P.uid);
      if (i >= 0) lb[i] = row; else lb.push(row);
      lb.sort((a, b) => b.lv - a.lv || b.pw - a.pw);
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
      for (let i = 0; i < (m.chips || m.eq || 0); i++) P.bag.push(E.rollChip(m.q || '紫', null));
      UI.toast('📮 ' + (m.t || '邮件') + '：金币+' + E.fmt(m.gold || 0) + ' 钻石+' + (m.dia || 0)
        + ((m.chips || m.eq || 0) ? ' 芯片×' + (m.chips || m.eq) : ''), 'ok');
    }
    if (ch) { UI.home(); await this.save(); }
  },
  toast(m, c) { UI.toast(m, c); },
};

/* =========================================================
 * 战斗流程
 * ========================================================= */
function startBattle(mode, lv) {
  if (!P) return;
  battleMode = mode;
  const levelNo = mode === 'endless' ? (lv || 1) : (lv || P.level || 1);
  UI.show('battle');
  BT.joy = { x: 0, y: 0 };
  const knob = document.getElementById('joyKnob');
  if (knob) { knob.style.transform = 'translate(0,0)'; }
  BT.attach(document.getElementById('C'));
  BT.start(P, levelNo, { endless: mode === 'endless', cb: onBattleEnd });
  UI.btInit(P, levelNo, mode === 'endless');
  if (hudT) clearInterval(hudT);
  hudT = setInterval(() => { if (BT.on || (BT.run && !BT.run.over)) UI.btTick(); }, 100);
}

function onBattleEnd(res, d) {
  if (hudT) { clearInterval(hudT); hudT = null; }
  const r = BT.run;
  P.stats.runs = (P.stats.runs || 0) + 1;
  P.stats.kills = (P.stats.kills || 0) + (d.kills || 0);
  P.gold += d.rw.gold || 0; P.diamond += d.rw.diamond || 0;
  let stars = 0;
  if (res === 'win') {
    if (battleMode === 'endless') {
      P.endlessBest = Math.max(P.endlessBest || 0, r.def.levelNo);
    } else {
      const ratio = r.maxHp ? r.hp / r.maxHp : 0;
      stars = E.clearLevel(P, r.def.levelNo, ratio);
      if (r.def.isBoss) P.stats.boss = (P.stats.boss || 0) + 1;
    }
  }
  UI.home();
  UI.showResult(res, d || { rw: { gold: 0, diamond: 0 }, kills: 0, time: 0 });
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
    const k = e.key.toLowerCase();
    keys[k] = 1;
    if (!BT.on) return;
    if (k === 'r') BT.reload();
    if (k === 'escape') { BT.paused = true; document.getElementById('pause').classList.add('on'); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = 0; });
  /* WASD → 摇杆向量（PC 备选方案） */
  setInterval(() => {
    if (!BT.on) return;
    let x = 0, y = 0;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    if (x || y) { BT.joy.x = x; BT.joy.y = y; }
    else if (BT.joy.src !== 'touch') { /* 键盘松开归零，但保留触摸控制 */ }
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
  if (hg) hg.onclick = () => startBattle('normal');
  const he = document.getElementById('hmEndless');
  if (he) he.onclick = () => startBattle('endless', 1);

  $$('.hm-nav .hn').forEach((b) => {
    b.onclick = () => { UI.open(b.dataset.p); };
  });

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
  if (ra) ra.onclick = () => { UI.hideResult(); startBattle(battleMode, BT.run.def.levelNo); };
  const rn = document.getElementById('rsNext');
  if (rn) rn.onclick = () => {
    UI.hideResult();
    if (battleMode === 'endless') startBattle('endless', BT.run.def.levelNo + 1);
    else startBattle('normal', Math.min(E.maxLevel(), BT.run.def.levelNo + 1));
  };
  const rb = document.getElementById('rsBack');
  if (rb) rb.onclick = () => { UI.hideResult(); UI.home(); UI.show('home'); };

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
