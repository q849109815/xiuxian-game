#!/usr/bin/env node
/* [mutate_vis2.cjs] 立规原因：抓不住问题的检查等于不存在。
 * 把五类"退化改动"分别塞回源码，看 vis2.cjs 是否当场报红；finally 同步还原，
 * 还原后 md5 必须逐字节一致（历史上强停变异造成过生产污染，此处不留中断口）。
 * 判据：5/5 全部捕获且还原一致；退出码 0=通过 / 1=未捕获或还原不一致。 */
const fs=require('fs'),crypto=require('crypto'),{execFileSync}=require('child_process');
const md5=p=>crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const MUT=[
 ['M1 邮件按钮退回无条件常亮','js/ui.js', "${un ? '<button class=\"btn g\" id=\"mailAll\" style=\"width:100%;margin-top:8px\">一键领取</button>' : ''}", "<button class=\"btn g\" id=\"mailAll\" style=\"width:100%;margin-top:8px\">一键领取</button>"],
 ['M2 兑换商店退回单行省略','js/ui.js','class="zrow shop-row"','class="zrow"'],
 ['M3 后台侧栏退回分组文字','admin/js/core.js','<div class="nav-sep"></div>','<div class="nav-t">${U.esc(gn)}</div>'],
 ['M4 后台加载条退回文字常驻','admin/js/core.js','(pg && pg.total && pg.done < pg.total)','(pg && pg.total)'],
 ['M5 后台空状态退回小空卡片','admin/js/pages.js','min-height:220px','min-height:0'],
 ['M6 列头退回挤压版','js/ui.js','<div class="sub" style="padding:2px 2px 6px">持有','<span class="sub">持有'],
 ['M7 侧栏退回窄栏换行','css/style.css','#panel[data-tp="side"] .pn-tabs{flex:0 0 88px !important}','#panel[data-tp="side"] .pn-tabs{flex:0 0 74px !important}'],
 ['M8 上传清单漏登工具','tools/push.py',"    'tools/visualshot.cjs',","    'tools/_visualshot_placeholder.cjs',"],

];
const snap=new Map();MUT.forEach(([n,f])=>{if(!snap.has(f))snap.set(f,[fs.readFileSync(f),md5(f)])});
function guard(){try{return execFileSync(process.execPath,['tools/vis2.cjs'],{encoding:'utf8',timeout:30000})}catch(e){return String(e.stdout||'')}}
let cap=0;
try{
  console.log('基线: '+guard().trim().split('\n').slice(-1)[0]);
  for(const [n,f,a,b] of MUT){
    const s=fs.readFileSync(f,'utf8');
    if(!s.includes(a)){console.log('  MISS '+n+' 锚点不存在');continue}
    fs.writeFileSync(f,s.split(a).join(b));
    const out=guard(), bad=/FAIL\s[1-9]/.test(out);
    console.log('  '+(bad?'捕获':'逃逸')+'  '+n);
    if(bad)cap++;
    // 立刻还原，避免污染累积
    const [orig]=snap.get(f);fs.writeFileSync(f,orig);
  }
}finally{
  for(const [f,[orig,h]] of snap)fs.writeFileSync(f,orig);
}
let clean=true;
for(const [f,[orig,h]] of snap){const now=md5(f);if(now!==h){console.log('  污染! '+f);clean=false}}
console.log('变异捕获 '+cap+'/'+MUT.length+'，还原 '+(clean?'逐字节一致':'失败'));
console.log('还原后基线: '+guard().trim().split('\n').slice(-1)[0]);
process.exit(cap===MUT.length&&clean?0:1);
