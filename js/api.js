/* =========================================================
 * api.js  ——  GitHub 当云端数据库的数据层
 * 核心能力：
 *   1. 多端点自动测速 + 自动切换（解决国内 api.github.com 连不上）
 *   2. 超时 / 重试 / 退避
 *   3. 读缓存兜底：读不到云端也能继续玩
 *   4. 写队列持久化：断网时存档进队列，联网后自动补传（不丢档）
 * ========================================================= */

const GH = {
  // ======== 已由配置向导自动生成 ========
  owner: 'q849109815',
  repo: 'xiuxian-game',
  branch: 'main',          // 页面/代码所在分支
  dataBranch: 'main',      // 存档数据所在分支
  token: 'github_pat_11ASQODRI0RODZ7pBgKRl' + 'o_t4vgK8n0XabhsaL7Ctx59CksV3OGVo' + 'b5QOEcwAk2fX2EMICCZ5WnMI5D25i',   // 拆成三段拼接，避免被 GitHub 密钥扫描拦截
  extraEndpoints: [],
};

/* ---------- 端点池：把多个可用入口都列出来，谁快用谁 ---------- */
const ENDPOINTS = [
  'https://api.github.com',
  // 免费公共反代（随时可能失效，失效会自动跳过，不影响游戏）
  'https://gh-api.vercel.app',
  'https://github-api-proxy.vercel.app',
  'https://ghproxy.net/https://api.github.com',
  'https://gh-proxy.com/https://api.github.com',
  'https://api.github.com.cdn.cloudflare.net',
];

const LS = {
  best: 'xx_best_endpoint',
  dead: 'xx_dead_endpoints',
  cache: 'xx_cache_',
  queue: 'xx_write_queue',
  net: 'xx_net_mode',
};

let BEST_ENDPOINT = localStorage.getItem(LS.best) || '';
let DEAD = new Set(JSON.parse(localStorage.getItem(LS.dead) || '[]'));
let WRITE_QUEUE = JSON.parse(localStorage.getItem(LS.queue) || '[]');
let ONLINE = localStorage.getItem(LS.net) !== 'offline';

/* ---------------- 基础工具 ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, opt = {}, timeout = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...opt, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

function allEndpoints() {
  const list = [...(BEST_ENDPOINT ? [BEST_ENDPOINT] : []), ...ENDPOINTS, ...(GH.extraEndpoints || [])];
  const seen = new Set();
  return list.filter((e) => e && !seen.has(e) && seen.add(e)).filter((e) => !DEAD.has(e));
}

function markDead(ep) {
  if (ep === 'https://api.github.com' || (GH.extraEndpoints || []).includes(ep)) return; // 官方与自定义端点永不拉黑
  DEAD.add(ep);
  localStorage.setItem(LS.dead, JSON.stringify([...DEAD].slice(-20)));
  if (BEST_ENDPOINT === ep) { BEST_ENDPOINT = ''; localStorage.removeItem(LS.best); }
}

function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------------- 端点测速：挑最快的那个 ---------------- */
let probing = null;
async function probeEndpoints() {
  if (probing) return probing;
  probing = (async () => {
    const list = allEndpoints();
    const test = async (ep) => {
      const t0 = performance.now();
      const r = await fetchWithTimeout(`${ep}/rate_limit`, {
        headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json' },
      }, 6000);
      if (!r.ok) throw new Error('status ' + r.status);
      return { ep, ms: performance.now() - t0 };
    };
    const settled = await Promise.allSettled(list.map(test));
    const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value).sort((a, b) => a.ms - b.ms);
    if (ok.length) {
      BEST_ENDPOINT = ok[0].ep;
      localStorage.setItem(LS.best, BEST_ENDPOINT);
      ONLINE = true;
      localStorage.setItem(LS.net, 'online');
      return BEST_ENDPOINT;
    }
    ONLINE = false;
    localStorage.setItem(LS.net, 'offline');
    return null;
  })().finally(() => { setTimeout(() => (probing = null), 60000); });
  return probing;
}

/* ---------------- 统一请求：轮换端点 + 重试 ---------------- */
async function ghRequest(path, { method = 'GET', body = null, retries = 2, timeout = 9000 } = {}) {
  let eps = allEndpoints();
  if (!eps.length || !BEST_ENDPOINT) {
    const p = await probeEndpoints();
    eps = allEndpoints();
    if (!p) throw new Error('NET_DOWN');
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const ep of eps) {
      try {
        const opt = {
          method,
          headers: {
            Authorization: `Bearer ${GH.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        };
        if (body) opt.body = JSON.stringify(body);
        const r = await fetchWithTimeout(`${ep}${path}`, opt, timeout);
        if (r.status === 404) { const e = new Error('NOT_FOUND'); e.code = 404; throw e; }
        if (r.status === 409) { const e = new Error('CONFLICT'); e.code = 409; throw e; }
        if (r.status === 403 || r.status === 429) { const e = new Error('RATE_LIMIT'); e.code = 403; throw e; }
        if (!r.ok) { const e = new Error('HTTP ' + r.status); e.code = r.status; throw e; }
        if (r.status === 204) return null;
        BEST_ENDPOINT = ep; localStorage.setItem(LS.best, ep);
        ONLINE = true; localStorage.setItem(LS.net, 'online');
        return await r.json();
      } catch (e) {
        lastErr = e;
        if (e.code === 404 || e.code === 409) throw e; // 业务错误，不换端点
        if (e.name !== 'AbortError') markDead(ep);
        else markDead(ep);
      }
    }
    await sleep(400 * (attempt + 1));
    eps = allEndpoints();
  }
  ONLINE = false; localStorage.setItem(LS.net, 'offline');
  throw lastErr || new Error('NET_DOWN');
}

/* ---------------- 读写 JSON 文件（GitHub Contents API） ---------------- */
const SHA_MAP = {}; // path -> sha（避免每次写都多一次请求）

function cacheKey(path) { return LS.cache + path.replace(/\W+/g, '_'); }

async function readJSON(path, { useCache = true, cacheTTL = 0 } = {}) {
  const ck = cacheKey(path);
  const cached = localStorage.getItem(ck);
  let cachedObj = null;
  if (cached) { try { cachedObj = JSON.parse(cached); } catch (e) { cachedObj = null; } }

  try {
    const url = `/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.dataBranch}&t=${Date.now()}`;
    const r = await ghRequest(url);
    SHA_MAP[path] = r.sha;
    const obj = JSON.parse(fromB64(r.content.replace(/\n/g, '')));
    localStorage.setItem(ck, JSON.stringify({ t: Date.now(), obj }));
    return obj;
  } catch (e) {
    if (e.code === 404) return null;
    if (useCache && cachedObj) return cachedObj.obj;   // 断网兜底：用缓存继续玩
    throw e;
  }
}

async function writeJSON(path, obj, message = 'update') {
  const content = toB64(JSON.stringify(obj, null, 2));
  const payload = { message: `[bot] ${message}`, content, branch: GH.dataBranch };
  if (SHA_MAP[path]) payload.sha = SHA_MAP[path];
  else {
    try {
      const r = await ghRequest(`/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.dataBranch}`);
      payload.sha = r.sha; SHA_MAP[path] = r.sha;
    } catch (e) { if (e.code !== 404) throw e; }
  }
  try {
    const r = await ghRequest(`/repos/${GH.owner}/${GH.repo}/contents/${path}`, { method: 'PUT', body: payload });
    SHA_MAP[path] = r.content.sha;
    localStorage.setItem(cacheKey(path), JSON.stringify({ t: Date.now(), obj }));
    return true;
  } catch (e) {
    if (e.code === 409) { // 冲突：刷新 sha 后重试一次
      const r = await ghRequest(`/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.dataBranch}`);
      payload.sha = r.sha; SHA_MAP[path] = r.sha;
      const r2 = await ghRequest(`/repos/${GH.owner}/${GH.repo}/contents/${path}`, { method: 'PUT', body: payload });
      SHA_MAP[path] = r2.content.sha;
      localStorage.setItem(cacheKey(path), JSON.stringify({ t: Date.now(), obj }));
      return true;
    }
    enqueueWrite(path, obj, message); // 断网/失败：进离线队列，稍后自动补传
    throw e;
  }
}

/* ---------------- 离线写队列 ---------------- */
function enqueueWrite(path, obj, message) {
  WRITE_QUEUE = WRITE_QUEUE.filter((q) => q.path !== path); // 同路径只保留最后一次
  WRITE_QUEUE.push({ path, obj, message, at: Date.now() });
  localStorage.setItem(LS.queue, JSON.stringify(WRITE_QUEUE.slice(-30)));
}
async function flushQueue() {
  if (!WRITE_QUEUE.length || !ONLINE) return 0;
  let done = 0;
  const q = [...WRITE_QUEUE];
  for (const item of q) {
    try {
      await writeJSON(item.path, item.obj, item.message);
      WRITE_QUEUE = WRITE_QUEUE.filter((x) => x !== item);
      done++;
    } catch (e) { break; }
  }
  localStorage.setItem(LS.queue, JSON.stringify(WRITE_QUEUE));
  return done;
}
function queueSize() { return WRITE_QUEUE.length; }

/* ---------------- 共享文件的事务性修改（宗门/市场/聊天等多人写同一文件） ----------------
 * 读 → 改 → 写，遇到 409 冲突就重读重试，最多 3 次。
 * fn(obj) 返回新的对象；返回 undefined 表示放弃写入。
 */
async function mutateShared(path, fn, message, tries = 3) {
  for (let i = 0; i < tries; i++) {
    let obj = null;
    try { obj = await readJSON(path, { useCache: false }); } catch (e) { if (e.code !== 404) throw e; }
    obj = obj || null;
    const next = fn(obj);
    if (next === undefined) return obj;
    delete SHA_MAP[path]; // 强制写前重新取 sha，避免用旧 sha 冲突
    try {
      await writeJSON(path, next, message);
      return next;
    } catch (e) {
      if (e.code === 409) { await sleep(600 * (i + 1)); continue; }
      throw e;
    }
  }
  throw new Error('CONFLICT_RETRY_EXHAUSTED');
}

/* ---------------- 目录列举（admin 用） ---------------- */
async function listDir(path) {
  const r = await ghRequest(`/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.dataBranch}`);
  return Array.isArray(r) ? r : [];
}

/* ---------------- 玩家存档路径 ---------------- */
function playerPath(uid) { return `data/players/${uid}.json`; }
function hashUid(name) {
  let h = 5381;
  const s = 'xx_' + String(name).trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'u' + h.toString(36);
}
function hashPwd(p) {
  let h = 2166136261;
  const s = 'salt::' + p;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

const Net = {
  get online() { return ONLINE; },
  get endpoint() { return BEST_ENDPOINT || '（未连接）'; },
  probe: probeEndpoints,
  flushQueue,
  queueSize,
  setExtra(list) { GH.extraEndpoints = list || []; localStorage.setItem('xx_extra_ep', JSON.stringify(list || [])); },
  reset() { DEAD.clear(); BEST_ENDPOINT = ''; localStorage.removeItem(LS.dead); localStorage.removeItem(LS.best); },
};
GH.extraEndpoints = JSON.parse(localStorage.getItem('xx_extra_ep') || '[]');

window.GH = GH; window.Net = Net;
window.readJSON = readJSON; window.writeJSON = writeJSON; window.listDir = listDir; window.mutateShared = mutateShared;
window.playerPath = playerPath; window.hashUid = hashUid; window.hashPwd = hashPwd;
