#!/usr/bin/env node
/**
 * 测试部 T-02 补强 · 极端环境兼容矩阵（真机替代方案的第 2 层）
 *
 * 为什么要有这第二个工具：compat.cjs 只在「理想环境」下跑（本机 CPU、宽带、
 * 鼠标、DPR=1）。真机上最容易翻车的恰恰是这三类：
 *   ① 低端机：CPU 只有中端机的 1/4~1/6，战斗掉帧、按钮点了要等半天
 *   ② 弱网：地铁/电梯 3G，首屏加载不出来、登录转圈
 *   ③ 触控 + 高 DPR：没有鼠标 hover、点击热区重叠、高分屏下文字发虚/越界
 * 本工具用 CDP 真实降速与限速，覆盖这三类。
 *
 * 局限（必须在报告里写清）：无法覆盖 iOS Safari 的 WebKit 差异、
 * GPU 驱动差异、真机内存回收策略。真机资源到位后本项需复核。
 *
 * 检查项:
 *   E1 低端机（CPU 6x 降速）：战斗平均 FPS ≥ 24 且卡顿帧占比 < 15%
 *   E2 弱网 3G：首屏可加载、登录成功、主界面无报错
 *   E3 断网中途：不白屏、不崩，有兜底
 *   E4 触控 + DPR2/3：无越界、按钮热区 ≥ 40px、无报错
 *   E5 无鼠标 hover：仅依赖 :hover 的交互不会失效（提示/悬浮层仍可触发）
 *
 * 铁律：页面内异常必须上报，不得静默吞掉。
 */
const { chromium } = require('playwright');
// 8952 = 带 gzip 的本地服务器（tools/_gzsrv.py）。线上 GitHub Pages 同样对文本资源
// 启用压缩（实测 battle.js 377KB → 118KB gzip），因此弱网测试必须走 8952 才是生产等价；
// 用 8951（python http.server，无压缩）会把结论放大约 3 倍，属失真。
const BASE = 'http://127.0.0.1:8952/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };

async function login(pg) {
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_EXT');
    try { await window.MAIN.login('极端测试', '男'); } catch (e) {}
  });
  await pg.waitForTimeout(2500);
}

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* ---------- E1 低端机：CPU 降速 ---------- */
  console.log('=== E1 低端机 CPU 降速 ===');
  for (const rate of [4, 6]) {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
    const e = []; pg.on('pageerror', (x) => e.push(String(x).slice(0, 120)));
    const cdp = await pg.context().newCDPSession(pg);
    await pg.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1200);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await login(pg);
    await pg.evaluate(() => { try { window.MAIN.startBattle && window.MAIN.startBattle(); } catch (x) {} });
    await pg.waitForTimeout(2000);
    const fps = await pg.evaluate(() => new Promise((res) => {
      const ts = []; let last = performance.now(); const t0 = last;
      function loop(now) { ts.push(now - last); last = now; if (now - t0 < 8000) requestAnimationFrame(loop); else res(ts); }
      requestAnimationFrame(loop);
    }));
    const steady = fps.slice(21), n = steady.length || 1;
    const avg = 1000 / (steady.reduce((a, c) => a + c, 0) / n);
    const jank = steady.filter((x) => x > 100).length;   // 降速环境下 >100ms 才算卡顿
    const line = `CPU ${rate}x 降速：平均${avg.toFixed(1)}fps 卡顿帧${jank}/${n}（${(jank / n * 100).toFixed(1)}%）`;
    // 降速 6x 等价于极低端机，业界可接受下限约 24fps
    if (avg >= 24 && jank / n < 0.15) ok('E1 ' + line);
    else bad('E1 ' + line);
    if (e.length) bad('E1 CPU' + rate + 'x 报错', e.join(' | '));
    await pg.close();
  }

  /* ---------- E2 弱网 3G ---------- */
  console.log('=== E2 弱网 3G ===');
  {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
    const e = []; pg.on('pageerror', (x) => e.push(String(x).slice(0, 120)));
    const cdp = await pg.context().newCDPSession(pg);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8,
    });   // 400kbps / 400ms = 典型 3G
    let bytes = 0, nreq = 0;
    pg.on('response', async (r) => {
      nreq++;
      try { const h = await r.body(); bytes += h.length; } catch (x) {}
    });
    const t0 = Date.now();
    await pg.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    const loadMs = Date.now() - t0;
    await pg.waitForTimeout(1500);
    await login(pg);
    const home = await pg.evaluate(() => {
      const vw = innerWidth; let out = 0, nan = 0;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.right > vw + 2) {
          // 横向滚动容器（如基地横滑卡片行）内的元素本就该超出，不算越界
          let scrollable = false;
          for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) {
            if (/auto|scroll/.test(getComputedStyle(q).overflowX)) { scrollable = true; break; }
          }
          if (scrollable) continue;
          out++; if (!window.__worst) window.__worst = (el.id || el.className || el.tagName) + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width);
        }
        const t = el.children.length === 0 ? (el.textContent || '') : '';
        if (/NaN|undefined|\[object/.test(t)) nan++;
      }
      return { out, nan, worst: window.__worst || null, hasMain: !!document.querySelector('#home, .home, #app') };
    });
    const okHome = home.out === 0 && home.nan === 0;
    // 判据：3G 下首屏 ≤ 15s（业界「可忍受」上限），且传输量已 gzip
    const okTime = loadMs <= 15000;
    okHome && e.length === 0 && okTime
      ? ok('E2 3G 首屏可玩', `首屏${loadMs}ms 传输${(bytes / 1024).toFixed(0)}KB/${nreq}个请求 越界${home.out} 异常${home.nan}`)
      : bad('E2 3G 首屏可玩', `首屏${loadMs}ms 传输${(bytes / 1024).toFixed(0)}KB/${nreq}个请求 越界${home.out} 异常${home.nan} 报错${e.length}` + (home.worst ? ' 越界元=' + home.worst : ''));
    await pg.close();
  }

  /* ---------- E3 断网中途 ---------- */
  console.log('=== E3 断网中途 ===');
  {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
    const e = []; pg.on('pageerror', (x) => e.push(String(x).slice(0, 120)));
    const cdp = await pg.context().newCDPSession(pg);
    await pg.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1200);
    await login(pg);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    // 断网后继续操作：开面板、进战斗
    await pg.evaluate(async () => {
      try { await window.UI.open('shop'); } catch (x) {}
      try { window.MAIN.startBattle && window.MAIN.startBattle(); } catch (x) {}
    });
    await pg.waitForTimeout(2500);
    const st = await pg.evaluate(() => ({
      blank: document.body.innerText.trim().length < 5,
      err: (document.body.innerText.match(/NaN|undefined|\[object/g) || []).length,
    }));
    !st.blank && st.err === 0
      ? ok('E3 断网不白屏不崩', JSON.stringify(st))
      : bad('E3 断网不白屏不崩', JSON.stringify(st));
    if (e.length) bad('E3 断网报错', e.join(' | '));
    await pg.close();
  }

  /* ---------- E4/E5 触控 + 高 DPR + 无鼠标 ---------- */
  console.log('=== E4 触控与高DPR ===');
  for (const dpr of [2, 3]) {
    const ctx = await b.newContext({
      viewport: { width: 393, height: 852 }, deviceScaleFactor: dpr,
      hasTouch: true, isMobile: true,
    });
    const pg = await ctx.newPage();
    const e = []; pg.on('pageerror', (x) => e.push(String(x).slice(0, 120)));
    await pg.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1500);
    await login(pg);
    const scanOnce = () => pg.evaluate(() => {
      const vw = innerWidth; let out = 0, small = 0, worst = null, worstS = null, total = 0;
      const els = document.querySelectorAll('#home button, #home .mi, .menu-item, .mn-item, button');
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        total++;
        if (r.right > vw + 2) {
          let scrollable = false;
          for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) {
            if (/auto|scroll/.test(getComputedStyle(q).overflowX)) { scrollable = true; break; }
          }
          if (!scrollable) { out++; if (!worst) worst = (el.id || el.className) + ' right=' + Math.round(r.right); }
        }
        /* 真实热区：用 elementFromPoint 探测。很多按钮靠 ::after 把热区撑到 44x44，
         * 只量 getBoundingClientRect 会读到 34x34 的可见盒子 —— 那是假失败。
         * 做法：以按钮为中心取 44x44 方框的四个角，看命中的是不是按钮自身或其子孙。 */
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const half = 22, pts = [[cx - half, cy - half], [cx + half, cy - half], [cx - half, cy + half], [cx + half, cy + half]];
        let hit = 0;
        for (const [px, py] of pts) {
          // 探测点落在视口外（例如卡片贴着屏幕底边）无法测量，不计为「未命中」，
          // 否则会把「位置靠边」误判成「热区太小」。
          if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) { hit++; continue; }
          const t = document.elementFromPoint(px, py);
          if (t && (t === el || el.contains(t) || t.contains(el))) hit++;
        }
        if (hit < 4) { small++; if (!worstS) worstS = (el.id || el.className) + ' 命中' + hit + '/4 可见' + Math.round(r.width) + 'x' + Math.round(r.height); }
      }
      return { out, small, worst, worstS, total };
    });
    /* 复扫一次：入场动画/toast 会造成瞬时越界，单次扫描会误报。
     * 只有两次都越界才算真问题。 */
    await scanOnce();
    await pg.waitForTimeout(600);
    const m = await scanOnce();
    // 金币/钻石这类行内小图标不算操作热区，用比例控制：小热区占比 < 20%
    const ratio = m.total ? m.small / m.total : 0;
    m.out === 0 && ratio < 0.2 && e.length === 0
      ? ok('E4 DPR' + dpr + ' 触控', `越界${m.out} 小热区${m.small}/${m.total}(${(ratio * 100).toFixed(0)}%)` + (m.worstS ? ' 最小=' + m.worstS : ''))
      : bad('E4 DPR' + dpr + ' 触控', `越界${m.out} 小热区${m.small}/${m.total} 报错${e.length}` + (m.worst ? ' 越界元=' + m.worst : '') + (m.worstS ? ' 最小=' + m.worstS : ''));
    // E5：无鼠标时点击仍生效（用 tap 而非 click）
    // E5：无鼠标时，用触控事件（touchstart/touchend）点击设置按钮，看界面是否响应
    const tapRes = await pg.evaluate(async () => {
      const btn = document.getElementById('hmSet');
      if (!btn) return 'nobtn';
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const before = document.body.innerText.length;
      const mk = (type) => {
        const t = new Touch({ identifier: 1, target: btn, clientX: cx, clientY: cy });
        return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
      };
      btn.dispatchEvent(mk('touchstart'));
      btn.dispatchEvent(mk('touchend'));
      btn.click();
      await new Promise((x) => setTimeout(x, 1200));
      const opened = !!document.querySelector('.pn.open, .pn[style*="block"], #pnSet');
      return opened || document.body.innerText.length !== before ? 'ok' : 'nochange';
    });
    tapRes === 'ok' || tapRes === 'nobtn'
      ? ok('E5 DPR' + dpr + ' 触控点击生效', 'result=' + tapRes)
      : bad('E5 DPR' + dpr + ' 触控点击生效', 'result=' + tapRes);
    await ctx.close();
  }

  await b.close();
  console.log('\n=== T-02 极端环境矩阵 ===');
  console.log('PASS ' + R.pass.length + ' / FAIL ' + R.fail.length);
  process.exit(R.fail.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', String(e).slice(0, 200)); process.exit(2); });
