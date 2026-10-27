/* 美术部 A-11 守卫：关卡场景必须与章节主题对齐
 * 变异验证：改坏任一关的 scene → 必须 FAIL */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'js/config.js'),'utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++):(fail++,console.log('  FAIL '+m));};

/* 每章主题场景（与 config.chapters.img 一致） */
const THEME={1:'city',2:'tunnel',3:'bridge',4:'factory',5:'field',
 6:'wasteland',7:'snow',8:'rift',9:'nest',10:'final',
 11:'outpost',12:'dam',13:'mine',14:'lab',15:'core'};

const i=src.indexOf('levels:'),j=src.indexOf('\n  ],',i);
let L;eval('var C={'+src.slice(i,j+4).replace(/,\s*$/,'')+'}');L=C.levels;
ok(L.length===150,'关卡数应为150，实际'+L.length);

/* 1) 每章场景种数 <=2 且主题占比 >=60% */
const byCh={};
for(const l of L){const c=+String(l.id).split('-')[0];(byCh[c]=byCh[c]||[]).push(l);}
for(let c=1;c<=15;c++){
  const arr=byCh[c]||[];
  ok(arr.length===10,'第'+c+'章应有10关，实际'+arr.length);
  const cnt={};for(const l of arr)cnt[l.scene]=(cnt[l.scene]||0)+1;
  const kinds=Object.keys(cnt);
  ok(kinds.length<=2,'第'+c+'章场景种数应<=2，实际'+kinds.length+'('+kinds.join(',')+')');
  const main=THEME[c];
  ok(cnt[main]>0,'第'+c+'章缺少主题场景 '+main);
  const ratio=(cnt[main]||0)/arr.length;
  ok(ratio>=0.6,'第'+c+'章主题占比应>=60%，实际'+Math.round(ratio*100)+'%');
}
/* 2) 所有 scene 必须在 sceneImg 映射中存在（否则战斗背景 404） */
const si=src.indexOf('sceneImg:');const sj=src.indexOf('}',si);
const imgBlk=src.slice(src.indexOf('{',si),sj+1);
let IMG;eval('IMG='+imgBlk);
const miss=[...new Set(L.map(l=>l.scene))].filter(s=>!IMG[s]);
ok(miss.length===0,'以下 scene 无图片映射: '+miss.join(','));

/* 3) BOSS 关必须用主题场景 */
for(const l of L){
  const c=+String(l.id).split('-')[0];
  if(String(l.id).endsWith('-10')) ok(l.scene===THEME[c],l.id+' BOSS关场景应为 '+THEME[c]+'，实际 '+l.scene);
}
console.log((fail?'FAIL':'PASS')+' '+pass+' / '+fail);
process.exit(fail?1:0);
