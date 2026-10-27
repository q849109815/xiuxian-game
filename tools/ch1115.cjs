/* 第 11-15 章（V1.1.0 冲刺2）完整性校验
 * 覆盖：关卡链 / 僵尸表 / BOSS表 / 掉落 / 章节配置 / 美术资源 / 上传清单 */
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/config.js'),'utf8');
function grab(key){
  const i=src.indexOf('\n  '+key+':');
  if(i<0) return null;
  const j=src.indexOf('[',i);
  let d=0,k=j;
  for(;k<src.length;k++){ if(src[k]==='[')d++; else if(src[k]===']'){d--; if(!d)break;} }
  return eval('['+src.slice(j+1,k)+']');
}
const levels=grab('levels'),chapters=grab('chapters'),zombies=grab('zombies'),bosses=grab('bosses');
let pass=0,fail=0;
function ok(c,m){ if(c){pass++;} else {fail++;console.log('  x '+m);} }
console.log('=== 第 11-15 章完整性校验 ===');
ok(levels.length===150, 'levels 应为 150 关，实际 '+levels.length);
ok(chapters.length===15, 'chapters 应为 15，实际 '+chapters.length);
const zids=new Set(zombies.map(z=>z.id)), bids=new Set(bosses.map(b=>b.id));
const lids=new Set(levels.map(l=>l.id));
// 新僵尸/BOSS 入库
['baojun','shenghua','jixie'].forEach(z=>ok(zids.has(z),'新僵尸未入库: '+z));
['gangtie','muhe'].forEach(b=>ok(bids.has(b),'新BOSS未入库: '+b));
// 关卡链
let chainBad=[];
levels.forEach(l=>{
  if(l.unlock && l.unlock!==null && !lids.has(l.unlock)) chainBad.push(l.id+'->'+l.unlock);
  (l.pool||[]).forEach(p=>{ if(!zids.has(p)) chainBad.push(l.id+' pool:'+p); });
  if(l.boss){ if(Array.isArray(l.boss)) l.boss.forEach(b=>{if(!bids.has(b))chainBad.push(l.id+' boss:'+b);});
    else if(!bids.has(l.boss)) chainBad.push(l.id+' boss:'+l.boss); }
  if(!['clear','boss','bossAll','survive','defend'].includes(l.cond)) chainBad.push(l.id+' cond:'+l.cond);
});
ok(chainBad.length===0, '关卡链异常: '+chainBad.slice(0,8).join(', '));
// 11-15 章齐全
for(let c=11;c<=15;c++){ const n=levels.filter(l=>l.ch===c).length; ok(n===10,'第'+c+'章关卡数应为10，实际'+n); }
// 解锁链首尾
ok(levels.find(l=>l.id==='11-1').unlock==='10-10','11-1 应解锁于 10-10');
ok(levels.find(l=>l.id==='15-10').boss==='muhe','15-10 BOSS 应为 muhe');
// 掉落表
const zNames=new Set(zombies.map(z=>z.n)), bNames=new Set(bosses.map(b=>b.n));
const dropSrcs=[...src.matchAll(/src:\s*'([^']+)'/g)].map(m=>m[1]);
['暴君僵尸','生化僵尸','机械僵尸'].forEach(n=>ok(dropSrcs.includes(n),'新僵尸缺掉落: '+n));
['BOSS钢铁洪流','BOSS母核'].forEach(n=>ok(dropSrcs.includes(n),'新BOSS缺掉落: '+n));
ok(zNames.has('暴君僵尸')&&zNames.has('生化僵尸')&&zNames.has('机械僵尸'),'新僵尸中文名缺失');
ok(bNames.has('钢铁洪流')&&bNames.has('母核'),'新BOSS中文名缺失');
// 章节配置
const cgM=src.match(/chapterCg:\s*\{([\s\S]*?)\}/), descM=src.match(/chapterDesc:\s*\{([\s\S]*?)\n  \}/);
const cg=eval('({'+cgM[1]+'})'), desc=eval('({'+descM[1]+'})');
for(let c=11;c<=15;c++){ ok(!!cg[c],'chapterCg 缺 '+c); ok(!!desc[c]&&desc[c].length>10,'chapterDesc 缺 '+c); }
// 美术资源存在
const sceneM=src.match(/sceneImg:\s*\{([\s\S]*?)\n  \}/); const scene=eval('({'+sceneM[1]+'})');
['outpost','dam','mine','lab','core'].forEach(s=>{
  ok(!!scene[s],'sceneImg 缺 '+s);
  ok(fs.existsSync(path.join(root,'assets/scene/'+s+'.jpg')),'场景图缺失: assets/scene/'+s+'.jpg');
});
/* 【V1.2.3 维护轮3 修复】以下三组原先只做 forEach：
 * 匹配结果为空时一条断言都不会产生 —— 实测把 z_baojun.jpg 改成
 * z_baojunX.jpg，PASS 从 53 静默掉到 52，守卫依然报绿。
 * 图片被改名/删除属于"引用消失"，必须靠「数量下限」才能抓住。
 * 因此统一改为：先断言引用条数 >= 下限，再逐条断言文件存在。 */
function assertRefs(re, label, min, existsFn) {
  const hits = [...src.matchAll(re)];
  ok(hits.length >= min, `${label} 引用数应 >=${min}，实际 ${hits.length}（引用被改名/删除会静默少一条）`);
  hits.forEach(m => ok(existsFn(m[1]), `${label}缺失: ${m[1]}`));
}
assertRefs(/'assets\/cg\/(cg1[1-5]_[a-z]+)\.jpg'/g, 'CG', 5,
  n => fs.existsSync(path.join(root, 'assets/cg/' + n + '.jpg')));
assertRefs(/'assets\/char\/(boss_(?:gangtie|muhe))\.jpg'/g, 'BOSS图', 2,
  n => fs.existsSync(path.join(root, 'assets/char/' + n + '.jpg')));
assertRefs(/'assets\/icon\/(z_(?:baojun|shenghua|jixie))\.jpg'/g, '僵尸图', 3,
  n => fs.existsSync(path.join(root, 'assets/icon/' + n + '.jpg')));
// 上传清单登记（历史教训：美术交了没登记 = 线上 404）
const pushSrc=fs.readFileSync(path.join(root,'tools/push.py'),'utf8');
const need=['assets/scene/outpost.jpg','assets/scene/dam.jpg','assets/scene/mine.jpg','assets/scene/lab.jpg','assets/scene/core.jpg',
'assets/char/boss_gangtie.jpg','assets/char/boss_muhe.jpg','assets/icon/z_baojun.jpg','assets/icon/z_shenghua.jpg','assets/icon/z_jixie.jpg',
'assets/cg/cg11_outpost.jpg','assets/cg/cg12_dam.jpg','assets/cg/cg13_mine.jpg','assets/cg/cg14_lab.jpg','assets/cg/cg15_core.jpg'];
const miss=need.filter(p=>!pushSrc.includes(p));
ok(miss.length===0,'上传清单未登记: '+miss.join(', '));
console.log('--- PASS '+pass+' / FAIL '+fail+' ---');
process.exit(fail?1:0);
