/* =========================================================
 * user.js —— 账号密码注册 / 登录
 * ---------------------------------------------------------
 * 账号 ID 由「账号名」稳定派生 → 换设备登录同一账号 = 同一存档
 * 密码不存明文：SHA-256(密码 + 账号名混淆) 后存云端
 * 云端不可达时：用本机缓存的凭据离线登录（保证断网也能玩）
 * ========================================================= */
const UA = {
  K_NAME: 'zb_uname',      // 记住的账号名
  K_NICK: 'zb_name',       // 昵称
  K_GENDER: 'zb_gender',
  K_UID: 'zb_uid',
  K_AUTO: 'zb_auto',
  K_CACHE: 'zb_ucache',    // 本机凭据缓存（离线登录用）

  /* ---------- 账号 ID：由账号名稳定派生 ---------- */
  acctId(name) {
    const s = String(name || '').trim().toLowerCase();
    if (!s) return '';
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c; h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
      h2 = (h2 * 31 + c) >>> 0;
    }
    return 'a' + h1.toString(36) + h2.toString(36);
  },

  /* ---------- 密码哈希 ---------- */
  async hash(pwd, name) {
    const raw = 'ZP|' + String(name).trim().toLowerCase() + '|' + String(pwd);
    try {
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
      }
    } catch (e) {}
    /* 降级：FNV 双哈希 */
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      h1 ^= c; h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
      h2 = ((h2 << 5) + h2 + c) >>> 0;
    }
    return 'f' + h1.toString(36) + h2.toString(36);
  },

  /* ---------- 校验规则 ---------- */
  chkName(n) {
    n = String(n || '').trim();
    if (n.length < 2) return '账号至少 2 个字符';
    if (n.length > 16) return '账号最多 16 个字符';
    if (!/^[\w\u4e00-\u9fa5·.\-]+$/.test(n)) return '账号只能含中文/字母/数字/_ . -';
    return '';
  },
  chkPwd(p) {
    p = String(p || '');
    if (p.length < 6) return '密码至少 6 位';
    if (p.length > 32) return '密码最多 32 位';
    return '';
  },
  /* 昵称校验
   * BUG修复：此前账号走 chkName、密码走 chkPwd，唯独【昵称完全没有校验】——
   *   register() 里直接把 nick 原样写进存档，前端也只校验了账号/密码/确认密码。
   * 后果：① 昵称可以填 60 个字 → 主界面代号、排行榜、军团列表排版被撑破；
   *       ② 昵称可以任意重复 → 排行榜/军团/好友里出现多个同名，无法区分。
   * 配置表 tips.err.nameErr 早就写了「昵称需 2-8 个字」，却从未被使用。 */
  chkNick(n) {
    n = String(n || '').trim();
    if (!n) return '请输入昵称';
    if (n.length < 2 || n.length > 8) return (window.EX && EX.tip && EX.tip('err.nameErr')) || '昵称需 2-8 个字';
    return '';
  },
  /* 昵称是否已被占用（读玩家索引）
   * 读不到索引时【必须放行】——索引写入本来就吞异常，
   * 不能因为云端抖动就让注册彻底失败。 */
  async nickTaken(nick, selfId) {
    try {
      const r = await Net.read(this.IDX);
      const list = (r && r.data && Array.isArray(r.data.list)) ? r.data.list : [];
      const n = String(nick || '').trim();
      if (!n) return false;
      return list.some((x) => x && String(x.nick || '').trim() === n && x.uid !== selfId);
    } catch (e) { return false; }
  },

  /* ---------- 云端用户记录 ---------- */
  path(id) { return 'data/zb/users/' + id + '.json'; },
  /* 云端操作统一加超时：断网时不能卡住登录/注册 */
  async readUser(id, ms) {
    const r = await window.TMO(Net.read(this.path(id)), ms || 7000);
    if (r && r.data && r.data.id) return r.data;
    return null;
  },
  async writeUser(u, msg, ms) {
    const ok = await window.TMO(Net.write(this.path(u.id), u, msg || '账号 ' + u.name), ms || 7000);
    return !!ok;
  },

  /* ---------- 本机凭据缓存 ---------- */
  cache() {
    try { return JSON.parse(localStorage.getItem(this.K_CACHE) || '{}'); } catch (e) { return {}; }
  },
  /* =========================================================
   * 玩家索引 data/zb/index.json
   * ---------------------------------------------------------
   * 为什么要索引：后台原先用 GitHub 目录 list 枚举玩家，
   * 而 list 依赖 Contents API 返回数组 —— 官方端点不稳、多数反代端点
   * 干脆不支持目录枚举。一旦 list 返回空，后台就退回读战力榜，
   * 于是列表里只剩榜上那一个 UID（实际有多个玩家却只显示一个）。
   * 索引文件只需一次普通 read，成功率远高于目录枚举。
   * 写入失败绝不能影响注册/登录本身，故全程吞异常。
   * ========================================================= */
  IDX: 'data/zb/index.json',
  async idxAdd(id, name, nick) {
    try {
      const r = await Net.read(this.IDX);
      const idx = (r && r.data && Array.isArray(r.data.list)) ? r.data : { list: [] };
      const row = { uid: id, name: String(name || '').trim(), nick: String(nick || name || '').trim(), at: Date.now() };
      const i = idx.list.findIndex((x) => x.uid === id);
      if (i >= 0) idx.list[i] = Object.assign({}, idx.list[i], row);
      else idx.list.push(row);
      if (idx.list.length > 2000) idx.list = idx.list.slice(-2000);
      idx.updAt = Date.now();
      await Net.write(this.IDX, idx, '索引更新 ' + row.name);
      return true;
    } catch (e) { return false; }
  },
  /* 补丁：给索引行补字段（等级/战力/活跃时间），失败静默 */
  async idxPatch(id, patch) {
    try {
      const r = await Net.read(this.IDX);
      const idx = (r && r.data && Array.isArray(r.data.list)) ? r.data : null;
      if (!idx) return false;
      const row = idx.list.find((x) => x.uid === id);
      if (!row) return false;
      Object.assign(row, patch || {});
      await Net.write(this.IDX, idx, '索引补丁 ' + id);
      return true;
    } catch (e) { return false; }
  },
  async idxDel(id) {
    try {
      const r = await Net.read(this.IDX);
      const idx = (r && r.data && Array.isArray(r.data.list)) ? r.data : { list: [] };
      idx.list = idx.list.filter((x) => x.uid !== id);
      idx.updAt = Date.now();
      await Net.write(this.IDX, idx, '索引移除 ' + id);
      return true;
    } catch (e) { return false; }
  },

  saveCache(id, name, hash) {
    const c = this.cache(); c[id] = { name, hash, at: Date.now() };
    try { localStorage.setItem(this.K_CACHE, JSON.stringify(c)); } catch (e) {}
  },
  dropCache(id) {
    const c = this.cache(); delete c[id];
    try { localStorage.setItem(this.K_CACHE, JSON.stringify(c)); } catch (e) {}
  },

  /* =========================================================
   * 注册
   * ========================================================= */
  async register(name, pwd, nick, gender) {
    let e = this.chkName(name); if (e) return { ok: false, msg: e };
    e = this.chkPwd(pwd); if (e) return { ok: false, msg: e };
    /* 昵称：长度校验 + 重名校验（此前两项都没有） */
    e = this.chkNick(nick); if (e) return { ok: false, msg: e };
    const id = this.acctId(name);
    const exist = await this.readUser(id);
    /* 已注销的账号名允许重新注册：注销时为了阻止登录会保留账号记录，
     * 若一律当作「已注册」，玩家销户后同名永远开不了新号（真 BUG） */
    if (exist && !exist.destroyed) return { ok: false, msg: '该账号已被注册' };
    if (await this.nickTaken(nick, id)) {
      return { ok: false, msg: (window.EX && EX.tip && EX.tip('err.dupName')) || '该代号已被占用' };
    }
    const h = await this.hash(pwd, name);
    const u = {
      id, name: String(name).trim(), nick: nick || String(name).trim(),
      gender: gender || 'm', hash: h, created: Date.now(), last: Date.now(),
      banned: false,
    };
    await this.writeUser(u, '注册账号 ' + u.name);
    /* 登记到玩家索引（后台据此枚举全部玩家） */
    this.idxAdd(id, u.name, u.nick);
    /* 云端写失败也要能玩：存本机缓存 */
    this.saveCache(id, u.name, h);
    localStorage.setItem(this.K_NAME, u.name);
    localStorage.setItem(this.K_NICK, u.nick);
    localStorage.setItem(this.K_GENDER, u.gender);
    localStorage.setItem(this.K_UID, id);
    localStorage.setItem(this.K_AUTO, '1');
    return { ok: true, id, nick: u.nick, gender: u.gender, cloud: true };
  },

  /* =========================================================
   * 封禁状态统一判定（智能化）
   * ---------------------------------------------------------
   * 为什么要单独抽出来：封禁信息分散在三处且字段名不一致 ——
   *   账号文件用 banned / 存档用 ban（main.js 登录兜底读它）
   * 以前只判断布尔值，导致两个问题：
   *   ① 玩家只看到「该账号已被封禁」，不知道封多久、什么时候解封，
   *      被封 7 天和被封一辈子界面上完全一样，投诉量极高；
   *   ② 时限封禁到期后 banned 仍是 true，账号文件永远不清理 →
   *      7 天封禁实际等同于永久封禁（真正的 BUG）。
   * 现在：到期视为已解封（并可回写清理），且提示里带剩余时间与解封时刻。
   * ========================================================= */
  banInfo(o) {
    o = o || {};
    const flag = !!(o.banned || o.ban);
    const reason = o.banReason || o.banType || '';
    if (!flag) return { on: false, until: 0, reason: '', left: '', text: '' };
    /* 已注销 ≠ 封禁：注销时账号被标记为 banned 以免被登录，
     * 但玩家看到「永久封禁」会以为被处罚，实际是自己销户了 */
    if (o.destroyed) {
      return { on: true, destroyed: true, until: 0, reason: '', left: '',
        text: '该账号已注销，无法登录\n如需重新游玩请重新注册' };
    }
    const until = Number(o.banUntil) || 0;
    const now = Date.now();
    /* 有时限且已到期 → 视为解封 */
    if (until && until <= now) {
      return { on: false, until, reason, expired: true, left: '', text: '' };
    }
    let left = '';
    if (until) {
      const s = Math.floor((until - now) / 1000);
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mi = Math.floor((s % 3600) / 60);
      left = d > 0 ? `剩余 ${d} 天 ${h} 小时`
        : h > 0 ? `剩余 ${h} 小时 ${mi} 分`
          : `剩余 ${Math.max(mi, 1)} 分钟`;
    }
    const fd = (t) => {
      const x = new Date(t), p2 = (n) => String(n).padStart(2, '0');
      return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())} ${p2(x.getHours())}:${p2(x.getMinutes())}`;
    };
    const why = reason ? `\n理由：${reason}` : '';
    const text = until
      ? `🚫 该账号已被封禁\n${left} · ${fd(until)} 自动解封${why}`
      : `🚫 该账号已被永久封禁${why}`;
    return { on: true, until, reason, left, text, at: fd(until) || '', perm: !until };
  },

  /* =========================================================
   * 登录
   * ========================================================= */
  async login(name, pwd) {
    let e = this.chkName(name); if (e) return { ok: false, msg: e };
    e = this.chkPwd(pwd); if (e) return { ok: false, msg: e };
    const id = this.acctId(name);
    const h = await this.hash(pwd, name);
    const u = await this.readUser(id);

    if (u) {
      /* 封禁判定走统一函数：带剩余时长提示 + 到期自动解封 */
      const bi = this.banInfo(u);
      if (bi.on) return { ok: false, msg: bi.text || '该账号已被封禁' };
      if (bi.expired) {
        /* 时限已过：清理账号文件上的封禁标记，避免下次仍被拦（原逻辑会永久封死） */
        u.banned = false; u.unbanAt = Date.now(); u.unbanOp = 'auto-expire';
        try { await this.writeUser(u, '封禁到期自动解封'); } catch (e) {}
      }
      if (u.hash && u.hash !== h) return { ok: false, msg: '密码错误' };
      /* 老账号无 hash 字段 → 首次登录补写 */
      if (!u.hash) { u.hash = h; await this.writeUser(u, '补写密码'); }
    } else {
      /* 云端读不到：可能是离线，用本机缓存校验 */
      const c = this.cache()[id];
      if (!c) return { ok: false, msg: '账号不存在或网络不可用' };
      if (c.hash !== h) return { ok: false, msg: '密码错误' };
    }
    this.saveCache(id, String(name).trim(), h);
    localStorage.setItem(this.K_NAME, String(name).trim());
    localStorage.setItem(this.K_NICK, (u && u.nick) || localStorage.getItem(this.K_NICK) || String(name).trim());
    localStorage.setItem(this.K_GENDER, (u && u.gender) || localStorage.getItem(this.K_GENDER) || 'm');
    localStorage.setItem(this.K_UID, id);
    localStorage.setItem(this.K_AUTO, '1');
    /* 老账号补登记索引（此前从未写过） */
    this.idxAdd(id, String(name).trim(), (u && u.nick) || localStorage.getItem(this.K_NICK));
    return { ok: true, id, nick: localStorage.getItem(this.K_NICK), gender: localStorage.getItem(this.K_GENDER) };
  },

  /* ---------- 修改密码 ---------- */
  async changePwd(name, oldP, newP) {
    const lg = await this.login(name, oldP);
    if (!lg.ok) return lg;
    const e = this.chkPwd(newP); if (e) return { ok: false, msg: e };
    const id = this.acctId(name);
    const h = await this.hash(newP, name);
    const u = await this.readUser(id);
    if (u) { u.hash = h; await this.writeUser(u, '修改密码'); }
    this.saveCache(id, String(name).trim(), h);
    return { ok: true, msg: '密码已修改' };
  },

  /* ---------- 记住的账号 ---------- */
  remembered() {
    return {
      name: localStorage.getItem(this.K_NAME) || '',
      nick: localStorage.getItem(this.K_NICK) || '',
      gender: localStorage.getItem(this.K_GENDER) || 'm',
      uid: localStorage.getItem(this.K_UID) || '',
    };
  },
  /* 需求：必须输入账号登录，不再免密自动进入。
   * 「记住账号」现在只回填账号名，不再触发自动登录，故恒为 false。
   * 保留此函数是因为设置页等外部代码会调用它做展示判断。 */
  shouldAuto() {
    return false;
  },
  logout() {
    localStorage.removeItem(this.K_AUTO);
    localStorage.removeItem(this.K_UID);
    localStorage.removeItem(this.K_NICK);
    try { if (window.UI && UI.toast) UI.toast('已退出登录', 'ok'); } catch (e) {}
    setTimeout(() => { if (window.location && location.reload) location.reload(); }, 400);
  },
  /* 销户：清本机 + 标记云端已注销 */
  async destroy(name, pwd) {
    const lg = await this.login(name, pwd);
    if (!lg.ok) return lg;
    const id = this.acctId(name);
    const u = await this.readUser(id);
    if (u) { u.banned = true; u.destroyed = true; u.destroyAt = Date.now(); await this.writeUser(u, '账号注销'); }
    try { await Net.del('data/zb/players/' + id + '.json'); } catch (e) {}
    /* 指令队列一并删：注销后用同名重新注册会拿到同一个 uid，
     * 残留的历史补发指令会在新档上被全部重发一遍。 */
    try { await Net.del('data/zb/ops/' + id + '.json'); } catch (e) {}
    this.idxDel(id);
    this.dropCache(id);
    ['zb_name', 'zb_gender', 'zb_uid', 'zb_auto'].forEach((k) => localStorage.removeItem(k));
    return { ok: true, msg: '账号已注销，存档已删除' };
  },

  /* ---------------------------------------------------------
   * 永久删除：账号 / 存档 / 索引 / 榜单条目 全部物理删除
   * 与 destroy（注销）的区别：
   *   注销 = 只停用并打标记，账号记录仍保留，后台「显示已注销」里还能找到；
   *   永久删除 = 连账号文件一起删，删除后所有界面都不再显示，不可恢复。
   * 榜单删除是「读-过滤-写」的尽力而为操作：失败不影响账号删除本身，
   * 后台「永久删除」也会再清一次榜单，两端互补。
   * --------------------------------------------------------- */
  async purge(name, pwd) {
    const lg = await this.login(name, pwd);
    if (!lg.ok) return lg;
    const id = this.acctId(name);
    let acct = false, save = false, lb = 0;
    try { acct = !!(await Net.del(this.path(id))); } catch (e) { acct = false; }
    try { save = !!(await Net.del('data/zb/players/' + id + '.json')); } catch (e) { save = false; }
    this.idxDel(id);
    this.dropCache(id);
    /* 三个榜共用 leaderboard.json，无尽榜另有 endless.json */
    for (const f of ['data/zb/leaderboard.json', 'data/zb/endless.json']) {
      try {
        const r = await Net.read(f);
        const d = (r && r.data && Array.isArray(r.data.list)) ? r.data : null;
        if (!d) continue;
        const before = d.list.length;
        d.list = d.list.filter((x) => (x.uid || x.u) !== id);
        if (d.list.length !== before) {
          d.updated = Date.now();
          await Net.write(f, d, '永久删除移除榜单 ' + id);
          lb += before - d.list.length;
        }
      } catch (e) {}
    }
    ['zb_name', 'zb_gender', 'zb_uid', 'zb_auto', 'zb_nick'].forEach((k) => localStorage.removeItem(k));
    return {
      ok: true, acct, save, lb,
      msg: '账号已永久删除（账号' + (acct ? '✓' : '✗') + ' 存档' + (save ? '✓' : '✗') + ' 榜单' + lb + '条）',
    };
  },
};

if (typeof window !== 'undefined') window.UA = UA;
