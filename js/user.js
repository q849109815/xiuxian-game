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
    const id = this.acctId(name);
    const exist = await this.readUser(id);
    if (exist) return { ok: false, msg: '该账号已被注册' };
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
   * 登录
   * ========================================================= */
  async login(name, pwd) {
    let e = this.chkName(name); if (e) return { ok: false, msg: e };
    e = this.chkPwd(pwd); if (e) return { ok: false, msg: e };
    const id = this.acctId(name);
    const h = await this.hash(pwd, name);
    const u = await this.readUser(id);

    if (u) {
      if (u.banned) return { ok: false, msg: '该账号已被封禁' };
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
  shouldAuto() {
    return localStorage.getItem(this.K_AUTO) === '1' && !!localStorage.getItem(this.K_UID);
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
    this.idxDel(id);
    this.dropCache(id);
    ['zb_name', 'zb_gender', 'zb_uid', 'zb_auto'].forEach((k) => localStorage.removeItem(k));
    return { ok: true, msg: '账号已注销，存档已删除' };
  },
};

if (typeof window !== 'undefined') window.UA = UA;
