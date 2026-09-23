/* =========================================================
 * admin.js —— 《向僵尸开炮》管理后台（全量重做）
 * 页面：看板/玩家/批量/发放/僵尸/技能/武器词条/运营/配置/维护/系统
 * 风格：对齐游戏 UI，黄主按钮 / 绿次要 / 橙功能
 * ========================================================= */

const PWD = 'fj19941224';
const AKEY = 'zb_admin_ok';
const PDIR = 'data/zb/players/';
const D = (s) => document.querySelector(s);
const DA = (s) => Array.from(document.querySelectorAll(s));

let PLIST = [], PG = 'dash', SEL = null, FILTER = '', SORT = 'power';
let DASH = null;

const A = {
  /* ---------------- 基础 ---------------- */
  toast(m, c) {
    const b = D('#toasts'); if (!b) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (c || ''); d.textContent = m; b.appendChild(d);
    setTimeout(() => d.remove(), 2400);
    while (b.children.length > 4 && b.firstElementChild) b.firstElementChild.remove();
  },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },
  fmt(n) {
    n = Number(n) || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(Math.floor(n));
  },
  ago(t) {
    if (!t) return '—';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return s + '秒前';
    if (s < 3600) return Math.floor(s / 60) + '分前';
    if (s < 86400) return Math.floor(s / 3600) + '小时前';
    return Math.floor(s / 86400) + '天前';
  },
  pw(p) { try { return E.power(p) || 0; } catch (e) { return 0; } },

  modal(html) {
    const m = D('#modal'), b = D('#mbox');
    if (!m || !b) return;
    b.innerHTML = html; m.classList.add('on');
  },
  closeModal() { const m = D('#modal'); if (m) m.classList.remove('on'); },

  /* ---------------- 启动 ---------------- */
  async init() {
    if (sessionStorage.getItem(AKEY) === '1') { this.enter(); return; }
    const btn = D('#gtBtn'), inp = D('#gtPwd');
    if (btn) btn.onclick = () => {
      if ((inp.value || '') !== PWD) { D('#gtErr').textContent = '口令错误'; return; }
      sessionStorage.setItem(AKEY, '1'); this.enter();
    };
    if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') btn && btn.click(); };
    const mk = D('#mask'); if (mk) mk.onclick = () => this.closeNav();
    const md = D('#modal'); if (md) md.onclick = (e) => { if (e.target === md) this.closeModal(); };
  },
  closeNav() {
    const n = D('#nav'), m = D('#mask');
    if (n) n.classList.remove('on'); if (m) m.classList.remove('on');
  },
  async enter() {
    D('#gate').classList.remove('on'); D('#wrap').classList.add('on');
    try { await CFG.load(); } catch (e) {}
    try { await Net.init(); } catch (e) {}
    this.net(); this.nav();
    await this.loadPlayers();
    this.render();
  },
  net() {
    const n = D('#hdNet'); if (!n) return;
    n.textContent = Net.online ? '● 在线' : '○ 离线';
    n.classList.toggle('off', !Net.online);
  },
  nav() {
    DA('.nv').forEach((b) => {
      b.onclick = () => {
        PG = b.dataset.pg;
        DA('.nv').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.closeNav();
        this.render();
      };
    });
    const mn = D('#hdMenu');
    if (mn) mn.onclick = () => {
      const n = D('#nav'), m = D('#mask');
      if (n) n.classList.toggle('on'); if (m) m.classList.toggle('on');
    };
  },

  /* ---------------- 玩家数据 ---------------- */
  async loadPlayers() {
    let names = [];
    try { names = await Net.list(PDIR); } catch (e) { names = []; }
    if (!names || !names.length) {
      /* 兜底：榜单里捞 uid */
      try {
        const r = await Net.read('data/zb/leaderboard.json');
        if (r && r.data && r.data.list) names = r.data.list.map((x) => x.uid + '.json');
      } catch (e) {}
    }
    PLIST = [];
    const files = (names || []).filter((x) => x.endsWith('.json')).slice(0, 120);
    for (const f of files) {
      try {
        const r = await Net.read(PDIR + f);
        if (r && r.data && r.data.uid) PLIST.push(r.data);
      } catch (e) {}
    }
    this.sortPlayers();
    this.buildDash();
  },
  sortPlayers() {
    const s = SORT;
    PLIST.sort((a, b) => {
      if (s === 'power') return this.pw(b) - this.pw(a);
      if (s === 'lv') return (b.lv || 0) - (a.lv || 0);
      if (s === 'gold') return (b.gold || 0) - (a.gold || 0);
      if (s === 'kill') return ((b.stats && b.stats.kills) || 0) - ((a.stats && a.stats.kills) || 0);
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });
  },
  async savePlayer(p, msg) {
    try {
      await Net.write(PDIR + p.uid + '.json', p, msg || 'admin 修改 ' + p.name);
      return true;
    } catch (e) { this.toast('保存失败：' + e.message, 'err'); return false; }
  },
  view() {
    const f = (FILTER || '').trim().toLowerCase();
    if (!f) return PLIST;
    return PLIST.filter((p) =>
      (p.name || '').toLowerCase().indexOf(f) >= 0 || (p.uid || '').toLowerCase().indexOf(f) >= 0);
  },

  /* ---------------- 看板统计 ---------------- */
  buildDash() {
    const n = PLIST.length;
    const lvMap = {}, chMap = {}, roleMap = {};
    let kills = 0, gold = 0, dia = 0, on = 0, ban = 0;
    const now = Date.now();
    PLIST.forEach((p) => {
      const lv = p.lv || 1;
      const band = lv <= 10 ? '1-10级' : lv <= 30 ? '11-30级' : lv <= 60 ? '31-60级' : '60级以上';
      lvMap[band] = (lvMap[band] || 0) + 1;
      const c = (EX.chars || []).find((x) => x.id === p.char);
      const cn = c ? c.n.split('-')[0] : (p.char || '未知');
      roleMap[cn] = (roleMap[cn] || 0) + 1;
      const cleared = Object.keys(p.cleared || {}).length;
      const band2 = cleared === 0 ? '未通关' : cleared < 10 ? '1-9关' : cleared < 30 ? '10-29关' : '30关以上';
      chMap[band2] = (chMap[band2] || 0) + 1;
      kills += (p.stats && p.stats.kills) || 0;
      gold += p.gold || 0; dia += p.diamond || 0;
      if (now - (p.lastSeen || 0) < 864e5) on++;
      if (p.ban) ban++;
    });
    const top = PLIST.slice().sort((a, b) => this.pw(b) - this.pw(a)).slice(0, 10);
    DASH = { n, lvMap, chMap, roleMap, kills, gold, dia, on, ban, top };
  },

  /* ---------------- 渲染分发 ---------------- */
  render() {
    const b = D('#body'); if (!b) return;
    const f = this['pg_' + PG];
    b.innerHTML = f ? f.call(this) : '<div class="card"><div class="lbl">页面未实现</div></div>';
    const bd = this['bd_' + PG];
    if (bd) { try { bd.call(this); } catch (e) { console.error('bind', PG, e); } }
    window.scrollTo(0, 0);
    const m = D('.main'); if (m) m.scrollTop = 0;
  },

  /* =======================================================
   *  1. 数据看板
   * ===================================================== */
  pg_dash() {
    const d = DASH || { n: 0, lvMap: {}, chMap: {}, roleMap: {}, kills: 0, gold: 0, dia: 0, on: 0, ban: 0, top: [] };
    const bars = (map, title) => {
      const ks = Object.keys(map);
      const max = Math.max(1, ...ks.map((k) => map[k]));
      return `<div class="card"><div class="card-t">${title}<span class="sub">共 ${ks.reduce((s, k) => s + map[k], 0)} 人</span></div>
        ${ks.length ? ks.map((k) => `<div class="bar">
          <div class="bn"><span>${this.esc(k)}</span><b>${map[k]}</b></div>
          <div class="bg"><div class="bf" style="width:${Math.round(map[k] / max * 100)}%"></div></div>
        </div>`).join('') : '<div class="lbl">暂无数据</div>'}</div>`;
    };
    return `<div class="ph"><h2>📊 数据看板</h2><span class="tagx">实时</span></div>
      <div class="stats">
        <div class="st"><b>${d.n}</b><span>注册玩家</span></div>
        <div class="st"><b>${d.on}</b><span>24小时活跃</span></div>
        <div class="st"><b>${this.fmt(d.kills)}</b><span>累计击杀</span></div>
        <div class="st"><b>${this.fmt(d.gold)}</b><span>全服金币</span></div>
        <div class="st"><b>${this.fmt(d.dia)}</b><span>全服钻石</span></div>
        <div class="st"><b>${d.ban}</b><span>封禁账号</span></div>
      </div>
      ${bars(d.lvMap, '等级分布')}
      ${bars(d.roleMap, '角色选择分布')}
      ${bars(d.chMap, '关卡进度分布')}
      <div class="card"><div class="card-t">战力 TOP 10</div>
        ${d.top.length ? d.top.map((p, i) => `<div class="row">
          <div class="zav sm">${i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1)}</div>
          <div class="rl"><b>${this.esc(p.name)}</b>
            <span>Lv.${p.lv || 1} · ${this.esc((EX.chars || []).find((c) => c.id === p.char) || { n: '' }).n || p.char} · 击杀 ${(p.stats && p.stats.kills) || 0}</span></div>
          <b style="color:var(--gold)">${this.fmt(this.pw(p))}</b></div>`).join('')
          : '<div class="lbl">暂无玩家</div>'}
      </div>
      <div class="card"><div class="card-t">最近活跃</div>
        ${PLIST.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 8).map((p) => `<div class="row">
          <div class="zav sm">${this.esc((p.avatar || '🧑').slice(0, 2))}</div>
          <div class="rl"><b>${this.esc(p.name)}</b><span>Lv.${p.lv || 1} · 战力 ${this.fmt(this.pw(p))}</span></div>
          <span class="chipx">${this.ago(p.lastSeen)}</span></div>`).join('') || '<div class="lbl">暂无</div>'}
      </div>`;
  },
  bd_dash() {},

  /* =======================================================
   *  2. 玩家管理
   * ===================================================== */
  pg_players() {
    const list = this.view();
    return `<div class="ph"><h2>👥 玩家管理</h2><span class="tagx">${list.length} / ${PLIST.length} 人</span></div>
      <div class="card">
        <div class="sb">
          <input id="plSearch" placeholder="搜索道号 / UID" value="${this.esc(FILTER)}">
          <select id="plSort">
            <option value="power"${SORT === 'power' ? ' selected' : ''}>按战力</option>
            <option value="lv"${SORT === 'lv' ? ' selected' : ''}>按等级</option>
            <option value="gold"${SORT === 'gold' ? ' selected' : ''}>按金币</option>
            <option value="kill"${SORT === 'kill' ? ' selected' : ''}>按击杀</option>
            <option value="seen"${SORT === 'seen' ? ' selected' : ''}>按活跃</option>
          </select>
          <button class="btn n sm" id="plReload">刷新</button>
        </div>
        <div class="plist">${list.slice(0, 60).map((p) => this.pcard(p)).join('')
          || '<div class="lbl">没有匹配的玩家</div>'}</div>
        ${list.length > 60 ? `<div class="lbl">仅显示前 60 名，用搜索定位</div>` : ''}
      </div>
      <div id="plEdit"></div>`;
  },
  pcard(p) {
    const on = SEL && SEL.uid === p.uid;
    const c = (EX.chars || []).find((x) => x.id === p.char);
    return `<div class="pcard ${on ? 'on' : ''}" data-uid="${this.esc(p.uid)}">
      <div class="r1">
        <div class="zav">${this.esc((p.avatar || '🧑').slice(0, 2))}</div>
        <b>${this.esc(p.name)}</b>
        ${p.ban ? '<span class="ban">已封禁</span>' : ''}
      </div>
      <div class="r2">
        <span class="chipx y">Lv.${p.lv || 1}</span>
        <span class="chipx g">战力 ${this.fmt(this.pw(p))}</span>
        <span class="chipx">🪙${this.fmt(p.gold)}</span>
        <span class="chipx">💎${this.fmt(p.diamond)}</span>
        <span class="chipx">☠${(p.stats && p.stats.kills) || 0}</span>
        <span class="chipx">${this.esc(c ? c.n.split('-')[0] : (p.char || ''))}</span>
      </div>
      <div class="r3">UID ${this.esc(p.uid)} · ${this.ago(p.lastSeen)} · 通关 ${Object.keys(p.cleared || {}).length} 关</div>
    </div>`;
  },
  bd_players() {
    const s = D('#plSearch');
    if (s) s.oninput = () => { FILTER = s.value; this.renderList(); };
    const so = D('#plSort');
    if (so) so.onchange = () => { SORT = so.value; this.sortPlayers(); this.renderList(); };
    const r = D('#plReload');
    if (r) r.onclick = async () => { await this.loadPlayers(); this.render(); this.toast('已刷新 ' + PLIST.length + ' 名玩家', 'ok'); };
    DA('#body .pcard').forEach((b) => { b.onclick = () => this.select(b.dataset.uid); });
    if (SEL) this.renderEdit();
  },
  renderList() {
    /* 只重绘列表区，保留编辑区 */
    const wrap = D('#body .plist');
    if (!wrap) return;
    const list = this.view();
    wrap.innerHTML = list.slice(0, 60).map((p) => this.pcard(p)).join('') || '<div class="lbl">没有匹配的玩家</div>';
    DA('#body .pcard').forEach((b) => { b.onclick = () => this.select(b.dataset.uid); });
  },
  select(uid) {
    SEL = PLIST.find((p) => p.uid === uid) || null;
    DA('#body .pcard').forEach((x) => x.classList.toggle('on', x.dataset.uid === uid));
    this.renderEdit();
  },
  renderEdit() {
    const box = D('#plEdit'); if (!box || !SEL) return;
    const p = SEL;
    const charOpt = (EX.chars || []).map((c) =>
      `<option value="${c.id}"${p.char === c.id ? ' selected' : ''}>${this.esc(c.n)}</option>`).join('');
    const gunOpt = (EX.guns || []).map((g) =>
      `<option value="${g.id}"${p.gun === g.id ? ' selected' : ''}>${this.esc(g.n)}</option>`).join('');
    const matRows = ['M01', 'M02', 'M03', 'M04', 'M05', 'P01', 'P02', 'I01', 'I02', 'I03', 'I04']
      .map((id) => {
        const it = (EX.items || []).find((x) => x.id === id);
        return `<div class="kv"><span>${it ? this.esc(it.n) : id}</span>
          <b><input type="number" data-mat="${id}" value="${(p.mat || {})[id] || (p.use || {})[id] || 0}"
            style="width:78px;padding:4px 7px;font-size:12px;text-align:right"></b></div>`;
      }).join('');
    box.innerHTML = `<div class="card"><div class="card-t">编辑：${this.esc(p.name)}
        <span class="sub">UID ${this.esc(p.uid)}</span></div>
      <div class="row">
        <div class="zav">${this.esc((p.avatar || '🧑').slice(0, 2))}</div>
        <div class="rl"><b>战力 ${this.fmt(this.pw(p))}</b>
          <span>Lv.${p.lv || 1} · 经验 ${p.xp || 0} · 体力 ${Math.floor(p.stamina || 0)}</span></div>
        ${p.ban ? '<span class="chipx" style="background:rgba(255,95,109,.2);color:var(--red)">封禁中</span>' : ''}
      </div>

      <div class="f2" style="margin-top:10px">
        <div class="fld"><label>道号</label><input id="edName" value="${this.esc(p.name)}"></div>
        <div class="fld"><label>等级</label><input id="edLv" type="number" value="${p.lv || 1}"></div>
      </div>
      <div class="f3">
        <div class="fld"><label>金币</label><input id="edGold" type="number" value="${Math.floor(p.gold || 0)}"></div>
        <div class="fld"><label>钻石</label><input id="edDia" type="number" value="${Math.floor(p.diamond || 0)}"></div>
        <div class="fld"><label>成就点</label><input id="edAch" type="number" value="${Math.floor(p.ach || 0)}"></div>
      </div>
      <div class="f3">
        <div class="fld"><label>角色</label><select id="edChar">${charOpt}</select></div>
        <div class="fld"><label>武器</label><select id="edGun">${gunOpt}</select></div>
        <div class="fld"><label>武器等级</label><input id="edGunLv" type="number" value="${p.gunLv || 1}"></div>
      </div>
      <div class="f3">
        <div class="fld"><label>角色星级</label><input id="edStar" type="number" min="0" max="5" value="${p.charStar || 0}"></div>
        <div class="fld"><label>体力</label><input id="edStam" type="number" value="${Math.floor(p.stamina || 0)}"></div>
        <div class="fld"><label>活动代币</label><input id="edToken" type="number" value="${Math.floor(p.evToken || 0)}"></div>
      </div>
      <button class="btn g blk" id="edSave">💾 保存基础信息</button>

      <div class="card-t" style="margin-top:14px">材料 / 道具</div>
      ${matRows}
      <button class="btn blk" id="edMat">📦 保存材料</button>

      <div class="card-t" style="margin-top:14px">快捷操作</div>
      <div class="f2">
        <button class="btn g sm" id="edFull">💚 回满体力</button>
        <button class="btn sm" id="edRich">💰 全资源 +10万</button>
        <button class="btn o sm" id="edUnlock">🔓 解锁全部关卡</button>
        <button class="btn o sm" id="edAllGun">🔫 解锁全部武器</button>
        <button class="btn sm" id="edStar5">⭐ 直接 5 星</button>
        <button class="btn n sm" id="edResetTask">🔄 重置任务</button>
        <button class="btn d sm" id="edBan">${p.ban ? '✅ 解除封禁' : '🚫 封禁账号'}</button>
        <button class="btn d sm" id="edDel">🗑 删除存档</button>
      </div>
      <button class="btn n blk" id="edJson">📄 查看原始 JSON</button>
      <div id="jsonBox"></div>
    </div>`;

    const num = (id) => { const e = D(id); return e ? (parseFloat(e.value) || 0) : 0; };
    D('#edSave').onclick = async () => {
      p.name = (D('#edName').value || p.name).trim() || p.name;
      p.lv = Math.max(1, Math.floor(num('#edLv')));
      p.gold = Math.floor(num('#edGold')); p.diamond = Math.floor(num('#edDia'));
      p.ach = Math.floor(num('#edAch'));
      p.char = D('#edChar').value;
      if (!p.chars) p.chars = [];
      if (p.chars.indexOf(p.char) < 0) p.chars.push(p.char);
      p.gun = D('#edGun').value;
      if (!p.gunOwn) p.gunOwn = [];
      if (p.gunOwn.indexOf(p.gun) < 0) p.gunOwn.push(p.gun);
      p.gunLv = Math.max(1, Math.floor(num('#edGunLv')));
      p.charStar = Math.max(0, Math.min(5, Math.floor(num('#edStar'))));
      p.stamina = Math.floor(num('#edStam'));
      p.evToken = Math.floor(num('#edToken'));
      if (await this.savePlayer(p)) { this.toast('已保存 ' + p.name, 'ok'); this.buildDash(); this.render(); }
    };
    D('#edMat').onclick = async () => {
      p.mat = p.mat || {}; p.use = p.use || {};
      DA('#body [data-mat]').forEach((i) => {
        const id = i.dataset.mat, v = Math.max(0, Math.floor(parseFloat(i.value) || 0));
        const it = (EX.items || []).find((x) => x.id === id);
        if (it && it.type === '消耗') p.use[id] = v; else p.mat[id] = v;
      });
      if (await this.savePlayer(p)) { this.toast('材料已保存', 'ok'); this.render(); }
    };
    D('#edFull').onclick = async () => {
      p.stamina = EX.STAMINA_MAX || 100;
      if (await this.savePlayer(p)) { this.toast('体力已回满', 'ok'); this.render(); }
    };
    D('#edRich').onclick = async () => {
      p.gold = (p.gold || 0) + 100000; p.diamond = (p.diamond || 0) + 10000;
      p.mat = p.mat || {};
      ['M01', 'M02', 'M03', 'M04', 'M05', 'P01', 'P02'].forEach((k) => { p.mat[k] = (p.mat[k] || 0) + 1000; });
      if (await this.savePlayer(p)) { this.toast('资源已发放', 'ok'); this.render(); }
    };
    D('#edUnlock').onclick = async () => {
      p.cleared = p.cleared || {};
      (EX.levels || []).forEach((l) => { if (!p.cleared[l.id]) p.cleared[l.id] = 3; });
      if (await this.savePlayer(p)) { this.toast('已解锁全部关卡', 'ok'); this.render(); }
    };
    D('#edAllGun').onclick = async () => {
      p.gunOwn = (EX.guns || []).map((g) => g.id);
      p.chars = (EX.chars || []).map((c) => c.id);
      p.skins = (EX.skins || []).map((s) => s.id);
      if (await this.savePlayer(p)) { this.toast('已解锁全部武器/角色/皮肤', 'ok'); this.render(); }
    };
    D('#edStar5').onclick = async () => {
      p.charStar = 5;
      if (await this.savePlayer(p)) { this.toast('已设为 5 星', 'ok'); this.render(); }
    };
    D('#edResetTask').onclick = async () => {
      p.tasks = { mainClaimed: [], dailyClaimed: [], dailyDate: '', dailyProg: {},
        weeklyClaimed: [], weeklyKey: '', weeklyProg: {}, achieveClaimed: [] };
      if (await this.savePlayer(p)) { this.toast('任务已重置', 'ok'); this.render(); }
    };
    D('#edBan').onclick = async () => {
      p.ban = !p.ban;
      if (await this.savePlayer(p)) { this.toast(p.ban ? '已封禁' : '已解封', 'ok'); this.buildDash(); this.render(); }
    };
    D('#edDel').onclick = async () => {
      if (!confirm('确定删除 ' + p.name + ' 的存档？不可恢复！')) return;
      try { await Net.del(PDIR + p.uid + '.json'); } catch (e) {}
      PLIST = PLIST.filter((x) => x.uid !== p.uid); SEL = null;
      this.toast('已删除', 'ok'); this.buildDash(); this.render();
    };
    D('#edJson').onclick = () => {
      const b = D('#jsonBox'); if (!b) return;
      b.innerHTML = b.innerHTML
        ? ''
        : `<pre class="json" style="margin-top:8px">${this.esc(JSON.stringify(p, null, 1))}</pre>`;
    };
  },

  /* =======================================================
   *  3. 批量操作
   * ===================================================== */
  pg_batch() {
    const banned = PLIST.filter((p) => p.ban).length;
    const inactive = PLIST.filter((p) => Date.now() - (p.lastSeen || 0) > 30 * 864e5).length;
    return `<div class="ph"><h2>📮 批量操作</h2><span class="tagx">影响 ${PLIST.length} 人</span></div>

      <div class="card"><div class="card-t">全服邮件 <span class="sub">登录时自动结算</span></div>
        <div class="fld"><label>标题</label><input id="bkTitle" value="系统补偿" placeholder="邮件标题"></div>
        <div class="fld"><label>正文</label><textarea id="bkBody" rows="3" placeholder="邮件内容">感谢您的支持，请查收补偿奖励。</textarea></div>
        <div class="f3">
          <div class="fld"><label>金币</label><input id="bkGold" type="number" value="1000"></div>
          <div class="fld"><label>钻石</label><input id="bkDia" type="number" value="10"></div>
          <div class="fld"><label>体力</label><input id="bkStam" type="number" value="0"></div>
        </div>
        <div class="f3">
          <div class="fld"><label>金属 M01</label><input id="bkM01" type="number" value="0"></div>
          <div class="fld"><label>合金 M02</label><input id="bkM02" type="number" value="0"></div>
          <div class="fld"><label>稀有金属 M03</label><input id="bkM03" type="number" value="0"></div>
        </div>
        <button class="btn blk" id="bkSend">📮 发送全服邮件</button>
      </div>

      <div class="card"><div class="card-t">全服发放 <span class="sub">直接写入存档</span></div>
        <div class="f3">
          <div class="fld"><label>金币</label><input id="bgGold" type="number" value="0"></div>
          <div class="fld"><label>钻石</label><input id="bgDia" type="number" value="0"></div>
          <div class="fld"><label>成就点</label><input id="bgAch" type="number" value="0"></div>
        </div>
        <button class="btn g blk" id="bgGo">🎁 立即发放</button>
      </div>

      <div class="card"><div class="card-t">账号维护</div>
        <div class="kv"><span>已封禁账号</span><b class="r">${banned}</b></div>
        <div class="kv"><span>30天未活跃</span><b>${inactive}</b></div>
        <button class="btn g blk" id="bkUnban">✅ 解除全部封禁</button>
        <button class="btn o blk" id="bkRecalc">🔄 重算全部战力</button>
        <button class="btn d blk" id="bkClean">🧹 清理30天不活跃存档</button>
      </div>

      <div class="card"><div class="card-t">全服双倍 <span class="sub">存入全局配置</span></div>
        <div class="kv"><span>双倍金币</span><b><input type="checkbox" id="bkD2G"></b></div>
        <div class="kv"><span>双倍经验</span><b><input type="checkbox" id="bkD2X"></b></div>
        <div class="kv"><span>双倍掉落</span><b><input type="checkbox" id="bkD2D"></b></div>
        <button class="btn o blk" id="bkSaveD2">保存双倍设置</button>
      </div>`;
  },
  bd_batch() {
    const num = (id) => { const e = D(id); return e ? (parseFloat(e.value) || 0) : 0; };
    const send = D('#bkSend');
    if (send) send.onclick = async () => {
      const t = (D('#bkTitle').value || '系统邮件').trim();
      const b = (D('#bkBody').value || '').trim();
      const rw = { gold: num('#bkGold'), dia: num('#bkDia'), stamina: num('#bkStam'),
        M01: num('#bkM01'), M02: num('#bkM02'), M03: num('#bkM03') };
      let n = 0;
      for (const p of PLIST) {
        p.mail = p.mail || [];
        p.mail.unshift({ id: 'bk' + Date.now() + n, t: t, b: b, rw: rw, got: false, at: Date.now() });
        if (p.mail.length > 30) p.mail.length = 30;
        await this.savePlayer(p); n++;
      }
      this.toast('已发送给 ' + n + ' 名玩家', 'ok');
    };
    const go = D('#bgGo');
    if (go) go.onclick = async () => {
      const g = num('#bgGold'), d = num('#bgDia'), a = num('#bgAch');
      if (!g && !d && !a) return this.toast('请填写发放数量', 'err');
      let n = 0;
      for (const p of PLIST) {
        p.gold = (p.gold || 0) + g; p.diamond = (p.diamond || 0) + d; p.ach = (p.ach || 0) + a;
        await this.savePlayer(p); n++;
      }
      this.toast('已发放给 ' + n + ' 人', 'ok'); this.buildDash();
    };
    const ub = D('#bkUnban');
    if (ub) ub.onclick = async () => {
      let n = 0;
      for (const p of PLIST) { if (p.ban) { p.ban = false; await this.savePlayer(p); n++; } }
      this.toast('已解封 ' + n + ' 人', 'ok'); this.buildDash(); this.render();
    };
    const rc = D('#bkRecalc');
    if (rc) rc.onclick = () => {
      let n = 0;
      PLIST.forEach((p) => { this.pw(p); n++; });
      this.toast('已重算 ' + n + ' 人战力', 'ok'); this.render();
    };
    const cl = D('#bkClean');
    if (cl) cl.onclick = async () => {
      const old = PLIST.filter((p) => Date.now() - (p.lastSeen || 0) > 30 * 864e5);
      if (!old.length) return this.toast('没有不活跃存档', 'err');
      if (!confirm('确定清理 ' + old.length + ' 个 30 天未活跃存档？')) return;
      let n = 0;
      for (const p of old) { try { await Net.del(PDIR + p.uid + '.json'); n++; } catch (e) {} }
      await this.loadPlayers(); this.toast('已清理 ' + n + ' 个', 'ok'); this.render();
    };
    const sd = D('#bkSaveD2');
    if (sd) sd.onclick = async () => {
      const d2 = { gold: D('#bkD2G').checked, xp: D('#bkD2X').checked, drop: D('#bkD2D').checked };
      try {
        await Net.write('data/zb/double.json', { ...d2, at: Date.now() }, '后台设置双倍');
        this.toast('双倍设置已保存', 'ok');
      } catch (e) { this.toast('保存失败', 'err'); }
    };
    /* 读取当前双倍设置 */
    Net.read('data/zb/double.json').then((r) => {
      if (r && r.data) {
        const g = D('#bkD2G'), x = D('#bkD2X'), dd = D('#bkD2D');
        if (g) g.checked = !!r.data.gold;
        if (x) x.checked = !!r.data.xp;
        if (dd) dd.checked = !!r.data.drop;
      }
    }).catch(() => {});
  },

  /* =======================================================
   *  4. 内容发放
   * ===================================================== */
  pg_grant() {
    return `<div class="ph"><h2>🎁 内容发放</h2><span class="tagx">${SEL ? this.esc(SEL.name) : '未选玩家'}</span></div>
      <div class="card"><div class="card-t">① 选择玩家</div>
        <div class="sb"><input id="gtSearch" placeholder="搜索道号" value="${this.esc(FILTER)}"></div>
        <div class="plist" id="gtList">${this.view().slice(0, 24).map((p) => `
          <div class="pcard ${SEL && SEL.uid === p.uid ? 'on' : ''}" data-gt="${this.esc(p.uid)}">
            <div class="r1"><div class="zav sm">${this.esc((p.avatar || '🧑').slice(0, 2))}</div>
              <b>${this.esc(p.name)}</b></div>
            <div class="r3">Lv.${p.lv || 1} · 战力 ${this.fmt(this.pw(p))}</div></div>`).join('')
          || '<div class="lbl">无匹配玩家</div>'}</div>
      </div>
      <div id="gtBody">${SEL ? this.grantBody() : '<div class="card"><div class="lbl">请先在上方选择玩家</div></div>'}</div>`;
  },
  grantBody() {
    const grid = (list, kind) => `<div class="g4">${list.map((it) => `
      <div class="gc" data-g="${kind}|${this.esc(it.id)}">
        <i>${it.icon || '📦'}</i><b>${this.esc(it.n)}</b>
        <s>${this.esc(it.q || it.type || '')}</s></div>`).join('')}</div>`;
    return `<div class="card"><div class="card-t">② 选择发放内容 <span class="sub">点选后填数量</span></div>
      <div class="fld"><label>数量</label><input id="gtN" type="number" value="1" min="1" style="width:110px"></div>

      <div class="card-t" style="margin-top:10px">武器</div>${grid(EX.guns || [], 'gun')}
      <div class="card-t" style="margin-top:10px">角色</div>${grid(EX.chars || [], 'char')}
      <div class="card-t" style="margin-top:10px">皮肤</div>${grid(EX.skins || [], 'skin')}
      <div class="card-t" style="margin-top:10px">材料 / 道具</div>${grid(EX.items || [], 'item')}
      <div class="card-t" style="margin-top:10px">宝石</div>${grid(EX.gems || [], 'gem')}
      <div class="card-t" style="margin-top:10px">佣兵</div>${grid(EX.mercs || [], 'merc')}
      <div class="card-t" style="margin-top:10px">芯片</div>${grid(EX.chips || [], 'chip')}
      <div id="gtPick" style="margin-top:10px;font-size:12px;color:var(--txt3)">未选择内容</div>
      <button class="btn blk" id="gtGo" style="margin-top:8px">✅ 确认发放</button>
      <button class="btn g blk" id="gtAll">🌟 一键全解锁（武器/角色/皮肤/佣兵）</button>
    </div>`;
  },
  bd_grant() {
    const s = D('#gtSearch');
    if (s) s.oninput = () => { FILTER = s.value; this.render(); };
    DA('#body [data-gt]').forEach((b) => { b.onclick = () => {
      SEL = PLIST.find((p) => p.uid === b.dataset.gt) || null; this.render();
    }; });
    let pick = null;
    DA('#body [data-g]').forEach((b) => { b.onclick = () => {
      DA('#body .gc').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      pick = b.dataset.g;
      const [k, id] = pick.split('|');
      const box = D('#gtPick');
      if (box) box.textContent = '已选择：' + k + ' → ' + id;
    }; });
    const go = D('#gtGo');
    if (go) go.onclick = async () => {
      if (!SEL) return this.toast('请先选择玩家', 'err');
      if (!pick) return this.toast('请选择发放内容', 'err');
      const [k, id] = pick.split('|');
      const n = Math.max(1, Math.floor(parseFloat(D('#gtN').value) || 1));
      const p = SEL;
      p.gunOwn = p.gunOwn || []; p.chars = p.chars || []; p.skins = p.skins || [];
      p.mat = p.mat || {}; p.use = p.use || {}; p.mercs = p.mercs || []; p.gems = p.gems || {};
      let msg = '';
      if (k === 'gun') { if (p.gunOwn.indexOf(id) < 0) p.gunOwn.push(id); msg = '已发放武器 ' + id; }
      else if (k === 'char') { if (p.chars.indexOf(id) < 0) p.chars.push(id); msg = '已解锁角色 ' + id; }
      else if (k === 'skin') { if (p.skins.indexOf(id) < 0) p.skins.push(id); msg = '已发放皮肤 ' + id; }
      else if (k === 'merc') { if (p.mercs.indexOf(id) < 0) p.mercs.push(id); msg = '已发放佣兵 ' + id; }
      else if (k === 'gem') { p.gems[id] = (p.gems[id] || 0) + n; msg = '已发放宝石 ×' + n; }
      else if (k === 'chip') {
        p.chips = p.chips || {};
        const cid = 'ch_' + Date.now();
        p.chips[cid] = { id: cid, n: id, lv: 1, icon: '🔲' };
        msg = '已发放芯片';
      } else {
        const it = (EX.items || []).find((x) => x.id === id);
        if (it && it.type === '消耗') p.use[id] = (p.use[id] || 0) + n;
        else p.mat[id] = (p.mat[id] || 0) + n;
        msg = '已发放 ×' + n;
      }
      if (await this.savePlayer(p)) { this.toast(msg + ' 给 ' + p.name, 'ok'); this.render(); }
    };
    const all = D('#gtAll');
    if (all) all.onclick = async () => {
      if (!SEL) return this.toast('请先选择玩家', 'err');
      const p = SEL;
      p.gunOwn = (EX.guns || []).map((g) => g.id);
      p.chars = (EX.chars || []).map((c) => c.id);
      p.skins = (EX.skins || []).map((s) => s.id);
      p.mercs = (EX.mercs || []).map((m) => m.id);
      p.gems = p.gems || {};
      (EX.gems || []).forEach((g) => { p.gems[g.id] = (p.gems[g.id] || 0) + 5; });
      if (await this.savePlayer(p)) { this.toast('已全解锁 ' + p.name, 'ok'); this.render(); }
    };
  },

  /* =======================================================
   *  5. 僵尸图鉴
   * ===================================================== */
  pg_zombie() {
    const zs = EX.zombies || [];
    return `<div class="ph"><h2>🧟 僵尸图鉴</h2><span class="tagx">${zs.length} 种</span></div>
      <div class="card"><div class="card-t">怪物列表 <span class="sub">表09 怪物技能</span></div>
        <table class="tb"><thead><tr>
          <th>名称</th><th>血量</th><th>速度</th><th>伤害</th><th>技能</th><th>经验</th><th>金币</th></tr>
        </thead><tbody>${zs.map((z) => `<tr>
          <td>${z.icon || ''} ${this.esc(z.n)}</td>
          <td>${z.hp}</td><td>${z.spd}</td><td>${z.dmg}</td>
          <td>${this.esc(z.skill || '')}</td><td>${z.xp || 0}</td><td>${z.gold || 0}</td>
        </tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><div class="card-t">BOSS <span class="sub">${(EX.bosses || []).length} 个</span></div>
        ${(EX.bosses || []).map((b) => `<div class="row">
          <div class="zav sm">${b.icon || '👹'}</div>
          <div class="rl"><b>${this.esc(b.n)}</b><span>${this.esc(b.desc || b.sk || '')}</span></div>
          <span class="chipx y">${b.hp || ''} HP</span></div>`).join('') || '<div class="lbl">无</div>'}
      </div>
      <div class="card"><div class="card-t">掉落概率 <span class="sub">表31 DR01~DR12</span></div>
        <table class="tb"><thead><tr><th>来源</th><th>物品</th><th>概率</th><th>数量</th></tr></thead>
        <tbody>${(EX.dropTable || []).map((d) => `<tr>
          <td>${this.esc(d.src)}</td><td>${this.esc(d.n)}</td>
          <td>${(d.rate * 100).toFixed(0)}%</td><td>${d.min}-${d.max}</td></tr>`).join('')}</tbody></table>
      </div>`;
  },
  bd_zombie() {},

  /* =======================================================
   *  6. 技能数据
   * ===================================================== */
  pg_skill() {
    const sks = EX.skills || [];
    const byType = {};
    sks.forEach((s) => { const t = s.type || s.el || '其他'; (byType[t] = byType[t] || []).push(s); });
    return `<div class="ph"><h2>✨ 局内技能</h2><span class="tagx">${sks.length} 个</span></div>
      ${Object.keys(byType).map((t) => `<div class="card">
        <div class="card-t">${this.esc(t)} <span class="sub">${byType[t].length} 个</span></div>
        ${byType[t].map((s) => `<div class="row">
          <div class="zav sm">${s.icon || '✨'}</div>
          <div class="rl"><b>${this.esc(s.n)}</b><span>${this.esc(s.desc || s.eff || '')}</span></div>
          <span class="chipx">${this.esc(s.conflict ? '互斥:' + s.conflict : '可叠加')}</span>
        </div>`).join('')}</div>`).join('')}
      <div class="card"><div class="card-t">炮台 <span class="sub">${(EX.turrets || []).length} 种</span></div>
        ${(EX.turrets || []).map((t) => `<div class="row">
          <div class="zav sm">${t.icon || '🗼'}</div>
          <div class="rl"><b>${this.esc(t.n)}</b><span>${this.esc(t.desc || '')}</span></div>
          <span class="chipx">${t.cost || 0} 局内金币</span></div>`).join('')}
      </div>
      <div class="card"><div class="card-t">永久天赋 <span class="sub">${(EX.talents || []).length} 项</span></div>
        ${(EX.talents || []).map((t) => `<div class="kv"><span>${this.esc(t.n)}</span>
          <b class="g">${this.esc(t.desc || '')}</b></div>`).join('')}
      </div>`;
  },
  bd_skill() {},

  /* =======================================================
   *  7. 武器词条
   * ===================================================== */
  pg_weapon() {
    return `<div class="ph"><h2>🔫 武器与词条</h2><span class="tagx">表30 / 表44</span></div>
      <div class="card"><div class="card-t">武器数值 <span class="sub">表44</span></div>
        <table class="tb"><thead><tr>
          <th>武器</th><th>类型</th><th>伤害</th><th>射速</th><th>弹夹</th><th>换弹</th><th>暴击</th><th>槽位</th></tr>
        </thead><tbody>${(EX.guns || []).map((g) => `<tr>
          <td>${g.icon || ''} ${this.esc(g.n)}</td><td>${this.esc(g.type || '')}</td>
          <td>${g.dmg} (${g.dmgMin || '-'}~${g.dmgMax || '-'})</td><td>${g.rate}/s</td>
          <td>${g.mag}</td><td>${g.reload}s</td><td>${((g.crit || 0) * 100).toFixed(0)}%</td>
          <td>${g.slots || 2}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><div class="card-t">词条池 <span class="sub">表30 AF01~AF12</span></div>
        <table class="tb"><thead><tr><th>ID</th><th>词条</th><th>品质</th><th>效果</th><th>可叠加</th><th>来源</th></tr></thead>
        <tbody>${(EX.affixes || []).map((a) => `<tr>
          <td>${a.id}</td><td>${this.esc(a.n)}</td><td>${a.q}</td>
          <td>${this.esc(a.eff)}</td><td>${a.stack ? '是' : '否'}</td>
          <td>${this.esc(a.src)}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><div class="card-t">为玩家重洗词条</div>
        <div class="sb"><input id="wpSearch" placeholder="搜索道号" value="${this.esc(FILTER)}"></div>
        <div class="f2">
          <button class="btn blk" id="wpR">🔄 普通洗练（消耗金币）</button>
          <button class="btn o blk" id="wpRL">🔴 传说洗练（消耗钻石）</button>
        </div>
        <div class="lbl" id="wpTip">${SEL ? '当前：' + this.esc(SEL.name) : '请先点击玩家卡片'}</div>
        <div class="plist" id="wpList">${this.view().slice(0, 12).map((p) => `
          <div class="pcard ${SEL && SEL.uid === p.uid ? 'on' : ''}" data-wp="${this.esc(p.uid)}">
            <div class="r1"><div class="zav sm">${this.esc((p.avatar || '🧑').slice(0, 2))}</div>
              <b>${this.esc(p.name)}</b></div>
            <div class="r3">${this.esc((EX.guns || []).find((g) => g.id === p.gun) || { n: p.gun }).n}</div>
          </div>`).join('')}</div>
      </div>`;
  },
  bd_weapon() {
    const s = D('#wpSearch');
    if (s) s.oninput = () => { FILTER = s.value; this.render(); };
    DA('#body [data-wp]').forEach((b) => { b.onclick = () => {
      SEL = PLIST.find((p) => p.uid === b.dataset.wp) || null; this.render();
    }; });
    const r = D('#wpR');
    if (r) r.onclick = async () => {
      if (!SEL) return this.toast('请先选择玩家', 'err');
      const res = E.rerollAffix(SEL, false);
      if (res.ok && await this.savePlayer(SEL)) this.toast(res.msg, 'ok');
      else this.toast(res.msg, 'err');
      this.render();
    };
    const rl = D('#wpRL');
    if (rl) rl.onclick = async () => {
      if (!SEL) return this.toast('请先选择玩家', 'err');
      const res = E.rerollAffix(SEL, true);
      if (res.ok && await this.savePlayer(SEL)) this.toast(res.msg, 'ok');
      else this.toast(res.msg, 'err');
      this.render();
    };
  },

  /* =======================================================
   *  8. 运营数据
   * ===================================================== */
  pg_ops() {
    const mi = window.OPS ? OPS.manifestInfo() : { ver: '-', n: 0 };
    const cv = window.OPS ? OPS.curVersion() : null;
    const st = window.OPS ? OPS.trackStat() : {};
    const buf = window.OPS ? OPS.trackBuf() : [];
    const lastEv = buf.slice(-12).reverse();
    return `<div class="ph"><h2>📈 运营数据</h2><span class="tagx">表37 / 38 / 40 / 02</span></div>

      <div class="card"><div class="card-t">热更新 <span class="sub">表02 #15</span></div>
        <div class="kv"><span>资源版本号</span><b class="y">${this.esc(mi.ver)}</b></div>
        <div class="kv"><span>清单条目</span><b>${mi.n}</b></div>
        <div class="lbl">改 EX.HOT_UPDATE.version 即触发全服资源刷新</div>
      </div>

      <div class="card"><div class="card-t">版本进度 <span class="sub">表38</span></div>
        <div class="kv"><span>当前版本</span><b class="g">${cv ? cv.v + ' ' + this.esc(cv.n) : '-'}</b></div>
        ${(EX.VERSIONS || []).map((v) => `<div class="row">
          <div class="zav sm">${v.done ? '✔' : '○'}</div>
          <div class="rl"><b>${v.v} ${this.esc(v.n)}</b><span>${this.esc(v.wk)} · ${this.esc(v.c)}</span></div>
          <span class="chipx ${v.done ? 'g' : ''}">${v.done ? '已完成' : '开发中'}</span></div>`).join('')}
      </div>

      <div class="card"><div class="card-t">埋点事件定义 <span class="sub">表37 · ${(EX.TRACK_EVENTS || []).length} 个</span></div>
        <table class="tb"><thead><tr><th>事件</th><th>名称</th><th>用途</th><th>触发</th><th>优先级</th></tr></thead>
        <tbody>${(EX.TRACK_EVENTS || []).map((e) => `<tr>
          <td>${e.id}</td><td>${this.esc(e.n)}</td><td>${this.esc(e.use)}</td>
          <td>${this.esc(e.trig)}</td><td>${e.pr}</td></tr>`).join('')}</tbody></table>
      </div>

      <div class="card"><div class="card-t">本地埋点流水 <span class="sub">最近 ${buf.length} 条</span></div>
        ${lastEv.length ? lastEv.map((x) => `<div class="row">
          <div class="zav sm">📊</div>
          <div class="rl"><b>${this.esc(x.n || x.ev)}</b>
            <span>${this.esc(JSON.stringify(x.p || {}))} · ${this.ago(x.t)}</span></div>
          <span class="chipx">${x.pr}</span></div>`).join('') : '<div class="lbl">暂无（埋点数据存在各玩家浏览器本地）</div>'}
        <div class="lbl">埋点存于玩家本地，后台仅显示本机的记录</div>
      </div>

      <div class="card"><div class="card-t">后端接口映射 <span class="sub">表40</span></div>
        <table class="tb"><thead><tr><th>接口</th><th>名称</th><th>方法</th><th>GitHub 实现</th></tr></thead>
        <tbody>${(EX.APIS || []).map((a) => `<tr>
          <td>${a.id}</td><td>${this.esc(a.n)}</td><td>${this.esc(a.m)}</td>
          <td>${this.esc(a.impl)}</td></tr>`).join('')}</tbody></table>
      </div>`;
  },
  bd_ops() {},

  /* =======================================================
   *  9. 数值配置
   * ===================================================== */
  pg_config() {
    const cfgs = [
      ['STAMINA_MAX', '体力上限', EX.STAMINA_MAX],
      ['SWEEP_STAMINA', '扫荡单次体力', EX.SWEEP_STAMINA],
      ['SWEEP_MAX', '扫荡单次上限', EX.SWEEP_MAX],
      ['AFFIX_REROLL_GOLD', '词条洗练金币', EX.AFFIX_REROLL_GOLD],
      ['AFFIX_REROLL_LEGEND_DIA', '传说洗练钻石', EX.AFFIX_REROLL_LEGEND_DIA],
      ['STAR_MAX', '角色最高星级', EX.STAR_MAX],
      ['GUN_GROW', '武器每级成长', EX.GUN_GROW],
      ['SPD_MUL', '移速系数', EX.SPD_MUL],
      ['ENDLESS_UNLOCK', '无尽解锁关卡', EX.ENDLESS_UNLOCK],
      ['ACH_POINT', '成就点名称', EX.ACH_POINT],
    ];
    return `<div class="ph"><h2>🎛️ 数值配置</h2><span class="tagx">实时生效</span></div>
      <div class="card"><div class="card-t">核心数值 <span class="sub">修改后点保存</span></div>
        ${cfgs.map(([k, n, v]) => `<div class="kv"><span>${this.esc(n)}<br>
          <s style="font-size:9px;color:var(--txt3);text-decoration:none">${this.esc(k)}</s></span>
          <b><input type="text" data-cfg="${k}" value="${this.esc(v)}"
            style="width:110px;padding:4px 7px;font-size:12px;text-align:right"></b></div>`).join('')}
        <button class="btn blk" id="cfSave">💾 保存数值（写入云端 config）</button>
        <div class="lbl">写入 data/zb/cfg.json，游戏启动时会尝试加载覆盖</div>
      </div>

      <div class="card"><div class="card-t">全服公告</div>
        <div class="fld"><label>公告标题</label><input id="nfTitle" placeholder="公告标题"></div>
        <div class="fld"><label>公告内容</label><textarea id="nfBody" rows="3" placeholder="公告正文"></textarea></div>
        <button class="btn o blk" id="nfSave">📢 发布公告</button>
      </div>

      <div class="card"><div class="card-t">配置数据概览 <span class="sub">只读</span></div>
        <table class="tb"><thead><tr><th>数据表</th><th>条目数</th></tr></thead><tbody>
        ${['zombies', 'guns', 'skills', 'levels', 'chapters', 'items', 'chips', 'gems',
           'affixes', 'mercs', 'turrets', 'talents', 'skins', 'buildings', 'legions', 'expeds']
          .map((k) => `<tr><td>${k}</td><td>${Array.isArray(EX[k]) ? EX[k].length : (typeof EX[k])}</td></tr>`).join('')}
        </tbody></table>
      </div>`;
  },
  bd_config() {
    const sv = D('#cfSave');
    if (sv) sv.onclick = async () => {
      const obj = {};
      DA('#body [data-cfg]').forEach((i) => { obj[i.dataset.cfg] = i.value; });
      try {
        await Net.write('data/zb/cfg.json', obj, '后台修改数值');
        this.toast('数值已保存到云端', 'ok');
      } catch (e) { this.toast('保存失败', 'err'); }
    };
    const nf = D('#nfSave');
    if (nf) nf.onclick = async () => {
      const t = (D('#nfTitle').value || '').trim();
      const b = (D('#nfBody').value || '').trim();
      if (!t && !b) return this.toast('请填写公告内容', 'err');
      try {
        await Net.write('data/zb/notice.json', { t: t, b: b, at: Date.now() }, '发布公告');
        this.toast('公告已发布', 'ok');
      } catch (e) { this.toast('发布失败', 'err'); }
    };
    Net.read('data/zb/cfg.json').then((r) => {
      if (r && r.data) DA('#body [data-cfg]').forEach((i) => {
        if (r.data[i.dataset.cfg] != null) i.value = r.data[i.dataset.cfg];
      });
    }).catch(() => {});
    Net.read('data/zb/notice.json').then((r) => {
      if (r && r.data) {
        const t = D('#nfTitle'), b = D('#nfBody');
        if (t) t.value = r.data.t || '';
        if (b) b.value = r.data.b || '';
      }
    }).catch(() => {});
  },

  /* =======================================================
   *  10. 数据维护
   * ===================================================== */
  pg_data() {
    return `<div class="ph"><h2>🗄️ 数据维护</h2><span class="tagx">${PLIST.length} 份存档</span></div>
      <div class="card"><div class="card-t">排行榜</div>
        <div class="kv"><span>榜单记录</span><b id="lbN">—</b></div>
        <button class="btn blk" id="dtLb">🏆 重建战力榜</button>
        <button class="btn n blk" id="dtLbEndless">♾️ 重建无尽榜</button>
      </div>

      <div class="card"><div class="card-t">备份</div>
        <div class="lbl">把全部玩家存档打包成一个 JSON 存入云端</div>
        <button class="btn g blk" id="dtBackup">📦 立即全量备份</button>
        <div class="lbl" id="dtBkTip"></div>
      </div>

      <div class="card"><div class="card-t">清理</div>
        <button class="btn d blk" id="dtClearMail">🧹 清空全部邮件</button>
        <button class="btn d blk" id="dtClearTask">🔄 重置全部任务进度</button>
        <div class="lbl">危险操作，执行前建议先备份</div>
      </div>

      <div class="card"><div class="card-t">存储用量</div>
        <div class="kv"><span>玩家存档目录</span><b>${PDIR}</b></div>
        <div class="kv"><span>已加载存档</span><b>${PLIST.length}</b></div>
        <div class="kv"><span>云端状态</span><b class="${Net.online ? 'g' : 'r'}">${Net.online ? '已连接' : '离线'}</b></div>
      </div>`;
  },
  bd_data() {
    Net.read('data/zb/leaderboard.json').then((r) => {
      const e = D('#lbN');
      if (e) e.textContent = r && r.data && r.data.list ? r.data.list.length + ' 条' : '0 条';
    }).catch(() => {});
    const lb = D('#dtLb');
    if (lb) lb.onclick = async () => {
      const list = PLIST.slice().sort((a, b) => this.pw(b) - this.pw(a)).slice(0, 50)
        .map((p) => ({ uid: p.uid, name: p.name, lv: p.lv || 1, pw: this.pw(p),
          char: p.char, avatar: p.avatar || '' }));
      try {
        await Net.write('data/zb/leaderboard.json', { list: list, updated: Date.now() }, '重建战力榜');
        this.toast('战力榜已重建（' + list.length + ' 人）', 'ok');
      } catch (e) { this.toast('失败：' + e.message, 'err'); }
    };
    const le = D('#dtLbEndless');
    if (le) le.onclick = async () => {
      const list = PLIST.slice().sort((a, b) => (b.endlessBest || 0) - (a.endlessBest || 0)).slice(0, 50)
        .map((p) => ({ uid: p.uid, name: p.name, t: p.endlessBest || 0, lv: p.lv || 1 }));
      try {
        await Net.write('data/zb/endless.json', { list: list, updated: Date.now() }, '重建无尽榜');
        this.toast('无尽榜已重建', 'ok');
      } catch (e) { this.toast('失败', 'err'); }
    };
    const bk = D('#dtBackup');
    if (bk) bk.onclick = async () => {
      const stamp = new Date().toISOString().slice(0, 10);
      try {
        await Net.write('data/zb/backup_' + stamp + '.json',
          { n: PLIST.length, at: Date.now(), list: PLIST }, '全量备份');
        const t = D('#dtBkTip');
        if (t) t.textContent = '已备份 ' + PLIST.length + ' 份 → backup_' + stamp + '.json';
        this.toast('备份完成', 'ok');
      } catch (e) { this.toast('备份失败', 'err'); }
    };
    const cm = D('#dtClearMail');
    if (cm) cm.onclick = async () => {
      if (!confirm('清空全部玩家的邮件？')) return;
      let n = 0;
      for (const p of PLIST) { if ((p.mail || []).length) { p.mail = []; await this.savePlayer(p); n++; } }
      this.toast('已清空 ' + n + ' 人的邮件', 'ok');
    };
    const ct = D('#dtClearTask');
    if (ct) ct.onclick = async () => {
      if (!confirm('重置全部玩家的任务进度？')) return;
      let n = 0;
      for (const p of PLIST) {
        p.tasks = { mainClaimed: [], dailyClaimed: [], dailyDate: '', dailyProg: {},
          weeklyClaimed: [], weeklyKey: '', weeklyProg: {}, achieveClaimed: [] };
        await this.savePlayer(p); n++;
      }
      this.toast('已重置 ' + n + ' 人', 'ok');
    };
  },

  /* =======================================================
   *  11. 系统设置
   * ===================================================== */
  pg_sys() {
    const eps = (GH && GH.extra) || [];
    return `<div class="ph"><h2>⚙️ 系统设置</h2><span class="tagx">${Net.online ? '在线' : '离线'}</span></div>

      <div class="card"><div class="card-t">连接状态</div>
        <div class="kv"><span>状态</span><b class="${Net.online ? 'g' : 'r'}">${Net.online ? '● 已连接' : '○ 离线'}</b></div>
        <div class="kv"><span>当前端点</span><b style="font-size:10px">${this.esc((Net.endpoint || '').replace('https://', ''))}</b></div>
        <button class="btn blk" id="syRe">🔄 重新检测</button>
        <button class="btn n blk" id="syDiag">🔍 逐端点诊断</button>
        <div id="syDiagBox"><div class="lbl">点「逐端点诊断」测试全部通道</div></div>
      </div>

      <div class="card"><div class="card-t">自定义加速地址</div>
        <div class="lbl">填 Cloudflare Worker 地址，一行一个</div>
        <textarea id="syEps" rows="3" placeholder="https://xxx.workers.dev">${this.esc(eps.join('\n'))}</textarea>
        <button class="btn c blk" id="sySaveEps" style="margin-top:8px">💾 保存加速地址</button>
      </div>

      <div class="card"><div class="card-t">仓库信息</div>
        <div class="kv"><span>仓库</span><b>${this.esc((GH && GH.owner) || '')}/${this.esc((GH && GH.repo) || '')}</b></div>
        <div class="kv"><span>数据分支</span><b>${this.esc((GH && GH.dataBranch) || 'main')}</b></div>
        <div class="kv"><span>存档目录</span><b>${PDIR}</b></div>
        <div class="kv"><span>后台口令</span><b class="y">${PWD}</b></div>
      </div>

      <div class="card"><div class="card-t">Worker 部署代码 <span class="sub">点开复制</span></div>
        <button class="btn n blk" id="syWorker">📋 显示部署代码</button>
        <div id="syWkBox"></div>
      </div>`;
  },
  bd_sys() {
    const re = D('#syRe');
    if (re) re.onclick = async () => {
      this.toast('检测中…');
      try { await Net.init(); } catch (e) {}
      this.net(); this.render();
      this.toast(Net.online ? '已连接' : '仍然离线', Net.online ? 'ok' : 'err');
    };
    const dg = D('#syDiag');
    if (dg) dg.onclick = async () => {
      const box = D('#syDiagBox');
      if (!box) return;
      box.innerHTML = '<div class="lbl">测试中…</div>';
      const eps = [].concat((GH && GH.endpoints) || [], (GH && GH.extra) || []);
      const uniq = Array.from(new Set(eps.filter(Boolean)));
      const out = [];
      for (const e of uniq.slice(0, 20)) {
        const t0 = Date.now();
        let ok = false, st = '';
        try {
          const r = await fetch(e.replace(/\/$/, '') + '/rate_limit', { method: 'GET' });
          st = 'HTTP ' + r.status;
          ok = r.status === 200 || r.status === 401 || r.status === 403 || r.status === 404;
        } catch (err) { st = '失败'; }
        out.push({ e, ok, st, ms: Date.now() - t0 });
      }
      box.innerHTML = out.map((o) => `<div class="row">
        <div class="zav sm">${o.ok ? '✔' : '✘'}</div>
        <div class="rl"><b style="font-size:10px">${this.esc(o.e.replace('https://', '').slice(0, 42))}</b>
          <span>${o.st} · ${o.ms}ms</span></div></div>`).join('') || '<div class="lbl">无端点</div>';
    };
    const sv = D('#sySaveEps');
    if (sv) sv.onclick = () => {
      const v = (D('#syEps').value || '').split('\n').map((x) => x.trim()).filter(Boolean);
      try { localStorage.setItem('gh_extra', JSON.stringify(v)); } catch (e) {}
      if (window.GH) GH.extra = v;
      this.toast('已保存 ' + v.length + ' 个加速地址（刷新后生效）', 'ok');
    };
    const wk = D('#syWorker');
    if (wk) wk.onclick = () => {
      const b = D('#syWkBox'); if (!b) return;
      b.innerHTML = b.innerHTML ? '' : `<pre class="json" style="margin-top:8px">${this.esc(
`// Cloudflare Worker → 粘贴到 Edit code
export default {
  async fetch(req, env) {
    const T = env.GH_TOKEN || '你的Token';
    const url = new URL(req.url);
    const gh = 'https://api.github.com' + url.pathname + url.search;
    const h = new Headers(req.headers);
    h.set('Authorization', 'Bearer ' + T);
    h.set('User-Agent', 'zb-admin');
    const r = await fetch(gh, { method: req.method, headers: h, body: req.body });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        'content-type': r.headers.get('content-type') || 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,PUT,DELETE,PATCH,OPTIONS',
        'access-control-allow-headers': '*',
      },
    });
  },
};`)}</pre>`;
    };
    /* 读取已保存的加速地址 */
    try {
      const v = JSON.parse(localStorage.getItem('gh_extra') || '[]');
      if (v.length && window.GH) GH.extra = v;
    } catch (e) {}
  },
};

window.addEventListener('DOMContentLoaded', () => { A.init(); });
