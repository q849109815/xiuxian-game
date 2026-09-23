/* =========================================================
 * main.js —— 启动 / 登录 / 主循环 / 存档
 * ========================================================= */

let P = null;         // 玩家存档
let UID = null;
let saveT = null;

const MAIN = {

  /* ---------------- 启动 ---------------- */
  async boot() {
    const steps = [
      ['正在装填弹药…', 12],
      ['加载武器数据…', 34],
      ['连接云端存档…', 58],
      ['读取先锋官档案…', 80],
      ['准备完毕', 100],
    ];
    for (const [txt, v] of steps) {
      $('#ldTxt').textContent = txt;
      $('#ldBar').style.width = v + '%';
      await sleep(180);
    }
    await CFG.load();
    await Net.init().catch(() => {});
    $('#lgNet').textContent = Net.online ? '● 已连接' : '○ 离线（可单机游玩）';
    this.show('login');
  },

  show(id) { UI.show(id); },

  /* ---------------- 登录 ---------------- */
  async login(name, gender) {
    UID = localStorage.getItem('zb_uid');
    if (!UID) {
      UID = 'u' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('zb_uid', UID);
    }
    const path = 'data/zb/players/' + UID + '.json';
    let p = null;
    try { const r = await Net.read(path); if (r && r.data) p = r.data; } catch (e) {}
    if (!p) {
      p = E.newPlayer(UID, name, gender);
      // 新手礼包
      p.gold = 3000; p.diamond = 100;
      EX.slots.forEach((s) => { p.bag.push(E.rollEquip(s.k, 1)); });
      this.toast('欢迎加入，先锋官！已发放新手装备', 'ok');
    } else {
      p.name = p.name || name;
      p.lastSeen = Date.now();
    }
    P = p;
    window.P = p;
    UI.P = p;
    this.claimMail();
    this.savePath = path;
    UI.home();
    this.show('home');
    this.startSave();
    this.loadLeaderboard();
  },

  /* ---------------- 存档 ---------------- */
  async save() {
    if (!P || !this.savePath) return;
    P.lastSeen = Date.now();
    try { await Net.write(this.savePath, P); } catch (e) {}
    this.uploadRank();
  },
  startSave() {
    if (saveT) clearInterval(saveT);
    saveT = setInterval(() => { if (P) this.save(); }, 30000);
  },
  async uploadRank() {
    if (!P || !Net.online) return;
    try {
      const r = await Net.read('data/zb/leaderboard.json');
      const lb = (r && r.data && r.data.list) ? r.data.list : [];
      const i = lb.findIndex((x) => x.u === P.uid);
      const row = { u: P.uid, n: P.name, lv: P.level || 1, pw: E.power(P), eb: P.endlessBest || 0 };
      if (i >= 0) lb[i] = row; else lb.push(row);
      lb.sort((a, b) => b.lv - a.lv || b.pw - a.pw);
      await Net.write('data/zb/leaderboard.json', { list: lb.slice(0, 50), updated: Date.now() });
    } catch (e) {}
  },
  async loadLeaderboard() {
    try {
      const r = await Net.read('data/zb/leaderboard.json');
      window.LB = (r && r.data && r.data.list) ? r.data.list.slice(0, 30) : [];
    } catch (e) { window.LB = []; }
  },

  toast(m, c) { UI.toast(m, c); },

  /* ---------------- 邮件 ---------------- */
  async claimMail() {
    if (!P || !(P.mail || []).length) return;
    let changed = false;
    for (const m of P.mail) {
      if (m.got) continue;
      m.got = 1; changed = true;
      P.gold += (m.gold || 0);
      P.diamond += (m.dia || 0);
      for (let i = 0; i < (m.eq || 0); i++) {
        const slot = EX.slots[Math.floor(Math.random() * EX.slots.length)].k;
        const it = E.rollEquip(slot, P.lv || 1);
        it.q = m.q || '紫';
        P.bag.push(it);
      }
      UI.toast('📮 ' + (m.t || '邮件') + '：金币+' + E.fmt(m.gold || 0) +
        ' 钻石+' + (m.dia || 0) + ((m.eq || 0) ? ' 装备×' + m.eq : ''), 'ok');
    }
    if (changed) { UI.home(); await this.save(); }
  },
};


/* =========================================================
 * 战斗流程
 * ========================================================= */
let battleMode = 'normal';   // normal | endless
let hudT = null;

function startBattle(mode, lv) {
  if (!P) return;
  battleMode = mode;
  const levelNo = mode === 'endless' ? (lv || 1) : (P.level || 1);
  UI.show('battle');
  BT.attach($('#C'));
  BT.start(P, levelNo, {
    endless: mode === 'endless',
    cb: (r, d) => onBattleEnd(r, d),
  });
  UI.btInit(P, levelNo, mode === 'endless');
  // HUD 刷新
  if (hudT) clearInterval(hudT);
  hudT = setInterval(() => {
    if (!BT.on) return;
    UI.btTick();
  }, 100);
  // 触摸拖动控制炮台位置
  const cv = $('#C');
  let dragging = false;
  const move = (e) => {
    const t = e.touches ? e.touches[0] : e;
    BT.moveTo(t.clientX);
  };
  cv.addEventListener('touchstart', (e) => { dragging = true; move(e); });
  cv.addEventListener('touchmove', (e) => { if (dragging) { move(e); e.preventDefault(); } }, { passive: false });
  cv.addEventListener('touchend', () => { dragging = false; });
  cv.addEventListener('mousedown', (e) => { dragging = true; move(e); });
  cv.addEventListener('mousemove', (e) => { if (dragging) move(e); });
  cv.addEventListener('mouseup', () => { dragging = false; });
}

function onBattleEnd(res, d) {
  if (hudT) { clearInterval(hudT); hudT = null; }
  UI.btRenderSkills();
  UI.home();
  UI.showResult(res, d || { rw: { gold: 0, diamond: 0 }, kills: 0, time: 0 });
  MAIN.save();
}

/* =========================================================
 * 事件绑定
 * ========================================================= */
function bindAll() {
  /* --- 登录 --- */
  let gender = 'm';
  $$('#lgGender .gd').forEach((b) => {
    b.onclick = () => {
      gender = b.dataset.g;
      $$('#lgGender .gd').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });
  $('#lgBtn').onclick = async () => {
    const nm = ($('#lgName').value || '').trim() || '先锋官';
    if (nm.length < 2) { UI.toast('代号至少 2 个字', 'err'); return; }
    UI.toast('正在进入战区…');
    await MAIN.login(nm, gender);
  };

  /* --- 主界面 --- */
  $('#hmGo').onclick = () => startBattle('normal');
  $('#hmEndless').onclick = () => startBattle('endless', 1);
  $('#hmRank').onclick = () => UI.open('rank');
  $('#hmAv').onclick = () => UI.open('role', '装备');

  $$('.hm-nav .hn').forEach((b) => {
    b.onclick = () => {
      $$('.hm-nav .hn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      UI.open(b.dataset.p);
    };
  });

  /* --- 面板关闭 --- */
  $('#pnX').onclick = () => UI.close();
  $('#pnMask').onclick = () => UI.close();

  /* --- 战斗顶部 --- */
  $('#btPause').onclick = () => {
    BT.paused = true;
    $('#pause').classList.add('on');
  };
  $('#psResume').onclick = () => { BT.paused = false; $('#pause').classList.remove('on'); };
  $('#psQuit').onclick = () => { $('#pause').classList.remove('on'); BT.quit(); };

  /* --- 刷新技能 --- */
  $('#chRefresh').onclick = () => {
    UI.toast('刷新功能需观看广告，此处免费刷新', 'ok');
    BT.refreshOffer();
  };

  /* --- 结算 --- */
  $('#rsAgain').onclick = () => { UI.hideResult(); startBattle(battleMode, BT.run.levelNo); };
  $('#rsNext').onclick = () => {
    UI.hideResult();
    if (battleMode === 'endless') startBattle('endless', BT.run.levelNo + 1);
    else startBattle('normal');
  };
  $('#rsBack').onclick = () => { UI.hideResult(); UI.home(); UI.show('home'); };

  /* --- 键盘（PC） --- */
  window.addEventListener('keydown', (e) => {
    if (!BT.on) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const id = BT.run.actives[n - 1];
      if (id) BT.cast(id);
    }
    if (e.key === 'Escape') { BT.paused = true; $('#pause').classList.add('on'); }
  });

  /* --- 页面隐藏时暂停 --- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && BT.on) BT.paused = true;
  });

  /* --- 离开前保存 --- */
  window.addEventListener('beforeunload', () => { if (P) MAIN.save(); });
}

/* ================= 启动 ================= */
window.addEventListener('DOMContentLoaded', async () => {
  bindAll();
  await MAIN.boot();
});

window.MAIN = MAIN;
