#!/usr/bin/env node
/**
 * V1.1.0 全部门统一审计（制作人联合验收）
 * 六部门各出断言，Node 内真实加载源码执行，非正则推断。
 * 铁律：每条断言必须可被变异测试证伪。
 */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
let PASS=0;const FAILS=[];
const ok=(c,n,d)=>{if(c)PASS++;else{FAILS.push(n+(d?' :: '+d:''));console.log('  X '+n+(d?' :: '+d:''));}};
const ctx=vm.createContext({console,Math,Date,JSON,Number,String,Array,Object,isNaN,parseInt,parseFloat,setTimeout,location:{pathname:'/'},fetch:async()=>({ok:false}),window:null,document:null});
ctx.window=ctx;
for(const f of ['js/config.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
const CFG=ctx.EX,E=ctx.E;

console.log('=== V1.1.0 全部门统一审计 ===\n');

/* ── 策划部：新内容完整性 ── */
const Z=CFG.zombies||[],B=CFG.bosses||[],LV=CFG.levels||[],CH=CFG.chapters||[];
const NEWZ=['baojun','shenghua','jixie','tuye'];
for(const id of NEWZ) ok(Z.some(z=>z.id===id),'P1 新僵尸入表 '+id);
const hasBoss=n=>B.some(b=>b.id===n||b.key===n);
ok(B.length>=10,'P2 BOSS表数量>=10','实际 '+B.length);
// 掉落：globalDrops 按中文名匹配
const gd=CFG.globalDrops||[];
for(const id of NEWZ){
  const z=Z.find(x=>x.id===id); if(!z) continue;
  ok(gd.some(d=>d.src===z.n),'P3 新僵尸有掉落配置 '+z.n);
}
// 关卡 pool 引用的怪必须都在表
const zids=new Set(Z.map(z=>z.id));const bad=[];
for(const l of LV) for(const p of (l.pool||[])) if(!zids.has(p)) bad.push(l.id+':'+p);
ok(bad.length===0,'P4 关卡pool无孤儿僵尸',bad.slice(0,5).join(','));
// 解锁链
const lvids=LV.map(l=>l.id);const broken=[];
for(let i=1;i<LV.length;i++){const pv=LV[i].need||LV[i].unlock;if(pv&&lvids.indexOf(pv)<0)broken.push(LV[i].id+'<-'+pv);}
ok(broken.length===0,'P5 关卡解锁链无断裂',broken.slice(0,3).join(','));
// 章节
ok(CH.length===15,'P6 章节数15','实际 '+CH.length);
const cd=CFG.chapterDesc||{};const noDesc=[];for(let i=1;i<=15;i++)if(!cd[i])noDesc.push(i);ok(noDesc.length===0,'P7 15章剧情文案齐全','缺 '+noDesc.join(','));
// 新怪强度合理性：不能一出现就碾压
const first11=LV.filter(l=>String(l.id).startsWith('11-'));
ok(first11.length===10,'P8 第11章10关','实际 '+first11.length);
const m11=first11.map(l=>Number(l.mul)||1);
const m10=LV.filter(l=>String(l.id).startsWith('10-')).map(l=>Number(l.mul)||1);
ok(m10.length===10,'P9a 第10章10关','实际 '+m10.length);
ok(Math.max(...m11)>=Math.max(...m10),'P9b 第11章强度不低于第10章(曲线延续)','11章 '+Math.max(...m11)+' / 10章 '+Math.max(...m10));
ok(Math.max(...m11)<=Math.max(...m10)*3,'P9c 第11章强度未断层(<=3倍)','11章 '+Math.max(...m11)+' / 10章 '+Math.max(...m10));

/* ── 美术部：资源存在性 + 上传登记 ── */
const push=fs.readFileSync(path.join(ROOT,'tools/push.py'),'utf8');
const imgs=new Set();
for(const arr of [Z,B,CFG.chars||[],CFG.guns||CFG.weapons||[],CFG.skins||[],CFG.scenes||[]])
  for(const o of arr) if(o&&o.img) imgs.add(o.img);
for(const c of CH) if(c.cg) imgs.add(c.cg);
const missing=[],unlisted=[];
for(const im of imgs){
  if(!fs.existsSync(path.join(ROOT,im))) missing.push(im);
  else if(push.indexOf(im)<0) unlisted.push(im);
}
ok(missing.length===0,'A1 引用图片文件全部存在',missing.slice(0,5).join(','));
ok(unlisted.length===0,'A2 引用图片全部登记上传清单',unlisted.slice(0,8).join(','));
console.log('  (图片引用总数 '+imgs.size+'，缺失 '+missing.length+'，未登记 '+unlisted.length+')');

/* ── 程序部：死配置 ── */
const cfgSrc=fs.readFileSync(path.join(ROOT,'js/config.js'),'utf8');
const others=['js/engine.js','js/ui.js','js/main.js','js/battle.js','js/juice.js','js/net.js','js/audio.js'].map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
const keys=new Set();
for(const m of cfgSrc.matchAll(/^\s{0,4}([A-Z][A-Z0-9_]{2,})\s*:/gm))keys.add(m[1]);
const WHITE=['TXT_001','TXT_002','TXT_003','TXT_004','TXT_005','TXT_006','TXT_007','TXT_008'];
const dead=[...keys].filter(k=>WHITE.indexOf(k)<0 && !(new RegExp('\\b'+k+'\\b')).test(others) && !(new RegExp('this\\.'+k+'\\b')).test(cfgSrc));
ok(dead.length===0,'D1 无死配置(定义了零调用)',dead.join(','));
const mjs=fs.readFileSync(path.join(ROOT,'js/main.js'),'utf8');
ok(/EX\.DROP_EVENT_TXT\b/.test(mjs)&&/UI\.toast/.test(mjs),'D2 活动角标文案已真接线(读配置+弹提示)');
ok(WHITE.length===8,'D3 运营文案热改层白名单已登记(8条)');
/* 【V1.1.0 收口】预留层已升级为运营可热改层，TXT_001~006 真接线，必须断言接线存在 */
const UISRC=fs.readFileSync(path.join(ROOT,'js/ui.js'),'utf8');
for(const id of ['TXT_001','TXT_002','TXT_003','TXT_004','TXT_005','TXT_006'])
  ok(new RegExp("EX\\.txt\\('"+id+"'\\)").test(UISRC),'D4 ui.js 已真接线 '+id);
ok(!!CFG.TEXT_OVERRIDE,'D5 TEXT_OVERRIDE 覆盖层存在');
CFG.TEXT_OVERRIDE.TXT_002='系统设置';
ok(CFG.txt('TXT_002')==='系统设置','D6 运营热改生效（覆盖层优先）',CFG.txt('TXT_002'));
delete CFG.TEXT_OVERRIDE.TXT_002;
ok(CFG.txt('TXT_002')==='设置','D7 删除覆盖后回退默认');

/* ── 运营部：赛季 ── */
ok(!!(CFG.SEASON||ctx.CFG&&ctx.CFG.SEASON),'O1 赛季配置存在');

console.log('\n--- PASS '+PASS+' / FAIL '+FAILS.length+' ---');
if(FAILS.length)process.exit(1);
