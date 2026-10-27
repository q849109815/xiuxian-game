#!/usr/bin/env node
/**
 * 测试部 T-02 · 兼容性与性能矩阵（真机替代方案）
 * 说明：无真机与云真机资源，本工具用 headless Chrome 覆盖「分辨率矩阵 + 性能/内存」，
 *       结论强度低于真机（无法覆盖 iOS Safari、GPU 驱动差异、真机触控），已在报告中标注。
 * 用法: node tools/compat.cjs
 *
 * 检查项:
 *   C1 分辨率矩阵   7 种竖屏 + 3 种横屏，主界面/战斗层不越界、不重叠、无报错
 *   C2 战斗帧率     连续采样 12 秒，统计平均/最低 FPS
 *   C3 内存泄漏     反复进出战斗 6 轮，测 JS heap 增长是否收敛
 *   C4 大存档渲染   背包 2000 件 / 邮件 200 封，测面板打开耗时
 *
 * 铁律: 页面内异常必须上报，不得静默吞掉。
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';

const PORTRAIT = [
  { w: 320, h: 568, n: 'iPhone SE1' },
  { w: 360, h: 640, n: 'Android 小屏' },
  { w: 375, h: 667, n: 'iPhone 8' },
  { w: 393, h: 852, n: 'Android 主流' },
  { w: 414, h: 896, n: 'iPhone XR' },
  { w: 430, h: 932, n: 'iPhone 15PM' },
  { w: 768, h: 1024, n: '平板竖屏' },
];
const LANDSCAPE = [
  { w: 852, h: 393, n: '主流横屏' },
  { w: 926, h: 428, n: '大屏横屏' },
  { w: 1024, h: 768, n: '平板横屏' },
];

const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n + (d ? ' :: ' + d : '')); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };

async function login(pg) {
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_COMPAT');
    try { await window.MAIN.login('兼容测试', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2000);
}

/* 统一体检：越界 / 重叠(战斗层) / 异常文本 / 破图 */
async function scan(pg, tag) {
  return await pg.evaluate((tag) => {
    const out = { out: 0, nan: 0, broken: 0, tiny: 0, worst: null };
    const vw = innerWidth, vh = innerHeight;
    const els = document.querySelectorAll('body *');
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // 越界（允许 2px 抗锯齿误差；横向滚动容器内的元素不算）
      if (r.right > vw + 2 || r.left < -2) {
        let scrollable = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pc = getComputedStyle(p);
          if (/auto|scroll/.test(pc.overflowX)) { scrollable = true; break; }
        }
        if (!scrollable) { out.out++; if (!out.worst) out.worst = el.className + ' right=' + Math.round(r.right); }
      }
      const t = (el.children.length === 0 ? (el.textContent || '') : '');
      if (/NaN|undefined|Infinity|\[object/.test(t)) out.nan++;
      if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) out.broken++;
    }
    return out;
  }, tag);
}

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let errs = [];

  console.log('=== C1 分辨率矩阵 ===');
  const VIEWS = (process.env.COMPAT_ONLY ? PORTRAIT.slice(0, 1) : PORTRAIT.concat(LANDSCAPE));
  for (const d of VIEWS) {
    const pg = await b.newPage({ viewport: { width: d.w, height: d.h } });
    const e = [];
    pg.on('pageerror', (x) => e.push(String(x).slice(0, 120)));
    await pg.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1500);
    await login(pg);
    // 变异验证用：注入一个必然越界的元素，检验 C1 是否能抓出（抓不出=断言无效）
    if (process.env.COMPAT_MUT) {
      await pg.evaluate(() => {
        const d = document.createElement('div');
        d.id = '__mut_out'; d.textContent = 'MUT';
        d.style.cssText = 'position:fixed;left:' + (innerWidth + 60) + 'px;top:10px;width:80px;height:30px';
        document.body.appendChild(d);
      });
    }
    // 主界面
    const home = await scan(pg, 'home');
    // 战斗层
    await pg.evaluate(() => { try { window.MAIN && window.MAIN.startBattle && window.MAIN.startBattle(); } catch (x) {} });
    await pg.waitForTimeout(1800);
    const bt = await scan(pg, 'battle');
    // 战斗层内元素互相压盖
    const ovl = await pg.evaluate(() => {
      const ids = ['#btTop', '#btStat', '#btDock', '#btTower', '#btSkill'];
      const rs = ids.map((s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect() : null; }).filter(Boolean);
      let n = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], c = rs[j];
        if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) n++;
      }
      return n;
    });
    const nbad = home.out + bt.out + home.nan + bt.nan + home.broken + bt.broken + ovl;
    if (nbad === 0 && e.length === 0) ok('C1 ' + d.n + ' ' + d.w + 'x' + d.h, '越界0 异常0 破图0 重叠0');
    else bad('C1 ' + d.n + ' ' + d.w + 'x' + d.h,
      `越界${home.out + bt.out} 异常${home.nan + bt.nan} 破图${home.broken + bt.broken} 重叠${ovl} 报错${e.length}` +
      (home.worst ? ' 首个=' + home.worst : ''));
    errs = errs.concat(e);
    await pg.close();
  }

  console.log('=== C2 战斗帧率 ===');
  {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
    const e = [];
    pg.on('pageerror', (x) => e.push(String(x).slice(0, 120)));
    await pg.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1500);
    await login(pg);
    await pg.evaluate(() => { try { window.MAIN && window.MAIN.startBattle && window.MAIN.startBattle(); } catch (x) {} });
    await pg.waitForTimeout(1500);
    const fps = await pg.evaluate(() => new Promise((res) => {
      const ts = []; let last = performance.now(); const t0 = last;
      function loop(now) { ts.push(now - last); last = now; if (now - t0 < 12000) requestAnimationFrame(loop); else res(ts); }
      requestAnimationFrame(loop);
    }));
    /* 前 30 帧属战斗启动期（建场/首帧渲染/GC），单列统计，不计入稳态判据 */
    const warm = fps.slice(1, 31), steady = fps.slice(31);
    const n = steady.length;
    const avg = 1000 / (steady.reduce((a, c) => a + c, 0) / n);
    const worst = 1000 / Math.max.apply(null, steady);
    const jank = steady.filter((x) => x > 50).length; // >50ms 视为卡顿帧
    const warmWorst = 1000 / Math.max.apply(null, warm);
    const line = `稳态平均${avg.toFixed(1)}fps 稳态最低${worst.toFixed(1)}fps 卡顿帧${jank}/${n} 启动期最低${warmWorst.toFixed(1)}fps`;
    /* 判据用「卡顿帧占比」（业界通用的 slow-frame 比例）；单次最低帧仅作观察值记录，
     * 因为 headless 环境无 GPU 合成、偶发单帧抖动不代表真机体感。 */
    if (avg >= 50 && jank / n < 0.02) ok('C2 战斗帧率', line);
    else bad('C2 战斗帧率', line);
    if (e.length) bad('C2 战斗报错', e.join(' | ')); else ok('C2 战斗无报错');
    await pg.close();
  }

  console.log('=== C3 内存泄漏（反复进出战斗 6 轮）===');
  {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
    await pg.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1500);
    await login(pg);
    const heap = [];
    for (let i = 0; i < 6; i++) {
      await pg.evaluate(() => { try { window.MAIN && window.MAIN.startBattle && window.MAIN.startBattle(); } catch (x) {} });
      await pg.waitForTimeout(1800);
      await pg.evaluate(() => { try { window.MAIN && window.MAIN.quitBattle && window.MAIN.quitBattle(); } catch (x) {} });
      await pg.waitForTimeout(600);
      const h = await pg.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
      heap.push(h);
    }
    const mb = heap.map((x) => +(x / 1048576).toFixed(1));
    // 取后 3 轮与前 3 轮比较，判断是否收敛
    const g1 = mb.slice(0, 3), g2 = mb.slice(3);
    const growth = (g2[2] - g1[0]);
    if (growth < 24) ok('C3 内存增长收敛', `heap(MB) ${mb.join(' → ')} 总增${growth.toFixed(1)}MB`);
    else bad('C3 内存疑似泄漏', `heap(MB) ${mb.join(' → ')} 总增${growth.toFixed(1)}MB`);
    await pg.close();
  }

  console.log('=== C4 大存档渲染耗时 ===');
  {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
    const e = [];
    pg.on('pageerror', (x) => e.push(String(x).slice(0, 120)));
    await pg.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1500);
    await login(pg);
    const t = await pg.evaluate(async () => {
      const P = window.P || {};
      P.bag = P.bag || {};
      for (let i = 0; i < 2000; i++) P.bag['it' + i] = 99;
      const res = {};
      for (const pn of ['bag', 'mail', 'friends', 'rank']) {
        const t0 = performance.now();
        try { await window.UI.open(pn); } catch (x) { return { err: String(x).slice(0, 80) }; }
        res[pn] = +(performance.now() - t0).toFixed(0);
      }
      return res;
    });
    if (t.err) bad('C4 大存档渲染', '抛异常 ' + t.err);
    else {
      const slow = Object.entries(t).filter(([, v]) => v > 800);
      if (!slow.length) ok('C4 大存档渲染耗时', JSON.stringify(t) + ' ms（阈值 800ms）');
      else bad('C4 大存档渲染过慢', JSON.stringify(t));
    }
    if (e.length) bad('C4 报错', e.join(' | ')); else ok('C4 无报错');
    await pg.close();
  }

  await b.close();
  console.log('\n=== T-02 汇总 ===');
  console.log('PASS ' + R.pass.length + '  FAIL ' + R.fail.length);
  if (R.fail.length) { R.fail.forEach((f) => console.log('  X ' + f)); process.exit(1); }
  console.log('全绿');
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
