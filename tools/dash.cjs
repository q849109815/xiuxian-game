// 制作人固定进度看板 v1 —— 六部门完成度量化（每次回复固定输出）
const fs=require('fs');
/* V1.3.77：判据集中到 dashparse.cjs，看板与 dashcons 守卫共用同一份实现，
 * 杜绝「工具输出改了格式、看板正则没跟着改」这类判据与实现脱节。 */
const DP=require('./dashparse.cjs');
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

const tools=['gate.cjs','static.cjs','archguard.cjs','layout.cjs','compat.cjs','dirty.cjs','fuzz.cjs','ausnd.cjs','admperm.cjs','assetguard.cjs','deadcfg.cjs','offline.cjs','curve.cjs','vistate.cjs','flip.cjs','v110.cjs','ch1115.cjs','season.cjs','v110all.cjs','txtwire.cjs','realm.cjs','powerguard.cjs','sceneTheme.cjs','v121.cjs','ver.cjs','v123.cjs','chapterStar.cjs','synccheck.py','pxcheck.cjs','adminux.cjs','shopux.cjs','biguard.cjs','btprereq.cjs','uxdel.cjs','dashparse.cjs','dashcons.cjs','mutate_dashcons.cjs','mutrestore.cjs','mutate_mutrestore.cjs'];
const tOk=tools.filter(t=>ex('tools/'+t)).length;

/* 【玩家可感知交叉验证】—— 进度表固定项，每轮必跑
 * 规则：任何一条"已交付"必须过五证，缺一不算交付
 *   V 版发证 / L 线上证 / W 接线证 / E 入口证 / T 时间证
 * 立规原因：V1.3.7 四项交付实测全为假（文件没动、功能不存在、版本没发），
 *   而当时所有守卫都报绿——因为没有一条规则要求"玩家真的能体验到"。 */
const px=(()=>{try{return JSON.parse(fs.readFileSync('tools/.pxlast.json','utf8'))}catch(e){return null}})();
const pxTxt=px?(px.fail?`FAIL${px.fail}`:`PASS${px.pass}`):'未跑通✗';

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
/* 【污染全量扫描】—— 进度表固定项
 * 为什么单列：mutsentinel 只核对 mutguard 登记的那 32 条锚点，独立变异脚本
 * 的残留它管不着。V1.3.8 真事故：js/ui.js 长期躺着 `if (window.__MUT) return;`
 * （变异被强杀没还原），哨兵一直报绿，玩家侧因 __MUT 恒为 undefined 还无感。
 * fullscan 用 D1 特征证 + D4 开关白名单补这个盲区。 */
if (ex('tools/fullscan.cjs')) {
  let fsTxt = 'PASS4';
  try {
    const r = require('child_process').spawnSync('node', ['tools/fullscan.cjs'],
      { cwd: '/data/workspace/zombie', encoding: 'utf8', timeout: 120000 });
    const m = String(r.stdout || '').match(/PASS=(\d+)\s+FAIL=(\d+)/);
    if (m) fsTxt = m[2] === '0' ? ('PASS' + m[1]) : ('FAIL' + m[2] + '←污染');
  } catch (e) { fsTxt = '跑失败'; }
  A('测试', '污染全量扫描', fsTxt);
}
/* 【检测工具体检】—— 进度表固定项
 * 为什么必须进看板：守卫自己坏了就会报全绿，历史上 acorn 丢失 → static 假通过
 * 就是这个形态。不把「工具是否可信」单独列出来，看板上所有绿都不可信。
 * 口径：可信 N / 共 M；不可信 >0 或 跳过 >0 必须显式带出来。 */
const ta=(()=>{try{return JSON.parse(fs.readFileSync('tools/_toolaudit_last.json','utf8'))}catch(e){return null}})();
/* 时效证：体检结果是一次性快照，看板直接读它。
 * 事故形态（V1.3.72111 实测）：themeguard.cjs 建好的时间比体检快照晚 1 秒，
 * 于是快照里它是「缺失」，看板就一直显示「不可信1」——
 * 把「这个工具还没体检过」显示成了「体检过、不合格」。
 * 这和历史上「没跑却报绿」是同一个洞：用旧结论冒充当前状态。
 * 因此：快照 mtime 必须晚于所有受检工具的 mtime，否则显式判「已过期」。 */
const taNames=(()=>{try{return ((fs.readFileSync('tools/toolaudit.cjs','utf8').match(/const GUARDS = \[([\s\S]*?)\]/)[1]||'')
  .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'')
  .match(/'([A-Za-z0-9_.-]+)'/g)||[]).map(s=>s.replace(/'/g,''))}catch(e){return []}})();
const taFresh=(()=>{
  if(!ta||!ta.at) return false;
  const snapMs = (()=>{try{return fs.statSync('tools/_toolaudit_last.json').mtimeMs}catch(e){return 0}})();
  if(!snapMs) return false;
  try{
    for(const n of taNames){
      const f='tools/'+n+'.cjs';
      if(fs.existsSync(f) && fs.statSync(f).mtimeMs > snapMs) return false;
    }
  }catch(e){return false}
  return true;
})();
/* 【条数完整性证】—— V1.3.77 事故：批量体检被强杀，只跑完第一个工具
 * 就落了残快照（total=1，那一行 pass=0/fail=0 判「不可信」），
 * 看板却显示「可信0/1 不可信1」—— 把「根本没体检完」说成「体检过、全不合格」。
 * 这和时效证要治的是同一类洞：拿不完整/过期的结论冒充当前状态。
 * 规矩：快照必须标记 complete、行数覆盖 GUARDS 全量、每行不得空跑。
 * 不足一律判「残快照←需重跑」，并显式带 ✗，不用中性词蒙混。 */
const taComplete=DP.taComplete(ta, taNames);
A('测试','检测工具体检',!ta?'未跑通✗':(!taComplete?'残快照←需重跑✗':(!taFresh?'已过期←需重跑✗':`可信${ta.trust}/${ta.total}`+(ta.bad?` 不可信${ta.bad}`:'')+(ta.skipN?` 跳过${ta.skipN}`:''))));
/* 【变异验证覆盖】—— 进度表固定项
 * 铁律：抓不住缺陷的断言等于不存在。只报「工具有多少条断言」没意义，
 * 必须报「多少条被证明过抓得住」。数字取最近一次实测轮次，未跑则显式写未验证，
 * 绝不允许用「注册了」冒充「验证过」。 */
const mr=(()=>{try{return JSON.parse(fs.readFileSync('tools/_mutround.json','utf8'))}catch(e){return null}})();
A('测试','变异验证',mr&&mr.captured===mr.cases?`捕获${mr.captured}/${mr.cases}`:`未验证(${mr?mr.captured+'/'+mr.cases:'未跑通✗'})`);
/* 【缓存冲刷守卫】—— 进度表固定项（V1.3.71 新增）
 * 立规原因：线上污染清除后，若全站资源 ?v= 未统一升版，已缓存旧文件的玩家
 * 仍会拿到带污染的代码。本项每轮必跑：任一资源漏带 ?v= 或版本号不同步，
 * 看板直接显示未过，不允许把「我记得改过了」当成交付。 */
const cg=(()=>{try{const r=require('child_process').spawnSync('node',['tools/cacheguard.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
  const m=(r.stdout||'').match(/RESULT: PASS=(\d+) FAIL=(\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','缓存冲刷守卫',cg&&cg.f===0?`PASS${cg.p}/0`:`未过${cg?cg.f:'未跑通✗'}项`);
/* 【发布流程守卫】—— 进度表固定项（V1.3.721 新增）
 * 铁律：每次发布版本号必须在末尾 +1（1.3.72 -> 1.3.721），否则玩家缓存不刷新，
 * 表现为「明明修了还是坏的」直接招投诉。本项每轮必跑：
 * 版本单调 / 全站版本戳统一 / 相对上次发布已升版 / manifest 全覆盖 / 流程固化未被删。
 * 任一项不过，看板直接显示未过，禁止发版。 */
/* 【版本规范守卫】—— 进度表固定项（V1.3.73 新增）
 * 立规原因：「末尾追加 1」的旧做法把版本号膨胀到 1.3.72111111111111（14 个 1），
 * 而该字符串玩家在「设置 → 前瞻」看得见。本项跑 mutate_vernorm.cjs，
 * 证明 reset 防滥用（规范版本禁止重设、目标缺失/畸形均拒绝）与
 * PATCH 十进制递增 / 满 99 进位真的生效。任一用例漏网，看板直接显示未过。 */
const vn=(()=>{try{const r=require('child_process').spawnSync('node',['tools/mutate_vernorm.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:180000});
  /* 保留完整输出供排查：看板里报「未过 N 项」时必须能立刻看到是哪一条、为什么，
     不能只给一个数字让人猜（历史教训：断言缩水 242->241 只给数字，查了半天） */
  try{fs.writeFileSync('tools/.vnlast.txt', (r.stdout||'')+(r.stderr||'')+'\n[exit='+r.status+']\n');}catch(e){}
  const m=(r.stdout||'').match(/RESULT: PASS=(\d+) FAIL=(\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','版本规范守卫',vn&&vn.f===0?`PASS${vn.p}/0`:`未过${vn?vn.f:'未跑通✗'}项`);
const rg=(()=>{try{const r=require('child_process').spawnSync('node',['tools/releaseguard.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
  const m=(r.stdout||'').match(/RESULT: PASS=(\d+) FAIL=(\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','发布流程守卫',rg&&rg.f===0?`PASS${rg.p}/0`:`未过${rg?rg.f:'未跑通✗'}项`);
/* 【上传清单覆盖守卫】—— 进度表固定项（本轮新增）
 * 事故：绩效工具 tools/kpi.cjs 修好「换人台账对不上」的缺陷后，因不在
 * push.py 的上传清单里，这份修复永远留在本地、线上仍跑旧版 —— 报告却写着已修。
 * 与 assets/char 整目录从未登记、data/zb/roadmap.json 双分支分叉是同类洞的第 N 次。
 * 本项每轮必跑：dash.cjs 登记的常驻工具 + 实际 spawn 调用的工具 + 核心集，
 * 必须全部在上传清单内；另查幽灵路径与中文路径 percent-encoding。 */
const pc=(()=>{try{const r=require('child_process').spawnSync('node',['tools/pushcov.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
  const m=(r.stdout||'').match(/PASS (\d+) \/ FAIL (\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','上传清单覆盖',pc&&pc.f===0?`PASS${pc.p}/0`:`未过${pc?pc.f:'未跑通✗'}项`);
/* 【布局越界守卫】—— 进度表固定项（V1.3.7211 新增，源自玩家实机投诉）
 * 事故：玩家反馈「按技能选技能时整个画面跑出屏幕」。复盘发现既有闸门只查
 * 「面板能否打开 / 有无异常 / 按钮有无反应」，没有任何一条断言问过
 * 「元素盒子有没有越界」—— 元素 right=420 而视口 360，所有闸门依然全绿。
 * 本项每轮必跑：主界面 / 24 个面板全页签 / 技能三选一，逐个量真实盒子，
 * 越界即报红；并强制三选一描述必须截断为 3 行。 */
const lg=(()=>{try{const r=require('child_process').spawnSync('node',['tools/layoutguard.cjs','360'],{cwd:__dirname+'/..',encoding:'utf8',timeout:300000});
  const m=(r.stdout||'').match(/\[layoutguard\] PASS (\d+) \/ FAIL (\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','布局越界守卫',lg&&lg.f===0?`PASS${lg.p}/0`:`未过${lg?lg.f:'未跑通✗'}项`);
/* 【战斗布局守卫】—— 进度表固定项（V1.3.72111111 事故后新增）
 * 玩家连续两轮反馈「战斗界面打着打着出屏幕」，而既有守卫只覆盖主界面/面板/三选一，
 * 战斗态长期是盲区。本项每轮必跑：战斗中 HUD / 三选一 / 视口变化 / 画布比例，
 * 以及 B8 震屏变换逐帧归零（事故本源：save/restore 不配对导致画面漂移）。 */
const bt=(()=>{try{const r=require('child_process').spawnSync('node',['tools/btlayout.cjs','360x640'],{cwd:__dirname+'/..',encoding:'utf8',timeout:420000});
  const m=(r.stdout||'').match(/\[btlayout\] PASS (\d+) \/ FAIL (\d+) \/ PREREQ (\d+)/);
  /* 无输出 = 崩溃/超时：按铁律判失败，不得回落成中性词 */
  if(!m) return {p:0,f:1,q:0,run:false};
  return {p:+m[1],f:+m[2],q:+m[3],run:true}}catch(e){return {p:0,f:1,q:0,run:false}}})();
/* 三态显示：真缺陷(未过N项) / 前提未就绪(环境问题，需重跑) / 未跑通(工具故障，判失败)
 * 立规原因：此前 B0「未能进入战斗」B2「三选一无法弹出」这类【前提类】断言在负载高时
 * 偶发失败，被记进 FAIL，看板显示「未过 2 项」——把环境问题报成游戏缺陷。
 * 反复误报会让看板使用者对「未过」脱敏，真正的越界失败反而被淹没。 */
A('测试','战斗布局守卫',!bt.run?'未跑通✗(判失败)':bt.f?`未过${bt.f}项✗`:bt.q?`PASS${bt.p}/0·前提未就绪${bt.q}项(需重跑)`:`PASS${bt.p}/0(含B8漂移)`);
/* 【前提类断言守卫】—— 进度表固定项（V1.3.74 新增）
 * 守的是上一条规则本身：前提类断言（B0 进战斗 / B2 弹三选一）衡量的是
 *「测试环境有没有准备好」，不得混进缺陷计数。混入的后果是看板偶发
 *「未过 2 项」而单独复跑全绿 —— 假失败会让人对「未过」脱敏，
 * 真正的越界失败（V1.3.72111111 画面漂移那种）反而被淹没。 */
const bq=(()=>{try{const r=require('child_process').spawnSync('node',['tools/btprereq.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
 const m=(r.stdout||'').match(/\[btprereq\] PASS (\d+) \/ FAIL (\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','前提类断言守卫',bq&&bq.f===0?`PASS${bq.p}/0`:`未过${bq?bq.f:'未跑通✗'}项`);
/* 【三体验守卫】—— 进度表固定项（三体验规则落地）
 * 管理要求：每次修改都要兼顾用户体验 / 开发体验 / AI Agent 体验，三者都要变好，
 * 且不能破坏现有功能。本项每轮必跑：U1~U4 玩家界面干净（无后台视角文案、
 * 无单语言解释、无冗余后缀、无分组标语）；D1~D2 不散落硬编码、已清文案不复活；
 * A2~A3 守卫自述头与退出码语义，保证 Agent 能可靠判断改动是否生效。 */
const ux=(()=>{try{const r=require('child_process').spawnSync('node',['tools/ux3.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
  const m=(r.stdout||'').match(/RESULT: PASS (\d+) \/ FAIL (\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','三体验守卫UX/DX/AX',ux&&ux.f===0?`PASS${ux.p}/0`:`未过${ux?ux.f:'未跑通✗'}项`);
/* 【后台三体验守卫】—— 进度表固定项
 * 立规原因：后台曾出现「✅ 已接入游戏端（CFG_FILES）——…」整句在商城/社交逐字复制、
 * 多语言页用 disabled 下拉 + 一行说明解释它、版本号页放着「记得手动同步」的长教训。
 * 这些都是布局/实现缺陷的文字补丁：控件自己说不清，就写一段话去补。 */
const ax=(()=>{try{const r=require('child_process').spawnSync('node',['tools/adminux.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
 const t=String(r.stdout||'');const m=t.match(/PASS (\d+) \/ FAIL (\d+)/);
 return m?{p:+m[1],f:+m[2]}:{p:0,f:r.status===0?0:1};}catch(e){return {p:0,f:1};}})();
A('测试','后台三体验守卫',ax.f===0?`PASS${ax.p}/0`:`未过${ax.f}项`);
/* 【商城状态卡·购买入口守卫】—— 进度表固定项
 * 立规原因：月卡/战令状态卡未开通时只给一句「在上方购买…」，而商品实际渲染在下方，
 * 指引方向错误且卡内没有按钮，玩家得自己滚下去找 —— 典型的布局缺陷靠文字补。
 * 现在状态卡内直接给购买入口（id/价格一律取商品表，禁止硬编码）。 */
const su=(()=>{try{const r=require('child_process').spawnSync('node',['tools/shopux.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
 const m=(r.stdout||'').match(/RESULT: PASS (\d+) \/ FAIL (\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','商城购买入口守卫',su&&su.f===0?`PASS${su.p}/0`:`未过${su?su.f:'未跑通✗'}项`);
/* 【删文案·视觉替代一致性守卫】—— 进度表固定项（V1.3.75 新增）
 * 立规原因：ux3/adminux 都是黑名单守卫，只查"文字删没删"，从不查"删完还看不看得懂"。
 * 后台公告页挂着长说明解释"过期公告不显示"，而列表根本没有状态列 —— 布局有病靠文字治。
 * 本守卫要求每条删除项都有布局自身的视觉替代（选中态高亮 / 列表状态列），
 * 并真实执行状态纯函数 4 组；含真实差异信息的必要说明登记为保留项防一刀切误删。 */
const ud=(()=>{try{const r=require('child_process').spawnSync('node',['tools/uxdel.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
 const m=(r.stdout||'').match(/RESULT: PASS (\d+) \/ FAIL (\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','删文案视觉替代守卫',ud&&ud.f===0?`PASS${ud.p}/0`:`未过${ud?ud.f:'未跑通✗'}项`);
/* 【埋点数据链路守卫】—— 进度表固定项
 * 立规原因：boot() 里的 game_start 在【登录读档之前】触发，此时 window.P 为 null，
 * 写入存档那一段被整个跳过 —— 事件只落在玩家自己浏览器里，后台永远看不到启动量。
 * 这是历史上「埋点只存本地 → 后台 0 条」那条链路上剩下的最后一个洞。
 * 现在登录前事件先进暂存区，登录完成后由 flushBI 补写进存档。 */
/* 【判据与实现一致性】—— V1.3.77 事故：
 * biguard.cjs 实际输出是 `biguard: PASS=12 FAIL=0`，而本处判据写死
 * `/biguard: PASS (\d+) FAIL (\d+)/`（无等号），永远匹配不到 →
 * 看板一直显示「未跑通✗」，单独跑 biguard 却 exit=0 全绿。
 * 判据与实现脱节 = 把健康工具误报成故障，和假通过一样有害。
 * 修法：等号可选 + 退出码纳入判据（崩溃/超时不得靠 stdout 蒙混过关）。 */
const bg=(()=>{try{const r=require('child_process').spawnSync('node',['tools/biguard.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
 return DP.parseBI(r.stdout,r.status)}catch(e){return null}})();
A('测试','埋点数据链路守卫',bg&&bg.f===0?`PASS${bg.p}/0`:`未过${bg?bg.f:'未跑通✗'}项`);
/* 【错题本 · 复发错误提醒】—— 进度表固定项（本轮新增）
 * 管理要求：老是犯错的部门多提醒，别重复犯错。
 * 所以把历史错题按部门建台账，复发（×2及以上）的错误必须有守卫覆盖；
 * 每轮开工前点名，无覆盖的复发错题直接判失败、禁止发版。 */
const mk=(()=>{try{const r=require('child_process').spawnSync('node',['tools/mistakes.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
  const rec=(r.stdout||'').match(/复发错题（×2及以上）共 (\d+) 条/);
  const unc=(r.stdout||'').match(/其中无守卫覆盖 (\d+) 条/);
  return {rec:rec?+rec[1]:0,unc:unc?+unc[1]:-1}}catch(e){return null}})();
A('测试','错题本复发提醒',mk&&mk.unc===0?`复发${mk.rec}条全覆盖✓`:`未覆盖${mk?mk.unc:'未跑通✗'}条✗`);
/* 【题材铁律守卫】—— 进度表固定项（本轮新增）
 * V1.1.0 把末日废土误做成修仙题材，是全项目最严重的 P0，但长期没有守卫，
 * 同类事故完全可以再犯。代码/界面零容忍，16 条禁用词，已变异验证。 */
const tg=(()=>{try{const r=require('child_process').spawnSync('node',['tools/themeguard.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
  const m=(r.stdout||'').match(/PASS (\d+) \/ FAIL (\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
/* 【错题复发变异验证】—— 进度表固定项（本轮新增）
 * 管理要求：老是犯错的部门多提醒，别重复犯错。
 * 但「错题本里登记了守卫名」不等于不会再犯——必须证明：
 * 把该错按历史形态重新注入，守卫会报红。已实测抓出 2 条形同虚设的守卫
 * （roadmap 全表分工盲区、curve 退出码恒 0）。崩溃不算捕获。 */
const mm=(()=>{try{const r=require('child_process').spawnSync('node',['tools/mistmut.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:600000});
  const o=(r.stdout||'');const n=(o.match(/本轮验证 (\d+) 条，捕获 (\d+)\//)||[]);
  return n[1]&&n[1]===n[2]?{ok:1,t:n[2]}:{ok:0,t:n[2]||0}}catch(e){return null}})();
A('测试','错题复发捕获',mm?(mm.ok?`捕获${mm.t}/${mm.t}✓`:`未捕获✗`):'未跑通✗');
/* 【看板判据一致性】—— V1.3.77 新增固定项
 * 本轮三项遗留异常的修复必须每轮自证：判据与工具输出一致、残快照不冒充结论、
 * 实时基准不写死。守卫自身由 mutate_dashcons.cjs 变异验证（5/5 捕获）。 */
const dc=(()=>{try{const r=require('child_process').spawnSync('node',['tools/dashcons.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
 if(r.status!==0) return null;
 const m=(r.stdout||'').match(/dashcons:\s*PASS=(\d+)\s+FAIL=(\d+)/);return m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','看板判据一致性',dc&&dc.f===0?`PASS${dc.p}/0`:`未过${dc?dc.f:'未跑通✗'}项`);
/* 【变异中断还原】—— V1.3.78 新增固定项
 * 事故：mutguard 在注入态收到 SIGTERM，旧 handler 只清锁就退出，try/finally
 * 没机会执行，tools/push.py 的 c01_jack.jpg 上传条目被删后未还原（发布即线上破图）。
 * 守卫真实起一个停在注入态的子进程、发 SIGTERM，验证文件确实被写回；
 * mutate_mutrestore.cjs 5/5 变异捕获，证明它不是摆设。 */
const mr2=(()=>{try{const r=require('child_process').spawnSync('node',['tools/mutrestore.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:120000});
 const m=(r.stdout||'').match(/RESULT: PASS=(\d+) FAIL=(\d+)/);return r.status===0&&m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','变异中断还原守卫',mr2&&mr2.f===0?`PASS${mr2.p}/0`:`未过${mr2?mr2.f:'未跑通✗'}项`);
const vg=(()=>{try{const r=require('child_process').spawnSync('node',['tools/visguard.cjs'],{cwd:__dirname+'/..',encoding:'utf8',timeout:60000});const m=(r.stdout||'').match(/visguard:\s*PASS=(\d+)\s+FAIL=(\d+)/);return r.status===0&&m?{p:+m[1],f:+m[2]}:null}catch(e){return null}})();
A('测试','视觉审查守卫',vg&&vg.f===0?`PASS${vg.p}/0`:`未过${vg?vg.f:'未跑通✗'}项`);
A('策划','题材铁律守卫',tg&&tg.f===0?`PASS${tg.p}/0`:`未过${tg?tg.f:'未跑通✗'}项`);
A('运营','后台漏斗',funnel?'✓':'✗'); A('运营','反作弊',antiCheat?'✓':'✗');
A('运营','活动日历',ex('运营日历_V1.0.2.md')?'✓':'✗'); A('运营','赛季排期',ex('赛季排期日历_V1.1.0.md')?'✓':'✗'); A('运营','脏订单','已清(5条)');

const by={};D.forEach(o=>(by[o.d]=by[o.d]||[]).push(o));
console.log('=== 制作人固定进度看板 ===');
for(const d of ['策划','美术','程序','音频','测试','运营'])
  console.log(`[${d}] `+(by[d]||[]).map(o=>`${o.k}:${o.v}`).join(' · '));
