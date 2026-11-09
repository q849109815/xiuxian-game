/* 【pmcheck.cjs】立规原因：本工具为常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码语义：0=全部通过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
const { chromium } = require('playwright');
const {LAUNCH,enterGame}=require('./pmlib.cjs');
(async()=>{
  const W=Number(process.argv[2]||393);
  const b=await chromium.launch(LAUNCH);
  const pg=await b.newPage({viewport:{width:W,height:852}});
  const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  await enterGame(pg);
  const r=await pg.evaluate(()=>{
    const m=document.querySelector('#hmMenu'), d=document.querySelector('#hmToday');
    const items=Array.from(m.querySelectorAll('.hmb')).map(x=>x.getBoundingClientRect());
    const dr=d.getBoundingClientRect();
    return {scrollable:m.scrollHeight>m.clientHeight+1, sh:m.scrollHeight, ch:m.clientHeight,
      total:items.length, visibleInView:items.filter(x=>x.bottom<=innerHeight+1&&x.top>=0).length,
      lastItem:Math.round(Math.max(...items.map(x=>x.bottom))),
      todayB:Math.round(dr.bottom), vh:innerHeight,
      goSub:(document.querySelector('#hmGoSub')||{}).textContent,
      txt:d.innerText.replace(/\n/g,' | ')};
  });
  console.log('W'+W, JSON.stringify(r), 'errs',errs.length);
  await b.close();
})();
