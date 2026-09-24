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
  /* 物品下拉选择器
   * 致命 BUG 修复：此前只生成 data-pk="xxx"，没有 id="xxx"。
   * 而全后台 10 处调用都用 U.val('#xxx') 取值 ——
   * document.querySelector('#xxx') 找不到元素返回 null，val() 返回空串。
   * 后果（全部无声失效，界面还提示成功）：
   *   · 礼包模板：三个物品全读空 →「至少配置一个物品」，永远建不了模板
   *   · 邮件附件：单发 / 全服 / 定向 三类邮件的物品全空 → 玩家收到空邮件
   *   · 道具补发：单人 + 批量 → 实际什么都没发
   *   · 成就商店 / 活动商店 / 排行榜奖励 / 合服奖励 → 配的道具全部丢失
   * 现在补上 id，与 val('#xxx') / num('#xxx') 的读取方式对齐。 */
  picker(name, def) {
    const id = String(name).replace(/[^\w-]/g, '');
    return `<select id="${id}" data-pk="${id}">${U.itemList().map((i) =>
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
  /* ---------- 玩家列表 ----------
   * 性能修复（后台卡顿主因）：
   *   原实现是「串行 for 循环」逐个 Net.read，N 个玩家 = N 次 GitHub API 请求。
   *   而每次 Net.read 内部还会轮播多个代理端点重试，实测 100 个玩家 3.1 秒
   *   （真实网络下每个请求 1~14 秒 → 100 玩家要等一分多钟，界面完全卡死）。
   * 改法：
   *   ① 并发窗口读取（一次 8 个并发，而非 1 个）
   *   ② localStorage 快照缓存：进后台先秒开显示旧数据，后台再异步刷新
   *   ③ 单次读取套 TMO 超时（8 秒），避免个别请求拖垮整批
   */
  PLIST_CACHE_KEY: 'zb_plist_snap',
  loadSnapshot() {
    try {
      const raw = localStorage.getItem(this.PLIST_CACHE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !Array.isArray(o.list)) return null;
      return o;
    } catch (e) { return null; }
  },
  saveSnapshot(list) {
    try {
      localStorage.setItem(this.PLIST_CACHE_KEY, JSON.stringify({ at: Date.now(), list: list }));
    } catch (e) {}
  },
  /* =========================================================
   * 网络就绪等待
   * ---------------------------------------------------------
   * 致命时序 BUG：后台一进页面就立刻 loadPlayers，而此时 Net 的端点探测
   * 往往还没跑完，Net.online 仍是 false。ghReq 在离线状态下会「快速放弃」
   * （只试一批端点就 break），于是四路全部返回空 → 列表停在旧快照。
   * 等用户手动点「刷新」时网络早已恢复，同一份 scanDiag 却能扫到 2 项 ——
   * 这正是用户截图里「存档目录 2 项 / 当前列表 1 人 / 收集UID 0 个」的原因。
   * 现在：拉取前先确保探测完成。
   * ========================================================= */
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },

  async ensureNet() {
    if (typeof Net === 'undefined') return false;
    if (Net.online === true && Net.endpoint) return true;
    try {
      if (Net.init) await window.TMO(Net.init(), 20000, null);
      else if (Net.probe) await window.TMO(Net.probe(), 20000, null);
    } catch (e) {}
    return Net.online === true;
  },

  async loadPlayers(opt = {}) {
    /* ⓪ 拉取前先确保网络探测完成（关键：否则离线态下 ghReq 会快速放弃） */
    await this.ensureNet();
    /* ① 先用快照秒开（除非强制刷新） */
    const snap = this.loadSnapshot();
    if (snap && !opt.force) {
      this.PLIST = snap.list;
      this.PLIST_AT = snap.at;
      this.sortPlayers();
      if (!opt.silent) this.render();
    }
    /* ② 离线短路
     * BUG 修复：此前只要 Net.online === false 且有快照就直接 return，
     * 连 force 强制刷新也被一并挡掉 —— 一旦某次判定离线，
     * 此后玩家列表永远停留在那份旧快照（用户实测：明明有多个存档，
     * 列表里始终只有最早缓存的那一个 UID，销户后重新刷新又"复活"）。
     * 现在：强制刷新时不短路；普通进入时，仅当快照较新（<5 分钟）才短路。 */
    const snapFresh = snap && (Date.now() - (snap.at || 0)) < 5 * 60e3;
    if (typeof Net !== 'undefined' && Net.online === false && snapFresh && !opt.force) {
      return;
    }
    /* ③ 多来源合并拉取
     * =========================================================
     * 严重 BUG 修复：此前只认「目录 list」一条路，list 一失败就退回战力榜，
     * 而战力榜通常只有极少数上榜玩家 —— 于是后台永远只显示那一个 UID，
     * 运营明明有多个玩家却看不到（用户实测：始终只有 uoy3fq9）。
     *
     * 现在四个来源全部收集后【合并去重】，任一路通都能看见玩家：
     *   ① 玩家索引 data/zb/index.json（最可靠，注册/登录即写入）
     *   ② 账号目录 data/zb/users/（每个注册账号都有，比存档更全）
     *   ③ 玩家存档目录 data/zb/players/
     *   ④ 战力榜 + 无尽榜（兜底）
     * ========================================================= */
    const uids = [];
    const srcs = [];
    const add = (u) => { if (u && !uids.includes(u)) uids.push(u); };

    /* ① 索引 */
    try {
      const r = await window.TMO(Net.read('data/zb/index.json'), 10000, null);
      if (r && r.data && Array.isArray(r.data.list) && r.data.list.length) {
        r.data.list.forEach((x) => add(x.uid));
        srcs.push('索引' + r.data.list.length);
      }
    } catch (e) {}
    /* ② 账号目录 */
    try {
      const ns = await window.TMO(Net.list('data/zb/users/'), 12000, []);
      const hit = (ns || []).filter((x) => x.endsWith('.json'));
      if (hit.length) { hit.forEach((f) => add(f.replace(/\.json$/, ''))); srcs.push('账号目录' + hit.length); }
    } catch (e) {}
    /* ③ 存档目录 */
    try {
      const ns = await window.TMO(Net.list(PDIR), 12000, []);
      const hit = (ns || []).filter((x) => x.endsWith('.json'));
      if (hit.length) { hit.forEach((f) => add(f.replace(/\.json$/, ''))); srcs.push('存档目录' + hit.length); }
    } catch (e) {}
    /* ④ 榜单兜底 */
    ['rank', 'endless'].forEach((k) => { this.PLIST_RANK_UIDS = this.PLIST_RANK_UIDS || []; });
    try {
      const r = await window.TMO(Net.read(DBP.rank), 10000, null);
      if (r && r.data && r.data.list && r.data.list.length) {
        r.data.list.forEach((x) => add(x.uid)); srcs.push('战力榜' + r.data.list.length);
      }
    } catch (e) {}
    try {
      const r = await window.TMO(Net.read(DBP.endless), 10000, null);
      if (r && r.data && r.data.list && r.data.list.length) {
        r.data.list.forEach((x) => add(x.uid)); srcs.push('无尽榜' + r.data.list.length);
      }
    } catch (e) {}

    if (uids.length) {
      this.SRC_NOTE = srcs.join(' + ');
    } else if (!opt._retry) {
      /* 四路全失败 → 重新探测一次网络后再试一轮（首次常因探测未完成而全败） */
      try { if (Net && Net.reset) { Net.reset(); await this.ensureNet(); } } catch (e) {}
      await this.sleep(1200);
      return this.loadPlayers(Object.assign({}, opt, { _retry: 1, silent: false }));
    } else if (snap) {
      /* 重试仍失败 —— 保留快照但标明来源，不再假装是最新 */
      this.PLIST = snap.list; this.PLIST_AT = snap.at;
      this.SRC_NOTE = '本地快照（云端四路均不可达，已重试）';
      if (!opt.silent) this.render();
      return;
    } else {
      if (!this.PLIST) this.PLIST = [];
      this.SRC_NOTE = '无数据（云端不可达，已重试）';
      if (!opt.silent) this.render();
      return;
    }
    /* 索引里的昵称/等级，用于兜底显示读不到存档的玩家 */
    const metaMap = {};
    try {
      const ri = await window.TMO(Net.read('data/zb/index.json'), 10000, null);
      if (ri && ri.data && Array.isArray(ri.data.list)) {
        ri.data.list.forEach((x) => { if (x && x.uid) metaMap[x.uid] = x; });
      }
    } catch (e) {}

    /* =========================================================
     * 致命 BUG 修复：读取失败静默丢弃
     * 原写法 if (r && r.data && r.data.uid) return r.data; → null，
     * 然后 if (x) out.push(x) 直接跳过 —— 没有 uid 字段、或读取超时的
     * 玩家就这样凭空消失，界面连个提示都没有。
     * 运营侧现象：诊断明明显示索引 2 项 / 存档目录 2 项，
     * 「当前列表」却只有 1 人（用户实测截图正是如此）。
     *
     * 现在：读到的尽量修好 uid；读不到的用索引信息构造占位条目，
     * 标记 _broken 并显示「读取失败」，绝不静默消失。
     * ========================================================= */
    const files = uids.slice(0, 200).map((u) => u + '.json');
    if (!files.length) { if (!this.PLIST) this.PLIST = []; return; }
    const out = [];
    const fail = [];
    const WIN = 8;   /* 并发窗口 */
    for (let i = 0; i < files.length; i += WIN) {
      const batch = files.slice(i, i + WIN);
      const rs = await Promise.all(batch.map(async (f) => {
        const uid = f.replace(/\.json$/, '');
        try {
          const r = await window.TMO(Net.read(PDIR + f), 12000, null);
          if (r && r.data && typeof r.data === 'object') {
            /* 存档可能缺 uid（老格式/被覆盖过），用文件名补齐 */
            if (!r.data.uid) r.data.uid = uid;
            return r.data;
          }
        } catch (e) {}
        return null;
      }));
      rs.forEach((x, j) => {
        if (x) { out.push(x); return; }
        const uid = batch[j].replace(/\.json$/, '');
        const m = metaMap[uid] || {};
        out.push({
          uid: uid, name: m.name || m.nick || ('未知玩家 ' + uid.slice(0, 8)),
          lv: m.lv || 0, created: m.at || 0, lastSeen: m.lastSeen || 0,
          _broken: true, gold: 0, diamond: 0, stamina: 0, ach: 0,
          mat: {}, cleared: {}, gun: {}, skin: [], chips: [], mail: [],
        });
        fail.push(uid);
      });
    }
    this.PLIST_FAIL = fail;
    this.PLIST_UIDS = uids.slice(0, 200);
    this.PLIST = out;
    this.PLIST_AT = Date.now();
    this.sortPlayers();
    this.saveSnapshot(out);
    /* 选中项失效则清空，避免操作到已删除的玩家 */
    if (this.SEL && !out.find((p) => p.uid === this.SEL.uid)) {
      this.SEL = null;   /* 玩家已被删除 → 清空选中，避免后续操作到空对象 */
    }
    if (!opt.silent) this.render();
  },
  /* 已注销/已封禁玩家沉到列表末尾，避免混在正常玩家中间造成"销户了还在"的错觉 */
  sortPlayers() {
    this.PLIST.sort((a, b) => {
      const da = (a.destroyed ? 1 : 0) - (b.destroyed ? 1 : 0);
      if (da) return da;
      const ba = (a.ban ? 1 : 0) - (b.ban ? 1 : 0);
      if (ba) return ba;
      return U.pw(b) - U.pw(a);
    });
  },

  /* =========================================================
   * 封禁 / 解封（统一入口）
   * 严重 BUG 修复：此前封禁只写「玩家存档」的 p.ban = true，
   * 但游戏端登录校验的是「账号文件」data/zb/users/{uid}.json 的 u.banned。
   * 两个文件互不相干 —— 后台点了封禁，玩家照样正常登录，封禁形同虚设。
   * 现在两处都写：账号文件（登录拦截）+ 玩家存档（列表展示/离线兜底）。
   * ========================================================= */
  acctPath(uid) { return 'data/zb/users/' + uid + '.json'; },
  async setBan(p, ban, opt) {
    opt = opt || {};
    const uid = p.uid;
    /* 先写玩家存档（列表状态展示） */
    if (ban) {
      p.ban = true;
      p.banUntil = opt.until || 0;
      p.banReason = opt.reason || '';
      p.banType = opt.type || '永久';
      p.banAt = Date.now();
    } else {
      p.ban = false; p.banUntil = 0; p.banReason = '';
    }
    const savedP = await this.save(p, ban ? '封禁 ' + (opt.reason || '') : '解封');
    /* 再写账号文件（这才是登录拦截真正读的地方） */
    let acctOk = false, acctMsg = '';
    try {
      const u = await DB.get(this.acctPath(uid), null);
      if (u && u.id) {
        if (ban) {
          u.banned = true; u.banUntil = opt.until || 0;
          u.banReason = opt.reason || ''; u.banAt = Date.now(); u.banOp = opt.op || 'admin';
        } else {
          u.banned = false; u.unbanAt = Date.now(); u.unbanOp = opt.op || 'admin';
        }
        acctOk = await DB.set(this.acctPath(uid), u, ban ? '封禁账号' : '解封账号');
      } else { acctMsg = '云端无账号记录（可能离线），仅写入存档'; }
    } catch (e) { acctMsg = e.message; }
    return { savedP: savedP, acctOk: acctOk, acctMsg: acctMsg };
  },
  /* p.skins 正常是 ['sk_c01a'] 数组；历史存档可能被写成 {id:1} 对象，
   * 直接 .map 会抛 "(p.skins||[]).map is not a function" 让整页白屏。 */
  skinArr(p) {
    const v = p && p.skins;
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v).filter((k) => v[k]);
    return [];
  },
  async save(p, msg) {
    try {
      await Net.write(PDIR + p.uid + '.json', p, msg || '后台修改 ' + p.name);
      return true;
    } catch (e) { this.toast('保存失败：' + e.message, 'err'); return false; }
  },
  /* 默认隐藏已注销玩家：销户后文件因网络原因常删不掉（覆盖成空档），
   * 混在正常玩家列表里会让运营以为"销户了还在"。
   * SHOW_DEAD = true 时才显示（查询页可切换）。 */
  SHOW_DEAD: false,
  deadCount() { return (this.PLIST || []).filter((p) => p.destroyed).length; },
  view() {
    const f = (this.FILTER || '').trim().toLowerCase();
    let base = this.PLIST;
    if (!this.SHOW_DEAD) base = base.filter((p) => !p.destroyed);
    if (!f) return base;
    return base.filter((p) =>
      (p.name || '').toLowerCase().indexOf(f) >= 0 || (p.uid || '').toLowerCase().indexOf(f) >= 0);
  },
  /* 玩家卡片（可点选） */
  pcard(p, attr) {
    const c = (EX.chars || []).find((x) => x.id === p.char);
    return `<div class="pcard ${this.SEL && this.SEL.uid === p.uid ? 'on' : ''}"
      data-sel="${U.esc(p.uid)}" ${attr || ''}>
      <div class="r1"><div class="zav">${U.esc((p.avatar || '🧑').slice(0, 2))}</div>
        <b>${U.esc(p.name)}</b>${p.destroyed ? '<span class="ban">已注销</span>' : p.ban ? '<span class="ban">封禁</span>' : ''}</div>
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

  /* 给玩家加物品（通用）
   * 严重BUG修复：此前消耗品写进 p.use，但游戏端背包「消耗」页与
   * 使用函数都读 p.mat —— 后台补发的急救包/护盾/药剂，玩家背包显示 ×0、
   * 点「使用」提示数量不足，等于全部作废。
   * 现在统一到 p.mat，并把历史 p.use 中的数据迁移过去（兼容旧存档）。 */
  grant(p, id, n) {
    n = Math.max(0, Math.floor(n || 0));
    if (id === 'gold') p.gold = (p.gold || 0) + n;
    else if (id === 'diamond') p.diamond = (p.diamond || 0) + n;
    else if (id === 'ach') p.ach = (p.ach || 0) + n;
    else if (id === 'stamina') p.stamina = (p.stamina || 0) + n;
    else if (id === 'evToken') p.evToken = (p.evToken || 0) + n;
    else {
      /* 旧存档迁移：p.use 里残留的消耗品并入 p.mat */
      if (p.use && Object.keys(p.use).length) {
        p.mat = p.mat || {};
        for (const k in p.use) { p.mat[k] = (p.mat[k] || 0) + (p.use[k] || 0); }
        delete p.use;
      }
      p.mat = p.mat || {};
      p.mat[id] = (p.mat[id] || 0) + n;
      /* 同步图鉴解锁（与游戏端一致） */
      try { if (E.codexAdd) E.codexAdd(p, 'item', id); } catch (e) {}
    }
  },
};

window.addEventListener('DOMContentLoaded', () => { APP.init(); });
