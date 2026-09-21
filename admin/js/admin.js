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
