// 脏存档渲染压测：把玩家存档灌入各种异常值，逐个打开面板，看是否崩溃/NaN/白屏
const { chromium } = require('playwright');
const PANELS = ['shop','role','bag','gun','chip','task','core','codex','base','legion',
                'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];

const DIRTY = `(() => {
  const p = window.P; if(!p) return 'noP';
  const bad = [null, undefined, {}, [], 'abc', -1, 0, NaN, Infinity, 1e300, true];
  let n = 0;
  const keys = ['gold','diamond','stamina','lv','xp','power','char','skin','weapon',
    'bag','mat','equip','talent','build','guide','stat','mail','task','act','legion',
    'gemOn','chip','charStar','gunLv','title','frame','avatar','monthEnd','banUntil',
    'signin','adCnt','shopBuy','offlineAt','exped','tavern','codex','ach','skill','skinByChar'];
  keys.forEach(k => {
    if(!(k in p)) return;
    const v = bad[n % bad.length]; n++;
    try { p[k] = v; } catch(e) {}
  });
  return 'set ' + n;
})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport:{width:393,height:852} });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0,120)));
  pg.on('console', m => { if(m.type()==='error') errs.push('con:'+m.text().slice(0,90)); });

  await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'load'});
  await pg.waitForTimeout(1800);
  await pg.evaluate(async()=>{
    localStorage.setItem('zb_uid','ZZ_DIRTY');
    try{ await window.MAIN.login('脏档测试','男'); }catch(e){}
  });
  await pg.waitForTimeout(2400);

  const before = errs.length;
  const r0 = await pg.evaluate(DIRTY);
  console.log('注入: ' + r0);

  const bad = [];
  for (const k of PANELS) {
    const e0 = errs.length;
    let res;
    try {
      await pg.evaluate(kk=>{ try{ UI.open(kk); }catch(e){ throw e; } }, k);
      await pg.waitForTimeout(430);
      res = await pg.evaluate(()=>{
        const root=document.getElementById('panel');
        if(!root) return {open:false};
        const cs=getComputedStyle(root);
        const txt=(root.innerText||'');
        const hits=['NaN','undefined','[object Object]','Infinity'].filter(w=>txt.includes(w));
        const imgs=[...root.querySelectorAll('img')].filter(i=>i.src&&i.complete&&i.naturalWidth===0).length;
        return {open: cs.display!=='none', len: txt.length, hits, imgs};
      });
    } catch(e) {
      res = {open:false, err:String(e).slice(0,80)};
    }
    if (res.err || !res.open || res.hits.length || res.imgs || errs.length>e0) {
      bad.push({panel:k, ...res, newErr: errs.slice(e0)});
    }
  }
  console.log('\n=== 脏档下异常面板 ===');
  if(!bad.length) console.log('  无（全部面板正常渲染）');
  bad.forEach(x=>console.log('  ['+x.panel+'] '+JSON.stringify(x).slice(0,220)));
  console.log('\nJS错误总数: ' + errs.length);
  errs.slice(0,8).forEach(e=>console.log('  '+e));
  await b.close();
})();
