#!/usr/bin/env node
/* 【_flowwalk.cjs】操作流程逻辑性 / 方便性真实走查（V1.3.85）
 * 立规原因：制作人追问「界面逻辑性操作性你视觉看了嘛？方便嘛？」——
 *   此前各轮只做静态截图与文案精简，证明不了「玩家按路径点下去顺不顺」。
 *   本工具按真实玩家路径逐步点击，记录每一步的落地、反馈、状态保留。
 * 取证前提（必须显式满足，否则结论作废）：
 *   前端 UI.P/UID 注入 + 存档 stub；后台 enter() 为 async，必须单独等待渲染完成
 *   再改页面，否则 enter 内部的 go() 会覆盖走查目标（V1.3.81 的「24 屏无数据」
 *   就是同一类：拿工具没喂数据的假象当缺陷）。
 * 用法: node tools/_flowwalk.cjs [tag]
 * 退出码：0=取证完成 / 1=前后台有报错 / 2=浏览器崩溃（崩溃显式判失败）。
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, '_vis');
const TAG = process.argv[2] || 'flow';
fs.mkdirSync(OUT, { recursive: true });
const S = n => path.join(OUT, n);
const R = {};
const note = (k, v) => { R[k] = v; console.log(k + ' = ' + JSON.stringify(v)); };
/* 【取证前提】截图前必须等图片 complete。
 * V1.3.85 真实事故：首版只等 220ms，6 张商品图有 5 张尚未解码绘制，
 * 截图看起来像「空框 / 图没了」，我一度据此改了 CSS 加底座。
 * 用 _diag2.cjs 等图后重拍，6 张全部清晰 —— 是工具假象不是产品缺陷。
 * 规矩：截图工具本身也是被审对象，没喂完数据的图不能拿来判视觉。 */
const waitImgs = async (p) => {
  await p.evaluate(async () => {
    const im = [...document.images].filter(i => !i.complete);
    await Promise.all(im.map(i => new Promise(r => {
      i.onload = i.onerror = r; setTimeout(r, 2000);
    })));
  });
  await p.waitForTimeout(120);
};

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
  const errs = [], dialogs = [];
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  pg.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
  await pg.goto('file://' + ROOT + '/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2600);

  await pg.evaluate(() => {
    try {
      P = E.newPlayer('flowwalk', '走查员', 'm');
      P.lv = 60; P.gold = 999999; P.diamond = 9999; P.stamina = 40;
      P.gunLv = 12; P.cleared = { '1-1': 3, '1-2': 2, '1-3': 1 }; P.ch = 3;
      P.mail = [
        { id: 'fw1', t: '走查补偿', b: '流程验证用', rw: { gold: 100 }, got: false },
        { id: 'fw2', t: '第二封', b: '流程验证用', rw: { gold: 50 }, got: false }
      ];
      UID = 'flowwalk'; UI.P = P;
      if (window.E && E.ensureDicts) E.ensureDicts(P);
      E.save = () => {}; E.saveSoon = () => {};
      if (typeof refreshHud === 'function') refreshHud();
      if (typeof updateHome === 'function') updateHome();
    } catch (e) { window.__FW_BOOT = String(e); }
  });

  /* F1 主界面 → 任务 → 日常：一键领取入口 */
  note('F1_任务批量入口', await pg.evaluate(() => {
    UI.open('task', '日常');
    const b = document.querySelector('#taskClaimAll');
    return { panel: UI.curPanel, tab: UI.curTab.task, batch: !!b,
      label: b ? b.textContent.trim() : '' };
  }));
  await pg.screenshot({ path: S(TAG + '_f1_task.png') });

  /* F2 点一键领取：反馈 + 状态原地更新 */
  note('F2_批量领取反馈', await pg.evaluate(() => {
    const before = (document.querySelector('#taskClaimAll') || {}).textContent || '';
    const el = document.querySelector('#taskClaimAll'); if (el) el.click();
    const box = document.querySelector('#toasts');
    return { before, batchGone: !document.querySelector('#taskClaimAll'),
      toast: box ? box.textContent.trim().slice(-120) : '',
      panelStillOpen: document.querySelector('#panel').classList.contains('on') };
  }));
  await pg.screenshot({ path: S(TAG + '_f2_claimed.png') });

  /* F3 跨面板跳转 → ◀ 返回上级 */
  note('F3_返回上级导航', await pg.evaluate(() => {
    UI.close(); UI.open('role', '装备');
    const a = UI.curPanel; UI.open('gun', '武器库');
    const b = UI.curPanel, ret = UI.back();
    return { from: a, jumped: b, backReturned: ret, landed: UI.curPanel,
      tab: UI.curTab[UI.curPanel] || null,
      open: document.querySelector('#panel').classList.contains('on') };
  }));

  /* F4 关闭再打开：是否记住上次页签 */
  note('F4_页签记忆', await pg.evaluate(() => {
    UI.open('shop', '直购'); UI.close(); UI.open('shop');
    return { remembered: UI.curTab.shop, title: (document.querySelector('#pnTitle') || {}).textContent };
  }));

  /* F5 购买：扣款 / 反馈 / 售罄是否打断操作流 */
  note('F5_购买反馈', await pg.evaluate(() => {
    UI.open('shop', '每日');
    const g0 = P.gold;
    const btn = document.querySelector('#pnBody [data-buy]');
    const id = btn ? btn.dataset.buy : null, t0 = btn ? btn.textContent.trim() : '';
    if (btn) btn.click();
    const again = [...document.querySelectorAll('#pnBody [data-buy]')].find(x => x.dataset.buy === id);
    return { id, goldBefore: g0, goldAfter: P.gold, btnBefore: t0,
      btnAfter: again ? again.textContent.trim() : '(按钮消失)',
      disabled: again ? !!again.disabled : null,
      panelOpen: document.querySelector('#panel').classList.contains('on'),
      curPanel: UI.curPanel,
      otherBuyable: [...document.querySelectorAll('#pnBody [data-buy]')].filter(x => !x.disabled).length,
      toast: (document.querySelector('#toasts') || {}).textContent?.trim().slice(-120) || '' };
  }));
  await waitImgs(pg);
  await pg.screenshot({ path: S(TAG + '_f5_buy.png') });

  /* F6 购买后滚动位置是否保留 */
  note('F6_购买后滚动', await pg.evaluate(async () => {
    UI.open('shop', '每日');
    await new Promise(r => setTimeout(r, 120));
    const bd = document.querySelector('#pnBody');
    const cap = Math.max(0, bd.scrollHeight - bd.clientHeight);
    bd.scrollTop = Math.min(90, cap);
    const before = bd.scrollTop;
    const btn = [...document.querySelectorAll('#pnBody [data-buy]')].find(x => !x.disabled);
    if (btn) btn.click();
    return { cap, before, after: bd.scrollTop };
  }));

  /* F7 邮件单封领取按钮是否真绑定（历史死按钮） */
  note('F7_邮件单封领取', await pg.evaluate(() => {
    UI.open('mail');
    const one = [...document.querySelectorAll('#pnBody [data-ml]')];
    return { singles: one.length,
      bound: one.map(x => ({ id: x.dataset.ml, hasOnclick: !!x.onclick })),
      all: !!document.querySelector('#mailAll') };
  }));

  /* ---- 后台：enter() 是 async，必须单独等待渲染完成 ---- */
  const ap = await b.newPage({ viewport: { width: 1440, height: 960 } });
  const aerr = [], adlg = [];
  ap.on('pageerror', e => aerr.push(String(e).slice(0, 160)));
  ap.on('dialog', async d => { adlg.push(d.message()); await d.dismiss(); });
  await ap.goto('file://' + ROOT + '/admin/index.html', { waitUntil: 'domcontentloaded' });
  await ap.waitForTimeout(1200);
  await ap.evaluate(() => { try { APP.enter('fj19941224'); } catch (e) { window.__FW_BE0 = String(e); } });
  await ap.waitForTimeout(1800);

  const beReady = await ap.evaluate(() => {
    try {
      APP.PLIST = [{ uid: 'u1', name: '灵液', nick: '灵液', lv: 78, pw: 2137000, gold: 1e8,
        diamond: 8888, at: Date.now(), ban: 0, gun: 'W01', char: 'C01', skin: 'sk_c01a',
        avatar: 'sk_c01a', reg: Date.now() - 40 * 864e5, vip: 6, legion: '雷霆军团',
        online: 1, destroyed: 0, endless: 999, kill: 123456 }];
      APP.PLIST_AT = Date.now(); APP.SEL = null;
      return { pages: Object.keys(APP.pages), cur: APP.cur, bodyLen: (document.querySelector('#body') || {}).innerHTML?.length || 0 };
    } catch (e) { return { err: String(e) }; }
  });
  note('BE_READY', beReady);

  /* F8 未选玩家时空状态给的是可点按钮，且点击真能到选人页 */
  note('F8_空状态行动入口', await ap.evaluate(() => {
    const keys = Object.keys(APP.pages);
    let hit = null;
    for (const k of keys) { APP.go(k); if (document.querySelector('#goSelPlayer')) { hit = k; break; } }
    const b = document.querySelector('#goSelPlayer');
    const before = APP.cur;
    if (b) b.click();
    return { pageWithEmptyBtn: hit, emptyBtn: !!b, before, after: APP.cur };
  }));
  await ap.screenshot({ path: S(TAG + '_f8_admin_empty.png') });

  /* F9 选中玩家后切页是否保留（运营不该每换一页重选一次） */
  note('F9_选中态跨页', await ap.evaluate(() => {
    APP.SEL = APP.PLIST[0];
    const keys = Object.keys(APP.pages).slice(0, 4);
    const seq = keys.map(k => { APP.go(k); return { k, sel: !!APP.SEL }; });
    return { seq, keptAll: seq.every(x => x.sel) };
  }));

  /* F10 危险操作不得弹原生 confirm（阻塞自动化），且要有模态 */
  const dlgBefore = adlg.length;
  const f10 = await ap.evaluate(() => {
    /* 判据收紧：V1.3.85 首版用 /清空|删除|注销|重置/ 命中了账号页的
     * 「显示已注销(0)」——那是筛选开关不是危险动作，导致「没弹模态」
     * 被误读成确认机制失效。必须只认以危险动词开头的动作按钮。 */
    const order = [...Object.keys(APP.pages)].sort((a, b) => (b === 'cleanup') - (a === 'cleanup'));
    let found = null;
    for (const k of order) {
      APP.go(k);
      const b = [...document.querySelectorAll('#body button')].find(x =>
        /^(清空|删除|注销|重置|永久删除|清除)/.test(x.textContent.trim()));
      if (b) { found = { page: k, label: b.textContent.trim() }; b.click(); break; }
    }
    /* 判据修正：.modal 是 position:fixed，offsetParent 恒为 null，
     * 用 offsetParent 判「可见」会把真正打开的模态判成 0（假阴性）。
     * 改看 classList('on') 或 computed display，与 admin.css 的 .modal.on{display:flex} 对齐。 */
    const modal = [...document.querySelectorAll('#modal,.modal,.ask')].filter(m =>
      m.classList.contains('on') || getComputedStyle(m).display !== 'none').length;
    return { found, modalShown: modal };
  });
  f10.nativeDialogs = adlg.length - dlgBefore;
  note('F10_危险操作确认', f10);
  await ap.screenshot({ path: S(TAG + '_f10_admin_danger.png') });

  note('FE_ERRS', errs); note('BE_ERRS', aerr); note('NATIVE_DIALOGS', dialogs.concat(adlg));
  fs.writeFileSync(S('_flowwalk_' + TAG + '.json'), JSON.stringify(R, null, 2));
  await b.close();
  process.exit(errs.length || aerr.length ? 1 : 0);
})().catch(e => { console.error('FLOW_CRASH', e.stack); process.exit(2); });
