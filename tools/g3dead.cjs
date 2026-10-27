#!/usr/bin/env node
/**
 * 维护轮 · G3「死按钮」误报归因
 * 目的：判断 C 类（点击前后无可观测变化）是真死按钮，还是判据盲区导致的误报。
 * 证据维度：按钮 tag/class、自身或父级是否已带选中态(on/active/selected/cur)、
 *           点击后 toast 文本、confirm 文本、面板 HTML 是否变化、资源是否变化。
 * 用法: node tools/g3dead.cjs
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const TARGET = { shop: [0], role: [0, 8, 9, 10, 11, 14], bag: [0], gun: [0], chip: [0],
                 task: [0], core: [0], codex: [0], base: [0], legion: [0], talent: [0],
                 set: [0], rank: [0], mail: [0], friends: [0], act: [0], tavern: [0],
                 exped: [0], ashop: [0, 1], gem: [0] };

(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  await pg.addInitScript(() => {
    window.__lc = ''; window.__toasts = [];
    window.confirm = function (t) { window.__lc = String(t || ''); return false; };
    window.alert = function (t) { window.__lc = 'ALERT:' + String(t || ''); };
  });
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_G3D');
    await window.MAIN.login('死按钮归因', '男');
  });
  await pg.waitForTimeout(1800);
  // 监听 toast 出生
  await pg.evaluate(() => {
    const box = document.getElementById('toasts');
    if (box && !box.__w) {
      box.__w = 1;
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
        window.__toasts.push((n.innerText || '').slice(0, 30));
      }))).observe(box, { childList: true });
    }
  });

  const out = [];
  for (const [k, idxs] of Object.entries(TARGET)) {
    for (const i of idxs) {
      await pg.evaluate(kk => window.UI.open(kk), k);
      await pg.waitForTimeout(250);
      const info = await pg.evaluate(idx => {
        window.__lc = ''; window.__toasts = [];
        const root = document.getElementById('panel'); if (!root) return null;
        const q = () => [...root.querySelectorAll('button,[class*="btn"],[onclick],input,select')]
          .filter(el => { const b = el.getBoundingClientRect();
            return b.width >= 8 && b.height >= 8 && !el.disabled &&
              getComputedStyle(el).visibility !== 'hidden'; });
        const els = q();
        if (!els[idx]) return { off: true };
        const el = els[idx];
        const SEL = /(^|\s)(on|active|selected|cur|sel|current)(\s|$)/;
        const selBefore = SEL.test(el.className || '') ||
                          SEL.test((el.parentElement && el.parentElement.className) || '');
        const h = root.innerHTML; let x = 0;
        for (let j = 0; j < h.length; j++) x = (x * 31 + h.charCodeAt(j)) | 0;
        const g0 = (window.P && window.P.gold) | 0, d0 = (window.P && window.P.diamond) | 0;
        el.click();
        const h2 = root.innerHTML; let y = 0;
        for (let j = 0; j < h2.length; j++) y = (y * 31 + h2.charCodeAt(j)) | 0;
        return {
          tag: el.tagName, cls: String(el.className || '').slice(0, 40),
          txt: (el.innerText || el.value || '').trim().slice(0, 14) || '(空)',
          selBefore, panelOpen: !!document.getElementById('panel'),
          htmlChanged: x !== y,
          goldChanged: g0 !== ((window.P && window.P.gold) | 0),
          diaChanged: d0 !== ((window.P && window.P.diamond) | 0),
          lc: (window.__lc || '').slice(0, 40),
          toasts: (window.__toasts || []).slice(0, 2)
        };
      }, i);
      await pg.waitForTimeout(150);
      if (!info) { out.push([k + '#' + i, 'NO PANEL']); continue; }
      if (info.off) { out.push([k + '#' + i, '序号取空']); continue; }
      const reacts = [];
      if (info.htmlChanged) reacts.push('HTML');
      if (info.goldChanged) reacts.push('GOLD');
      if (info.diaChanged) reacts.push('DIAMOND');
      if (info.lc) reacts.push('确认框:' + info.lc.slice(0, 18));
      if (info.toasts.length) reacts.push('toast:' + info.toasts.join('/').slice(0, 24));
      if (!info.panelOpen) reacts.push('面板关闭');
      out.push([k + '#' + i, reacts.length ? reacts.join(' ') : '无',
                info.tag, 'cls=' + info.cls, 'txt=' + info.txt, '选中态=' + info.selBefore]);
    }
  }
  console.log('=== 死按钮归因（26 个样本）===');
  for (const r of out) console.log(' ', r[0].padEnd(12), '|', r[1].slice(0, 46).padEnd(46), '|', (r[5] || ''), (r[4] || ''));
  await b.close();
})();
