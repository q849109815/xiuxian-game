/* V1.3.96 特效增强层 · 真实 Chrome 前后对照取证
 * 判据：同一份 index.html，A 页不挂新层、B 页挂 v1396.css，
 *   逐屏截图 + getComputedStyle 取证「特效真的生效」+ 盒子取证「布局一点没动」。
 * 退出码：0=取证完成且特效生效且布局零变化 / 1=未生效或布局变化 / 2=崩溃
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/data/workspace/zombie', OUT = path.join(ROOT, '_vis');
const FX = path.join(ROOT, 'css', 'v1396.css');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
  const mk = async (withFx) => {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
    const errs = [], failed = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    pg.on('requestfailed', r => failed.push(r.url().split('/').pop()));
    await pg.goto('file://' + ROOT + '/index.html', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(2800);
    /* 与项目既有真实取证同一套初始化：造本地玩家 → 显式切到主界面，
       否则 #home 未激活，图标按钮「不可见」，点击会一直超时。 */
    await pg.evaluate(() => {
      try {
        P = E.newPlayer('localdev', '测试员', 'm');
        P.lv = 45; P.gold = 999999; P.diamond = 9999; P.stamina = 80;
        P.gunLv = 12; P.cleared = { '1-1': 3, '1-2': 2, '1-3': 1 };
        UID = 'localdev'; UI.P = P;
        if (window.E && E.ensureDicts) E.ensureDicts(P);
        if (typeof refreshHud === 'function') refreshHud();
        if (typeof updateHome === 'function') updateHome();
      } catch (e) {}
    });
    await pg.waitForTimeout(400);
    await pg.evaluate(() => UI.show('home'));
    await pg.waitForTimeout(400);
    if (withFx) await pg.addStyleTag({ path: FX });
    await pg.waitForTimeout(800);
    return { pg, errs, failed };
  };
  const probe = pg => pg.evaluate(() => {
    const q = s => document.querySelector(s);
    const cs = e => { if (!e) return null; const c = getComputedStyle(e);
      return { shadow: (c.boxShadow || '').slice(0, 100), anim: c.animationName,
               filter: (c.filter || '').slice(0, 80), bg: (c.backgroundImage || '').slice(0, 110) }; };
    const box = e => { if (!e) return null; const r = e.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(r.left)]; };
    return {
      go: cs(q('.ha.go') || q('.hm-go')),
      hmb: cs(q('#home .hmb[data-p="role"]')),
      hn: cs(q('.hm-nav2 .hn2') || q('.hm-nav .hn')),
      top: cs(q('#home .hm-top')),
      boxes: { go: box(q('.ha.go') || q('.hm-go')), hmb: box(q('#home .hmb[data-p="role"]')),
               top: box(q('#home .hm-top')) }
    };
  });
  const A = await mk(false), B = await mk(true);
  const pA = await probe(A.pg), pB = await probe(B.pg);

  const shots = [];
  const shot = async (X, n) => { const f = path.join(OUT, 'V1.3.96_' + n + '.png');
    await X.pg.screenshot({ path: f }); shots.push(path.basename(f)); console.log('SHOT', path.basename(f)); };
  await shot(A, '取证_before_主界面'); await shot(B, '取证_after_主界面');
  /* 悬浮光晕是最直观的一条：真把鼠标放上去，读 computed box-shadow。
     静态查不出「!important 把光晕吃掉」这类事故，必须实测交互态。 */
  const hoverShadow = async X => {
    await X.pg.hover('#home .hmb[data-p="role"]'); await X.pg.waitForTimeout(320);
    return X.pg.evaluate(() => {
      const e = document.querySelector('#home .hmb[data-p="role"]');
      return e ? getComputedStyle(e).boxShadow.slice(0, 160) : null;
    });
  };
  const hsA = await hoverShadow(A), hsB = await hoverShadow(B);

  /* 角色页：真实点击入口 */
  for (const [n, X] of [['before', A], ['after', B]]) {
    await X.pg.click('#home .hmb[data-p="role"]'); await X.pg.waitForTimeout(650);
    await shot(X, '取证_' + n + '_角色页');
  }
  const roleA = await A.pg.evaluate(() => { const e = document.querySelector('.chr-grid .gcell');
    const r = e && e.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height), Math.round(r.top)] : null; });
  const roleB = await B.pg.evaluate(() => { const e = document.querySelector('.chr-grid .gcell');
    const r = e && e.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height), Math.round(r.top)] : null; });
  const roleStyleA = await A.pg.evaluate(() => { const e = document.querySelector('.chr-grid .gcell.sel');
    return e ? getComputedStyle(e).animationName : null; });
  const roleStyleB = await B.pg.evaluate(() => { const e = document.querySelector('.chr-grid .gcell.sel');
    return e ? getComputedStyle(e).animationName : null; });

  /* 技能三选一：走真实渲染函数，失败再降级置 on */
  for (const [n, X] of [['before', A], ['after', B]]) {
    await X.pg.evaluate(() => {
      try { if (typeof UI.close === 'function') UI.close(); } catch (e) {}
      const p = document.getElementById('panel'); if (p) p.classList.remove('on');
      const fn = Object.keys(UI).find(k => /^(choice|showChoice|skillChoice|showSkillChoice)$/i.test(k) && typeof UI[k] === 'function');
      const names = ['温压弹', '干冰弹', '电磁穿刺'];
      const icons = ['sk_wenyadan.jpg', 'sk_bingbao.jpg', 'sk_diancichuan.jpg'];
      const els = ['fire', 'ice', 'volt'];
      const P = names.map((n, i) => ({ id: 'fx' + i, n, desc: ['高温高压爆炸，大范围群体伤害', '冻结减速全僵尸', '穿透一条直线上的敌人'][i],
        up: '+15%', kind: 'active', img: 'assets/icon/' + icons[i], el: els[i] }));
      if (fn) UI[fn](P);
      const ch = document.getElementById('choice'); if (ch && !ch.classList.contains('on')) ch.classList.add('on');
    });
    await X.pg.waitForTimeout(500);
    await shot(X, '取证_' + n + '_技能三选一');
  }
  const chStyleA = await A.pg.evaluate(() => { const e = document.querySelector('#chCards .ccard');
    return e ? getComputedStyle(e).transitionDuration : null; });
  const chStyleB = await B.pg.evaluate(() => { const e = document.querySelector('#chCards .ccard');
    return e ? getComputedStyle(e).transitionDuration : null; });
  const chBoxA = await A.pg.evaluate(() => { const e = document.querySelector('#chCards .ccard');
    const r = e && e.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height), Math.round(r.top)] : null; });
  const chBoxB = await B.pg.evaluate(() => { const e = document.querySelector('#chCards .ccard');
    const r = e && e.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height), Math.round(r.top)] : null; });

  /* 四条互相独立的证据，任一缺失即不算生效。
     首版只查「图标静态 box-shadow 是否变了」是判据写错：新层给图标加的是
     背景渐变与 :hover 反馈，静态阴影本来就该一样 —— 那次 FAIL 是假红。 */
  const fxEvidence = {
    出击流光: !!(pB.go && pB.go.anim && pB.go.anim !== 'none' && pA.go && pA.go.anim === 'none'),
    图标能量底光: !!(pA.hmb && pB.hmb && pA.hmb.bg !== pB.hmb.bg && /gradient/.test(pB.hmb.bg || '')),
    角色选中呼吸: !!(roleStyleB && roleStyleB !== 'none' && roleStyleA === 'none'),
    三选一悬浮过渡: !!(chStyleB && chStyleA && chStyleB !== chStyleA),
    图标悬浮光晕: !!(hsA && hsB && hsA !== hsB && /255, 183, 60/.test(hsB))
  };
  const fxOn = Object.values(fxEvidence).every(Boolean);
  const layoutSame = JSON.stringify(pA.boxes) === JSON.stringify(pB.boxes)
    && JSON.stringify(roleA) === JSON.stringify(roleB)
    && JSON.stringify(chBoxA) === JSON.stringify(chBoxB);
  const errs = A.errs.length + B.errs.length;

  const result = {
    fx生效: { 证据: fxEvidence, hover阴影_before: hsA, hover阴影_after: hsB,
      出击按钮动画_before: pA.go && pA.go.anim, 出击按钮动画_after: pB.go && pB.go.anim,
      图标_before: pA.hmb, 图标_after: pB.hmb, 导航_before: pA.hn, 导航_after: pB.hn,
      角色选中动画_before: roleStyleA, 角色选中动画_after: roleStyleB,
      三选一过渡_before: chStyleA, 三选一过渡_after: chStyleB },
    布局零变化: layoutSame, home盒子: pA.boxes, role盒子: roleA, choice盒子: chBoxA,
    页面报错: errs, 资源失败: A.failed.length + B.failed.length,
    截图: shots, 综合判定: (fxOn && layoutSame && errs === 0) ? 'PASS' : 'FAIL'
  };
  fs.writeFileSync(path.join(OUT, 'V1.3.96_特效取证.json'), JSON.stringify(result, null, 2));
  console.log('RESULT', JSON.stringify(result, null, 1));
  await b.close();
  process.exit(result.综合判定 === 'PASS' ? 0 : 1);
})().catch(e => { console.error('CRASH', e.stack); process.exit(2); });
