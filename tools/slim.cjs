// 细长文字块全量探测：找出被挤成"一字一行"的文本元素
const { chromium } = require('playwright');
const WIDTHS = [320, 393];
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--disable-dev-shm-usage'] });
  let total = 0;
  for (const W of WIDTHS) {
    const pg = await b.newPage({ viewport:{width:W,height:852} });
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0,80)));
    await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'load'});
    await pg.waitForTimeout(2200);
    // 用满配账号（数据多，最容易暴露挤压）
    await pg.evaluate(async()=>{
      localStorage.setItem('zb_uid','ZZ_SLIM');
      try{ await window.MAIN.login('视觉审查','男'); }catch(e){}
    });
    await pg.waitForTimeout(2500);
    // 塞满数据
    await pg.evaluate(()=>{
      try{
        const P = window.P; if(!P) return;
        for(let i=0;i<40;i++) P.bag.push({k:'M0'+(1+i%4), n:40+i*3});
      }catch(e){}
    });
    await pg.evaluate(()=>{ try{ UI.show('home'); }catch(e){} });
    await pg.waitForTimeout(700);

    const panels=['shop','role','bag','gun','chip','task','core','codex','base','legion','talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];
    const hits = [];
    for(const k of panels){
      try{
        await pg.evaluate(kk=>{ try{ UI.open(kk); }catch(e){} }, k);
        await pg.waitForTimeout(650);
        const r = await pg.evaluate(()=>{
          const root=document.getElementById('panel');
          if(!root) return null;
          const vis = el => { const r=el.getBoundingClientRect(); return r.width>1 && r.height>1; };
          const scope = root;
          const bad = [];
          scope.querySelectorAll('*').forEach(el=>{
            // 只看直接含文本的叶子节点
            if(el.children.length>0) return;
            const t=(el.textContent||'').trim();
            if(t.length<4) return;                 // 太短不算（"OK"等）
            if(!vis(el)) return;
            const r=el.getBoundingClientRect();
            const cs=getComputedStyle(el);
            if(cs.overflow==='hidden' && cs.textOverflow==='ellipsis') return; // 有意省略号
            const fs=parseFloat(cs.fontSize)||12;
            // 一字一行的判据：高度 > 宽度，且高度 >= 3 行
            const lines = r.height/(fs*1.35);
            if(lines>=3 && r.height > r.width*1.2){
              bad.push({w:Math.round(r.width),h:Math.round(r.height),ar:+(r.height/r.width).toFixed(1),t:t.slice(0,22)});
            }
          });
          return bad;
        });
        if(r && r.length) hits.push({panel:k, items:r});
      }catch(e){}
    }
    console.log('\n===== 屏宽 '+W+' =====');
    if(!hits.length) console.log('  细长块 0');
    hits.forEach(h=>{
      console.log('  ['+h.panel+']');
      h.items.slice(0,6).forEach(it=>console.log('     '+it.w+'x'+it.h+' (比'+it.ar+') "'+it.t+'"'));
      total += h.items.length;
    });
    if(errs.length) console.log('  JS错误:', errs.slice(0,3));
    await pg.close();
  }
  console.log('\n合计细长文字块: '+total);
  await b.close();
})();
