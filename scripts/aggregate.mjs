#!/usr/bin/env node
/**
 * aggregate.mjs —— 由 GitHub Actions 定时执行，充当「免费服务器」
 * 1) 扫描 data/players/*.json
 * 2) 生成 data/leaderboard.json（战力榜）
 * 3) 生成 data/stats.json（在线/新增/分布）
 * 4) 每天把全量玩家存档备份到 backups/日期.json
 * 用法：GITHUB_TOKEN=xxx OWNER=xxx REPO=xxx node scripts/aggregate.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const OWNER = process.env.OWNER || process.env.GITHUB_REPOSITORY?.split('/')[0];
const REPO = process.env.REPO || process.env.GITHUB_REPOSITORY?.split('/')[1];
const BRANCH = process.env.BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN || process.env.TOKEN;
const API = process.env.GH_API || 'https://api.github.com';

const H = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'xiuxian-bot' };

async function gh(p, opt = {}) {
  const r = await fetch(`${API}${p}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function readFile(fileSha) {
  const b = await gh(`/repos/${OWNER}/${REPO}/git/blobs/${fileSha}`);
  const buf = Buffer.from(b.content, 'base64');
  return JSON.parse(buf.toString('utf8'));
}

async function getSha(p) {
  try { const r = await gh(`/repos/${OWNER}/${REPO}/contents/${p}?ref=${BRANCH}`); return r.sha; } catch { return null; }
}

async function putFile(p, obj, msg) {
  const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  const body = { message: msg, content, branch: BRANCH };
  const sha = await getSha(p); if (sha) body.sha = sha;
  await gh(`/repos/${OWNER}/${REPO}/contents/${p}`, { method: 'PUT', body: JSON.stringify(body) });
  console.log('✔ 写入', p);
}

(async () => {
  if (!TOKEN) throw new Error('缺少 GITHUB_TOKEN');
  // 1. 列出玩家文件
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`);
  const files = (tree.tree || []).filter((t) => t.path.startsWith('data/players/') && t.path.endsWith('.json'));
  console.log(`发现 ${files.length} 个玩家存档`);

  // 2. 读取配置（算战力）
  let cfg = null;
  try { cfg = await readFile((tree.tree.find((t) => t.path === 'data/config/game.json') || {}).sha); } catch {}
  const base = cfg?.baseAttr || { hp: 100, atk: 12, def: 5 };
  const g = cfg?.growthPerRealm || { hp: 60, atk: 8, def: 4 };
  const Q = cfg?.qualities || [{ mul: 1 }];

  const power = (p) => {
    let a = { atk: base.atk + g.atk * p.realm, def: base.def + g.def * p.realm, hp: base.hp + g.hp * p.realm };
    for (const k of ['weapon', 'armor', 'ring']) {
      const it = p.equip?.[k]; if (!it) continue;
      const mul = (Q[it.q]?.mul || 1) * (1 + (it.level || 0) * 0.12);
      a.atk += (it.atk || 0) * mul; a.def += (it.def || 0) * mul; a.hp += (it.hp || 0) * mul;
    }
    return Math.round((a.atk * 3 + a.def * 2 + a.hp * 0.5 + 40) * (1 + p.realm * 0.25));
  };
  const realmName = (p) => (cfg?.realms?.[p.realm]?.name || '?') + (p.layer + 1) + '层';

  const players = [];
  for (const f of files) {
    try {
      const p = await readFile(f.sha);
      if (!p || !p.uid) continue;
      players.push({
        uid: p.uid, name: p.name, realm: realmName(p), realmIdx: p.realm,
        power: power(p), stone: p.stone || 0, kills: p.stats?.kills || 0,
        battles: p.stats?.battles || 0, lastSeen: p.lastSeen || 0, createdAt: p.createdAt || 0,
        banned: !!p.banned,
      });
    } catch (e) { console.log('跳过', f.path, e.message); }
  }

  players.sort((a, b) => b.power - a.power);
  const now = Date.now();
  const day = 86400000;

  // 3. 写榜单与统计
  await putFile('data/leaderboard.json', { updatedAt: new Date().toISOString(), list: players.slice(0, 100) }, '[bot] 更新天骄榜');
  await putFile('data/stats.json', {
    updatedAt: new Date().toISOString(),
    total: players.length,
    online10m: players.filter((p) => now - p.lastSeen < 10 * 60000).length,
    online1h: players.filter((p) => now - p.lastSeen < 60 * 60000).length,
    dau: players.filter((p) => now - p.lastSeen < day).length,
    newToday: players.filter((p) => now - p.createdAt < day).length,
    new7d: players.filter((p) => now - p.createdAt < 7 * day).length,
    totalStone: players.reduce((s, p) => s + p.stone, 0),
    totalKills: players.reduce((s, p) => s + p.kills, 0),
    realmDist: players.reduce((m, p) => { const k = cfg?.realms?.[p.realmIdx]?.name || '?'; m[k] = (m[k] || 0) + 1; return m; }, {}),
  }, '[bot] 更新统计');

  // 4. 每日全量备份
  const d = new Date().toISOString().slice(0, 10);
  await putFile(`backups/${d}.json`, { at: new Date().toISOString(), count: players.length, players }, `[bot] 每日备份 ${d}`);
  console.log('✔ 完成');
})().catch((e) => { console.error('✘ 失败', e); process.exit(1); });
