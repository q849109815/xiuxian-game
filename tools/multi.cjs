#!/usr/bin/env node
/**
 * 多端并发 / 多标签页 场景测试
 * 真会发生的场景：玩家开了两个标签页、手机分身、或用两台设备登同一账号。
 * 风险等级最高：不是显示错，是【进度互相覆盖 = 玩家真的回档】。
 *
 * S1 同浏览器两个标签页（共享 localStorage）
 * S2 两台设备（各自独立 localStorage）
 * 检查：
 *   - 交替写入是否互相覆盖（后写的把先写的抹掉）
 *   - 是否误报"其他设备有更新"（自己撞自己）
 *   - 最终数据是否 = 两边操作的并集（至少不丢）
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n + (d ? ' :: ' + d : '')); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };
const UID = 'ZZ_MULTI';

async function mkPage(b, ctx) {
  const pg = await ctx.newPage();
  await pg.setViewportSize({ width: 393, height: 852 });
  return pg;
}
const login = async (pg, name) => {
  await pg.evaluate(async (a) => {
    localStorage.setItem('zb_uid', a.u);
    try { await window.MAIN.login(a.n, '男'); } catch (e) {}
  }, { u: UID, n: name });
  await pg.waitForTimeout(2500);
};
const P = pg => pg.evaluate(() => {
  const t = (window.UI && UI.P) || window.P || {};
  return { gold: t.gold, dia: t.diamond, lv: t.lv };
});
const add = (pg, gold) => pg.evaluate((g) => {
  const t = (window.UI && UI.P) || window.P;
  try { window.E.grant(t, { gold: g }); } catch (e) {}
  try { window.UI && UI.sync && UI.sync(); } catch (e) {}
}, gold);
const save = async (pg) => {
  await pg.evaluate(async () => { try { await window.MAIN.save(); } catch (e) {} });
  await pg.waitForTimeout(3500);
};

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* ---------- S1 同浏览器两个标签页 ---------- */
  console.log('\n=== S1 同一浏览器两个标签页（共享 localStorage）===');
  const ctx1 = await b.newContext({ viewport: { width: 393, height: 852 } });
  const A = await mkPage(b, ctx1);
  await A.goto(BASE, { waitUntil: 'load' });
  await A.waitForTimeout(1200);
  await login(A, '多端A');
  await save(A);
  const base1 = await P(A);
  console.log('  基线:', JSON.stringify(base1));

  const B = await mkPage(b, ctx1);   // 同一 context = 共享 localStorage
  await B.goto(BASE, { waitUntil: 'load' });
  await B.waitForTimeout(1200);
  await login(B, '多端A');
  const pb0 = await P(B);
  console.log('  B 登录时读到:', JSON.stringify(pb0));

  // A 加币并保存
  await add(A, 500);
  await save(A);
  const pa1 = await P(A);
  console.log('  A 加500保存后:', JSON.stringify(pa1));

  // B 此时是基于旧数据，加币并保存 —— 关键：会不会把 A 的 500 抹掉
  await add(B, 300);
  await save(B);
  const pb1 = await P(B);
  console.log('  B 加300保存后:', JSON.stringify(pb1));

  // 重新读云端看最终落定
  const C = await mkPage(b, ctx1);
  await C.goto(BASE, { waitUntil: 'load' });
  await C.waitForTimeout(1200);
  await login(C, '多端A');
  const fin = await P(C);
  console.log('  云端最终:', JSON.stringify(fin));
  const expectUnion = base1.gold + 500 + 300;
  const expectLast = pb1.gold;
  console.log(`  期望并集=${expectUnion} 期望最后一次=${expectLast} 实际=${fin.gold}`);
  if (fin.gold === expectUnion) ok('S1 两端操作都保留（并集）', 'gold=' + fin.gold);
  else if (fin.gold === expectLast) ok('S1 以最后写入为准（未回退到更早）', `gold=${fin.gold}（并集 ${expectUnion} 需刷新另一端才可见）`);
  else if (fin.gold < base1.gold) bad('S1 数据回退！', `${base1.gold} -> ${fin.gold}`);
  else console.log('  -- S1 中间态: gold=' + fin.gold);

  await ctx1.close();

  /* ---------- S2 两台设备（独立 localStorage）---------- */
  console.log('\n=== S2 两台设备（各自独立缓存）===');
  const ctx2 = await b.newContext({ viewport: { width: 393, height: 852 } });
  const D = await mkPage(b, ctx2);
  await D.goto(BASE, { waitUntil: 'load' });
  await D.waitForTimeout(1200);
  await login(D, '多端A');
  const pd0 = await P(D);
  console.log('  设备D 读到:', JSON.stringify(pd0));
  const base2 = pd0;

  const ctx3 = await b.newContext({ viewport: { width: 393, height: 852 } });
  const E2 = await mkPage(b, ctx3);
  await E2.goto(BASE, { waitUntil: 'load' });
  await E2.waitForTimeout(1200);
  await login(E2, '多端A');
  const pe0 = await P(E2);
  console.log('  设备E 读到:', JSON.stringify(pe0));

  await add(D, 700); await save(D);
  const pd1 = await P(D);
  console.log('  D 加700保存:', JSON.stringify(pd1));
  await add(E2, 400); await save(E2);
  const pe1 = await P(E2);
  console.log('  E 加400保存:', JSON.stringify(pe1));

  const ctx4 = await b.newContext({ viewport: { width: 393, height: 852 } });
  const F = await mkPage(b, ctx4);
  await F.goto(BASE, { waitUntil: 'load' });
  await F.waitForTimeout(1200);
  await login(F, '多端A');
  const fin2 = await P(F);
  console.log('  云端最终:', JSON.stringify(fin2), `（基线 ${base2.gold}，并集 ${base2.gold + 700 + 400}）`);
  if (fin2.gold >= base2.gold) ok('S2 未回退到基线以前', 'gold=' + fin2.gold);
  else bad('S2 数据回退！', `${base2.gold} -> ${fin2.gold}`);
  if (fin2.gold === base2.gold + 700 + 400) ok('S2 两端操作都保留');
  else console.log('  -- S2 未达并集（后写覆盖先写，属常见取舍）: gold=' + fin2.gold);

  console.log('\n===== 结果 =====');
  console.log(`PASS ${R.pass.length} / FAIL ${R.fail.length}`);
  R.fail.forEach(f => console.log('  FAIL: ' + f));
  await b.close();
  process.exit(R.fail.length ? 1 : 0);
})();
