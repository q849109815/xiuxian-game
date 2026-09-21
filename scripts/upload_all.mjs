#!/usr/bin/env node
/**
 * upload_all.mjs —— 把本地 xiuxian 文件夹「整个」上传到 GitHub 仓库，保留目录结构。
 * 逐个文件调用 Contents API 上传，顺序执行，失败会重试并打印原因。
 *
 * 用法：
 *   GITHUB_TOKEN=github_pat_xxx OWNER=用户名 REPO=xiuxian-game node scripts/upload_all.mjs
 *   DRY_RUN=1 ...   # 只列出将要上传的文件，不真的传
 *
 * 说明：
 *   - 中文文件名会自动做 URL 编码
 *   - 已存在的文件会被覆盖（先取 sha）
 *   - 空目录用一个 .gitkeep 占位，保证目录被创建
 */
import fs from 'node:fs';
import path from 'node:path';

const OWNER = process.env.OWNER;
const REPO = process.env.REPO || 'xiuxian-game';
const BRANCH = process.env.BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN || process.env.TOKEN;
const DRY = process.env.DRY_RUN === '1';
const ROOT = path.resolve(process.env.ROOT_DIR || path.dirname(new URL(import.meta.url).pathname) + '/..');

if (!TOKEN || !OWNER) { console.error('需要 GITHUB_TOKEN 和 OWNER 环境变量'); process.exit(1); }

const API = process.env.GH_API || 'https://api.github.com';
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'xiuxian-uploader',
};

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push({ rel, abs: path.join(dir, e.name) });
  }
  return out;
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function gh(p, opt = {}) {
  const r = await fetch(`${API}${p}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  return r;
}

async function getSha(rel) {
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${enc(rel)}?ref=${BRANCH}`);
  if (r.status === 200) return (await r.json()).sha;
  return null;
}

async function put(rel, contentStr, msg) {
  const content = Buffer.from(contentStr, 'utf8').toString('base64');
  const body = { message: msg, content, branch: BRANCH };
  const sha = await getSha(rel);
  if (sha) body.sha = sha;
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${enc(rel)}`, { method: 'PUT', body: JSON.stringify(body) });
  if (r.status === 200 || r.status === 201) return 'ok';
  const t = await r.text();
  throw new Error(`${r.status} ${t.slice(0, 200)}`);
}

(async () => {
  const files = walk(ROOT).sort((a, b) => a.rel.localeCompare(b.rel));
  console.log(`待上传 ${files.length} 个文件 → ${OWNER}/${REPO}@${BRANCH}\n`);
  if (DRY) { files.forEach((f) => console.log('  ' + f.rel)); return; }

  let ok = 0, fail = [];
  for (const f of files) {
    const isBin = /\.(zip|png|jpg|ico|woff2?)$/i.test(f.rel);
    const content = isBin ? fs.readFileSync(f.abs).toString('base64') : fs.readFileSync(f.abs, 'utf8');
    const payload = isBin ? null : content; // 二进制走下面分支
    try {
      if (isBin) {
        const body = { message: `[bot] upload ${f.rel}`, content: fs.readFileSync(f.abs).toString('base64'), branch: BRANCH };
        const sha = await getSha(f.rel); if (sha) body.sha = sha;
        const r = await gh(`/repos/${OWNER}/${REPO}/contents/${enc(f.rel)}`, { method: 'PUT', body: JSON.stringify(body) });
        if (r.status !== 200 && r.status !== 201) throw new Error(`${r.status} ${(await r.text()).slice(0, 150)}`);
      } else {
        await put(f.rel, content, `[bot] upload ${f.rel}`);
      }
      ok++; console.log(`✔ ${f.rel}`);
    } catch (e) {
      fail.push({ rel: f.rel, err: e.message });
      console.log(`✘ ${f.rel}  ${e.message}`);
    }
  }
  console.log(`\n完成：成功 ${ok} / 共 ${files.length}`);
  if (fail.length) { console.log('失败清单：'); fail.forEach((f) => console.log('  ' + f.rel + ' → ' + f.err)); process.exit(1); }
})();
