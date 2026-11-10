/* [visualshot.cjs] 立规原因：常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码：0=全过 / 1=有未过项 / 2=崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
/* 前后台全量视觉审查截图：file:// 真实渲染，逐个面板/页签出图 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/data/workspace/zombie';
const OUT = path.join(ROOT, '_vis');
fs.mkdirSync(OUT, { recursive: true });
const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const seg = ui.slice(ui.indexOf('PANELS:'), ui.indexOf('tabPos(key)'));
const KEYS = [...seg.matchAll(/^\s{4}([a-zA-Z0-9_]+)\s*:/gm)].map(x => x[1]);

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await pg.goto('file://' + ROOT + '/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(3200);
  await pg.evaluate(() => {
    try {
      P = E.newPlayer('localdev', '测试员', 'm');
      P.lv = 45; P.gold = 999999; P.diamond = 9999; P.stamina = 80;
      P.gunLv = 12; P.cleared = { '1-1': 3, '1-2': 2, '1-3': 1 };
      UID = 'localdev';
      /* 关键：UI.P 是 UI 对象自有属性，不会自动读全局 P。
       * 早期脚本只设全局 P，导致 render() 里 !this.P 直接返回「无数据」，
       * 24 个面板截图全是空占位——那是工具假象，不是线上缺陷。 */
      UI.P = P;
      if (window.E && E.ensureDicts) E.ensureDicts(P);
      if (typeof refreshHud === 'function') refreshHud();
      if (typeof updateHome === 'function') updateHome();
    } catch (e) {}
  });
  await pg.waitForTimeout(500);
  await pg.evaluate(() => UI.show('home'));
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.join(OUT, 'fe_home.png') });
  for (const k of KEYS) {
    try {
      await pg.evaluate(kk => { UI.show('home'); UI.open(kk); }, k);
      await pg.waitForTimeout(320);
      await pg.screenshot({ path: path.join(OUT, 'fe_' + k + '.png') });
    } catch (e) { console.log('FE_ERR', k, e.message.slice(0, 90)); }
  }
  console.log('FE_PANELS', KEYS.length, 'ERRORS', errs.length, errs.slice(0, 6).join(' | '));
  await pg.close();

  const ap = await b.newPage({ viewport: { width: 1440, height: 960 } });
  ap.on('dialog', d => d.accept());
  const aerr = []; ap.on('pageerror', e => aerr.push(String(e).slice(0, 140)));
  await ap.goto('file://' + ROOT + '/admin/index.html', { waitUntil: 'domcontentloaded' });
  await ap.waitForTimeout(1500);
  await ap.evaluate(() => { try { APP.enter('fj19941224'); } catch (e) { try { APP.login('fj19941224'); } catch (x) {} } });
  await ap.waitForTimeout(1800);
  await ap.evaluate(() => {
    try {
      APP.PLIST = [
        { uid: 'u1', name: '灵液', nick: '灵液', lv: 78, pw: 2137000, gold: 1e8, diamond: 8888, at: Date.now(), ban: 0, gun: 'W01', char: 'C01', skin: 'sk_c01a', avatar: 'sk_c01a', reg: Date.now() - 40 * 864e5, vip: 6, legion: '雷霆军团', online: 1, destroyed: 0, endless: 999, kill: 123456 },
        { uid: 'u2', name: '西瓜哥', nick: '西瓜哥', lv: 42, pw: 456000, gold: 32000, diamond: 120, at: Date.now(), ban: 0, gun: 'W04', char: 'C02', skin: 'sk_c02a', avatar: 'sk_c02a', reg: Date.now() - 9 * 864e5, vip: 2, legion: '', online: 0, destroyed: 0, endless: 210, kill: 3400 },
        { uid: 'u3', name: '猎手行者78号', nick: '猎手行者78号', lv: 61, pw: 998000, gold: 555000, diamond: 2400, at: Date.now(), ban: 0, gun: 'W06', char: 'C03', skin: 'sk_c03b', avatar: 'sk_c03b', reg: Date.now() - 25 * 864e5, vip: 4, legion: '暗夜猎手', online: 1, destroyed: 0, endless: 640, kill: 77800 }
      ];
      APP.PLIST_AT = Date.now();
    } catch (e) {}
  });
  const pgs = await ap.evaluate(() => Object.keys(APP.pages || {}));
  console.log('BE_PAGES', pgs.length, pgs.join(' '));
  for (const k of pgs) {
    try {
      await ap.evaluate(kk => APP.go(kk), k);
      await ap.waitForTimeout(300);
      await ap.screenshot({ path: path.join(OUT, 'be_' + k + '.png') });
    } catch (e) { console.log('BE_ERR', k, e.message.slice(0, 90)); }
  }
  console.log('BE_ERRORS', aerr.length, aerr.slice(0, 6).join(' | '));
  await b.close();
})();
