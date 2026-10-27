// 死配置审计：EX 里定义的键名，是否在 config.js 之外被消费
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const cfgSrc=fs.readFileSync(path.join(ROOT,'js/config.js'),'utf8');

// 收集所有键名（含嵌套）
const keys=new Map(); // name -> count in config
for(const m of cfgSrc.matchAll(/([A-Za-z_][\w]*)\s*:/g)){
  const k=m[1];
  if(['http','https','function','return','default','case','true','false','null'].includes(k))continue;
  keys.set(k,(keys.get(k)||0)+1);
}

// 其它 js 源（排除 config.js），含 admin
const otherFiles=[];
for(const d of ['js','admin/js']){
  const dp=path.join(ROOT,d);
  if(!fs.existsSync(dp))continue;
  for(const f of fs.readdirSync(dp)){
    if(!f.endsWith('.js'))continue;
    if(d==='js'&&f==='config.js')continue;
    otherFiles.push(path.join(dp,f));
  }
}
const otherSrc=otherFiles.map(f=>{try{return fs.readFileSync(f,'utf8')}catch(e){return ''}}).join('\n');
const otherLen=otherSrc.length;

const dead=[];
for(const [k,c] of keys){
  /* 在 config 之外是否作为标识符出现。
   * 【V1.2.4 维护轮4 修正】原正则漏了最常见的消费形态——「字符串当函数参数传入」：
   *   实际代码：EX.txt('TXT_002')、SFX('bossIn')、toast(CFG.tips.popup.buyOk)
   *   旧正则四个分支分别要求前面有点 / 外面有方括号 / 后面跟冒号 / 后面跟 = : (
   *   而 'TXT_002') 后面跟的是右括号，一个都不匹配 → 已接线被误判成死键。
   * 后果不是"多报几条"：我据此差点把已接线的运营文案热改层当死代码清理，
   * 而 MUST_BE_WIRED 闸门又只覆盖 5 个键，剩下的全靠人眼看报告判断。
   * 现补第 5 分支：引号包裹后紧跟 , ) ] 之一（参数 / 数组元素 / 对象值）。 */
  const re=new RegExp('(?:\\.'+k+'\\b|\\[\\s*[\'"]'+k+'[\'"]\\s*\\]|[\'"]'+k+'[\'"]\\s*:|\\b'+k+'\\s*[=:(]|[\'"]'+k+'[\'"]\\s*[,)\\]]|\\[[\'"]'+k+'[\'"])');
  const inOther=re.test(otherSrc);
  /* config 内部自消费也算接线（V1.2.3 维护轮3 修正）：
   * 例：TEXT_OVERRIDE 由 config.js 自己的 txt() 读取（this.TEXT_OVERRIDE），
   * 在 config.js 之外零引用。原判据只看外部引用，把它误判成死配置。
   * 出现次数 >1 说明除了定义处还有消费处。 */
  const inCfgUse=(cfgSrc.match(new RegExp('\\b'+k+'\\b','g'))||[]).length>1;
  const inCfgOnly=c; // config 内出现次数
  if(!inOther && !inCfgUse) dead.push({k,cfgCount:c});
}
/* =============================================================
 * 【V1.2.4 维护轮4 新增】待接线资产登记（PENDING）
 *
 * 背景：CFG.tips 是一整套提示文案池（飘字 / 弹窗 / 系统提示 / 报错，23 条），
 * 定义了但界面提示全是硬编码 —— 运营想把「购买成功」改成「购买成功！」必须改代码发版。
 * 这是 V1.1.0「文案热改层」的下半部分（上半部分 TXT_001~008 已接线）。
 *
 * 关键判断：它不是垃圾，是「已经写好的待接线资产」。
 * 若按死配置清理掉，V1.3.0 接线时要重写 23 条文案 —— 等于白干一轮。
 * 所以这里把它们从「疑似死配置」里摘出来单独归类，并加防误删闸门。
 */
// 注意：本登记册必须与 config.js 的 CFG.tips 实时同步。
// V1.3.4 已确认 sys.newWave 与 sys.waveIn 语义重复且从未接线，策划部决定由
// waveIn 统一覆盖并删除该键 —— 但当时漏同步本登记册，导致守卫长期 FAIL 无人
// 发现（发布后缺自查）。V1.3.5 自查发现并移除。
const PENDING_WIRE = [
  'bossCommon','block','lvup','wallHit','immune','lvLocked','buyOk','adLimit',
  'reviveOk','clearConfirm','resetConfirm','sys','saveOk','saveFail','netRetry',
  'waveIn','bossIn','netErr','dataErr','loadErr','opFail','notFound',
];
const pendingSet = new Set(PENDING_WIRE);
const realDead = dead.filter(d => !pendingSet.has(d.k));
const pendingNow = PENDING_WIRE.filter(k => {
  const m = otherSrc.match(new RegExp('[\'"]' + k + '[\'"]'));
  return !m; // 仍然零引用 = 还没接线
});

console.log('EX/CFG 键名总数:',keys.size);
console.log('其它 js 合计字符:',otherLen,'文件:',otherFiles.length);
console.log('---- 未登记死键（真正的垃圾，可清理） ----');
if(!realDead.length) console.log('  （无）');
for(const d of realDead.sort((a,b)=>b.cfgCount-a.cfgCount)) console.log(String(d.cfgCount).padStart(4),d.k);
console.log('未登记死键数:',realDead.length);
console.log('---- 已登记待接线资产（CFG.tips 提示文案池，V1.3.0 接线，禁止当垃圾清理） ----');
console.log('  ',pendingNow.length,'/',PENDING_WIRE.length,'条仍未接线');

/* =============================================================
 * 闸门模式（V1.2.3 维护轮3 新增）
 *
 * 此前本工具只是「探测器」：把疑似死键打印出来就 exit 0。
 * 实测变异验证暴露了这个洞 —— 把已接线的 DROP_EVENT_TXT 改名成
 * DROP_EVENT_TXT_X，它照样列出来、照样 exit 0，CI 永远拦不住。
 * 「看得见」不等于「拦得住」。
 *
 * 这里加一道闸门：下列键是历轮明确接线过的（配了不生效 = 玩家拿不到），
 * 一旦出现在死键名单里，说明接线被改坏，必须 FAIL。
 */
const MUST_BE_WIRED = [
  'DROP_EVENT_TXT',    // 活动掉落角标文案（V1.1.0 六部门联合改善接线）
  'ENDLESS_UNLOCK',    // 无尽模式解锁关卡（V1.0 接线）
  'TEXT_OVERRIDE',     // 运营文案热改层（V1.2.0 接线）
  'SEASON',            // 赛季系统配置（V1.1.0 冲刺3）
  'chapterStarRw',     // 章节集星奖励（V1.2.x）——注意：是驼峰名，勿按大写常量猜
  /* 【V1.2.4 维护轮4 补充】运营文案热改层 TXT_001~006。
   * 此前这 6 条不在闸门里，而旧正则又把它们误判成死键 ——
   * 双重失效：既没拦住，报告还是错的。现已接线于 ui.js 的
   * 出击按钮 / 设置 / 胜利标题 / 广告复活 / 武器页签 / 章节标题。 */
  'TXT_001','TXT_002','TXT_003','TXT_004','TXT_005','TXT_006',
];
const deadSet = new Set(dead.map(d => d.k));
const brokenWiring = [];
for (const k of MUST_BE_WIRED) {
  /* 两种失效形态都要抓：
   *   A 键被改名/删除 —— keys 里查不到（改名后旧名消失，死键名单里也不会有）
   *   B 键还在但没人消费 —— 出现在死键名单里 */
  if (!keys.has(k)) brokenWiring.push(`${k}（键已不存在：被改名或删除）`);
  else if (deadSet.has(k)) brokenWiring.push(`${k}（键存在但零消费）`);
}
if (brokenWiring.length) {
  console.log('\nFAIL 以下「已接线配置」失效（玩家端将拿不到对应功能/奖励）:');
  brokenWiring.forEach(k => console.log('   - ' + k));
  console.log('提示：若是被有意改名，请同步更新本文件的 MUST_BE_WIRED。');
  process.exit(1);
}
console.log('\nPASS 已接线配置全部保持接线（闸门键 ' + MUST_BE_WIRED.length + ' 个）');

/* =============================================================
 * 【V1.2.4 维护轮4 新增】待接线资产防误删闸门
 *
 *  cleaned 掉 23 条文案看起来很"清爽"，但那是 V1.3.0 要用的资产。
 *  这里把它们钉住：一旦键从 config.js 消失（被当垃圾清理 / 改名），必须 FAIL。
 */
const lostPending = PENDING_WIRE.filter(k => !keys.has(k));
if (lostPending.length) {
  console.log('\nFAIL 以下「待接线资产」已从 config.js 消失（V1.3.0 接线将无文案可用）:');
  lostPending.forEach(k => console.log('   - ' + k));
  console.log('提示：若确认废弃，请同步从本文件 PENDING_WIRE 移除。');
  process.exit(1);
}
console.log('PASS 待接线资产完整（' + PENDING_WIRE.length + ' 条，V1.3.0 接线前禁止清理）');

/* ---- 机读计数行（toolaudit 要求）
 * 说明：本工具此前只输出中文 PASS/FAIL 描述、没有数字计数，
 * 下游（进度看板 / 工具体检）无法自动核验"断言有没有缩水"。 */
const _nPass = (brokenWiring.length ? 0 : MUST_BE_WIRED.length)
             + (lostPending.length  ? 0 : 1)
             + (realDead.length     ? 0 : 1);
const _nFail = brokenWiring.length + lostPending.length + realDead.length;
console.log('\nRESULT: PASS=' + _nPass + ' FAIL=' + _nFail);
