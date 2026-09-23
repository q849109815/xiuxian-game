/* =========================================================
 * core.js —— 运营后台核心：工具 / 数据层 / 审计 / 路由
 * ========================================================= */

const PWD = 'fj19941224';
const AKEY = 'zb_admin_ok';
const PDIR = 'data/zb/players/';

/* ---------------- 云端数据路径 ---------------- */
const DBP = {
  mail: 'data/zb/mail.json',           // 邮件（广播+定向）
  cdkey: 'data/zb/cdkey.json',         // 礼包码 + 模板
  activity: 'data/zb/activity.json',   // 活动
  actshop: 'data/zb/actshop.json',     // 活动商店
  achshop: 'data/zb/achshop.json',     // 成就商店
  rankrw: 'data/zb/rankrw.json',       // 排行榜奖励
  rank: 'data/zb/leaderboard.json',    // 战力榜
  endless: 'data/zb/endless.json',     // 无尽榜
  cfg: 'data/zb/cfg.json',             // 数值配置
  hotfix: 'data/zb/hotfix.json',       // 热更历史
  server: 'data/zb/server.json',       // 服务器状态
  accounts: 'data/zb/accounts.json',   // 后台账号
  roles: 'data/zb/roles.json',         // 角色权限
  risk: 'data/zb/risk.json',           // 风控（封禁日志/黑名单/预警）
  order: 'data/zb/order.json',         // 充值订单
  gmlog: 'data/zb/gmlog.json',         // GM 操作日志
  stats: 'data/zb/stats.json',         // 统计大盘
};

/* ---------------- 工具 ---------------- */
const U = {
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
    if (s < 0) return '刚刚';
    if (s < 60) return s + '秒前';
    if (s < 3600) return Math.floor(s / 60) + '分前';
    if (s < 86400) return Math.floor(s / 3600) + '小时前';
    return Math.floor(s / 86400) + '天前';
  },
  dt(t) {
    if (!t) return '—';
    const d = new Date(t);
    const p = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  /* 生成随机码 */
  code(n) {
    const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let r = '';
    for (let i = 0; i < (n || 12); i++) r += s[Math.floor(Math.random() * s.length)];
    return r;
  },
  uid() { return 'u' + Math.random().toString(36).slice(2, 10); },
  pw(p) { try { return E.power(p) || 0; } catch (e) { return 0; } },
  itemName(id) {
    try { return E.itemName(id) || id; } catch (e) { return id; }
  },
  itemList() {
    /* 全部可发放物品：物品表 + 货币 */
    const out = [{ id: 'gold', n: '金币', icon: '🪙' }, { id: 'diamond', n: '钻石', icon: '💎' },
      { id: 'ach', n: '成就点', icon: '🏅' }, { id: 'stamina', n: '体力', icon: '⚡' },
      { id: 'evToken', n: '活动代币', icon: '🎟️' }];
    (EX.items || []).forEach((it) => out.push({ id: it.id, n: it.n, icon: it.icon || '📦' }));
    return out;
  },
  /* 物品选择器 HTML */
  picker(name, def) {
    return `<select data-pk="${name}">${U.itemList().map((i) =>
      `<option value="${i.id}"${i.id === def ? ' selected' : ''}>${i.icon} ${U.esc(i.n)}</option>`).join('')}</select>`;
  },
};
const D = (s) => document.querySelector(s);
const DA = (s) => Array.from(document.querySelectorAll(s));

/* ---------------- 数据层 ---------------- */
const DB = {
  cache: {},
  async get(path, def) {
    if (this.cache[path]) return this.cache[path];
    try {
      const r = await Net.read(path);
      if (r && r.data) { this.cache[path] = r.data; return r.data; }
    } catch (e) {}
    const d = typeof def === 'function' ? def() : (def || {});
    this.cache[path] = d;
    return d;
  },
  async set(path, obj, msg) {
    this.cache[path] = obj;
    try {
      await Net.write(path, obj, msg || '后台更新');
      return true;
    } catch (e) { APP.toast('保存失败：' + e.message, 'err'); return false; }
  },
  /* 强制重读 */
  async reload(path) { delete this.cache[path]; return this.get(path); },
  clear() { this.cache = {}; },
};

/* ---------------- 审计（本地留痕 + 可导出/上传） ---------------- */
const AUDIT = {
  KEY: 'zb_audit_log',
  list() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; }
  },
  log(act, target, detail) {
    const l = this.list();
    l.unshift({ at: Date.now(), act: act, target: target || '', detail: detail || '', who: 'admin' });
    if (l.length > 1000) l.length = 1000;
    try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) {}
    /* 同步写入 GM 日志（云端缓冲） */
    this.pushCloud({ at: Date.now(), act: act, target: target, detail: detail });
  },
  pushCloud(item) {
    /* 云端 GM 日志：合并写入，避免高频 */
    try {
      const buf = JSON.parse(localStorage.getItem('zb_gm_buf') || '[]');
      buf.unshift(item);
      if (buf.length > 300) buf.length = 300;
      localStorage.setItem('zb_gm_buf', JSON.stringify(buf));
    } catch (e) {}
  },
  async syncCloud() {
    const buf = JSON.parse(localStorage.getItem('zb_gm_buf') || '[]');
    if (!buf.length) { APP.toast('没有待上传的日志', 'err'); return; }
    const cur = await DB.get(DBP.gmlog, { list: [] });
    cur.list = buf.concat(cur.list || []).slice(0, 2000);
    cur.updated = Date.now();
    if (await DB.set(DBP.gmlog, cur, '上传 GM 日志')) {
      localStorage.setItem('zb_gm_buf', '[]');
      APP.toast('已上传 ' + buf.length + ' 条日志', 'ok');
    }
  },
  export() {
    const l = this.list();
    const txt = l.map((x) => `${U.dt(x.at)}\t${x.act}\t${x.target}\t${x.detail}`).join('\n');
    const b = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = '审计日志_' + new Date().toISOString().slice(0, 10) + '.txt';
    a.click();
    APP.toast('已导出 ' + l.length + ' 条', 'ok');
  },
  clear() {
    if (!confirm('清空本地审计日志？（云端日志不受影响）')) return;
    localStorage.removeItem(this.KEY); APP.toast('已清空', 'ok');
  },
};

/* ---------------- 后台账号与权限 ---------------- */
const PERM = {
  ROLES: {
    admin: { n: '超级管理员', p: ['all'] },
    ops: { n: '运营', p: ['account.query', 'account.asset', 'account.ban', 'account.resetpwd', 'account.destroy', 'mail.*', 'cdkey.*', 'activity.*', 'rank.*', 'stat.*', 'log.view'] },
    plan: { n: '策划', p: ['cfg.*', 'hotfix.*', 'activity.*', 'achshop.*', 'gm.unlock', 'stat.*'] },
    gm: { n: 'GM', p: ['account.query', 'account.asset', 'account.compensate', 'account.resetpwd', 'gm.*', 'mail.single'] },
    devops: { n: '运维', p: ['server.*', 'log.*', 'backup.*', 'perm.view'] },
    audit: { n: '只读审计', p: ['log.view', 'stat.view', 'account.query'] },
  },
  curRole() {
    try { return localStorage.getItem('zb_role') || 'admin'; } catch (e) { return 'admin'; }
  },
  setRole(r) { try { localStorage.setItem('zb_role', r); } catch (e) {} },
  has(p) {
    const r = this.curRole();
    const def = this.ROLES[r] || this.ROLES.admin;
    if ((def.p || []).indexOf('all') >= 0) return true;
    return (def.p || []).some((x) => x === p || (x.endsWith('.*') && p.indexOf(x.slice(0, -1)) === 0));
  },
};

/* ---------------- 应用主体 ---------------- */
const APP = {
  pages: {},          // 各模块挂载
  cur: '',
  PLIST: [],
  SEL: null,
  FILTER: '',

  toast(m, c) {
    const b = D('#toasts'); if (!b) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (c || ''); d.textContent = m; b.appendChild(d);
    setTimeout(() => d.remove(), 2500);
    while (b.children.length > 4 && b.firstElementChild) b.firstElementChild.remove();
  },
  modal(html) {
    const m = D('#modal'), b = D('#mbox');
    if (!m || !b) return;
    b.innerHTML = html; m.classList.add('on');
  },
  closeModal() { const m = D('#modal'); if (m) m.classList.remove('on'); },

  /* ---- 启动 ---- */
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
    this.net(); this.buildNav();
    await this.loadPlayers();
    const first = Object.keys(this.pages)[0];
    this.go(first);
    AUDIT.log('登录后台', '', '角色 ' + PERM.curRole());
  },
  net() {
    const n = D('#hdNet'); if (!n) return;
    n.textContent = Net.online ? '● 在线' : '○ 离线';
    n.classList.toggle('off', !Net.online);
  },
  buildNav() {
    const nav = D('#nav'); if (!nav) return;
    const groups = {};
    Object.keys(this.pages).forEach((k) => {
      const p = this.pages[k];
      (groups[p.g] = groups[p.g] || []).push({ k: k, n: p.n, i: p.i });
    });
    let h = `<div class="nav-t">角 色</div>
      <div style="padding:4px 8px 10px">
      <select id="roleSel" style="width:100%;font-size:12px">
      ${Object.keys(PERM.ROLES).map((r) => `<option value="${r}"${PERM.curRole() === r ? ' selected' : ''}>${PERM.ROLES[r].n}</option>`).join('')}
      </select></div>`;
    Object.keys(groups).forEach((g) => {
      h += `<div class="nav-t">${U.esc(g)}</div>`;
      groups[g].forEach((it) => {
        h += `<button class="nv" data-pg="${it.k}"><i>${it.i}</i><span>${U.esc(it.n)}</span></button>`;
      });
    });
    nav.innerHTML = h;
    DA('#nav .nv').forEach((b) => { b.onclick = () => this.go(b.dataset.pg); });
    const rs = D('#roleSel');
    if (rs) rs.onchange = () => { PERM.setRole(rs.value); this.toast('已切换角色：' + PERM.ROLES[rs.value].n, 'ok'); };
    const mn = D('#hdMenu');
    if (mn) mn.onclick = () => {
      const n = D('#nav'), m = D('#mask');
      if (n) n.classList.toggle('on'); if (m) m.classList.toggle('on');
    };
  },
  go(id) {
    if (!this.pages[id]) return;
    this.cur = id;
    DA('#nav .nv').forEach((x) => x.classList.toggle('on', x.dataset.pg === id));
    this.closeNav();
    this.render();
  },
  render() {
    const b = D('#body'); if (!b) return;
    const p = this.pages[this.cur];
    if (!p) { b.innerHTML = '<div class="lbl">页面不存在</div>'; return; }
    if (!PERM.has(p.perm || 'all')) {
      b.innerHTML = `<div class="ph"><h2>${U.esc(p.n)}</h2></div>
        <div class="card"><div class="lbl">🔒 当前角色（${PERM.ROLES[PERM.curRole()].n}）无此权限</div></div>`;
      return;
    }
    b.innerHTML = p.render.call(this);
    if (p.bind) { try { p.bind.call(this); } catch (e) { console.error(e); } }
    const m = D('.main'); if (m) m.scrollTop = 0;
  },
  /* 重绘当前页 */
  again() { this.render(); },

  /* ---- 玩家数据 ---- */
  async loadPlayers() {
    let names = [];
    try { names = await Net.list(PDIR); } catch (e) {}
    if (!names || !names.length) {
      try {
        const r = await Net.read(DBP.rank);
        if (r && r.data && r.data.list) names = r.data.list.map((x) => x.uid + '.json');
      } catch (e) {}
    }
    this.PLIST = [];
    for (const f of (names || []).filter((x) => x.endsWith('.json')).slice(0, 150)) {
      try {
        const r = await Net.read(PDIR + f);
        if (r && r.data && r.data.uid) this.PLIST.push(r.data);
      } catch (e) {}
    }
    this.PLIST.sort((a, b) => U.pw(b) - U.pw(a));
  },
  async save(p, msg) {
    try {
      await Net.write(PDIR + p.uid + '.json', p, msg || '后台修改 ' + p.name);
      return true;
    } catch (e) { this.toast('保存失败：' + e.message, 'err'); return false; }
  },
  view() {
    const f = (this.FILTER || '').trim().toLowerCase();
    if (!f) return this.PLIST;
    return this.PLIST.filter((p) =>
      (p.name || '').toLowerCase().indexOf(f) >= 0 || (p.uid || '').toLowerCase().indexOf(f) >= 0);
  },
  /* 玩家卡片（可点选） */
  pcard(p, attr) {
    const c = (EX.chars || []).find((x) => x.id === p.char);
    return `<div class="pcard ${this.SEL && this.SEL.uid === p.uid ? 'on' : ''}"
      data-sel="${U.esc(p.uid)}" ${attr || ''}>
      <div class="r1"><div class="zav">${U.esc((p.avatar || '🧑').slice(0, 2))}</div>
        <b>${U.esc(p.name)}</b>${p.ban ? '<span class="ban">封禁</span>' : ''}</div>
      <div class="r2">
        <span class="chipx y">Lv.${p.lv || 1}</span>
        <span class="chipx g">${U.fmt(U.pw(p))}</span>
        <span class="chipx">🪙${U.fmt(p.gold)}</span>
        <span class="chipx">💎${U.fmt(p.diamond)}</span>
      </div>
      <div class="r3">${U.esc(p.uid)} · ${U.ago(p.lastSeen)}</div>
    </div>`;
  },
  bindSel(box) {
    DA((box || '#body') + ' [data-sel]').forEach((b) => {
      b.onclick = () => {
        const u = b.dataset.sel;
        this.SEL = this.PLIST.find((p) => p.uid === u) || null;
        this.render();
      };
    });
  },
  /* 玩家搜索条 */
  searchBar(id, ph) {
    return `<div class="sb"><input id="${id}" placeholder="${ph || '搜索 UID / 昵称'}" value="${U.esc(this.FILTER)}"></div>`;
  },
  bindSearch(id) {
    const s = D('#' + id);
    if (s) s.oninput = () => { this.FILTER = s.value; const v = s.value; this.render();
      const n = D('#' + id); if (n) { n.value = v; n.focus(); } };
  },
  /* 数字输入读取 */
  num(id) { const e = D(id); return e ? (parseFloat(e.value) || 0) : 0; },
  val(id) { const e = D(id); return e ? (e.value || '') : ''; },

  /* 给玩家加物品（通用） */
  grant(p, id, n) {
    n = Math.max(0, Math.floor(n || 0));
    if (id === 'gold') p.gold = (p.gold || 0) + n;
    else if (id === 'diamond') p.diamond = (p.diamond || 0) + n;
    else if (id === 'ach') p.ach = (p.ach || 0) + n;
    else if (id === 'stamina') p.stamina = (p.stamina || 0) + n;
    else if (id === 'evToken') p.evToken = (p.evToken || 0) + n;
    else {
      const it = (EX.items || []).find((x) => x.id === id);
      if (it && it.type === '消耗') { p.use = p.use || {}; p.use[id] = (p.use[id] || 0) + n; }
      else { p.mat = p.mat || {}; p.mat[id] = (p.mat[id] || 0) + n; }
    }
  },
};

window.addEventListener('DOMContentLoaded', () => { APP.init(); });
