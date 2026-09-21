/* =========================================================
 * admin.js —— 后台：玩家管理 / 数值配置 / 公告活动 / 数据看板
 * ========================================================= */
const A$ = (s) => document.querySelector(s);
const A$$ = (s) => [...document.querySelectorAll(s)];

let PLAYERS = [];        // { name, obj }
let CUR = null;          // 当前编辑的玩家对象
let CFG = null;

function atoast(m, t = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + t; d.textContent = m;
  A$('#toasts').appendChild(d); setTimeout(() => d.remove(), 2600);
}

/* ---------- 鉴权：后台口令（存在仓库 data/config/admin.json，可选） ---------- */
async function boot() {
  A$('#repoName').textContent = `${GH.owner}/${GH.repo}`;
  A$('#epName').textContent = '检测中…';
  await Net.probe();
  A$('#epName').textContent = Net.endpoint.replace('https://', '');
  A$('#netState').innerHTML = Net.online ? '<span style="color:#4ade80">● 已连接</span>' : '<span style="color:#f87171">● 未连接</span>';
  if (!Net.online) atoast('GitHub 未连通，请检查 Token / 加速地址', 'err');
  bind();
  loadAll();
}

async function loadAll() {
  CFG = await readJSON('data/config/game.json') || {};
  A$('#cfgJson').value = JSON.stringify(CFG, null, 2);
  const n = await readJSON('data/config/notice.json') || { notice: '', events: {} };
  A$('#nText').value = n.notice || '';
  A$('#evExp').checked = !!(n.events || {}).doubleExp;
  A$('#evStone').checked = !!(n.events || {}).doubleStone;
  A$('#evName').value = (n.events || {}).eventName || '';
  A$('#evEnd').value = (n.events || {}).eventEnd || '';
  await loadPlayers();
  renderDash();
  renderMore().catch(() => {});
}

async function loadPlayers() {
  const files = await listDir('data/players').catch(() => []);
  PLAYERS = [];
  for (const f of files.filter((x) => x.name.endsWith('.json'))) {
    try {
      const r = await fetch(`${Net.endpoint}/repos/${GH.owner}/${GH.repo}/contents/${f.path}?ref=${GH.dataBranch}`, {
        headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json' },
      });
      const j = await r.json();
      const obj = JSON.parse(fromB64(j.content.replace(/\n/g, '')));
      PLAYERS.push({ file: f.name, obj });
    } catch (e) { /* skip */ }
  }
  renderPlayers(PLAYERS);
}

function realmOf(p) {
  const rs = (CFG.realms || []);
  return rs[p.realm] ? `${rs[p.realm].name}${p.layer + 1}层` : '-';
}
function powerOf(p) {
  const b = CFG.baseAttr || { hp: 100, atk: 12, def: 5, crit: .05, critDmg: 1.5, speed: 10 };
  const g = CFG.growthPerRealm || {};
  const a = { atk: b.atk + (g.atk || 0) * p.realm, def: b.def + (g.def || 0) * p.realm, hp: b.hp + (g.hp || 0) * p.realm };
  for (const k of ['weapon', 'armor', 'ring']) {
    const it = p.equip && p.equip[k]; if (!it) continue;
    const mul = (CFG.qualities || [{}])[it.q] ? CFG.qualities[it.q].mul : 1;
    a.atk += (it.atk || 0) * mul; a.def += (it.def || 0) * mul; a.hp += (it.hp || 0) * mul;
  }
  return Math.round((a.atk * 3 + a.def * 2 + a.hp * .5 + 40) * (1 + p.realm * .25));
}

function renderPlayers(list) {
  A$('#pCount').textContent = `共 ${list.length} 位道友`;
  A$('#pTable').innerHTML = `<tr><th>道号</th><th>境界</th><th class="num">灵石</th><th class="num">战力</th><th class="num">击杀</th><th>最近在线</th><th></th></tr>` +
    list.map((x, i) => {
      const p = x.obj;
      const mins = Math.round((Date.now() - (p.lastSeen || 0)) / 60000);
      return `<tr><td>${p.name || '-'}${p.banned ? ' 🚫' : ''}</td><td>${realmOf(p)}</td>
      <td class="num">${p.stone}</td><td class="num">${powerOf(p)}</td><td class="num">${(p.stats || {}).kills || 0}</td>
      <td>${mins < 60 ? mins + ' 分钟前' : Math.round(mins / 60) + ' 小时前'}</td>
      <td><button class="mini" data-edit="${i}">编辑</button></td></tr>`;
    }).join('');
  A$$('#pTable [data-edit]').forEach((b) => b.onclick = () => editPlayer(list[+b.dataset.edit]));
}

function editPlayer(item) {
  CUR = item;
  const p = item.obj;
  A$('#editCard').style.display = '';
  A$('#editWho').textContent = `${p.name}（${item.file}）`;
  A$('#fStone').value = p.stone; A$('#fExp').value = Math.round(p.exp);
  A$('#fRealm').value = p.realm; A$('#fLayer').value = p.layer;
  A$('#fKills').value = (p.stats || {}).kills || 0;
  A$('#fBan').value = p.banned ? '1' : '0';
  A$('#rawJson').value = JSON.stringify(p, null, 2);
  A$('#editCard').scrollIntoView({ behavior: 'smooth' });
}

function renderDash() {
  const ps = PLAYERS.map((x) => x.obj);
  const now = Date.now();
  const online = ps.filter((p) => now - (p.lastSeen || 0) < 10 * 60000).length;
  const today = ps.filter((p) => new Date(p.createdAt).toDateString() === new Date().toDateString()).length;
  const stones = ps.reduce((s, p) => s + (p.stone || 0), 0);
  const kills = ps.reduce((s, p) => s + ((p.stats || {}).kills || 0), 0);
  A$('#statGrid').innerHTML = [
    ['总道友数', ps.length], ['近10分钟在线', online], ['今日新增', today],
    ['灵石总量', stones], ['总击杀', kills], ['平均战力', ps.length ? Math.round(ps.reduce((s, p) => s + powerOf(p), 0) / ps.length) : 0],
  ].map(([k, v]) => `<div class="statc"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');

  const dist = {};
  ps.forEach((p) => { const n = realmOf(p).slice(0, 2); dist[n] = (dist[n] || 0) + 1; });
  const max = Math.max(1, ...Object.values(dist));
  A$('#realmDist').innerHTML = Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:13px">
      <span style="width:52px">${k}</span>
      <div style="flex:1;height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden">
        <div style="height:100%;width:${(v / max) * 100}%;background:linear-gradient(90deg,#7ef7c8,#ffd76e)"></div></div>
      <span style="width:30px;text-align:right;color:var(--jade)">${v}</span></div>`).join('') || '<div class="small">暂无数据</div>';

  A$('#activeList').innerHTML = ps.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 15).map((p) =>
    `<div class="kv"><span>${p.name} · ${realmOf(p)}</span><b>${Math.round((now - (p.lastSeen || 0)) / 60000)} 分钟前</b></div>`).join('') || '<div class="small">暂无数据</div>';
}


/* ---------- 全服邮件 ---------- */
async function sendGlobalMail() {
  const title = A$('#mTitle').value.trim() || '系统邮件';
  const body = A$('#mBody').value.trim() || '';
  const rw = { stone: +A$('#mStone').value || 0, exp: +A$('#mExp').value || 0, herb: +A$('#mHerb').value || 0 };
  const reward = {};
  for (const k in rw) if (rw[k] > 0) reward[k] = rw[k];
  if (!confirm(`确认向全部 ${PLAYERS.length} 位道友发送邮件？`)) return;
  A$('#mailMsg').textContent = '发送中…（每人一次写操作，请耐心）';
  let ok = 0, fail = 0;
  for (const item of PLAYERS) {
    const p = item.obj;
    if (!Array.isArray(p.mail)) p.mail = [];
    p.mail.unshift({ id: 'm_' + Math.random().toString(36).slice(2, 9), at: Date.now(), read: false, title, body, reward: Object.keys(reward).length ? reward : null });
    p.mail = p.mail.slice(0, 30);
    try { await writeJSON(playerPath(p.uid), p, 'admin mail'); ok++; }
    catch (e) { fail++; }
  }
  A$('#mailMsg').textContent = `完成：成功 ${ok} 位${fail ? `，失败 ${fail} 位（稍后重试）` : ''}`;
  atoast(`邮件已发送：${ok} 位`, 'ok');
}

/* ---------- 榜与宗门 ---------- */
async function renderMore() {
  try {
    const d = await readJSON('data/arena_rank.json');
    A$('#arenaRankBox').innerHTML = (d && d.list && d.list.length)
      ? d.list.slice(0, 30).map((r, i) => `<div class="kv"><span>${i + 1}. ${r.name} · ${r.realm}</span><b>${r.arena} 分</b></div>`).join('')
      : '<div class="small">暂无数据</div>';
  } catch (e) { A$('#arenaRankBox').innerHTML = '<div class="small">暂无数据</div>'; }

  try {
    const d = await readJSON('data/sects.json');
    const list = (d && d.list) || [];
    A$('#sectBox').innerHTML = list.length
      ? list.map((s) => `<div class="kv"><span>${s.icon || ''} ${s.name}</span><b>${s.members || 0} 人</b></div>`).join('')
      : '<div class="small">暂无宗门</div>';
  } catch (e) { A$('#sectBox').innerHTML = '<div class="small">暂无宗门</div>'; }

  try {
    const d = await readJSON('data/chat.json');
    const list = (d && d.list) || [];
    A$('#chatTable').innerHTML = list.length
      ? '<tr><th>道号</th><th>内容</th><th>时间</th></tr>' + list.slice(0, 40).map((m) => `<tr><td>${m.name}</td><td>${m.text}</td><td>${new Date(m.at).toLocaleString()}</td></tr>`).join('')
      : '<tr><td class="small">暂无消息</td></tr>';
  } catch (e) { A('#chatTable').innerHTML = '<tr><td class="small">暂无消息</td></tr>'; }
}

/* ---------- 事件绑定 ---------- */
function bind() {
  A$$('.sidebar button').forEach((b) => b.onclick = () => {
    A$$('.sidebar button').forEach((x) => x.classList.remove('on')); b.classList.add('on');
    A$$('[data-pg]').forEach((s) => s.style.display = s.dataset.pg === b.dataset.p ? '' : 'none');
    if (b.dataset.p === 'more') renderMore();
    if (b.dataset.p === 'mail') A$('#mailMsg').textContent = `当前玩家数：${PLAYERS.length}`;
  });

  A$('#btnSearch').onclick = () => {
    const q = A$('#qUid').value.trim().toLowerCase();
    renderPlayers(PLAYERS.filter((x) => (x.obj.name || '').toLowerCase().includes(q) || x.file.includes(hashUid(q)) || x.file.includes(q)));
  };
  A$('#btnReload').onclick = async () => { atoast('刷新中…'); await loadPlayers(); renderDash(); atoast('已刷新'); };

  A$('#btnSaveP').onclick = async () => {
    if (!CUR) return;
    const p = CUR.obj;
    p.stone = +A$('#fStone').value; p.exp = +A$('#fExp').value;
    p.realm = +A$('#fRealm').value; p.layer = Math.min(8, +A$('#fLayer').value);
    p.stats = p.stats || {}; p.stats.kills = +A$('#fKills').value;
    p.banned = A$('#fBan').value === '1';
    await writeJSON(playerPath(p.uid), p, 'admin update ' + p.name);
    atoast('已保存', 'ok'); await loadPlayers(); renderDash();
  };
  A$('#btnSaveRaw').onclick = async () => {
    if (!CUR) return;
    try { const obj = JSON.parse(A$('#rawJson').value); await writeJSON(playerPath(obj.uid), obj, 'admin raw update'); atoast('已保存', 'ok'); await loadPlayers(); }
    catch (e) { atoast('JSON 格式错误', 'err'); }
  };
  A$('#btnGift').onclick = async () => {
    if (!CUR) return;
    const p = CUR.obj;
    const s = +A$('#fStone').value - p.stone, e = +A$('#fExp').value - p.exp;
    if (s > 0) p.stone += s; if (e > 0) { p.exp += e; }
    await writeJSON(playerPath(p.uid), p, 'admin gift');
    atoast(`已发放 ${Math.max(0, s)} 灵石 / ${Math.max(0, e)} 修为`, 'ok');
  };
  A$('#btnDel').onclick = async () => {
    if (!CUR || !confirm('确认删除该玩家存档？')) return;
    try {
      const path = playerPath(CUR.obj.uid);
      const r = await fetch(`${Net.endpoint}/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.dataBranch}`, { headers: { Authorization: `Bearer ${GH.token}` } });
      const j = await r.json();
      await fetch(`${Net.endpoint}/repos/${GH.owner}/${GH.repo}/contents/${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ message: 'admin delete', sha: j.sha, branch: GH.dataBranch }),
      });
      atoast('已删除', 'ok'); CUR = null; A$('#editCard').style.display = 'none'; await loadPlayers(); renderDash();
    } catch (e) { atoast('删除失败', 'err'); }
  };

  A$('#btnSaveNotice').onclick = async () => {
    const obj = {
      notice: A$('#nText').value,
      events: {
        doubleExp: A$('#evExp').checked, doubleStone: A$('#evStone').checked,
        expMul: 2, stoneMul: 2, eventName: A$('#evName').value, eventEnd: A$('#evEnd').value,
      },
      updatedAt: new Date().toISOString(),
    };
    await writeJSON('data/config/notice.json', obj, 'admin notice');
    atoast('公告与活动已发布', 'ok');
  };

  A$('#btnSaveCfg').onclick = async () => {
    try { const obj = JSON.parse(A$('#cfgJson').value); await writeJSON('data/config/game.json', obj, 'admin config'); atoast('配置已保存', 'ok'); CFG = obj; renderDash(); }
    catch (e) { atoast('JSON 格式错误', 'err'); }
  };
  A$('#btnLoadCfg').onclick = async () => { CFG = await readJSON('data/config/game.json') || {}; A$('#cfgJson').value = JSON.stringify(CFG, null, 2); atoast('已载入'); };

  A$('#btnDispatch').onclick = async () => {
    try {
      const r = await fetch(`${Net.endpoint}/repos/${GH.owner}/${GH.repo}/actions/workflows/aggregate.yml/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ ref: GH.branch }),
      });
      A$('#dispatchMsg').textContent = r.status === 204 ? '已触发，约 1 分钟后刷新看板' : '触发失败：' + r.status;
    } catch (e) { A$('#dispatchMsg').textContent = '触发失败（Token 需 workflow 权限）'; }
  };
  A$('#btnClearCache').onclick = () => { localStorage.clear(); atoast('已清除'); };

  A$('#btnSendMail').onclick = sendGlobalMail;
  A$('#btnClearChat').onclick = async () => {
    if (!confirm('确认清空世界频道？')) return;
    await writeJSON('data/chat.json', { updatedAt: new Date().toISOString(), list: [] }, 'admin clear chat');
    atoast('已清空', 'ok'); renderMore();
  };
}

boot();


/* ================= 后台扩展：货币 / 活动 / 称号 / 法宝 ================= */
const ADMINX = {
  cur: {},   // 当前操作的玩家对象

  async loadPlayer(uid, whoEl, cb) {
    if (!uid) return atoast('请先填道号', 'err');
    const r = await API.getPlayer(uid);
    if (!r || !r.data) { if (whoEl) whoEl.textContent = '未找到该玩家'; return null; }
    this.cur = r.data;
    if (whoEl) whoEl.textContent = `已载入：${r.data.name || uid}（${uid}）`;
    if (cb) cb(r.data);
    return r.data;
  },

  /* ---------- 货币 ---------- */
  CUR_IDS: ['C001','C002','C003','C004','C005','C006','C007','C008','C009','C010','C011','C012','C013','C014','C015','C016'],
  CUR_NAME: {'C001':'下品灵石','C002':'中品灵石','C003':'上品灵石','C004':'极品灵石','C005':'宗门贡献',
    'C006':'道义币','C007':'元宝','C008':'灵玉','C009':'功法残篇','C010':'突破丹碎片','C011':'轮回石',
    'C012':'通天令','C013':'仙元','C014':'功勋值','C015':'声望(人界)','C016':'积分(PVP)'},
  renderWallet(p) {
    const g = document.getElementById('walletGrid');
    if (!g) return;
    p.wallet = p.wallet || {};
    g.innerHTML = this.CUR_IDS.map((id) => {
      const v = (id === 'C001') ? (p.stone || p.wallet[id] || 0) : (p.wallet[id] || 0);
      return `<div><div class="small">${this.CUR_NAME[id]}</div>
        <input class="txt" data-cur="${id}" type="number" value="${v}"></div>`;
    }).join('');
  },
  async saveWallet(uid) {
    if (!this.cur || !this.cur.uid) return atoast('请先读取玩家', 'err');
    const p = this.cur;
    p.wallet = p.wallet || {};
    document.querySelectorAll('#walletGrid [data-cur]').forEach((el) => {
      const v = Math.max(0, parseInt(el.value || '0', 10));
      p.wallet[el.dataset.cur] = v;
      if (el.dataset.cur === 'C001') p.stone = v;
    });
    await API.savePlayer(p.uid, p, `admin: wallet ${p.name}`);
    atoast('货币已保存', 'ok');
  },
  async quickGive(uid) {
    if (!this.cur || !this.cur.uid) return atoast('请先读取玩家', 'err');
    const p = this.cur; p.wallet = p.wallet || {};
    const add = (id, el) => { const n = parseInt((document.getElementById(el) || {}).value || '0', 10); if (n) { p.wallet[id] = (p.wallet[id] || 0) + n; if (id === 'C001') p.stone = p.wallet[id]; } };
    add('C007', 'qYb'); add('C014', 'qMerit'); add('C015', 'qRep');
    await API.savePlayer(p.uid, p, `admin: give ${p.name}`);
    atoast('已发放', 'ok'); this.renderWallet(p);
  },

  /* ---------- 活动 ---------- */
  async renderActsAdmin() {
    const box = document.getElementById('actAdminList');
    if (!box) return;
    const cfg = await API.getConfig('social');
    const list = (cfg && cfg.acts) || [];
    box.innerHTML = list.length ? list.map((a) =>
      `<div class="item" style="margin-bottom:5px"><div class="ic">${a.icon}</div>
        <div class="info"><div class="nm">${a.name} <span class="small">${a.type}</span></div>
        <div class="sub">${a.content}</div><div class="sub" style="color:var(--jade)">${a.reward}</div></div></div>`
    ).join('') : '<div class="small">未加载到活动配置</div>';
    const st = document.getElementById('dblState');
    const nc = await API.getConfig('notice');
    const ev = (nc && nc.events) || {};
    if (st) st.textContent = '当前：' + [
      ev.doubleExp ? '双倍修为✔' : '', ev.doubleStone ? '双倍灵石✔' : '', ev.doubleDrop ? '双倍掉落✔' : ''
    ].filter(Boolean).join(' ') || '无';
  },
  async setDouble(key) {
    const nc = await API.getConfig('notice');
    if (!nc) return atoast('读取配置失败', 'err');
    nc.events = nc.events || {};
    ['doubleExp','doubleStone','doubleDrop'].forEach((k) => nc.events[k] = false);
    if (key) { nc.events[key] = true; nc.events[key.replace('double','') + 'Mul'] = 2; }
    await API.saveConfig('notice', nc, 'admin: double event');
    atoast(key ? '已开启' : '已全部关闭', 'ok');
    this.renderActsAdmin();
  },
  async batchGive() {
    const stone = parseInt((document.getElementById('bStone') || {}).value || '0', 10);
    const yb = parseInt((document.getElementById('bYb') || {}).value || '0', 10);
    const mt = parseInt((document.getElementById('bMerit') || {}).value || '0', 10);
    if (!stone && !yb && !mt) return atoast('请填至少一项', 'err');
    const nc = await API.getConfig('notice');
    if (!nc) return atoast('读取配置失败', 'err');
    nc.mails = nc.mails || [];
    nc.mails.push({
      id: 'm_' + Date.now(), title: '全服活动奖励',
      body: `灵石×${stone}　元宝×${yb}　功勋×${mt}`,
      give: { stone, yuanbao: yb, merit: mt }, at: Date.now(), to: 'all',
    });
    await API.saveConfig('notice', nc, 'admin: batch give');
    document.getElementById('batchMsg').textContent = `已写入全服邮件（共 ${nc.mails.length} 封）`;
    atoast('已发放，玩家下次登录可见', 'ok');
  },

  /* ---------- 称号 ---------- */
  async renderTitlesAdmin(p) {
    const box = document.getElementById('titleAdminList');
    if (!box) return;
    const cfg = await API.getConfig('social');
    const list = (cfg && cfg.titles) || [];
    p.titles = p.titles || { owned: [], cur: null };
    box.innerHTML = list.map((t) => {
      const owned = p.titles.owned.indexOf(t.id) >= 0;
      return `<div class="item" style="margin-bottom:5px"><div class="ic">${t.icon}</div>
        <div class="info"><div class="nm">${t.name}</div><div class="sub">${t.desc}</div></div>
        <button class="mini" data-tid="${t.id}">${owned ? '撤销' : '授予'}</button></div>`;
    }).join('');
    box.querySelectorAll('[data-tid]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.tid;
      const i = p.titles.owned.indexOf(id);
      if (i >= 0) p.titles.owned.splice(i, 1); else p.titles.owned.push(id);
      await API.savePlayer(p.uid, p, `admin: title ${id}`);
      atoast('已更新', 'ok'); this.renderTitlesAdmin(p);
    });
  },

  /* ---------- 法宝发放 ---------- */
  async renderEquipAdmin(p) {
    const g = document.getElementById('equipAdminGrid');
    if (!g) return;
    const ct = await API.getConfig('content');
    const recs = ((ct && ct.forge && ct.forge.recipes) || []).filter((x) => x.fr);
    g.innerHTML = recs.map((r) =>
      `<div><button class="ghost" style="width:100%;text-align:left" data-eq="${r.id}">
        ${r.icon} ${r.name} <span class="small">q${r.q}</span></button></div>`
    ).join('') || '<div class="small">未加载到法宝数据</div>';
    g.querySelectorAll('[data-eq]').forEach((b) => b.onclick = async () => {
      const rec = recs.find((x) => x.id === b.dataset.eq);
      p.bag = p.bag || [];
      p.bag.push({ id: 'fr_' + rec.id, name: rec.name, icon: rec.icon, kind: 'equip',
        q: rec.q, slot: rec.slot, base: rec.base || {}, enh: 0, temp: 0, fr: true });
      await API.savePlayer(p.uid, p, `admin: give equip ${rec.name}`);
      atoast(`已发放【${rec.name}】`, 'ok');
    });
  },
};
window.ADMINX = ADMINX;

/* 绑定后台扩展事件 */
document.addEventListener('DOMContentLoaded', () => {
  const q = (s) => document.querySelector(s);
  const bw = q('#btnWLoad'); if (bw) bw.onclick = () => ADMINX.loadPlayer(q('#wUid').value.trim(), q('#wWho'), (p) => ADMINX.renderWallet(p));
  const bs = q('#btnWSave'); if (bs) bs.onclick = () => ADMINX.saveWallet();
  const bg = q('#btnQuickGive'); if (bg) bg.onclick = () => ADMINX.quickGive();
  const bt = q('#btnTLoad'); if (bt) bt.onclick = () => ADMINX.loadPlayer(q('#tUid').value.trim(), q('#tWho'), (p) => ADMINX.renderTitlesAdmin(p));
  const be = q('#btnELoad'); if (be) be.onclick = () => ADMINX.loadPlayer(q('#eUid').value.trim(), q('#eWho'), (p) => ADMINX.renderEquipAdmin(p));
  const de = q('#btnDblExp'); if (de) de.onclick = () => ADMINX.setDouble('doubleExp');
  const ds = q('#btnDblStone'); if (ds) ds.onclick = () => ADMINX.setDouble('doubleStone');
  const dd = q('#btnDblDrop'); if (dd) dd.onclick = () => ADMINX.setDouble('doubleDrop');
  const df = q('#btnDblOff'); if (df) df.onclick = () => ADMINX.setDouble(null);
  const bb = q('#btnBatchGive'); if (bb) bb.onclick = () => ADMINX.batchGive();
  // 切到活动页时自动渲染
  document.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
    if (b.dataset.p === 'acts') ADMINX.renderActsAdmin();
  });
});
