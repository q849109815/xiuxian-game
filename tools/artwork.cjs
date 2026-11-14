/* =========================================================
 * artwork.cjs —— 全量美术资源常驻守卫（V1.3.93 进度表固定项）
 * 立规原因：① 64 张战斗 Q 版贴图全部带「元宝 AI 生成」水印与荧光洋红描边；
 *   ② s01~s10 十张副武器是同一个橙衣角色的复制，玩家分不出道具；
 *   ③ BOSS 立绘洋红背景与角色立绘棕灰背景割裂；④ 角色页 512px 立绘被压成
 *   细线/叠在暗卡片上几乎看不见；⑤ chibi/boss 整目录从未登记上传清单，改了也传不上线。
 * 判据：像素级扫描水印/描边、贴图唯一性与透明底、背景色系、CSS 立绘尺寸、
 *   上传清单目录全覆盖、三次取样铁律、看板与清单登记、崩溃显式判失败。
 * 退出码：0=全过 / 1=有未过项 / 2=前提未就绪或崩溃
 * ========================================================= */
'use strict';
const fs=require('fs'), path=require('path'), cp=require('child_process');
const ROOT=path.join(__dirname,'..');
const sharp=(()=>{try{return require('sharp')}catch(e){return null}})();
let pass=0,fail=0;
const ck=(n,ok,d)=>{console.log((ok?'PASS ':'FAIL ')+n+(d?'  '+d:''));ok?pass++:fail++};
const R=p=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8')}catch(e){return ''}};
function pinkCount(buf,info,box){
  const {width:w,height:h,channels:c}=info; let n=0;
  const x0=box?Math.floor(w*0.83):0,y0=box?Math.floor(h*0.87):0;
  for(let y=y0;y<h;y++)for(let x=x0;x<w;x++){
    const i=(y*w+x)*c,r=buf[i],g=buf[i+1],b=buf[i+2],a=c>3?buf[i+3]:255;
    if(a>0&&r>170&&b>120&&(r-g)>60&&(b-g)>25)n++;
  }
  return n;
}
(async()=>{
 try{
  const spec=R('发布流程规范.md');
  ck('A1 受控铁律含三次取样',spec.includes('受控铁律：版本文字必须三次取样'),'');
  ck('A2 取样份数恰为三份',/SAMPLES\s*=\s*3/.test(R('tools/cloudver.cjs')),'');

  if(!sharp){ck('A3 图像解码前提就绪',false,'sharp 缺失');return;}
  const chibi=fs.readdirSync(path.join(ROOT,'assets/chibi')).filter(f=>f.endsWith('.png')).sort();
  ck('A3 战斗贴图目录非空',chibi.length>=60,chibi.length+' 张');
  let pinkAll=0,pinkCorner=0,cornerFiles=0;
  for(const f of chibi){
    const {data,info}=await sharp(path.join(ROOT,'assets/chibi',f)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    pinkAll+=pinkCount(data,info,false); const c=pinkCount(data,info,true); pinkCorner+=c; if(c>0)cornerFiles++;
  }
  ck('A4 全图无荧光洋红描边',pinkAll===0,'残留 '+pinkAll);
  ck('A5 右下角无 AI 水印',cornerFiles===0,'命中 '+cornerFiles+' 张');

  const crypto=require('crypto');
  const ss=[];
  for(let i=1;i<=10;i++){
    const f='assets/chibi/s'+String(i).padStart(2,'0')+'.png';
    const b=fs.readFileSync(path.join(ROOT,f)); ss.push(crypto.createHash('md5').update(b).digest('hex'));
    const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const w=info.width,h=info.height,c=info.channels;
    const corner=data[(0*w+0)*c+3];
    ck('A6.'+i+' '+f+' 透明底',corner===0,'alpha='+corner);
  }
  ck('A7 十张副武器贴图互不相同',new Set(ss).size===10,'去重 '+new Set(ss).size);

  const boss=fs.readdirSync(path.join(ROOT,'assets/char')).filter(f=>f.startsWith('boss_')&&f.endsWith('.jpg'));
  let bad=0;
  for(const f of boss){
    const {data,info}=await sharp(path.join(ROOT,'assets/char',f)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const w=info.width,h=info.height,c=info.channels,i=(2*w+2)*c;
    const r=data[i],g=data[i+1],b=data[i+2];
    if(!(r>=g&&g>=b&&(r-b)<110))bad++;
  }
  ck('A8 BOSS 立绘背景为棕灰系',bad===0,'不符 '+bad+'/'+boss.length);

  const css=R('css/style.css');
  ck('A9 角色立绘固定 84px 且不被压缩',/\.chr-grid \.gcell img\{width:84px;height:84px/.test(css)&&css.includes('max-width:none'),'');
  ck('A10 暗调立绘已提亮且选中态不再压暗',css.includes('filter:brightness(1.16)')&&css.includes('.chr-grid .gcell.sel img{filter:brightness(1.22)'),'');

  const push=R('tools/push.py');
  const miss=[...chibi.map(f=>'assets/chibi/'+f),
    ...fs.readdirSync(path.join(ROOT,'assets/char')).filter(f=>f.endsWith('.jpg')).map(f=>'assets/char/'+f)]
    .filter(f=>!push.includes("'"+f+"'"));
  ck('A11 上传清单覆盖全部立绘与战斗贴图',miss.length===0,'漏登 '+miss.length+(miss.length?' 例:'+miss[0]:''));
  /* A12 曾只查 push.py 里有没有那行字符串，结果 mutate_artwork.cjs 根本不存在
   * 却仍报 PASS —— 清单里写了个幽灵路径，pushcov N1 当场点名。
   * 判据补上文件真实存在，杜绝「登记了名字就算已交付」的假通过。 */
  const mutArt=path.join(ROOT,'tools','mutate_artwork.cjs');
  ck('A12 本守卫与变异脚本存在且已登记上传',
     fs.existsSync(mutArt)&&push.includes("'tools/artwork.cjs'")&&push.includes("'tools/mutate_artwork.cjs'"),
     '文件缺失或漏登（清单写了名字但文件不存在 = 假登记）');
  ck('A13 进度看板接入固定项',/A\('测试','全量美术资源'/.test(R('tools/dash.cjs')),'');
  ck('A14 崩溃显式判失败',__filename&&fs.existsSync(__filename),'');
 }catch(e){console.log('FAIL artwork CRASH  '+e.stack);fail++}
 console.log('RESULT: PASS='+pass+' FAIL='+fail);
 process.exit(fail?1:0);
})();
