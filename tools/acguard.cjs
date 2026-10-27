#!/usr/bin/env node
/**
 * 运营部 O-03 商业化反作弊哨兵 · 专项验证
 * 背景：令牌在客户端（D-01 未部署 Worker 前），玩家可自改存档；
 *       排行榜/首充缺乏公信力。哨兵做【只记录、不阻断】的完整性检测。
 * 断言：
 *   A1 正常玩家不误伤（4 项全空）
 *   A2 钻石超理论上限 → TAMPER_DIAMOND
 *   A3 金币超理论上限 → TAMPER_GOLD
 *   A4 战力远高于等级理论上限 → TAMPER_POWER
 *   A5 存档时间戳倒退（改系统时间）→ TAMPER_CLOCK
 *   A6 每日至多上报一次（同日重复调用不再产生 flags）
 *   A7 命中后写入埋点 save_tamper，且存档 _bi 里有记录（后台汇总依赖）
 *   A8 事件表已登记 save_tamper（否则后台显示英文 id、优先级被兜底判 P2）
 * 变异验证：把 resetTasks 里的哨兵调用改成恒不执行 → 必须 FAIL
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
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_AC');
    try { await window.MAIN.login('哨兵测试', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2200);

  // A8：事件表登记
  const reg = await pg.evaluate(() => {
    const e = (window.EX && EX.TRACK_EVENTS || []).find((x) => x.id === 'save_tamper');
    return e ? { n: e.n, pr: e.pr } : null;
  });
  reg && reg.pr === 'P1' ? ok('A8 事件表已登记 save_tamper', JSON.stringify(reg))
                         : bad('A8 事件表已登记 save_tamper', JSON.stringify(reg));

  // A1~A7：在页面内直接构造玩家对象调用 integrityCheck
  const res = await pg.evaluate(() => {
    const E = window.E || (window.EX && window.EX.E);
    const mk = (over) => {
      const p = {
        uid: 'T', lv: 20, gold: 50000, diamond: 800, regDay: 20260101,
        lastOnline: Date.now(), _bi: [],
        tasks: { dailyDate: '', weeklyKey: '', dailyClaimed: [], dailyProg: {}, weeklyClaimed: [], weeklyProg: {} },
      };
      Object.assign(p, over || {});
      return p;
    };
    const out = {};
    const call = (p) => { try { return E.integrityCheck(p); } catch (e) { return ['ERR:' + e.message]; } };
    // 正常玩家
    out.normal = call(mk());
    // 钻石超限
    out.diamond = call(mk({ diamond: 9999999 }));
    // 金币超限
    out.gold = call(mk({ gold: 9e9 }));
    // 战力/等级不匹配：把 power 临时放大
    const pPow = mk({ lv: 5 });
    const origPower = E.power;
    E.power = () => 5e7;
    out.power = call(pPow);
    E.power = origPower;
    // 时钟倒退：lastOnline 远晚于当前
    out.clock = call(mk({ lastOnline: Date.now() + 10 * 864e5 }));
    // 每日至多一次：同一对象连续调用第二次
    const p2 = mk({ diamond: 9999999 });
    const f1 = call(p2); const f2 = call(p2);
    out.once = { f1: f1, f2: f2 };
    // 命中后是否写入埋点 + 存档 _bi
    const p3 = mk({ diamond: 9999999, _bi: [] });
    window.P = p3;
    try { window.OPS && OPS.clearTrack && OPS.clearTrack(); } catch (e) {}
    const f3 = call(p3);
    let buf = []; try { buf = JSON.parse(localStorage.getItem('z_track_buf') || '[]'); } catch (e) { buf = []; }
    out.track = { flags: f3, hasEv: buf.some((x) => x.ev === 'save_tamper'), bi: (p3._bi || []).map((x) => x.ev) };
    return out;
  });

  const has = (v, k) => Array.isArray(v) && v.indexOf(k) >= 0;
  // 注意：无异常时 integrityCheck 返回 null（不是空数组），两种都算「不误伤」
  (res.normal === null || (Array.isArray(res.normal) && res.normal.length === 0))
    ? ok('A1 正常玩家不误伤', 'flags=' + JSON.stringify(res.normal))
    : bad('A1 正常玩家不误伤', 'flags=' + JSON.stringify(res.normal));
  has(res.diamond, 'TAMPER_DIAMOND') ? ok('A2 钻石超限被抓', JSON.stringify(res.diamond)) : bad('A2 钻石超限被抓', JSON.stringify(res.diamond));
  has(res.gold, 'TAMPER_GOLD') ? ok('A3 金币超限被抓', JSON.stringify(res.gold)) : bad('A3 金币超限被抓', JSON.stringify(res.gold));
  has(res.power, 'TAMPER_POWER') ? ok('A4 战力虚高被抓', JSON.stringify(res.power)) : bad('A4 战力虚高被抓', JSON.stringify(res.power));
  has(res.clock, 'TAMPER_CLOCK') ? ok('A5 时钟倒退被抓', JSON.stringify(res.clock)) : bad('A5 时钟倒退被抓', JSON.stringify(res.clock));
  has(res.once.f1, 'TAMPER_DIAMOND') && (!Array.isArray(res.once.f2) || res.once.f2.length === 0)
    ? ok('A6 每日至多一次', '第一次=' + JSON.stringify(res.once.f1) + ' 第二次=' + JSON.stringify(res.once.f2))
    : bad('A6 每日至多一次', JSON.stringify(res.once));
  res.track.hasEv && res.track.bi.indexOf('save_tamper') >= 0
    ? ok('A7 命中写入埋点与存档', JSON.stringify(res.track))
    : bad('A7 命中写入埋点与存档', JSON.stringify(res.track));

  // A9：走【真实链路】resetTasks（不是直接调 integrityCheck）。
  // 这样"把调用包进 if(false)"这类改动才会被抓出来——只查源码里有没有这行字符串是抓不到的。
  const wired = await pg.evaluate(() => {
    const E = window.E || (window.EX && window.EX.E);
    const p = {
      uid: 'T2', lv: 20, gold: 50000, diamond: 9999999, regDay: 20260101,
      lastOnline: Date.now(), _bi: [],
      tasks: { dailyDate: '', weeklyKey: '', dailyClaimed: [], dailyProg: {}, weeklyClaimed: [], weeklyProg: {} },
    };
    try { E.resetTasks(p); } catch (e) { return { err: String(e).slice(0, 80) }; }
    return { flags: p._integFlags };
  });
  wired && Array.isArray(wired.flags) && wired.flags.indexOf('TAMPER_DIAMOND') >= 0
    ? ok('A9 真实链路 resetTasks 触发哨兵', JSON.stringify(wired))
    : bad('A9 真实链路 resetTasks 触发哨兵', JSON.stringify(wired));

  errs.length === 0 ? ok('A10 页面无 JS 报错') : bad('A10 页面无 JS 报错', errs.join(' | '));

  await b.close();
  console.log('\n=== O-03 反作弊哨兵 ===');
  console.log('PASS ' + R.pass.length + ' / FAIL ' + R.fail.length);
  process.exit(R.fail.length ? 1 : 0);
})().catch((e) => { console.log('运行异常: ' + String(e).slice(0, 200)); process.exit(1); });
