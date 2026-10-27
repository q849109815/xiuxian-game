const { chromium } = require('playwright');
const {LAUNCH,enterGame,dump}=require('./pmlib.cjs');
(async()=>{
  const b=await chromium.launch(LAUNCH);
  const pg=await b.newPage({viewport:{width:393,height:852}});
  const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,140)));
  await enterGame(pg);
  await pg.evaluate(()=>document.querySelector('#hmGo').click());
  await pg.waitForTimeout(1500);
  // 章节导航是否在顶部（y < 关卡列表）
  const r=await pg.evaluate(()=>{
    const chs=Array.from(document.querySelectorAll('#pnBody [data-ch]')).map(e=>e.getBoundingClientRect());
    const items=Array.from(document.querySelectorAll('#pnBody .item')).map(e=>e.getBoundingClientRect());
    const dfs=Array.from(document.querySelectorAll('#pnBody [data-df]')).filter(e=>!e.dataset.lv).map(e=>e.getBoundingClientRect());
    const txt=document.querySelector('#pnBody').innerText;
    return {chCount:chs.length, chTop:chs.length?Math.round(Math.min(...chs.map(x=>x.y))):null,
      diffTop:dfs.length?Math.round(Math.min(...dfs.map(x=>x.y))):null,
      itemCount:items.length, itemTop:items.length?Math.round(items[0].y):null,
      itemH:items.length?Math.round(items[0].height):null,
      hasChapterStat:/通关 \d+\/10/.test(txt), statTxt:(txt.match(/通关 \d+\/10 · ★\d+\/30/)||[''])[0],
      starRow:/★/.test(txt), poolRepeat:(txt.match(/强度 ×1\.00 · 20 波/g)||[]).length,
      firstItem:items.length?document.querySelector('#pnBody .item').innerText.replace(/\n/g,' | '):''};
  });
  console.log(JSON.stringify(r,null,1));
  console.log('ERRS',errs.length,errs.slice(0,3));
  await b.close();
})();
