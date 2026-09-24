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

const LS = { best: 'ss_best', dead: 'ss_dead', cache: 'ss_cache_', queue: 'ss_queue', net: 'ss_net' };

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
let ONLINE = localStorage.getItem(LS.net) !== 'offline';
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
      // 200 = 通；401/403 = 网络通但凭据问题（也算通）；404 = 通但路径不在
      if (r.ok || [401, 403, 404].includes(r.status)) return { ep, ms: performance.now() - t0, st: r.status };
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
      if (ok.length) {
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
      if (r.status === 404) return { ok: true, ep, json: null, is404: true };
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
    let d = await ghReq(path, { method: 'GET', quick });
    /* 存档在 players 分支；若某些端点丢了 ref 导致读不到，
     * 再显式用 main 分支试一次（反之亦然）。 */
    if ((!d || !d.content) && /^data\/zb\//.test(path)) {
      /* ① 官方端点 + 显式 players 分支（反代丢 ref 的可靠解药） */
      try {
        const d2 = await ghReq(path, { method: 'GET', quick, onlyOfficial: true }, GH.dataBranch || GH.branch);
        if (d2 && d2.content) d = d2;
      } catch (e) {}
      /* ② 仍读不到 → 官方端点 + main 分支（历史存档可能写在 main） */
      if ((!d || !d.content) && GH.branch !== (GH.dataBranch || GH.branch)) {
        try {
          const d3 = await ghReq(path, { method: 'GET', quick, onlyOfficial: true }, GH.branch);
          if (d3 && d3.content) d = d3;
        } catch (e) {}
      }
    }
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
    let sha = null;
    try {
      const cur = await ghReq(path, { method: 'GET' });
      if (cur && cur.sha) sha = cur.sha;
    } catch (e) {}
    const br = /^data\/zb\//.test(path) ? (GH.dataBranch || GH.branch) : GH.branch;
    const body = { message: msg || 'update ' + path, content, branch: br };
    if (sha) body.sha = sha;
    const r = await ghReq(path, { method: 'PUT', body });
    if (r && r.content) {
      localStorage.setItem(LS.cache + path, JSON.stringify(obj));
      return true;
    }
    // 进队列
    QUEUE = QUEUE.filter((x) => x.path !== path);
    QUEUE.push({ path, obj, msg, at: Date.now() });
    try { localStorage.setItem(LS.queue, JSON.stringify(QUEUE)); } catch (e) {}
    return false;
  },

  async flush() {
    if (!QUEUE.length || !ONLINE) return 0;
    let n = 0;
    const q = [...QUEUE];
    QUEUE = [];
    for (const it of q) {
      const ok = await this.write(it.path, it.obj, it.msg);
      if (ok) n++; else QUEUE.push(it);
      await sleep(1500);                 // 慢速，避免触发限流
    }
    try { localStorage.setItem(LS.queue, JSON.stringify(QUEUE)); } catch (e) {}
    return n;
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
        if (r.ok || r.status === 200) return true;
      } catch (e) {}
    }
    return false;
  },

  /* 列出目录
   * ---------------------------------------------------------------
   * 致命 BUG 修复（玩家只显示 1 个的真凶）：
   * 玩家存档在 **players** 分支（30+ 个文件），而 **main** 分支的
   * data/zb/players/ 只有 1 个历史遗留文件（uoy3fq9.json）。
   * 请求靠 ?ref=players 指定分支，但多数公共反代端点会丢掉 query string
   * 或缓存时忽略它 —— 于是悄悄返回了默认分支 main 的内容，
   * 后台就只看到那 1 个玩家（且恰好是已注销的）。
   * 现在：对 data/zb/ 路径，两个分支都列一遍并合并去重。
   * --------------------------------------------------------------- */
  async list(path) {
    if (/^data\/zb\//.test(path)) {
      const brs = [];
      [GH.dataBranch, GH.branch].forEach((b) => { if (b && brs.indexOf(b) < 0) brs.push(b); });
      const out = [];
      for (const b of brs) {
        let got = null;
        try { got = await ghReq(path, { method: 'GET' }, b); } catch (e) {}
        /* 反代端点可能丢 ref 而返回默认分支内容 ——
         * 若结果偏少（≤2 项，通常只有 .gitkeep）再用官方端点重试一次 */
        const thin = !Array.isArray(got) || got.length <= 2;
        if (thin && b !== GH.branch) {
          try {
            const g2 = await ghReq(path, { method: 'GET', onlyOfficial: true }, b);
            if (Array.isArray(g2) && g2.length > (Array.isArray(got) ? got.length : 0)) got = g2;
          } catch (e) {}
        }
        if (Array.isArray(got)) {
          got.forEach((x) => { if (x && x.name && out.indexOf(x.name) < 0) out.push(x.name); });
        }
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
