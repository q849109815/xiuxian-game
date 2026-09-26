/* =========================================================
 * net.js —— GitHub 作为免费云端数据库
 * 能力：多端点自动测速切换 / 死端点自动复活 / 离线队列补传 / 读缓存兜底
 * ========================================================= */

const GH = {
  owner: 'q849109815',
  repo: 'xiuxian-game',
  branch: 'main',
  /** 玩家存档专用分支（与 main 分离，避免存档提交触发 Pages 重建耗光 500 次/月额度） */
  dataBranch: 'players',
  token: 'github_pat_11ASQODRI0RODZ7pBgKRl'
       + 'o_t4vgK8n0XabhsaL7Ctx59CksV3OGVo'
       + 'b5QOEcwAk2fX2EMICCZ5WnMI5D25i',
  extra: [],
};

/* 端点池：官方 + CDN + 公共反代 + raw 直读兜底 */
const EPS = [
  'https://api.github.com',
  'https://gh-api.vercel.app',
  'https://github-api-proxy.vercel.app',
  'https://ghproxy.net/https://api.github.com',
  'https://gh-proxy.com/https://api.github.com',
  'https://gh.llkk.cc/https://api.github.com',
  'https://ghproxy.com/https://api.github.com',
  'https://hub.fastgit.org/https://api.github.com',
  'https://api.github.com.cdn.cloudflare.net',
  'https://ghapi.vvhan.com',
  'https://git.xfj0.cn/https://api.github.com',
  'https://gh-proxy.ygxz.in/https://api.github.com',
  'https://gh.idayer.com/https://api.github.com',
  'https://ghps.cc/https://api.github.com',
  'https://raw.githubusercontent.com',
  'https://raw.fastgit.org',
  'https://raw.gitmirror.com',
];

const LS = { best: 'ss_best', dead: 'ss_dead', cache: 'ss_cache_', queue: 'ss_queue', net: 'ss_net', authfail: 'ss_authfail' };

let BEST = localStorage.getItem(LS.best) || '';
// 恢复自定义加速地址（后台/设置里保存的）
try {
  const ex = JSON.parse(localStorage.getItem('ss_extra') || '[]');
  if (Array.isArray(ex) && ex.length) GH.extra = ex;
} catch (e) {}
let DEAD = {};                       // { ep: expireAt }，3 分钟后自动复活
try { DEAD = JSON.parse(localStorage.getItem(LS.dead) || '{}'); } catch (e) { DEAD = {}; }
let QUEUE = [];
try { QUEUE = JSON.parse(localStorage.getItem(LS.queue) || '[]'); } catch (e) { QUEUE = []; }
/* 写入串行锁：{ path: Promise }，同一客户端同路径的写入排队执行 */
const WRITING = {};
let ONLINE = localStorage.getItem(LS.net) !== 'offline';
/* 凭据失效标记：网络通但令牌被拒（401/403）。
 * 此时读写必然失败，若不明确提示，玩家只会读到本机旧缓存并以为"自己回档"。 */
let AUTHFAIL = localStorage.getItem(LS.authfail) === '1';
let probing = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function markDead(ep) {
  if (ep === 'https://api.github.com' || GH.extra.includes(ep)) return;   // 官方与自定义永不拉黑
  DEAD[ep] = Date.now() + 180000;
  try { localStorage.setItem(LS.dead, JSON.stringify(DEAD)); } catch (e) {}
  if (BEST === ep) { BEST = ''; localStorage.removeItem(LS.best); }
}
function isDead(ep) {
  const t = DEAD[ep];
  if (!t) return false;
  if (Date.now() > t) { delete DEAD[ep]; return false; }
  return true;
}
function allEps() {
  const list = [...(BEST ? [BEST] : []), ...GH.extra, ...EPS];
  const seen = new Set();
  return list.filter((e) => e && !seen.has(e) && seen.add(e)).filter((e) => !isDead(e));
}

async function fetchT(url, opt = {}, timeout = 14000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try { return await fetch(url, { ...opt, signal: ctrl.signal, cache: 'no-store' }); }
  finally { clearTimeout(t); }
}

/* ---------------- 测速 ---------------- */
async function probe() {
  if (probing) return probing;
  probing = (async () => {
    // 直接用「真实读写」判定：GET contents 是最权威的连通性检查
    const H = { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json' };
    const test = async (ep, ms) => {
      const t0 = performance.now();
      const r = await fetchT(`${ep}/repos/${GH.owner}/${GH.repo}/contents/data/config/core.json`,
        { headers: H }, ms).catch(() => null);
      if (!r) throw new Error('no-response');
      // 401/403 = 凭据失效：网络通，但令牌无效/被吊销。
      // 一旦发生，read() 拿不到云端档会静默回退本机旧缓存（玩家看到旧进度＝回档），
      // write() 全部失败进队列永远传不上去，而界面仍显示「● 已连接」，无从自查。
      // 现在单独标记，让上层能明确告警。
      if (r.status === 401 || r.status === 403) {
        return { ep, ms: performance.now() - t0, st: r.status, auth: true };
      }
      // 200 = 通；404 = 通但路径不在
      if (r.ok || r.status === 404) return { ep, ms: performance.now() - t0, st: r.status };
      throw new Error('status ' + r.status);
    };
    // 分两轮：第一轮 3.5s 快速筛（官方 + 已缓存最优 + 自定义），第二轮 7s 全量兜底
    const prio = [...(BEST ? [BEST] : []), 'https://api.github.com', ...GH.extra];
    const seen = new Set(); const round1 = prio.filter((e) => e && !seen.has(e) && seen.add(e));
    const round2 = allEps().filter((e) => !round1.includes(e));

    for (const [list, ms] of [[round1, 10000], [round2, 15000]]) {
      if (!list.length) continue;
      const res = await Promise.allSettled(list.map((ep) => test(ep, ms)));
      const ok = res.filter((x) => x.status === 'fulfilled').map((x) => x.value).sort((a, b) => a.ms - b.ms);
      const good = ok.filter((x) => !x.auth);
      if (good.length) {
        AUTHFAIL = false;
        try { localStorage.removeItem(LS.authfail); } catch (e) {}
        BEST = good[0].ep; ONLINE = true;
        try { localStorage.setItem(LS.best, BEST); localStorage.setItem(LS.net, 'online'); } catch (e) {}
        return BEST;
      }
      if (ok.length) {
        AUTHFAIL = true;
        try { localStorage.setItem(LS.authfail, '1'); } catch (e) {}
        BEST = ok[0].ep; ONLINE = true;
        try { localStorage.setItem(LS.best, BEST); localStorage.setItem(LS.net, 'online'); } catch (e) {}
        return BEST;
      }
    }
    ONLINE = false;
    try { localStorage.setItem(LS.net, 'offline'); } catch (e) {}
    return null;
  })().finally(() => { setTimeout(() => (probing = null), 30000); });
  return probing;
}

/** 逐端点诊断（后台用）：返回每个端点的连通状态 */
async function diagnose() {
  const H = { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json' };
  const list = [...(BEST ? [BEST] : []), 'https://api.github.com', ...GH.extra,
    ...EPS.filter((e) => e !== BEST && e !== 'https://api.github.com')];
  const seen = new Set();
  const uniq = list.filter((e) => e && !seen.has(e) && seen.add(e));
  const out = [];
  await Promise.all(uniq.map(async (ep) => {
    const t0 = performance.now();
    let st = '超时', ok = false;
    try {
      const r = await fetchT(`${ep}/repos/${GH.owner}/${GH.repo}/contents/data/config/core.json`, { headers: H }, 10000);
      st = 'HTTP ' + r.status;
      ok = r.ok || [401, 403, 404].includes(r.status);
    } catch (e) { st = '失败'; }
    out.push({ ep, ok, ms: Math.round(performance.now() - t0), st });
  }));
  return out.sort((a, b) => (b.ok - a.ok) || (a.ms - b.ms));
}

/* ---------------- 统一请求 ---------------- */
/* 并发探测：同时请求多个端点，谁先成功用谁（避免串行遍历导致离线时卡 5 秒） */
async function ghReq(path, { method = 'GET', body = null, timeout = 14000, quick = false, onlyOfficial = false } = {}, forceBr) {
  /* onlyOfficial：只走官方端点（+自定义加速）。
   * 用途：公共反代端点常丢失 ?ref=xxx 查询参数，
   * 导致读 players 分支时悄悄返回 main 的内容。只有官方端点能可靠带 ref。 */
  let eps = onlyOfficial
    ? [...GH.extra, 'https://api.github.com'].filter((e, i, a) => e && a.indexOf(e) === i)
    : allEps();
  if (!eps.length) { DEAD = {}; eps = allEps(); }
  const H = { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json' };
  const opt = { method, headers: { ...H, 'Content-Type': 'application/json' } };
  if (body) opt.body = JSON.stringify(body);
  // 并发窗口：离线快速模式只试 4 个，正常模式试 6 个
  const WIN = quick ? 4 : 6;

  /* 存档路径默认读 players 分支，其余读 main。
   * forceBr：调用方显式指定分支（用于双分支兜底）。 */
  const rdBr = forceBr || (/^data\/zb\//.test(path) ? (GH.dataBranch || GH.branch) : GH.branch);
  const tryOne = async (ep) => {
    const url = `${ep}/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${rdBr}`;
    try {
      const r = await fetchT(url, opt, timeout);
      if (r.ok || r.status === 201) {
        return { ok: true, ep, json: await r.json() };
      }
      /* 404 处理：仅当端点是【官方/自定义可信】端点时才认定"文件确实不存在"。
       * 反代端点常因不支持 ?ref= 或路径改写而误报 404，
       * 若在此短路 return，就会让整个请求失败、不再尝试其他端点
       * —— 这正是后台读不到存档的元凶之一。 */
      const trusted = (ep === 'https://api.github.com' || GH.extra.indexOf(ep) >= 0);
      if (r.status === 404 && trusted) return { ok: true, ep, json: null, is404: true };
      if (r.status === 404) { markDead(ep); return { ok: false, ep }; }
      markDead(ep);
      return { ok: false, ep };
    } catch (e) { markDead(ep); return { ok: false, ep }; }
  };

  // 分批并发：先并发一批，都失败再下一批（最多 3 批）
  for (let batch = 0; batch < 3; batch++) {
    const slice = eps.slice(batch * WIN, batch * WIN + WIN);
    if (!slice.length) break;
    const res = await Promise.all(slice.map(tryOne));
    const hit = res.find((x) => x.ok);
    if (hit) {
      if (hit.ep !== BEST) { BEST = hit.ep; localStorage.setItem(LS.best, hit.ep); }
      ONLINE = true; localStorage.setItem(LS.net, 'online');
      return hit.json;
    }
    // 该批全部失败，若已判定离线则快速放弃
    if (!ONLINE && batch >= (quick ? 0 : 1)) break;
  }
  return null;
}

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
function unb64(s) {
  try { return decodeURIComponent(escape(atob(s.replace(/\n/g, '')))); } catch (e) { return null; }
}

/* ---------------- 对外 API ---------------- */
const Net = {
  get online() { return ONLINE; },
  get authFail() { return AUTHFAIL; },
  get endpoint() { return BEST || EPS[0]; },
  get queueLen() { return QUEUE.length; },

  diagnose,
  async init() {
    await probe();
    this.startDaemon();
    return ONLINE;
  },

  /** 后台守护：断网时积极重探，在线时定期复测 */
  startDaemon() {
    setInterval(() => {
      if (document.hidden) return;
      if (!ONLINE || !BEST) { DEAD = {}; probe(); }
    }, 90000);
    setInterval(() => { if (!document.hidden && ONLINE) probe(); }, 300000);
    // 写队列补传
    setInterval(() => { if (ONLINE && QUEUE.length) this.flush(); }, 20000);
  },

  /** 读 JSON：优先云端，失败用缓存，再失败读本地静态 */
  /** quick=true：先立即返回本地缓存/静态，网络请求后台进行（保证秒开） */
  async read(path, quick) {
    if (quick) {
      const c = localStorage.getItem(LS.cache + path);
      if (c) {
        try { return { data: JSON.parse(c), sha: null, from: 'cache' }; } catch (e) {}
      }
      try {
        const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) return { data: await r.json(), sha: null, from: 'static' };
      } catch (e) {}
    }
    /* ===============================================================
     * 严重回档 BUG 修复（玩家进度自己往回跳的元凶）
     *
     * 原实现：先用【全端点池】读（含十几个公共反代），读不到才用可信端点兜底。
     * 而公共反代普遍丢失 ?ref=players 查询参数，静默返回【main 分支】内容。
     * 实测铁证：
     *   不带 ref          → sha b25e7c15（main 分支的旧档）
     *   ?ref=players      → sha 15c1033a（正确分支）
     *   main 分支上确实残留历史玩家存档 data/zb/players/uoy3fq9.json，
     *   而 players 分支上同一账号已 destroyed=true「玩家主动申请」注销。
     * 只要内容非空就原样采纳、不校验分支 → 玩家读到旧档 = 回档；
     * 30 秒后自动存档又把这份旧档写回 players → 永久回档。
     *
     * 现在：存档路径一律【先可信端点 + 显式 players 分支】，
     * main 分支只作历史存档兜底（老号早期写在 main），
     * 全端点池降级为最后手段。
     * =============================================================== */
    let d = null;
    const isSave = /^data\/zb\//.test(path);
    if (isSave) {
      try {
        d = await ghReq(path, { method: 'GET', quick, onlyOfficial: true }, GH.dataBranch || GH.branch);
      } catch (e) {}
      /* players 分支没有 → 老号可能写在 main（历史遗留） */
      if ((!d || !d.content) && GH.branch !== (GH.dataBranch || GH.branch)) {
        try {
          const dm = await ghReq(path, { method: 'GET', quick, onlyOfficial: true }, GH.branch);
          if (dm && dm.content) d = dm;
        } catch (e) {}
      }
    }
    if (!d || !d.content) d = await ghReq(path, { method: 'GET', quick });
    if (d && d.content) {
      const txt = unb64(d.content);
      if (txt) {
        try {
          localStorage.setItem(LS.cache + path, txt);
          return { data: JSON.parse(txt), sha: d.sha, from: 'net' };
        } catch (e) {}
      }
    }
    const c = localStorage.getItem(LS.cache + path);
    if (c) { try { return { data: JSON.parse(c), sha: null, from: 'cache' }; } catch (e) {} }
    // 静态兜底（同域相对路径）
    try {
      const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return { data: await r.json(), sha: null, from: 'static' };
    } catch (e) {}
    return null;
  },

  /** 写 JSON：失败进队列，联网自动补传 */
  async write(path, obj, msg) {
    const content = b64(JSON.stringify(obj));

    /* ---------- 存档路径：走专用写入通道 ---------- */
    if (/^data\/zb\//.test(path)) return this.writeSave(path, obj, msg, content);

    let sha = null;
    try {
      const cur = await ghReq(path, { method: 'GET' });
      if (cur && cur.sha) sha = cur.sha;
    } catch (e) {}
    const br = GH.branch;
    const body = { message: msg || 'update ' + path, content, branch: br };
    if (sha) body.sha = sha;
    const r = await ghReq(path, { method: 'PUT', body });
    if (r && r.content) { this._cache(path, obj); return true; }
    if (typeof window !== 'undefined' && window.__zbResetting) return false;
    QUEUE = QUEUE.filter((x) => x.path !== path);
    QUEUE.push({ path, obj, msg, at: Date.now() });
    try { localStorage.setItem(LS.queue, JSON.stringify(QUEUE)); } catch (e) {}
    return false;
  },

  /* 仅写缓存，配额溢出时清掉最旧缓存重试一次，绝不抛穿调用方 */
  _cache(path, obj) {
    try {
      localStorage.setItem(LS.cache + path, JSON.stringify(obj));
    } catch (e) {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(LS.cache) === 0 && k !== LS.cache + path) keys.push(k);
        }
        keys.sort();
        for (const k of keys.slice(0, Math.ceil(keys.length / 3))) localStorage.removeItem(k);
        localStorage.setItem(LS.cache + path, JSON.stringify(obj));
      } catch (e2) {}
    }
  },

  /* ===============================================================
   * 存档专用写入：可信端点 + 显式 players 分支 + 409 重取 sha 重试
   *              + 旧档覆盖新档守卫
   *
   * 原实现两大致命缺陷：
   * ① 拿 sha 用 ghReq(全端点池) —— 反代丢 ref 时拿到的是【main 分支的 sha】，
   *    再 PUT 到 players 分支 → GitHub 返回 409 Conflict（实测确认）。
   *    write() 因此返回 false，玩家的进度根本没写进去，
   *    下次登录读到的仍是云端旧档 —— 表现就是"自己回档"。
   *    更糟：409 会被 markDead 拉黑端点，越用越糟。
   * ② 拿到的若是 main 的旧内容，会原样覆盖 players 的新档。
   * =============================================================== */
  /* 同一客户端对同一路径的写入串行排队（进程内锁）。
   * BUG（实测）：30 秒定时器与玩家手动「立即保存」会并发进入 writeSave，
   *   二者读到相同 cloudRev、算出相同 nextRev，后写者必然 409；
   *   新增的并发守卫会把它判为 stale，main.js 随即提示
   *   「检测到【其他设备】有更新的进度」—— 其实是自己撞自己，属误报。
   * 排队后，后一次写入读到的是前一次写完的最新云端，版本号正常推进。 */
  async writeSave(path, obj, msg, content) {
    /* 排队必须等【链尾】，而不是"进来那一刻看到的那个"。
     * 否则多个调用同时 await 同一个 promise，被唤醒后彼此并发 ——
     * 实测 3 次并发仍出现 1 次 409 + 1 次 stale（锁形同虚设）。
     * 每个调用登记自己的 self；只有自己是链尾时才负责清理。 */
    const slot = WRITING[path];
    const prev = slot ? slot.p : Promise.resolve();
    let release = null;
    const cur = new Promise((r) => { release = r; });
    const self = { p: prev.then(() => cur, () => cur) };
    WRITING[path] = self;
    try { await prev; } catch (e) {}
    try {
      return await this._writeSave(path, obj, msg, content);
    } finally {
      try { release && release(); } catch (e) {}
      if (WRITING[path] === self) delete WRITING[path];
    }
  },

  async _writeSave(path, obj, msg, content) {
    const H = { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json' };
    const eps = [...GH.extra, 'https://api.github.com'].filter((e, i, a) => e && a.indexOf(e) === i);
    const br = GH.dataBranch || GH.branch;

    /* 先读一次云端：既拿 sha，也用于旧档守卫 */
    let sha = null, cloud = null, cloudOk = false;
    for (const ep of eps) {
      try {
        const r = await fetchT(`${ep}/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${br}`, { headers: H }, 12000);
        if (r.ok) {
          const j = await r.json();
          cloudOk = true; sha = j.sha || null;
          const txt = unb64(j.content || '');
          if (txt) { try { cloud = JSON.parse(txt); } catch (e) {} }
          break;
        }
        if (r.status === 404) { cloudOk = true; sha = null; break; }   /* 新文件，无需 sha */
      } catch (e) {}
    }

    /* 旧档守卫：要写入的数据明显比云端旧 → 拒绝，避免污染云端新档。
     * 覆盖所有"读到旧档再写回"的路径，无论根因是什么。
     * 后台主动回档(restore)会刷新 offlineAt，不受此限。 */
    /* 用【读档基准】_baseAt 而非 offlineAt：
     * offlineAt 每次保存都会被刷成当前时间，拿它比较永远"更新"，
     * 守卫会形同虚设。_baseAt 记录"这份数据是从云端哪一版来的"。 */
    const mine = Number(obj && obj._baseAt) || Number(obj && obj.offlineAt) || 0;
    const theirs = Number(cloud && cloud.offlineAt) || 0;

    /* ---------- 版本号守卫（首选，不受设备时钟偏差影响）----------
     * _rev 由云端单调递增：每次成功写入都写成 cloud._rev + 1。
     * 任何设备拿着更低版本号来写，必然是旧版派生，直接拒绝。
     * 实测 BUG：旧实现只有时间守卫且容差 60 秒 —— 云端在 60 秒内被别的
     *   设备推进时，旧档会【静默覆盖】新档（离线队列补传场景已复现）。 */
    const myRev = Number(obj && obj._rev) || 0;
    const cloudRev = Number(cloud && cloud._rev) || 0;
    if (myRev && cloudRev && myRev < cloudRev) {
      try { console.log('[存档] 拒绝写入：本地 v' + myRev + ' 落后云端 v' + cloudRev + '，保护云端新档'); } catch (e) {}
      return 'stale';
    }
    /* 时间守卫（老档无 _rev 时兜底）：容差 60s → 5s。
     * 原 60s 容差 = 60 秒的回档窗口，任何跨设备推进都落在这个窗口里。 */
    if (mine && theirs && theirs > mine + 5000) {
      try { console.log('[存档] 拒绝写入：本地数据比云端旧 ' + Math.round((theirs - mine) / 1000) + ' 秒，保护云端新档'); } catch (e) {}
      return 'stale';
    }

    /* 写入内容里带上推进后的版本号，但【只有 PUT 成功才写回 obj】——
     * 否则写入失败时本地版本号已被抬高，重试时版本号守卫会失效。 */
    let payload = content;
    let nextRev = (cloudRev || 0) + 1;
    try { payload = b64(JSON.stringify({ ...obj, _rev: nextRev })); } catch (e) {}

    /* 409 = sha 过时（不是端点故障）→ 重取 sha 重试，绝不拉黑端点 */
    for (let attempt = 0; attempt < 3; attempt++) {
      const body = { message: msg || 'update ' + path, content: payload, branch: br };
      if (sha) body.sha = sha;
      for (const ep of eps) {
        let st = 0;
        try {
          const r = await fetchT(`${ep}/repos/${GH.owner}/${GH.repo}/contents/${path}`, {
            method: 'PUT',
            headers: { ...H, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }, 14000);
          st = r.status;
          if (r.ok || r.status === 201) {
            BEST = ep; try { localStorage.setItem(LS.best, ep); } catch (e) {}
            ONLINE = true; try { localStorage.setItem(LS.net, 'online'); } catch (e) {}
            try { obj._rev = nextRev; } catch (e) {}
            this._cache(path, obj);
            return true;
          }
          if (r.status === 409) break;              /* 换 sha 重试，不拉黑 */
          markDead(ep);
        } catch (e) { st = 0; markDead(ep); }
      }
      /* 重取 sha 后再试一次。
       * ============================================================
       * 竞态 BUG（实测复现，是"回档"的残留元凶之一）：
       *   两个标签页/两台设备并发写入时，二者读到相同的 cloudRev、
       *   算出相同的 nextRev、带着相同的 sha 去 PUT。先写者成功，
       *   后写者必然 409。旧实现重取 sha 后【直接再次 PUT】——
       *   用的仍是旧的 obj 与旧的 nextRev，于是：
       *     ① 后写者静默覆盖先写者的内容（丢失更新，那一局进度被吞）；
       *     ② 两次成功写入的 _rev 相同（版本号不再单调递增），
       *        先写者本地 _rev 被抬到与云端一致，其后续保存能通过
       *        版本号守卫继续覆盖 —— 形成完整的回档链。
       * 修法：重取 sha 时一并重取云端内容，重新跑一遍守卫；
       *   云端已被他人推进 → 本地这份属旧派生，返回 stale 放弃写入，
       *   由调用方重新拉取（main.js 已实现丢弃快照 + 提示）。
       *   守卫通过则基于最新 cloudRev 重算版本号再写，保证严格单调。
       * ============================================================ */
      let nsha = null, ncloud = null;
      for (const ep of eps) {
        try {
          const r = await fetchT(`${ep}/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${br}`, { headers: H }, 10000);
          if (r.ok) {
            const j = await r.json();
            nsha = j.sha || null;
            const txt = unb64(j.content || '');
            if (txt) { try { ncloud = JSON.parse(txt); } catch (e) {} }
            break;
          }
          if (r.status === 404) { nsha = null; break; }
        } catch (e) {}
      }
      if (nsha === sha) break;      /* sha 没变 → 不是 sha 问题，别空转 */

      /* 重跑守卫：云端已被别人推进（版本号或时间）→ 放弃本次写入 */
      const cRev2 = Number(ncloud && ncloud._rev) || 0;
      if (myRev && cRev2 && myRev < cRev2) {
        try { console.log('[存档] 并发冲突：本地 v' + myRev + ' 落后云端 v' + cRev2 + '，放弃写入以保护新档'); } catch (e) {}
        return 'stale';
      }
      const theirs2 = Number(ncloud && ncloud.offlineAt) || 0;
      if (mine && theirs2 && theirs2 > mine + 5000) {
        try { console.log('[存档] 并发冲突：本地数据比云端旧，放弃写入以保护新档'); } catch (e) {}
        return 'stale';
      }

      sha = nsha;
      nextRev = (cRev2 || 0) + 1;
      try { payload = b64(JSON.stringify({ ...obj, _rev: nextRev })); } catch (e) {}
    }

    /* 重置存档期间禁止入队（理由同前） */
    if (typeof window !== 'undefined' && window.__zbResetting) return false;
    QUEUE = QUEUE.filter((x) => x.path !== path);
    QUEUE.push({ path, obj, msg, at: Date.now() });
    try { localStorage.setItem(LS.queue, JSON.stringify(QUEUE)); } catch (e) {}
    return false;
  },

  async flush() {
    if (!QUEUE.length || !ONLINE) return 0;
    let n = 0, drop = 0;
    const q = [...QUEUE];
    QUEUE = [];
    for (const it of q) {
      /* 旧档覆盖新档防护
       * BUG：队列条目来自上次写失败的那一刻，跨会话常驻 localStorage。
       *   玩家手机断网打了一局 → 存档进队列；回家用 PC 联网继续玩、
       *   写了新存档；下次打开手机，flush 无条件重放那份【昨天的存档】，
       *   直接把 PC 的进度整份覆盖 —— 且 Net.write 每次重新 GET sha，
       *   不会 409 冲突，是静默覆盖，玩家只发现"进度没了"。
       * 现在：补传前先比对云端时间戳，队列数据明显更旧就丢弃不传。 */
      if (await this.staleOf(it)) { drop++; continue; }
      const ok = await this.write(it.path, it.obj, it.msg);
      if (ok) n++; else QUEUE.push(it);
      await sleep(1500);                 // 慢速，避免触发限流
    }
    try { localStorage.setItem(LS.queue, JSON.stringify(QUEUE)); } catch (e) {}
    if (drop) { try { console.log('[存档] 丢弃过期补传 ' + drop + ' 条（云端已有更新的数据）'); } catch (e) {} }
    return n;
  },

  /* 队列里的这份数据是否已被云端 newer 版本取代。
   * 只对带时间戳的对象（玩家存档 / 榜单）生效；其余一律返回 false（照常补传）。 */
  async staleOf(it) {
    try {
      const o = it.obj;
      if (!o || typeof o !== 'object') return false;
      const myRev = Number(o._rev) || 0;
      const mine = Number(o._baseAt) || Number(o.offlineAt) || Number(o.lastSeen) || Number(o.updated) || 0;
      if (!myRev && !mine) return false;
      const r = await Net.read(it.path);
      const d = r && r.data;
      if (!d || typeof d !== 'object') return false;      /* 云端没有 → 照常补传 */
      /* 版本号优先：不受设备时钟偏差影响（实测 60s 时间容差会漏放旧档） */
      const cloudRev = Number(d._rev) || 0;
      if (myRev && cloudRev) return myRev < cloudRev;
      const theirs = Number(d.offlineAt || d.lastSeen || d.updated || 0) || 0;
      /* 云端比队列数据新 5 秒以上 → 队列这份已过期 */
      return mine > 0 && theirs > mine + 5000;
    } catch (e) { return false; }
  },

  /** 列出目录 */
  /** 删除文件（后台用） */
  async del(path) {
    const d = await ghReq(path, { method: 'GET' });
    if (!d || !d.sha) return false;
    const eps = allEps();
    const H = { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json' };
    for (const ep of eps.slice(0, 6)) {
      try {
        const r = await fetchT(`${ep}/repos/${GH.owner}/${GH.repo}/contents/${path}`, {
          method: 'DELETE',
          headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'delete ' + path, sha: d.sha, branch: /^data\/zb\//.test(path) ? (GH.dataBranch || GH.branch) : GH.branch }),
        }, 12000);
        if (r.ok || r.status === 200) {
          /* 必须同步清掉本地缓存。
           * BUG（实测复现）：read(path, true) 的 quick 分支直接返回
           *   localStorage 里的 ss_cache_<path>。del 只删了云端，
           *   缓存原样留着 → 删完再读照样拿得到已删除的数据。
           *   表现：后台「永久删除账号」/玩家注销后，列表里这个人还在；
           *   运营反复删仍显示存在（缓存命中，根本没去问云端）。 */
          try { localStorage.removeItem(LS.cache + path); } catch (e) {}
          return true;
        }
      } catch (e) {}
    }
    return false;
  },

  /* 列出目录
   * ===============================================================
   * 致命 BUG 修复（后台长期只显示 1~2 个玩家的真凶）：
   *
   * ① 分支错乱：玩家存档全在 **players** 分支（实测 31 个），
   *    main 分支只有 1 个历史遗留文件。原实现走
   *    GET /contents/data/zb/players?ref=players，
   *    但公共反代端点普遍丢失 ?ref= 查询参数（或按 URL 缓存忽略它），
   *    静默返回默认分支 main 的内容 → 后台永远只看到那 1 个。
   *
   * ② 404 短路：ghReq 里 `status===404` 被当作"成功但为空"立刻返回，
   *    任一反代端点返回 404 就会导致整个请求失败，不再尝试其他端点。
   *
   * 实测对比（同一环境）：
   *    Net.list('data/zb/players/')  → 2 项   ✘（错的）
   *    Net.read('.../a13t4gg118bwxb5.json') → 读到"西瓜哥" ✔
   *    即 read 走对分支、list 走错分支。
   *
   * 解决方案：改用 **Git Trees API**
   *    GET /git/trees/{branch}?recursive=1
   * 一次请求返回整棵文件树，分支写在【路径】里而非 query string，
   * 反代端点无法丢失，且一次拿全（实测 players=31 / users=143）。
   * 结果按分支缓存 60 秒，避免重复请求。
   * =============================================================== */
  _treeCache: {},   // { branch: { at, paths } }
  async tree(branch) {
    const now = Date.now();
    const c = this._treeCache[branch];
    if (c && now - c.at < 60000) return c.paths;
    const H = { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json' };
    const eps = [...GH.extra, 'https://api.github.com'];   // trees API 只有官方支持，反代多不支持
    for (const ep of eps) {
      try {
        const r = await fetchT(`${ep}/repos/${GH.owner}/${GH.repo}/git/trees/${branch}?recursive=1`,
          { headers: H }, 20000);
        if (r.ok) {
          const j = await r.json();
          if (j && Array.isArray(j.tree)) {
            const paths = j.tree.filter((t) => t.type === 'blob').map((t) => t.path);
            this._treeCache[branch] = { at: now, paths: paths };
            return paths;
          }
        }
      } catch (e) {}
    }
    return null;
  },

  async list(path) {
    if (/^data\/zb\//.test(path)) {
      const norm = path.replace(/^\/+|\/+$/g, '');
      const out = [];
      const brs = [];
      [GH.dataBranch, GH.branch].forEach((b) => { if (b && brs.indexOf(b) < 0) brs.push(b); });
      for (const b of brs) {
        let names = null;
        const paths = await this.tree(b);
        if (paths) {
          names = paths
            .filter((pp) => pp.startsWith(norm + '/'))
            .map((pp) => pp.slice(norm.length + 1))
            .filter((n) => n.indexOf('/') < 0);      // 只取直接子级
        }
        /* trees 不可用时退回 contents API（次要路径） */
        if (!names) {
          try {
            const d = await ghReq(path, { method: 'GET', onlyOfficial: true }, b);
            if (Array.isArray(d)) names = d.map((x) => x.name);
          } catch (e) {}
        }
        (names || []).forEach((n) => { if (n && out.indexOf(n) < 0) out.push(n); });
      }
      return out;
    }
    const d = await ghReq(path, { method: 'GET' });
    if (Array.isArray(d)) return d.map((x) => x.name);
    return [];
  },

  reset() {
    DEAD = {}; BEST = ''; ONLINE = true;
    localStorage.removeItem(LS.dead); localStorage.removeItem(LS.best);
    localStorage.setItem(LS.net, 'online');
    return probe();
  },
};

window.Net = Net;
window.GH = GH;

/* =========================================================
 * TMO —— 通用超时器：离线/慢网时防止界面永久卡住
 *   用法：await TMO(Net.read(p), 6000)  → 超时返回 null
 * ========================================================= */
if (typeof window !== 'undefined') {
  window.TMO = function (promise, ms, def) {
    const d = def === undefined ? null : def;
    return Promise.race([
      Promise.resolve(promise).catch(() => d),
      new Promise((r) => setTimeout(() => r(d), ms || 6000)),
    ]);
  };
}
