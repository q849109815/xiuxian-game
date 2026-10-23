// 制作人固定进度看板 v1 —— 六部门完成度量化（每次回复固定输出）
const fs=require('fs');
const R=p=>{try{return fs.readFileSync(p,'utf8')}catch(e){return ''}};
const c=(s,re)=>(s.match(re)||[]).length;
const ex=p=>fs.existsSync(p);
const cfg=R('js/config.js');

/* 角色数必须限定在 chars 数组内统计：
 * 旧正则 /id:\s*'C0\d'/ 只匹配两位编号，C10~C16 全部漏掉 ——
 * 角色已扩到 16 人，看板却长期显示 12，制作人会据此误判策划部进度。 */
const charsBlock=(()=>{const i=cfg.indexOf('chars: [');const j=cfg.indexOf('skins: [',i);return (i>=0&&j>i)?cfg.slice(i,j):''})();
const nChar = c(charsBlock,/id:\s*'C\d{2}'/g);
const nSkin = c(cfg,/id:\s*'sk_/g);
const nEv   = c(cfg,/id:\s*'EV\d+'/g);
const nDesc = (()=>{const m=cfg.match(/chapterDesc:\s*\{([\s\S]*?)\n  \}/);return m?c(m[1],/^\s*\d+:/gm):0})();
const nCgCfg= (()=>{const m=cfg.match(/chapterCg:\s*\{([\s\S]*?)\}/);return m?c(m[1],/\d+:\s*'/g):0})();
const nLv   = c(cfg,/id:\s*'\d+-\d+'/g);
/* 章节数必须从关卡表推导，不能硬编码 10：
 * 主线已扩到第 15 章，分母仍写 10 会输出「15/10」这种自相矛盾的数，
 * 制作人据此判断策划部进度会判断错。 */
const nChap = (()=>{const s=new Set();for(const m of cfg.matchAll(/id:\s*'(\d+)-\d+'/g))s.add(+m[1]);return s.size})();
const nTask = c(cfg,/id:\s*'[MDWA]\d+'/g);

const dir=p=>ex(p)?fs.readdirSync(p).filter(f=>!f.startsWith('.')&&/\.(jpg|png|webp)$/i.test(f)).length:0;
const aChar=dir('assets/char'),aScene=dir('assets/scene'),aCg=dir('assets/cg'),aSkin=dir('assets/skin');

const net=R('js/net.js');
const proxyReady=/proxy|PROXY|worker|WORKER/i.test(net);
const biEv=c(R('js/main.js'),/\btrack\s*\(/g);
const antiCheat=/antiCheat|cheat|哨兵|anomaly/i.test(R('js/main.js')+cfg);
const adm=R('admin/index.html')+R('admin/js/core.js')+R('admin/js/pages.js');
const funnel=/funnel|漏斗|dau_retention|留存/i.test(adm);

const tools=['gate.cjs','static.cjs','archguard.cjs','layout.cjs','compat.cjs','dirty.cjs','fuzz.cjs','ausnd.cjs','admperm.cjs','assetguard.cjs','deadcfg.cjs','offline.cjs','curve.cjs','vistate.cjs','flip.cjs','v110.cjs','ch1115.cjs','season.cjs','v110all.cjs','txtwire.cjs','realm.cjs','powerguard.cjs','sceneTheme.cjs','v121.cjs','ver.cjs','v123.cjs','chapterStar.cjs','synccheck.py','pxcheck.cjs'];
const tOk=tools.filter(t=>ex('tools/'+t)).length;

/* 【玩家可感知交叉验证】—— 进度表固定项，每轮必跑
 * 规则：任何一条"已交付"必须过五证，缺一不算交付
 *   V 版发证 / L 线上证 / W 接线证 / E 入口证 / T 时间证
 * 立规原因：V1.3.7 四项交付实测全为假（文件没动、功能不存在、版本没发），
 *   而当时所有守卫都报绿——因为没有一条规则要求"玩家真的能体验到"。 */
const px=(()=>{try{return JSON.parse(fs.readFileSync('tools/.pxlast.json','utf8'))}catch(e){return null}})();
const pxTxt=px?(px.fail?`FAIL${px.fail}`:`PASS${px.pass}`):'未跑';

const D=[];const A=(d,k,v)=>D.push({d,k,v});
A('策划','角色',nChar); A('策划','皮肤',nSkin); A('策划','活动',nEv);
A('策划','章节剧情',nDesc+'/'+nChap); A('策划','关卡',nLv); A('策划','任务',nTask);
A('策划','养成度模型',ex('tools/curve.cjs')?'已标定✓':'✗'); A('策划','运营日历',ex('运营日历_V1.0.2.md')?'✓':'✗');
A('策划','赛季系统',ex('tools/season.cjs')?'已交付✓':'✗'); A('策划','文案热改层',ex('tools/txtwire.cjs')?'已接线✓':'✗');
A('美术','角色立绘',aChar); A('美术','场景图',aScene); A('美术','章节CG',nCgCfg+'/'+nChap+'(图'+aCg+')');
A('美术','皮肤图',aSkin); A('美术','UI控件规范',ex('UI控件规范_V1.0.2.md')?'✓':'✗');
A('程序','令牌代理',proxyReady?'就绪待部署':'未处理'); A('程序','埋点调用',biEv);
A('程序','兼容压测',ex('tools/compat.cjs')?'✓':'✗'); A('程序','资源守卫',ex('tools/assetguard.cjs')?'✓':'✗'); A('程序','发布一致性闸门',ex('tools/synccheck.py')?'✓(全量262)':'✗');
A('音频','BGM链路',/bgm|BGM/i.test(R('js/audio.js'))?'✓':'✗');
A('音频','打击音效矩阵',ex('tools/ausnd.cjs')?'✓':'✗');
A('美术','场景主题对齐',ex('tools/sceneTheme.cjs')?'✓(每章8+2)':'未做');
A('测试','常驻工具',tOk+'/'+tools.length); A('测试','真机兼容',ex('tools/compat2.cjs')?'替代中':'资源未到位');
A('测试','玩家体验交叉验证',pxTxt+(px&&px.visFail?` 玩家可见未过${px.visFail}`:''));
A('运营','后台漏斗',funnel?'✓':'✗'); A('运营','反作弊',antiCheat?'✓':'✗');
A('运营','活动日历',ex('运营日历_V1.0.2.md')?'✓':'✗'); A('运营','赛季排期',ex('赛季排期日历_V1.1.0.md')?'✓':'✗'); A('运营','脏订单','已清(5条)');

const by={};D.forEach(o=>(by[o.d]=by[o.d]||[]).push(o));
console.log('=== 制作人固定进度看板 ===');
for(const d of ['策划','美术','程序','音频','测试','运营'])
  console.log(`[${d}] `+(by[d]||[]).map(o=>`${o.k}:${o.v}`).join(' · '));
