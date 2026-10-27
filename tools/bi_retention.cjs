#!/usr/bin/env node
/**
 * 运营部 O-01 专项：dau_retention 留存埋点验证
 * 背景：dau_retention 是 P0 留存事件，但全项目零调用 → 后台漏斗/留存永远取不到数。
 * 断言：
 *   B1 每日首次进入上报 1 条 dau_retention，含 d(注册第几天)/cont(连续天数)
 *   B2 同日重复触发不重复上报（防刷）
 *   B3 跨天触发再上报 1 条，且 cont 递增（连续登录）
 *   B4 断天触发时 cont 归 1
 *   B5 埋点同时写入存档 _bi（后台汇总依赖它，不只存 localStorage）
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_BI');
    try { await window.MAIN.login('埋点测试', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2200);

  const r = await pg.evaluate(() => {
    const out = {};
    const P = window.P, E = window.E;
    if (!P || !E) return { err: 'no P/E' };
    // 清空缓冲后重新触发每日重置
    localStorage.setItem('z_track_buf', '[]');
    P._dauDay = 0; P._dauCont = 0;
    P.regDay = P.regDay || 20261001;
    E.resetTasks(P);
    const a = window.OPS.trackBuf().filter((x) => x.ev === 'dau_retention');
    out.first = a.length; out.firstParam = a[0] ? a[0].p : null;

    // 同日再触发两次
    E.resetTasks(P); E.resetTasks(P);
    out.same = window.OPS.trackBuf().filter((x) => x.ev === 'dau_retention').length;

    // 连续第二天：把 _dauDay 设成昨天
    const dd = new Date(E.now() + 8 * 36e5);
    const todayNum = dd.getUTCFullYear() * 10000 + (dd.getUTCMonth() + 1) * 100 + dd.getUTCDate();
    const y = new Date(dd.getTime() - 864e5);
    const yNum = y.getUTCFullYear() * 10000 + (y.getUTCMonth() + 1) * 100 + y.getUTCDate();
    P._dauDay = yNum; P._dauCont = 2;
    E.resetTasks(P);
    const l = window.OPS.trackBuf().filter((x) => x.ev === 'dau_retention');
    out.next = l.length; out.cont = l.length ? l[l.length - 1].p.cont : -1;

    // 断天：_dauDay 设成 5 天前
    const y5 = new Date(dd.getTime() - 5 * 864e5);
    P._dauDay = y5.getUTCFullYear() * 10000 + (y5.getUTCMonth() + 1) * 100 + y5.getUTCDate();
    E.resetTasks(P);
    const l2 = window.OPS.trackBuf().filter((x) => x.ev === 'dau_retention');
    out.gap = l2.length; out.gapCont = l2.length ? l2[l2.length - 1].p.cont : -1;

    // 是否写入存档 _bi（后台汇总的唯一来源）
    out.bi = (P._bi || []).filter((x) => x.ev === 'dau_retention').length;
    out.biName = ((P._bi || []).find((x) => x.ev === 'dau_retention') || {}).n;
    return out;
  });

  if (r.err) { bad('B0 环境', r.err); }
  else {
    if (r.first === 1 && r.firstParam && r.firstParam.d >= 1) ok('B1 每日首次上报1条', JSON.stringify(r.firstParam));
    else bad('B1 每日首次上报', '条数=' + r.first + ' 参数=' + JSON.stringify(r.firstParam));
    if (r.same === 1) ok('B2 同日不重复上报', '仍为 1 条');
    else bad('B2 同日重复上报', '条数=' + r.same);
    if (r.next === 2 && r.cont === 3) ok('B3 跨天连续登录 cont 递增', 'cont=' + r.cont);
    else bad('B3 跨天连续', '条数=' + r.next + ' cont=' + r.cont);
    if (r.gap === 3 && r.gapCont === 1) ok('B4 断天归 1', 'cont=' + r.gapCont);
    else bad('B4 断天归1', '条数=' + r.gap + ' cont=' + r.gapCont);
    if (r.bi >= 1) ok('B5 写入存档 _bi（后台可汇总）', '条数=' + r.bi + ' 名称=' + r.biName);
    else bad('B5 未写入 _bi', '条数=' + r.bi);
  }
  if (errs.length) bad('B6 页面报错', errs.join(' | ')); else ok('B6 无报错');

  await b.close();
  console.log('\nPASS ' + R.pass.length + '  FAIL ' + R.fail.length);
  if (R.fail.length) process.exit(1);
  console.log('全绿');
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
