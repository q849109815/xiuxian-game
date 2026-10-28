#!/usr/bin/env node
/**
 * 战斗态布局守卫 btlayout
 * ------------------------------------------------------------------
 * 立规背景（玩家连续两轮反馈「战斗界面打着打着出屏幕」）：
 *   既有 layoutguard 只覆盖 L1 主界面 / L2 面板 / L3 三选一，
 *   【从未覆盖战斗界面】—— 玩家报的正是战斗界面，守卫长期存在盲区。
 *   且 layoutguard 用 MAIN.login 登录，而 boot() 会 removeItem('zb_uid')，
 *   login 直接 return → 页面停在 login 页 → L1「主界面越界=0」可能是假绿。
 *   本守卫改为走真实注册登录，并把战斗态纳入常驻回归。
 *
 * 覆盖：
 *   B1 战斗中 HUD 越界（手动推进战斗，逐批扫描 #battle）
 *   B2 战斗中三选一弹出时 #choice + #battle 扫描
 *   B3 战斗中视口变化（地址栏/旋转）后 #battle 扫描
 *   B4 战斗逻辑实体越界（canvas 内僵尸/子弹/飘字，DOM 扫描查不到）
 *   B5 技能栏塞满 8 个技能后不越界
 *
 * 用法：node tools/btlayout.cjs            # 默认 360x640 + 1280x800
 *       node tools/btlayout.cjs 360x640,852x393
 *
 * 铁律：必须能被变异证伪。用 tools/mutate_btlayout.cjs 验证。
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const { mkPage, realLogin, enterBattle } = require('./_login.cjs');
const path = require('path');
const ROOT = path.dirname(path.dirname(__filename));
const BASE = path.join(ROOT, 'index.html');

const SIZES = (process.argv[2] ? process.argv[2].split(',') : ['360x640', '1280x800'])
  .map(s => { const [w, h] = s.split('x').map(Number); return { w, h }; });

let PASS = 0, FAIL = 0;
const ok = (n) => { PASS++; console.log('  √ ' + n); };
const bad = (n, d) => { FAIL++; console.log('  X ' + n + (d ? ' :: ' + d : '')); };
/* 【前提类断言 pq()】—— V1.3.74 立规
 * 立规原因：看板曾连续出现「战斗布局守卫 未过 2 项」，而单独复跑全绿。
 *   查下来这两项是 B0「未能进入战斗」与 B2「三选一无法弹出」——
 *   它们衡量的是「测试环境有没有准备好」，不是「游戏有没有越界」。
 *   在负载高（多个浏览器工具串行执行、资源竞争）时二者会偶发失败，
 *   被当成游戏缺陷报进 FAIL，于是看板显示「未过 2 项」。
 * 假失败与假通过同样有害：反复误报会让看板使用者对「未过」脱敏，
 *   真正的越界失败（B1/B3/B4/B5/B6/B7/B8）反而被淹没。
 * 因此前提类独立计数（PREREQ），并先自动重试；重试耗尽才算「环境未就绪」，
 *   退出码 2 与「真缺陷退出码 1」区分开，看板分别显示。 */
let PREREQ = 0;
const pq = (n, d) => { PREREQ++; console.log('  ! ' + n + (d ? ' :: ' + d : '') + '  【前提未就绪，非游戏缺陷】'); };

/* 页面内：扫描可见元素盒子越界 */
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
      out.push(el.tagName + (el.id ? '#' + el.id : '') + cls +
        ' x=' + Math.round(r.x) + ' y=' + Math.round(r.y) +
        ' w=' + Math.round(r.width) + ' h=' + Math.round(r.height) +
        ' oR=' + oR + ' oB=' + oB + ' oL=' + oL + ' oT=' + oT);
    }
  });
  return out;
}

/* 页面内：canvas 逻辑实体越界（DOM 扫描完全看不到这一层） */
function oobFn() {
  const B = window.BT; if (!B || !B.run) return null;
  const W = B.W, H = B.H, r = B.run, out = [];
  const chk = (arr, name) => {
    if (!arr) return;
    arr.forEach((o) => {
      const x = o.x, y = o.y;
      if (!isFinite(x) || !isFinite(y)) { out.push(name + '坐标NaN'); return; }
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60)
        out.push(name + ' x=' + Math.round(x) + ' y=' + Math.round(y) + '(W=' + Math.round(W) + ',H=' + Math.round(H) + ')');
    });
  };
  chk(r.zombies, '僵尸'); chk(r.bullets, '子弹'); chk(r.floats, '飘字');
  chk(r.turrets, '炮台'); chk(r.mercs, '佣兵'); chk(r.obstacles, '掩体'); chk(r.barrels, '油桶');
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'] });

  for (const { w, h } of SIZES) {
    console.log('\n===== 战斗态 ' + w + 'x' + h + ' =====');
    const { ctx, pg } = await mkPage(b, w, h);
    await pg.goto('file://' + BASE);
    await realLogin(pg, 'L' + w);
    /* B0 前提类：进不去战斗先重试 3 次（负载高时首帧常未就绪），
     * 重试耗尽仍失败才记 PREREQ，不混入 FAIL（详见上方 pq() 立规说明）。 */
    let e = null;
    for (let a = 0; a < 3; a++) {
      e = await enterBattle(pg, '1-1');
      if (e && e.scr === 'battle') break;
      await pg.waitForTimeout(900);
    }
    if (!e || e.scr !== 'battle') { pq('B0 未能进入战斗', JSON.stringify(e)); await ctx.close(); continue; }
    ok('B0 进入战斗');

    /* B1/B2/B4：推进战斗，逐批扫描 */
    let b1 = 0, b2 = 0, b4 = 0, waves = 0, choiceSeen = 0;
    for (let i = 0; i < 14; i++) {
      /* 手动推进：不依赖真实帧率，也不受 paused 阻塞 */
      await pg.evaluate(() => {
        try {
          for (let k = 0; k < 24; k++) { if (window.BT && BT.run && !BT.run.over) BT.tick(0.05); }
          if (window.BT && BT.draw) BT.draw();
        } catch (err) {}
      });
      await pg.waitForTimeout(120);
      const st = await pg.evaluate(() => ({
        scr: (document.querySelector('.screen.on') || {}).id,
        wave: window.BT.run && window.BT.run.wave,
        choiceOn: (() => { const c = document.getElementById('choice'); return !!(c && c.classList.contains('on')); })(),
      }));
      if (st.wave && st.wave > waves) waves = st.wave;
      const ob = await pg.evaluate(scanFn, '#battle');
      if (ob && ob.length) { b1 += ob.length; bad('B1 战斗中 #battle 越界(wave' + st.wave + ')', ob.slice(0, 3).join(' | ')); }
      if (st.choiceOn) {
        choiceSeen++;
        const oc = await pg.evaluate(scanFn, '#choice');
        if (oc && oc.length) { b2 += oc.length; bad('B2 战斗中三选一越界', oc.slice(0, 3).join(' | ')); }
        await pg.evaluate(() => { const c = document.querySelector('#chCards .ccard'); if (c) c.click(); });
        await pg.waitForTimeout(250);
      }
      const oo = await pg.evaluate(oobFn);
      if (oo && oo.length) { b4 += oo.length; bad('B4 战斗实体越界(wave' + st.wave + ')', oo.slice(0, 3).join(' | ')); }
      if (st.scr !== 'battle') break;
    }
    if (!b1) ok('B1 战斗中无越界（推进到第 ' + waves + ' 波）');
    /* B2 必须真的弹出过才算数：升级没发生时 choiceOn 恒 false，扫描 0 条是空跑 */
    const c2 = await pg.evaluate(() => {
      try { window.UI.showSkillChoice((window.EX.skills || []).slice(0, 3)); } catch (e) { return 'err:' + e.message; }
      return 'ok';
    });
    await pg.waitForTimeout(600);
    const oc2 = await pg.evaluate(scanFn, '#choice');
    /* B2 的「弹不出 / 取不到」属前提类（UI 没就绪），只有真越界才算缺陷 */
    if (c2 !== 'ok') pq('B2 三选一无法弹出', String(c2));
    else if (!oc2) pq('B2 取不到 #choice', '');
    else if (oc2.length) { b2 += oc2.length; bad('B2 战斗中三选一越界', oc2.slice(0, 3).join(' | ')); }
    else ok('B2 战斗中三选一无越界（主动弹出' + (oc2 ? '已渲染' : '') + '，自然弹出' + choiceSeen + '次）');
    await pg.evaluate(() => { try { window.UI.hideChoice(); } catch (e) {} });

    /* B6 战斗中点击技能按钮（玩家「按技能选技能」的另一种读法）后不得越界 */
    const b6 = await pg.evaluate(() => {
      const box = document.getElementById('btSkills');
      if (!box) return 'no';
      const keep = box.innerHTML;
      box.innerHTML = '';
      for (let i = 0; i < 4; i++) { const d = document.createElement('div'); d.className = 'bs'; d.dataset.cast = 'sk' + i; d.textContent = i + 1; box.appendChild(d); }
      const vw = innerWidth, vh = innerHeight, out = [];
      const btns = Array.from(document.querySelectorAll('#btSkills [data-cast]'));
      if (!btns.length) return 'nobtn';
      btns.forEach((btn) => {
        try { btn.click(); } catch (e) {}
        document.querySelectorAll('#battle *, #app .on *').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
          if (cs.position === 'fixed') return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 && r.height < 1) return;
          if (r.right - vw > 1 || r.bottom - vh > 1 || r.left < -1 || r.top < -1)
            out.push(el.tagName + (el.id ? '#' + el.id : '') + ' oR=' + Math.round(r.right - vw) + ' oB=' + Math.round(r.bottom - vh));
        });
      });
      box.innerHTML = keep;
      return out.slice(0, 6);
    });
    if (b6 === 'no') bad('B6 取不到技能栏');
    else if (Array.isArray(b6) && b6.length) bad('B6 点击技能按钮后越界', b6.slice(0, 3).join(' | '));
    else ok('B6 点击技能按钮后无越界');
    if (!b4) ok('B4 战斗实体无越界');

    /* B3 视口变化（地址栏收起 / 旋转） */
    const seq = [[w, h], [w, Math.round(h * 0.78)], [h, w], [w, h]];
    let b3 = 0;
    for (const [vw2, vh2] of seq) {
      await pg.setViewportSize({ width: vw2, height: vh2 });
      await pg.waitForTimeout(700);
      const o = await pg.evaluate(scanFn, '#battle');
      if (o && o.length) { b3 += o.length; bad('B3 视口 ' + vw2 + 'x' + vh2 + ' 越界', o.slice(0, 3).join(' | ')); }
    }
    if (!b3) ok('B3 视口变化无越界');

    /* B5 技能栏塞满 8 个技能（技能随升级增加，最多可能换行挤压） */
    const sk = await pg.evaluate(() => {
      const box = document.getElementById('btSkills');
      if (!box) return null;
      const keep = box.innerHTML;
      box.innerHTML = '';
      for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'bs'; d.textContent = i + 1; box.appendChild(d); }
      const vw = innerWidth, vh = innerHeight;
      const bad = [];
      Array.from(box.children).forEach((c) => {
        const r = c.getBoundingClientRect();
        if (r.right - vw > 1 || r.bottom - vh > 1 || r.left < -1 || r.top < -1)
          bad.push('技能' + ' oR=' + Math.round(r.right - vw) + ' oB=' + Math.round(r.bottom - vh));
      });
      const br = box.getBoundingClientRect();
      const sized = Array.from(box.children).filter((c) => { const r = c.getBoundingClientRect(); return r.width > 1 && r.height > 1; }).length;
      const res = { bad, n: box.children.length, sized, h: Math.round(br.height), bottom: Math.round(br.bottom), vh };
      box.innerHTML = keep;
      return res;
    });
    if (!sk) bad('B5 取不到技能栏');
    else if (sk.sized < 8) bad('B5 技能按钮未渲染出可见盒子', '渲染' + sk.n + ' 可见' + sk.sized);
    else if (sk.bad.length) bad('B5 技能栏塞满越界', sk.bad.slice(0, 3).join(' | '));
    else ok('B5 技能栏塞满8个不越界（高' + sk.h + ' 底' + sk.bottom + '/' + sk.vh + '）');

    /* B7 画布比例：显示宽高比必须等于逻辑宽高比
     * 历史事故：逻辑 H 被抬到 520 而画布 CSS 高 393 → 画面纵向压扁 0.756，
     *           防线 wallY=424 落在可视区外，玩家看不见自己的防线。
     * 这类"变形/跑出画面"不产生 DOM 越界，只有比例断言能抓到。 */
    const rf = await pg.evaluate(() => {
      const cv = document.getElementById('C'); if (!cv) return null;
      const r = cv.getBoundingClientRect();
      const B = window.BT;
      return { dw: r.width, dh: r.height, lw: B.W, lh: B.H, scale: B._cvScale,
        wallY: Math.round(B.wallY || -1), vh: innerHeight };
    });
    if (!rf) bad('B7 取不到画布');
    else {
      const rd = rf.lh > 0 ? (rf.dw / rf.dh) : 0, rl = rf.lh > 0 ? (rf.lw / rf.lh) : 0;
      const gap = rl > 0 ? Math.abs(rd - rl) / rl : 1;
      if (gap > 0.02) bad('B7 画布显示比例与逻辑比例不符', '显示比' + rd.toFixed(3) + ' 逻辑比' + rl.toFixed(3) + ' 偏差' + (gap * 100).toFixed(1) + '%');
      else {
        /* wallY 是【逻辑坐标】，整层等比缩放后要换算到显示坐标再比：
         * 852x393 横屏：逻辑 H=520、scale=0.756 → wallY 424 显示位 = 320 < 393，在屏内。
         * 直接用逻辑值比显示高会把正常缩放误判成"防线出屏"。 */
        const sc = (rf.scale && rf.scale > 0) ? rf.scale : 1;
        const visWall = rf.wallY * sc;
        if (visWall > rf.dh + 1) bad('B7 防线落在可视区外', '逻辑wallY=' + rf.wallY + ' scale=' + sc.toFixed(3) + ' 显示位=' + Math.round(visWall) + ' 画布高=' + Math.round(rf.dh));
        else ok('B7 画布比例一致（' + rd.toFixed(3) + ' vs ' + rl.toFixed(3) + '，防线显示位' + Math.round(visWall) + '/' + Math.round(rf.dh) + '）');
      }
    }

    /* B8 震屏变换漂移：draw() 的 save/restore 必须严格配对
     * 【V1.3.72111111 线上事故】
     *   draw() 开头 if (_shk || _jsh) 才 save，结尾却 if (_shk) 才 restore。
     *   只有 JUICE 震屏（暴击/击杀/受伤/BOSS登场）而无开火后坐力时 save 不配对，
     *   translate 残留逐帧叠加 → 实测每帧 (8,-6)，10 帧累计偏移 80,-60。
     *   玩家看到的就是「战斗画面打着打着往一个方向漂，最后跑出屏幕」。
     *   这是纯 canvas 内部状态，DOM 越界扫描（B1/B3/B5/B6）一条都抓不到。 */
    const dr = await pg.evaluate(() => {
      const c = window.BT && BT.ctx; if (!c) return null;
      if (!window.JUICE) return 'nojuice';
      const seq = [];
      for (let i = 0; i < 10; i++) {
        try {
          JUICE.shT = 0.5; JUICE.shDur = 0.5; JUICE.shX = 8; JUICE.shY = -6;
          if (BT.run) BT.run.shakeT = 0;          /* 只留 JUICE 震屏：_shk=0, _jsh=1 */
          BT.draw();
          const t = c.getTransform ? c.getTransform() : null;
          seq.push(t ? +(Math.abs(t.e) + Math.abs(t.f)).toFixed(1) : -1);
        } catch (e) { return 'err:' + e.message; }
      }
      return seq;
    });
    if (dr === null) bad('B8 取不到画布上下文');
    else if (typeof dr === 'string') bad('B8 前提不满足', String(dr));
    else if (dr[dr.length - 1] > 2) bad('B8 震屏变换未还原（画面会逐帧漂移）',
      '逐帧漂移=' + dr.join(',') + ' 末帧=' + dr[dr.length - 1]);
    else ok('B8 震屏变换逐帧归零（末帧漂移=' + dr[dr.length - 1] + '）');

    await ctx.close();
  }
  await b.close();
  console.log('\n[btlayout] PASS ' + PASS + ' / FAIL ' + FAIL + ' / PREREQ ' + PREREQ);
  /* 落盘结果供进度看板读取：不落盘则看板只能显示「未跑」，无法每轮必报 */
  try { require('fs').writeFileSync(require('path').join(ROOT, 'tools', '.btlast.json'),
    JSON.stringify({ pass: PASS, fail: FAIL, prereq: PREREQ, at: new Date().toISOString() })); } catch (e) {}
  /* 退出码语义（AX：Agent 必须能可靠判断）：
   *   0 = 全过；1 = 真缺陷（越界/漂移，必须修）；2 = 前提未就绪（环境问题，需重跑） */
  process.exit(FAIL ? 1 : (PREREQ ? 2 : 0));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
