/* =========================================================
 * main.js —— 启动、登录、角色创建、主循环、战斗与各模块交互
 * ========================================================= */

let P = null, PPATH = '';
let autoFight = false, fighting = false;
let lastSaveAt = 0;

const CFG_FILES = ['data/config/game.json', 'data/config/content.json', 'data/config/social.json'];

/* ---------------- 启动 ---------------- */
window.addEventListener('load', async () => {
  UI.initBackground();
  bindTabs(); bindSettings(); bindGlobal();
  UI.renderNet();

  // ① 先加载本地静态配置，保证秒开
  const [g, c, s] = await Promise.all(CFG_FILES.map(readStatic));
  if (g) window.GAME_CONFIG = g;
  if (c) window.GAME_CONTENT = c;
  if (s) window.GAME_SOCIAL = s;
  try { window.NOTICE = await readStatic('data/config/notice.json') || { notice: '', events: {} }; } catch (e) { window.NOTICE = { notice: '', events: {} }; }
  if (!window.GAME_CONFIG) { UI.toast('配置加载失败，请检查文件是否上传完整', 'err'); return; }

  $('#btnLogin').onclick = doLogin;
  $('#lgPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

  // ② 后台探云端并拉最新配置
  Net.probe().then(async () => {
    UI.renderNet();
    $('#lgNet').textContent = Net.endpoint.replace('https://', '') + '（' + (Net.online ? '可用' : '不可用 · 可离线玩') + '）';
    if (Net.online) {
      try {
        const [g2, c2, s2] = await Promise.all(CFG_FILES.map((f) => readJSON(f).catch(() => null)));
        if (g2) window.GAME_CONFIG = g2;
        if (c2) window.GAME_CONTENT = c2;
        if (s2) window.GAME_SOCIAL = s2;
        const n = await readJSON('data/config/notice.json').catch(() => null);
        if (n) window.NOTICE = n;
        UI.renderNet();
      } catch (e) { /* 忽略 */ }
    }
  });

  const saved = localStorage.getItem('xx_session');
  if (saved) { const ss = JSON.parse(saved); $('#lgName').value = ss.name; $('#lgPwd').value = ss.pwd || ''; }
});

async function readStatic(path) {
  try {
    const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
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
    if (!window.GAME_CONFIG) window.GAME_CONFIG = await readStatic('data/config/game.json');
    let p = null;
    try { p = await readJSON(PPATH, { useCache: true }); } catch (e) { p = null; }
    if (!p) { const local = localStorage.getItem('xx_local_' + uid); if (local) { try { p = JSON.parse(local); } catch (e) { p = null; } } }
    if (p && p.pwd && p.pwd !== hashPwd(pwd)) {
      $('#btnLogin').disabled = false; $('#btnLogin').textContent = '登录 / 创建';
      return UI.toast('口令有误', 'err');
    }
    if (!p || !p.root || p.needCreate) {
      // 新角色 → 创建界面
      window.__NEW = { uid, name, pwd };
      UI.CR.gender = 'm'; UI.CR.avatar = (GAME_CONFIG.genders[0].icons || ['🧙'])[0];
      UI.CR.root = ENGINE.rollRoot(); UI.CR.sect = null;
      $('#login').style.display = 'none';
      $('#create').style.display = 'flex';
      UI.renderCreate();
      bindCreate();
      $('#btnLogin').disabled = false; $('#btnLogin').textContent = '登录 / 创建';
      return;
    }
    P = ENGINE.migrate(p); window.P = P;
    localStorage.setItem('xx_session', JSON.stringify({ name, pwd }));
    await enterGame();
  } catch (e) {
    console.error(e); UI.toast('连接失败，请检查网络或配置', 'err');
  } finally {
    $('#btnLogin').disabled = false; $('#btnLogin').textContent = '登录 / 创建';
  }
}

function bindCreate() {
  $('#btnReroll').onclick = () => { UI.CR.root = ENGINE.rollRoot(); UI.renderCreate(); };
  $('#btnCreate').onclick = async () => {
    const nw = window.__NEW; if (!nw) return;
    const p = ENGINE.newPlayer(nw.name, nw.uid, { gender: UI.CR.gender, avatar: UI.CR.avatar, root: UI.CR.root, sect: UI.CR.sect });
    p.pwd = hashPwd(nw.pwd);
    if (UI.CR.sect) p.sectInfo = { id: UI.CR.sect, rankIdx: 0, contrib: 0, joinedAt: Date.now() };
    P = p; window.P = P; PPATH = playerPath(nw.uid);
    localStorage.setItem('xx_session', JSON.stringify({ name: nw.name, pwd: nw.pwd }));
    $('#create').style.display = 'none';
    try { await writeJSON(PPATH, P, 'create player ' + nw.name); }
    catch (e) { UI.toast('云端未连通，先以离线模式开档', 'err'); }
    if (UI.CR.sect) { await SYS.joinSect(P, UI.CR.sect).catch(() => {}); }
    UI.toast(`开坛立道，${ENGINE.rootInfo(P).name}·${P.name}`);
    await enterGame();
  };
}

/* ---------------- 进入游戏 ---------------- */
async function enterGame() {
  SYS.refreshDaily(P);
  const off = ENGINE.offlineSettle(P);
  $('#login').style.display = 'none';
  $('#app').style.display = '';
  if (off.seconds > 60) {
    UI.toast(`离线 ${Math.round(off.seconds / 60)} 分钟，得 ${UI.fmt(off.exp)} 修为`);
    if (off.ups > 0) { UI.flashBreakthrough(); UI.toast(`闭关领悟，连破 ${off.ups} 阶！`); }
  }
  // 洞府离线产出也顺带提示
  const caveHrs = (Date.now() - (P.cave.lastHarvest || Date.now())) / 3600000;
  if (caveHrs > 0.5) SYS.applyReward(P, {});

  renderAll();
  UI.startQi();
  loadRank();
  UI.renderChat();

  setInterval(tick, 1000);
  setInterval(() => save(), 30000);
  setInterval(() => { Net.flushQueue().then((n) => { if (n) { UI.renderNet(); UI.toast('已补传 ' + n + ' 份存档'); } }); }, 20000);
  setInterval(() => { readJSON('data/config/notice.json').then((n) => { if (n) { window.NOTICE = n; UI.renderNotice(); } }).catch(() => {}); }, 120000);
  setInterval(() => { if (UI.CUR_WIN === 'social') UI.renderChat(); }, 30000);
  window.addEventListener('beforeunload', () => save(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  save();
}

function renderAll() {
  UI.renderHUD(P); UI.renderAttrs(P); UI.renderMeditate(P); UI.renderSpots(P);
  UI.renderMaps(P); UI.renderDungeons(P); UI.renderEquip(P); UI.renderBag(P);
  UI.renderSkills(P); UI.renderAlchemy(P); UI.renderBeasts(P); UI.bindBeastButtons(P);
  UI.renderCave(P); UI.renderSect(P); UI.renderTasks(P); UI.renderArena(P);
  UI.renderMarket(P); UI.renderSocial(P); UI.renderNet(); UI.renderNotice();
  UI.renderTracker(P); UI.renderMini(P);
  $('#setRoot').textContent = ENGINE.rootInfo(P).name;
  $('#setKarma').textContent = P.karma || 0;
  $('#setReinc').textContent = `第 ${P.reinc || 0} 世`;
}

function tick() {
  if (!P) return;
  P.lastSeen = Date.now();
  const ups = ENGINE.gainExp(P, ENGINE.expPerSec(P));
  P.lastTick = Date.now();
  UI.renderHUD(P); UI.renderMeditate(P);
  if (ups > 0) {
    UI.toast(`修为圆满，突破至 ${ENGINE.realmName(P)}！`);
    UI.flashBreakthrough(); UI.renderAttrs(P); UI.renderMaps(P); UI.renderSpots(P); save();
  }
  if (UI.CUR_WIN === 'role') UI.renderAttrs(P);
  if (UI.CUR_WIN === 'cave') UI.renderCave(P);
}

/* ---------------- 存档 ---------------- */
async function save(sync = false) {
  if (!P) return;
  P.lastSeen = Date.now(); P.lastTick = Date.now();
  try {
    await writeJSON(PPATH, P, 'save ' + P.name);
    lastSaveAt = Date.now();
    const el = $('#setSaveAt'); if (el) el.textContent = new Date().toLocaleTimeString();
    UI.renderNet();
  } catch (e) {
    localStorage.setItem('xx_local_' + P.uid, JSON.stringify(P));
    UI.renderNet();
    if (sync) UI.toast('存档已存本地，联网后自动补传', 'err');
  }
}

function toggleAuto(btn) {
  autoFight = !autoFight;
  const set = (el, on) => { if (!el) return; el.textContent = on ? '⏹ 停' : '🤖 挂机'; el.classList.toggle('on', on); };
  set(btn, autoFight);
  const b2 = $('#btnAuto'); if (b2) { b2.textContent = autoFight ? '⏹ 停止挂机' : '🤖 自动挂机'; b2.className = autoFight ? 'act' : 'ghost'; }
  $('#autoTag').classList.toggle('on', autoFight);
  if (autoFight) { UI.closeWin(); runBattle(); }
}

/* ---------------- 通用交互绑定 ---------------- */
const HOTKEY = { c: 'role', b: 'bag', t: 'task', s: 'skill', l: 'beast', h: 'cave', g: 'sect', m: 'market', f: 'social', v: 'alchemy', x: 'story', k: 'rank', z: 'set' };
function bindHotkeys() {
  document.addEventListener('keydown', (e) => {
    if (/input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape') return UI.closeWin();
    const k = (e.key || '').toLowerCase();
    if (HOTKEY[k]) { const w = HOTKEY[k]; UI.CUR_WIN === w ? UI.closeWin() : UI.openWin(w); e.preventDefault(); }
  });
}

function bindTabs() {
  UI.renderToolBar();
  UI.bindWinTabs();
  bindHotkeys();
  // 底部功能栏：点图标开关面板
  document.addEventListener('click', (e) => {
    const t = e.target.closest('#toolbar .tbtn[data-tab]');
    if (!t) return;
    const k = t.dataset.tab;
    if (UI.CUR_WIN === k) UI.closeWin(); else UI.openWin(k);
  });
  // 顶部设置按钮
  const ts = $('#btnTopSet'); if (ts) ts.onclick = () => { UI.CUR_WIN === 'set' ? UI.closeWin() : UI.openWin('set'); };
  // 关闭按钮（窗口头部 ×）
  $$('.win-hd .x').forEach((b) => b.onclick = () => UI.closeWin());
}

function bindGlobal() {
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.filter) { UI.bagFilter = t.dataset.filter; UI.renderBag(P); }
    if (t.dataset && t.dataset.mk) { UI.mkFilter = t.dataset.mk; UI.renderMarket(P); }
    if (t.id === 'btnMeditate') {
      const r = ENGINE.meditate(P);
      if (!r.ok) { UI.toast(r.msg, 'err'); return; }
      UI.toast(`闭关得 ${UI.fmt(r.gain)} 修为（冷却 ${Math.round(r.cd / 60)} 分钟）`);
      if (r.ups > 0) { UI.flashBreakthrough(); UI.toast(`闭关顿悟，连破 ${r.ups} 阶！`); }
      SYS.taskProgress(P, 'meditate', 1);
      UI.renderHUD(P); UI.renderAttrs(P); UI.renderTasks(P); save();
    }
    if (t.id === 'btnBreak') {
      const r = ENGINE.breakthrough(P);
      UI.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { UI.flashBreakthrough(); UI.renderMaps(P); UI.renderSpots(P); UI.renderDungeons(P); }
      UI.renderHUD(P); UI.renderAttrs(P); UI.renderTasks(P); save();
    }
    if (t.id === 'btnReinc') {
      if (!confirm('转世将重置境界与背包，仅保留少量修为与天赋，确认？')) return;
      const r = ENGINE.reincarnate(P);
      UI.toast(r.msg); UI.flashBreakthrough(); renderAll(); save();
    }
    if (t.id === 'btnFight') runBattle();
    if (t.id === 'tAuto') toggleAuto(document.getElementById('tAuto'));
    if (t.id === 'btnAuto') {
      autoFight = !autoFight;
      t.textContent = autoFight ? '⏹ 停止挂机' : '🤖 自动挂机';
      t.className = autoFight ? 'act' : 'ghost';
      if (autoFight) runBattle();
    }
    if (t.id === 'btnHarvest') {
      const r = SYS.harvestCave(P);
      UI.toast(r.msg, r.ok ? 'ok' : 'err'); UI.renderCave(P); UI.renderHUD(P); save();
    }
    if (t.id === 'btnCreateSect') onCreateSect();
    if (t.id === 'btnArena') onArena();
    if (t.id === 'btnChat') onChat();
    if (t.id === 'btnDaoLv') onBind('dao');
    if (t.id === 'btnMaster') onBind('master');
    if (t.id === 'btnRename') onRename();
    if (t.id === 'btnCode') {
      const r = ENGINE.redeemCode(P, $('#codeInput').value);
      UI.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { UI.renderHUD(P); UI.renderBag(P); save(); }
    }
  });
}

/* ---------------- 装备操作 ---------------- */
function onEquipAction(p, type, slot) {
  const it = p.equip[slot]; if (!it) return;
  const r = type === 'enhance' ? ENGINE.enhance(p, it) : ENGINE.temper(p, it);
  UI.toast(r.msg, r.ok ? 'ok' : 'err');
  UI.renderEquip(p); UI.renderHUD(p); UI.renderAttrs(p); save();
}
function onUseItem(p, id) {
  const it = p.bag.find((x) => x.id === id); if (!it) return;
  if (it.kind === 'equip') { ENGINE.equipItem(p, it); UI.toast('已装备 ' + it.name); }
  else if (it.kind === 'pill') { const r = ENGINE.usePill(p, it); UI.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.reroll) { $('#setRoot').textContent = ENGINE.rootInfo(p).name; renderAll(); } }
  else if (it.kind === 'talisman') { const r = SYS.useTalisman(p, it.ref || it.id); UI.toast(r.msg, r.ok ? 'ok' : 'err'); }
  else { const price = ENGINE.sellItem(p, it); UI.toast('出售获得 ' + price + ' 灵石'); }
  UI.renderEquip(p); UI.renderBag(p); UI.renderHUD(p); UI.renderAttrs(p); save();
}
function onSell(p, id) {
  const it = p.bag.find((x) => x.id === id); if (!it) return;
  const price = ENGINE.sellItem(p, it);
  UI.toast('出售获得 ' + UI.fmt(price) + ' 灵石');
  UI.renderBag(p); UI.renderHUD(p); save();
}
async function onMarketSell(p, id) {
  const it = p.bag.find((x) => x.id === id); if (!it) return;
  const def = Math.max(50, Math.round((it.price || 200) * 1.2));
  const v = prompt(`挂单售价（灵石）`, String(def));
  if (v === null) return;
  const r = await SYS.marketSell(p, id, parseInt(v, 10));
  UI.toast(r.msg, r.ok ? 'ok' : 'err');
  UI.renderBag(p); UI.renderMarket(p); save();
}
function onShopBuy(p, id) {
  const it = (GAME_SOCIAL.shop || []).find((x) => x.id === id);
  if (!it) return;
  if (p.stone < it.price) return UI.toast('灵石不足', 'err');
  p.stone -= it.price;
  SYS.applyReward(p, it.give);
  UI.toast('购入 ' + it.name, 'ok');
  UI.renderMarket(p); UI.renderHUD(p); UI.renderBag(P); UI.renderBeasts(P); save();
}

/* ---------------- 战斗 ---------------- */
async function runBattle() {
  if (fighting || !P) return;
  fighting = true;
  const mi = UI.curMap;
  const map = GAME_CONFIG.maps[mi];
  const mon = map.monsters[Math.floor(Math.random() * map.monsters.length)];
  const monster = { ...mon, hp: Math.round(mon.hp * (1 + P.realm * 0.15)) };
  const a = ENGINE.attrs(P);

  UI.clearLog();
  UI.pushLog(`踏入【${map.name}】，遭遇 ${mon.icon} ${mon.name}！`, 'sys');
  UI.setFighters(P.avatar || '🧙', mon.icon, mon.name);
  UI.hpBar('me', a.hp, a.hp); UI.hpBar('foe', monster.hp, monster.hp);

  const res = ENGINE.battle(P, monster, mi);
  let php = a.hp, mhp = monster.hp;
  for (const lg of res.logs) {
    await sleep(lg.heal ? 300 : 480);
    if (lg.who === 'p' || lg.who === 'b') {
      if (lg.who === 'p') UI.hitAnim($('#fMe'), 'attack');
      setTimeout(() => { UI.boom(false); UI.hitAnim($('#fFoe'), 'hurt'); UI.shake(); }, 170);
      mhp = lg.mhp !== undefined ? lg.mhp : mhp;
      UI.hpBar('foe', mhp, monster.hp);
      if (!lg.miss) UI.floatNum(false, '-' + (String(lg.text).match(/(\d+)/) || [0])[1] + (lg.crit ? ' 暴击!' : ''), lg.crit ? 'crit' : '');
    } else {
      UI.hitAnim($('#fFoe'), 'attack');
      setTimeout(() => { UI.boom(true); UI.hitAnim($('#fMe'), 'hurt'); UI.shake(); }, 170);
      php = lg.php !== undefined ? lg.php : php;
      UI.hpBar('me', php, a.hp);
      if (!lg.miss) UI.floatNum(true, '-' + (String(lg.text).match(/(\d+)/) || [0])[1], '');
    }
    UI.pushLog(lg.text, lg.who === 'p' ? 'p' : lg.who === 'b' ? 'sys' : 'm');
  }

  const rw = ENGINE.battleReward(P, mi, res.win, monster);
  UI.pushLog(res.win ? `✔ ${monster.name} 伏诛！${UI.fmt(rw.exp)} 修为、${UI.fmt(rw.stone)} 灵石${rw.drops.length ? '、' + rw.drops.map((d) => d.name).join('、') : ''}` : `✘ 不敌 ${monster.name}，逃遁（${UI.fmt(rw.exp)} 修为）`, 'sys');
  if (rw.ups > 0) { UI.flashBreakthrough(); UI.toast(`战斗中顿悟，连破 ${rw.ups} 阶！`); UI.renderMaps(P); UI.renderSpots(P); }

  // 任务进度
  SYS.taskProgress(P, 'exp', rw.exp);
  if (res.win) {
    SYS.taskProgress(P, 'kill', 1);
    P.tasks.bounty.prog[monster.name] = (P.tasks.bounty.prog[monster.name] || 0) + 1;
    const b = (GAME_SOCIAL.tasks.bounty || []).find((x) => x.map === map.id);
    if (b) P.tasks.bounty.prog[b.id] = (P.tasks.bounty.prog[b.id] || 0) + 1;
  }

  // 奇遇
  const enc = SYS.rollEncounter(P, mi);
  if (enc) {
    UI.pushLog(`${enc.icon} 奇遇：${enc.text}`, 'sys', '#encBox');
    if (enc.type === 'reward') {
      const got = [];
      if (enc.gotStone) got.push(`${UI.fmt(enc.gotStone)} 灵石`);
      if (enc.gotExp) got.push(`${UI.fmt(enc.gotExp)} 修为`);
      if (enc.gotHerb) got.push('灵草');
      if (enc.gotOre) got.push('矿石');
      UI.pushLog(`　→ 获得 ${got.join('、')}`, 'sys', '#encBox');
      UI.toast(`奇遇！获得 ${got.join('、')}`);
    }
    if (enc.type === 'chat') UI.pushLog(`　→ 「${enc.line}」`, 'sys', '#encBox');
    if (enc.type === 'beast' && enc.beastRef) {
      const r = SYS.captureBeast(P, enc.beastRef);
      UI.pushLog(`　→ ${r.msg}`, r.ok ? 'p' : 'm', '#encBox');
      UI.toast(r.msg, r.ok ? 'ok' : 'err');
    }
    if (enc.type === 'dungeon') UI.pushLog('　→ 获得一次秘境资格（秘境页可直接进入）', 'sys', '#encBox');
    if (enc.type === 'battle') UI.toast('遇袭！', 'err');
  }

  renderAll();
  fighting = false;
  if (autoFight) {
    $('#autoTag').classList.add('on');
    setTimeout(() => runBattle(), 700);
  } else {
    $('#autoTag').classList.remove('on');
    if (P.stats.battles % 5 === 0) save();
  }
}


/* ---------------- 秘境 ---------------- */
function onEnterDungeon(p, did) {
  const d = SYS.dungeonDef(did);
  if (!d) return;
  if (p.realm < d.minRealm) return UI.toast('境界不足', 'err');
  UI.clearLog('#dungeonLog');
  UI.pushLog(`进入【${d.name}】…`, 'sys', '#dungeonLog');
  const r = SYS.runDungeon(p, did);
  for (const w of r.rounds) UI.pushLog(`第 ${w.wave} 波 ${w.icon} ${w.monster}：${w.win ? '✔ 胜（' + w.round + ' 回合）' : '✘ 败'}`, w.win ? 'p' : 'm', '#dungeonLog');
  if (r.win) {
    UI.toast(`通关【${d.name}】！`, 'ok');
    UI.pushLog(`奖励：${UI.rewardTxt(r.reward)}${r.skill ? '、功法【' + r.skill + '】' : ''}${r.beast ? '、灵兽【' + r.beast + '】' : ''}`, 'sys', '#dungeonLog');
    UI.flashBreakthrough();
    SYS.taskProgress(p, 'dungeon', 1);
  } else {
    UI.toast('秘境挑战失败', 'err');
  }
  renderAll(); save();
}

/* ---------------- 论道台 ---------------- */
async function loadRank() {
  let d = null;
  try { d = await readJSON('data/leaderboard.json'); } catch (e) { d = null; }
  if (!d) d = await readStatic('data/leaderboard.json');
  window.__RANK = (d && d.list) || [];
  UI.renderRank(window.__RANK);
}
async function onArena() {
  if (!window.__RANK || !window.__RANK.length) return UI.toast('榜单尚未生成，稍后再来', 'err');
  window.__mypower = ENGINE.power(P);
  const opp = SYS.arenaPickOpponent(window.__RANK, P) || window.__RANK[0];
  UI.arenaOpp = opp;
  const r = SYS.arenaFight(P, opp);
  if (!r.ok) return UI.toast(r.msg, 'err');
  UI.clearLog('#arenaLog');
  for (const lg of r.logs.slice(0, 12)) UI.pushLog(lg.text, lg.who === 'p' ? 'p' : 'm', '#arenaLog');
  UI.pushLog(r.win ? `✔ 胜【${opp.name}】积分 +${GAME_SOCIAL.arena.winScore}` : `✘ 负于【${opp.name}】`, r.win ? 'p' : 'm', '#arenaLog');
  SYS.taskProgress(P, 'arena', 1);
  UI.renderArena(P); UI.renderHUD(P); UI.renderTasks(P); save();
}

/* ---------------- 宗门 / 社交 ---------------- */
async function onCreateSect() {
  const name = $('#sectName').value.trim();
  const r = await SYS.createSect(P, name, P.root);
  UI.toast(r.msg, r.ok ? 'ok' : 'err');
  if (r.ok) { UI.renderSect(P); UI.renderHUD(P); save(); }
}
async function onChat() {
  const text = $('#chatInput').value;
  const r = await SYS.chatSend(P, text);
  UI.toast(r.msg, r.ok ? 'ok' : 'err');
  if (r.ok) { $('#chatInput').value = ''; UI.renderChat(); }
}
async function onBind(kind) {
  const name = $('#relName').value.trim();
  if (!name) return UI.toast('请输入对方道号', 'err');
  const r = kind === 'dao' ? await SYS.bindDaoLv(P, name) : await SYS.bindMaster(P, name);
  UI.toast(r.msg, r.ok ? 'ok' : 'err');
  if (r.ok) { UI.renderSocial(P); UI.renderAttrs(P); save(); }
}
function onRename() {
  if ((P.buffs.rename || 0) < 1) return UI.toast('需要改名帖（坊市有售）', 'err');
  const v = prompt('新道号（2-10 字）', P.name);
  if (!v || v.trim().length < 2) return;
  P.name = v.trim().slice(0, 10);
  P.buffs.rename--;
  UI.toast('改名成功');
  renderAll(); save();
}

/* ---------------- 设置 ---------------- */
function bindSettings() {
  const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  bind('#btnProbe', async () => { UI.toast('测速中…'); await Net.probe(); UI.renderNet(); UI.toast('已切换到 ' + Net.endpoint.replace('https://', '')); });
  bind('#btnFlush', async () => { const n = await Net.flushQueue(); UI.renderNet(); UI.toast(n ? '补传 ' + n + ' 份' : '没有待传存档'); });
  bind('#btnReset', () => { Net.reset(); UI.toast('通道已重置'); Net.probe().then(UI.renderNet); });
  bind('#btnSave', () => { save(); UI.toast('已保存到云端'); });
  bind('#btnLogout', () => { localStorage.removeItem('xx_session'); location.reload(); });
  bind('#btnChatQuick', async () => {
    const el = $('#chatQuick'); const r = await SYS.chatSend(P, el.value);
    UI.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { el.value = ''; UI.renderChat(); }
  });
  const cq = $('#chatQuick'); if (cq) cq.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnChatQuick').click(); });
  bind('#btnSaveEp', () => {
    const list = $('#epsInput').value.split('\n').map((s) => s.trim()).filter(Boolean);
    Net.setExtra(list); UI.toast('已保存 ' + list.length + ' 个加速地址'); Net.probe().then(UI.renderNet);
  });
  const eps = JSON.parse(localStorage.getItem('xx_extra_ep') || '[]');
  $('#epsInput').value = eps.join('\n');
}
