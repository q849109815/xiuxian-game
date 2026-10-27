#!/usr/bin/env node
/**
 * tools/mutguard.cjs —— 常驻守卫的「变异验证」总框架
 *
 * 铁律：抓不住缺陷的断言等于不存在。
 * 本工具对每一条常驻守卫，注入一个已知的、具体的缺陷，要求：
 *   ① 基线：守卫必须 PASS（exit 0）
 *   ② 注入：守卫必须 FAIL（exit != 0）—— 抓不住 = 该守卫判「假通过」
 *   ③ 还原：文件内容必须与注入前逐字节一致（md5 校验），且守卫回到 PASS
 *
 * 用法：
 *   node tools/mutguard.cjs            全量验证
 *   node tools/mutguard.cjs <name>     只验证指定守卫
 */
const fs = require('fs'), crypto = require('crypto'), cp = require('child_process'), path = require('path');
const ROOT = '/data/workspace/zombie';
const R = p => fs.readFileSync(ROOT + '/' + p, 'utf8');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const md5f = p => md5(fs.readFileSync(ROOT + '/' + p));

/**
 * 注册表：每条守卫声明它「保护什么」以及「注入什么缺陷」
 *   guard  : 守卫脚本
 *   file   : 被注入的文件（相对仓库根）
 *   from/to: 注入替换（from 必须唯一命中，否则报「注入点不唯一」）
 *   label  : 缺陷描述
 */
const REG = [
  // ---------- 架构层 ----------
  { guard: 'archguard.cjs', file: 'css/tokens.css',
    from: '--sp-1:', to: '--sp-1-X:', label: '删掉一个间距令牌定义' },

  { guard: 'archguard.cjs', file: 'css/style.css',
    from: 'gap:var(--sp-1)', to: 'gap:7px', label: 'CSS 写死像素（绕过间距令牌）', nth: 1 },

  // ---------- 死配置 ----------
  { guard: 'deadcfg.cjs', file: 'js/config.js',
    from: 'DROP_EVENT_TXT', to: 'DROP_EVENT_TXT_X', label: '已接线配置改名 → 变死配置' },

  { guard: 'deadcfg.cjs', file: 'js/config.js',
    from: 'ENDLESS_UNLOCK', to: 'ENDLESS_UNLOCK_X', label: '解锁配置改名 → 变死配置' },

  /* V1.2.4 维护轮4：上轮修了 deadcfg 的正则漏判（'TXT_002') 这类函数参数形态
   * 匹配不到，已接线被误报成死键）。修完必须证明新判据真的抓得住，
   * 否则等于用一个说不清的判据换另一个说不清的判据。 */
  { guard: 'deadcfg.cjs', file: 'js/ui.js',
    from: "EX.txt('TXT_002')", to: "EX.txt('TXT_002_X')",
    label: '运营文案热改接线改名 → 热改失效（函数参数形态）' },

  { guard: 'deadcfg.cjs', file: 'js/config.js',
    from: "      buyOk: '购买成功',", to: '',
    label: '待接线资产被当垃圾清理 → V1.3.0 无文案可用' },

  // ---------- 资源守卫 ----------
  { guard: 'assetguard.cjs', file: 'tools/push.py',
    from: "'assets/char/c01_jack.jpg',", to: '', label: '从上传清单删掉一张图 → 线上 404' },

  /* V1.3.8 补：上面那条只证明了「清单被删」抓得住，没证明「代码里引用被改」
   * 抓得住。而后者才是更常见的翻车方式——改图时顺手改了代码里的路径，
   * 清单里的旧条目还在，守卫此前会报全绿，线上却是破图。
   * 更糟的是：本守卫此前把 .mut/ 变异备份目录也当源码扫了，
   * 备份里留着原引用，于是「引用消失」永远检测不到——
   * 这条用例就是冲着这个洞来的。 */
  { guard: 'assetguard.cjs', file: 'js/config.js',
    from: "'assets/icon/star.jpg?v=", to: "'assets/icon/star_X.jpg?v=",
    label: '代码里资源引用改名 → 线上破图（引用消失检测）', nth: 1 },

  /* ---------- 残留哨兵 ----------
   * mutsentinel 是「防污染」的最后一道闸：上一轮强杀进程把缺陷留在代码里，
   * 而备份快照是在已污染状态下拍的，恢复时回答「无需恢复」，污染被保护下来。
   * 这道闸若抓不住污染，前面所有守卫的结论都可能建立在脏代码上。
   * 因此必须证明：注入一个变异特征串，它得报警。 */
  { guard: 'mutsentinel.cjs', file: 'js/ui.js',
    from: 'const UI = {', to: 'const UI = { /* _XXX */',
    label: '变异特征串残留未清理 → 哨兵必须报警' },

  // ---------- 战力链 ----------
  { guard: 'powerguard.cjs', file: 'js/engine.js',
    from: '  power(p) {', to: '  powerX(p) {', label: '删掉战力函数 → 全站战力崩' },

  // ---------- 赛季 ----------
  { guard: 'season.cjs', file: 'js/config.js',
    from: '  SEASON: {', to: '  SEASON_X: {', label: '赛季配置改名 → 赛季系统失效' },

  // ---------- 章节集星 ----------
  { guard: 'chapterStar.cjs', file: 'js/config.js',
    from: '{ star: 10, rw: { gold: 2000, stamina: 20 } },',
    to: '{ star: 10, rw: {} },', label: '集星首档奖励清空 → 领了没东西' },

  // ---------- 文案热改 ----------
  { guard: 'txtwire.cjs', file: 'js/config.js',
    from: 'TEXT_OVERRIDE: {}', to: 'TEXT_OVERRIDE_X: {}', label: '文案覆盖层改名 → 运营热改失效' },

  // ---------- 音效矩阵 ----------
  { guard: 'ausnd.cjs', file: 'js/audio.js',
    from: "case 'kill':", to: "case 'killX':", label: '击杀音效分支改名 → 击杀无声' },

  // ---------- 第11-15章 ----------
  { guard: 'ch1115.cjs', file: 'js/config.js',
    from: "'assets/icon/z_baojun.jpg'", to: "'assets/icon/z_baojunX.jpg'",
    label: '新僵尸图改名 → 图缺失', nth: 1 },

  // ---------- 场景主题 ----------
  { guard: 'sceneTheme.cjs', file: 'js/config.js',
    from: "unlock: null, scene: 'city' },", to: "unlock: null, scene: 'snow' },",
    label: '第1章首关场景改成雪地 → 主题错位' },

  // ---------- 后台权限 ----------
  { guard: 'admperm.cjs', file: 'admin/js/core.js',
    from: "hkNow: 'hotfix.push',", to: "hkNow: 'hotfix.pushX',", label: '后台权限映射改错 → 越权放行' },

  // ---------- 版本路线图 ----------
  // 【为什么补这条】roadmap.cjs 此前长期 FAIL 2 我却没发现——它不在变异注册表里，
  // 也就从没人验证过它是否可信。实际是断言写死了版本号/条数，每次发版都误报。
  { guard: 'roadmap.cjs', file: 'js/ops.js',
    from: 'return this.versions().filter((x) => x && !x.done && x.pub !== false);',
    to: 'return this.versions().filter((x) => x && x.pub !== false);',
    label: 'pubNext 混入已发布版本 → 玩家前瞻看到过期内容' },

  // ---------- 静态闸门 ----------
  { guard: 'static.cjs', file: 'js/ui.js',
    from: 'const UI = {', to: 'const UI = {{{', label: '制造语法错误' },

  /* ========== V1.3.8 体检补录 ==========
   * 来源：tools/toolaudit.cjs 首次体检发现 9 条常驻守卫从未注册变异用例。
   * 这些守卫每轮都在报数，却从没人验证过它们「抓得住缺陷」——
   * 按铁律（抓不住缺陷的断言等于不存在），它们此前不算数。 */

  { guard: 'tips.cjs', file: 'js/config.js',
    from: 'TIP_OVERRIDE: {}', to: 'TIP_OVERRIDE_X: {}',
    label: '提示文案覆盖层改名 → 运营热改失效' },

  { guard: 'realm.cjs', file: 'js/config.js',
    from: 'ATK_PER: 0.015,', to: 'ATK_PER: 0,',
    label: '军衔每层攻击加成归零 → 满阶加成失效' },

  { guard: 'v110all.cjs', file: 'js/config.js',
    from: "{ id: 'baojun', n: '暴君僵尸'", to: "{ id: 'baojunX', n: '暴君僵尸'",
    label: '新僵尸 id 改名 → 联合审计新内容缺失' },

  { guard: 'v121.cjs', file: 'js/engine.js',
    from: '  grantFrame(p, id) {', to: '  grantFrameX(p, id) {',
    label: '头像框校验函数改名 → 未知 id 又能写进存档' },

  /* 注：原想改 ui.js 的「各部门进度」文案，但该锚点落在字符串字面量里，
   * inCommentOrString 会正确地判为「注入点无效」——改一句文案不等于破坏功能。
   * 改注入 main.js 的 dp 透传键，这是真功能点：改名后下发数据会丢掉部门分工。 */
  { guard: 'v123.cjs', file: 'js/main.js',
    from: 'dp: (function () {', to: 'dpX: (function () {',
    label: 'roadmap 清洗不再透传 dp → 玩家端部门分工全部丢失' },

  { guard: 'charsnd.cjs', file: 'js/config.js',
    from: "sfx: 'balanced', sfxBend: 0", to: "sfx: 'balancedX', sfxBend: 0",
    label: 'C01 角色音型改成未实现值 → 切换角色无声' },

  { guard: 'hrguard.cjs', file: 'tools/hr.cjs',
    from: 'replacedThisRound.add(d);', to: 'replacedThisRound.addXX(d);',
    label: '同轮去重失效 → 连跑两次就凑出「连续2轮C」误换人' },

  { guard: 'pxcheck.cjs', file: 'tools/pxledger.json',
    from: '"anchor": "TIP_OVERRIDE"', to: '"anchor": "TIP_OVERRIDE_XXX"',
    nth: 1,
    label: '交付台账锚点写错 → 五证查无此物，应判交付不成立' },

  { guard: 'tokproxy.cjs', file: 'js/net.js',
    from: "EX.API_PROXY) || ''", to: "EX.API_PROXY_X) || ''",
    label: '代理探测读错配置名 → 填了 Worker 域名也不生效' },

  /* vistate 查的是「加了状态类后计算样式有没有差异」——
   * 把 .star.on 的声明清空，星级点亮和没点亮长得一样，
   * 玩家点满了星却看不出来，正是这个工具存在的理由。 */
  { guard: 'vistate.cjs', file: 'css/style.css',
    from: '.star.on{color:var(--gold);text-shadow:0 0 10px rgba(51, 33, 8, .8);transform:scale(1.12)}',
    to: '.star.on{}',
    label: '星级点亮态样式清空 → 点满了星看不出来' },

  /* V1.3.8 体检补录：adm 管的是「后台每个页面/页签渲染有没有炸」，
   * 是唯一覆盖运营后台的端到端守卫，却从未被验证过抓不抓得住缺陷。
   * 注入一张不存在的图 —— 后台页签里出现破图，正是它存在的理由。 */
  { guard: 'adm.cjs', file: 'admin/index.html',
    from: 'src="../assets/icon/nav_set.png', to: 'src="../assets/icon/__mut_missing.png',
    label: '后台页签图标改成不存在的路径 → 破图' },

  /* V1.3.8 体检补录：cycle 管的是「小版本闭环」——发布后自查、未确认不许开下一代。
   * 它同时核对四处版本号是否一致；把 index.html 的版本戳改回上一版，
   * 若它抓不出来，所谓「闭环」就只是个状态机，管不住真实发布。 */
  { guard: 'cycle.cjs', file: 'index.html',
    from: '?v=1.3.7', to: '?v=1.3.6', nth: 1, allowInString: true,
    label: 'index.html 版本戳回退 → 四处版本号不一致，闭环应拒绝' },

  /* V1.3.8 补录（本轮真事故）：js/ui.js:2038 长期躺着 `if (window.__MUT) return;`
   * ——变异脚本被强杀没还原，玩家侧因 __MUT 恒为 undefined 而无感，
   * mutsentinel 又只查本 REG 的锚点，压根没覆盖到它，于是哨兵一直报绿。
   * 补这条后，fullscan 的 D4 白名单机制纳入哨兵视野：
   * 往真源码塞任何未登记的 window.__xxx，必须当场被抓。 */
  { guard: 'fullscan.cjs', file: 'js/ui.js',
    from: "    if (ce) ce.onclick = () => {",
    to:   "    if (ce) ce.onclick = () => { if (window.__MUTGUARDTEST) return;",
    nth: 1,
    label: '真源码塞未登记开关 → fullscan D4 必须点名报污染' },

  /* ---------- 题材铁律 ----------
   * V1.3.7211111 补录：themeguard 是本轮新建的守卫，出题（V1.1.0 修仙事故）就是
   * 它要防的事，但它自己没注册变异用例 = 从未被证明「抓得住」。
   * 铁律对新建守卫同样有效：抓不住缺陷的断言等于不存在。
   * 用例语义：往 config.js 真源码里塞一个禁用词（修仙），
   * themeguard 的 T1 必须当场点名。 */
  { guard: 'themeguard.cjs', file: 'js/config.js',
    from: "末日废土", to: "末日废土修仙", nth: 1, allowInString: true,
    label: '真源码塞修仙禁用词 → themeguard T1 必须点名（题材铁律）' },
];

/**
 * 判断偏移 i 是否落在「注释 / 字符串字面量」里。
 *
 * 【为什么必须有这一段】历史上我自己踩过：变异锚点第 1 次命中落在注释里，
 * 改名注释当然什么都不会坏，守卫正确地 PASS —— 我却把它判成「守卫假通过」，
 * 差点把一条好守卫改坏。注入点无效 ≠ 守卫无效，两者必须分开判。
 */
function _rxStart(s, k) {
  /* / 到底是除法还是正则开头？看它前面第一个非空白字符。
   * 运算符/左括号/逗号/冒号之后不可能是除法（除法左边必须有操作数），
   * 这些位置出现 / 基本都是正则。 */
  let j = k - 1;
  while (j >= 0 && /\s/.test(s[j])) j--;
  if (j < 0) return true;
  const p = s[j];
  if (/[=(,:[!&|?{};+\-*%~^]/.test(p)) return true;
  if (/\breturn$/.test(s.slice(Math.max(0, j - 6), j + 1))) return true;
  return false;
}

function inCommentOrString(s, i) {
  /* 【V1.3.8 修复】原版不识别正则字面量，是个真缺陷：
   * ui.js 里有 45 处正则含引号（如 .replace(/'/g,'')），
   * 状态机撞上就把那个引号当成字符串起点，此后 q 永远不闭合，
   * 2038 行之后的所有代码全被判成「在字符串里」。
   * 后果：有效注入点被误判为[注入点无效]而跳过 —— 用例从没被证明过，
   * 而报出来的措辞像是锚点的错，真正的缺陷反而藏起来了。 */
  let ln = false, blk = false, q = null, rx = false;  // 行注释/块注释/引号/正则
  for (let k = 0; k < i; k++) {
    const c = s[k], n = s[k + 1];
    if (ln) { if (c === '\n') ln = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (rx) {
      if (c === '\\') { k++; continue; }
      if (c === '/' || c === '\n') rx = false;   // 正则不能跨行
      if (c === '[') { k++; while (k < i && s[k] !== ']') { if (s[k] === '\\') k++; k++; } continue; }
      continue;
    }
    if (c === '/' && n === '/') { ln = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '/' && _rxStart(s, k)) { rx = true; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
  }
  return ln || blk || !!q || rx;
}

function run(guard) {
  const r = cp.spawnSync('node', ['tools/' + guard], {
    /* 【为什么是 90s 而不是 300s】每条用例要跑 3 次守卫（基线/注入/还原），
     * 29 条就是 87 次。实测 mutguard 全量跑能挂死 5 分钟以上还没出第一条结果——
     * 因为某个需要浏览器的守卫在死等。300s×87 次最坏要 7 小时。
     * 超时必须短到"能出结论"，且超时不得判为通过（见 verdict 的 TIMEOUT 分支）。 */
    cwd: ROOT, timeout: 90000, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  const timedOut = r.status === null && r.signal === 'SIGTERM';
  return {
    ec: r.status === null ? -1 : r.status,
    timedOut,
    out: (r.stdout || '') + (r.stderr || ''),
  };
}
const verdict = (guard, out, ec) => {
  /* 【V1.2.4 维护轮4 修正】判定以退出码为准，文案只作辅助。
   *
   * 原判据只认「FAIL + 数字」的文案格式（FAIL 3 / 违规 2 之类）。
   * 但不少守卫的失败文案是中文且不含数字，例如：
   *   FAIL 以下「待接线资产」已从 config.js 消失（V1.3.0 接线将无文案可用）:
   * 守卫其实正确拦下了（exit 1），框架却匹配到同一次输出里的 PASS 字样，
   * 反手给守卫判了个「假通过」—— 用来抓假守卫的工具，自己就是假判定。
   *
   * 守卫的权威语义本来就是退出码（规则②写的就是「exit != 0」），
   * 文案只是给人看的。所以：有数字结论看数字，否则一律听退出码。 */
  if (/FAIL\s*[1-9]/.test(out)) return 'FAIL';
  if (/违规\s*[1-9]/.test(out)) return 'FAIL';
  if (typeof ec === 'number') return ec === 0 ? 'PASS' : 'FAIL';
  if (/\b(PASS|OK)\b/.test(out) && !/FAIL\s*[1-9]/.test(out)) return 'PASS';
  return null;
};

// 自证：判定函数本身也要能被验证（抓不住缺陷的判据等于不存在）
if (process.env.MUTGUARD_SELFTEST) {
  const cases = [
    ['FAIL 以下「待接线资产」已从 config.js 消失（中文无数字）', 1, 'FAIL'],
    ['PASS 已接线配置全部保持接线\nPASS 待接线资产完整', 0, 'PASS'],
    ['--- PASS 46 / FAIL 0 ---', 0, 'PASS'],
    ['FAIL 3 项', 1, 'FAIL'],
  ];
  let bad = 0;
  for (const [out, ec, want] of cases) {
    const got = verdict('x', out, ec);
    if (got !== want) { console.log(`[判定自证失败] want=${want} got=${got} :: ${out.split('\n')[0]}`); bad++; }
  }
  console.log(bad === 0 ? '[判定自证] PASS 4/4（中文 FAIL 文案、纯 PASS、数字结论、混合）'
                        : `[判定自证] FAIL ${bad}/4`);
  process.exit(bad === 0 ? 0 : 1);
}

/* ---------------------------------------------------------------------------
 * 变异快照（V1.3.8 加固）
 * ---------------------------------------------------------------------------
 * 事故复盘：历史上 mutguard 注入后若 run() 抛异常，还原语句根本执行不到，
 * 被改坏的源码就留在工作区里。后果是双重的：
 *   ① 后续用例「基线就不是绿的」，整批验证作废（曾一次作废 4 条 deadcfg 用例）
 *   ② 更危险：污染若被上传，玩家端功能直接失效。
 *     实测抓到过两处真实残留：ENDLESS_UNLOCK→ENDLESS_UNLOCK_X（无尽解锁失效）、
 *     ATK_PER 0.015→0（军衔满阶攻击加成归零，玩家练满 50 层一点攻击都不加）。
 * 所以：开工前全量快照 → 每条用例 try/finally 强制还原 → 收工全量校验。
 * 万一进程被强杀，还能 `node tools/mutguard.cjs --restore` 从快照救回。
 * -------------------------------------------------------------------------*/
const SNAPDIR = path.join(ROOT, 'tools/_mutsnap');
function snapPath(p) { return path.join(SNAPDIR, p.replace(/[^\w.-]/g, '_')); }
function takeSnapshot(files) {
  fs.mkdirSync(SNAPDIR, { recursive: true });
  const meta = {};
  for (const f of files) meta[f] = md5f(f);
  fs.writeFileSync(path.join(SNAPDIR, '_meta.json'), JSON.stringify(meta, null, 2));
  for (const f of files) fs.writeFileSync(snapPath(f), fs.readFileSync(ROOT + '/' + f));
  return meta;
}
function restoreAll() {
  const mp = path.join(SNAPDIR, '_meta.json');
  if (!fs.existsSync(mp)) { console.log('[无快照] 未找到 _mutsnap/_meta.json，无法恢复'); return 1; }
  const meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
  let fixed = 0;
  for (const f of Object.keys(meta)) {
    const sp = snapPath(f);
    if (!fs.existsSync(sp)) continue;
    const fp = ROOT + '/' + f;
    if (fs.existsSync(fp) && md5f(f) === meta[f]) continue;
    fs.writeFileSync(fp, fs.readFileSync(sp));
    console.log(`[已恢复] ${f}`);
    fixed++;
  }
  console.log(fixed === 0 ? '[无需恢复] 所有文件与快照一致' : `[恢复完成] 共 ${fixed} 个文件`);
  return 0;
}
const SNAP_FILES = [...new Set(REG.map(x => x.file))];

if (process.argv[2] === '--restore') process.exit(restoreAll());

/* ---------------------------------------------------------- 并发锁 ------ */
/* 【V1.3.8 真事故】沙盒把超时的 mutguard 命令砍掉，但 node 进程还活着继续跑。
 * 于是同一份 tools/_mutsnap 快照被多个实例同时读写：
 *   A 拍照 → B 拍照（把 A 的注入状态拍成基线）→ A 还原到 B 的快照…
 * 快照是唯一的还原依据，被并发搅乱后，"还原"可能把污染写进生产代码。
 * 实测曾出现 4 个 mutguard 进程并存。
 *
 * 锁文件记 PID；若 PID 已不存在（上次被强杀遗留），判为陈旧锁自动接管，
 * 否则拒绝开工 —— 宁可不验证，也不能让两个实例互毁快照。 */
const LOCK = path.join(ROOT, 'tools', '.mutguard.lock');
function acquireLock() {
  if (fs.existsSync(LOCK)) {
    let pid = NaN;
    try { pid = parseInt(fs.readFileSync(LOCK, 'utf8').trim(), 10); } catch (e) {}
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (e) {}
    /* 自锁排除：锁里的 PID 必须不是自己。
     *
     * 事故形态（本轮实测）：锁文件里写着 27969，而当前进程 PID 恰好也是 27969
     * （PID 复用 + 上一轮遗留的陈旧锁），于是 process.kill(27969,0) 成功、
     * 判定"已有实例在跑"——**它把自己当成了另一个实例，拒绝开工**。
     * 表现：mutguard 连续两轮 exit 4、PASS/FAIL 全空、一条断言都没跑，
     * 而体检员只能看到"不可信"，看不出是被自己挡住的。
     * 危害：变异验证（"抓不住缺陷的断言等于不存在"这条铁律的执行者）
     * 会静默停摆，全站守卫的可信度在无人察觉的情况下失效。
     * 陈旧锁本身就是 PID 复用的温床，因此必须显式排除自己。 */
    if (alive && pid === process.pid) {
      console.log(`[陈旧锁] 锁内 PID ${pid} 即本进程（PID 复用），接管`);
      alive = false;
    }
    if (alive) {
      console.log(`[拒绝开工] 已有 mutguard 实例在跑（PID ${pid}）。`);
      console.log('  两个实例共享 tools/_mutsnap，会互毁快照。等它结束，');
      console.log(`  或确认已僵死后删除 ${LOCK}。`);
      process.exit(4);
    }
    console.log(`[陈旧锁] PID ${pid} 已不存在，接管`);
  }
  fs.writeFileSync(LOCK, String(process.pid));
  const rel = () => { try { fs.unlinkSync(LOCK); } catch (e) {} };
  process.on('exit', rel);
  process.on('SIGTERM', () => { rel(); process.exit(143); });
  process.on('SIGINT', () => { rel(); process.exit(130); });
}
acquireLock();

/* V1.3.8：支持一次传入多个守卫名。
 * 为什么：全量 30 条用例一次跑完会顶到沙盒时限，一旦被强杀，
 * 注入的缺陷就留在代码里（上一轮就是这样把污染带进生产代码的）。
 * 能分批 = 每批都能在时限内完整跑完「注入→验证→还原」，才敢说没残留。 */
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const list = only.length ? REG.filter(x => only.includes(x.guard)) : REG;

/* 开工前：先把所有可能被注入的文件照一遍。
 * 注意：若工作区此刻已被上一轮污染，快照本身就会把污染记录下来。
 * 所以额外做一次「健康检查」——跑一条不依赖注入的守卫，若它基线不绿，
 * 说明起始状态就是脏的，直接拒绝开工（否则会把污染固化成"干净态"）。 */
/* 【开工前健康检查 —— 本轮补齐】
 * 上面那段注释早就警告过：「若工作区已被上一轮污染，快照会把它拍成干净态」。
 * 但代码里一直没实现，于是它真的发生了：强杀进程留下污染，
 * 快照把污染固化，--restore 回答「无需恢复」，破图路径就这么进了工作区。
 *
 * 判据不依赖快照（快照可能已被污染），改由哨兵独立取证：
 * 检查 mutguard 自己登记的 29 条原始锚点是否都还在 + 变异标记是否残留。
 * 有污染就拒绝开工并给出修复指引——带着污染开工，每条用例都会因
 * 「基线不绿」被跳过，整批验证作废，污染还会被固化成新的干净态。 */
if (!process.env.MUTGUARD_SKIP_SENTINEL) {
  const s = cp.spawnSync('node', ['tools/mutsentinel.cjs'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const sOut = String(s.stdout || '') + String(s.stderr || '');
  if (s.status !== 0) {
    console.log('=== 开工前健康检查：拒绝开工 ===');
    console.log(sOut.trim());
    console.log('\n污染状态下开工会把脏数据固化成"干净快照"，必须先清理。');
    console.log('确认为误报时可用 MUTGUARD_SKIP_SENTINEL=1 跳过（不推荐）。');
    process.exit(3);
  }
  console.log('[开工前健康检查] 无变异残留，可以开工');
}

const BASE0 = takeSnapshot(SNAP_FILES);

console.log('=== 常驻守卫变异验证 ===');
console.log('规则：基线必须 PASS → 注入必须 FAIL → 还原必须 md5 一致且回到 PASS');
console.log(`快照：${SNAP_FILES.length} 个文件已备份到 tools/_mutsnap（异常中断可 --restore 恢复）\n`);

let pass = 0, fake = 0, broken = 0;
const rows = [];

for (const m of list) {
  const fp = ROOT + '/' + m.file;
  if (!fs.existsSync(fp)) { console.log(`[跳过] ${m.guard} 目标文件不存在 ${m.file}`); continue; }
  const src = fs.readFileSync(fp, 'utf8');
  const hit = src.split(m.from).length - 1;
  if (hit < 1) {
    console.log(`[锚点不存在] ${m.guard} / ${m.file} 「${m.from}」 —— 该变异无效，跳过`);
    broken++; continue;
  }
  if (hit > 1 && !m.nth) {
    console.log(`[注入点不唯一] ${m.guard} / ${m.file} 「${m.from}」命中 ${hit} 次 —— 该变异无效，跳过`);
    broken++; continue;
  }
  // 只替换第 nth 处（nth 缺省时 hit 已保证为 1）
  const idxOf = s => {
    if (hit === 1) return s.indexOf(m.from);
    let i = -1, n = 0;
    while (n < m.nth) { i = s.indexOf(m.from, i + 1); n++; }
    return i;
  };
  const at = idxOf(src);
  if (at >= 0 && !m.allowInString && inCommentOrString(src, at)) {
    console.log(`[注入点无效] ${m.guard} / ${m.file} 「${m.from}」第 ${m.nth || 1} 处落在注释或字符串里 —— 改它不会破坏任何功能，该变异无法证伪守卫，请换锚点`);
    broken++; continue;
  }
  const inject = s => {
    const i = idxOf(s);
    return s.slice(0, i) + m.to + s.slice(i + m.from.length);
  };
  const before = md5(src);

  // ① 基线
  const b = run(m.guard);
  const bv = verdict(m.guard, b.out, b.ec) || (b.ec === 0 ? 'PASS' : 'FAIL');
  if (b.timedOut) {
    /* 守卫跑不完 ≠ 守卫通过。历史上它挂 5 分钟，整批验证出不了结论，
     * 我却一直以为"在跑"。现在显式计为失效：这条用例没被证明过。 */
    console.log(`[守卫跑不完] ${m.guard} —— 90s 内没出结果，无法验证它抓不抓得住`);
    broken++; continue;
  }
  if (bv !== 'PASS') {
    console.log(`[基线就不是绿的] ${m.guard} —— 先修守卫再谈验证 (exit ${b.ec})`);
    broken++; continue;
  }

  // ② 注入 —— 必须包在 try/finally 里：run() 抛异常时还原语句以前根本执行不到
  let iv = 'ERR', i = { ec: -1 }, after = '', restored = false, rv = 'ERR', crashed = '';
  let r0 = { ec: -1, timedOut: false };   /* 还原后那次运行的证据，需带出 finally 作用域 */
  try {
    fs.writeFileSync(fp, inject(src));
    i = run(m.guard);
    iv = verdict(m.guard, i.out, i.ec) || (i.ec === 0 ? 'PASS' : 'FAIL');
  } catch (e) {
    crashed = String(e && e.message || e);
  } finally {
    // ③ 还原 —— 无论上面发生了什么，这里一定会执行
    fs.writeFileSync(fp, src);
    after = md5f(m.file);
    restored = after === before;
    if (!restored) {
      // 二次强制还原：实测过一次写回失败（并发占用），再试一次
      fs.writeFileSync(fp, src);
      after = md5f(m.file);
      restored = after === before;
    }
    r0 = run(m.guard);
    rv = verdict(m.guard, r0.out, r0.ec) || (r0.ec === 0 ? 'PASS' : 'FAIL');
  }

  /* 注入后若守卫自己跑不完（超时），不能算"捕获"——它什么都没证明。
   * 两种情况都要排除，否则超时会伪装成通过或伪装成捕获。 */
  if (i.timedOut) iv = 'TIMEOUT';
  if (r0.timedOut) rv = 'TIMEOUT';
  const ok = (iv === 'FAIL') && restored && (rv === 'PASS');
  const tag = ok ? '✅捕获' : (iv !== 'FAIL' ? '❌假通过' : (!restored ? '❌未还原' : '❌还原后不绿'));
  if (ok) pass++; else if (iv !== 'FAIL') fake++; else broken++;

  rows.push({ guard: m.guard, label: m.label, tag, iv, restored, rv });
  console.log(`${tag}  ${m.guard.padEnd(18)} ${m.label}`);
  if (!ok) console.log(`        注入后判定=${iv} exit=${i.ec} 还原md5=${restored ? '一致' : '不一致'} 还原后=${rv}${crashed ? ' 崩溃=' + crashed : ''}`);

  /* fail-fast：还原失败就立刻停，绝不带着污染继续跑。
   * 历史教训：带着污染继续，后面每条用例都会因为「基线不绿」被跳过，
   * 一次污染直接作废整批验证（曾一次作废 4 条 deadcfg 用例），
   * 而且最终污染留在工作区里，随时可能被上传。 */
  if (!restored) {
    console.log(`\n❌ 中止：${m.file} 未能还原（期望 md5 ${before.slice(0, 8)}…，实际 ${after.slice(0, 8)}…）`);
    console.log('   已跳过其余用例。请执行 `node tools/mutguard.cjs --restore` 恢复后重跑。');
    broken = list.length - pass - fake; // 其余全部计为失效，不得算通过
    finish();
    process.exit(2);
  }
}

function finish() {
  /* 收工全量校验：拿开工时拍的快照逐文件比对。
   * 这是最后一道闸——即便前面每条用例都自称「已还原」，
   * 只要有一个字节对不上，整批结论都不可信。 */
  let dirty = [];
  for (const f of SNAP_FILES) {
    if (!fs.existsSync(ROOT + '/' + f)) { dirty.push(f + '（文件消失）'); continue; }
    if (md5f(f) !== BASE0[f]) dirty.push(f);
  }

  console.log(`\n=== 汇总 ===`);
  console.log(`捕获 ${pass} / 假通过 ${fake} / 其他失效 ${broken}  (共 ${list.length})`);

  if (dirty.length) {
    console.log(`\n❌ 工作区仍被污染（与开工快照不一致）：`);
    for (const d of dirty) console.log(`   - ${d}`);
    console.log('   请执行 `node tools/mutguard.cjs --restore` 恢复后再上传，否则会把缺陷带上线。');
  } else {
    console.log(`工作区校验：${SNAP_FILES.length} 个文件全部与开工快照一致（无变异残留）`);
  }

  /* 【为什么必须加上 pass === list.length】
   * 实测：`mutguard deadcfg`（守卫名写成不带 .cjs）匹配到 0 条用例，
   * 它照样输出「结论：全部常驻守卫具备真实捕获能力」+ PASS=0 FAIL=0。
   * 一条都没验证，却宣布全部可信 —— 与 adm「断言数归 0 却报绿」
   * 是同一种假通过，出现在管所有守卫可信度的工具自己身上，性质更重。
   * 覆盖面缩水必须判失败：验证数必须等于注册数。 */
  const clean = fake === 0 && broken === 0 && dirty.length === 0
                && list.length > 0 && pass === list.length;
  if (list.length === 0) {
    console.log('\n❌ 用例数为 0：守卫名需带 .cjs 后缀（如 deadcfg.cjs），或该守卫尚未注册用例。');
    console.log('   0 条用例不得宣布「全部可信」。');
  } else if (pass !== list.length) {
    console.log(`\n❌ 覆盖面不足：注册 ${list.length} 条，实际证明捕获 ${pass} 条。`);
    console.log('   未证明的部分等于没验证，不得计入「全部可信」。');
  }
  console.log(clean ? '结论：全部常驻守卫具备真实捕获能力' : '结论：存在不可信守卫或残留污染，必须修复后重跑');
  /* 机读结果行：此前本工具只输出「捕获 27 / 假通过 0」，体检员抓不到断言计数，
   * 只能读到 PASS=0 FAIL=0 —— 若哪天本工具崩溃，同样显示 0/0，与「全通过」无法区分。
   * 以「成功捕获的变异用例数」为 PASS，让覆盖面缩水（用例被删）能被体检员看见。 */
  /* 覆盖面缺口也要计进 FAIL，否则机读行会显示 PASS=0 FAIL=0，
   * 与「全通过」在数字上无法区分（这正是体检员此前抓不到问题的原因）。 */
  const gap = Math.max(0, list.length - pass) + (list.length === 0 ? 1 : 0);
  console.log(`RESULT: PASS=${pass} FAIL=${fake + broken + dirty.length + gap}`);
  return clean ? 0 : 1;
}
process.exit(finish());
