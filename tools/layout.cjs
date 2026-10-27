// 全量布局体检：细长文字块 / 元素重叠 / 越界 / 异常文本 / 破图
const { chromium } = require('playwright');
const WIDTHS = process.argv[2] ? process.argv[2].split(',').map(Number) : [393];
const PANELS = ['shop','role','bag','gun','chip','task','core','codex','base','legion',
                'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage'] });
  let grand = {slim:0, ovl:0, out:0, nan:0, broken:0, err:0};
  for (const W of WIDTHS) {
    const pg = await b.newPage({ viewport:{width:W,height:852} });
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0,100)));
    await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'load'});
    await pg.waitForTimeout(1800);
    await pg.evaluate(async()=>{
      localStorage.setItem('zb_uid','ZZ_AUD');
      try{ await window.MAIN.login('视觉审查','男'); }catch(e){}
    });
    await pg.waitForTimeout(2400);
    await pg.evaluate(()=>{ try{ UI.show && UI.show('home'); }catch(e){} });
    await pg.waitForTimeout(600);

    console.log('\n########## 屏宽 '+W+' ##########');
    for (const k of PANELS) {
      let r;
      try {
        await pg.evaluate(kk=>{ try{ UI.open(kk); }catch(e){} }, k);
        await pg.waitForTimeout(520);
        r = await pg.evaluate(() => {
          const root = document.getElementById('panel');
          if(!root) return {skip:1};
          const vis = el => { const r=el.getBoundingClientRect();
            return r.width>1 && r.height>1 && getComputedStyle(el).visibility!=='hidden'; };
          const bad = {slim:[], ovl:[], out:[], nan:[], broken:[]};

          // 1) 细长文字块
          root.querySelectorAll('*').forEach(el=>{
            if(el.children.length>0) return;
            const t=(el.textContent||'').trim(); if(t.length<4) return;
            if(!vis(el)) return;
            const rc=el.getBoundingClientRect(), cs=getComputedStyle(el);
            if(cs.textOverflow==='ellipsis') return;
            const fs=parseFloat(cs.fontSize)||12;
            if(rc.height/(fs*1.35)>=3 && rc.height>rc.width*1.2)
              bad.slim.push(Math.round(rc.width)+'x'+Math.round(rc.height)+' '+t.slice(0,18));
          });

          // 2) 相邻兄弟元素重叠（同一父容器下，非定位元素互相压）
          root.querySelectorAll('*').forEach(par=>{
            const kids=[...par.children].filter(vis);
            for(let i=0;i<kids.length;i++) for(let j=i+1;j<kids.length;j++){
              const a=kids[i].getBoundingClientRect(), c=kids[j].getBoundingClientRect();
              const st=getComputedStyle(kids[i]), st2=getComputedStyle(kids[j]);
              // 只查普通流内元素（静态/相对定位），绝对定位的浮层不算
              if(st.position==='absolute'||st2.position==='absolute'||
                 st.position==='fixed'||st2.position==='fixed') continue;
              // 行内元素跨行时并集框天然相交，属误报，只看块级/行内块
              if(st.display==='inline'||st2.display==='inline') continue;
              const ox=Math.min(a.right,c.right)-Math.max(a.left,c.left);
              const oy=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);
              if(ox>3 && oy>3){
                const area=Math.round(ox)+'x'+Math.round(oy);
                bad.ovl.push(area+' <'+kids[i].tagName.toLowerCase()+'.'+(kids[i].className||'')+
                  '> vs <'+kids[j].tagName.toLowerCase()+'.'+(kids[j].className||'')+'>');
              }
            }
          });

          // 3) 子元素横向越出面板
          const pb=root.getBoundingClientRect();
          root.querySelectorAll('*').forEach(el=>{
            if(!vis(el)) return;
            const rc=el.getBoundingClientRect();
            if(rc.right>pb.right+2 || rc.left<pb.left-2)
              bad.out.push(Math.round(rc.left)+'~'+Math.round(rc.right)+' 越界 <'+
                el.tagName.toLowerCase()+'.'+(el.className||'').toString().slice(0,22)+'>');
          });

          // 4) 异常文本
          const all=root.innerText||'';
          ['NaN','undefined','[object Object]','null','Infinity'].forEach(w=>{
            if(all.includes(w)) bad.nan.push(w);
          });

          // 5) 破图
          root.querySelectorAll('img').forEach(im=>{
            if(im.src && !im.complete) return;
            if(im.src && im.naturalWidth===0) bad.broken.push(im.src.slice(-40));
          });
          return bad;
        });
      } catch(e){ continue; }
      if(!r || r.skip) continue;
      const tot = r.slim.length+r.ovl.length+r.out.length+r.nan.length+r.broken.length;
      if(tot===0) continue;
      console.log('  ['+k+']');
      if(r.slim.length){ console.log('    细长块 '+r.slim.length+':'); r.slim.slice(0,4).forEach(x=>console.log('      '+x)); grand.slim+=r.slim.length; }
      if(r.ovl.length){ console.log('    重叠 '+r.ovl.length+':'); r.ovl.slice(0,4).forEach(x=>console.log('      '+x)); grand.ovl+=r.ovl.length; }
      if(r.out.length){ console.log('    越界 '+r.out.length+':'); r.out.slice(0,4).forEach(x=>console.log('      '+x)); grand.out+=r.out.length; }
      if(r.nan.length){ console.log('    异常文本: '+r.nan.join(',')); grand.nan+=r.nan.length; }
      if(r.broken.length){ console.log('    破图 '+r.broken.length+': '+r.broken.slice(0,2)); grand.broken+=r.broken.length; }
    }
    grand.err += errs.length;
    if(errs.length) console.log('  JS错误: '+errs.slice(0,3).join(' | '));
    await pg.close();
  }
  console.log('\n合计: 细长'+grand.slim+' 重叠'+grand.ovl+' 越界'+grand.out+
              ' 异常文本'+grand.nan+' 破图'+grand.broken+' JS错误'+grand.err);
  await b.close();
})();
