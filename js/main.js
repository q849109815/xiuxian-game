/* =========================================================
 * main.js —— 启动 / 登录 / 创角 / 主循环 / 交互绑定
 * ========================================================= */

let P = null, PPATH = '';
let tickTimer = null, saveTimer = null;
let sessionStart = 0;
const CFG_FILES = ['data/config/core.json', 'data/config/meta.json'];

/* ================= 启动 ================= */
window.addEventListener('load', async () => {
  const ld = $('#ldBar'), ldt = $('#ldTxt');
  const setLd = (p, t) => { if (ld) ld.style.width = p + '%'; if (ldt) ldt.textContent = t; };

  setLd(12, '正在载入星海资料…');
  const okCfg = await CFG.load();
  if (!okCfg) { setLd(100, '资料载入失败'); UI.toast('配置加载失败，请检查 data/config 文件', 'err'); return; }
  setLd(38, `已载入 ${CFG.core.realms.length} 境界 / ${CFG.core.quests.length} 任务 / ${CFG.core.monsters.length} 妖兽`);

  // 恢复自定义加速端点
  const ep = localStorage.getItem('ss_ep');
  if (ep) GH.extra = [ep];

  setLd(55, '正在连接云端…');
  await Net.init().catch(() => {});
  setLd(78, Net.online ? '云端已连接' : '离线模式（仍可畅玩）');

  setLd(100, '准备就绪');
  setTimeout(() => {
    $('#loading').style.display = 'none';
    const s = localStorage.getItem('ss_session');
    if (s) {
      try { const ss = JSON.parse(s); $('#lgName').value = ss.name || ''; $('#lgPwd').value = ss.pwd || ''; } catch (e) {}
    }
    $('#login').classList.add('on');
    $('#lgNet').textContent = (Net.online ? '● 已连接 ' : '○ 离线 ') + Net.endpoint.replace('https://', '');
  }, 500);

  bindLogin(); bindCreate(); bindGame();
});

/* ================= 登录 ================= */
function bindLogin() {
  $('#btnLogin').onclick = doLogin;
  $('#lgPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const name = ($('#lgName').value || '').trim();
  const pwd = ($('#lgPwd').value || '').trim();
  if (name.length < 2) return UI.toast('道号至少 2 个字', 'err');
  if (!pwd) return UI.toast('请填写口令', 'err');

  const btn = $('#btnLogin');
  btn.disabled = true; btn.textContent = '连接中…';

  const uid = uidOf(name);
  PPATH = 'data/ss/players/' + uid + '.json';

  // 先读本地（秒开），再后台尝试云端覆盖
  let p = null;
  const local = localStorage.getItem('ss_local_' + uid);
  if (local) { try { p = JSON.parse(local); } catch (e) { p = null; } }
  try { const r = await Net.read(PPATH, true); if (r && r.data && r.data.uid) p = r.data; } catch (e) {}
  if (!p) {
    try { const r2 = await Net.read(PPATH); if (r2 && r2.data) p = r2.data; } catch (e) {}
  }
  if (p && p.pwd && p.pwd !== E.hash(pwd)) {
    btn.disabled = false; btn.textContent = '进 入 星 海';
    return UI.toast('口令有误', 'err');
  }
  if (!p || !p.root) {
    // 新角色
    window.__NEW = { uid, name, pwd };
    $('#login').classList.remove('on');
    $('#create').classList.add('on');
    renderCreate();
    btn.disabled = false; btn.textContent = '进 入 星 海';
    return;
  }
  enterGame(p, name, pwd);
}

function uidOf(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0; }
  return 'u' + (h >>> 0).toString(36);
}

/* ================= 创角 ================= */
function bindCreate() {
  $('#btnCreate').onclick = () => {
    const nw = window.__NEW; if (!nw) return;
    const p = E.newPlayer(nw.uid, nw.name, nw.pwd, {
      root: UI.crRoot, gender: UI.crGender, avatar: UI.crAvatar,
    });
    $('#create').classList.remove('on');
    enterGame(p, nw.name, nw.pwd);
    UI.toast('道体已成，踏入乱星海！', 'ok');
  };
}

function renderCreate() {
  UI.crGender = 'm'; UI.crRoot = '金'; UI.crAvatar = '🧙';
  $('#crGender').innerHTML = EX.genders.map((g) =>
    `<button class="cr-chip ${g.k === 'm' ? 'on' : ''}" data-gd="${g.k}">${g.n}</button>`).join('');
  const drawRoots = () => {
    $('#crRoot').innerHTML = EX.roots.map((r) =>
      `<button class="cr-chip ${r.k === UI.crRoot ? 'on' : ''}" data-rt="${r.k}" style="border-color:${r.k === UI.crRoot ? r.c : ''}">${r.n}</button>`).join('');
    $$('#crRoot [data-rt]').forEach((b) => b.onclick = () => { UI.crRoot = b.dataset.rt; drawRoots(); drawInfo(); });
  };
  const drawInfo = () => {
    const r = EX.roots.find((x) => x.k === UI.crRoot);
    $('#crInfo').innerHTML = `<b style="color:${r.c}">${r.n}</b><br>${r.desc}`;
  };
  const drawAvatar = () => {
    const g = EX.genders.find((x) => x.k === UI.crGender) || EX.genders[0];
    UI.crAvatar = g.icons[0];
    $('#crFig').textContent = UI.crAvatar;
  };
  $$('#crGender [data-gd]').forEach((b) => b.onclick = () => {
    UI.crGender = b.dataset.gd;
    $$('#crGender .cr-chip').forEach((x) => x.classList.toggle('on', x.dataset.gd === UI.crGender));
    drawAvatar();
  });
  drawRoots(); drawInfo(); drawAvatar();
}

/* ================= 进入游戏 ================= */
async function enterGame(p, name, pwd) {
  P = p; UI.P = p;
  sessionStart = Date.now();
  localStorage.setItem('ss_session', JSON.stringify({ name, pwd }));

  $('#login').classList.remove('on');
  $('#game').classList.add('on');

  // 离线收益
  const last = p.lastTick || p.lastSeen || Date.now();
  const mins = Math.floor((Date.now() - last) / 60000);
  if (mins >= 2) {
    const r = E.offline(p, mins);
    if (r) {
      UI.toast(`离线 ${Math.floor(r.minutes / 60)}小时${r.minutes % 60}分：修为+${E.fmt(r.exp)} 灵石+${E.fmt(r.stone)}`, 'ok');
      if (r.up > 0) UI.toast('离线期间修为精进！', 'ok');
    }
  }
  p.lastTick = Date.now();
  if (!p.hp) p.hp = E.maxHp(p);
  if (!p.mp) p.mp = E.maxMp(p);

  UI.setScene(p.map || 'M1');
  UI.hud();
  initBotNav();
  renderWheel();
  UI.chat('欢迎来到乱星海，' + p.name + '！', true);

  // 检查头像解锁
  checkUnlocks(p);

  startLoops();
  save();
}

/* 境界解锁头像/称号 */
function checkUnlocks(p) {
  EX.avatars.forEach((a) => { if (p.realm >= a.need && !(p.avatars || []).includes(a.id)) (p.avatars = p.avatars || []).push(a.id); });
  const tMap = { 5: 'T05', 9: 'T09' };
  for (const k in tMap) if (p.realm >= +k && !(p.titles || []).includes(tMap[k])) (p.titles = p.titles || []).push(tMap[k]);
}

/* ================= 主循环 ================= */
function startLoops() {
  if (tickTimer) clearInterval(tickTimer);
  if (saveTimer) clearInterval(saveTimer);

  // 每秒 tick：修为、灵石、灵力回复
  tickTimer = setInterval(() => {
    if (!P) return;
    const up = E.tick(P, 1);
    P.stats.online = (P.stats.online || 0) + 1;
    if (up > 0) { UI.toast('修为精进', 'ok'); checkUnlocks(P); }
    UI.hud();
  }, 1000);

  // 每 30 秒保存
  saveTimer = setInterval(() => save(), 30000);

  // 每 5 分钟检查解锁
  setInterval(() => checkUnlocks(P), 300000);
}

/* ================= 存档 ================= */
async function save() {
  if (!P) return;
  P.lastSeen = Date.now();
  P.lastTick = Date.now();
  localStorage.setItem('ss_local_' + P.uid, JSON.stringify(P));
  if (Net.online) {
    await Net.write(PPATH, P, '[bot] save ' + P.name);
    // 更新排行榜（本地合并，Actions 也会汇总）
    updateLeaderboard();
  }
}

async function updateLeaderboard() {
  try {
    const r = await Net.read('data/ss/leaderboard.json');
    const d = (r && r.data) || { list: [] };
    d.list = d.list || [];
    const i = d.list.findIndex((x) => x.uid === P.uid);
    const rec = { uid: P.uid, name: P.name, realm: CFG.realmName(P.realm), power: E.power(P), at: Date.now() };
    if (i >= 0) d.list[i] = rec; else d.list.push(rec);
    d.list.sort((a, b) => b.power - a.power);
    if (d.list.length > 100) d.list.length = 100;
    await Net.write('data/ss/leaderboard.json', d, '[bot] leaderboard ' + P.name);
  } catch (e) {}
}

/* ================= 游戏内交互绑定 ================= */
function bindGame() {
  // 关闭面板
  $('#pnClose').onclick = () => UI.close();
  $('#pnMask').onclick = () => UI.close();

  // 头像 → 角色
  $('#tbAvatar').onclick = () => UI.open('role', '属性');
  // 任务栏
  $('#taskbar').onclick = () => UI.open('quest', '主线');
  // 右上角
  $('#btnMap').onclick = () => UI.open('map');
  $('#btnAct').onclick = () => UI.open('act');
  $('#btnRank').onclick = () => UI.open('rank');

  // 战斗按钮
  $('#skAtk').onclick = () => { if (BT.on) BT.attack(); else startWild(); };
  $$('#skillbar .sk-btn[data-sk]').forEach((b) => b.onclick = () => {
    if (BT.on) BT.skill(+b.dataset.sk);
    else UI.toast('未在战斗中', 'err');
  });
  $('#skPet').onclick = () => { if (BT.on) BT.pet(); else UI.open('pet'); };
  $('#skPup').onclick = () => { if (BT.on) BT.puppet(); else UI.open('puppet'); };
  $('#btnAuto').onclick = () => {
    if (!BT.on) { startWild(); return; }
    BT.setAuto(!BT.auto);
    UI.toast(BT.auto ? '自动战斗开启' : '自动战斗关闭', 'ok');
  };
  $('#btnFlee').onclick = () => { if (BT.on) BT.flee(); };

  // 无敌挂机：不在战斗时点普攻开始打野
  $('#scene').onclick = () => { if (!BT.on) startWild(); };
}

/* 开始打野怪 */
function startWild() {
  if (!P || BT.on) return;
  const pool = CFG.wildByRealm(P.realm);
  if (!pool.length) return UI.toast('暂无可挑战妖兽', 'err');
  const m = pool[Math.floor(Math.random() * pool.length)];
  BT.start(P, m, { mul: 1 });
  UI.chat('遭遇【' + m.name + '】', true);
}

/* ================= 右下圆盘菜单 ================= */
function renderWheel() {
  const items = [
    { k: 'realm', i: '⚡', n: '境界' },
    { k: 'quest', i: '📜', n: '任务' },
    { k: 'dungeon', i: '🏛️', n: '副本' },
    { k: 'cave', i: '🏠', n: '洞府' },
    { k: 'skill', i: '📕', n: '功法' },
    { k: 'forge', i: '🔨', n: '炼器' },
    { k: 'pet', i: '🐾', n: '灵宠' },
    { k: 'puppet', i: '🗿', n: '傀儡' },
    { k: 'partner', i: '👥', n: '伙伴' },
    { k: 'shop', i: '🏪', n: '坊市' },
    { k: 'sect', i: '🏯', n: '仙盟' },
    { k: 'bag', i: '🎒', n: '背包' },
    { k: 'codex', i: '📖', n: '图鉴' },
    { k: 'guide', i: '❓', n: '指南' },
    { k: 'set', i: '⚙️', n: '设置' },
  ];
  const box = $('#whItems');
  box.innerHTML = items.map((it, idx) =>
    `<button class="wh-it" data-w="${it.k}" data-idx="${idx}">${it.i}<em>${it.n}</em></button>`).join('');

  // 环形排布：以圆盘为中心，向上+左侧扇形展开
  const R = 96;
  $$('#whItems .wh-it').forEach((b) => {
    const idx = +b.dataset.idx;
    // 从正上方逆时针到正左方（90° → 180°）
    const ang = (90 + idx * (90 / Math.max(1, items.length - 1))) * Math.PI / 180;
    const x = -Math.cos(ang) * R;
    const y = -Math.sin(ang) * R;
    b.dataset.tx = x.toFixed(1); b.dataset.ty = y.toFixed(1);
  });

  const main = $('#whMain');
  main.onclick = () => {
    const on = box.classList.toggle('on');
    main.classList.toggle('on', on);
    $$('#whItems .wh-it').forEach((b) => {
      if (on) { b.style.transform = `translate(${b.dataset.tx}px,${b.dataset.ty}px) scale(1)`; }
      else { b.style.transform = 'translate(0,0) scale(.3)'; }
    });
  };

  $$('#whItems .wh-it').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    UI.open(b.dataset.w);
    box.classList.remove('on'); main.classList.remove('on');
    $$('#whItems .wh-it').forEach((x) => x.style.transform = 'translate(0,0) scale(.3)');
  });
}

/* ================= 底部主功能栏（图32） ================= */
function initBotNav() {
  const nav = $('#botnav'); if (!nav) return;
  $$('#botnav .bn-item').forEach((b) => b.onclick = () => {
    const k = b.dataset.p;
    $$('#botnav .bn-item').forEach((x) => x.classList.toggle('on', x === b));
    // 至宝/化灵 映射到已有面板
    const MAP = { treasure: 'bag', pet: 'pet', partner: 'partner', role: 'role', forge: 'forge', cave: 'cave', skill: 'skill' };
    UI.open(MAP[k] || k);
  });
}

/* ================= 全局暴露 ================= */
window.save = save;
window.startWild = startWild;
window.getP = () => P;
