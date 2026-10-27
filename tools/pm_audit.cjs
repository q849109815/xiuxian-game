#!/usr/bin/env node
/**
 * PM 视角 · 内容审计
 * 统计每个面板：可见文字量、条目数、图片数、空态、可点元素
 * 目的是量化"内容丰不丰富"
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const W = 393;

const PANELS = ['shop','role','bag','gun','chip','task','core','codex','base','legion',
  'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport: { width: W, height: 852 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0, 120)));
  await pg.addInitScript(() => {
    window.confirm = () => false; window.alert = () => {}; window.onbeforeunload = null;
  });
  await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);

  // 登录：找已有账号 or 注册
  const loginState = await pg.evaluate(() => {
    return { hasSave: !!localStorage.getItem('zp_save'), keys: Object.keys(localStorage).slice(0, 12) };
  });
  console.log('localStorage:', JSON.stringify(loginState).slice(0, 200));

  // 尝试进入游戏
  await pg.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const t = btns.find(x => /开始游戏|进入游戏|登录|进入/.test(x.innerText || ''));
    if (t) t.click();
  });
  await pg.waitForTimeout(2500);

  const inGame = await pg.evaluate(() => {
    const h = document.querySelector('#home, .home, #hm');
    return { body: document.body.innerText.slice(0, 300), visible: !!h && h.offsetParent !== null };
  });
  console.log('--- 进入后 ---');
  console.log(inGame.body.replace(/\n+/g, ' | '));

  await pg.screenshot({ path: '/data/workspace/zombie/PM2_login.png' });

  console.log('\n=== 面板内容审计 ===');
  const rows = [];
  for (const p of PANELS) {
    try {
      await pg.evaluate((id) => {
        if (typeof window.openPanel === 'function') window.openPanel(id);
        else if (typeof window.panel === 'function') window.panel(id);
      }, p);
      await pg.waitForTimeout(400);
      const info = await pg.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 0 && r.height > 0; };
        const boxes = Array.from(document.querySelectorAll('.pn, .panel, .pnl, .pn-box, [class*=panel]')).filter(vis);
        const box = boxes.sort((a, c) => c.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
        if (!box) return null;
        const txt = (box.innerText || '').trim();
        const imgs = Array.from(box.querySelectorAll('img'));
        const btns = Array.from(box.querySelectorAll('button, [onclick], .btn')).filter(vis);
        // 条目：有边框/背景的重复块
        const cards = Array.from(box.querySelectorAll('.card, .item, .row, .cell, li, .gcell, .slot')).filter(vis);
        const tabs = Array.from(box.querySelectorAll('.tab, .pn-tab, [class*=tab]')).filter(vis).map(e => (e.innerText || '').trim()).filter(Boolean);
        return {
          chars: txt.length,
          lines: txt.split('\n').filter(x => x.trim()).length,
          imgs: imgs.length,
          imgBroken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
          btns: btns.length,
          cards: cards.length,
          tabs: tabs.slice(0, 8),
          head: txt.slice(0, 160).replace(/\n+/g, ' | ')
        };
      });
      rows.push({ p, ...(info || { chars: 0, err: 'no panel' }) });
      await pg.screenshot({ path: `/data/workspace/zombie/PM2_${p}.png` });
      // 关闭
      await pg.evaluate(() => {
        const c = Array.from(document.querySelectorAll('button,.btn')).find(x => /^(◀|返回|关闭|×)/.test((x.innerText || '').trim()));
        if (c) c.click(); else { const m = document.querySelector('.pn.on,.panel.on'); if (m) m.classList.remove('on'); }
      });
      await pg.waitForTimeout(200);
    } catch (e) { rows.push({ p, err: String(e).slice(0, 80) }); }
  }
  console.log('面板'.padEnd(10), '字数'.padEnd(6), '行数'.padEnd(5), '图'.padEnd(4), '破图'.padEnd(5), '按钮'.padEnd(5), '条目');
  for (const r of rows) {
    if (r.err) { console.log(r.p.padEnd(10), 'ERR', r.err); continue; }
    console.log(String(r.p).padEnd(10), String(r.chars).padEnd(6), String(r.lines).padEnd(5),
      String(r.imgs).padEnd(4), String(r.imgBroken).padEnd(5), String(r.btns).padEnd(5), String(r.cards));
    if (r.chars < 60) console.log('            ⚠ 内容贫瘠:', r.head);
    if (r.tabs && r.tabs.length) console.log('            页签:', r.tabs.join('/'));
  }
  console.log('\nJS错误:', errs.length, errs.slice(0, 5));
  await b.close();
})();
