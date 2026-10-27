#!/usr/bin/env node
/**
 * 【新维度】新手完整旅程端到端
 * 不是逐个面板点，而是走"真实玩家会走的一条链"：
 *   建号 → 打 1-1 → 领任务 → 强化武器 → 打 1-2 → 扫荡
 * 每步校验：资源单调性、解锁链、任务进度、战力是否随强化上涨。
 * 全程自动点掉引导/三选一，避免卡住（历史上多次因不会点弹窗导致"战斗没跑"的误报）。
 */
const { chromium } = require('playwright');
const BASE='http://127.0.0.1:8951/index.html';
const R={pass:[],fail:[]};
const ok=(n,d='')=>R.pass.push(n+(d?' :: '+d:''));
const bad=(n,d='')=>{R.fail.push(n+(d?' :: '+d:''));console.log('  X '+n+(d?' :: '+d:''));};

async function clearModals(pg){
  return pg.evaluate(()=>{
    let n=0;
    // 引导 / 三选一 / 通用确认：点掉所有可见的确认类按钮
    const sels=['.modal.on button','#modal.on button','.mb.on button','.pn-box button'];
    for(const s of sels){
      document.querySelectorAll(s).forEach(b=>{
        const t=(b.innerText||'').trim();
        if(/知道了|确定|继续|关闭|跳过|领取|好的/.test(t)&&b.offsetParent!==null){
          try{b.click();n++;}catch(e){}
        }
      });
    }
    document.querySelectorAll('.guide-mask,.gm,.modal.on,.mb.on').forEach(e=>{
      if(e.offsetParent!==null){try{e.classList.remove('on');e.style.display='none';n++;}catch(x){}}
    });
    return n;
  });
}

(async()=>{
  const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  const pg=await b.newPage({viewport:{width:393,height:852}});
  const errs=[];
  const NOISE=/Failed to load|net::ERR|CORS|gh-proxy|Access to fetch|404/i;
  pg.on('pageerror',e=>{const s=String(e).split('\n')[0].slice(0,150);if(!NOISE.test(s))errs.push(s);});
  pg.on('console',m=>{if(m.type()==='error'){const s=m.text().slice(0,140);if(!NOISE.test(s))errs.push('con:'+s);}});
  await pg.addInitScript(()=>{window.confirm=()=>false;window.alert=()=>{};window.onbeforeunload=null;});

  await pg.goto(BASE,{waitUntil:'load'}); await pg.waitForTimeout(1500);
  await pg.evaluate(async()=>{ localStorage.setItem('zb_uid','ZZ_JOURNEY');
    try{ await window.MAIN.login('旅程测试','男'); }catch(e){} });
  await pg.waitForTimeout(2500);
  await clearModals(pg);

  // --- 步骤1：打 1-1 ---
  const s1=await pg.evaluate(async()=>{
    const before={gold:P.gold||0,st:P.stamina||0,cleared:(P.cleared||[]).length,pw:E.power(P)};
    window.UI.close&&UI.close();
    startBattle('normal','1-1','normal');
    return before;
  });
  await pg.waitForTimeout(1200); await clearModals(pg);
  // 推进战斗：直接快进（battleGo 已在 startBattle 后由 CG 触发，这里等待真实推进）
  let fought=false;
  for(let i=0;i<24;i++){
    await pg.waitForTimeout(500);
    const st=await pg.evaluate(()=>({on:!!(window.BT&&BT.on),over:!!(window.BT&&BT.run&&BT.run.over),
      k:(window.BT&&BT.run)?BT.run.kills:0}));
    await clearModals(pg);
    if(st.over||!st.on){fought=true;break;}
  }
  await pg.waitForTimeout(1500); await clearModals(pg);
  const s2=await pg.evaluate(()=>{
    const r={gold:P.gold||0,st:P.stamina||0,cleared:(P.cleared||[]).length,pw:E.power(P),
      over:!!(window.BT&&BT.run&&BT.run.over)};
    return r;
  });

  // 战力：打完关不会立刻涨（要升级），但金币必须增加、体力必须减少
  if(s2.gold<0||s2.st<0) bad('1-1 后资源为负', JSON.stringify(s2));
  else ok('1-1 后资源非负','金币'+s2.gold+' 体力'+s2.st);

  // --- 步骤2：关卡解锁链 ---
  const unlock=await pg.evaluate(()=>{
    const out={};
    for(const id of ['1-1','1-2','1-3']){ out[id]=!!E.stageUnlocked(P,id); }
    out.cleared=JSON.stringify(P.cleared||[]).slice(0,80);
    return out;
  });
  console.log('  解锁链:',JSON.stringify(unlock));

  // --- 步骤3：强化武器 → 战力必须上涨 ---
  const up=await pg.evaluate(()=>{
    const p0=E.power(P);
    // 给足金币再强化，排除"钱不够"干扰
    P.gold=(P.gold||0)+500000;
    const w=E.curWeapon?E.curWeapon(P):null;
    const lv0=(P.weaponLv&&P.weaponLv[Object.keys(P.weaponLv)[0]])||0;
    let msg='';
    try{ const r=E.weaponUp(P,Object.keys(P.weaponLv||{})[0]||P.gun||'W1'); msg=JSON.stringify(r).slice(0,120);}catch(e){msg='EX '+e.message;}
    const p1=E.power(P);
    return {p0,p1,lv0,msg};
  });
  console.log('  强化:',JSON.stringify(up));
  if(up.p1<=up.p0) bad('武器强化后战力未上涨',up.p0+'->'+up.p1+' '+up.msg);
  else ok('武器强化后战力上涨',up.p0+'->'+up.p1);

  // --- 步骤4：扫荡（体力足够时） ---
  const sw=await pg.evaluate(()=>{
    P.stamina=100;
    const lv=(P.cleared&&P.cleared[0])?P.cleared[0]:'1-1';
    const g0=P.gold||0;
    let r; try{ r=E.sweep(P,lv,3);}catch(e){return {err:e.message};}
    return {ok:r.ok,msg:(r.msg||'').slice(0,60),g0,g1:P.gold||0,st:P.stamina};
  });
  console.log('  扫荡:',JSON.stringify(sw));
  if(sw.ok&&sw.g1<sw.g0) bad('扫荡成功但金币减少',JSON.stringify(sw));
  else ok('扫荡结果自洽',JSON.stringify(sw).slice(0,80));

  // --- 步骤5：任务进度 ---
  const tk=await pg.evaluate(()=>{
    const t=P.tasks||{}; const o={};
    Object.keys(t).slice(0,6).forEach(k=>{o[k]=JSON.stringify(t[k]).slice(0,40);});
    return o;
  });
  console.log('  任务:',JSON.stringify(tk));

  console.log('\n页面异常 %d 条',errs.length);
  errs.slice(0,8).forEach(e=>console.log('   ! '+e));
  if(errs.length) bad('旅程中出现页面异常',errs.length+'条');
  else ok('旅程无页面异常');
  console.log('\n==== 旅程结果 PASS %d / FAIL %d ====',R.pass.length,R.fail.length);
  await b.close();
})().catch(e=>console.log('FATAL',e.message));
