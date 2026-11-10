#!/usr/bin/env node
/* 【_opshot.cjs】交互操作性真实浏览器取证：逐屏截图 + 按钮可用性量化 + 点击路径验证。
 * 用法: node tools/_opshot.cjs before|after
 * 立规原因：静态审计只能证明"绑定存在"，证明不了"玩家点得顺、看得懂、有反馈"。
 * 退出码：0=完成 / 1=存在异常 / 2=崩溃（崩溃显式判失败，不静默报绿）。 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, '_vis');
const TAG = process.argv[2] || 'after';
fs.mkdirSync(OUT, { recursive: true });
const S = n => path.join(OUT, n);

const audit = () => {
  const bs = [...document.querySelectorAll('button')].filter(b => {
    const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  });
  const dis = bs.filter(b => b.disabled);
  return {
    visibleButtons: bs.length,
    disabled: dis.length,
    disabledTexts: dis.map(b => (b.textContent || '').trim()).slice(0, 12),
    longLabels: bs.filter(b => (b.textContent || '').trim().length > 16).map(b => b.textContent.trim()).slice(0, 8),
    zeroAction: bs.filter(b => !b.onclick && !b.dataset.a && !b.getAttribute('data-a') &&
      !/^data-/.test(Object.keys(b.dataset).join(',')) && !b.dataset.buy && !b.dataset.dq && !b.dataset.mq).length,
    labels: bs.map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 40)
  };
};

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
  const errs = [];
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await pg.goto('file://' + ROOT + '/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2600);
  await pg.evaluate(() => {
    try {
      P = E.newPlayer('localdev', '测试员', 'm');
      P.lv = 60; P.gold = 999999; P.diamond = 9999; P.stamina = 80; P.gunLv = 12;
      P.cleared = { '1-1': 3, '1-2': 2, '1-3': 1 }; P.ch = 3;
      UID = 'localdev'; UI.P = P;
      if (window.E && E.ensureDicts) E.ensureDicts(P);
      if (typeof refreshHud === 'function') refreshHud();
      if (typeof updateHome === 'function') updateHome();
    } catch (e) {}
  });

  const out = { tag: TAG, screens: {}, paths: {}, feErrors: errs };
  const grab = async (name, fn, file) => {
    await pg.evaluate(fn);
    await pg.waitForTimeout(220);
    out.screens[name] = await pg.evaluate(audit);
    if (file) await pg.screenshot({ path: S(TAG + '_' + file + '.png') });
  };
  await grab('home', () => UI.show('home'), 'home');
  await grab('shop_daily', () => UI.open('shop', '每日'), 'shop_daily');
  await grab('shop_direct', () => UI.open('shop', '直购'), 'shop_direct');
  await grab('task_daily', () => UI.open('task', '日常'), 'task_daily');
  await grab('mail', () => UI.open('mail'), 'mail');

  // 任务页真实文案（供守卫判断"文案=行为"）
  out.screens.taskText = await pg.evaluate(() => {
    UI.open('task', '日常');
    return (document.querySelector('#pnBody') || {}).textContent || '';
  });

  // 点击路径：任务面板内 "前往任务" 实际落到哪个面板
  out.paths.goTask = await pg.evaluate(() => {
    UI.open('task', '日常');
    const btn = document.querySelector('#goTask');
    if (!btn) return { found: false };
    const label = (btn.textContent || '').trim();
    btn.click();
    return { found: true, label, landed: UI.curPanel || null, title: (document.querySelector('#pnTitle') || {}).textContent || '' };
  });

  // 商店卡片：名称/描述/价格/状态是否重复表达同一件事
  out.screens.shopCells = await pg.evaluate(() => {
    UI.open('shop', '每日');
    return [...document.querySelectorAll('.gcell')].slice(0, 6).map(c => {
      const gEl = c.querySelector('.gst');
      return {
        name: (c.querySelector('.gn') || {}).textContent || '',
        desc: [...c.querySelectorAll('.lbl')].map(x => x.textContent.trim()),
        btn: (c.querySelector('.gbuy button') || c.querySelector('button') || {}).textContent || '',
        disabled: !!(c.querySelector('.gbuy button') || c.querySelector('button') || {}).disabled,
        gbuy: c.querySelectorAll('.gbuy').length,
        gst: [...c.querySelectorAll('.gst')].map(x => x.textContent.trim()),
        gstW: gEl ? Math.round(gEl.getBoundingClientRect().width) : 0,
        h: Math.round(c.getBoundingClientRect().height),
        nameH: Math.round(((c.querySelector('.gn') || {}).getBoundingClientRect() || {}).height || 0)
      };
    });
  });

  const ap = await b.newPage({ viewport: { width: 1440, height: 960 } });
  ap.on('dialog', d => d.accept());
  const aerr = []; ap.on('pageerror', e => aerr.push(String(e).slice(0, 140)));
  await ap.goto('file://' + ROOT + '/admin/index.html', { waitUntil: 'domcontentloaded' });
  await ap.waitForTimeout(1300);
  await ap.evaluate(() => { try { APP.enter('fj19941224'); } catch (e) { try { APP.login('fj19941224'); } catch (x) {} } });
  await ap.waitForTimeout(1400);
  await ap.evaluate(() => {
    try {
      APP.PLIST = [{ uid: 'u1', name: '灵液', nick: '灵液', lv: 78, pw: 2137000, gold: 1e8,
        diamond: 8888, at: Date.now(), ban: 0, gun: 'W01', char: 'C01', skin: 'sk_c01a',
        avatar: 'sk_c01a', reg: Date.now() - 40 * 864e5, vip: 6, legion: '雷霆军团',
        online: 1, destroyed: 0, endless: 999, kill: 123456 }];
      APP.PLIST_AT = Date.now(); APP.SEL = null; APP.go('account');
    } catch (e) {}
  });
  await ap.waitForTimeout(250);
  out.screens.admin_account = await ap.evaluate(audit);
  await ap.screenshot({ path: S(TAG + '_admin_account.png') });
  out.beErrors = aerr;

  fs.writeFileSync(S('_opaudit_' + TAG + '.json'), JSON.stringify(out, null, 2));
  console.log('TAG=' + TAG + ' FE_ERR=' + errs.length + ' BE_ERR=' + aerr.length);
  for (const k of Object.keys(out.screens)) {
    const v = out.screens[k];
    if (v.visibleButtons !== undefined)
      console.log('  ' + k + ': btn=' + v.visibleButtons + ' disabled=' + v.disabled + ' long=' + v.longLabels.length);
  }
  console.log('  goTask=' + JSON.stringify(out.paths.goTask));
  console.log('  shopCells=' + JSON.stringify(out.screens.shopCells).slice(0, 900));
  await b.close();
  process.exit(errs.length || aerr.length ? 1 : 0);
})().catch(e => { console.error('SHOT_CRASH', e.stack); process.exit(2); });
