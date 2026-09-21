/* =========================================================
 * admin.js —— 凡人修仙 · 管理后台（重构版）
 * 依赖：../js/api.js（GitHub 读写）、../js/engine.js（战力计算）
 * ========================================================= */
const A$ = (s) => document.querySelector(s);
const A$$ = (s) => [...document.querySelectorAll(s)];

let PLAYERS = [];        // 全部玩家 [{name, obj}]
let VIEW = [];           // 当前列表视图
let CUR = null;          // 当前编辑玩家
let CFG = null;          // game.json
let CONTENT = null;      // content.json
let SOCIAL = null;       // social.json
let CONN = false;

/* ================= 基础工具 ================= */
function atoast(m, t = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + t; d.textContent = m;
  A$('#toasts').appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 300); }, 2600);
}
const fmt = (n) => {
  n = Math.round(n || 0);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
};
const ago = (t) => {
  if (!t) return '—';
  const d = (Date.now() - t) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  return Math.floor(d / 86400) + ' 天前';
};

/* ================= 侧栏导航 ================= */
const NAV = [
  { g: '概览' },
  { k: 'dash', i: '📊', n: '数据看板' },
  { k: 'players', i: '👥', n: '玩家管理' },
  { g: '运营' },
  { k: 'batch', i: '📮', n: '批量操作' },
  { k: 'wallet', i: '💰', n: '货币管理' },
  { k: 'acts', i: '🎯', n: '活动管理' },
  { k: 'give', i: '🎁', n: '内容发放' },
  { k: 'chat', i: '💬', n: '聊天日志' },
  { k: 'sect', i: '🏯', n: '宗门管理' },
  { g: '设置' },
  { k: 'config', i: '🎛', n: '数值配置' },
  { k: 'data', i: '🗄', n: '数据维护' },
  { k: 'sys', i: '⚙️', n: '系统' },
];
function renderNav() {
  A$('#nav').innerHTML = NAV.map((x) => x.g
    ? `<div class="grp">${x.g}</div>`
    : `<button data-pg="${x.k}"><span>${x.i}</span>${x.n}</button>`).join('');
  A$$('#nav [data-pg]').forEach((b) => b.onclick = () => { go(b.dataset.pg); closeSide(); });
}
function go(pg) {
  A$$('.page').forEach((p) => p.classList.toggle('on', p.dataset.pg === pg));
  A$$('#nav [data-pg]').forEach((b) => b.classList.toggle('on', b.dataset.pg === pg));
  const t = NAV.find((x) => x.k === pg);
  A$('#pgTitle').textContent = t ? t.n : '';
  A$('#body').scrollTop = 0;
  if (pg === 'dash') renderDash();
  if (pg === 'acts') renderActs();
  if (pg === 'config') loadCfg();
  if (pg === 'data') renderData();
  if (pg === 'sys') renderSys();
  if (pg === 'chat') renderChat();
  if (pg === 'sect') renderSectAdmin();
}

/* ================= 连接检测 ================= */
async function checkConn() {
  const d = A$('#cDot'), t = A$('#cTxt');
  d.className = 'dot'; t.textContent = '检测中…';
  try {
    if (!window.Net || !Net.probe) { throw 0; }
    const r = await Promise.race([Net.probe(), new Promise((_, j) => setTimeout(() => j(0), 8000))]);
    CONN = !!(r && r.ok !== false);
  } catch (e) { CONN = false; }
  try {
    const c = await readJSON('data/config/game.json').catch(() => null);
    CONN = CONN || !!c;
  } catch (e) {}
  d.className = 'dot ' + (CONN ? 'on' : 'off');
  t.textContent = CONN ? '已连接 GitHub' : '离线（读不到仓库数据）';
}

/* ================= 载入配置 ================= */
async function loadCfg() {
  CFG = await readJSON('data/config/game.json') || {};
  CONTENT = await readJSON('data/config/content.json') || {};
  SOCIAL = await readJSON('data/config/social.json') || {};
  renderCfgQuick();
  try {
    const n = await readJSON('data/config/notice.json') || {};
    A$('#nText').value = n.notice || '';
    A$('#nCodes').value = ((n.giftCodes) || []).join(',');
  } catch (e) {}
}
const QUICK = [
  ['cultivate.basePerSec', '挂机修为/秒', 1],
  ['cultivate.offlineMul', '离线倍率', 0.1],
  ['meditate.gainSec', '闭关获得秒数', 1],
  ['meditate.cdSec', '闭关冷却(秒)', 1],
  ['breakthrough.base', '渡劫基础成功率', 0.01],
  ['enhance.costBase', '强化基础花费', 1],
  ['enhance.maxLevel', '强化上限', 1],
  ['reincarnation.keepExp', '转世保留修为比', 0.01],
];
function gget(path) { return path.split('.').reduce((o, k) => (o || {})[k], CFG); }
function gset(path, v) {
  const ks = path.split('.'); const last = ks.pop();
  let o = CFG; for (const k of ks) { o[k] = o[k] || {}; o = o[k]; }
  o[last] = v;
}
function renderCfgQuick() {
  A$('#cfgQuick').innerHTML = QUICK.map(([p, n, step]) =>
    `<div class="fld"><label>${n}</label>
      <input class="inp" data-cfg="${p}" type="number" step="${step}" value="${gget(p) ?? 0}"></div>`).join('');
  A$$('#cfgQuick [data-cfg]').forEach((el) => el.onchange = async () => {
    gset(el.dataset.cfg, parseFloat(el.value));
    await writeJSON('data/config/game.json', CFG, 'admin: config ' + el.dataset.cfg);
    atoast('已保存 ' + el.dataset.cfg, 'ok');
  });
}

/* ================= 1. 数据看板 ================= */
async function renderDash() {
  if (!PLAYERS.length) await loadPlayers(true);
  const ps = PLAYERS.map((x) => x.obj);
  const now = Date.now();
  const online = ps.filter((p) => now - (p.lastSeen || 0) < 600000).length;
  const today = ps.filter((p) => now - (p.lastSeen || 0) < 86400000).length;
  const totalPower = ps.reduce((s, p) => s + (power(p) || 0), 0);
  const banned = ps.filter((p) => p.banned).length;
  A$('#dashStats').innerHTML = [
    ['👥 总玩家', ps.length, `今日活跃 ${today}`],
    ['🟢 在线(10分钟内)', online, '实时估算'],
    ['⚔️ 总战力', fmt(totalPower), `人均 ${fmt(totalPower / Math.max(1, ps.length))}`],
    ['🚫 封禁中', banned, banned ? '需复查' : '无异常'],
  ].map(([l, v, e]) => `<div class="stat"><div class="lb">${l}</div>
    <div class="vl">${v}</div><div class="ex">${e}</div></div>`).join('');

  // 境界分布
  const realms = (CFG.realms) || [];
  const dist = {};
  ps.forEach((p) => {
    const r = realms[p.realm || 0];
    const nm = r ? r.name.split(/[一二三四五六七八九十]/)[0] : '未知';
    dist[nm] = (dist[nm] || 0) + 1;
  });
  const mx = Math.max(1, ...Object.values(dist));
  A$('#realmDist').innerHTML = Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<div style="margin-bottom:7px"><div class="row" style="justify-content:space-between">
      <span class="small">${k}</span><span class="small" style="color:var(--gold)">${v} 人</span></div>
      <div class="bar"><i style="width:${v / mx * 100}%"></i></div></div>`).join('') || '<div class="empty">暂无数据</div>';

  // 战力 TOP10
  A$('#topPower').innerHTML = ps.map((p) => ({ p, w: power(p) || 0 }))
    .sort((a, b) => b.w - a.w).slice(0, 10).map((x, i) =>
      `<div class="item"><div class="ic">${['🥇', '🥈', '🥉'][i] || (i + 1)}</div>
        <div class="info"><div class="nm">${x.p.name}</div>
        <div class="sub">${realmName(x.p)}　战力 ${fmt(x.w)}</div></div></div>`).join('') || '<div class="empty">暂无数据</div>';

  // 灵根
  const rd = {};
  ps.forEach((p) => rd[p.root || '?'] = (rd[p.root || '?'] || 0) + 1);
  const rmx = Math.max(1, ...Object.values(rd));
  A$('#rootDist').innerHTML = Object.entries(rd).map(([k, v]) =>
    `<div style="margin-bottom:7px"><div class="row" style="justify-content:space-between">
      <span class="small">${k}</span><span class="small" style="color:var(--jade)">${v}</span></div>
      <div class="bar"><i style="width:${v / rmx * 100}%"></i></div></div>`).join('') || '<div class="empty">暂无</div>';

  // 最近活跃
  A$('#recentAct').innerHTML = ps.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, 8).map((p) => `<div class="item"><div class="ic">${p.avatar || '🧙'}</div>
      <div class="info"><div class="nm">${p.name}</div><div class="sub">${realmName(p)}</div></div>
      <div class="act small">${ago(p.lastSeen)}</div></div>`).join('') || '<div class="empty">暂无</div>';
}
function realmName(p) {
  const r = (CFG.realms || [])[p.realm || 0];
  const s = (CFG.stages || [])[p.stage || 0];
  return r ? (r.name + (s ? '·' + s : '')) : '?';
}
function power(p) {
  try { return (window.ENGINE && ENGINE.power) ? ENGINE.power(p) : ((p.realm || 0) * 1000 + (p.exp || 0) / 100); }
  catch (e) { return (p.realm || 0) * 1000; }
}

/* ================= 2. 玩家管理 ================= */
async function loadPlayers(silent) {
  const files = await listDir('data/players').catch(() => []);
  PLAYERS = [];
  for (const f of files) {
    if (f.type !== 'file' || !/\.json$/.test(f.name)) continue;
    try {
      const o = await readJSON('data/players/' + f.name);
      if (o && o.uid) PLAYERS.push({ name: o.name || o.uid, obj: o });
    } catch (e) {}
  }
  if (!silent) atoast(`已载入 ${PLAYERS.length} 位道友`, 'ok');
  VIEW = PLAYERS.slice();
  renderTable();
}
function sortView(k) {
  const cmp = {
    power: (a, b) => power(b.obj) - power(a.obj),
    realm: (a, b) => (b.obj.realm || 0) - (a.obj.realm || 0),
    stone: (a, b) => (b.obj.stone || 0) - (a.obj.stone || 0),
    recent: (a, b) => (b.obj.lastSeen || 0) - (a.obj.lastSeen || 0),
  }[k] || (() => 0);
  VIEW = VIEW.slice().sort(cmp);
  renderTable();
}
function renderTable() {
  A$('#pBody').innerHTML = VIEW.map((x, i) => {
    const p = x.obj;
    return `<tr data-i="${i}">
      <td><b>${p.name || '—'}</b><div class="small mono">${p.uid}</div></td>
      <td>${realmName(p)}</td>
      <td>${fmt(power(p))}</td>
      <td>${fmt(p.stone || 0)}</td>
      <td>${fmt((p.stats || {}).kills || 0)}</td>
      <td>${(p.sectInfo || {}).name || '—'}</td>
      <td>${p.banned ? '<span class="tag r">封禁</span>' : '<span class="tag g">正常</span>'}</td>
      <td class="small">${ago(p.lastSeen)}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">无数据</td></tr>';
  A$('#pCount').textContent = `共 ${VIEW.length} 位（总数 ${PLAYERS.length}）`;
  A$$('#pBody tr[data-i]').forEach((tr) => tr.onclick = () => selectPlayer(VIEW[+tr.dataset.i].obj));
  // 手机端卡片视图
  const pc = A$('#pCards');
  if (pc) {
    pc.innerHTML = VIEW.map((x, i) => {
      const p = x.obj;
      return `<div class="pcard" data-i="${i}">
        <div class="r1"><div class="av">${p.avatar || '🧙'}</div>
          <div class="nm">${p.name || '—'}</div>
          ${p.banned ? '<span class="tag r">封禁</span>' : '<span class="tag g">正常</span>'}</div>
        <div class="r2">
          <span>${realmName(p)}</span><span>战力 ${fmt(power(p))}</span>
          <span>💎 ${fmt(p.stone || 0)}</span><span>击杀 ${fmt((p.stats || {}).kills || 0)}</span>
          <span>${(p.sectInfo || {}).name || '无宗门'}</span></div>
        <div class="r3">${p.uid} · ${ago(p.lastSeen)}</div></div>`;
    }).join('') || '<div class="empty">无数据</div>';
    A$$('#pCards .pcard').forEach((c) => c.onclick = () => {
      selectPlayer(VIEW[+c.dataset.i].obj);
      closeSide();
    });
  }
  syncSel();
}
function syncSel() {
  const idx = CUR ? VIEW.findIndex((x) => x.obj === CUR) : -1;
  A$$('#pBody tr').forEach((tr) => tr.classList.toggle('sel', +tr.dataset.i === idx));
  A$$('#pCards .pcard').forEach((c) => c.classList.toggle('sel', +c.dataset.i === idx));
}
function openSide() { A$('#side').classList.add('open'); A$('#mask').classList.add('show'); }
function closeSide() { A$('#side').classList.remove('open'); A$('#mask').classList.remove('show'); }

function selectPlayer(p) {
  CUR = p;
  A$('#editCard').style.display = '';
  A$('#editWho').textContent = `${p.name}（${p.uid}）`;
  A$('#fName').value = p.name || '';
  A$('#fRealm').value = p.realm || 0;
  A$('#fStage').value = p.stage || 0;
  A$('#fExp').value = Math.round(p.exp || 0);
  A$('#fStone').value = Math.round(p.stone || 0);
  A$('#fKills').value = (p.stats || {}).kills || 0;
  A$('#fReinc').value = p.reinc || 0;
  A$('#fBan').value = p.banned ? '1' : '0';
  A$('#rawJson').value = JSON.stringify(p, null, 1);
  syncSel();
  try { A$('#editCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}
async function savePlayer(p, msg) {
  await writeJSON(playerPath(p.uid), p, 'admin: ' + msg);
  atoast('已保存', 'ok');
}

/* ================= 3. 批量操作 ================= */
async function sendMailAll() {
  const title = A$('#mTitle').value.trim();
  if (!title) return atoast('请填标题', 'err');
  const give = {
    stone: +A$('#mStone').value || 0, yuanbao: +A$('#mYb').value || 0,
    exp: +A$('#mExp').value || 0, merit: +A$('#mMerit').value || 0, rep: +A$('#mRep').value || 0,
  };
  let ok = 0;
  for (const x of PLAYERS) {
    try {
      x.obj.mail = x.obj.mail || [];
      x.obj.mail.push({ id: 'm_' + Date.now() + '_' + ok, title,
        body: A$('#mBody').value || '', give, at: Date.now(), read: false });
      if (x.obj.mail.length > 50) x.obj.mail.shift();
      await writeJSON(playerPath(x.obj.uid), x.obj, 'admin mail');
      ok++;
    } catch (e) {}
  }
  A$('#mailMsg').textContent = `已发给 ${ok} 位`;
  atoast(`已发送 ${ok} 封`, 'ok');
}
async function giveAll() {
  const g = {
    stone: +A$('#gStone').value || 0, yuanbao: +A$('#gYb').value || 0,
    exp: +A$('#gExp').value || 0, contrib: +A$('#gContrib').value || 0, merit: +A$('#gMerit').value || 0,
  };
  if (!Object.values(g).some((v) => v)) return atoast('请至少填一项', 'err');
  let ok = 0;
  for (const x of PLAYERS) {
    try {
      const p = x.obj;
      p.wallet = p.wallet || {};
      if (g.stone) { p.stone = (p.stone || 0) + g.stone; p.wallet.C001 = p.stone; }
      if (g.yuanbao) p.wallet.C007 = (p.wallet.C007 || 0) + g.yuanbao;
      if (g.contrib) p.wallet.C005 = (p.wallet.C005 || 0) + g.contrib;
      if (g.merit) p.wallet.C014 = (p.wallet.C014 || 0) + g.merit;
      if (g.exp && window.ENGINE && ENGINE.gainExp) ENGINE.gainExp(p, g.exp);
      await writeJSON(playerPath(p.uid), p, 'admin give');
      ok++;
    } catch (e) {}
  }
  A$('#giveMsg').textContent = `已发放给 ${ok} 位`;
  atoast(`已发放 ${ok} 位`, 'ok');
}
async function setDouble(key) {
  const n = await readJSON('data/config/notice.json') || {};
  n.events = n.events || {};
  ['doubleExp', 'doubleStone', 'doubleDrop'].forEach((k) => n.events[k] = false);
  if (key) { n.events[key] = true; n.events[key.replace('double', '').toLowerCase() + 'Mul'] = 2; }
  await writeJSON('data/config/notice.json', n, 'admin: double');
  atoast(key ? '已开启' : '已全部关闭', 'ok');
  renderDblState();
}
async function renderDblState() {
  const n = await readJSON('data/config/notice.json').catch(() => null);
  const e = (n && n.events) || {};
  A$('#dblState').textContent = '当前：' + ([
    e.doubleExp ? '双倍修为' : '', e.doubleStone ? '双倍灵石' : '', e.doubleDrop ? '双倍掉落' : ''
  ].filter(Boolean).join('、') || '无');
}

/* ================= 4. 货币管理 ================= */
const CUR16 = [
  ['C001', '下品灵石'], ['C002', '中品灵石'], ['C003', '上品灵石'], ['C004', '极品灵石'],
  ['C005', '宗门贡献'], ['C006', '道义币'], ['C007', '元宝'], ['C008', '灵玉'],
  ['C009', '功法残篇'], ['C010', '突破丹碎片'], ['C011', '轮回石'], ['C012', '通天令'],
  ['C013', '仙元'], ['C014', '功勋值'], ['C015', '声望'], ['C016', 'PVP积分'],
];
function renderWallet(p) {
  p.wallet = p.wallet || {};
  A$('#walletGrid').innerHTML = CUR16.map(([id, nm]) => {
    const v = (id === 'C001') ? (p.stone || p.wallet[id] || 0) : (p.wallet[id] || 0);
    return `<div class="fld"><label>${nm}</label>
      <input class="inp" data-cur="${id}" type="number" value="${v}"></div>`;
  }).join('');
}
async function saveWallet() {
  if (!CUR) return atoast('请先读取玩家', 'err');
  CUR.wallet = CUR.wallet || {};
  A$$('#walletGrid [data-cur]').forEach((el) => {
    const v = Math.max(0, parseInt(el.value || '0', 10) || 0);
    CUR.wallet[el.dataset.cur] = v;
    if (el.dataset.cur === 'C001') CUR.stone = v;
  });
  await savePlayer(CUR, 'wallet');
  renderWallet(CUR);
}

/* ================= 5. 活动管理 ================= */
async function renderActs(filter) {
  if (!SOCIAL) SOCIAL = await readJSON('data/config/social.json') || {};
  const list = (SOCIAL.acts) || [];
  const f = A$('.pill.on');
  const cur = filter || (f ? f.dataset.af : 'all');
  const show = cur === 'all' ? list : list.filter((a) => (a.type || '').indexOf(cur) >= 0);
  A$('#actList').innerHTML = show.map((a) =>
    `<div class="item"><div class="ic">${a.icon || '🎯'}</div>
      <div class="info"><div class="nm">${a.name}
        <span class="tag ${a.type === '限时活动' ? 'y' : a.type === '常驻活动' ? 'g' : 'b'}">${a.type}</span></div>
      <div class="sub">${a.content}</div><div class="sub" style="color:var(--jade)">${a.reward}</div>
      <div class="sub">参与：${a.need}</div></div></div>`).join('') || '<div class="empty">无</div>';
}

/* ================= 6. 内容发放 ================= */
async function renderGive() {
  if (!CONTENT) CONTENT = await readJSON('data/config/content.json') || {};
  if (!SOCIAL) SOCIAL = await readJSON('data/config/social.json') || {};
  const type = A$('#gvType').value;
  const kw = (A$('#gvKw').value || '').trim();
  let list = [];
  if (type === 'equip') list = ((CONTENT.forge || {}).recipes || []).filter((x) => x.fr)
    .map((x) => ({ id: x.id, name: x.name, icon: x.icon, q: x.q, slot: x.slot, base: x.base }));
  else if (type === 'pill') list = ((CONTENT.alchemy || {}).recipes || [])
    .map((x) => ({ id: x.id, name: x.name, icon: x.icon || '💊' }));
  else if (type === 'skill') list = (CONTENT.skills || [])
    .map((x) => ({ id: x.id, name: x.name, icon: x.icon }));
  else if (type === 'title') list = (SOCIAL.titles || [])
    .map((x) => ({ id: x.id, name: x.name, icon: x.icon }));
  else if (type === 'skin') list = (SOCIAL.skins || [])
    .map((x) => ({ id: x.id, name: x.name, icon: x.icon }));
  if (kw) list = list.filter((x) => (x.name || '').indexOf(kw) >= 0);
  A$('#gvList').innerHTML = list.slice(0, 60).map((x) =>
    `<div class="item" style="cursor:pointer"><div class="ic">${x.icon || '📦'}</div>
      <div class="info"><div class="nm">${x.name}</div>
      <div class="sub">${x.slot || x.q !== undefined ? '品质' + x.q : ''}</div></div>
      <div class="act"><button class="btn" data-gv="${x.id}">发放</button></div></div>`).join('')
    || '<div class="empty">无匹配</div>';
  A$$('#gvList [data-gv]').forEach((b) => b.onclick = () => doGive(type, b.dataset.gv, list));
}
function findPlayer(uid) {
  return PLAYERS.find((x) => x.obj.uid === uid || x.obj.name === uid);
}
async function doGive(type, id, list) {
  const uid = (A$('#gvUid').value || '').trim();
  const hit = findPlayer(uid);
  if (!hit) return atoast('未找到该玩家，请先在玩家管理载入', 'err');
  const p = hit.obj; const it = list.find((x) => x.id === id);
  p.bag = p.bag || [];
  if (type === 'equip') p.bag.push({ id: 'g_' + id, name: it.name, icon: it.icon, kind: 'equip',
    q: it.q || 1, slot: it.slot, base: it.base || {}, enh: 0, temp: 0, fr: true });
  else if (type === 'pill') p.bag.push({ id: 'g_' + id, name: it.name, icon: it.icon, kind: 'pill', count: 1 });
  else if (type === 'skill') {
    p.skills = p.skills || [];
    if (p.skills.some((s) => s.id === id)) return atoast('已有此功法', 'err');
    p.skills.push({ id, lv: 1 });
  } else if (type === 'title') {
    p.titles = p.titles || { owned: [], cur: null };
    if (p.titles.owned.indexOf(id) < 0) p.titles.owned.push(id);
  } else if (type === 'skin') {
    p.skin = p.skin || { owned: [], wear: {} };
    if (p.skin.owned.indexOf(id) < 0) p.skin.owned.push(id);
  }
  await savePlayer(p, 'give ' + type);
  atoast(`已发放【${it.name}】给 ${p.name}`, 'ok');
}

/* ================= 7. 配置 ================= */
async function loadCfgFile() {
  const f = A$('#cfgFile').value;
  const o = await readJSON(f).catch(() => null);
  A$('#cfgJson').value = o ? JSON.stringify(o, null, 1) : '// 读取失败';
}

/* ================= 8. 数据维护 ================= */
async function renderData() {
  const lb = await readJSON('data/leaderboard.json').catch(() => null);
  A$('#lbBox').innerHTML = lb
    ? `<div class="small">更新于 ${ago(lb.at || lb.updatedAt)}</div>
       <div class="small">条目 ${((lb.list) || []).length} 条</div>`
    : '<div class="small">尚未生成（等 Actions 首次运行）</div>';
  const st = await readJSON('data/stats.json').catch(() => null);
  A$('#stBox').innerHTML = st
    ? Object.entries(st).filter(([k, v]) => typeof v !== 'object')
      .map(([k, v]) => `<div class="row" style="justify-content:space-between">
        <span class="small">${k}</span><b style="color:var(--gold)">${fmt(v)}</b></div>`).join('')
    : '<div class="small">尚未生成</div>';
}
async function buildLb() {
  const list = PLAYERS.map((x) => ({ name: x.obj.name, uid: x.obj.uid,
    power: power(x.obj), realm: x.obj.realm || 0, realmName: realmName(x.obj) }))
    .sort((a, b) => b.power - a.power).slice(0, 100);
  await writeJSON('data/leaderboard.json', { at: Date.now(), list }, 'admin: build leaderboard');
  atoast(`排行榜已重建（${list.length} 条）`, 'ok'); renderData();
}
async function buildSt() {
  const ps = PLAYERS.map((x) => x.obj);
  const st = { at: Date.now(), players: ps.length,
    power: ps.reduce((s, p) => s + power(p), 0),
    kills: ps.reduce((s, p) => s + ((p.stats || {}).kills || 0), 0),
    battles: ps.reduce((s, p) => s + ((p.stats || {}).battles || 0), 0),
    stone: ps.reduce((s, p) => s + (p.stone || 0), 0) };
  await writeJSON('data/stats.json', st, 'admin: build stats');
  atoast('统计已重建', 'ok'); renderData();
}
async function backup() {
  const data = PLAYERS.map((x) => x.obj);
  const name = `backups/admin_${Date.now()}.json`;
  await writeJSON(name, { at: Date.now(), count: data.length, players: data }, 'admin: backup');
  A$('#bkMsg').textContent = `已备份 ${data.length} 位道友 → ${name}`;
  atoast('备份完成', 'ok');
}

/* ================= 9. 系统 ================= */
async function renderSys() {
  A$('#sysRepo').textContent = `${window.GH ? GH.owner : '?'}/${window.GH ? GH.repo : '?'}`;
  if (window.GH) A$('#sysExtra').value = (GH.extraEndpoints || []).join('\n');
  A$('#sysEp').textContent = `当前通道：${(window.GH && GH.best) || '默认 api.github.com'}`;
}


/* ================= 10. 聊天与日志 ================= */
async function renderChat(kw) {
  const d = await readJSON('data/chat.json').catch(() => null);
  const list = (d && d.list) || [];
  const q = (kw === undefined) ? (A$('#chatKw') ? A$('#chatKw').value.trim() : '') : kw;
  const show = q ? list.filter((m) => ((m.text || '') + (m.name || '')).indexOf(q) >= 0) : list;
  const rows = show.slice().reverse().slice(0, 50);
  A$('#chatBody').innerHTML = rows.map((m, i) =>
    `<tr><td class="small">${ago(m.at)}</td><td><b>${m.name || '—'}</b></td>
     <td>${(m.text || '').replace(/</g, '&lt;')}</td>
     <td><button class="btn sm d" data-chatdel="${i}">删除</button></td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">无消息</td></tr>';
  A$('#chatCount').textContent = `共 ${list.length} 条${q ? '，匹配 ' + show.length : ''}`;
  A$$('#chatBody [data-chatdel]').forEach((b) => b.onclick = async () => {
    const real = show.slice().reverse()[+b.dataset.chatdel];
    const idx = list.indexOf(real);
    if (idx >= 0) list.splice(idx, 1);
    await writeJSON('data/chat.json', { list }, 'admin: delete chat');
    atoast('已删除', 'ok'); renderChat(q);
  });
}
async function broadcast() {
  const t = (A$('#bcText') || {}).value;
  if (!t || !t.trim()) return atoast('请输入内容', 'err');
  const d = await readJSON('data/chat.json').catch(() => null) || { list: [] };
  d.list = d.list || [];
  d.list.push({ name: '【系统】', text: '[公告] ' + t.trim(), at: Date.now(), sys: true });
  if (d.list.length > 200) d.list.shift();
  await writeJSON('data/chat.json', d, 'admin: broadcast');
  A$('#bcText').value = '';
  atoast('已广播', 'ok'); renderChat();
}

/* ================= 11. 宗门管理 ================= */
async function renderSectAdmin() {
  const d = await readJSON('data/sects.json').catch(() => null);
  const list = (d && d.list) || (d && Array.isArray(d) ? d : []);
  const kw = (A$('#sectKw') || {}).value ? A$('#sectKw').value.trim() : '';
  const show = kw ? list.filter((x) => (x.name || '').indexOf(kw) >= 0) : list;
  const cnt = {};
  PLAYERS.forEach((x) => { const n = (x.obj.sectInfo || {}).name; if (n) cnt[n] = (cnt[n] || 0) + 1; });
  A$('#sectBody').innerHTML = show.map((x, i) =>
    `<tr><td><b>${x.name || '—'}</b></td><td>${cnt[x.name] || x.members || 0}</td>
     <td>${x.leader || x.owner || '—'}</td><td>${x.level || x.lv || 1}</td>
     <td><button class="btn sm d" data-sectdel="${i}">解散</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">无宗门</td></tr>';
  A$$('#sectBody [data-sectdel]').forEach((b) => b.onclick = async () => {
    if (!confirm('确定解散该宗门？')) return;
    const t = show[+b.dataset.sectdel];
    const idx = list.indexOf(t);
    if (idx >= 0) list.splice(idx, 1);
    await writeJSON('data/sects.json', { list }, 'admin: disband sect');
    atoast('已解散', 'ok'); renderSectAdmin();
  });
}

/* ================= 事件绑定 ================= */
document.addEventListener('DOMContentLoaded', async () => {
  renderNav();
  const bg = A$('#burger'), mk = A$('#mask');
  if (bg) bg.onclick = openSide;
  if (mk) mk.onclick = closeSide;
  await checkConn();
  await loadCfg();
  await loadPlayers(true);
  renderDash();

  A$('#btnRefresh').onclick = async () => { await checkConn(); await loadPlayers(true); renderDash(); atoast('已刷新', 'ok'); };

  // 玩家
  A$('#btnSearch').onclick = () => {
    const q = (A$('#qUid').value || '').trim();
    VIEW = q ? PLAYERS.filter((x) => (x.obj.uid || '').indexOf(q) >= 0 || (x.obj.name || '').indexOf(q) >= 0) : PLAYERS.slice();
    sortView(A$('#qSort').value);
  };
  A$('#btnReloadAll').onclick = () => loadPlayers();
  A$('#qSort').onchange = () => sortView(A$('#qSort').value);
  A$('#btnSaveP').onclick = async () => {
    if (!CUR) return;
    CUR.name = A$('#fName').value.trim() || CUR.name;
    CUR.realm = Math.max(0, +A$('#fRealm').value || 0);
    CUR.stage = Math.max(0, Math.min(3, +A$('#fStage').value || 0));
    CUR.exp = Math.max(0, +A$('#fExp').value || 0);
    CUR.stone = Math.max(0, +A$('#fStone').value || 0);
    CUR.stats = CUR.stats || {}; CUR.stats.kills = Math.max(0, +A$('#fKills').value || 0);
    CUR.reinc = Math.max(0, +A$('#fReinc').value || 0);
    CUR.banned = A$('#fBan').value === '1';
    await savePlayer(CUR, 'edit'); renderTable();
  };
  A$('#btnGift').onclick = async () => {
    if (!CUR) return;
    CUR.stone = Math.max(0, +A$('#fStone').value || 0);
    CUR.exp = Math.max(0, +A$('#fExp').value || 0);
    if (window.ENGINE && ENGINE.gainExp) ENGINE.gainExp(CUR, 0);
    await savePlayer(CUR, 'gift');
  };
  A$('#btnDelP').onclick = async () => {
    if (!CUR) return;
    if (!confirm(`确定删除【${CUR.name}】的存档？不可恢复。`)) return;
    await writeJSON(playerPath(CUR.uid), null, 'admin: delete').catch(() => {});
    atoast('已删除（若 API 不支持删除，请到仓库手动删）', 'ok');
    await loadPlayers();
  };
  A$('#btnFull').onclick = async () => {
    if (!CUR) return;
    CUR.lastTick = Date.now(); CUR.lastSeen = Date.now();
    await savePlayer(CUR, 'full heal'); atoast('已回满', 'ok');
  };
  A$('#btnResetTask').onclick = async () => {
    if (!CUR) return;
    CUR.tasks = { mainIdx: 0, daily: { date: '', prog: {}, claimed: [] }, bounty: { prog: {}, claimed: [] } };
    await savePlayer(CUR, 'reset task'); atoast('任务已重置', 'ok');
  };
  A$('#btnSaveRaw').onclick = async () => {
    try {
      const o = JSON.parse(A$('#rawJson').value);
      await writeJSON(playerPath(o.uid), o, 'admin raw');
      atoast('已保存', 'ok'); await loadPlayers();
    } catch (e) { atoast('JSON 格式错误', 'err'); }
  };

  // 批量
  A$('#btnSendMail').onclick = sendMailAll;
  A$('#btnGiveAll').onclick = giveAll;
  A$$('[data-dbl]').forEach((b) => b.onclick = () => setDouble(b.dataset.dbl));
  A$('#btnUnbanAll').onclick = async () => {
    let n = 0;
    for (const x of PLAYERS) if (x.obj.banned) { x.obj.banned = false; await writeJSON(playerPath(x.obj.uid), x.obj, 'admin unban'); n++; }
    A$('#batchMsg2').textContent = `已解封 ${n} 位`; atoast('完成', 'ok');
  };
  A$('#btnClearInactive').onclick = async () => {
    const old = PLAYERS.filter((x) => Date.now() - (x.obj.lastSeen || 0) > 2592000000);
    A$('#batchMsg2').textContent = `30 天未上线：${old.length} 位（${old.map((x) => x.obj.name).join('、').slice(0, 80)}）`;
  };
  A$('#btnRecalcPower').onclick = async () => {
    let n = 0;
    for (const x of PLAYERS) { try { power(x.obj); n++; } catch (e) {} }
    A$('#batchMsg2').textContent = `已重算 ${n} 位`; atoast('完成', 'ok');
  };

  // 货币
  A$('#btnWLoad').onclick = async () => {
    const uid = (A$('#wUid').value || '').trim();
    const hit = findPlayer(uid);
    if (!hit) return atoast('未找到', 'err');
    CUR = hit.obj; renderWallet(CUR);
    A$('#wWho').textContent = `已载入：${CUR.name}`;
  };
  A$('#btnWSave').onclick = saveWallet;
  A$('#btnWMax').onclick = () => { A$$('#walletGrid [data-cur]').forEach((e) => e.value = 999999); };
  A$('#btnWZero').onclick = () => { A$$('#walletGrid [data-cur]').forEach((e) => e.value = 0); };

  // 活动
  A$$('[data-af]').forEach((b) => b.onclick = () => {
    A$$('[data-af]').forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); renderActs(b.dataset.af);
  });

  // 发放
  A$('#gvType').onchange = renderGive;
  A$('#btnGvSearch').onclick = renderGive;
  A$('#gvKw').onkeydown = (e) => { if (e.key === 'Enter') renderGive(); };

  // 配置
  A$('#btnCfgLoad').onclick = loadCfgFile;
  A$('#btnCfgSave').onclick = async () => {
    try {
      const o = JSON.parse(A$('#cfgJson').value);
      await writeJSON(A$('#cfgFile').value, o, 'admin config');
      atoast('配置已保存', 'ok');
    } catch (e) { atoast('JSON 格式错误', 'err'); }
  };
  A$('#btnSaveNotice').onclick = async () => {
    const n = await readJSON('data/config/notice.json') || {};
    n.notice = A$('#nText').value;
    n.giftCodes = A$('#nCodes').value.split(/[,，\s]+/).filter(Boolean);
    await writeJSON('data/config/notice.json', n, 'admin notice');
    A$('#noticeMsg').textContent = '已保存，玩家 2 分钟内生效'; atoast('已保存', 'ok');
  };

  // 数据维护
  A$('#btnBuildLb').onclick = buildLb;
  A$('#btnBuildSt').onclick = buildSt;
  A$('#btnBackup').onclick = backup;
  A$('#btnClearChat').onclick = async () => { if (!confirm('确定清空世界聊天？')) return;
    await writeJSON('data/chat.json', { list: [] }, 'admin clear chat'); atoast('已清空', 'ok'); };
  A$('#btnClearMarket').onclick = async () => { if (!confirm('确定清空寄售行？')) return;
    await writeJSON('data/market.json', { list: [] }, 'admin clear market'); atoast('已清空', 'ok'); };
  A$('#btnClearCache').onclick = () => {
    Object.keys(localStorage).forEach((k) => { if (k.indexOf('xx_') === 0) localStorage.removeItem(k); });
    atoast('本地缓存已清除', 'ok');
  };

  // 聊天
  if (A$('#btnChatLoad')) A$('#btnChatLoad').onclick = () => renderChat();
  if (A$('#btnChatClear')) A$('#btnChatClear').onclick = async () => {
    if (!confirm('确定清空世界聊天？')) return;
    await writeJSON('data/chat.json', { list: [] }, 'admin: clear chat');
    atoast('已清空', 'ok'); renderChat();
  };
  if (A$('#btnChatSearch')) A$('#btnChatSearch').onclick = () => renderChat();
  if (A$('#btnBroadcast')) A$('#btnBroadcast').onclick = broadcast;
  // 宗门
  if (A$('#btnSectLoad')) A$('#btnSectLoad').onclick = renderSectAdmin;
  if (A$('#sectKw')) A$('#sectKw').onkeydown = (e) => { if (e.key === 'Enter') renderSectAdmin(); };

  // 系统
  A$('#btnSaveEp').onclick = async () => {
    const list = A$('#sysExtra').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (window.Net && Net.setExtra) Net.setExtra(list);
    if (window.GH) GH.extraEndpoints = list;
    localStorage.setItem('xx_extra_ep', JSON.stringify(list));
    atoast('已保存，正在测速…', 'ok'); await checkConn();
  };
});
