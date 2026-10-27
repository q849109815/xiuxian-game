#!/usr/bin/env node
/**
 * 布局越界守卫 layoutguard
 * ------------------------------------------------------------------
 * 立规背景（V1.3.72 线上事故）：
 *   玩家反馈「按技能选技能时，游戏整个画面会跑出屏幕」。
 *   复盘发现测试组从来没有一条断言检查「元素盒子是否越界」——
 *   既有闸门只查「面板能否打开 / 有无异常 / 按钮有无反应」，
 *   一个元素 right=420 而视口只有 360，所有闸门依然全绿。
 *   更致命的是主界面基地建筑行：4 卡 ×96px 实测第 4 张右边缘 420，
 *   滚动条被 ::-webkit-scrollbar{display:none} 隐藏，玩家既看不到也滑不动。
 *
 * 判据：元素可见盒子的 right/bottom 超出视口，或 left/top 为负，
 *       且其祖先链上没有可滚动容器（否则属设计内滚动，不算出屏）。
 *
 * 用法：node tools/layoutguard.cjs            # 默认 360x640 + 320x568
 *       node tools/layoutguard.cjs 320,360,393,430
 *
 * 铁律：必须能被变异证伪。用 tools/mutate_layoutguard.cjs 验证。
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const path = require('path');
/* tools/layoutguard.cjs -> 上一级 = 项目根 */
const ROOT = path.dirname(path.dirname(__filename));
const BASE = path.join(ROOT, 'index.html');

const WIDTHS = (process.argv[2] ? process.argv[2].split(',').map(Number) : [360, 320]);
const HEIGHTS = { 320: 568, 360: 640, 393: 852, 430: 932 };

let PASS = 0, FAIL = 0;
const ok  = (n) => { PASS++; };
const bad = (n, d) => { FAIL++; console.log('  X ' + n + (d ? ' :: ' + d : '')); };

/* 页面内执行：扫描 #app 下所有可见元素的盒子越界 */
function scanFn(rootSel) {
  const vw = innerWidth, vh = innerHeight;
  const root = document.querySelector(rootSel);
  if (!root) return null;
  const out = [];
  root.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    if (cs.position === 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return;
    /* 祖先链上只要有可滚动容器，就属设计内滚动，不算「跑出屏幕」 */
    let e = el.parentElement, sx = false, sy = false;
    while (e && e !== document.body) {
      const c = getComputedStyle(e);
      if (c.overflowX === 'auto' || c.overflowX === 'scroll') sx = true;
      if (c.overflowY === 'auto' || c.overflowY === 'scroll') sy = true;
      e = e.parentElement;
    }
    const oR = Math.round(r.right - vw), oB = Math.round(r.bottom - vh);
    const oL = Math.round(r.left), oT = Math.round(r.top);
    if ((oR > 1 && !sx) || (oB > 1 && !sy) || (oL < -1 && !sx) || (oT < -1 && !sy)) {
      const cls = (typeof el.className === 'string' && el.className.trim())
        ? '.' + el.className.trim().split(/\s+/)[0] : '';
      out.push({ el: el.tagName + (el.id ? '#' + el.id : '') + cls,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        oR, oB, oL, oT });
    }
  });
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });

  for (const W of WIDTHS) {
    const H = HEIGHTS[W] || 640;
    console.log('\n===== ' + W + 'x' + H + ' =====');
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => { window.confirm = () => false; window.alert = () => {}; });
    await pg.goto('file://' + BASE);
    /* 关闭所有动画/过渡：面板入场是 translateY 动画，
     * 实测 150ms 时 .pn-box 仍在 translateY(6.27px)，bottom=645.3 超出 640 视口 5.3px ——
     * 那是动画中间态不是布局缺陷，但会把守卫带偏（误报）。
     * 归零动画时长，量到的就是稳定终态。 */
    await pg.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important}' });
    await pg.waitForTimeout(1400);
    await pg.evaluate(async () => {
      localStorage.setItem('zb_uid', 'ZZ_LAY');
      await window.MAIN.login('布局审查', '男');
    });
    await pg.waitForTimeout(2000);

    /* L1 主界面（含基地建筑行 —— 本次事故现场） */
    const home = await pg.evaluate(scanFn, '#app');
    if (!home) bad('L1 主界面 取不到 #app');
    else if (home.length) bad('L1 主界面越界', home.slice(0, 3).map(x => x.el + ' oR=' + x.oR).join(' | '));
    else ok('L1 主界面');

    /* L2 全部面板 × 全部页签 */
    const keys = await pg.evaluate(() => Object.keys(window.UI.PANELS || {}));
    for (const k of keys) {
      const tabs = await pg.evaluate(kk => (window.UI.PANELS[kk][1] || []).slice(), k);
      for (const t of [undefined, ...tabs]) {
        await pg.evaluate(([kk, tt]) => { try { window.UI.open(kk, tt); } catch (e) {} }, [k, t]);
        await pg.waitForTimeout(150);
        const o = await pg.evaluate(scanFn, '#panel');
        if (o && o.length) bad('L2 ' + k + '/' + (t || '默认'), o.slice(0, 2).map(x => x.el + ' oR=' + x.oR + ' oB=' + x.oB).join(' | '));
        else ok('L2 ' + k + '/' + (t || '默认'));
      }
    }
    await pg.evaluate(() => { try { window.UI.close(); } catch (e) {} });
    await pg.waitForTimeout(120);

    /* L3 技能三选一（事故现场：描述不截断会把卡片撑出屏幕） */
    await pg.evaluate(() => {
      try { window.UI.showSkillChoice((window.EX.skills || []).slice(0, 3)); } catch (e) {}
    });
    await pg.waitForTimeout(700);
    const ch = await pg.evaluate(scanFn, '#choice');
    if (ch && ch.length) bad('L3 三选一越界', ch.slice(0, 3).map(x => x.el + ' oR=' + x.oR + ' oB=' + x.oB).join(' | '));
    else ok('L3 三选一');
    /* L3b 三选一描述必须被截断为 3 行（否则长描述撑爆卡片） */
    const cl = await pg.evaluate(() => {
      const d = document.querySelector('#chCards .ccard .cd2');
      if (!d) return null;
      const cs = getComputedStyle(d);
      return { clamp: String(cs.webkitLineClamp || cs.lineClamp || ''), ov: cs.overflow };
    });
    if (!cl) bad('L3b 三选一描述元素缺失');
    else if (cl.clamp !== '3') bad('L3b 描述未截断为3行', 'clamp=' + cl.clamp);
    else if (cl.ov !== 'hidden') bad('L3b 描述未裁剪', 'overflow=' + cl.ov);
    else ok('L3b 描述截断');
    await pg.evaluate(() => { try { window.UI.hideChoice(); } catch (e) {} });

    await ctx.close();
  }
  await b.close();
  console.log('\n[layoutguard] PASS ' + PASS + ' / FAIL ' + FAIL);
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
