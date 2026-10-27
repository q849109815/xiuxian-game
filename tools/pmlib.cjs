const { chromium } = require('playwright');
const LAUNCH={executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']};
async function enterGame(pg){
  await pg.addInitScript(()=>{window.confirm=()=>false;window.alert=()=>{};window.onbeforeunload=null;});
  await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'domcontentloaded'});
  await pg.waitForTimeout(1200);
  await pg.evaluate(()=>{const e=document.querySelector('#lgGoReg');if(e)e.click();});
  await pg.waitForTimeout(400);
  const u='pm'+Date.now().toString().slice(-7);
  await pg.fill('#rgUser',u); await pg.fill('#rgPwd','test123456');
  await pg.fill('#rgPwd2','test123456'); await pg.fill('#rgNick','测号'+u.slice(-3));
  await pg.click('#rgBtn');
  for(let i=0;i<15;i++){
    await pg.waitForTimeout(1800);
    await pg.evaluate(()=>{document.querySelectorAll('.modal.on button,.mb.on button').forEach(b=>{const t=(b.innerText||'').trim();if(/知道了|确定|立即刷新|关闭|跳过|好的|领取/.test(t)){try{b.click()}catch(e){}}});});
    const okv=await pg.evaluate(()=>{const h=document.querySelector('#home');return !!h&&h.offsetParent!==null;});
    if(okv) return u;
  }
  throw new Error('未能进入主界面');
}
// 导出界面的可读结构树
async function dump(pg, rootSel){
  return pg.evaluate((sel)=>{
    const vis=e=>{const r=e.getBoundingClientRect();return e.offsetParent!==null&&r.width>0&&r.height>0;};
    const root=document.querySelector(sel); if(!root) return 'NO ROOT '+sel;
    const out=[];
    const walk=(el,d)=>{
      if(d>5) return;
      for(const c of el.children){
        if(!vis(c)) continue;
        const r=c.getBoundingClientRect();
        const own=Array.from(c.childNodes).filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
        const cs=getComputedStyle(c);
        const tag=c.tagName.toLowerCase();
        const id=c.id?('#'+c.id):'';
        const cl=(typeof c.className==='string'&&c.className)?('.'+c.className.trim().split(/\s+/).slice(0,2).join('.')):'';
        if(own||['button','img','input'].includes(tag)){
          out.push('  '.repeat(d)+`[${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] ${tag}${id}${cl} `+
            (own?`"${own.slice(0,60)}"`:'')+(tag==='img'?(c.complete&&c.naturalWidth===0?' BROKEN':''):'')+
            ` fs${cs.fontSize} c${cs.color.replace(/\s/g,'')}`);
        }
        walk(c,d+1);
      }
    };
    walk(root,0);
    return out.join('\n');
  }, rootSel);
}
module.exports={LAUNCH,enterGame,dump};
