const { chromium } = require('playwright');
const PANELS = ['shop','role','bag','gun','chip','task','core','codex','base','legion',
                'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport:{width:393,height:852} });
  await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'load'});
  await pg.waitForTimeout(2500);

  const scan = async (label) => {
    const bad = await pg.evaluate(()=>{
      const out=[];
      document.querySelectorAll('*').forEach(el=>{
        const cs=getComputedStyle(el);
        const t=cs.transform;
        if(!t||t==='none') return;
        let m;
        if(t.startsWith('matrix3d')) m=t.slice(9,-1).split(',').map(Number);
        else if(t.startsWith('matrix')) { const a=t.slice(7,-1).split(',').map(Number);
          m=[a[0],a[1],0,0,a[2],a[3],0,0,0,0,1,0,a[4],a[5],0,1]; }
        else return;
        // 检测翻转：m11<0 或 m22<0 ；或旋转角绝对值 > 20°
        let flip=false, ang=0;
        if(m[0] < -0.001 || m[5] < -0.001) flip=true;
        ang = Math.abs(Math.atan2(m[1],m[0])*180/Math.PI);
        if(ang>20 || flip){
          const r=el.getBoundingClientRect();
          if(r.width<2||r.height<2) return;
          const txt=(el.textContent||'').trim().slice(0,20);
          out.push({tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,32),
            id:el.id, ang:+ang.toFixed(1), flip, txt, size:Math.round(r.width)+'x'+Math.round(r.height)});
        }
      });
      return out;
    });
    if(bad.length) console.log('\n### '+label+' -> '+bad.length+' 处');
    bad.forEach(x=>console.log('   ', JSON.stringify(x)));
    return bad.length;
  };

  let total = await scan('登录屏');
  await pg.evaluate(async()=>{ localStorage.setItem('zb_uid','ZZ_AUD');
    try{ await window.MAIN.login('视觉审查','男'); }catch(e){} });
  await pg.waitForTimeout(2600);
  await pg.evaluate(()=>{ try{ UI.show && UI.show('home'); }catch(e){} });
  await pg.waitForTimeout(700);
  total += await scan('主界面');
  for (const k of PANELS) {
    await pg.evaluate(kk=>{ try{ UI.open(kk); }catch(e){} }, k);
    await pg.waitForTimeout(420);
    total += await scan('面板:'+k);
  }
  // 战斗
  await pg.evaluate(()=>{ try{ UI.close&&UI.close(); }catch(e){} });
  await pg.waitForTimeout(300);
  total += await scan('战斗');
  console.log('\n===== 合计异常 '+total+' 处 =====');
  await b.close();
})();
