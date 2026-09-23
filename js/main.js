/* =========================================================
 * main.js —— 启动 / 登录 / 摇杆输入 / 战斗流程 / 存档
 * 依据资料 06 操作方案（移动端摇杆 + PC 备选）
 *        08 跳转流程（16 步）
 * ========================================================= */

let P = null, UID = null, saveT = null, hudT = null, MAINT = null;
let battleMode = 'normal', battleLevel = '1-1';

const MAIN = {
  savePath: null,

  async boot() {
    /* 表02 第15项 / 表23 第9项：热更新检查 */
    let up = { updated: false };
    try { up = OPS.checkUpdate(); } catch (e) { up = { updated: false }; }
    if (up.updated) {
      console.log('[热更新]', up.from, '→', up.ver);
      setTimeout(() => {
        if (window.UI && UI.toast) UI.toast('已更新到 ' + up.ver, 'ok');
      }, 1500);
    }
    /* 表37 埋点：game_start */
    try { OPS.track('game_start', { ver: up.ver }); } catch (e) {}
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

  /* 进入游戏（供微信登录 / 自动登录复用） */
  async enterWith(uid, name, gender) {
    UID = uid || WX.uid();
    localStorage.setItem('zb_uid', UID);
    return this.login(name, gender);
  },

  async login(name, gender) {
    UID = localStorage.getItem('zb_uid') || UID;
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
    if (!P) return;
    let ch = false;
    /* 1) 玩家个人邮件（后台单发直接写入存档） */
    for (const m of (P.mail || [])) {
      if (m.got) continue;
      m.got = 1; ch = true;
      this.giveRw(m.rw || { gold: m.gold || 0, dia: m.dia });
      UI.toast('📮 ' + (m.t || '邮件') + ' 奖励已发放', 'ok');
    }
    /* 2) 后台全服/定向邮件（云端 mail.json） */
    try {
      const r = await Net.read('data/zb/mail.json');
      const db = (r && r.data) || null;
      if (db && (db.list || []).length) {
        const now = Date.now();
        let touched = false;
        for (const m of db.list) {
          if (m.startAt && m.startAt > now) continue;
          if (m.expireAt && m.expireAt < now) continue;
          if ((m.claimed || []).indexOf(P.uid) >= 0) continue;
          /* 定向：检查 uid 列表或筛选条件 */
          if (m.type === 'target') {
            const hit = (m.uids || []).indexOf(P.uid) >= 0
              || this.matchFilter(P, m.filter);
            if (!hit) continue;
          }
          m.claimed = m.claimed || [];
          m.claimed.push(P.uid);
          touched = true; ch = true;
          this.giveRw(m.rw || {});
          UI.toast('📢 ' + (m.title || '全服邮件') + ' 奖励已发放', 'ok');
        }
        if (touched) { try { await Net.write('data/zb/mail.json', db, '领取邮件'); } catch (e) {} }
      }
    } catch (e) {}
    /* 3) 检查维护模式 */
    try {
      const r = await Net.read('data/zb/server.json');
      if (r && r.data && r.data.mode === '维护') {
        UI.toast('🖥️ ' + (r.data.msg || '服务器维护中'), 'err');
        MAINT = r.data;
      }
    } catch (e) {}
    if (ch) { UI.home(); await this.save(); }
  },
  /* 按后台筛选条件匹配玩家 */
  matchFilter(p, f) {
    if (!f) return false;
    const lv = p.lv || 1;
    const cleared = Object.keys(p.cleared || {}).length;
    if (f.lvMin != null && lv < f.lvMin) return false;
    if (f.lvMax != null && lv > f.lvMax) return false;
    if (f.clearedMin != null && cleared < f.clearedMin) return false;
    if (f.regAfter != null && (p.created || 0) < f.regAfter) return false;
    return true;
  },
  /* 通用发放（支持物品 id → 字段映射） */
  giveRw(rw) {
    if (!P || !rw) return;
    Object.keys(rw).forEach((k) => {
      const v = Number(rw[k]) || 0;
      if (!v) return;
      if (k === 'gold' || k === 'diamond' || k === 'ach' || k === 'stamina' || k === 'evToken') {
        P[k] = (P[k] || 0) + v;
      } else {
        const it = (EX.items || []).find((x) => x.id === k);
        if (it && it.type === '消耗') { P.use = P.use || {}; P.use[k] = (P.use[k] || 0) + v; }
        else { P.mat = P.mat || {}; P.mat[k] = (P.mat[k] || 0) + v; }
      }
    });
  },
  /* ============ 礼包码兑换 ============ */
  async redeemCode(code) {
    if (!P) return { ok: false, msg: '未登录' };
    code = (code || '').trim().toUpperCase();
    if (!code) return { ok: false, msg: '请输入兑换码' };
    let db = null;
    try { const r = await Net.read('data/zb/cdkey.json'); db = r && r.data; } catch (e) {}
    if (!db || !(db.codes || []).length) return { ok: false, msg: '礼包码服务不可用' };
    const c = db.codes.find((x) => x.code === code);
    if (!c) return { ok: false, msg: '兑换码不存在' };
    if (c.status === '作废') return { ok: false, msg: '该兑换码已作废' };
    if ((c.used || 0) >= (c.maxUse || 1)) return { ok: false, msg: '该兑换码已被使用' };
    if (c.exp && c.exp < Date.now()) return { ok: false, msg: '该兑换码已过期' };
    if (c.bindUid && c.bindUid !== P.uid) return { ok: false, msg: '该兑换码已绑定其他账号' };
    if ((c.usedBy || []).indexOf(P.uid) >= 0) return { ok: false, msg: '您已兑换过该码' };
    const tpl = (db.templates || []).find((t) => t.id === c.tpl);
    if (!tpl) return { ok: false, msg: '礼包模板缺失' };
    if (tpl.once && (c.usedBy || []).indexOf(P.uid) >= 0) return { ok: false, msg: '每人限领 1 次' };
    this.giveRw(tpl.items || {});
    c.used = (c.used || 0) + 1;
    c.usedBy = c.usedBy || [];
    c.usedBy.push(P.uid);
    c.usedAt = Date.now();
    if (c.used >= c.maxUse) c.status = '已使用';
    try { await Net.write('data/zb/cdkey.json', db, '兑换 ' + code); } catch (e) {}
    try { OPS.track('iap_purchase', { cdkey: code }); } catch (e) {}
    await this.save();
    const got = Object.keys(tpl.items || {}).map((k) => E.itemName(k) + '×' + tpl.items[k]).join('、');
    return { ok: true, msg: '兑换成功：' + (got || '礼包') };
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
  /* 表21：第一次通关 → 通关引导；首次失败 → 广告复活引导 */
  if (UI.guideTrigger) {
    if (res === 'win') UI.guideTrigger('win');
    else if (res === 'lose') UI.guideTrigger('fail');
  }
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

  /* 战斗：倍速 / 暂停 / 自动 / 切换 */
  const spBtn = $('#btSpeed');
  if (spBtn) spBtn.onclick = () => {
    /* 截图：X1 → X1.5 → X2 */
    const seq = [1, 1.5, 2];
    const i = seq.indexOf(BT.speed || 1);
    BT.speed = seq[(i + 1) % seq.length];
    spBtn.textContent = 'X' + BT.speed;
    if (window.SND) SND.play('click');
  };
  const psBtn = $('#btPause');
  if (psBtn) psBtn.onclick = () => {
    BT.paused = !BT.paused;
    psBtn.textContent = BT.paused ? '▶' : '⏸';
    if (window.SND) SND.play('click');
  };
  const auBtn = $('#btAuto');
  if (auBtn) auBtn.onclick = () => {
    BT.auto = !BT.auto;
    auBtn.classList.toggle('on', BT.auto);
    UI.toast(BT.auto ? '自动战斗 开' : '自动战斗 关', 'ok');
    if (window.SND) SND.play('click');
  };
  const swBtn = $('#btSwitch');
  if (swBtn) swBtn.onclick = () => {
    UI.toast('长按战场可快速射击', 'ok');
    if (window.SND) SND.play('click');
  };

  $$('.hm-nav .hn').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.p;
      if (k === 'battle') { UI.open('level', '章节'); return; }
      $$('.hm-nav .hn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      UI.open(k);
    };
  });
  $$('.hm-nav2 .hn2').forEach((b) => { b.onclick = () => { UI.open(b.dataset.p); }; });

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
  /* ===== 微信登录 / 自动登录 / 扫码登录 ===== */
  const wxBtn = document.getElementById('wxLoginBtn');
  const wxTip = document.getElementById('wxTip');
  const lgSwitch = document.getElementById('lgSwitch');
  const lgManual = document.getElementById('lgManual');

  const lgScanBtn = document.getElementById('lgScan');
  if (lgScanBtn) lgScanBtn.onclick = () => {
    if (!WX.phone()) {
      if (wxTip) wxTip.textContent = '请先完成微信登录后才能生成登录码';
      return;
    }
    WX.showScan();
  };

  if (lgSwitch) lgSwitch.onclick = () => {
    const on = lgManual.style.display !== 'none';
    lgManual.style.display = on ? 'none' : 'block';
    lgSwitch.textContent = on ? '切换账户 · 手动建号' : '返回微信登录';
  };

  if (wxBtn) wxBtn.onclick = async () => {
    wxBtn.disabled = true;
    wxTip.textContent = WX.phone() ? '微信一键登录中…' : '正在唤起微信授权…';
    const r = await WX.login();
    if (r.pending) return;               /* 跳真 OAuth 中 */
    if (r.ok) {
      wxTip.textContent = r.quick ? '授权成功，正在进入…' : '绑定成功，正在进入…';
      localStorage.setItem('zb_uid', r.uid);
      await MAIN.login(r.name, r.gender);
    } else {
      wxBtn.disabled = false;
      wxTip.textContent = r.msg || '授权失败，请重试';
      setTimeout(() => { if (wxTip && !wxTip.dataset.busy) wxTip.textContent = WX.tipText(); }, 2600);
    }
  };
  /* 登录页提示：已绑定则显示脱敏手机号 */
  if (wxTip && WX.phone()) wxTip.textContent = WX.tipText();

  /* 扫码登录：URL 带 ?wx=<账号ID> → 直接进该账号 */
  const wxParam = new URLSearchParams(location.search).get('wx');
  if (wxParam) {
    (async () => {
      try {
        localStorage.setItem('zb_uid', wxParam);
        /* 昵称用记忆的，若无则用微信风格昵称 */
        const nm = localStorage.getItem('zb_name') || WX.randomWxName();
        const gd = localStorage.getItem('zb_gender') || 'm';
        if (wxTip) { wxTip.dataset.busy = '1'; wxTip.textContent = '扫码登录中…'; }
        await MAIN.login(nm, gd);
      } catch (e) { /* 失败留登录页 */ }
    })();
    return;
  }

  /* 已记住账户 → 下次打开自动进入，无需任何点击 */
  if (WX.shouldAuto()) {
    const rm = WX.remembered();
    if (wxTip) { wxTip.dataset.busy = '1'; wxTip.textContent = '微信一键登录中…'; }
    (async () => {
      try { await MAIN.login(rm.name || '先锋官', rm.gender || 'm'); }
      catch (e) { /* 失败则留在登录页 */ }
    })();
  }

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
