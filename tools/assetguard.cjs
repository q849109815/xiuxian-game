/* 【assetguard.cjs】立规原因：本工具为常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码语义：0=全部通过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
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

/* F 文件存在证（V1.3.79 新增）
 * ---------------------------------------------------------------------------
 * 事故：变异注入的假引用 'assets/icon/star_X.jpg?v=...' 留在 js/config.js，
 * 磁盘上根本没有这个文件。原守卫只问「有没有登记进 push.py FILES」——
 * 一旦有人顺手把它补登记，守卫就全绿，而玩家看到的是破图。
 * 更糟的是原输出写「新增引用 1 条（已自动登记）」，实际代码根本没写盘：
 * 输出与实际行为不一致，会让接手的人/Agent 以为污染已被合法化（AX 事故）。
 * 因此：① 具体文件必须真实存在；② 文案只陈述真实动作；
 *       ③ --rebase 也不能把不存在的引用写进基线（显式确认 ≠ 确认污染）。
 */
const FILE_EXT=/\.(png|jpe?g|gif|webp|svg|mp3|ogg|wav|ttf|woff2?)$/i;
const MUT_MARK=/__MUT|mut_|_X\.(?:jpe?g|png|webp|svg)/i;
const broken=cur.filter(r=>FILE_EXT.test(r)&&!fs.existsSync(path.join(ROOT,r)));
if(broken.length){
  console.log('\n  x  引用文件不存在（疑似测试污染残留 / 上线必破图）：');
  broken.forEach(r=>console.log('       ! '+r+(MUT_MARK.test(r)?'  [命中变异特征]':'')));
  fail+=broken.length;
}

/* 消失的引用：直接判失败，防止「删掉引用让守卫变绿」这种自欺。
 * 真要删（功能下线/换图），必须 --rebase 显式确认。 */
if(gone.length){
  console.log('\n  x  引用消失（需 --rebase 显式确认，否则不得放行）：');
  gone.forEach(r=>console.log('       - '+r));
}
if(added.length && !rebase){
  console.log('\n  ·  新增引用 '+added.length+' 条（仅报告，未写入基线；确认无误后执行 --rebase）：');
  added.slice(0,10).forEach(r=>console.log('       + '+r));
}

if(rebase && broken.length){
  console.log('\n  x  --rebase 拒绝执行：存在不存在的引用，先清污染再重设基线');
}
if(((rebase && !broken.length) || !fs.existsSync(REFSET)) && !broken.length){
  fs.writeFileSync(REFSET,JSON.stringify({refs:cur,at:new Date().toISOString().slice(0,19)},null,1));
  if(rebase) console.log('\n  ·  --rebase：引用集合基线已按当前状态重设（'+cur.length+' 条）');
}
if(gone.length && !rebase) fail+=gone.length;

console.log('\nPASS '+pass+' / FAIL '+fail);
process.exit(fail?1:0);
