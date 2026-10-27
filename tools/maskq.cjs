#!/usr/bin/env node
/**
 * 验证：全屏遮罩排队修复
 * 场景：新版本提示 + 公告 同时触发（登录流程的真实顺序）
 *   修复前：公告覆盖新版本 → 玩家永久错过更新
 *   修复后：先弹新版本 → 玩家关闭 → 再弹公告
 * 同时验证 stale 冲突弹窗（需先关掉公告遮罩）
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n + (d ? ' :: ' + d : '')); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };

const maskInfo = pg => pg.evaluate(() => {
  const b = document.getElementById('maintMask');
  if (!b || b.style.display !== 'flex') return null;
  const t = b.querySelector('.mt-t');
  return { title: t ? t.textContent : '', hasUp: !!b.querySelector('#upNow'), hasNt: !!b.querySelector('#ntOk') };
});

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
    localStorage.setItem('zb_uid', 'ZZ_MASK');
    try { await window.MAIN.login('遮罩排队', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2500);

  console.log('\n=== 准备：注入一条未读公告 ===');
  const injected = await pg.evaluate(() => {
    const p = (window.UI && UI.P) || window.P;
    if (!p) return 'no P';
    p.noticeRead = [];
    if (typeof EX === 'undefined') return 'no EX';
    EX.NOTICE = [{ id: 'N_TEST', kind: 'info', title: '测试公告标题', body: '测试公告正文', at: Date.now() }];
    return 'ok';
  });
  console.log('  注入结果:', injected);
  if (injected !== 'ok') { bad('准备失败', injected); await b.close(); process.exit(1); }

  console.log('\n=== 场景：新版本 + 公告 同时触发 ===');
  await pg.evaluate(() => {
    try { document.getElementById('maintMask').style.display = 'none'; } catch (e) {}
    try { UI._maskQ = []; } catch (e) {}
    try { UI.showUpdate('2027_TEST_VER'); } catch (e) {}
    try { UI.showNotice(); } catch (e) {}
  });
  await pg.waitForTimeout(600);
  const m1 = await maskInfo(pg);
  console.log('  第一个弹窗:', JSON.stringify(m1));
  if (m1 && m1.hasUp) ok('1 先显示「发现新版本」', m1.title);
  else bad('1 第一个不是新版本提示', JSON.stringify(m1));

  // 关闭第一个（点"稍后再说"），应接着弹公告
  await pg.click('#upLater');
  await pg.waitForTimeout(700);
  const m2 = await maskInfo(pg);
  console.log('  关闭后第二个:', JSON.stringify(m2));
  if (m2 && m2.hasNt) ok('2 关闭后接着弹出公告（未被吞掉）', m2.title);
  else bad('2 公告未弹出（仍被覆盖）', JSON.stringify(m2));

  // 关闭公告
  if (m2) { await pg.click('#ntOk'); await pg.waitForTimeout(600); }
  const m3 = await maskInfo(pg);
  if (!m3) ok('3 全部关闭后遮罩收起'); else bad('3 遮罩未收起', JSON.stringify(m3));

  console.log('\n=== 反向顺序：公告先、新版本后 ===');
  await pg.evaluate(() => {
    const p = (window.UI && UI.P) || window.P; if (p) p.noticeRead = [];
    try { document.getElementById('maintMask').style.display = 'none'; } catch (e) {}
    try { UI._maskQ = []; } catch (e) {}
    try { UI.showNotice(); } catch (e) {}
    try { UI.showUpdate('2027_TEST_VER2'); } catch (e) {}
  });
  await pg.waitForTimeout(600);
  const r1 = await maskInfo(pg);
  console.log('  第一个弹窗:', JSON.stringify(r1));
  if (r1 && r1.hasNt) ok('4 先显示公告', r1.title); else bad('4 反向顺序异常', JSON.stringify(r1));
  await pg.click('#ntOk');
  await pg.waitForTimeout(700);
  const r2 = await maskInfo(pg);
  console.log('  关闭后第二个:', JSON.stringify(r2));
  if (r2 && r2.hasUp) ok('5 关闭公告后接着弹新版本', r2.title);
  else bad('5 新版本未弹出', JSON.stringify(r2));
  if (r2) { await pg.click('#upLater'); await pg.waitForTimeout(500); }

  console.log('\n=== 回归：遮罩收起后不残留 ===');
  const fin = await maskInfo(pg);
  if (!fin) ok('6 无残留遮罩'); else bad('6 残留遮罩', JSON.stringify(fin));
  if (errs.length === 0) ok('7 无 JS 异常'); else bad('7 JS 异常', errs.slice(0, 3).join(' | '));

  console.log('\n===== 结果 =====');
  console.log(`PASS ${R.pass.length} / FAIL ${R.fail.length}`);
  R.fail.forEach(f => console.log('  FAIL: ' + f));
  await b.close();
  process.exit(R.fail.length ? 1 : 0);
})();
