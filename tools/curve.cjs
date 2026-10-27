/* 养成度模型 P-01 —— 可复算工具
 * 复算「玩家按最小可行养成推图，在各章是否卡死」。
 * 参数集中在 P 中，改完直接重跑：node tools/curve.cjs
 */
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/config.js','utf8');
// 正则解析 levels 块（不依赖 vm，稳定可复算）
const blk=src.match(/levels:\s*\[([\s\S]*?)\n  \]/);
if(!blk){console.log('未找到 levels');process.exit(1)}
const LV=[];
for(const m of blk[1].matchAll(/\{\s*id:\s*'(\d+)-(\d+)'[\s\S]*?\}/g)){
  const o=m[0];
  const g=(re)=>{const r=o.match(re);return r?+r[1]:0};
  const per=(o.match(/per:\s*\[(\d+),\s*(\d+)\]/)||[]).slice(1).map(Number);
  const rw=o.match(/rw:\s*\{([^}]*)\}/);
  const gold=rw?(rw[1].match(/gold:\s*(\d+)/)||[0,0])[1]:0;
  const mat=rw?(rw[1].match(/M02:\s*(\d+)/)||[0,0])[1]:0;
  LV.push({ch:+m[1],id:m[1]+'-'+m[2],
    mul:g(/mul:\s*([\d.]+)/)||1, waves:g(/waves:\s*(\d+)/)||20,
    per:per.length?per:[8,13], gold:+gold, mat:+mat});
}
if(!LV.length){console.log('levels 解析失败');process.exit(1)}
const P={
  BASE_DPS:120,        // 1级裸装秒伤
  PER_LEVEL:0.085,     // 每级成长
  GOLD2POW:0.00042,    // 金币折算战力效率（含武器/芯片/建筑三线的保守值）
  MAT2POW:0.011,       // 强化材料折算
  WAVE_LIMIT:15,       // 波次时限(秒)，超时即推进
  BASE_HP:26,          // 第1章单只僵尸等效血量
  DANGER:-0.02,        // 余量低于此判定为会卡死
};
const CH=[];
for(let ch=1;ch<=10;ch++){
  const ls=LV.filter(l=>l.ch===ch); if(!ls.length){CH.push(null);continue}
  const avg=k=>ls.reduce((s,l)=>s+(Array.isArray(l[k])?(l[k][0]+l[k][1])/2:l[k]),0)/ls.length;
  const mul=avg('mul'),per=avg('per'),waves=avg('waves');
  const hpPer=P.BASE_HP*mul;                       // 单只等效血
  const waveHp=per*hpPer;                          // 单波总血
  CH.push({ch,mul:+mul.toFixed(2),per:+per.toFixed(1),waves:waves|0,waveHp:+waveHp.toFixed(0)});
}
// 累计养成：逐章把前序奖励折成战力
let gold=0,mat=0,pow=P.BASE_DPS,lv=1;
const out=[];
for(const c of CH){ if(!c){out.push(null);continue}
  // 该章可用输出（进入该章时）
  const dps=pow*(1+P.PER_LEVEL*(lv-1));
  const cap=dps*P.WAVE_LIMIT;                      // 单波时限内可打出的伤害
  const margin=(cap-c.waveHp)/c.waveHp;            // 余量：>0 打得动，<0 打不动
  out.push({ch:c.ch,mul:c.mul,per:c.per,dps:+dps.toFixed(0),waveHp:c.waveHp,
            margin:+(margin*100).toFixed(1),st:margin<P.DANGER?'卡死':(margin<0.08?'偏紧':'健康')});
  // 通关该章后：奖励 + 等级
  const ls=LV.filter(l=>l.ch===c.ch);
  /* BUGFIX(20270422a)：解析阶段奖励存的是标量 l.gold / l.mat，
   * 这里却读 l.rw.gold / l.rw.M02 —— l.rw 恒为 undefined，
   * 被 `||0` 兜成 0，导致玩家养成收益在模型里全程归零，
   * 只算等级成长 → 误判「第 5~10 章卡死」。
   * 曾据此向策划部下发过错误的数值调优结论，现修正。 */
  gold+=ls.reduce((s,l)=>s+(Number(l.gold)||0),0);
  mat +=ls.reduce((s,l)=>s+(Number(l.mat)||0),0);
  lv+=1.0;
  pow=P.BASE_DPS+gold*P.GOLD2POW+mat*P.MAT2POW;
}
console.log('章 | mul | 每波 | 单波血 | 玩家DPS | 余量 | 判定');
let bad=0;
for(const o of out){ if(!o){console.log('- 该章无关卡数据');continue}
  if(o.st==='卡死')bad++;
  console.log(`${String(o.ch).padStart(2)} | ${String(o.mul).padStart(4)} | ${String(o.per).padStart(4)} | ${String(o.waveHp).padStart(6)} | ${String(o.dps).padStart(7)} | ${String(o.margin+'%').padStart(7)} | ${o.st}`);
}
console.log(`\n卡死章节数: ${bad}`);
/* ---- 模型自检（防「解析口径错配 → 养成收益归零」复发 ×2）----
 * 事故：解析存标量 l.gold，累加却读 l.rw.gold（l.rw 恒 undefined 被 ||0 兜成 0），
 *   玩家养成收益在模型里全程归零 → 误判「第 5~10 章卡死」并据此下发错误调优结论。
 * 为什么要显式自检：口径错配时未必崩溃（历史上就是静默归零），
 *   而崩溃也不可靠——崩溃同样是非 0 退出码，会被误当成「守卫捕获了」。
 * 判据：全主线养成收益累计必须 > 0，否则就是解析口径错了，直接判失败。 */
if (!(gold > 0)) {
  console.log('\n❌ 模型自检失败：全主线养成收益累计为 0');
  console.log('   极可能是解析口径错配（例如累加读成 l.rw.gold，而解析存的是标量 l.gold）');
  console.log('   此时算出的「卡死章节数」不可信，禁止据此下发任何数值结论');
  process.exit(1);
}
/* ---- 曲线形态诊断（20270422a 新增）----
 * 只查「卡死」会漏掉另一种失真：曲线非单调，中间出现尖峰。
 * 判据：某章余量同时低于左右邻居（局部极小），且低于邻居均值 60% → 判为难度尖峰。
 * 玩家体感是「推到这章突然卡一下」，是最典型的流失点。 */
const ms=out.filter(Boolean).map(o=>o.margin);
let spike=0;
for(let i=1;i<ms.length-1;i++){
  const nb=(ms[i-1]+ms[i+1])/2;
  if(ms[i]<ms[i-1] && ms[i]<ms[i+1] && ms[i] < nb*0.6){
    console.log(`  ⚠ 难度尖峰：第 ${i+1} 章 余量 ${ms[i]}% 远低于邻居均值 ${nb.toFixed(1)}%`);
    spike++;
  }
}
console.log(spike? `难度尖峰章节数: ${spike}` : '曲线形态: 平滑，无尖峰');
process.exit((bad+spike)>0?1:0);
