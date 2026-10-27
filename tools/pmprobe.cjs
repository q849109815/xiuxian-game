const { chromium } = require('playwright');
const {LAUNCH,enterGame,dump}=require('./pmlib.cjs');
(async()=>{
const b=await chromium.launch(LAUNCH);const pg=await b.newPage({viewport:{width:393,height:852}});
await enterGame(pg);
// 1. 底部空白
const gap=await pg.evaluate(()=>{
  const m=document.querySelector('#hmMenu'); const r=m.getBoundingClientRect();
  const items=Array.from(m.querySelectorAll('.hmb')).map(e=>e.getBoundingClientRect());
  const lastBottom=Math.max(...items.map(x=>x.bottom));
  return {menuTop:r.y,menuH:r.height,menuBottom:r.bottom,scrollH:m.scrollHeight,clientH:m.clientHeight,lastItemBottom:Math.round(lastBottom),vh:innerHeight};
});
console.log('== 菜单容器 ==',JSON.stringify(gap));
// 2. 打开关卡选择（点出击）
await pg.evaluate(()=>document.querySelector('#hmGo').click());
await pg.waitForTimeout(1200);
const t=await pg.evaluate(()=>document.body.innerText.slice(0,300).replace(/\n+/g,' | '));
console.log('== 点出击后 ==',t);
const scr=await pg.evaluate(()=>Array.from(document.querySelectorAll('.screen')).filter(s=>s.offsetParent!==null).map(s=>s.id));
console.log('可见屏:',scr.join(','));
for(const s of scr){ if(s==='home')continue; console.log('--- '+s+' ---'); console.log(await dump(pg,'#'+s)); }
await b.close();})();
