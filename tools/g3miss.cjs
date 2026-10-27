#!/usr/bin/env node
/**
 * 维护轮 · G3「未命中」归因诊断
 * 背景：gate.cjs G3 报「点击 92 未命中 4」，历史上一句"面板重绘导致"带过，无证据。
 *       这是典型的「闸门谎报」形态——把不可判定的现象写成无害结论。
 * 本脚本目标：让 miss 变成可判定。
 *
 * 判据：
 *   点击前记录按钮指纹列表 F_before（text|cls|idx），点击后 F_after
 *   A 类 序号取空：els[idx] 为 null，且 N_after < N_before  → 列表变短，属重绘（可接受）
 *   B 类 真失效  ：els[idx] 为 null，但 N_after >= N_before → 可疑，必须上报
 *   C 类 死按钮  ：按钮存在且可点，但点击前后 面板HTML/资源/弹窗 全无变化 → 点了没反应
 *
 * 用法: node tools/g3miss.cjs
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const PANELS = ['shop', 'act', 'tavern'];

(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0, 150)));
  await pg.addInitScript(() => {
    window.confirm = () => false;
    window.alert = () => {};
  });
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_G3M');
    await window.MAIN.login('归因诊断', '男');
  });
  await pg.waitForTimeout(1800);

  // 指纹函数（注入页面）
  await pg.addInitScript(() => {});
  const FP = `() => {
    const root = document.getElementById('panel'); if(!root) return null;
    return [...root.querySelectorAll('button,[class*="btn"],[onclick],input,select')]
      .filter(el=>{const q=el.getBoundingClientRect();
        return q.width>=8&&q.height>=8&&!el.disabled&&getComputedStyle(el).visibility!=='hidden';})
      .map(el=>(el.innerText||el.value||el.className||'').trim().slice(0,18));
  }`;

  let A = 0, B = 0, C = 0;
  const bList = [], cList = [];

  for (const k of PANELS) {
    await pg.evaluate(kk => window.UI.open(kk), k);
    await pg.waitForTimeout(200);
    const before = await pg.evaluate(new Function('return ' + FP));
    if (!before) continue;
    const total = Math.min(before.length, 16);
    for (let i = 0; i < total; i++) {
      // 每次重新取指纹，避免序号失效
      const cur = await pg.evaluate(new Function('return ' + FP));
      if (!cur || !cur[i]) {
        // 序号取空：判定 A / B
        const nb = cur ? cur.length : 0;
        if (nb < before.length) { A++; }
        else { B++; bList.push(k + '#' + i + ' N=' + nb); }
        continue;
      }
      const name = cur[i];
      // 记录点击前状态快照
      const snap0 = await pg.evaluate(() => {
        const root = document.getElementById('panel');
        return {
          html: root ? root.innerHTML.length : 0,
          gold: window.P ? (window.P.gold | 0) : 0,
          dia: window.P ? (window.P.diamond | 0) : 0,
          mask: document.querySelectorAll('.mask,.modal,.pop-mask,.dlg,.popup').length
        };
      });
      await pg.evaluate(idx => {
        const root = document.getElementById('panel');
        const els = [...root.querySelectorAll('button,[class*="btn"],[onclick],input,select')]
          .filter(el => { const q = el.getBoundingClientRect();
            return q.width >= 8 && q.height >= 8 && !el.disabled &&
              getComputedStyle(el).visibility !== 'hidden'; });
        if (els[idx]) els[idx].click();
      }, i);
      await pg.waitForTimeout(180);
      const snap1 = await pg.evaluate(() => {
        const root = document.getElementById('panel');
        return {
          html: root ? root.innerHTML.length : 0,
          gold: window.P ? (window.P.gold | 0) : 0,
          dia: window.P ? (window.P.diamond | 0) : 0,
          mask: document.querySelectorAll('.mask,.modal,.pop-mask,.dlg,.popup').length
        };
      });
      const changed = snap0.html !== snap1.html || snap0.gold !== snap1.gold ||
                      snap0.dia !== snap1.dia || snap0.mask !== snap1.mask;
      if (!changed) { C++; cList.push(k + '#' + i + ' [' + name + ']'); }
      // 关闭模态并回到本面板，保证下一轮序号基准稳定
      await pg.evaluate(() => {
        document.querySelectorAll('.mask,.modal,.pop-mask,.dlg,.popup').forEach(m => {
          if (m.id === 'panel' || m.contains(document.getElementById('panel'))) return;
          const c = [...m.querySelectorAll('button')]
            .find(x => /取消|关闭|知道了|确定|不用了/.test(x.innerText || ''));
          if (c) c.click();
        });
      });
      await pg.evaluate(kk => window.UI.open(kk), k);
      await pg.waitForTimeout(120);
    }
  }

  console.log('=== G3 未命中归因 ===');
  console.log('A 类 序号取空(列表变短,属重绘):', A);
  console.log('B 类 序号取空但列表未变短(可疑):', B, bList.length ? '\n   ' + bList.join('\n   ') : '');
  console.log('C 类 点了无任何变化(死按钮):', C);
  if (cList.length) console.log('   ' + cList.join('\n   '));
  console.log('页面异常:', errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})();
