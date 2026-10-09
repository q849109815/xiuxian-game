/**
 * 修仙 / 向僵尸开炮 —— GitHub API 代理（Cloudflare Worker）
 *
 * 免费额度：Cloudflare Workers 免费版 10 万次请求 / 天，本项目量级绰绰有余。
 *
 * 相比"裸转发"，本版解决了三件事：
 *   1. 令牌不下发客户端：令牌存在 Cloudflare 的 Secret 里（GH_TOKEN），
 *      由 Worker 在服务端补上 Authorization 头。客户端即使不带令牌也能读写。
 *   2. 省配额：读请求按路径短期缓存（默认 10 秒），写完自动失效。
 *      GitHub 是 5000 次/小时，多玩家在线时缓存能显著削峰。
 *   3. 防滥用：只放行本游戏的仓库路径，别人拿到你的地址也当不了通用代理。
 *
 * 部署（两种都行）：
 *   A. 面板粘贴：Cloudflare → Workers 和 Pages → 创建 → 粘贴本文件 → 部署
 *      → 设置 → 变量和机密 → 添加 GH_TOKEN（类型选"机密"）
 *   B. 命令行：npx wrangler deploy && npx wrangler secret put GH_TOKEN
 */
const OWNER = 'q849109815';
const REPO  = 'xiuxian-game';
const CACHE_TTL = 10;          // 读缓存秒数；写请求不走缓存

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    // 健康检查
    if (url.pathname === '/' || url.pathname === '/__ping') {
      return j({
        ok: true,
        service: 'xiuxian-gh-proxy',
        token: env.GH_TOKEN ? 'configured(secret)' : 'MISSING',
        note: '在游戏「设置 → 自定义加速地址」填入 https://' + url.hostname
      });
    }

    // 路径白名单：只代理本仓库与配额查询，杜绝通用代理滥用
    if (!allowed(url.pathname)) {
      return j({ message: 'path not allowed: ' + url.pathname }, 403);
    }

    const isWrite = !['GET', 'HEAD'].includes(request.method);
    // 写/删再加一道：只允许数据目录，禁止改代码文件与删站
    if (isWrite && !allowedWrite(url.pathname)) {
      return j({ message: 'write not allowed: ' + url.pathname }, 403);
    }

    // 读缓存
    if (!isWrite) {
      const hit = await caches.default.match(request);
      if (hit) {
        const h = new Headers(hit.headers);
        h.set('x-proxy-cache', 'HIT');
        addCors(h);
        return new Response(hit.body, { status: hit.status, headers: h });
      }
    }

    // 组装上游请求
    const headers = new Headers();
    for (const k of ['accept', 'content-type', 'x-github-api-version', 'if-none-match']) {
      const v = request.headers.get(k);
      if (v) headers.set(k, v);
    }
    headers.set('user-agent', 'xiuxian-game-worker');
    // 关键：令牌由 Worker 注入。客户端若自己也带了，以服务端机密为准。
    if (env.GH_TOKEN) headers.set('authorization', 'Bearer ' + env.GH_TOKEN);
    else {
      const a = request.headers.get('authorization');
      if (a) headers.set('authorization', a);   // 没配 Secret 时的兜底
    }

    const init = { method: request.method, headers };
    if (isWrite) init.body = await request.arrayBuffer();

    let r;
    try {
      r = await fetch('https://api.github.com' + url.pathname + url.search, init);
    } catch (e) {
      return j({ message: 'upstream error: ' + e.message }, 502);
    }

    const body = await r.arrayBuffer();
    const out = new Headers(r.headers);
    out.delete('set-cookie');
    addCors(out);
    out.set('x-proxy-cache', 'MISS');

    const resp = new Response(body, { status: r.status, headers: out });

    // 写入缓存（仅成功读请求）
    if (!isWrite && r.status === 200 && CACHE_TTL > 0) {
      const c = new Response(body, { status: r.status, headers: new Headers(r.headers) });
      c.headers.set('cache-control', 'public, max-age=' + CACHE_TTL);
      ctx.waitUntil(caches.default.put(request, c));
    }

    // 写操作后清一下同路径缓存，避免读到旧数据
    if (isWrite && r.status < 300) {
      // 注意：缓存条目是 GET 建的，删除也要用 GET 请求去匹配，否则删不掉、会读到旧数据
      ctx.waitUntil(caches.default.delete(new Request(request.url, { method: 'GET' })).catch(() => {}));
    }
    return resp;
  },
};

function allowed(p) {
  if (p === '/rate_limit' || p === '/rate_limit/') return true;
  return p.startsWith('/repos/' + OWNER + '/' + REPO + '/');
}

/* 写/删白名单：只放行 data/zb/ 下的数据文件
 * ---------------------------------------------------------------------
 * 【安全修复】此前 allowed() 只校验路径前缀，对任意路径都允许 PUT/DELETE。
 *   Worker 一旦部署，任何知道地址的人都能：
 *     PUT /repos/.../contents/js/config.js   → 给自己发无限钻石
 *     DELETE /repos/.../contents/index.html  → 整站下线
 *   等于「令牌不下发前端了，但 Worker 自己又变成无鉴权的写入口」。
 * 现在读仍走原白名单（读本来就是公开的），写/删只放行数据目录：
 *   允许 /contents/data/zb/...   （玩家存档、账号、邮件、活动、榜单等）
 *   拒绝 /contents/js|css|admin|assets|index.html 及所有非 contents 路径
 * 这样即使地址泄露，最坏也只是数据被改，网站代码与仓库结构仍安全。 */
function allowedWrite(p) {
  if (!p.startsWith('/repos/' + OWNER + '/' + REPO + '/contents/')) return false;
  return p.indexOf('/contents/data/zb/') >= 0;
}
function addCors(h) {
  h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-headers', '*');
  h.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  h.set('access-control-expose-headers', '*');
}
function cors() {
  const h = new Headers();
  addCors(h);
  return h;
}
function j(obj, code = 200) {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  addCors(h);
  return new Response(JSON.stringify(obj), { status: code, headers: h });
}
