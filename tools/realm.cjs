#!/usr/bin/env node
/**
 * V1.1.0 修仙军衔系统 · 专项验证
 * 用法: node tools/realm.cjs
 *
 * 铁律（与 gate.cjs 同）：
 *   1. 页面内异常必须上报，不得 try{}catch 静默吞掉。
 *   2. 每条断言都要能被变异测试证伪（抓不住注入缺陷的断言等于不存在）。
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };
/* 内置静态服务：不依赖外部服务器，避免测试环境差异导致"跑不起来"被误判成缺陷 */
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    /* 必须禁用缓存：否则浏览器复用上一轮的 js，变异测试会假通过
     * （实测 ATK_PER 改成 0 之后断言仍全绿，就是这个原因）。 */
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate' });
    res.end(d);
  });
});
const BASE = 'http://127.0.0.1:8961/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => R.pass.push(n + (d ? ' :: ' + d : ''));
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); };
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6);

async function ev(pg, fn, arg) {
  try { return { v: await pg.evaluate(fn, arg), err: null }; }
  catch (e) { return { v: null, err: String(e).split('\n')[0].slice(0, 200) }; }
}

function skip(reason) {
  console.log('[REALM] SKIP —— ' + reason);
  console.log('RESULT: PASS=0 FAIL=0 SKIP=1');
  process.exit(0);
}

(async () => {
  /* 端口占用：复用已存在的服务器，不要崩。
   * 崩溃时体检工具只看到堆栈，无法区分"断言失败"和"环境没准备好"。 */
  await new Promise((res) => {
    srv.on('error', (e) => { if (e && e.code === 'EADDRINUSE') res(); else throw e; });
    srv.listen(8961, '127.0.0.1', () => res());
  });
  let b = null, launchErr = null;
  for (let i = 0; i < 2 && !b; i++) {
    try {
      b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    } catch (e) { launchErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  if (!b) { try { srv.close(); } catch (_) {} skip('浏览器不可用（已重试1次）：' + (launchErr && launchErr.message)); }
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  const errs = [];
  pg.on('pageerror', e => { const s = String(e).split('\n')[0].slice(0, 160); if (!/Failed to load resource|net::ERR/i.test(s)) errs.push(s); });
  await pg.addInitScript(() => { window.confirm = () => false; window.alert = () => {}; });
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  const lg = await ev(pg, async () => {
    localStorage.setItem('zb_uid', 'ZZ_REALM');
    await window.MAIN.login('军衔审查', '男');
    return !!(window.P && window.UI && window.E);
  });
  if (lg.err || !lg.v) { bad('登录失败', lg.err || ''); await b.close(); process.exit(1); }
  await pg.waitForTimeout(1500);

  /* R1 面板可打开且内容非空 */
  const o = await ev(pg, () => { UI.open('realm'); return true; });
  if (o.err) bad('R1 面板抛异常', o.err);
  await pg.waitForTimeout(400);
  const r1 = await ev(pg, () => {
    const root = document.getElementById('pnBody');
    const t = (root && root.innerText || '').trim();
    return { len: t.length, hasNaN: /NaN|undefined|\[object Object\]|Infinity/.test(t), txt: t.slice(0, 80) };
  });
  if (r1.err) bad('R1 读取异常', r1.err);
  else if (r1.v.len < 20) bad('R1 面板内容过少', r1.v.txt);
  else if (r1.v.hasNaN) bad('R1 面板含异常文本', r1.v.txt);
  else ok('R1 面板渲染', 'len=' + r1.v.len);

  /* R2 加成口径：每层 +1.5% 攻击 / +1.2% 生命 / 每 5 层 +0.5% 暴击 */
  const r2 = await ev(pg, () => {
    const snap = P.realm;
    const out = {};
    [0, 5, 10, 25, 50].forEach((n) => {
      P.realm = n;
      const b = E.realmBonus(P);
      out[n] = { a: b.atkPct, h: b.hpPct, c: b.crit };
    });
    P.realm = snap;
    return out;
  });
  if (r2.err) bad('R2 异常', r2.err);
  else {
    const e = r2.v;
    const chk = [
      ['0层', near(e['0'].a, 0) && near(e['0'].h, 0) && near(e['0'].c, 0)],
      ['5层', near(e['5'].a, 0.075) && near(e['5'].h, 0.06) && near(e['5'].c, 0.005)],
      ['10层', near(e['10'].a, 0.15) && near(e['10'].h, 0.12) && near(e['10'].c, 0.01)],
      ['25层', near(e['25'].a, 0.375) && near(e['25'].h, 0.3) && near(e['25'].c, 0.025)],
      ['50层', near(e['50'].a, 0.75) && near(e['50'].h, 0.6) && near(e['50'].c, 0.05)],
    ];
    chk.forEach(([n, v]) => (v ? ok('R2 ' + n + '口径') : bad('R2 ' + n + '口径不符', JSON.stringify(e))));
  }

  /* R3 晋升扣费正确 */
  const r3 = await ev(pg, () => {
    P.realm = 0; P.spirit = 100000;
    const c1 = E.realmCost(1);
    const before = P.spirit;
    const r = E.realmUp(P);
    return { c1, ok: r.ok, layer: P.realm, spent: before - P.spirit, cost: r.cost };
  });
  if (r3.err) bad('R3 异常', r3.err);
  else if (!r3.v.ok || r3.v.layer !== 1 || r3.v.spent !== r3.v.cost) bad('R3 晋升扣费不符', JSON.stringify(r3.v));
  else ok('R3 晋升扣费', 'layer=1 cost=' + r3.v.cost);

  /* R4 军功不足不得晋升（不许扣钱、不许加层） */
  const r4 = await ev(pg, () => {
    P.realm = 3; P.spirit = 1;
    const r = E.realmUp(P);
    return { ok: r.ok, layer: P.realm, spirit: P.spirit, reason: r.reason };
  });
  if (r4.err) bad('R4 异常', r4.err);
  else if (r4.v.ok || r4.v.layer !== 3 || r4.v.spirit !== 1) bad('R4 军功不足仍晋升', JSON.stringify(r4.v));
  else ok('R4 军功不足拦截', 'reason=' + r4.v.reason);

  /* R5 满阶封顶 */
  const r5 = await ev(pg, () => {
    P.realm = 50; P.spirit = 999999;
    const r = E.realmUp(P);
    return { ok: r.ok, layer: P.realm, reason: r.reason };
  });
  if (r5.err) bad('R5 异常', r5.err);
  else if (r5.v.ok || r5.v.layer !== 50) bad('R5 满阶未封顶', JSON.stringify(r5.v));
  else ok('R5 满阶封顶');

  /* R6 脏档钳制：realm/spirit 被写成脏值时不得污染属性链 */
  const r6 = await ev(pg, () => {
    const res = [];
    ['abc', NaN, -5, 999, {}, Infinity, null].forEach((v) => {
      P.realm = v;
      const b = E.realmBonus(P);
      const a = E.attrs(P);
      res.push({ v: String(v), a: b.atkPct, atk: a.atk, pw: E.power(P) });
    });
    P.realm = 0;
    return res;
  });
  if (r6.err) bad('R6 异常', r6.err);
  else {
    const allNum = r6.v.every((x) => isFinite(x.a) && isFinite(x.atk) && isFinite(x.pw));
    const inRange = r6.v.every((x) => x.a >= 0 && x.a <= 0.7500001);
    if (!allNum) bad('R6 脏档产生 NaN/Infinity', JSON.stringify(r6.v));
    else if (!inRange) bad('R6 脏档加成越界', JSON.stringify(r6.v));
    else ok('R6 脏档钳制', r6.v.length + ' 组');
  }

  /* R7 属性真实生效。
   * 【断言修正】此前写的是 `a50/a0 落在 1.7~1.78`（按 1+50×ATK_PER=1.75 推定），
   * 这是错的：军衔加成与其它加成（天赋/建筑/芯片/装备）在【同一个加法池】里，
   *   a0  = base × (1 + X)
   *   a50 = base × (1 + X + 0.75)
   * 比值 = (1+X+0.75)/(1+X) < 1.75，X 越大比值越小。
   * 实测 X≈0.11 → 比值 1.6757，代码是对的，是断言把乘法当成了加法。
   * 改成两条不会被稀释干扰的判据：
   *   ① realmBonus(50).atkPct 必须等于 ATK_PER × MAX_LAYER（口径对）
   *   ② 线性：25 层的增量必须是 50 层增量的一半（真正证明"每层都生效"） */
  const r7 = await ev(pg, () => {
    const MAX = EX.REALM.MAX_LAYER, PER = EX.REALM.ATK_PER;
    P.realm = 0; const a0 = E.attrs(P).atk;
    P.realm = 25; const a25 = E.attrs(P).atk;
    P.realm = MAX; const a50 = E.attrs(P).atk;
    /* 【断言修正】b 必须在【满层】时取。
     * 原写法先把 P.realm 复位成 0 再取 realmBonus(P) —— 0 层的加成本来就是 0，
     * 于是 got 恒为 0、与 want=0.75 永远不等，守卫长期误报 FAIL。
     * 产品代码（engine.realmBonus）是对的，是断言的取样顺序错了。
     * V1.3.5 发布后自查发现。 */
    const b = E.realmBonus(P);
    P.realm = 0;
    return { a0, a25, a50, want: PER * MAX, got: b.atkPct,
             lin: (a50 - a0) === 0 ? 0 : (a25 - a0) / (a50 - a0) };
  });
  if (r7.err) bad('R7 异常', r7.err);
  else {
    if (!near(r7.v.got, r7.v.want, 1e-9)) bad('R7 加成口径', r7.v.got + ' ≠ ' + r7.v.want);
    else ok('R7 加成口径', 'atkPct=' + r7.v.got);
    if (!(r7.v.a50 > r7.v.a25 && r7.v.a25 > r7.v.a0)) bad('R7 属性未生效', [r7.v.a0, r7.v.a25, r7.v.a50].join('/'));
    else ok('R7 属性递增', [r7.v.a0, r7.v.a25, r7.v.a50].map((x) => x.toFixed(1)).join(' → '));
    /* 线性：0.5 ± 0.02 */
    if (!(r7.v.lin > 0.48 && r7.v.lin < 0.52)) bad('R7 非线性', 'lin=' + r7.v.lin.toFixed(4));
    else ok('R7 线性生效', '25层增量占比=' + r7.v.lin.toFixed(3));
  }

  /* R8 通关产出军功 */
  const r8 = await ev(pg, () => {
    P.spirit = 0;
    const before = P.spirit;
    const r = E.clearLevel(P, '1-1', 1, 'normal');
    return { before, after: P.spirit, gain: r && r.spirit };
  });
  if (r8.err) bad('R8 异常', r8.err);
  else if (!(r8.v.after > r8.v.before)) bad('R8 通关不发军功', JSON.stringify(r8.v));
  else ok('R8 通关产出军功', '+' + r8.v.gain);

  /* R9 界面晋升按钮：足量军功时可点且点击后层数 +1 */
  const r9 = await ev(pg, async () => {
    P.realm = 0; P.spirit = 100000;
    UI.open('realm');
    await new Promise((s) => setTimeout(s, 120));
    const btn = document.querySelector('#pnBody .rl-up');
    if (!btn) return { found: false };
    const dis = btn.disabled;
    btn.click();
    await new Promise((s) => setTimeout(s, 260));
    return { found: true, dis, layer: P.realm };
  });
  if (r9.err) bad('R9 异常', r9.err);
  else if (!r9.v.found) bad('R9 未找到晋升按钮');
  else if (r9.v.dis) bad('R9 军功充足按钮仍禁用');
  else if (r9.v.layer !== 1) bad('R9 点击后未晋升', 'layer=' + r9.v.layer);
  else ok('R9 界面晋升可用', 'layer=' + r9.v.layer);

  /* R10 全流程无页面异常 */
  if (errs.length) bad('R10 页面异常', errs.slice(0, 3).join(' | '));
  else ok('R10 无页面异常');

  await b.close();
  srv.close();
  console.log('\n=== 军衔系统专项: PASS ' + R.pass.length + ' / FAIL ' + R.fail.length + ' ===');
  R.pass.forEach((p) => console.log('  √ ' + p));
  process.exit(R.fail.length ? 1 : 0);
})();
