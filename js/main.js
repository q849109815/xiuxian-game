/* =========================================================
 * main.js —— 启动、登录、主循环、战斗流程、存档
 * ========================================================= */

let P = null;              // 当前玩家
let PPATH = '';            // 存档路径
let lastSaveAt = 0;
let autoFight = false;
let fighting = false;

/* ---------------- 启动 ---------------- */
window.addEventListener('load', async () => {
  UI.initBackground();
  bindTabs();
  bindSettings();
  UI.renderNet();
  $('#lgNet').textContent = '检测中…';
  Net.probe().then(() => { UI.renderNet(); $('#lgNet').textContent = Net.endpoint.replace('https://', '') + '（' + (Net.online ? '可用' : '不可用') + '）'; });

  $('#btnLogin').onclick = doLogin;
  $('#lgPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

  // 读取云端配置（拿不到就用内置默认）
  try {
    window.GAME_CONFIG = await readJSON('data/config/game.json') || await (await fetch('data/../data/config/game.json')).json();
  } catch (e) { window.GAME_CONFIG = await fallbackConfig(); }
  try { window.NOTICE = await readJSON('data/config/notice.json') || { notice: '', events: {} }; } catch (e) { window.NOTICE = { notice: '', events: {} }; }
  UI.renderNotice();

  // 恢复上次登录
  const saved = localStorage.getItem('xx_session');
  if (saved) { const s = JSON.parse(saved); $('#lgName').value = s.name; $('#lgPwd').value = s.pwd || ''; }
});

async function fallbackConfig() {
  try { return await (await fetch('data/config/game.json')).json(); } catch (e) { return null; }
}

/* ---------------- 登录 ---------------- */
async function doLogin() {
  const name = $('#lgName').value.trim();
  const pwd = $('#lgPwd').value.trim();
  if (name.length < 2) return UI.toast('道号至少 2 个字', 'err');
  if (!pwd) return UI.toast('请填写口令', 'err');
  $('#btnLogin').disabled = true; $('#btnLogin').textContent = '连接中…';
  const uid = hashUid(name);
  PPATH = playerPath(uid);
  try {
    let p = null;
    try { p = await readJSON(PPATH, { useCache: !Net.online }); } catch (e) { p = null; }
    if (p && p.pwd && p.pwd !== hashPwd(pwd)) {
      $('#btnLogin').disabled = false; $('#btnLogin').textContent = '登录 / 创建';
      return UI.toast('口令有误', 'err');
    }
    if (!p) {
      p = ENGINE.newPlayer(name, uid);
      p.pwd = hashPwd(pwd);
      try { await writeJSON(PPATH, p, 'create player ' + name); }
      catch (e) { UI.toast('云端未连通，先以离线模式开档', 'err'); }
      UI.toast('开坛立道成功，道号【' + name + '】');
    } else {
      if (!p.pwd) p.pwd = hashPwd(pwd);
      UI.toast('欢迎回来，' + p.name);
    }
    P = p;
    localStorage.setItem('xx_session', JSON.stringify({ name, pwd }));
    enterGame();
  } catch (e) {
    console.error(e);
    UI.toast('连接失败，请检查网络或 Token 配置', 'err');
  } finally {
    $('#btnLogin').disabled = false; $('#btnLogin').textContent = '登录 / 创建';
  }
}

function enterGame() {
  $('#login').style.display = 'none';
  $('#app').style.display = '';
  // 离线收益
  const off = ENGINE.offlineSettle(P);
  if (off.seconds > 60) {
    UI.pushLog(`离线 ${Math.round(off.seconds / 60)} 分钟，自动打坐获得 ${fmt(off.exp)} 修为`, 'sys');
    UI.toast(`离线收益：+${fmt(off.exp)} 修为`);
    if (off.ups > 0) { UI.flashBreakthrough(); UI.toast(`闭关有所领悟，连破 ${off.ups} 层！`); }
  }
  P.lastSeen = Date.now();
  UI.renderHUD(P); UI.renderAttrs(P); UI.renderMaps(P); UI.renderBag(P); UI.renderNet();
  UI.startQi();
  loadRank();
  setInterval(tick, 1000);
  setInterval(() => save(), 30000);           // 30 秒自动存档
  setInterval(() => { Net.flushQueue().then((n) => { if (n) { UI.renderNet(); UI.toast('已补传 ' + n + ' 份存档'); } }); }, 20000);
  setInterval(() => { readJSON('data/config/notice.json').then((n) => { if (n) { window.NOTICE = n; UI.renderNotice(); } }).catch(() => {}); }, 120000);
  window.addEventListener('beforeunload', () => save(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  save();
}

/* ---------------- 主循环 ---------------- */
function tick() {
  if (!P) return;
  P.lastSeen = Date.now();
  const fps = ENGINE.expPerSec(P);
  const ups = ENGINE.gainExp(P, fps);
  P.lastTick = Date.now();
  UI.renderHUD(P);
  if (ups > 0) {
    UI.toast(`修为圆满，突破至 ${ENGINE.realmName(P)}！`);
    UI.flashBreakthrough();
    UI.renderAttrs(P); UI.renderMaps(P);
    save();
  }
  if (document.querySelector('[data-page="cult"]').style.display !== 'none') UI.renderAttrs(P);
}

/* ---------------- 存档 ---------------- */
async function save(sync = false) {
  if (!P) return;
  P.lastSeen = Date.now(); P.lastTick = Date.now();
  try {
    await writeJSON(PPATH, P, 'save ' + P.name);
    lastSaveAt = Date.now();
    $('#setSaveAt').textContent = new Date().toLocaleTimeString();
    UI.renderNet();
  } catch (e) {
    localStorage.setItem('xx_local_' + P.uid, JSON.stringify(P)); // 本地兜底
    UI.renderNet();
    if (sync) UI.toast('存档已存本地，联网后自动补传', 'err');
  }
}

/* ---------------- 修炼 / 突破 ---------------- */
$('#btnMeditate') && (document.addEventListener('click', (e) => {
  if (e.target.id === 'btnMeditate') {
    const s = ENGINE.expPerSec(P);
    ENGINE.gainExp(P, s * 60);
    UI.toast('入定一小时，+' + fmt(s * 60) + ' 修为');
    UI.renderHUD(P); UI.renderAttrs(P);
    save();
  }
  if (e.target.id === 'btnBreak') {
    const r = ENGINE.breakthrough(P);
    UI.toast(r.msg, r.ok ? '' : 'err');
    if (r.ok) { UI.flashBreakthrough(); UI.renderMaps(P); }
    UI.renderHUD(P); UI.renderAttrs(P);
    save();
  }
}));

/* ---------------- 战斗 ---------------- */
document.addEventListener('click', async (e) => {
  if (e.target.id === 'btnFight') { await runBattle(); }
  if (e.target.id === 'btnAuto') {
    autoFight = !autoFight;
    e.target.textContent = autoFight ? '⏹ 停止挂机' : '🤖 自动挂机';
    e.target.className = autoFight ? 'act' : 'ghost';
    if (autoFight) runBattle();
  }
});

async function runBattle() {
  if (fighting || !P) return;
  fighting = true;
  const mi = UI.curMap;
  const map = GAME_CONFIG.maps[mi];
  const mon = map.monsters[Math.floor(Math.random() * map.monsters.length)];
  const monHp = Math.round(mon.hp * (1 + P.realm * 0.15));
  const monster = { ...mon, hp: monHp };
  const a = ENGINE.attrs(P);

  UI.clearLog();
  UI.pushLog(`踏入【${map.name}】，遭遇 ${mon.icon} ${mon.name}！`, 'sys');
  UI.setFighters('🧙', mon.icon, mon.name);
  UI.hpBar('me', a.hp, a.hp);
  UI.hpBar('foe', monster.hp, monster.hp);

  const res = ENGINE.battle(P, monster, mi);

  // 逐回合播放动画
  let php = a.hp, mhp = monster.hp;
  for (const lg of res.logs) {
    await sleep(lg.heal ? 300 : 520);
    if (lg.who === 'p') {
      UI.hitAnim($('#fMe'), 'attack');
      setTimeout(() => { UI.boom(false); UI.hitAnim($('#fFoe'), 'hurt'); UI.shake(); }, 180);
      mhp = lg.mhp !== undefined ? lg.mhp : mhp;
      UI.hpBar('foe', mhp, monster.hp);
      UI.floatNum(false, '-' + (lg.text.match(/(\d+)/) || [0])[1] + (lg.crit ? ' 暴击!' : ''), lg.crit ? 'crit' : '');
    } else {
      UI.hitAnim($('#fFoe'), 'attack');
      setTimeout(() => { UI.boom(true); UI.hitAnim($('#fMe'), 'hurt'); UI.shake(); }, 180);
      php = lg.php !== undefined ? lg.php : php;
      UI.hpBar('me', php, a.hp);
      UI.floatNum(true, '-' + (lg.text.match(/(\d+)/) || [0])[1], '');
    }
    UI.pushLog(lg.text, lg.who === 'p' ? 'p' : 'm');
  }

  const rw = ENGINE.battleReward(P, mi, res.win);
  UI.pushLog(res.win
    ? `✔ ${mon.name} 伏诛！获得 ${fmt(rw.exp)} 修为、${fmt(rw.stone)} 灵石${rw.drops.length ? '、' + rw.drops.map((d) => d.name).join('、') : ''}`
    : `✘ 不敌 ${mon.name}，重伤逃遁（获得 ${fmt(rw.exp)} 修为）`, 'sys');
  if (res.win) {
    UI.hitAnim($('#fFoe'), 'hurt');
    $('#fFoe').style.opacity = .25;
    setTimeout(() => { $('#fFoe').style.opacity = 1; }, 800);
  }
  UI.renderHUD(P); UI.renderAttrs(P); UI.renderBag(P);

  // 战斗日志（本地留存最近 20 条）
  const hist = JSON.parse(localStorage.getItem('xx_hist') || '[]');
  hist.unshift({ t: Date.now(), txt: `${res.win ? '胜' : '败'} · ${mon.name} · +${fmt(rw.exp)}修为 +${fmt(rw.stone)}灵石` });
  localStorage.setItem('xx_hist', JSON.stringify(hist.slice(0, 20)));
  $('#histBox').innerHTML = hist.map((h) => `<p class="${h.txt.startsWith('胜') ? 'p' : 'm'}">${new Date(h.t).toLocaleTimeString()} ${h.txt}</p>`).join('');

  fighting = false;
  if (autoFight) { setTimeout(() => runBattle(), 700); }
  else save();
  if (P.stats.battles % 5 === 0) save();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 背包操作 ---------------- */
function onEnhance(p, slot) {
  const it = p.equip[slot]; if (!it) return;
  const r = ENGINE.enhance(p, it);
  UI.toast(r.msg, r.ok ? 'ok' : 'err');
  UI.renderBag(p); UI.renderHUD(p); UI.renderAttrs(p);
  if (r.ok) save();
}
function onUseItem(p, id) {
  const it = p.bag.find((x) => x.id === id); if (!it) return;
  if (it.kind === 'equip') { ENGINE.equipItem(p, it); UI.toast('已装备 ' + it.name); }
  else if (it.kind === 'pill') { const r = ENGINE.usePill(p, it); UI.toast(r.msg, r.ok ? 'ok' : 'err'); }
  else { const price = ENGINE.sellItem(p, it); UI.toast('出售获得 ' + price + ' 灵石'); }
  UI.renderBag(p); UI.renderHUD(p); UI.renderAttrs(p); save();
}
function onSell(p, id) {
  const it = p.bag.find((x) => x.id === id); if (!it) return;
  const price = ENGINE.sellItem(p, it);
  UI.toast('出售获得 ' + price + ' 灵石');
  UI.renderBag(p); UI.renderHUD(p); save();
}
function onBuy(p, pillId) {
  const pl = GAME_CONFIG.pills.find((x) => x.id === pillId);
  if (p.stone < pl.price) return UI.toast('灵石不足', 'err');
  p.stone -= pl.price;
  ENGINE.addItem(p, { ...pl, id: 'pl_' + Math.random().toString(36).slice(2, 8), ref: pl.id, kind: 'pill' });
  UI.toast('购入 ' + pl.name);
  UI.renderBag(p); UI.renderHUD(p); save();
}

/* ---------------- Tab / 设置 ---------------- */
function bindTabs() {
  $$('.tabs button').forEach((b) => b.onclick = () => {
    $$('.tabs button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    $$('#pages section').forEach((s) => s.style.display = s.dataset.page === b.dataset.tab ? '' : 'none');
    if (b.dataset.tab === 'rank') loadRank();
    if (b.dataset.tab === 'bag') UI.renderBag(P);
    if (b.dataset.tab === 'cult') UI.renderAttrs(P);
    if (b.dataset.tab === 'info') {
      const hist = JSON.parse(localStorage.getItem('xx_hist') || '[]');
      $('#histBox').innerHTML = hist.map((h) => `<p class="${h.txt.startsWith('胜') ? 'p' : 'm'}">${new Date(h.t).toLocaleTimeString()} ${h.txt}</p>`).join('');
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.filter) { UI.bagFilter = e.target.dataset.filter; UI.renderBag(P); }
    if (e.target.id === 'btnCode') {
      const c = $('#codeInput').value;
      const r = ENGINE.redeemCode(P, c);
      UI.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { UI.renderHUD(P); UI.renderAttrs(P); save(); }
    }
  });
}

async function loadRank() {
  try {
    const d = await readJSON('data/leaderboard.json');
    UI.renderRank(d && d.list);
  } catch (e) { UI.renderRank(null); }
}

function bindSettings() {
  const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  bind('#btnProbe', async () => { UI.toast('测速中…'); await Net.probe(); UI.renderNet(); UI.toast('已切换到 ' + Net.endpoint.replace('https://', '')); });
  bind('#btnFlush', async () => { const n = await Net.flushQueue(); UI.renderNet(); UI.toast(n ? '补传 ' + n + ' 份' : '没有待传存档'); });
  bind('#btnReset', () => { Net.reset(); UI.toast('通道已重置，重新测速'); Net.probe().then(UI.renderNet); });
  bind('#btnSave', () => { save(); UI.toast('已保存到云端'); });
  bind('#btnLogout', () => { localStorage.removeItem('xx_session'); location.reload(); });
  bind('#btnSaveEp', () => {
    const list = $('#epsInput').value.split('\n').map((s) => s.trim()).filter(Boolean);
    Net.setExtra(list); UI.toast('已保存 ' + list.length + ' 个加速地址'); Net.probe().then(UI.renderNet);
  });
  const eps = JSON.parse(localStorage.getItem('xx_extra_ep') || '[]');
  $('#epsInput').value = eps.join('\n');
}
