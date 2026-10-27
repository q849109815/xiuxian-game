#!/usr/bin/env node
/**
 * 僵尸开炮 · "点了没反应" 探测器
 *
 * 维度：面板内【每一个可见按钮】点击后是否产生任何可观测反馈：
 *   - 面板文本变化 / 数据变化 / 弹窗 / toast / 面板切换 / 输入框内容变化
 * 完全无反馈 = 死按钮（玩家点了像坏了一样），是"操作性差"最直接的来源。
 *
 * 铁律（与 gate.cjs 一致）：
 *   1. 页面内异常必须回传，不得静默吞掉。
 *   2. 每条断言都要能被变异测试证伪（tools/mutate_dead.cjs 验证）。
 *   3. 危险操作（注销/删除/清空/永久）跳过，避免破坏数据。
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const W = Number(process.argv[2] || 393);
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const PANELS = ONLY || ['shop', 'role', 'bag', 'gun', 'chip', 'task', 'core', 'codex', 'base',
  'legion', 'talent', 'set', 'rank', 'mail', 'friends', 'act', 'tavern', 'exped', 'ashop', 'gem'];

const R = { pass: [], dead: [], err: [] };

async function newPage(b) {
  const pg = await b.newPage({ viewport: { width: W, height: 852 } });
  const errs = [];
  const NOISE = /Failed to load resource|Access to fetch|ERR_NAME_NOT_RESOLVED|ERR_FAILED|ERR_INTERNET|net::ERR|CORS|gh-proxy|githubusercontent/i;
  pg.on('pageerror', e => { const s = String(e).split('\n')[0].slice(0, 160); if (!NOISE.test(s)) errs.push(s); });
  pg.on('console', m => { if (m.type() === 'error') { const s = m.text().slice(0, 140); if (!NOISE.test(s)) errs.push('[console] ' + s); } });
  pg._errs = errs;
  const MUT = !!process.env.MUT;
  await pg.addInitScript((a) => {
    if (a.mut) window.__MUT = 1;
    if (a.poor) window.__POOR = 1;
    window.confirm = function (t) { window.__cfN = (window.__cfN || 0) + 1; return false; };
    window.alert = function (t) { window.__alN = (window.__alN || 0) + 1; return; };
    window.onbeforeunload = null;
    window.__toasts = [];
  }, { mut: MUT, poor: !!process.env.POOR });
  return pg;
}

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await newPage(b);
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  const lg = await pg.evaluate(async () => {
    localStorage.setItem('zb_uid', 'ZZ_DEAD');
    await window.MAIN.login('死键探测', '男');
    // toast 探针：记录每次提示
    if (window.UI && UI.toast && !UI.__toastHooked) {
      const o = UI.toast.bind(UI);
      UI.toast = function (t, k) { window.__toasts.push(String(t)); return o(t, k); };
      UI.__toastHooked = true;
    }
    /* 满配解锁：锁定态面板（如「芯片系统未解锁」）会让所有按钮都无反应，
     * 既产生假死键、也掩盖真问题。这里把关卡/资源/物品全部拉满。 */
    const P = window.P || {};
    const EX = window.EX || {};
    P.cleared = P.cleared || {};
    (EX.levels || []).forEach(l => { if (l && l.id) P.cleared[l.id] = Math.max(P.cleared[l.id] || 0, 3); });
    P.lv = 80; P.gold = 5e7; P.diamond = 5e6; P.stamina = 100; P.xp = 0;
    P.mat = { M01: 9999, M02: 9999, M03: 9999, M04: 9999, M05: 9999,
              P01: 999, P02: 999, I01: 50, I02: 50, I03: 50, I04: 50 };
    P.gems = { G_R: 5, G_B: 5, G_G: 5, G_P: 5 };
    if (!P.bag || !P.bag.length) {
      P.bag = [];
      for (let i = 0; i < 4; i++) {
        try { const c = E.rollChipByQuality(i % 2 ? '蓝' : '白'); if (c) P.bag.push(c); } catch (e) {}
      }
    }
    P.chips = P.chips || {};
    try { if (window.E && E.save) E.save(P); } catch (e) {}
    return !!(window.P && window.UI);
  });
  if (!lg) { console.log('登录失败'); process.exit(1); }
  await pg.waitForTimeout(1800);

  let TOTAL = 0;
  for (const p of PANELS) {
    const r = await pg.evaluate(async (pid) => {
      const out = { panel: pid, btns: [], skip: 0, miss: 0, dis: 0, tab: 0, mutset: !!window.__MUT };
      try { window.UI.open(pid); } catch (e) { return { panel: pid, err: 'open: ' + e.message }; }
      await new Promise(r2 => setTimeout(r2, 600));
      const box = document.getElementById('panel');
      if (!box) return { panel: pid, err: 'no #panel' };
      const snap = () => {
        const P = window.P || {};
        return JSON.stringify({
          t: (box.innerText || '').slice(0, 4000),
          g: P.gold, d: P.diamond, s: P.stamina, x: P.xp, lv: P.lv,
          m: JSON.stringify(P.mat || {}), bg: (P.bag || []).length,
          gm: JSON.stringify(P.gems || {}), ac: P.ach, ev: P.evToken,
          ti: (P.titles || []).length, sk: (P.skins || []).length,
          pd: JSON.stringify(P.pendingItem || {}),
          // 弹窗/模态是否出现（含军团商店/副本用的 #sweepBox 通用弹层）
          md: document.querySelectorAll('.modal.on,.mask.on,.dialog.on,#result.on,#sweepBox.on').length,
          // 弹层/面板内的文本也要纳入：军团商店开在 #sweepBox，不在 #panel 内
          sx: (document.getElementById('sweepBox') || {}).innerText || '',
          /* 纯视觉变化也要算反馈：选中态只改 class（如 .lvc.cur 高亮），
           * 文本与数据都不变，历史上因此被误报成死键。 */
          cl: Array.from(box.querySelectorAll('*')).map(e => String(e.className || '')).join('|'),
          tt: (window.__toasts || []).length,
          cf: window.__cfN || 0, al: window.__alN || 0,
        });
      };
      const DANGER = /注销|删除|清空|永久|解绑|重置进度|退出登录/;
      const q = () => Array.from(document.getElementById('panel')
        .querySelectorAll('button,.btn,[role=button]')).filter(el => {
        const cs2 = getComputedStyle(el);
        if (cs2.display === 'none' || cs2.visibility === 'hidden') return false;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
        const rc2 = el.getBoundingClientRect();
        return rc2.width >= 8 && rc2.height >= 8;
      });
      const clean = () => {
        document.querySelectorAll('.mask,.modal,.pop-mask,.dlg,.popup').forEach(m => {
          if (m.id === 'panel' || m.contains(document.getElementById('panel'))) return;
          const c2 = [...m.querySelectorAll('button')]
            .find(x => /取消|关闭|知道了|不用了/.test(x.innerText || ''));
          if (c2) c2.click();
        });
      };
      const POOR = window.__POOR;
      const reset = () => {
        const P = window.P || {};
        if (POOR) {
          P.gold = 0; P.diamond = 0; P.stamina = 0; P.mat = {}; P.bag = []; P.gems = {};
          P.pendingItem = {}; return;
        }
        P.gold = 5e7; P.diamond = 5e6; P.stamina = 100;
        P.mat = { M01: 9999, M02: 9999, M03: 9999, M04: 9999, M05: 9999,
                  P01: 999, P02: 999, I01: 50, I02: 50, I03: 50, I04: 50 };
        P.gems = { G_R: 5, G_B: 5, G_G: 5, G_P: 5 };
        if (!P.bag || P.bag.length < 3) {
          P.bag = P.bag || [];
          for (let i = 0; i < 4; i++) {
            try { const c = E.rollChipByQuality(i % 2 ? '\u84dd' : '\u767d'); if (c) P.bag.push(c); } catch (e) {}
          }
        }
      };
      /* 首次 open 常赶上面板入场动画，innerText 取到空串（实测 13 个按钮只有 1 个有文字），
       * 二次 open 后再采集才能拿到完整按钮清单。 */
      try { window.UI.open(pid); } catch (e) {}
      await new Promise(r2 => setTimeout(r2, 700));
      out.raw = q().length;
      out.texts0 = q().map(e=>String((e.innerText||e.textContent||'').trim()).slice(0,20));
      out.mutset = !!window.__MUT;
      /* 按【按钮文字】枚举：点击后面板会整体重渲染、按钮数量也会变，
       * 用下标取会漂移到别的按钮、或整段漏点（实测 16 个按钮只跑到 12 个，
       * 真正的死键被跳过还报"全通过"）。这里先采集文字，再逐个复位、按文字定位。 */
      const texts = [];
      q().forEach(el => {
        const t = (el.innerText || el.textContent || '').trim().slice(0, 30);
        if (!t || DANGER.test(t)) return;
        if (texts.indexOf(t) < 0) texts.push(t);
      });
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        clean(); reset();
        /* 强制回到【第一个页签】：上一次点击可能把页签切走（如点"背包"），
         * 之后按旧文字就再也找不到按钮（实测"装 备 芯 片"因此整轮漏测）。 */
        const t0 = (window.UI.PANELS[pid] && window.UI.PANELS[pid][1] && window.UI.PANELS[pid][1][0]) || undefined;
        try { window.UI.open(pid, t0); } catch (e) {}
        await new Promise(r2 => setTimeout(r2, 340));
        const els = q();
        out.vis = els.length;
        const el = els.find(x => (x.innerText || x.textContent || '').trim().slice(0, 30) === t);
        if (!el) { out.miss++; continue; }
        /* 计数必须在 before 快照【之前】清零：
         * 历史缺陷——先取快照再清零，上一轮残留的提示数(1)与本轮新提示数(1)相等，
         * 于是"只弹提示、不改数据"的按钮被整批误报为死键（实测天赋 8 个全假）。 */
        (window.__toasts || []).length = 0; window.__cfN = 0; window.__alN = 0;
        const before = snap();
        try { el.click(); } catch (e) { out.btns.push({ t: t, r: 'ERR:' + e.message }); continue; }
        await new Promise(r2 => setTimeout(r2, 240));
        const after = snap();
        if (before === after) {
          const cls = String(el.className || '');
          const isTab = /pt|tab|seg|nav/.test(cls);
          /* 已选中项（.cur/.on/.act/.sel）再点一次本就无变化，属设计而非死键。
           * 实测：芯片槽默认选中 c1，点它不动 → 过去被当成死键误报。 */
          if (/\b(cur|on|act|active|sel|selected)\b/.test(cls) && (isTab || /lvc|gcell|eq|gd|st\b/.test(cls))) out.tab++;
          else out.btns.push({ t: t || '(无文字)', r: 'NOOP' });
        } else out.btns.push({ t: t, r: 'ok' });
      }
      return out;
    }, p);
    if (r.err) { console.log('  ! ' + p + ' :: ' + r.err); R.err.push(p + '::' + r.err); continue; }
    TOTAL += (r.btns || []).length;
    const dead = (r.btns || []).filter(x => x.r === 'NOOP');
    const errb = (r.btns || []).filter(x => x.r && x.r.startsWith('ERR'));
    console.log('  ' + p.padEnd(8) + ' 按钮 ' + String(r.btns.length).padStart(3)
      + '  可见 ' + String(r.vis).padStart(3) + ' / 原始 ' + String(r.raw).padStart(3) + ' 禁用 ' + String(r.dis||0).padStart(2) + ' MUT=' + (r.mutset?'Y':'N') + ' 已选页签 ' + String(r.tab||0).padStart(2) + '  死键 ' + dead.length + '  报错 ' + errb.length + (r.skip ? '  (跳过危险 ' + r.skip + ')' : ''));
    dead.forEach(x => console.log('      X 死键: ' + x.t));
    if (process.env.V) console.log('      texts0=' + JSON.stringify(r.texts0));
    if (process.env.V) (r.btns||[]).forEach(x => console.log('      ' + (x.r==='ok'?'.':'?') + ' ' + x.t + ' [' + x.r + ']'));
    errb.forEach(x => console.log('      ! 报错: ' + x.t + ' ' + x.r));
    dead.forEach(x => R.dead.push(p + ' :: ' + x.t));
    errb.forEach(x => R.err.push(p + ' :: ' + x.t + ' ' + x.r));
    R.pass.push(p);
  }

  if (TOTAL === 0) { console.log('\n!! 探测器自检失败：一个按钮都没扫到（面板未打开或选择器错误），结果不可信'); process.exit(2); }
  if (pg._errs.length) { console.log('\n页面异常:'); pg._errs.slice(0, 8).forEach(e => console.log('  ' + e)); }
  console.log('\n===== 汇总 =====');
  console.log('死键 ' + R.dead.length + ' / 点击报错 ' + R.err.length + ' / 页面异常 ' + pg._errs.length);
  await b.close();
  process.exit(R.dead.length || R.err.length || pg._errs.length ? 1 : 0);
})();
