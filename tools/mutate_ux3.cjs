#!/usr/bin/env node
/* ux3 变异验证：故意把已清理的缺陷塞回去，守卫必须报红；还原后必须回绿且字节一致。
 * 每条变异独立：备份 → 注入 → 跑守卫(期望 FAIL) → 还原 → 校验 md5。 */
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..');
const md5=f=>crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
const run=()=>{try{return cp.spawnSync('node',[path.join(ROOT,'tools','ux3.cjs')],{encoding:'utf8'}).status;}catch(e){return -1;}};
const CASES=[
 {n:'U1 后台路径文案复活',f:'js/ui.js',
  a:`      return '<div class="card"><div class="empty">暂无公告</div>' +\n'</div>';`,
  b:`      return '<div class="card"><div class="empty">暂无公告</div>' +\n'<div class="lbl">运营在后台「公告管理」发布后，这里会显示。</div></div>';`},
 {n:'U2 单语言说明复活',f:'js/ui.js',
  a:`      this.open('set', '语言'); this.home();`,
  b:`      this.toast('本游戏仅支持简体中文', 'warn');\n      this.open('set', '语言'); this.home();`},
 {n:'U3 冗余后缀复活',f:'js/ui.js',
  a:`      cells.push({ k: '体力', v: eta && eta.full ? stc + '/' + EX.STAMINA_MAX`,
  b:`      cells.push({ k: '体力', v: eta && eta.full ? stc + '/' + EX.STAMINA_MAX + ' 已满'`},
 {n:'U4 分组标语复活',f:'index.html',
  a:`      <div class="hmg-b">`,
  b:`      <div class="hmg-t">养成</div>\n      <div class="hmg-b">`},
 {n:'D2 已删文案复活',f:'js/ui.js',
  a:`        <button class="btn blk" id="cdGo">🎁 立即兑换</button>`,
  b:`        <button class="btn blk" id="cdGo">🎁 立即兑换</button>\n        <div id="cdTip" class="lbl">兑换码由后台「礼包码 → 生成兑换码」产出</div>`},
 {n:'U5 主菜单被拆回多张卡片',f:'index.html',
  a:`        <button class="hmb" data-p="shop">`,
  b:`      </div></div>\n    <div class="hmg">\n      <div class="hmg-b">\n        <button class="hmb" data-p="shop">`},
 {n:'U6 选中态高亮改回反向',f:'js/ui.js',
  a:`class="gcell \${on ? 'sel' : ''}" data-skb=`,
  b:`class="gcell \${on ? '' : 'sel'}" data-skb=`},
];
let pass=0,fail=0;
const base=run();
console.log('基线 exit='+base+(base===0?' (绿)':' (!!! 基线非绿，后续判定无意义)'));
for(const c of CASES){
  const fp=path.join(ROOT,c.f);
  const orig=fs.readFileSync(fp,'utf8'); const h0=md5(c.f);
  if(orig.indexOf(c.a)<0){console.log('  × '+c.n+' —— 锚点未命中，无法注入');fail++;continue;}
  fs.writeFileSync(fp,orig.replace(c.a,c.b));
  const st=run();
  fs.writeFileSync(fp,orig);
  const h1=md5(c.f);
  const gotIt=st!==0, restored=h0===h1;
  if(gotIt&&restored){console.log('  √ '+c.n+' → 捕获(exit='+st+')，还原一致');pass++;}
  else {console.log('  × '+c.n+' → 捕获='+gotIt+' 还原='+restored);fail++;}
}
const after=run();
console.log('\nMUTATE: 捕获 '+pass+'/'+CASES.length+'，还原后 exit='+after+(after===0?' (已回绿)':' (!!! 未回绿)'));
process.exit(fail||after!==0?1:0);
