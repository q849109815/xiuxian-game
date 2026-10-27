#!/usr/bin/env node
/**
 * 长期游玩 → 存档膨胀 测试
 * 老玩家玩几个月后，背包/日志/邮件/聊天/埋点会持续累积。
 * 风险：存档过大 → 写入失败（接口有体积上限）→ 玩家进度【永久存不上】。
 * 检查：
 *   1. 各列表是否有上限（防止无限膨胀）
 *   2. 塞满后存档体积多大
 *   3. 塞满后写入是否仍成功
 *   4. 塞满后读取/渲染是否变慢或崩
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n + (d ? ' :: ' + d : '')); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0, 140)));

  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_BLOAT');
    try { await window.MAIN.login('膨胀测试', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => {
    try { const m = document.getElementById('maintMask'); if (m) m.style.display = 'none'; } catch (e) {}
    try { if (window.UI) UI._maskQ = []; } catch (e) {}
  });

  console.log('\n=== 1 各列表上限声明检查 ===');
  const caps = await pg.evaluate(() => {
    const out = {};
    const src = (typeof E !== 'undefined' && E) ? E : {};
    // 找代码里的截断常量
    const names = ['LOG_MAX','MAIL_MAX','CHAT_MAX','BAG_MAX','TRACK_MAX','OPS_MAX','HISTORY_MAX','MAX_LOG','MAX_MAIL'];
    names.forEach(n => { if (src[n] !== undefined) out[n] = src[n]; });
    return out;
  });
  console.log('  引擎侧上限常量:', JSON.stringify(caps));

  console.log('\n=== 2 塞入大量数据 ===');
  const before = await pg.evaluate(() => {
    const p = (window.UI && UI.P) || window.P;
    if (!p) return null;
    return { keys: Object.keys(p).length, size: JSON.stringify(p).length };
  });
  console.log('  塞入前:', JSON.stringify(before));

  // 模拟长期游玩：塞满各类列表
  const filled = await pg.evaluate(() => {
    const p = (window.UI && UI.P) || window.P;
    if (!p) return 'no P';
    const mk = (n, fld) => {
      p[fld] = p[fld] || [];
      for (let i = 0; i < n; i++) {
        p[fld].push({ id: 'X' + i, t: Date.now(), msg: '历史记录条目内容测试' + i, v: i });
      }
    };
    // 常见会累积的字段
    ['log', 'logs', 'mail', 'mails', 'chat', 'chats', 'track', 'ops', 'history', 'records', 'bag'].forEach(f => {
      if (Array.isArray(p[f]) || p[f] === undefined) {
        try { mk(3000, f); } catch (e) {}
      }
    });
    // 背包：大量道具
    if (p.bag && typeof p.bag === 'object' && !Array.isArray(p.bag)) {
      for (let i = 0; i < 3000; i++) p.bag['item_' + i] = 5;
    }
    return { keys: Object.keys(p).length, size: JSON.stringify(p).length };
  });
  console.log('  塞入后:', JSON.stringify(filled));

  console.log('\n=== 3 触发一次清理/保存，看是否收敛 ===');
  const after = await pg.evaluate(async () => {
    const p = (window.UI && UI.P) || window.P;
    // 走一次引擎的规范化（sanitize 之类），看是否有截断
    try { if (typeof E !== 'undefined' && E.sanitize) E.sanitize(p); } catch (e) {}
    try { await window.MAIN.save(); } catch (e) { return { err: String(e).slice(0, 100) }; }
    return { keys: Object.keys(p).length, size: JSON.stringify(p).length };
  });
  await pg.waitForTimeout(4000);
  console.log('  保存后:', JSON.stringify(after));

  if (after && after.size) {
    const kb = after.size / 1024;
    console.log('  存档体积:', kb.toFixed(1), 'KB');
    if (kb < 1024) ok('3 存档体积可控', kb.toFixed(1) + 'KB');
    else if (kb < 5120) console.log('  -- 存档偏大但可接受: ' + kb.toFixed(1) + 'KB');
    else bad('3 存档过大', kb.toFixed(1) + 'KB');
  }

  console.log('\n=== 4 写入是否成功（重登核对）===');
  const goldMark = await pg.evaluate(() => {
    const p = (window.UI && UI.P) || window.P;
    p.__bloattag = 'MARK_' + Date.now();
    try { window.E.grant(p, { gold: 777 }); } catch (e) {}
    return p.gold;
  });
  await pg.evaluate(async () => { try { await window.MAIN.save(); } catch (e) {} });
  await pg.waitForTimeout(5000);
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_BLOAT');
    try { await window.MAIN.login('膨胀测试', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2500);
  const back = await pg.evaluate(() => {
    const p = (window.UI && UI.P) || window.P;
    return { gold: p && p.gold, tag: p && p.__bloattag, size: p ? JSON.stringify(p).length : 0 };
  });
  console.log('  重登后:', JSON.stringify(back), '（保存前 gold=' + goldMark + '）');
  if (back.gold === goldMark) ok('4 大存档仍能成功写入', 'gold=' + back.gold);
  else bad('4 大存档写入失败/回退', `期望 ${goldMark} 实际 ${back.gold}`);

  console.log('\n=== 5 大存档下界面是否崩 ===');
  const t0 = Date.now();
  const panelErr = [];
  for (const pn of ['bag', 'mail', 'set', 'role']) {
    const e0 = errs.length;
    const ms = await pg.evaluate(async (name) => {
      const s = Date.now();
      try { window.UI.open(name); } catch (e) {}
      return Date.now() - s;
    }, pn).catch(() => -1);
    await pg.waitForTimeout(500);
    const ne = errs.length - e0;
    console.log(`  ${pn}: ${ms}ms 新异常=${ne}`);
    if (ne > 0) panelErr.push(pn);
    await pg.evaluate(() => { try { window.UI.close && window.UI.close(); } catch (e) {} });
  }
  console.log('  总耗时', Date.now() - t0, 'ms');
  if (panelErr.length === 0) ok('5 大存档下界面正常', (Date.now() - t0) + 'ms');
  else bad('5 大存档下界面异常', panelErr.join(','));

  if (errs.length === 0) ok('6 全程无 JS 异常'); else bad('6 JS 异常', errs.slice(0, 3).join(' | '));

  console.log('\n===== 结果 =====');
  console.log(`PASS ${R.pass.length} / FAIL ${R.fail.length}`);
  R.fail.forEach(f => console.log('  FAIL: ' + f));
  await b.close();
  process.exit(R.fail.length ? 1 : 0);
})();
