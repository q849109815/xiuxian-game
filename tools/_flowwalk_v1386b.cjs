#!/usr/bin/env node
/* 【_flowwalk_v1386b.cjs】操作流程逻辑性补测 —— 承接 V1.3.86 收尾
 * 立规原因：制作人要求「用视觉结合代码看看操作流程逻辑性方便吗」。
 *   V1.3.86 只证明了「点直达按钮能落到对的面板」，没有证明
 *   「落到面板后，玩家要点的那个控件在不在首屏」——落点对 ≠ 一步到位。
 *   另补测：领取奖励后是否留在当前页签（跨页签批量按钮的隐含前提）。
 * 本工具只取事实，不判对错；判据在 taskflow2.cjs。
 * 用法：node tools/_flowwalk_v1386b.cjs [tag]
 * 退出码：0=取证完成 / 2=浏览器崩溃或前提未就绪（崩溃显式判失败）。 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, '_vis');
const TAG = process.argv[2] || 'v1386b';
fs.mkdirSync(OUT, { recursive: true });
const srcHash = crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, 'js/ui.js'))).digest('hex');
const R = { tag: TAG, ready: false, srcHash, steps: {}, errs: [] };
const note = (k, v) => { R.steps[k] = v; console.log(k + ' = ' + JSON.stringify(v)); };
const waitImgs = async (p) => {
  await p.evaluate(async () => {
    const im = [...document.images].filter(i => !i.complete);
    await Promise.all(im.map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 1500); })));
  });
  await p.waitForTimeout(120);
};

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  pg.on('pageerror', e => R.errs.push(String(e).slice(0, 160)));
  await pg.goto('file://' + ROOT + '/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2400);

  await pg.evaluate(() => {
    try {
      P = E.newPlayer('tf', '流程走查', 'm');
      P.lv = 60; P.gold = 999999; P.diamond = 9999; P.stamina = 40;
      P.cleared = { '1-1': 3, '1-2': 2 }; P.ch = 3;
      /* diffStars 读 p.diffCleared[难度id][关卡id]，只写 cleared 不会渲染「扫荡」按钮 */
      P.diffCleared = { normal: { '1-1': 3, '1-2': 2 } };
      UID = 'tf'; UI.P = P;
      if (window.E && E.ensureDicts) E.ensureDicts(P);
      E.save = () => {}; E.saveSoon = () => {};
      window.__TF_READY = !!(UI.P && UI.open);
    } catch (e) { window.__TF_BOOT = String(e); }
  });
  R.ready = await pg.evaluate(() => !!window.__TF_READY);
  if (!R.ready) {
    fs.writeFileSync(path.join(OUT, '_' + TAG + '.json'), JSON.stringify(R, null, 2));
    await b.close(); process.exit(2);
  }

  /* H1：四类「去XX」点击后，真正要操作的控件在不在首屏 */
  note('H1_直达落点与目标控件可见性', await pg.evaluate(async () => {
    const out = [];
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
    const first = s => [...document.querySelectorAll(s)][0];
    const cfg = [
      { label: '去关卡', target: '挑战', sel: '[data-lv]' },
      { label: '去强化', target: '强化', sel: '#gunUp' },
      { label: '去扫荡', target: '扫荡', sel: '[data-sw]' },
      { label: '去无尽', target: '无尽卡片', sel: '#lvEndless' }
    ];
    for (const c of cfg) {
      UI.close(); UI.open('task', '日常');
      const btn = [...document.querySelectorAll('#pnBody [data-go]')]
        .find(x => x.textContent.trim() === c.label);
      if (!btn) { out.push({ label: c.label, found: false }); continue; }
      btn.click();
      await wait(300);
      const el = first(c.sel);
      const r = rect(el);
      const bd = document.querySelector('#pnBody');
      out.push({ label: c.label, landed: UI.curPanel,
        tab: UI.curTab[UI.curPanel] || null,
        target: c.target, targetFound: !!el, rect: r,
        inFirstScreen: !!r && r.top > 0 && r.top < innerHeight,
        bodyScrollTop: bd ? Math.round(bd.scrollTop) : null,
        bodyScrollHeight: bd ? Math.round(bd.scrollHeight) : null,
        bodyClientHeight: bd ? Math.round(bd.clientHeight) : null });
      await waitImgsGlobal();
    }
    function waitImgsGlobal() { return Promise.resolve(); }
    return out;
  }));

  /* H2：领取奖励后是否留在当前页签（跨页签批量按钮的隐含前提） */
  note('H2_领取后页签保持', await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const snap = () => ({ panel: UI.curPanel, tab: UI.curTab.task || null });
    UI.close(); UI.open('task', '周常');
    const before = snap();
    const ca = document.querySelector('#taskClaimAll');
    const hadBtn = !!ca;
    if (ca) ca.click();
    await wait(300);
    const afterAll = snap();
    UI.open('task', '成就');
    const beforeOne = snap();
    const one = document.querySelector('#pnBody [data-aq], #pnBody [data-dq], #pnBody [data-mq], #pnBody [data-wq]');
    if (one) one.click();
    await wait(300);
    return { hadBtn, before, afterAll, beforeOne, afterOne: snap() };
  }));

  /* H3：条目少的页签，内容区下方空白量化（视觉合理性取证，不判对错） */
  note('H3_页签空白量化', await pg.evaluate(() => {
    const out = [];
    for (const tab of ['主线', '日常', '周常', '成就']) {
      UI.close(); UI.open('task', tab);
      const bd = document.querySelector('#pnBody');
      const cards = [...document.querySelectorAll('#pnBody .card')];
      const last = cards[cards.length - 1];
      const lr = last ? last.getBoundingClientRect() : null;
      const br = bd ? bd.getBoundingClientRect() : null;
      out.push({ tab, cards: cards.length,
        lastBottom: lr ? Math.round(lr.bottom) : null,
        bodyBottom: br ? Math.round(br.bottom) : null,
        emptyPx: (lr && br) ? Math.round(br.bottom - lr.bottom) : null,
        scrollHeight: bd ? Math.round(bd.scrollHeight) : null });
    }
    return out;
  }));
  await waitImgs(pg);
  await pg.screenshot({ path: path.join(OUT, TAG + '_h3_weekly.png') });

  R.errCount = R.errs.length;
  fs.writeFileSync(path.join(OUT, '_' + TAG + '.json'), JSON.stringify(R, null, 2));
  console.log('errCount = ' + R.errCount);
  await b.close();
  process.exit(R.errCount ? 1 : 0);
})().catch(e => {
  R.errs.push(String(e).slice(0, 200));
  fs.writeFileSync(path.join(OUT, '_' + TAG + '.json'), JSON.stringify(R, null, 2));
  console.error('FATAL', e);
  process.exit(2);
});
