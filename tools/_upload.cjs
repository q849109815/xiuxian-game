#!/usr/bin/env node
/* 轻量分批上传：绕开统一 push 在网关层的长耗时超时。
 * 用法: node tools/_upload.cjs main file1 file2 ...
 *       node tools/_upload.cjs players file1 ...
 * 每个文件 GET 线上 sha → 不一致则 PUT → 回读 sha 复核，任一不一致即退出 1。 */
const https = require('https'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const tok = fs.readFileSync(path.resolve(ROOT, '..', '.ghtoken'), 'utf8').trim();
const branch = process.argv[2] || 'main';
const files = process.argv.slice(3);
const blob = b => crypto.createHash('sha1').update('blob ' + b.length + '\0').update(b).digest('hex');
const req = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const r = https.request({ hostname: 'api.github.com',
    path: '/repos/q849109815/xiuxian-game/contents/' + p, method,
    headers: { 'Authorization': 'Bearer ' + tok, 'User-Agent': 'upload-lite',
      'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }, timeout: 20000 },
    x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res({ st: x.statusCode, j: JSON.parse(d) }); } catch (e) { res({ st: x.statusCode, j: {} }); } }); });
  r.on('timeout', () => r.destroy()); r.on('error', rej);
  if (data) r.write(data); r.end();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let ok = 0, fail = 0;
  for (const f of files) {
    const local = fs.readFileSync(path.join(ROOT, f));
    const lsha = blob(local);
    try {
      let g = await req('GET', f + '?ref=' + branch);
      const rsha = g.j && g.j.sha;
      if (rsha === lsha) { console.log('SAME  ' + branch + '/' + f); ok++; continue; }
      const body = { message: 'V1.3.84 ' + f, content: local.toString('base64'), branch };
      if (rsha) body.sha = rsha;
      const u = await req('PUT', f, body);
      const nsha = (u.j && u.j.content && u.j.content.sha) || null;
      const v = await req('GET', f + '?ref=' + branch + '&t=' + Date.now());
      const vsha = v.j && v.j.sha;
      if (vsha === lsha) { console.log('OK    ' + branch + '/' + f + ' (PUT ' + u.st + ')'); ok++; }
      else { console.log('DIFF  ' + branch + '/' + f + ' st=' + u.st + ' got=' + String(vsha).slice(0, 8) + ' msg=' + (u.j.message || '')); fail++; }
    } catch (e) { console.log('ERR   ' + branch + '/' + f + ' ' + e.message); fail++; }
    await sleep(120);
  }
  console.log('UPLOAD ' + branch + ' ok=' + ok + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
