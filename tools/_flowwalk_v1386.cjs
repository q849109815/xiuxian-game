#!/usr/bin/env node
/* 【_flowwalk_v1386.cjs】操作流程逻辑性取证 —— 任务 → 去完成 → 回来领取 闭环
 * 立规原因：制作人追问「界面逻辑性操作性你视觉看了嘛？方便嘛？用视觉结合代码看」。
 *   V1.3.85 走查覆盖的是「领取/购买/返回/页签记忆」，没有覆盖
 *   「玩家看到一条未完成任务，能不能一步走到该做的事」。
 *   本工具只取事实，不判对错；判据在 taskflow.cjs。
 * 取证前提：UI.P/UID 注入 + E.save 打桩（照 _flowwalk.cjs 口径，避免存档写穿）。
 * 用法：node tools/_flowwalk_v1386.cjs [tag]
 * 退出码：0=取证完成 / 2=浏览器崩溃（崩溃显式判失败，不静默报绿）。
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, '_vis');
const TAG = process.argv[2] || 'v1386';
fs.mkdirSync(OUT, { recursive: true });
const S = n => path.join(OUT, n);
const R = { tag: TAG, ready: false, steps: {}, errs: [] };
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
      UID = 'tf'; UI.P = P;
      if (window.E && E.ensureDicts) E.ensureDicts(P);
      E.save = () => {}; E.saveSoon = () => {};
      window.__TF_READY = !!(UI.P && UI.open);
    } catch (e) { window.__TF_BOOT = String(e); }
  });
  R.ready = await pg.evaluate(() => !!window.__TF_READY);
  if (!R.ready) { console.log('取证前提未就绪'); await b.close(); process.exit(2); }

  /* G1 日常页：未完成任务有没有「一步直达」入口；笼统按钮在不在首屏 */
  note('G1_日常页未完成入口', await pg.evaluate(() => {
    UI.open('task', '日常');
    const rows = [...document.querySelectorAll('#pnBody .zrow')];
    const off = rows.filter(r => r.querySelector('.st.off'));
    const inlineGo = [...document.querySelectorAll('#pnBody [data-go]')].length;
    const g = document.querySelector('#goTask');
    const r = g ? g.getBoundingClientRect() : null;
    return { rows: rows.length, unfinished: off.length, inlineGo,
      hasGoTask: !!g, goTaskText: g ? g.textContent.trim() : '',
      goTaskTop: r ? Math.round(r.top) : null, viewportH: innerHeight,
      goTaskInFirstScreen: r ? (r.top < innerHeight && r.top > 0) : false,
      offNames: off.map(x => (x.querySelector('b') || {}).textContent || '') };
  }));
  await waitImgs(pg);
  await pg.screenshot({ path: S(TAG + '_g1_daily.png') });

  /* G2 滚到底拍「笼统按钮」位置，证明要滚 */
  note('G2_笼统按钮需滚动', await pg.evaluate(() => {
    const bd = document.querySelector('#pnBody');
    bd.scrollTop = bd.scrollHeight;
    const g = document.querySelector('#goTask');
    return { scrollTop: Math.round(bd.scrollTop), scrollHeight: Math.round(bd.scrollHeight),
      clientHeight: Math.round(bd.clientHeight), goTaskVisible: !!g };
  }));
  await pg.screenshot({ path: S(TAG + '_g2_daily_bottom.png') });

  /* G3 点笼统按钮的落地：对「强化1次」「无尽1次」是不是同一个错落点 */
  note('G3_笼统按钮落点', await pg.evaluate(() => {
    UI.open('task', '日常');
    const g = document.querySelector('#goTask'); if (g) g.click();
    return { landed: UI.curPanel, tab: UI.curTab[UI.curPanel] || null,
      title: (document.querySelector('#pnTitle') || {}).textContent || '' };
  }));

  /* G4 关卡选择首屏里有没有无尽入口（判断「去无尽」该落在哪） */
  note('G4_无尽入口可见性', await pg.evaluate(() => {
    const bd = document.querySelector('#pnBody'); if (bd) bd.scrollTop = 0;
    const cards = [...document.querySelectorAll('#pnBody .card')];
    const e = cards.find(c => (c.querySelector('.card-t') || {}).textContent?.includes('无尽'));
    const r = e ? e.getBoundingClientRect() : null;
    return { hasEndlessCard: !!e, cardTop: r ? Math.round(r.top) : null,
      viewportH: innerHeight, inFirstScreen: r ? r.top < innerHeight : false };
  }));
  await pg.screenshot({ path: S(TAG + '_g4_level_top.png') });

  /* G5 周常页有没有任何前往入口 */
  note('G5_周常页入口', await pg.evaluate(() => {
    UI.open('task', '周常');
    const rows = [...document.querySelectorAll('#pnBody .zrow')];
    const btns = [...document.querySelectorAll('#pnBody button')].map(b => b.textContent.trim());
    const body = document.querySelector('#pnBody');
    /* V1.3.86 自查：写说明时一度把块注释放进模板字符串里，会渲染成玩家可见文字
     * （V1.3.6 背包分解区同类事故）。取证必须真的读玩家看到的文本。 */
    return { rows: rows.length, unfinished: rows.filter(r => r.querySelector('.st.off')).length,
      hasInlineGo: [...document.querySelectorAll('#pnBody [data-go]')].length,
      hasGoTask: !!document.querySelector('#goTask'), buttons: btns,
      leakedComment: /\/\*|V1\.3\.86/.test(body ? body.textContent : '') };
  }));
  await waitImgs(pg);
  await pg.screenshot({ path: S(TAG + '_g5_weekly.png') });

  /* G6 从任务跳出去后 ◀ 能否回到任务面板（闭环的另一半） */
  note('G6_返回闭环', await pg.evaluate(() => {
    UI.close(); UI.open('task', '日常');
    UI.open('level', '章节');
    const jumped = UI.curPanel;
    const ret = UI.back();
    return { jumped, backReturned: ret, landed: UI.curPanel,
      tab: UI.curTab[UI.curPanel] || null };
  }));

  /* G7 四个页签：未完成行是否都有直达按钮，落点 key 是否按任务类型分化 */
  note('G7_四页签行内入口', await pg.evaluate(() => {
    const out = [];
    for (const tab of ['主线', '日常', '周常', '成就']) {
      UI.close(); UI.open('task', tab);
      const bs = [...document.querySelectorAll('#pnBody [data-go]')];
      out.push({ tab, unfinishedBtns: bs.length,
        labels: [...new Set(bs.map(b => b.textContent.trim()))],
        keys: [...new Set(bs.map(b => b.dataset.go))],
        focus: [...new Set(bs.filter(b => b.dataset.gfocus).map(b => b.dataset.gfocus))] });
    }
    return out;
  }));

  /* G8 真点：去强化 / 去无尽 的落点与聚焦，以及 ◀ 回任务 */
  note('G8_点击落点与返回', await pg.evaluate(async () => {
    const res = {};
    UI.close(); UI.open('task', '日常');
    const up = [...document.querySelectorAll('#pnBody [data-go]')].find(b => b.textContent.includes('强化'));
    if (up) { up.click(); res.up = { landed: UI.curPanel, tab: UI.curTab[UI.curPanel] || null }; }
    UI.close(); UI.open('task', '日常');
    const en = [...document.querySelectorAll('#pnBody [data-go]')].find(b => b.textContent.includes('无尽'));
    if (en) {
      en.click();
      await new Promise(r => setTimeout(r, 180));
      const el = document.getElementById('lvEndless');
      const r = el ? el.getBoundingClientRect() : null;
      res.endless = { landed: UI.curPanel,
        focusTop: r ? Math.round(r.top) : null,
        inFirstScreen: r ? (r.top > -50 && r.top < innerHeight) : false };
    }
    const ret = UI.back();
    res.back = { returned: ret, landed: UI.curPanel, tab: UI.curTab[UI.curPanel] || null };
    return res;
  }));

  /* G9 回归：领取按钮的 onclick 仍在（防改动把 b_task 绑定整段打断） */
  note('G9_领取绑定未破坏', await pg.evaluate(() => {
    UI.close(); UI.open('task', '日常');
    const sels = ['[data-dq]', '[data-mq]', '[data-wq]', '[data-aq]'];
    const out = {};
    for (const s of sels) {
      const b = document.querySelector('#pnBody ' + s);
      out[s] = b ? (typeof b.onclick === 'function') : 'no-button';
    }
    const ca = document.querySelector('#taskClaimAll');
    out.claimAll = ca ? (typeof ca.onclick === 'function') : 'no-button';
    return out;
  }));
  await pg.screenshot({ path: S(TAG + '_g9_daily_after.png') });

  R.errCount = R.errs.length;
  fs.writeFileSync(path.join(OUT, '_' + TAG + '.json'), JSON.stringify(R, null, 2));
  console.log('errs=' + JSON.stringify(R.errs));
  await b.close();
  process.exit(R.errs.length ? 1 : 0);
})().catch(e => { console.error('CRASH ' + e); process.exit(2); });
