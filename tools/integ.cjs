/* V1.0.2 O-03 商业化反作弊哨兵验证
 * 断言：
 *  A1 正常玩家（7天/300钻/5万金币）→ 无告警（绝不误伤）
 *  A2 满配老玩家（30天/大量资源）→ 无告警
 *  A3 刷钻石 999999 → TAMPER_DIAMOND
 *  A4 刷金币 9e9 → TAMPER_GOLD
 *  A5 低等级超高战力 → TAMPER_POWER
 *  A6 时钟倒退 >1天 → TAMPER_CLOCK
 *  A7 每日至多上报一次（重复调用不刷屏）
 *  A8 异常存档（字段缺失/NaN）不抛错
 */
const fs=require('fs'), vm=require('vm');
const ROOT=__dirname+'/../js/';
function load(){
  const ctx={console,Math,Date,JSON,Number,isFinite,parseInt,parseFloat,Set,Map,Object,Array,String,
    setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    OPS:{track:(id,d)=>{ctx._trk.push({id,d});}}};
  ctx.window=ctx; ctx.globalThis=ctx; ctx._trk=[]; ctx.EX={STAMINA_MAX:100};
  vm.createContext(ctx);
  for(const f of ['config.js','engine.js']) vm.runInContext(fs.readFileSync(ROOT+f,'utf8'),ctx,{filename:f});
  return ctx;
}
const ctx=load();
const E=ctx.E||vm.runInContext('E',ctx);
let pass=0,fail=0;
const ok=(c,n,x)=>{c?(pass++,console.log('  ok '+n)):(fail++,console.log('  x  '+n+(x?' :: '+x:'')));};

function mk(o){ return Object.assign({lv:5,diamond:300,gold:50000,regDay:20260401,
  tasks:{dailyDate:'',dailyClaimed:[],dailyProg:{},weeklyKey:'',weeklyClaimed:[],weeklyProg:{}},
  lastOnline:0}, o); }
function run(p){ ctx._trk=[]; let r=null; try{ r=E.integrityCheck(p);}catch(e){r='ERR:'+e.message;} return r; }

console.log('O-03 反作弊哨兵验证');
// 冻结 now 为固定时刻
const NOW=new Date('2026-04-08T12:00:00+08:00').getTime();
const rd=E.dayDiff?null:null;
try{ E.now=()=>NOW; }catch(e){}

ok(run(mk({}))===null,'A1 正常玩家无告警',JSON.stringify(run(mk({}))));
ok(run(mk({lv:55,diamond:20000,gold:3e6,regDay:20260301}))===null,'A2 满配老玩家无告警');
let r=run(mk({diamond:999999})); ok(r&&r.indexOf('TAMPER_DIAMOND')>=0,'A3 刷钻石被标记',JSON.stringify(r));
r=run(mk({gold:9e9})); ok(r&&r.indexOf('TAMPER_GOLD')>=0,'A4 刷金币被标记',JSON.stringify(r));
r=run(mk({lv:3,diamond:0,gold:0})); // 先造战力
{ /* 真实构造：低等级 + 满级武器/芯片/天赋 → 战力远超等级理论上限 */
  const p=mk({lv:3, gunLv:200, gun:'W01', guns:{W01:{lv:200}}, chips:{c1:1,c2:1,c3:1,c4:1,c5:1,c6:1},
    talents:{t1:10,t2:10,t3:10}});
  let pw=0; try{ pw=E.power(p); }catch(e){}
  E.now=()=>NOW; const rr=run(p);
  ok(rr && rr.indexOf('TAMPER_POWER')>=0,'A5 低等级超高战力被标记',
     'power='+pw+' flags='+JSON.stringify(rr)); }
r=run(mk({lastOnline:NOW+3*864e5})); ok(r&&r.indexOf('TAMPER_CLOCK')>=0,'A6 时钟倒退被标记',JSON.stringify(r));
{ const p=mk({diamond:999999}); const a=run(p); const b=run(p);
  ok(a&&b===null,'A7 每日至多上报一次',JSON.stringify([a,b])); }
ok(String(run(mk({diamond:NaN,gold:undefined,lv:null}))).indexOf('ERR')<0,'A8 异常存档不抛错');
console.log('PASS '+pass+' / FAIL '+fail);
process.exit(fail?1:0);
