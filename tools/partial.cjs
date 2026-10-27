#!/usr/bin/env node
/* 真实旧存档场景：字段缺失的存档 → 走官方 E.sanitize 兜底 → 开全部面板 */
const { chromium } = require('playwright');
const PANELS = ['shop','role','bag','gun','chip','task','core','codex','base','legion',
  'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport:{width:393,height:852} });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0,140)));
  await pg.goto('http://127.0.0.1:8951/index.html', { waitUntil:'load' });
  await pg.waitForTimeout(1800);
  await pg.evaluate(async () => {
    localStorage.setItem('zb_uid','ZZ_PART');
    try { await window.MAIN.login('部分字段','男'); } catch(e){}
  });
  await pg.waitForTimeout(2500);

  const keys = await pg.evaluate(() => { window.__SNAP = JSON.stringify(window.P); return Object.keys(window.P||{}); });
  const bad = [];
  for (const k of keys) {
    const e0 = errs.length;
    const r = await pg.evaluate(({kk, PANELS}) => {
      const out = [];
      const tgt = (window.UI && UI.P) || window.P;
      for (const q of Object.keys(tgt)) delete tgt[q];
      Object.assign(tgt, JSON.parse(window.__SNAP));
      delete tgt[kk];
      // 关键：走官方读档兜底
      try { E.sanitize(tgt); } catch(e){ return ['sanitize抛:'+e.message.slice(0,60)]; }
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
  console.log('\n=== 缺失字段 + sanitize 后仍异常 ===');
  bad.forEach(x => console.log('  ' + x));
  console.log('共 %d 处 / %d 字段', bad.length, keys.length);
  await b.close();
})().catch(e => console.log('FATAL', e.message));
