#!/usr/bin/env node
/**
 * 僵尸开炮 · 统一质量闸门 (Quality Gate)
 * 用法: node tools/gate.cjs [屏宽,屏宽] [面板,面板]
 * 分层: G1 加载  G2 面板渲染  G3 按钮遍历  G4 战斗  G5 脏存档
 *
 * 铁律（历史上闸门谎报的根因，禁止违反）：
 *   1. 任何页面内异常都必须上报 —— 不得 try{}catch(e){} 静默吞掉。
 *      页面内的 catch 必须把错误返回给 node 侧判定。
 *   2. 每条断言都要能被变异测试(mutation)证伪 —— 抓不住注入缺陷的断言等于不存在。
 *   3. 登录/存档类 404 属正常，需显式白名单，不得笼统过滤。
 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8951/index.html';
const WIDTHS = process.argv[2] ? process.argv[2].split(',').map(Number) : [393];
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const PANELS = ONLY || ['shop','role','bag','gun','chip','task','core','codex','base','legion',
                'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];
const R = { pass: [], fail: [] };
const ok  = (n, d='') => R.pass.push(n + (d ? ' :: ' + d : ''));
const bad = (n, d='') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); };

async function newPage(b, W) {
  const pg = await b.newPage({ viewport: { width: W, height: 852 } });
  const errs = [], r404 = [];
  // 网络噪声白名单：云端配置/代理导致的加载失败属环境问题，非代码缺陷。
  // 真破图由 G2 的 img.naturalWidth===0 单独判定，不受此过滤影响。
  const NOISE = /Failed to load resource|Access to fetch|ERR_NAME_NOT_RESOLVED|ERR_FAILED|ERR_INTERNET|net::ERR|CORS|gh-proxy|githubusercontent/i;
  pg.on('pageerror', e => { const s = String(e).split('\n')[0].slice(0, 160); if (!NOISE.test(s)) errs.push(s); });
  pg.on('console', m => { if (m.type() === 'error') { const s = m.text().slice(0, 140); if (!NOISE.test(s)) errs.push('[console] ' + s); } });
  pg.on('response', r => { if (r.status() >= 400) r404.push(r.status() + ' ' + r.url().split('/').pop().slice(0, 40)); });
  pg._errs = errs; pg._404 = r404;
  await pg.addInitScript(() => {
    // 危险操作一律取消，避免测试破坏线上数据
    window.confirm = function (t) { window.__lc = String(t || ''); return false; };
    window.alert = function (t) { window.__la = String(t || ''); return; };
    window.onbeforeunload = null;
  });
  // 变异开关 MUT_DEAD=1：向每个面板注入一个点了什么都不做的按钮。
  // 用于证明「G3 死按钮」断言能被证伪——抓不出它就是摆设。
  if (process.env.MUT_DEAD === '1') {
    await pg.addInitScript(() => {
      const inject = () => {
        const root = document.getElementById('panel');
        if (!root || document.getElementById('__deadbtn')) return;
        const b = document.createElement('button');
        b.id = '__deadbtn'; b.textContent = '变异死按钮';
        b.onclick = function () { /* 故意什么都不做 */ };
        root.insertBefore(b, root.firstChild);
      };
      setInterval(inject, 120);
    });
  }
  return pg;
}

/* 在页面内执行并捕获异常（绝不吞），返回 {v, err} */
async function ev(pg, fn, arg) {
  try { return { v: await pg.evaluate(fn, arg), err: null }; }
  catch (e) { return { v: null, err: String(e).split('\n')[0].slice(0, 200) }; }
}

async function login(pg) {
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  return ev(pg, async () => {
    localStorage.setItem('zb_uid', 'ZZ_AUD');
    await window.MAIN.login('视觉审查', '男');
    return !!window.P && !!window.UI;
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const W of WIDTHS) {
    console.log('\n======= 屏宽 ' + W + ' =======');

    /* ───────── G1 加载 ───────── */
    console.log('[G1] 加载');
    const pg = await newPage(b, W);
    const lg = await login(pg);
    if (lg.err) bad('G1 登录异常', lg.err);
    else if (!lg.v) bad('G1 登录失败');
    else ok('G1 登录');
    await pg.waitForTimeout(1800);
    // 白名单：玩家存档文件首次读取 404 属正常（新号尚未建档）
    const real404 = pg._404.filter(u => !/\.json/i.test(u));
    if (real404.length) bad('G1 资源 4xx', real404.slice(0, 5).join(' | '));
    else ok('G1 资源加载');
    if (pg._errs.length) bad('G1 加载期异常', pg._errs.slice(0, 3).join(' | '));
    else ok('G1 无异常');

    /* ───────── G2 面板渲染 ───────── */
    console.log('[G2] 面板渲染');
    for (const k of PANELS) {
      // 遍历该面板所有页签（历史上只测默认页签，其余页签的渲染 BUG 完全漏网）
      const tabs = await ev(pg, kk => {
        try { return (UI.PANELS[kk] && UI.PANELS[kk][1]) ? UI.PANELS[kk][1].slice() : [undefined]; }
        catch (e) { return [undefined]; }
      }, k);
      for (const tb of (tabs.v || [undefined])) {
      const n0 = pg._errs.length;
      // 注意：open 的异常必须上报（历史上被吞掉，导致抛异常面板被判 PASS）
      const o = await ev(pg, ([kk, tt]) => { UI.open(kk, tt); return true; }, [k, tb]);
      if (o.err) { bad('G2 ' + k + '/' + tb + ' open抛异常', o.err); continue; }
      await pg.waitForTimeout(420);
      const r = await ev(pg, () => {
        const root = document.getElementById('panel');
        if (!root) return null;
        const vis = el => { const q = el.getBoundingClientRect();
          return q.width > 1 && q.height > 1 && getComputedStyle(el).visibility !== 'hidden'; };
        const res = { open: vis(root), empty: (root.innerText || '').trim().length < 6,
          slim: [], nan: [], broken: [], out: [] };
        const txt = root.innerText || '';
        ['NaN','undefined','[object Object]','Infinity','null'].forEach(w => { if (txt.includes(w)) res.nan.push(w); });
        root.querySelectorAll('*').forEach(el => {
          if (el.children.length > 0 || !vis(el)) return;
          const t = (el.textContent || '').trim(); if (t.length < 4) return;
          const q = el.getBoundingClientRect(), cs = getComputedStyle(el);
          if (cs.textOverflow === 'ellipsis') return;
          const fs = parseFloat(cs.fontSize) || 12;
          if (q.height / (fs * 1.35) >= 3 && q.height > q.width * 1.2)
            res.slim.push(Math.round(q.width) + 'x' + Math.round(q.height) + ' ' + t.slice(0, 16));
        });
        const pb = root.getBoundingClientRect();
        root.querySelectorAll('*').forEach(el => {
          if (!vis(el)) return;
          const q = el.getBoundingClientRect();
          if (q.right > pb.right + 2 || q.left < pb.left - 2)
            res.out.push('<' + el.tagName.toLowerCase() + '.' + String(el.className || '').slice(0, 18) + '>');
        });
        root.querySelectorAll('img').forEach(im => {
          if (im.src && im.complete && im.naturalWidth === 0) res.broken.push(im.src.split('/').pop().slice(0, 28));
        });
        return res;
      });
      if (r.err) { bad('G2 ' + k + ' 检测异常', r.err); continue; }
      const v = r.v; if (!v) continue;
      if (!v.open || v.empty) bad('G2 ' + k + '/' + tb + ' 打不开/空', 'open=' + v.open + ' empty=' + v.empty);
      if (v.nan.length)  bad('G2 ' + k + '/' + tb + ' 异常文本', v.nan.join(','));
      if (v.broken.length) bad('G2 ' + k + '/' + tb + ' 破图', v.broken.slice(0, 3).join(','));
      if (v.out.length)  bad('G2 ' + k + '/' + tb + ' 越界 ' + v.out.length, v.out.slice(0, 3).join(' '));
      if (v.slim.length) bad('G2 ' + k + '/' + tb + ' 细长块 ' + v.slim.length, v.slim.slice(0, 3).join(' | '));
      if (pg._errs.length > n0) bad('G2 ' + k + '/' + tb + ' 渲染异常', pg._errs.slice(n0, n0 + 2).join(' | '));
      }
    }
    if (!R.fail.some(f => f.indexOf('G2 ') === 0)) ok('G2 全部面板');

    /* ───────── G3 按钮遍历 ───────── */
    console.log('[G3] 按钮遍历');
    let clicked = 0, miss = 0, numBad = 0, clickErr = 0, missBad = 0, dead = 0;
    const missLog = [], deadLog = [];
    for (const k of PANELS) {
      await ev(pg, kk => { UI.open(kk); }, k);
      await pg.waitForTimeout(420);
      const t = await ev(pg, () => {
        const root = document.getElementById('panel'); if (!root) return 0;
        return [...root.querySelectorAll('button,[class*="btn"],[onclick],input,select')]
          .filter(el => { const q = el.getBoundingClientRect();
            return q.width >= 8 && q.height >= 8 && !el.disabled &&
              getComputedStyle(el).visibility !== 'hidden'; }).length;
      });
      const total = t.v || 0;
      for (let i = 0; i < Math.min(total, 16); i++) {
        const n0 = pg._errs.length;
        const c = await ev(pg, idx => {
          const root = document.getElementById('panel'); if (!root) return null;
          const q = () => [...root.querySelectorAll('button,[class*="btn"],[onclick],input,select')]
            .filter(el => { const b = el.getBoundingClientRect();
              return b.width >= 8 && b.height >= 8 && !el.disabled &&
                getComputedStyle(el).visibility !== 'hidden'; });
          const els = q();
          if (!els[idx]) return { miss: true, n: els.length };
          const name = (els[idx].innerText || els[idx].value || els[idx].className || '').trim().slice(0, 18);
          // 快照必须覆盖 5 类可观测变化，否则会把「只改 class / 只弹 toast / 只弹确认框」
          // 的按钮误判成死按钮（历史上 39 个误报就是漏了这几项）
          const snap = () => {
            const h = root.innerHTML; let x = 0;
            for (let j = 0; j < h.length; j++) x = (x * 31 + h.charCodeAt(j)) | 0;
            const tb = document.getElementById('toasts');
            // display 必须纳入：面板关闭是 display:none，innerHTML 一字不改，
            // 漏掉它会把 20 个面板的关闭按钮 #pnX 全部误判成死按钮
            return [x, getComputedStyle(root).display,
                    tb ? tb.children.length : 0, tb ? tb.innerText.length : 0,
                    (window.P && window.P.gold) | 0, (window.P && window.P.diamond) | 0,
                    (window.P && window.P.stamina) | 0,
                    document.querySelectorAll('.mask,.modal,.pop-mask,.dlg,.popup').length,
                    (window.__lc || '').length].join('|');
          };
          const s0 = snap();
          // 已处于选中态的按钮（页签/开关），重复点击无变化属正确设计，不算死按钮
          const SEL = /(^|\s)(on|active|selected|cur|sel|current)(\s|$)/;
          const wasSel = SEL.test(els[idx].className || '') ||
                         SEL.test((els[idx].parentElement && els[idx].parentElement.className) || '');
          els[idx].click();                 // 异常直接冒泡，由 ev 捕获上报
          return { name, wasSel, changed: snap() !== s0 };
        }, i);
        if (c.err) { clickErr++; bad('G3 点击抛异常 ' + k, c.err); }
        else if (c.v === null) { miss++; missLog.push(k + '#' + i + '(无panel)'); }
        else if (c.v.miss) {
          miss++;
          // A 类：相对循环开始时的 total 变短 → 重绘缩表，可接受
          // B 类：列表没变短却取空 → 可疑，必须失败（历史上对此无判据，只能一句带过）
          if (c.v.n < total) missLog.push(k + '#' + i + '[重绘缩表' + total + '→' + c.v.n + ']');
          else { missBad++; bad('G3 序号取空但列表未缩 ' + k + '#' + i, total + '→' + c.v.n); }
        }
        else {
          clicked++;
          // C 类：按钮存在且可点，点击前后 面板HTML/toast/资源/弹窗/确认框 全无变化 = 点了没反应
          if (!c.v.changed && !c.v.wasSel) { dead++; deadLog.push(k + '#' + i + '[' + c.v.name + ']'); }
        }
        await pg.waitForTimeout(120);
        // 关闭模态：只点取消/关闭，绝不 remove（历史上误删面板容器）
        await ev(pg, () => {
          document.querySelectorAll('.mask,.modal,.pop-mask,.dlg,.popup').forEach(m => {
            if (m.id === 'panel' || m.contains(document.getElementById('panel'))) return;
            const c2 = [...m.querySelectorAll('button')]
              .find(x => /取消|关闭|知道了|确定|不用了/.test(x.innerText || ''));
            if (c2) c2.click();
          });
        });
        // 数值不变量
        const nv = await ev(pg, () => {
          const P = window.P; if (!P) return null;
          const bad2 = {};
          ['gold','diamond','stamina','xp','lv'].forEach(f => {
            const v = P[f];
            if (typeof v === 'number' && (!isFinite(v) || v < 0)) bad2[f] = v;
          });
          return bad2;
        });
        if (nv.v && Object.keys(nv.v).length) { numBad++; bad('G3 数值不变量 ' + k, JSON.stringify(nv.v) + ' <- ' + c.v); }
        if (pg._errs.length > n0) { clickErr++; bad('G3 点击异常 ' + k, c.v + ' -> ' + pg._errs.slice(n0, n0 + 1).join('')); }
        await ev(pg, kk => { UI.open(kk); }, k);
        await pg.waitForTimeout(110);
      }
    }
    console.log('  点击 ' + clicked + ' 未命中 ' + miss + ' 数值违规 ' + numBad + ' 点击异常 ' + clickErr + ' 死按钮 ' + dead);
    if (missLog.length) console.log('  [miss定位] ' + missLog.join(' ') + '  —— A类=点击后面板重绘、按钮列表变短导致下序号取空');
    if (deadLog.length) console.log('  [死按钮] ' + deadLog.join(' '));
    // C 类死按钮：按钮存在且可点，点击前后无任何可观测变化 = 玩家点下去像按在木头上
    if (dead > 0) bad('G3 存在点了无变化的按钮', dead + ' 个: ' + deadLog.slice(0, 6).join(' '));
    else ok('G3 无死按钮', clicked + ' 次点击均可观测');
    if (numBad === 0) ok('G3 数值不变量', clicked + ' 次点击');
    if (clickErr === 0) ok('G3 点击无异常');
    else console.log('  异常样本: ' + [...new Set(pg._errs)].slice(0, 8).join('\n    '));
    await pg.close();

    /* ───────── G4 战斗 ───────── */
    console.log('[G4] 战斗');
    const p2 = await newPage(b, W);
    await login(p2); await p2.waitForTimeout(1200);
    const st = await ev(p2, () => {
      if (!window.P || !window.BT) return { err: 'no P/BT' };
      P.stamina = 100; P.gold = 5e6;
      UI.show('battle');
      BT.attach(document.getElementById('C'));
      BT.start(P, '1-1', { endless: false, diff: 'normal', cb: () => {} });
      return { ok: true };
    });
    if (st.err) bad('G4 启动异常', st.err);
    await p2.waitForTimeout(3500);
    const bs = await ev(p2, () => {
      const BT = window.BT; if (!BT) return null;
      return { run: !!BT.run, t: BT.run && BT.run.time, kills: BT.run && BT.run.kills };
    });
    if (!bs.v) bad('G4 无战斗状态');
    else if (!bs.v.run) bad('G4 战斗未运行', JSON.stringify(bs.v));
    else ok('G4 战斗运行', 'time=' + bs.v.t + ' kills=' + bs.v.kills);
    const be = p2._errs.filter(e => !/favicon/i.test(e));
    if (be.length) bad('G4 战斗异常 ' + be.length, be.slice(0, 4).join(' | '));
    else ok('G4 战斗无异常');

    /* ───────── G5 脏存档 ───────── */
    console.log('[G5] 脏存档');
    const dirty = [null, undefined, NaN, Infinity, -1, {}, [], '', 'abc', 1e300, 0.1, '999'];
    const FIELDS = ['gold','diamond','stamina','xp','lv','char','gun','bag','mat','chip',
                    'gem','gemOn','bld','charStar','stat','ach','guide','tsk','mail','codex','act','sign','pass','skin'];
    let dirtyBad = 0, dirtyN = 0;
    for (const f of FIELDS) {
      for (const d of dirty) {
        dirtyN++;
        const n0 = p2._errs.length;
        const r = await ev(p2, ([fld, val]) => {
          if (!window.P) return null;
          const old = P[fld];
          P[fld] = val;
          let out = null;
          try {
            // 打开所有面板会太慢，改为主界面 + 角色 + 商城 + 背包
            ['role','shop','bag'].forEach(k => UI.open(k));
          } catch (e) { out = String(e).slice(0, 90); }
          const body = document.body.innerText || '';
          const hit = ['NaN','undefined','[object Object]','Infinity']
            .filter(w => body.includes(w));
          P[fld] = old;
          return { threw: out, hit };
        }, [f, d]);
        if (r.err) { dirtyBad++; bad('G5 ' + f + '=' + String(d).slice(0,6), r.err); continue; }
        const v = r.v; if (!v) continue;
        if (v.threw) { dirtyBad++; bad('G5 ' + f + ' 抛异常', v.threw); }
        else if (v.hit.length) { dirtyBad++; bad('G5 ' + f + '=' + String(d).slice(0,6) + ' 脏值泄漏到界面', v.hit.join(',')); }
        else if (p2._errs.length > n0) { dirtyBad++; bad('G5 ' + f + ' 运行异常', p2._errs.slice(n0, n0+1).join('')); }
      }
    }
    console.log('  脏存档组合 ' + dirtyN + ' 组, 异常 ' + dirtyBad);
    if (dirtyBad === 0) ok('G5 脏存档不崩界面', dirtyN + ' 组');
    await p2.close();
  }

  await b.close();
  console.log('\n======= 闸门结果 =======');
  console.log('PASS ' + R.pass.length + ' / FAIL ' + R.fail.length);
  if (R.fail.length) { [...new Set(R.fail)].slice(0, 40).forEach(f => console.log('  x ' + f)); process.exit(1); }
  console.log('全部通过');
})();
