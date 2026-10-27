#!/usr/bin/env node
/* 状态机不变量压测：随机调用引擎真实方法 N 步，每步校验硬性不变量 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport:{width:393,height:852} });
  const errs=[];
  pg.on('pageerror', e=>errs.push(String(e).split('\n')[0].slice(0,140)));
  await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'load'});
  await pg.waitForTimeout(1500);
  await pg.evaluate(async()=>{ localStorage.setItem('zb_uid','ZZ_FUZZ');
    try{ await window.MAIN.login('压测','男'); }catch(e){} });
  await pg.waitForTimeout(2500);

  const res = await pg.evaluate(() => {
    const p = window.P; if (!p) return {err:'无P'};
    const viol = [];
    const chk = (step) => {
      const bad = [];
      for (const k of E.NUMS) { const v=p[k];
        if (typeof v==='number' && (!isFinite(v)||v<0)) bad.push(k+'='+v); }
      if (p.stamina > (EX.STAMINA_MAX||100)+0.001) bad.push('stamina超上限='+p.stamina);
      if (Array.isArray(p.bag) && p.bag.length > (E.BAG_MAX||500)) bad.push('bag超限='+p.bag.length);
      for (const k of Object.keys(p.mat||{})) { const v=p.mat[k];
        if (!isFinite(v)||v<0) bad.push('mat.'+k+'='+v); }
      for (const k of Object.keys(p.use||{})) { const v=p.use[k];
        if (!isFinite(v)||v<0) bad.push('use.'+k+'='+v); }
      if (p.bag && p.bag.length !== new Set(p.bag.map(x=>x&&x.uid||JSON.stringify(x))).size
          && p.bag.every(x=>x&&x.uid)) bad.push('bag重复uid');
      if (bad.length) viol.push(step+' -> '+bad.join(','));
    };
    const rnd = (a)=>a[Math.floor(Math.random()*a.length)];
    const lvls = (EX.levels||[]).map(l=>l.id);
    const guns = (EX.guns||[]).map(g=>g.id);
    const tals = (EX.talents||[]).map(t=>t.id);
    const blds = (EX.builds||[]).map(t=>t.id);
    const acts = [];
    acts.push(()=>E.sign(p));
    acts.push(()=>E.upgradeGun(p));
    acts.push(()=>E.upTalent(p, rnd(tals)));
    acts.push(()=>E.upBuild(p, rnd(blds)));
    acts.push(()=>E.sweep(p, rnd(lvls), 1));
    acts.push(()=>E.sweep(p, rnd(lvls), 5));
    acts.push(()=>E.starUp(p));
    acts.push(()=>E.offlineClaim(p));
    acts.push(()=>E.rollChipByQuality(p, rnd(['白','蓝','紫','红'])));
    acts.push(()=>E.dismantleChip(p));
    acts.push(()=>E.fuseChip(p, rnd(['白','蓝','紫'])));
    acts.push(()=>E.useItem(p, rnd(['I01','I02','I03'])));
    acts.push(()=>E.openBox(p, 1));
    acts.push(()=>E.openChest&&E.openChest(p,1));
    acts.push(()=>{const t=(EX.tasks&&EX.tasks.daily||[])[0]; return t?E.claimTask(p,t):null;});
    acts.push(()=>{const t=(EX.tasks&&EX.tasks.main||[])[0]; return t?E.claimTask(p,t):null;});
    acts.push(()=>E.passClaim(p, 1+Math.floor(Math.random()*9)));
    acts.push(()=>E.monthCardClaim(p));
    acts.push(()=>E.claimRankRw(p));
    acts.push(()=>E.useAd(p,'gold'));
    acts.push(()=>E.addStamina(p, 20));
    acts.push(()=>E.addXp(p, 500));
    acts.push(()=>E.grant(p,{gold:1000,diamond:10,stamina:5,M01:3}));
    acts.push(()=>E.clearLevel(p, rnd(lvls), 1+Math.floor(Math.random()*3)));
    acts.push(()=>E.rerollGun(p));
    acts.push(()=>E.forgeEquip&&E.forgeEquip(p, rnd(['eq1','eq2'])));
    acts.push(()=>E.gemFuse&&E.gemFuse(p, rnd(['红','黄','蓝','绿'])));
    acts.push(()=>E.setGem&&E.setGem(p, 0, rnd(['红','黄','蓝','绿'])));
    acts.push(()=>E.equipChip(p, 0));
    acts.push(()=>E.unequipChip(p, 0));
    acts.push(()=>E.switchChar(p, rnd((EX.chars||[]).map(c=>c.id)||['C01'])));
    let n=0, thrown=0;
    for (let i=0;i<600;i++){
      const f = rnd(acts);
      try { f(); } catch(e){ thrown++; if(thrown<=3) viol.push('THROW@'+i+' '+String(e.message).slice(0,80)); }
      if (i%3===0){ p.gold+=1e5; p.diamond+=1e4; p.tp+=5; }
      chk('step'+i); n++;
      if (viol.length>25) break;
    }
    return { steps:n, thrown, viol: viol.slice(0,25),
      gold:p.gold, dia:p.diamond, st:p.stamina, bag:(p.bag||[]).length };
  });
  console.log('步数', res.steps, '| 抛异常', res.thrown);
  console.log('末态 gold=%s dia=%s st=%s bag=%s', res.gold, res.dia, res.st, res.bag);
  console.log('=== 不变量违规 ===');
  (res.viol||[]).forEach(x=>console.log('  '+x));
  console.log('共 %d 处', (res.viol||[]).length);
  if (errs.length) console.log('页面错误:', errs.slice(0,5).join(' | '));
  await b.close();
})().catch(e=>console.log('FATAL', e.message));
