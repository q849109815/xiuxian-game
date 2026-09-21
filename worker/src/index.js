/**
 * 修仙游戏 · GitHub API 加速代理（Cloudflare Worker）
 * 直接在 Cloudflare 面板粘贴这段代码即可，不需要命令行、不需要新建仓库。
 *
 * 作用：把 api.github.com 换成你的 workers.dev 地址，绕过国内直连不通的问题。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 浏览器直接打开时给个说明
    if (url.pathname === '/' || url.pathname === '') {
      return new Response('✅ 修仙游戏代理运行中。把游戏「设置 → 自定义加速地址」填成 https://' + url.hostname,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    // 允许前端自带 Token，也支持用 Cloudflare 里配的 GH_TOKEN 秘密（更安全）
    let auth = request.headers.get('authorization');
    if ((!auth || auth.replace('Bearer', '').trim() === '') && env.GH_TOKEN) {
      auth = 'Bearer ' + env.GH_TOKEN;
    }

    const headers = new Headers();
    for (const k of ['accept', 'content-type', 'x-github-api-version', 'user-agent']) {
      const v = request.headers.get(k);
      if (v) headers.set(k, v);
    }
    if (auth) headers.set('authorization', auth);

    const init = { method: request.method, headers };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.arrayBuffer();
    }

    let r;
    try {
      r = await fetch('https://api.github.com' + url.pathname + url.search, init);
    } catch (e) {
      return json({ message: 'upstream error: ' + e.message }, 502);
    }

    const out = new Headers(r.headers);
    out.set('access-control-allow-origin', '*');
    out.set('access-control-allow-headers', '*');
    out.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    return new Response(r.body, { status: r.status, headers: out });

    function json(obj, code) {
      const h = new Headers({ 'content-type': 'application/json' });
      h.set('access-control-allow-origin', '*');
      return new Response(JSON.stringify(obj), { status: code, headers: h });
    }
  },
};
