#!/usr/bin/env node
/**
 * aggregate.mjs —— 由 GitHub Actions 定时执行，充当「免费服务器」
 * 1) 扫描 data/players/*.json → 生成天骄榜 + 论道榜 + 统计
 * 2) 汇总宗门人数、聊天裁剪、市场过期清理
 * 3) 每日全量备份到 backups/日期.json
 * 用法：GITHUB_TOKEN=xxx OWNER=xxx REPO=xxx node scripts/aggregate.mjs
 */
import fs from 'node:fs/promises';

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
async function readFile(sha) {
  const b = await gh(`/repos/${OWNER}/${REPO}/git/blobs/${sha}`);
  return JSON.parse(Buffer.from(b.content, 'base64').toString('utf8'));
}
async function getSha(p) {
  try { return (await gh(`/repos/${OWNER}/${REPO}/contents/${p}?ref=${BRANCH}`)).sha; } catch { return null; }
}
async function putFile(p, obj, msg) {
  const body = { message: msg, content: Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64'), branch: BRANCH };
  const sha = await getSha(p); if (sha) body.sha = sha;
  await gh(`/repos/${OWNER}/${REPO}/contents/${p}`, { method: 'PUT', body: JSON.stringify(body) });
  console.log('✔ 写入', p);
}

(async () => {
  if (!TOKEN) throw new Error('缺少 GITHUB_TOKEN');
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`);
  const find = (p) => (tree.tree || []).find((t) => t.path === p);
  const files = (tree.tree || []).filter((t) => t.path.startsWith('data/players/') && t.path.endsWith('.json'));
  console.log(`发现 ${files.length} 个玩家存档`);

  let cfg = null, content = null, social = null;
  try { cfg = await readFile(find('data/config/game.json').sha); } catch {}
  try { content = await readFile(find('data/config/content.json').sha); } catch {}
  try { social = await readFile(find('data/config/social.json').sha); } catch {}

  const Q = cfg?.qualities || [{ mul: 1 }];
  const base = cfg?.baseAttr || { hp: 120, atk: 14, def: 6 };
  const g = cfg?.growthPerRealm || { hp: 130, atk: 20, def: 11 };
  const gs = cfg?.growthPerStage || { hp: 30, atk: 4, def: 2 };

  function power(p) {
    let a = { atk: base.atk + g.atk * p.realm + gs.atk * p.stage, def: base.def + g.def * p.realm + gs.def * p.stage, hp: base.hp + g.hp * p.realm + gs.hp * p.stage };
    const rt = (cfg?.roots || []).find((r) => r.id === p.root);
    if (rt) { a.atk *= rt.atkMul || 1; a.def *= rt.defMul || 1; }
    for (const k of ['weapon', 'armor', 'ring', 'talisman']) {
      const it = p.equip?.[k]; if (!it) continue;
      const mul = (Q[it.q]?.mul || 1) * (1 + (it.level || 0) * 0.12) * (1 + (it.temper || 0) * 0.18);
      a.atk += (it.atk || 0) * mul; a.def += (it.def || 0) * mul; a.hp += (it.hp || 0) * mul;
    }
    return Math.round((a.atk * 3 + a.def * 2.4 + a.hp * 0.5 + 40) * (1 + p.realm * 0.28));
  }
  const realmName = (p) => (cfg?.realms?.[p.realm]?.name || '?') + (cfg?.stages?.[p.stage] || '');

  const players = [];
  for (const f of files) {
    try {
      const p = await readFile(f.sha);
      if (!p || !p.uid) continue;
      players.push({
        uid: p.uid, name: p.name, avatar: p.avatar || '', realm: realmName(p), realmIdx: p.realm,
        power: power(p), stone: p.stone || 0, kills: p.stats?.kills || 0,
        arena: p.arena?.score || 0, sect: p.sect || null, root: p.root,
        lastSeen: p.lastSeen || 0, createdAt: p.createdAt || 0, reinc: p.reinc || 0,
      });
    } catch (e) { console.log('跳过', f.path, e.message); }
  }

  const now = Date.now(), day = 86400000;
  const byPower = [...players].sort((a, b) => b.power - a.power);
  const byArena = [...players].sort((a, b) => b.arena - a.arena);

  await putFile('data/leaderboard.json', { updatedAt: new Date().toISOString(), list: byPower.slice(0, 100) }, '[bot] 更新天骄榜');
  await putFile('data/arena_rank.json', { updatedAt: new Date().toISOString(), list: byArena.slice(0, 100) }, '[bot] 更新论道榜');
  await putFile('data/stats.json', {
    updatedAt: new Date().toISOString(),
    total: players.length,
    online10m: players.filter((p) => now - p.lastSeen < 10 * 60000).length,
    dau: players.filter((p) => now - p.lastSeen < day).length,
    newToday: players.filter((p) => now - p.createdAt < day).length,
    new7d: players.filter((p) => now - p.createdAt < 7 * day).length,
    totalStone: players.reduce((s, p) => s + p.stone, 0),
    totalKills: players.reduce((s, p) => s + p.kills, 0),
    realmDist: players.reduce((m, p) => { const k = cfg?.realms?.[p.realmIdx]?.name || '?'; m[k] = (m[k] || 0) + 1; return m; }, {}),
    rootDist: players.reduce((m, p) => { m[p.root] = (m[p.root] || 0) + 1; return m; }, {}),
    sectDist: players.reduce((m, p) => { const k = p.sect || '散修'; m[k] = (m[k] || 0) + 1; return m; }, {}),
  }, '[bot] 更新统计');

  // 宗门人数重算
  try {
    const sf = find('data/sects.json');
    const sects = sf ? await readFile(sf.sha) : { list: (social?.sects || []).map((s) => ({ ...s, members: 0 })) };
    const list = sects.list || [];
    const count = players.reduce((m, p) => { if (p.sect) m[p.sect] = (m[p.sect] || 0) + 1; return m; }, {});
    for (const s of list) s.members = count[s.id] || 0;
    await putFile('data/sects.json', { updatedAt: new Date().toISOString(), list }, '[bot] 更新宗门统计');
  } catch (e) { console.log('宗门汇总跳过', e.message); }

  // 聊天裁剪
  try {
    const cf = find('data/chat.json');
    if (cf) {
      const c = await readFile(cf.sha);
      const max = social?.chat?.maxMessages || 60;
      await putFile('data/chat.json', { updatedAt: new Date().toISOString(), list: (c.list || []).slice(0, max) }, '[bot] 裁剪聊天');
    }
  } catch (e) { console.log('聊天裁剪跳过', e.message); }

  // 市场清理：已售出 + 过期
  try {
    const mf = find('data/market.json');
    if (mf) {
      const m = await readFile(mf.sha);
      const expire = (social?.market?.expireHours || 72) * 3600000;
      const keep = (m.list || []).filter((x) => !x.sold && now - x.at < expire);
      await putFile('data/market.json', { updatedAt: new Date().toISOString(), list: keep }, '[bot] 清理市场');
    }
  } catch (e) { console.log('市场清理跳过', e.message); }

  const d = new Date().toISOString().slice(0, 10);
  await putFile(`backups/${d}.json`, { at: new Date().toISOString(), count: players.length, players }, `[bot] 每日备份 ${d}`);
  console.log('✔ 完成');
})().catch((e) => { console.error('✘ 失败', e); process.exit(1); });
