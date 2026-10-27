#!/usr/bin/env node
/**
 * 存档接口异常场景测试（玩家真会撞到：CDN 能开页面，但 GitHub API 挂/慢）
 * 真实场景不是"完全断网"（那样页面都打不开），而是：
 *   页面正常加载 + 存档接口失败或超时
 * 场景：
 *   A 接口全失败 —— 能否读本地缓存进游戏，不卡死
 *   B 接口全失败 —— 花钱/领奖本地是否正确，保存是否进补传队列且不卡死
 *   C 接口恢复   —— 队列补传后数据是否一致（不回退 / 不重复发放）
 *   D 接口超时   —— 是否有超时保护，不无限等待
 *   E 接口返回脏数据（500 / 非 JSON / 空串）—— 是否崩
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n + (d ? ' :: ' + d : '')); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };

// 只拦远端存档接口，放行本地页面资源
const API = /api\.github\.com|raw\.githubusercontent|githubusercontent|gh-proxy|workers\.dev|vercel\.app|netlify/;

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0, 150)));
  pg.on('console', m => { if (m.type() === 'error') {
    const s = m.text().slice(0, 130);
    if (!/Failed to load|net::ERR|CORS|gh-proxy|Access to fetch/i.test(s)) errs.push('con:' + s);
  }});

  const login = async (uid, name) => {
    await pg.evaluate(async (a) => {
      localStorage.setItem('zb_uid', a.u);
      try { await window.MAIN.login(a.n, '男'); } catch (e) {}
    }, { u: uid, n: name });
    await pg.waitForTimeout(2500);
  };
  const P = () => pg.evaluate(() => {
    const t = (window.UI && UI.P) || window.P || {};
    return { gold: t.gold, dia: t.diamond, stam: t.stamina, lv: t.lv };
  });

  console.log('\n=== 准备：接口正常，建立账号 ===');
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  await login('ZZ_OFF01', '断网测试');
  const p0 = await P();
  console.log('  初始:', JSON.stringify(p0));
  if (p0.gold === null || p0.gold === undefined) bad('A0 未登录成功'); else ok('A0 登录成功');
  await pg.evaluate(async () => { try { await window.MAIN.save(); } catch (e) {} });
  await pg.waitForTimeout(3500);
  const saved = await P();
  console.log('  联网保存后:', JSON.stringify(saved));

  // ---------- A/B：接口全失败 ----------
  console.log('\n=== A/B 存档接口全部失败 ===');
  await pg.route('**/*', route => {
    const u = route.request().url();
    if (!API.test(u)) return route.continue();
    return route.abort('failed');
  });
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  const t0 = Date.now();
  await login('ZZ_OFF01', '断网测试');
  const loginMs = Date.now() - t0;
  const pA = await P();
  console.log('  接口挂时登录:', JSON.stringify(pA), loginMs + 'ms');
  if (pA.gold !== null && pA.gold !== undefined) ok('A1 接口挂时仍能进游戏（读缓存）', 'gold=' + pA.gold);
  else bad('A1 接口挂时进不去游戏');
  if (loginMs < 25000) ok('A2 登录不卡死', loginMs + 'ms'); else bad('A2 登录卡死', loginMs + 'ms');

  const before = pA;
  await pg.evaluate(() => {
    const t = (window.UI && UI.P) || window.P;
    try { window.E.grant(t, { gold: 500, diamond: 20 }); } catch (e) {}
  });
  await pg.waitForTimeout(400);
  const pB = await P();
  console.log('  接口挂时加币:', JSON.stringify(pB));
  if (pB.gold === before.gold + 500) ok('B1 接口挂时本地数据正确变更');
  else bad('B1 接口挂时本地数据异常', `${before.gold}->${pB.gold}`);

  const saveRes = await pg.evaluate(async () => {
    const s = Date.now();
    try { await window.MAIN.save(); return { ok: 1, ms: Date.now() - s }; }
    catch (e) { return { err: String(e).slice(0, 70), ms: Date.now() - s }; }
  });
  console.log('  接口挂时保存:', JSON.stringify(saveRes));
  if (saveRes.ms < 60000) ok('B2 保存不卡死', saveRes.ms + 'ms');
  else bad('B2 保存卡死', saveRes.ms + 'ms');

  const qLen = await pg.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /queue/i.test(k)) { try { return JSON.parse(localStorage.getItem(k) || '[]').length; } catch (e) { return -2; } }
    }
    return -1;
  });
  console.log('  补传队列长度:', qLen);
  if (qLen > 0) ok('B3 离线写入进入补传队列', 'len=' + qLen);
  else console.log('  -- B3 队列为空（可能直接写缓存，需看 C 是否一致）');

  // ---------- C：接口恢复 ----------
  console.log('\n=== C 接口恢复，检查补传 ===');
  await pg.unroute('**/*');
  await pg.waitForTimeout(800);
  await pg.evaluate(async () => { try { await window.MAIN.save(); } catch (e) {} });
  await pg.waitForTimeout(6000);
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  await login('ZZ_OFF01', '断网测试');
  const pC = await P();
  console.log('  恢复后重登:', JSON.stringify(pC), '（断网时应为', pB.gold, '）');
  if (pC.gold === pB.gold) ok('C1 恢复后数据一致（未回退/未重复发放）', 'gold=' + pC.gold);
  else bad('C1 恢复后数据不一致', `断网时${pB.gold} -> 重登${pC.gold}`);

  // ---------- D：接口超时 ----------
  console.log('\n=== D 接口超时（30s 才响应）===');
  await pg.route('**/*', async route => {
    const u = route.request().url();
    if (!API.test(u)) return route.continue();
    await new Promise(r => setTimeout(r, 40000));
    try { if (!route.request().isNavigationRequest()) await route.abort('failed'); } catch (e) {}
  });
  const slowRes = await pg.evaluate(async () => {
    const s = Date.now();
    try { await window.MAIN.save(); return { ok: 1, ms: Date.now() - s }; }
    catch (e) { return { err: String(e).slice(0, 60), ms: Date.now() - s }; }
  });
  console.log('  超时场景保存:', JSON.stringify(slowRes));
  if (slowRes.ms < 40000) ok('D1 有超时保护，不无限等待', slowRes.ms + 'ms');
  else bad('D1 无超时保护，卡死', slowRes.ms + 'ms');
  await pg.unroute('**/*');

  // ---------- E：接口返回脏数据 ----------
  console.log('\n=== E 接口返回脏数据 ===');
  for (const mode of ['500', 'notjson', 'empty']) {
    await pg.route('**/*', route => {
      const u = route.request().url();
      if (!API.test(u)) return route.continue();
      if (mode === '500') return route.fulfill({ status: 500, body: 'server error' });
      if (mode === 'notjson') return route.fulfill({ status: 200, body: '<html>not json</html>' });
      return route.fulfill({ status: 200, body: '' });
    });
    let e = 0;
    const before = errs.length;
    await pg.reload({ waitUntil: 'load' });
    await pg.waitForTimeout(1000);
    await login('ZZ_OFF01', '断网测试');
    const pE = await P();
    const newErr = errs.length - before;
    console.log(`  [${mode}] 数据=${JSON.stringify(pE)} 新增异常=${newErr}`);
    if (newErr === 0) ok(`E-${mode} 脏响应不崩`); else bad(`E-${mode} 脏响应导致异常`, errs.slice(before, before + 2).join(' | '));
    await pg.unroute('**/*');
  }

  console.log('\n=== JS 错误汇总 ===');
  if (errs.length === 0) ok('F1 全场景无 JS 异常');
  else { console.log('  ' + errs.slice(0, 6).join('\n  ')); bad('F1 存在 JS 异常', errs.length + ' 条'); }

  console.log('\n===== 结果 =====');
  console.log(`PASS ${R.pass.length} / FAIL ${R.fail.length}`);
  R.fail.forEach(f => console.log('  FAIL: ' + f));
  await b.close();
  process.exit(R.fail.length ? 1 : 0);
})();
