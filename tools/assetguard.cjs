/* V1.0.2 资源入库守卫：代码引用的 assets/* 必须在 push.py 上传清单里
 * 背景：assets/char/ 与 assets/scene/ 两个整目录曾长期未登记 ——
 *       美术交了图，线上引用 404（"本地有、线上无"），且不报错、没人发现。
 * 本工具扫描 index.html/js/css 里引用的 assets 路径，与 push.py 的 FILES 比对，
 * 缺失即 FAIL。新增美术资源若不登记，这里会立刻拦下。
 */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const pushSrc=fs.readFileSync(path.join(ROOT,'tools/push.py'),'utf8');
const m=pushSrc.match(/FILES\s*=\s*\[([\s\S]*?)\n\]/);
if(!m){ console.log('x  解析 push.py FILES 失败'); process.exit(1); }
const listed=new Set((m[1].match(/'([^']+)'/g)||[]).map(s=>s.slice(1,-1)));

const exts=['.html','.js','.css'];
const files=[];
(function walk(d){
  for(const f of fs.readdirSync(d)){
    /* V1.3.8 修：`.mut/`（变异备份目录）此前没被排除。
     * 后果很隐蔽却致命——变异把代码里的引用改掉后，备份副本里仍留着原引用，
     * 守卫因此永远看不到「引用消失」，只当一切正常。
     * 也就是说：这个守卫在本该报警的场景下，一直被自己的扫描范围保护着说谎。
     * 点目录（.mut/.git/...）一律排除，只扫真实源码。 */
    if(f.startsWith('_')||f.startsWith('.')||f==='node_modules') continue;
    const fp=path.join(d,f);
    const st=fs.statSync(fp);
    if(st.isDirectory()){ if(['tools','_bak','dead_backup'].includes(f)) continue; walk(fp); }
    else if(exts.includes(path.extname(f))) files.push(fp);
  }
})(ROOT);

const refs=new Set();
// 过滤规则：裸目录（以 / 结尾，是拼接前缀不是文件）、含 ${} 的模板串（运行时才确定）
// 这两类不是「一个具体的图片文件」，登记了也没意义，且会造成永远无法清零的噪声。
const isRealFile=r=>!r.endsWith('/')&&!r.includes('${');
for(const fp of files){
  const src=fs.readFileSync(fp,'utf8');
  for(const mm of src.matchAll(/(?:src|href|url\()\s*=?\s*['"(]?([^'"()\s]*assets\/[^'"()\s,;]+)/g)){
    let r=mm[1].split('?')[0];
    if(r.startsWith('../')) r=r.slice(3);
    if(r.startsWith('./')) r=r.slice(2);
    if(isRealFile(r)) refs.add(r);
  }
  for(const mm of src.matchAll(/['"](assets\/[^'"\s,;]+)['"]/g)){
    let r=mm[1].split('?')[0];
    if(r.startsWith('../')) r=r.slice(3);
    if(isRealFile(r)) refs.add(r);
  }
}
/* R 引用集合留痕（V1.3.8 加）
 * ---------------------------------------------------------------------------
 * 为什么：本守卫的断言数 = 代码里的资源引用数，是**动态**的。
 * 于是历史上出现过一次典型误判：基线被记录在「仓库正被变异污染」的那一刻，
 * 污染清掉后引用数自然回落，体检员却报「断言缩水 242→241」——
 * 只报数字，说不清少了哪一条，我只能靠猜。
 *
 * 猜，就是假结论的温床。因此：把引用集合本身落盘，
 * 与上次比对，**逐条报出消失的引用**，并强制显式 rebase 才能更新基线。
 * 这样「少了 1 条」会立刻变成「少了 assets/icon/xxx.jpg 这一条」，可判定。
 */
const REFSET=path.join(__dirname,'_asset_refs.json');
const rebase=process.argv.includes('--rebase');
const cur=[...refs].sort();
let gone=[],added=[];
try{
  const prev=JSON.parse(fs.readFileSync(REFSET,'utf8')).refs||[];
  const ps=new Set(prev);
  gone=prev.filter(r=>!refs.has(r));
  added=cur.filter(r=>!ps.has(r));
}catch(e){ /* 首次运行，无历史 */ }

let pass=0,fail=0;
console.log('=== 资源入库守卫 ===');
console.log('清单条目 '+listed.size+'，代码引用 '+refs.size+' 条');
for(const r of cur){
  if(listed.has(r)){ pass++; }
  else { fail++; console.log('  x  未登记: '+r); }
}

/* 消失的引用：直接判失败，防止「删掉引用让守卫变绿」这种自欺。
 * 真要删（功能下线/换图），必须 --rebase 显式确认。 */
if(gone.length){
  console.log('\n  x  引用消失（需 --rebase 显式确认，否则不得放行）：');
  gone.forEach(r=>console.log('       - '+r));
}
if(added.length && !rebase){
  console.log('\n  ·  新增引用 '+added.length+' 条（已自动登记）：');
  added.slice(0,10).forEach(r=>console.log('       + '+r));
}

if(rebase || !fs.existsSync(REFSET)){
  fs.writeFileSync(REFSET,JSON.stringify({refs:cur,at:new Date().toISOString().slice(0,19)},null,1));
  if(rebase) console.log('\n  ·  --rebase：引用集合基线已按当前状态重设（'+cur.length+' 条）');
}
if(gone.length && !rebase) fail+=gone.length;

console.log('\nPASS '+pass+' / FAIL '+fail);
process.exit(fail?1:0);
