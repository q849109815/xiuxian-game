/* V1.3.97 战斗特效取证：真实登录 → 真实进战斗 → 真实释放技能 → 逐张出图
 * 判据：截图必须来自真实 canvas 绘制路径，不 mock DOM、不手绘代替。
 * V1.3.97 收口改进：取证时关掉引导气泡 / 网络 toast / 自动升级弹窗，
 *   否则截图里全是遮罩（上一轮 10 张里有 2 张被弹窗吞了，等于没取证）；
 *   并采集 BTFX 运行时证据（frame 调用、粒子数、全屏闪光 class）。
 * 退出码：0=出图且无报错 / 1=前提未就绪 / 2=崩溃
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const { mkPage, realLogin, enterBattle } = require('../tools/_login.cjs');
const fs = require('fs'), path = require('path');
const ROOT = '/data/workspace/zombie', OUT = path.join(ROOT, '_vis');
const TAG = process.argv[2] || 'before';

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
  const { ctx, pg } = await mkPage(b, 393, 852);
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await pg.goto('file://' + ROOT + '/index.html', { waitUntil: 'domcontentloaded' });
  await realLogin(pg, 'FX' + TAG);
  let e = null;
  for (let i = 0; i < 3; i++) { e = await enterBattle(pg, '1-1'); if (e && e.scr === 'battle') break; await pg.waitForTimeout(900); }
  if (!e || e.scr !== 'battle') { console.log('PREREQ 未进入战斗', JSON.stringify(e)); await b.close(); process.exit(1); }
  await pg.waitForTimeout(700);

  /* 取证专用清场：只隐藏会遮住画面的浮层，不碰任何战斗 HUD / canvas */
  await pg.addStyleTag({ content:
    /* #lvup 是 z-index:1000 的全屏 modal，上一轮「技能齐放」「三选一」
     * 两张图整张被它吞掉。取证必须显式隐藏，否则等于没取证。 */
    '.toast,#btTalk,#guide,#maintMask,#result,#lvup,#pause,#sweepBox{display:none !important}' });
  const clean = async () => pg.evaluate(() => {
    try { if (window.UI && UI.hideChoice) UI.hideChoice(); } catch (ex) {}
    ['choice', 'lvup', 'result', 'pause'].forEach(id => {
      const n = document.getElementById(id); if (n) n.classList.remove('on');
    });
    document.querySelectorAll('.toast').forEach(n => { try { n.remove(); } catch (ex) {} });
  });

  const prep = await pg.evaluate(() => {
    const r = window.BT && BT.run; if (!r) return null;
    const ids = ['wenyadan', 'ganbingdan', 'diancichuan', 'gaonengshexian',
      'xuanfengjianong', 'zhidaojiguang', 'bingbao'];
    r.skills = r.skills || {};
    ids.forEach(i => { r.skills[i] = 3; });
    r.cd = r.cd || {};
    try {
      for (let i = 0; i < 6; i++) {
        const z = BT.mkZ ? BT.mkZ('z1', r.wave || 1) : null;
        if (z) { z.x = 80 + (i % 3) * 110 + Math.random() * 18; z.y = 230 + Math.floor(i / 3) * 120; r.zombies.push(z); }
      }
    } catch (ex) {}
    return { skills: ids.length, zombies: r.zombies.length, wave: r.wave, px: r.px, py: r.py,
      hasBTFX: !!window.BTFX };
  });
  console.log('PREP', JSON.stringify(prep));

  const shot = async (name) => {
    await clean();
    const f = path.join(OUT, 'V1.3.97_' + TAG + '_' + name + '.png');
    await pg.screenshot({ path: f }); console.log('SHOT', path.basename(f));
  };
  /* 运行时证据：BTFX 真的被调用、粒子真的生成、全屏闪光 class 真的切上 */
  const evidence = () => pg.evaluate(() => {
    const S = window.BTFX && BTFX.state;
    return {
      frameTick: S ? +S.t.toFixed(2) : null,
      parts: S ? S.parts.length : null,
      dust: S ? S.dust.length : null,
      flash: S && S.flash ? { el: S.flash.el, life: +S.flash.life.toFixed(2) } : null,
      castCount: window.BTFX && BTFX.castCount ? BTFX.castCount() : null,
      domHasCast: !!document.getElementById('battle') &&
        document.getElementById('battle').classList.contains('fx-cast'),
      canvasFilter: (() => { try { return getComputedStyle(document.getElementById('C')).filter; } catch (e) { return null; } })(),
    };
  });

  await shot('战斗常态');
  const evBase = await evidence();

  const cases = [
    ['温压弹', 'wenyadan'], ['干冰弹', 'ganbingdan'], ['电磁穿刺', 'diancichuan'],
    ['高能射线', 'gaonengshexian'], ['旋风加农', 'xuanfengjianong'],
    ['制导激光', 'zhidaojiguang'], ['冰暴', 'bingbao'],
  ];
  const results = [];
  for (const [name, id] of cases) {
    const res = await pg.evaluate((sid) => {
      const r = window.BT && BT.run; if (!r) return { ok: false };
      r.cd[sid] = 0;
      try { const x = BT.castSkill(sid); return { ok: !!x.ok, msg: x.msg, efx: r.efx.length, zones: r.zones.length }; }
      catch (ex) { return { ok: false, msg: String(ex).slice(0, 90) }; }
    }, id);
    /* 清场但保留刚生成的特效；等 120ms 抓光爆峰值 */
    await pg.evaluate(() => {
      try { if (window.UI && UI.hideChoice) UI.hideChoice(); } catch (ex) {}
      const c = document.getElementById('choice'); if (c) c.classList.remove('on');
    });
    await pg.waitForTimeout(120);
    await shot('技能_' + name);
    const ev = await evidence();
    results.push({ name, id, ...res, ev });
    await pg.waitForTimeout(700);
  }

  /* 多技能齐放：战斗最「炫」的一刻 */
  await pg.evaluate(() => {
    const r = window.BT && BT.run; if (!r) return;
    ['wenyadan', 'ganbingdan', 'diancichuan', 'gaonengshexian'].forEach(i => { r.cd[i] = 0; try { BT.castSkill(i); } catch (e) {} });
  });
  await pg.waitForTimeout(120);
  await shot('技能齐放');
  const evAll = await evidence();

  /* 三选一卡片：v1397 的齿轮徽章 / 元素色描边 / 金光 */
  await pg.evaluate(() => {
    try {
      const S = ((window.EX && EX.skills) || []).slice(0, 3);
      if (window.UI && UI.showSkillChoice) UI.showSkillChoice(S);
      const c = document.getElementById('choice'); if (c) c.classList.add('on');
    } catch (ex) {}
  });
  await pg.waitForTimeout(320);
  await pg.screenshot({ path: path.join(OUT, 'V1.3.97_' + TAG + '_技能三选一.png') });
  console.log('SHOT V1.3.97_' + TAG + '_技能三选一.png');

  const out = { tag: TAG, prep, evBase, results, evAll, errors: errs.length, errSamples: errs.slice(0, 5) };
  fs.writeFileSync(path.join(OUT, 'V1.3.97_' + TAG + '_战斗取证.json'), JSON.stringify(out, null, 2));
  console.log('RESULT', JSON.stringify({ tag: TAG, prep, evBase, evAll, errors: errs.length }));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e.stack); process.exit(2); });
