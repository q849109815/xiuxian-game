/* 发布流程守卫变异验证：证明守卫抓得住缺陷（抓不住 = 断言不存在） */
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const BAK='/tmp/_rgbak_'+Date.now();
const F=['tools/.version.json','index.html','js/config.js','js/ui.js','tools/push.py','tools/ver.cjs'];
function md5(f){return crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT,f))).digest('hex')}
function save(){for(const f of F){const d=path.join(BAK,f);fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(path.join(ROOT,f),d)}}
function restore(){for(const f of F)fs.copyFileSync(path.join(BAK,f),path.join(ROOT,f))}
function run(){const r=cp.spawnSync('node',['tools/releaseguard.cjs'],{cwd:ROOT,encoding:'utf8',timeout:120000});
  const m=(r.stdout||'').match(/RESULT: PASS=(\d+) FAIL=(\d+)/);return {f:m?+m[2]:-1,code:r.status}}
const base={};for(const f of F)base[f]=md5(f);
save();
const cases=[
 ['V1 版本号回退到旧版',()=>{const p=path.join(ROOT,'tools/.version.json');const j=JSON.parse(fs.readFileSync(p,'utf8'));j.v='1.3.7';fs.writeFileSync(p,JSON.stringify(j))}],
 ['V2 index.html 一处?v=改旧',()=>{const p=path.join(ROOT,'index.html');let s=fs.readFileSync(p,'utf8');s=s.replace('?v=1.3.72','?v=1.3.71');fs.writeFileSync(p,s)}],
 ['V3 manifest 删一项',()=>{const p=path.join(ROOT,'js/config.js');let s=fs.readFileSync(p,'utf8');s=s.replace(/\{ p: 'js\/user\.js'[^\n]*\n/,'');fs.writeFileSync(p,s)}],
 ['V4 push.py 删版本闸门',()=>{const p=path.join(ROOT,'tools/push.py');let s=fs.readFileSync(p,'utf8');s=s.replace('def version_gate','def _version_gate_disabled');fs.writeFileSync(p,s)}],
 ['V5 ver.cjs 删 bump1 实现（保留字样）',()=>{const p=path.join(ROOT,'tools/ver.cjs');let s=fs.readFileSync(p,'utf8');s=s.replace("return String(v) + '1';","return String(v);");fs.writeFileSync(p,s)}],
];
let cap=0,tot=cases.length;
console.log('=== 发布流程守卫 · 变异验证 ===');
for(const [n,fn] of cases){
  fn();
  const r=run();
  const caught=r.f>0;
  if(caught)cap++;
  console.log(`${caught?'√':'✗'} ${n} -> FAIL=${r.f} ${caught?'已捕获':'★未捕获'}`);
  restore();
}
let clean=true;
for(const f of F) if(md5(f)!==base[f]){clean=false;console.log('★未还原:',f)}
console.log(`\n还原${clean?'一致（全部字节相同）':'★不一致'}`);
const fin=run();
console.log(`基线复跑： PASS=${(cp.spawnSync('node',['tools/releaseguard.cjs'],{cwd:ROOT,encoding:'utf8'}).stdout||'').match(/PASS=(\d+)/)||''} FAIL=${fin.f}`);
console.log(`捕获 ${cap}/${tot}`);
process.exit(cap===tot&&clean&&fin.f===0?0:1);
