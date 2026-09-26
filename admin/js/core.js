/* =====================================================================
 * core.js —— 运营后台内核
 *   工具 U / 超时 TMO / 数据层 DB / 审计 AUDIT / 权限 PERM / 主体 APP
 * =================================================================== */
'use strict';

/* 管理口令（沿用原后台，不可随意改动） */
const PWD = 'fj19941224';
const AKEY = 'zb_admin_ok';
const PDIR = 'data/zb/players/';   /* 玩家存档目录 */
const UDIR = 'data/zb/users/';     /* 账号目录   */
const OPDIR = 'data/zb/ops/';      /* 指令队列   */

/* ---------------- 云端数据路径 ---------------- */
const DBP = {
  mail: 'data/zb/mail.json',
  cdkey: 'data/zb/cdkey.json',
  activity: 'data/zb/activity.json',
  actshop: 'data/zb/actshop.json',
  achshop: 'data/zb/achshop.json',
  rankrw: 'data/zb/rankrw.json',
  rank: 'data/zb/leaderboard.json',
  endless: 'data/zb/endless.json',
  cfg: 'data/zb/cfg.json',
  hotfix: 'data/zb/hotfix.json',
  server: 'data/zb/server.json',
  gmlog: 'data/zb/gmlog.json',
  stats: 'data/zb/stats.json',
  index: 'data/zb/index.json',
  ops: 'data/zb/ops.json',
  notice: 'data/zb/notice.json',
  shop: 'data/zb/shop.json',
  ad: 'data/zb/ad.json',
  social: 'data/zb/social.json',
  bi: 'data/zb/bi.json',
};

/* =====================================================================
 * 超时包装：后台不加载 main.js，window.TMO 可能不存在，这里兜底定义
 * =================================================================== */
window.TMO = window.TMO || function (p, ms, def) {
  return new Promise((res) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(def); } }, ms || 10000);
    Promise.resolve(p).then((v) => {
      if (!done) { done = true; clearTimeout(t); res(v); }
    }).catch(() => { if (!done) { done = true; clearTimeout(t); res(def); } });
  });
};

/* =====================================================================
 * 工具集
 * =================================================================== */
const U = {
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },
  fmt(n) {
    n = Number(n) || 0;
    if (!isFinite(n)) return '0';
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(2) + '兆';
    if (a >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (a >= 1e4) return (n / 1e4).toFixed(1) + '万';
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
    const d = new Date(t), p = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  d(t) { return U.dt(t).split(' ')[0]; },
  code(n) {
    const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let r = '';
    for (let i = 0; i < (n || 12); i++) r += s[Math.floor(Math.random() * s.length)];
    return r;
  },
  uid() { return 'u' + Math.random().toString(36).slice(2, 10); },
  pw(p) { try { return E.power(p) || 0; } catch (e) { return 0; } },
  itemName(id) { try { return E.itemName(id) || id; } catch (e) { return id; } },

  /* 全部可发放物品：货币 + 物品表 + 皮肤 + 宝石 + 称号 + 头像框
   * （旧版只列货币与物品表，皮肤/宝石/称号/头像框选不到，无法补发） */
  itemList() {
    const out = [
      { id: 'gold', n: '金币', icon: '🪙' }, { id: 'diamond', n: '钻石', icon: '💎' },
      { id: 'ach', n: '成就点', icon: '🏅' }, { id: 'stamina', n: '体力', icon: '⚡' },
      { id: 'evToken', n: '活动代币', icon: '🎟️' },
    ];
    (EX.items || []).forEach((it) => out.push({ id: it.id, n: it.n, icon: it.icon || '📦' }));
    (EX.skins || []).forEach((s) => s && s.id && out.push({ id: s.id, n: '皮肤·' + (s.n || s.id), icon: s.icon || '🥼' }));
    (EX.gems || []).forEach((g) => g && g.id && out.push({ id: g.id, n: '宝石·' + (g.n || g.id), icon: g.icon || '💎' }));
    (EX.titles || []).forEach((t) => t && t.id && out.push({ id: t.id, n: '称号·' + (t.n || t.id), icon: '🏅' }));
    (EX.frames || []).forEach((f) => f && f.id && out.push({ id: f.id, n: '头像框·' + (f.n || f.id), icon: '🖼️' }));
    return out;
  },
  /* 物品下拉（必须带 id，取值统一走 U.val('#id')） */
  picker(name, def, ph) {
    const id = String(name).replace(/[^\w-]/g, '');
    let h = `<select id="${id}">`;
    if (ph) h += `<option value="">${U.esc(ph)}</option>`;
    h += U.itemList().map((i) =>
      `<option value="${i.id}"${i.id === def ? ' selected' : ''}>${i.icon} ${U.esc(i.n)}</option>`).join('');
    return h + '</select>';
  },
  /* CSV 转义：昵称含逗号/引号/换行会把行结构搞坏 */
  csvCell(v) {
    let s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
    if (/[",;\t]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  },
  csv(headers, rows) {
    const L = [headers.map(U.csvCell).join(',')];
    (rows || []).forEach((r) => L.push(r.map(U.csvCell).join(',')));
    return L.join('\r\n');
  },
  /* 下载（补 BOM，Excel 打开中文不乱码） */
  download(name, content, type) {
    let body = content;
    if (!/^\uFEFF/.test(body)) body = '\uFEFF' + body;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: (type || 'text/plain') + ';charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  },
};

const D = (s) => document.querySelector(s);
const DA = (s) => Array.from(document.querySelectorAll(s));

/* =====================================================================
 * 数据层（带缓存 + 超时）
 * =================================================================== */
const DB = {
  cache: {},
  async get(path, def) {
    if (this.cache[path] !== undefined) return this.cache[path];
    try {
      const r = await TMO(Net.read(path), 12000, null);
      if (r && r.data) { this.cache[path] = r.data; return r.data; }
    } catch (e) {}
    const d = typeof def === 'function' ? def() : (def || {});
    this.cache[path] = d;
    return d;
  },
  async set(path, obj, msg) {
    this.cache[path] = obj;
    try {
      await TMO(Net.write(path, obj, msg || '后台更新'), 15000, null);
      return true;
    } catch (e) { APP.toast('保存失败：' + (e && e.message ? e.message : e), 'err'); return false; }
  },
  async reload(path) { delete this.cache[path]; return this.get(path); },
  drop(path) { delete this.cache[path]; },
  clear() { this.cache = {}; },
};

/* =====================================================================
 * 审计日志（本地留痕 + 云端 GM 日志）
 * =================================================================== */
const AUDIT = {
  KEY: 'zb_audit_log', BUF: 'zb_gm_buf',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
  log(act, target, detail) {
    const l = this.list();
    l.unshift({ at: Date.now(), act, target: target || '', detail: detail || '', who: PERM.curRole() });
    if (l.length > 1000) l.length = 1000;
    try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) {}
    /* 同步进云端缓冲，避免后台换机器后日志全丢 */
    try {
      let b = []; try { b = JSON.parse(localStorage.getItem(this.BUF) || '[]'); } catch (e) { b = []; }
      b.unshift(l[0]);
      if (b.length > 300) b.length = 300;
      localStorage.setItem(this.BUF, JSON.stringify(b));
    } catch (e) {}
  },
  async upload() {
    let b = []; try { b = JSON.parse(localStorage.getItem(this.BUF) || '[]'); } catch (e) { b = []; }
    if (!b.length) { APP.toast('没有待上传的日志', 'warn'); return; }
    const cur = await DB.get(DBP.gmlog, { list: [] });
    cur.list = b.concat(cur.list || []).slice(0, 2000);
    cur.updated = Date.now();
    if (await DB.set(DBP.gmlog, cur, '上传 GM 日志')) {
      localStorage.setItem(this.BUF, '[]');
      APP.toast('已上传 ' + b.length + ' 条', 'ok');
    }
  },
  export() {
    const l = this.list();
    const c = (v) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ');
    const txt = l.map((x) => [U.dt(x.at), c(x.act), c(x.target), c(x.detail)].join('\t')).join('\r\n');
    U.download('审计日志_' + new Date().toISOString().slice(0, 10) + '.txt', txt, 'text/plain');
    APP.toast('已导出 ' + l.length + ' 条', 'ok');
  },
  clear() {
    if (!confirm('清空本地审计日志？（云端日志不受影响）')) return;
    localStorage.removeItem(this.KEY); APP.toast('已清空', 'ok');
  },
};

/* =====================================================================
 * 角色权限
 * =================================================================== */
const PERM = {
  ROLES: {
    admin: { n: '超级管理员', p: ['all'] },
    ops: {
      n: '运营', p: ['account.*', 'save.view', 'save.log', 'ops.*', 'rank.*',
        'mail.*', 'cdkey.*', 'config.*', 'bi.view', 'shop.*', 'ad.*', 'social.*', 'notice.*'],
    },
    gm: { n: 'GM', p: ['account.query', 'account.ban', 'account.resetpwd', 'save.*', 'ops.*', 'mail.single'] },
    plan: { n: '策划', p: ['config.*', 'hotfix.*', 'rank.rw', 'shop.*', 'ad.cfg', 'bi.view'] },
    devops: { n: '运维', p: ['server.*', 'hotfix.*', 'bi.view', 'log.*'] },
    audit: { n: '只读审计', p: ['account.query', 'save.view', 'bi.view', 'log.view'] },
  },
  curRole() { try { return localStorage.getItem('zb_role') || 'admin'; } catch (e) { return 'admin'; } },
  setRole(r) { try { localStorage.setItem('zb_role', r); } catch (e) {} },
  has(p) {
    const def = this.ROLES[this.curRole()] || this.ROLES.admin;
    if ((def.p || []).indexOf('all') >= 0) return true;
    return (def.p || []).some((x) => x === p || (x.endsWith('.*') && p.indexOf(x.slice(0, -1)) === 0));
  },
};

/* =====================================================================
 * 主体
 * =================================================================== */
const APP = {
  pages: {},
  cur: '',
  PLIST: [],
  SEL: null,
  FILTER: '',
  SHOW_DEAD: false,
  SRC_NOTE: '',
  PLIST_AT: 0,
  SNAP_KEY: 'zb_plist_snap',

  toast(m, c) {
    const b = D('#toasts'); if (!b) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (c || ''); d.textContent = m; b.appendChild(d);
    setTimeout(() => d.remove(), 2600);
    while (b.children.length > 4 && b.firstElementChild) b.firstElementChild.remove();
  },
  modal(html) {
    const m = D('#modal'), b = D('#mbox');
    if (!m || !b) return;
    b.innerHTML = html; m.classList.add('on');
    /* 弹窗内统一委托 */
    b.onclick = (e) => {
      const t = e.target.closest('[data-m]');
      if (!t) return;
      if (t.dataset.m === 'close') { this.closeModal(); return; }
      const fn = this._mfn && this._mfn[t.dataset.m];
      if (fn) fn(t);
    };
  },
  /* 打开弹窗：html + 动作表 */
  openModal(html, acts) { this._mfn = acts || {}; this.modal(html); },
  closeModal() { const m = D('#modal'); if (m) m.classList.remove('on'); },

  /* ---------- 启动 ---------- */
  async init() {
    if (sessionStorage.getItem(AKEY) === '1') { this.enter(); return; }
    const btn = D('#gtBtn'), inp = D('#gtPwd');
    if (btn) btn.onclick = () => {
      if ((inp.value || '') !== PWD) { D('#gtErr').textContent = '口令错误'; return; }
      sessionStorage.setItem(AKEY, '1'); this.enter();
    };
    if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') btn && btn.click(); };
  },

  async enter() {
    D('#gate').classList.remove('on');
    D('#wrap').classList.add('on');
    try { if (window.CFG && CFG.load) await CFG.load(); } catch (e) {}
    try { await Net.init(); } catch (e) {}
    PAGES.register();
    this.buildNav();
    this.net();
    const rf = D('#hdRefresh');
    if (rf) rf.onclick = () => this.loadPlayers({ force: true });
    const mk = D('#mask'); if (mk) mk.onclick = () => this.closeNav();
    const md = D('#modal'); if (md) md.onclick = (e) => { if (e.target === md) this.closeModal(); };
    /* 先渲染界面再拉玩家：网络慢时（端点探测可能十几秒）后台不至于一片空白 */
    this.go(Object.keys(this.pages)[0]);
    this.loadPlayers({ force: true, auto: true }).then(() => {
      if (this.cur) this.render();
    }).catch(() => {});
    AUDIT.log('登录后台', '', '角色 ' + PERM.curRole());
  },

  net() {
    const n = D('#hdSt'); if (!n) return;
    const bad = (typeof Net !== 'undefined') && Net.authFail;
    const on = (typeof Net !== 'undefined') && Net.online && !bad;
    n.innerHTML = on
      ? `<span class="on">● 已连接</span><br>玩家 ${this.PLIST.length} · 队列 ${Net.queueLen || 0}`
      : `<span class="off">○ ${bad ? '凭据异常' : '离线'}</span><br>玩家 ${this.PLIST.length}`;
  },

  closeNav() {
    const n = D('#nav'), m = D('#mask');
    if (n) n.classList.remove('on'); if (m) m.classList.remove('on');
  },

  buildNav() {
    const nav = D('#nav'); if (!nav) return;
    const g = {};
    Object.keys(this.pages).forEach((k) => {
      const p = this.pages[k];
      (g[p.g] = g[p.g] || []).push({ k, n: p.n, i: p.i });
    });
    let h = `<div class="nav-t">角 色</div><div style="padding:2px 10px 8px">
      <select id="roleSel" style="width:100%;padding:5px;font-size:12px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px">
      ${Object.keys(PERM.ROLES).map((r) => `<option value="${r}"${PERM.curRole() === r ? ' selected' : ''}>${PERM.ROLES[r].n}</option>`).join('')}
      </select></div>`;
    Object.keys(g).forEach((gn) => {
      h += `<div class="nav-t">${U.esc(gn)}</div>`;
      g[gn].forEach((it) => {
        h += `<button class="nv" data-pg="${it.k}"><i>${it.i}</i><span>${U.esc(it.n)}</span></button>`;
      });
    });
    nav.innerHTML = h;
    DA('#nav .nv').forEach((b) => { b.onclick = () => this.go(b.dataset.pg); });
    const rs = D('#roleSel');
    if (rs) rs.onchange = () => {
      PERM.setRole(rs.value);
      this.toast('已切换：' + PERM.ROLES[rs.value].n, 'ok');
      this.render();
    };
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
        <div class="card"><div class="lbl">🔒 当前角色（${(PERM.ROLES[PERM.curRole()] || PERM.ROLES.admin).n}）无此页面权限</div></div>`;
      return;
    }
    /* 把当前页的动作表挂到 APP 上：
     * bind / acts 内部回调的 this 都是 APP，而 acts 定义在页面对象里，
     * 不挂上去的话 this.acts 恒为 undefined（页内互相调用会全部抛错） */
    this.acts = p.acts || {};
    /* 加载进度条：读 200 份存档要几十秒，不提示会被误认为"读不到玩家" */
    const pg = this.LOAD_PROG;
    const bar = (pg && pg.total)
      ? `<div class="card" style="padding:8px 12px"><div class="lbl">
           ⟳ 正在拉取玩家存档 ${pg.done}/${pg.total} …</div></div>` : '';
    try {
      b.innerHTML = '<div class="ph"><h2>' + U.esc(p.n) + '</h2></div>' + bar + p.render.call(this);
    } catch (e) {
      b.innerHTML = `<div class="card"><div class="lbl">页面渲染出错：${U.esc(e.message)}</div></div>`;
      console.error(e); return;
    }
    /* 统一事件委托：data-a="动作名" */
    b.onclick = (e) => {
      const t = e.target.closest('[data-a]');
      if (!t || !p.acts) return;
      const fn = p.acts[t.dataset.a];
      if (fn) { try { fn.call(this, t, e); } catch (er) { console.error(er); this.toast('操作失败：' + er.message, 'err'); } }
    };
    b.onchange = (e) => {
      const t = e.target.closest('[data-c]');
      if (!t || !p.changes) return;
      const fn = p.changes[t.dataset.c];
      if (fn) { try { fn.call(this, t, e); } catch (er) { console.error(er); } }
    };
    b.oninput = (e) => {
      const t = e.target.closest('[data-i]');
      if (!t || !p.inputs) return;
      const fn = p.inputs[t.dataset.i];
      if (fn) { try { fn.call(this, t, e); } catch (er) { console.error(er); } }
    };
    if (p.bind) { try { p.bind.call(this); } catch (e) { console.error(e); } }
    const m = D('.main'); if (m) m.scrollTop = 0;
    this.net();
  },
  again() { this.render(); },

  /* =================================================================
   * 玩家数据
   * ================================================================= */
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },

  async ensureNet() {
    if (typeof Net === 'undefined') return false;
    if (Net.online === true && Net.endpoint) return true;
    try { await TMO(Net.init(), 20000, null); } catch (e) {}
    return Net.online === true;
  },

  snapshot() {
    try {
      const o = JSON.parse(localStorage.getItem(this.SNAP_KEY) || 'null');
      if (o && Array.isArray(o.list)) return o;
    } catch (e) {}
    return null;
  },
  saveSnapshot(list) {
    try { localStorage.setItem(this.SNAP_KEY, JSON.stringify({ at: Date.now(), list })); } catch (e) {}
  },

  /* 四路合并拉取（索引 / 存档目录 / 榜单 / 账号目录）
   * 任一路通都能看见玩家，避免只认单一来源导致列表长期只有一个人 */
  async loadPlayers(opt) {
    opt = opt || {};
    await this.ensureNet();

    const snap = this.snapshot();
    if (snap && !opt.force) {
      this.PLIST = snap.list; this.PLIST_AT = snap.at;
      this.sortPlayers();
      if (!opt.silent) this.render();
    }
    const fresh = snap && (Date.now() - (snap.at || 0)) < 5 * 60e3;
    if (typeof Net !== 'undefined' && Net.online === false && fresh && !opt.force) return;

    const core = [], acc = [], srcs = [], idxBuf = [];
    const hasSave = {};   /* 确实存在存档文件的 uid */
    const addC = (u, has) => { if (u && core.indexOf(u) < 0) { core.push(u); if (has) hasSave[u] = 1; } };
    const addA = (u) => { if (u && acc.indexOf(u) < 0 && core.indexOf(u) < 0) acc.push(u); };

    try {
      const r = await TMO(Net.read(DBP.index), 10000, null);
      if (r && r.data && Array.isArray(r.data.list) && r.data.list.length) {
        r.data.list.forEach((x) => idxBuf.push(x.uid)); srcs.push('索引' + r.data.list.length);
      }
    } catch (e) {}
    /* 存档目录优先：这里列出来的 uid 一定真的有存档文件，
     * 索引里多为历史 uid（实测 342 条里仅 78 条仍有存档），
     * 若让索引排前面，前 200 个读取请求大半扑空，首屏迟迟出不来人。 */
    try {
      const ns = await TMO(Net.list(PDIR), 15000, []);
      const hit = (ns || []).filter((x) => x.endsWith('.json') && x !== '.gitkeep');
      if (hit.length) { hit.forEach((f) => addC(f.replace(/\.json$/, ''), true)); srcs.push('存档' + hit.length); }
    } catch (e) {}
    [DBP.rank, DBP.endless].forEach(async () => {});
    try {
      const r = await TMO(Net.read(DBP.rank), 10000, null);
      if (r && r.data && r.data.list && r.data.list.length) {
        r.data.list.forEach((x) => addC(x.uid, true)); srcs.push('战力榜' + r.data.list.length);
      }
    } catch (e) {}
    try {
      const r = await TMO(Net.read(DBP.endless), 10000, null);
      if (r && r.data && r.data.list && r.data.list.length) {
        r.data.list.forEach((x) => addC(x.uid, true)); srcs.push('无尽榜' + r.data.list.length);
      }
    } catch (e) {}
    idxBuf.forEach((u) => addC(u));   /* 索引兜底，排在真实存档之后 */
    try {
      const ns = await TMO(Net.list(UDIR), 15000, []);
      const hit = (ns || []).filter((x) => x.endsWith('.json'));
      if (hit.length) { hit.forEach((f) => addA(f.replace(/\.json$/, ''))); srcs.push('账号' + hit.length); }
    } catch (e) {}

    const uids = core.concat(acc);
    if (uids.length) {
      this.SRC_NOTE = srcs.join(' + ');
    } else if ((opt._retry || 0) < 2) {
      try { if (Net && Net.reset) Net.reset(); } catch (e) {}
      await this.ensureNet();
      await this.sleep(1200 + (opt._retry || 0) * 1800);
      return this.loadPlayers(Object.assign({}, opt, { _retry: (opt._retry || 0) + 1 }));
    } else if (snap) {
      this.PLIST = snap.list; this.PLIST_AT = snap.at;
      this.SRC_NOTE = '本地快照（云端不可达，已重试）';
      if (!opt.silent) this.render();
      return;
    } else {
      if (!this.PLIST) this.PLIST = [];
      this.SRC_NOTE = '无数据（云端不可达）';
      if (!opt.silent) this.render();
      return;
    }

    /* 索引元数据用于兜底展示 */
    const meta = {};
    try {
      const ri = await TMO(Net.read(DBP.index), 10000, null);
      if (ri && ri.data && Array.isArray(ri.data.list)) {
        ri.data.list.forEach((x) => { if (x && x.uid) meta[x.uid] = x; });
      }
    } catch (e) {}

    /* 只读取确实有存档文件的 uid：
     * 索引里 342 条历史 uid 仅 78 条仍有存档，若一并发请求，
     * 列表中会冒出上百张「读取失败」卡片，把真实玩家淹没。 */
    const realU = core.filter((u) => hasSave[u]);
    const files = (realU.length ? realU : core).slice(0, 200).map((u) => u + '.json');
    const out = [];
    const WIN = 24;
    for (let i = 0; i < files.length; i += WIN) {
      const batch = files.slice(i, i + WIN);
      const rs = await Promise.all(batch.map(async (f) => {
        const uid = f.replace(/\.json$/, '');
        try {
          const r = await TMO(Net.read(PDIR + f), 12000, null);
          if (r && r.data && typeof r.data === 'object') {
            if (!r.data.uid) r.data.uid = uid;   /* 老档可能缺 uid */
            return r.data;
          }
        } catch (e) {}
        return null;
      }));
      rs.forEach((x, j) => {
        if (x) { out.push(x); return; }
        const uid = batch[j].replace(/\.json$/, '');
        const m = meta[uid] || {};
        out.push({
          uid, name: m.name || m.nick || ('未知 ' + uid.slice(0, 8)), lv: m.lv || 0,
          created: m.at || 0, lastSeen: m.lastSeen || 0, _broken: true,
          gold: 0, diamond: 0, stamina: 0, ach: 0, mat: {}, cleared: {}, gunOwn: [],
        });
      });
      /* 流式上屏：真实网络下读满 200 份存档要几十秒，
       * 每批完成即刻渲染，避免列表长时间空白被当成"读不到玩家"。 */
      this.LOAD_PROG = { done: Math.min(i + WIN, files.length), total: files.length };
      this.PLIST = out.slice();
      this.PLIST_AT = Date.now();
      this.sortPlayers();
      if (!opt.silent) this.render();
    }
    this.LOAD_PROG = null;
    const accRows = [];
    acc.slice(0, 200).forEach((u) => {
      const m = meta[u] || {};
      accRows.push({
        uid: u, name: m.name || m.nick || ('账号 ' + String(u).slice(0, 10)), lv: m.lv || 0,
        created: m.at || 0, lastSeen: m.lastSeen || 0, _noSave: true,
        gold: 0, diamond: 0, stamina: 0, ach: 0, mat: {}, cleared: {}, gunOwn: [],
      });
    });
    /* 账号兜底只在【一份存档都没读到】时才展示，否则会淹没真实玩家 */
    if (!out.length) accRows.forEach((x) => out.push(x));

    this.PLIST = out;
    this.PLIST_AT = Date.now();
    this.sortPlayers();
    this.saveSnapshot(out);
    this.autoIndex(uids, meta);
    if (this.SEL && !out.find((p) => p.uid === this.SEL.uid)) this.SEL = null;
    if (!opt.silent) this.render();
  },

  /* 静默维护索引：下次进后台即可脱离不稳的目录枚举 */
  async autoIndex(uids, meta) {
    if (!uids || !uids.length) return;
    try {
      const ri = await TMO(Net.read(DBP.index), 8000, null);
      const cur = (ri && ri.data && Array.isArray(ri.data.list)) ? ri.data.list : [];
      const have = {}; cur.forEach((x) => { if (x && x.uid) have[x.uid] = x; });
      const dead = {};
      (this.PLIST || []).forEach((p) => { if (p.destroyed) dead[p.uid] = 1; });
      const keep = cur.filter((x) => !dead[x.uid]);
      const miss = uids.filter((u) => !have[u]);
      if (!miss.length && keep.length === cur.length) return;
      const list = keep.slice();
      miss.forEach((u) => {
        const m = (meta || {})[u] || {};
        const p = (this.PLIST || []).find((x) => x.uid === u);
        list.push({ uid: u, name: m.name || (p && p.name) || '', lv: (p && p.lv) || 0, at: Date.now() });
      });
      if (list.length > 2000) list.splice(0, list.length - 2000);
      await Net.write(DBP.index, { list, updAt: Date.now() }, '自动维护索引 ' + list.length + ' 人');
    } catch (e) {}
  },

  /* 已注销 / 已封禁沉底 */
  sortPlayers() {
    this.PLIST.sort((a, b) => {
      const d = (a.destroyed ? 1 : 0) - (b.destroyed ? 1 : 0);
      if (d) return d;
      const b2 = (a.ban ? 1 : 0) - (b.ban ? 1 : 0);
      if (b2) return b2;
      return U.pw(b) - U.pw(a);
    });
  },
  deadCount() { return (this.PLIST || []).filter((p) => p.destroyed).length; },

  view() {
    const f = (this.FILTER || '').trim().toLowerCase();
    let base = this.PLIST;
    if (!this.SHOW_DEAD) base = base.filter((p) => !p.destroyed);
    if (!f) return base;
    /* UID / 昵称 / 手机号 / 设备号 都能搜（玩家申诉常报手机号） */
    return base.filter((p) => {
      if ((p.name || '').toLowerCase().indexOf(f) >= 0) return true;
      if ((p.uid || '').toLowerCase().indexOf(f) >= 0) return true;
      const e = p.ext || {};
      if ((e.phone || '').toLowerCase().indexOf(f) >= 0) return true;
      if ((e.device || '').toLowerCase().indexOf(f) >= 0) return true;
      return false;
    });
  },

  /* 玩家卡 */
  pcard(p) {
    const cls = this.SEL && this.SEL.uid === p.uid ? 'pcard on' : 'pcard';
    const tag = p.destroyed ? '<span class="bd r">已注销</span>'
      : p.ban ? '<span class="bd r">封禁</span>'
        : p._noSave ? '<span class="bd n">无存档</span>'
          : p._broken ? '<span class="bd y">读取失败</span>' : '';
    return `<div class="${cls}" data-a="sel" data-uid="${U.esc(p.uid)}">
      <div class="r1"><div class="av">${U.esc((p.avatar || '🧑').slice(0, 2))}</div>
        <b>${U.esc(p.name || '未命名')}</b>${tag}</div>
      <div class="r2">
        <span class="chipx">Lv.${p.lv || 1}</span>
        <span class="chipx">⚔${U.fmt(U.pw(p))}</span>
        <span class="chipx">🪙${U.fmt(p.gold)}</span>
        <span class="chipx">💎${U.fmt(p.diamond)}</span>
      </div>
      <div class="r3">${U.esc(p.uid)} · ${U.ago(p.lastSeen)}</div>
    </div>`;
  },

  /* =================================================================
   * 指令队列（发放类操作一律走队列，绝不直接改写存档）
   *
   * 为什么：游戏端每 30 秒无条件把内存 P 整份写回同一路径，
   * 后台直接改存档会被在线玩家的自动存档静默覆盖 —— 补发的东西玩家
   * 永远拿不到，且界面还提示成功。改为追加指令，游戏端消费后去重。
   * ================================================================= */
  opPath(uid) { return OPDIR + uid + '.json'; },
  async pushOp(uid, op) {
    if (!uid) return false;
    op = op || {};
    op.id = op.id || ('op' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    op.at = op.at || Date.now();
    try {
      const f = await DB.get(this.opPath(uid), { list: [] });
      f.list = Array.isArray(f.list) ? f.list : [];
      if (f.list.some((x) => x && x.id === op.id)) return true;
      f.list.push(op);
      if (f.list.length > 200) f.list = f.list.slice(-200);
      return await DB.set(this.opPath(uid), f, '玩家指令 ' + (op.t || ''));
    } catch (e) { this.toast('指令写入失败：' + e.message, 'err'); return false; }
  },

  /* 封禁：账号文件（登录拦截）+ 存档（展示）+ 指令队列（在线即时生效） */
  acctPath(uid) { return UDIR + uid + '.json'; },
  async setBan(p, ban, o) {
    o = o || {};
    const uid = p.uid;
    if (ban) {
      p.ban = true; p.banUntil = o.until || 0;
      p.banReason = o.reason || ''; p.banType = o.type || '永久'; p.banAt = Date.now();
    } else { p.ban = false; p.banUntil = 0; p.banReason = ''; }
    const okP = await this.save(p, ban ? '封禁 ' + (o.reason || '') : '解封');
    let okA = false, msg = '';
    try {
      const u = await DB.reload(this.acctPath(uid));
      if (u && (u.id || u.name)) {
        if (ban) {
          u.banned = true; u.banUntil = o.until || 0;
          u.banReason = o.reason || ''; u.banAt = Date.now(); u.banOp = 'admin';
        } else { u.banned = false; u.unbanAt = Date.now(); u.unbanOp = 'admin'; }
        okA = await DB.set(this.acctPath(uid), u, ban ? '封禁账号' : '解封账号');
      } else { msg = '云端无账号记录，仅写入存档'; }
    } catch (e) { msg = e.message; }
    await this.pushOp(uid, ban
      ? { t: 'ban', until: o.until || 0, reason: o.reason || '' }
      : { t: 'unban' });
    return { okP, okA, msg };
  },

  /* skins 历史存档可能被写成对象，直接 .map 会抛错导致整页白屏 */
  skinArr(p) {
    if (window.E && E.skinArr) return E.skinArr(p);
    const v = p && p.skins;
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v).filter((k) => v[k]);
    return [];
  },

  async save(p, msg) {
    try {
      await TMO(Net.write(PDIR + p.uid + '.json', p, msg || '后台修改'), 15000, null);
      DB.drop(PDIR + p.uid + '.json');
      return true;
    } catch (e) { this.toast('保存失败：' + (e && e.message ? e.message : e), 'err'); return false; }
  },

  /* 表单取值 */
  num(id) { const e = D(id); return e ? (parseFloat(e.value) || 0) : 0; },
  val(id) { const e = D(id); return e ? (e.value || '') : ''; },
  str(id) { const e = D(id); return e ? String(e.value || '').trim() : ''; },
  chk(id) { const e = D(id); return !!(e && e.checked); },

  /* 通用：确认危险操作 */
  confirm(text) { return window.confirm(text); },

  /* 选中玩家摘要条 */
  selBar() {
    if (!this.SEL) return '<div class="card"><div class="lbl">先在上方点选一名玩家</div></div>';
    const p = this.SEL;
    return `<div class="card">
      <h3>当前选中<span class="tag">${U.esc(p.uid)}</span></h3>
      <div class="r2" style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="pill">👤 ${U.esc(p.name || '—')}</span>
        <span class="pill">Lv.${p.lv || 1}</span>
        <span class="pill">⚔ ${U.fmt(U.pw(p))}</span>
        <span class="pill">🪙 ${U.fmt(p.gold)}</span>
        <span class="pill">💎 ${U.fmt(p.diamond)}</span>
        ${p.ban ? '<span class="pill">🚫 已封禁</span>' : ''}
        ${p.destroyed ? '<span class="pill">已注销</span>' : ''}
      </div></div>`;
  },

  /* 通用空态 */
  empty(t) { return `<div class="empty">${U.esc(t || '暂无数据')}</div>`; },

  /* 安全写入：异步回调返回时页面可能已切换，元素不在了不能再写
   * （否则抛 "Cannot set properties of null (setting 'innerHTML')"） */
  setHtml(sel, html) {
    const e = D(sel);
    if (!e) return false;
    e.innerHTML = html;
    return true;
  },

  /* 通用表格 */
  table(headers, rows) {
    if (!rows.length) return this.empty();
    return `<div class="tw"><table><thead><tr>${
      headers.map((h) => `<th${h.num ? ' class="num"' : ''}>${U.esc(h.t || h)}</th>`).join('')
    }</tr></thead><tbody>${
      rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
    }</tbody></table></div>`;
  },
};

APP.init();
