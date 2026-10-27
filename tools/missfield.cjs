#!/usr/bin/env node
/**
 * 缺字段旧存档兼容测试
 * 逐个删除存档字段（模拟老版本存档 / 后台改档遗漏），打开全部面板，
 * 检查是否抛异常 / 界面出现 undefined / NaN / [object Object]。
 *
 * 性能：先把原始存档做 JSON 快照，每个字段测完直接恢复，
 *      避免每轮重新登录（原实现 81 字段要跑十几分钟）。
 */
const { chromium } = require('playwright');
const PANELS = ['shop','role','bag','gun','chip','task','core','codex','base','legion',
  'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];

(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport:{width:393,height:852} });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0,150)));
  pg.on('console', m => { if (m.type()==='error') {
    const s = m.text().slice(0,120);
    if (!/Failed to load|net::ERR|CORS|gh-proxy|404/i.test(s)) errs.push('con:'+s);
  }});
  await pg.goto('http://127.0.0.1:8951/index.html', { waitUntil:'load' });
  await pg.waitForTimeout(1800);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid','ZZ_MISS');
    try { await window.MAIN.login('缺字段测试','男'); } catch(e){}
  });
  await pg.waitForTimeout(2500);

  const keys = await pg.evaluate(() => {
    /* 关键：UI.P 是登录时赋值的【引用快照】，只替换 window.P 不会改变 UI.P，
     * 那样本测试会变成"什么都没删"的假通过。必须原地改 UI.P 指向的同一个对象。 */
    const tgt = (window.UI && UI.P) || window.P;
    window.__TGT = tgt;
    window.__SNAP = JSON.stringify(tgt);
    window.__MATCH = (tgt === window.P);
    return Object.keys(tgt || {});
  });
  console.log('存档字段数:', keys.length, '| UI.P===window.P:', await pg.evaluate(()=>window.__MATCH));

  const bad = [];
  for (const k of keys) {
    const e0 = errs.length;
    const r = await pg.evaluate(({kk, PANELS}) => {
      const out = [];
      // 每轮先还原到【同一个对象】，保证只缺这一个字段
      const tgt = window.__TGT;
      try {
        for (const k of Object.keys(tgt)) delete tgt[k];
        Object.assign(tgt, JSON.parse(window.__SNAP));
      } catch(e){ return ['restore失败']; }
      if (!(kk in tgt)) return ['字段本来就缺失'];
      try { delete tgt[kk]; } catch(e){ out.push('del:'+e.message); }
      if (kk in tgt) return ['删不掉(不可配置)'];
      for (const p of PANELS) {
        try { UI.open(p); } catch(e){ out.push(p+':THROW '+String(e.message).slice(0,60)); continue; }
        const root = document.getElementById('panel');
        const t = root ? root.innerText : '';
        const m = t.match(/undefined|NaN|\[object Object\]/);
        if (m) out.push(p+':BADTEXT('+m[0]+')');
      }
      return out;
    }, {kk:k, PANELS});
    if (r && r.length) bad.push(k + ' -> ' + r.join(' ; '));
    if (errs.length > e0) bad.push(k + ' -> ERR ' + errs.slice(e0).join(' ; '));
  }
  console.log('\n=== 缺字段导致异常 ===');
  bad.forEach(x => console.log('  ' + x));
  console.log('共 %d 处', bad.length);
  await b.close();
})().catch(e => console.log('FATAL', e.message));
