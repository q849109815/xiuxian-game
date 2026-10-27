#!/usr/bin/env node
/* 探针：武器强化 / 天赋 / 建筑 升级后战力是否真的上涨 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  await pg.goto('http://127.0.0.1:8951/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_UP');
    try { await window.MAIN.login('强化测试', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2000);
  const r = await pg.evaluate(() => {
    const out = {};
    if (!window.P) return { err: 'no P' };
    P.gold = (P.gold || 0) + 5000000;
    // 天赋点给足
    P.tp = (P.tp || 0) + 50;
    out.p0 = E.power(P);

    // 武器
    const gid = P.gun || 'W01';
    out.gid = gid;
    out.cost = JSON.stringify(E.gunUpgradeCost ? E.gunUpgradeCost(P, gid) : null).slice(0, 80);
    try { out.up = JSON.stringify(E.upgradeGun(P, gid)).slice(0, 150); }
    catch (e) { out.up = 'EX ' + e.message; }
    out.p1 = E.power(P);
    out.wl = JSON.stringify(P.weaponLv || {}).slice(0, 60);

    // 天赋：找一个可点的
    const tIds = (window.EX && EX.talents) ? Object.keys(EX.talents) : [];
    out.tIds = tIds.slice(0, 5);
    let tal = null, tid = null;
    for (const t of tIds) {
      try { const rr = E.upTalent(P, t); if (rr && rr.ok) { tal = rr; tid = t; break; } if (!tal) tal = rr; } catch (e) {}
    }
    out.tid = tid; out.tal = JSON.stringify(tal).slice(0, 140);
    out.p2 = E.power(P);

    // 建筑
    out.bd = JSON.stringify(E.upBuild(P, 'hospital')).slice(0, 140);
    out.p3 = E.power(P);

    // 升星
    out.st = JSON.stringify(E.starUp(P, Object.keys(P.charStar || {})[0] || 'C1')).slice(0, 140);
    out.p4 = E.power(P);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => console.log('FATAL', e.message));
