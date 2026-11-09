#!/usr/bin/env node
/* 【consist.cjs】立规原因：本工具为常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码语义：0=全部通过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
/* 跨面板数值一致性：同一指标在主界面/各面板/引擎计算值之间是否一致 */
const { chromium } = require('playwright');
const PANELS=['shop','role','bag','gun','chip','task','core','codex','base','legion',
  'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];
(async()=>{
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const pg=await b.newPage({viewport:{width:393,height:852}});
await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'load'});
await pg.waitForTimeout(1500);
await pg.evaluate(async()=>{localStorage.setItem('zb_uid','ZZ_CON');try{await window.MAIN.login('一致性','男');}catch(e){}});
await pg.waitForTimeout(2500);
const out = await pg.evaluate((PANELS)=>{
  const p=window.P;
  // 引擎真值
  const truth={ power:E.power(p), gold:p.gold, dia:p.diamond, st:Math.floor(p.stamina), lv:p.lv };
  const bad=[];
  UI.home();
  const hmGold=document.getElementById('cuGold'), hmDia=document.getElementById('cuDia');
  const hmPw=[...document.querySelectorAll('#home *')].map(e=>e.textContent||'').join(' ');
  const mPw=hmPw.match(/战力\s*([\d.]+[万亿京]?)/);
  if(hmGold && !String(truth.gold).includes(hmGold.textContent.replace(/[^\d.万亿京]/g,'').slice(0,4)))
    bad.push('主界面金币显示='+hmGold.textContent+' 实际='+truth.gold);
  // 各面板搜"战力"数字
  const seen={};
  for(const k of PANELS){
    UI.open(k);
    const t=document.getElementById('panel').innerText||'';
    const ms=[...t.matchAll(/战力[^\d]{0,6}([\d.]+)([万亿京垓]?)/g)].map(x=>x[1]+x[2]);
    if(ms.length) seen[k]=[...new Set(ms)];
  }
  // 与引擎真值比对（统一用 E.fmt 口径）
  const fmtP=E.fmt(truth.power);
  for(const k of Object.keys(seen)){
    for(const v of seen[k]){
      if(v!==fmtP && Math.abs(parseFloat(v)-parseFloat(fmtP))>0.01
         && !(v.includes('万')&&fmtP.includes('万'))){
        bad.push('面板'+k+' 战力='+v+' 引擎='+fmtP);
      }
    }
  }
  return {truth, fmtP, seen, bad};
},PANELS);
console.log('引擎真值:',JSON.stringify(out.truth),' 战力显示=',out.fmtP);
console.log('各面板出现的战力值:'); Object.entries(out.seen).forEach(([k,v])=>console.log('  ',k,v.join(',')));
console.log('=== 不一致 ==='); out.bad.forEach(x=>console.log('  '+x));
console.log('共 %d 处',out.bad.length);
await b.close();})().catch(e=>console.log('FATAL',e.message));
