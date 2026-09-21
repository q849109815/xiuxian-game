/**
 * Cloudflare Worker —— GitHub API 加速代理（解决 api.github.com 连不上的可选方案）
 * 免费版 10 万次请求/天，远远够用。
 *
 * 部署：
 *   1) npx wrangler deploy                      （按提示登录 Cloudflare）
 *   2) npx wrangler secret put GH_TOKEN         （粘贴你的 GitHub Token，这样前端就不暴露 Token）
 *   3) 得到 https://xxx.xxx.workers.dev，填进游戏「设置 → 自定义加速地址」
 *
 * 提示：配置了 GH_TOKEN 后，前端可以把 js/api.js 里的 token 留空，Worker 会自动注入。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '') {
      return new Response('GitHub 代理运行中。用法：把 https://api.github.com 换成 https://' + url.hostname,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    const target = 'https://api.github.com' + url.pathname + url.search;
    const headers = new Headers();

    let auth = request.headers.get('authorization');
    if ((!auth || auth.replace('Bearer', '').trim() === '') && env.GH_TOKEN) auth = `Bearer ${env.GH_TOKEN}`;

    for (const k of ['accept', 'content-type', 'x-github-api-version', 'user-agent']) {
      const v = request.headers.get(k);
      if (v) headers.set(k, v);
    }
    if (auth) headers.set('authorization', auth);

    const init = { method: request.method, headers };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer();

    let r;
    try {
      r = await fetch(target, init);
    } catch (e) {
      return new Response(JSON.stringify({ message: 'upstream error: ' + e.message }), { status: 502, headers: cors() });
    }

    const out = cors();
    out.set('content-type', r.headers.get('content-type') || 'application/json');
    return new Response(r.body, { status: r.status, headers: out });

    function cors() {
      const h = new Headers();
      h.set('access-control-allow-origin', '*');
      h.set('access-control-allow-headers', '*');
      h.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      return h;
    }
  },
};
