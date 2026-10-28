#!/usr/bin/env node
/* ==========================================================================
 * V1.2.2 常驻守卫（测试部 T-15）
 *
 * 守护本轮交付的「版本路线图」能力：
 *   G1 排期表内容：V1.0 ~ V1.4.0 全量入表，已发布/预告/公开标记正确
 *   G2 后台可维护：core.js 登记 roadmap 数据路径 + 按钮级权限映射
 *                 pages.js 具备 增/删/改/公开切换/标记发布/下发/恢复 七个动作
 *   G3 云端下发链路：main.js CFG_FILES.roadmap 登记 + applyCloudCfg 分支存在
 *                  且【真实执行提取出的源码】校验覆盖/净化/保护逻辑
 *   G4 玩家端可见：设置页新增「前瞻」页签 + 渲染分支只展示 pub 版本的 hi
 *   G5 OPS 接口：versions/pubDone/pubNext/curVerNum/cmpVer 行为正确
 *
 * 铁律：每条断言必须能被变异测试证伪，抓不住注入缺陷的断言等于不存在。
 * ========================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let PASS = 0; const FAILS = [];
const ok = (c, n, d) => { if (c) PASS++; else { FAILS.push(n + (d ? ' :: ' + d : '')); console.log('  ✗ ' + n + (d ? ' :: ' + d : '')); } };

/* 剥离块注释与行注释 —— 不剥的话「把代码注释掉」这类变异抓不出来 */
function stripComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\\://])\/\/[^\n]*/g, '$1');
}

const ctx = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, Math, Date, JSON,
  Number, String, Array, Object, isNaN, parseInt, parseFloat, setTimeout,
  location: { pathname: '/' }, fetch: async () => ({ ok: false }),
});
ctx.window = ctx;
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
for (const f of ['js/config.js', 'js/engine.js', 'js/ops.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const EX = ctx.EX, OPS = ctx.OPS;

console.log('=== V1.2.2 守卫：版本路线图（后台可维护 + 玩家可前瞻） ===\n');

/* ---------------- G1 排期表内容 ---------------- */
const V = (EX.VERSIONS || []);
ok(V.length >= 15, 'G1-1 排期表不少于 15 条', 'len=' + V.length);
const byV = (v) => V.find((x) => String(x.v) === v);
['V1.0', 'V1.0.1', 'V1.0.2', 'V1.0.3', 'V1.0.4', 'V1.1.0', 'V1.2.0', 'V1.2.1', 'V1.2.2']
  .forEach((v) => ok(!!byV(v) && byV(v).done === true, 'G1-2 已发布版本入表：' + v));
/* 预告版本断言不写死具体版本号：发版后旧断言会失真（V1.3.0 已发布后原断言即失效）。
 * 改为「数量下限 + 明确远景版本」双条件，仍能被测出（删条目 / 改 done 都会红）。 */
const upcoming = V.filter((x) => x.done === false && x.pub !== false);
ok(upcoming.length >= 3, 'G1-3a 至少 3 条未发布预告版本入表', 'n=' + upcoming.length);
['V1.4.0', 'V1.7.0', 'V1.8.0', 'V2.0.0'].forEach((v) => ok(!!byV(v) && byV(v).done === false, 'G1-3 预告版本入表且未发布：' + v));
/* 未来三轮（V1.7.0 商业闭环与安全 / V1.8.0 内容工业化 / V2.0.0 远征资料片）
 * 每条都必须带六部门分工，否则玩家端「各部门进度」出现空壳 */
const DP6 = ['策划', '美术', '程序', '音频', '测试', '运营'];
['V1.7.0', 'V1.8.0', 'V2.0.0'].forEach((v) => {
  const it = byV(v);
  ok(!!it, 'G1-8 未来三轮入表：' + v);
  if (!it) return;
  ok(it.dp && DP6.every((k) => !!String((it.dp[k] || '')).trim()), 'G1-8b ' + v + ' 六部门分工齐全',
    DP6.filter((k) => !String((it.dp && it.dp[k]) || '').trim()).join(','));
  ok(Array.isArray(it.hi) && it.hi.length > 0, 'G1-8c ' + v + ' 有玩家亮点 hi');
  ok(!!String(it.ok || '').trim(), 'G1-8d ' + v + ' 有验收标准 ok');
});
ok(byV('V2.0.0') && byV('V2.0.0').tp === 'major', 'G1-8e V2.0.0 标记为 major');
/* G1-8f 全表六部门分工齐全 —— 不只断言未来三轮
 * 事故复盘：运营部「排期数据失真 / 建了字段不填」复发 ×3
 *   （V1.2.3 只建功能不填数据；24 条仅 15 条填分工；V1.3.7 表与实际交付不符）。
 * 原断言只覆盖 V1.7.0/V1.8.0/V2.0.0 三条，其余条目 dp 被清空依然全绿 ——
 * 错题复发变异验证 M6 实测「守卫退出码 0，FAIL 0，未捕获」，守卫形同虚设。
 * 现改为全表覆盖：任意公开条目缺任一部门分工即失败。 */
const dpBad = V.filter((x) => x.pub !== false)
  .filter((x) => !(x.dp && DP6.every((k) => !!String((x.dp[k] || '')).trim())));
ok(dpBad.length === 0, 'G1-8f 全表排期六部门分工齐全（防"建了字段不填"复发）',
  dpBad.map((x) => x.v + ':' + (x.dp ? DP6.filter((k) => !String(x.dp[k] || '').trim()).join('/') : '无dp')).join(' | '));
/* 排期表按版本号升序（玩家端前瞻依赖顺序）。
 * 语义修正 V1.3.73：基线重设后「数值顺序」不再等于「发布顺序」——
 * 重设点之前的补丁版是 1.3.721...（数值极大但已归档 pub:false），
 * 重设后的 1.3.73 数值反而更小。因此只对【玩家可见】条目校验升序，
 * 并对归档的畸形版本号单独校验「必须全部 pub:false」。 */
const num = (s) => String(s).replace(/^V/, '').split('.').map((n) => parseInt(n, 10) || 0);
const isMal = (v) => { const g = num(v); return g.length === 3 && g[2] > 99; };
const pubV = V.filter((x) => x.pub !== false);
let asc2 = true, badAt9 = '';
for (let i = 1; i < pubV.length; i++) {
  const a = num(pubV[i - 1].v), b = num(pubV[i].v);
  for (let j = 0; j < 3; j++) { if (a[j] !== b[j]) { if (a[j] > b[j]) { asc2 = false; badAt9 = pubV[i - 1].v + ' -> ' + pubV[i].v; } break; } }
}
ok(asc2, 'G1-9 玩家可见排期按版本号升序', asc2 ? pubV.length + ' 条' : badAt9);
/* 畸形版本号（末尾追加 1 膨胀产物）一律不得对玩家可见 */
const malPub = V.filter((x) => isMal(x.v) && x.pub !== false).map((x) => x.v);
ok(malPub.length === 0, 'G1-9b 畸形版本号全部归档（pub:false）',
  malPub.length ? '仍对玩家可见：' + malPub.join(',') : V.filter((x) => isMal(x.v)).length + ' 条已归档');
/* 早期 V0.x 属内部过程版本，不对玩家公开 */
const v0 = V.filter((x) => /^V0\./.test(String(x.v)));
ok(v0.length > 0 && v0.every((x) => x.pub === false), 'G1-4 V0.x 全部标记 pub:false（不外泄）');
/* 已公开版本必须有玩家亮点，否则玩家端前瞻页是一行空壳 */
const pubDone = V.filter((x) => x.done && x.pub !== false);
ok(pubDone.every((x) => Array.isArray(x.hi) && x.hi.length > 0),
  'G1-5 每个公开已发布版本都有玩家亮点 hi',
  pubDone.filter((x) => !(x.hi || []).length).map((x) => x.v).join(','));
ok(V.every((x) => ['patch', 'minor', 'major'].indexOf(x.tp) >= 0), 'G1-6 每条排期都有合法 tp 类型');
ok(V.every((x) => !!String(x.eta || '').trim()), 'G1-7 每条排期都有上线日期 eta');

/* ---------------- G5 OPS 接口 ---------------- */
ok(typeof OPS.versions === 'function', 'G5-1 OPS.versions 存在');
ok(typeof OPS.pubDone === 'function' && typeof OPS.pubNext === 'function', 'G5-2 pubDone/pubNext 存在');
ok(typeof OPS.curVerNum === 'function' && typeof OPS.cmpVer === 'function', 'G5-3 curVerNum/cmpVer 存在');
/* 无云端覆盖时，versions() 取内置表 */
ok(OPS.versions().length === V.length, 'G5-4 无云端时 versions() 回退内置表');
/* 云端覆盖优先 */
EX.ROADMAP = [{ v: 'V9.9.9', n: '云端版', done: false, pub: true, hi: ['x'], tp: 'minor' }];
ok(OPS.versions().length === 1 && OPS.versions()[0].v === 'V9.9.9', 'G5-5 云端 ROADMAP 优先于内置表');
delete EX.ROADMAP;
/* pubNext 只返回未发布且公开；pubDone 只返回已发布且公开，且倒序 */
const nx = OPS.pubNext();
/* 【不写死版本号】历史教训：断言里写死 V1.x.x，每次发版都会误报一次。
 * 这里改成语义断言：预告必须「未发布且公开且按排期表顺序」，
 * 已发布列表首条必须等于当前版本号（curVerNum），发版后自动成立。 */
ok(nx.length >= 1 && nx.every((x) => !x.done && x.pub !== false),
  'G5-6 pubNext 返回全部未发布公开版本（数量随排期增长，不写死）', nx.length + ' 条 ' + nx.map((x) => x.v).join(','));
/* 用版本号比较器（cmpVer）判定升序，避免字符串比较把 1.2.10 排到 1.2.2 前面 */
let _asc = true;
for (let i = 1; i < nx.length; i++) if (OPS.cmpVer(nx[i - 1].v, nx[i].v) >= 0) _asc = false;
ok(_asc, 'G5-6b 预告按版本号升序（cmpVer 逐段比较）', nx.map((x) => x.v).join(','));
const dn = OPS.pubDone(8);
ok(dn.length === 8, 'G5-7 pubDone 返回 8 条已发布记录', String(dn.length));
ok(dn[0] && dn[0].v === OPS.curVerNum(), 'G5-7b pubDone 首条=当前版本号（发版后自动成立）', (dn[0] && dn[0].v) + ' vs ' + OPS.curVerNum());
ok(dn.every((x) => x.done && x.pub !== false), 'G5-8 pubDone 不含未发布/内部版本');
/* curVerNum 优先取 HOT_UPDATE.version（与 index.html 的 ?v= 同步） */
const hv = String((EX.HOT_UPDATE && EX.HOT_UPDATE.version) || '');
ok(OPS.curVerNum() === 'V' + hv, 'G5-9 curVerNum 取 HOT_UPDATE.version', OPS.curVerNum() + ' vs ' + hv);
/* cmpVer：字符串比较会把 1.2.10 排到 1.2.2 前面，必须逐段数字比 */
ok(OPS.cmpVer('1.2.10', '1.2.9') > 0, 'G5-10 cmpVer 1.2.10 > 1.2.9（非字符串比较）');
ok(OPS.cmpVer('1.10.0', '1.2.0') > 0, 'G5-11 cmpVer 1.10.0 > 1.2.0');
ok(OPS.cmpVer('1.2.2', '1.2.2') === 0, 'G5-12 cmpVer 相等返回 0');

/* ---------------- G3 云端下发链路（真实执行提取出的源码） ---------------- */
const mainSrc = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
const mainClean = stripComments(mainSrc);
ok(/roadmap:\s*'data\/zb\/roadmap\.json'/.test(mainClean), 'G3-1 CFG_FILES 登记 roadmap 路径');
ok(/key === 'roadmap'/.test(mainClean), 'G3-2 applyCloudCfg 含 roadmap 分支');

/* 提取 roadmap 分支源码真实执行 —— 只匹配注释外的代码，且要求分支体完整 */
const m = mainClean.match(/\}\s*else if \(key === 'roadmap'\)\s*\{([\s\S]*?)\n      \}/);
ok(!!m, 'G3-3 能提取 roadmap 分支源码');
if (m) {
  const body = m[1];
  /* 关键保护：非空数组才覆盖、逐字段净化、pub 默认 true */
  ok(/Array\.isArray\(db\.list\)/.test(body), 'G3-4 分支支持 db.list 数组形态');
  ok(/list\.length/.test(body), 'G3-5 空数组不得覆盖（否则后台清空→玩家端白屏）');
  ok(/pub\s*===\s*false\s*\?\s*false\s*:\s*true/.test(body), 'G3-6 pub 默认 true（运营忘勾也应对玩家可见）');

  /* 真实跑一遍提取出的代码 */
  const run = (db) => {
    const ex = { VERSIONS: [{ v: 'V0', n: 'builtin', done: true, pub: false }] };
    const fn = new Function('key', 'db', 'EX', 'log', 'Number', 'String', 'Array', 'Object', 'JSON',
      "if (key !== 'roadmap') return;\n" + body);
    fn('roadmap', db, ex, () => {}, Number, String, Array, Object, JSON);
    return ex.ROADMAP;
  };
  /* 正常下发 */
  const r1 = run({ list: [{ v: 'V1.3.0', n: '新版本', tp: 'minor', eta: '2026-11', hi: ['a', '  ', 'b'], pub: true, done: false, c: '<b>x</b>' }] });
  ok(!!r1 && r1.length === 1, 'G3-7 云端下发后 ROADMAP 被覆盖');
  ok(r1 && r1[0].hi.length === 2, 'G3-8 空亮点行被过滤', JSON.stringify(r1 && r1[0].hi));
  ok(r1 && r1[0].tp === 'minor', 'G3-9 tp 保留合法值');
  ok(r1 && r1[0].pub === true, 'G3-10 pub 显式 true 保留');
  /* 未填 pub → 默认公开 */
  const r2 = run({ list: [{ v: 'V1.5.0', n: 'x' }] });
  ok(r2 && r2[0].pub === true, 'G3-11 未填 pub 默认公开');
  ok(r2 && r2[0].n === 'x' && r2[0].tp === 'patch', 'G3-12 缺失字段有兜底（n/tp）');
  /* 非法 tp 降级 */
  const r3 = run({ list: [{ v: 'V1.6.0', n: 'x', tp: 'huge' }] });
  ok(r3 && r3[0].tp === 'patch', 'G3-13 非法 tp 降级为 patch');
  /* 空数组 / 非数组 / 脏数据 → 不得覆盖（保住内置排期，玩家端不空白） */
  ok(run({ list: [] }) === undefined, 'G3-14 空数组不覆盖');
  ok(run({ list: null }) === undefined, 'G3-15 null 不覆盖');
  ok(run({ list: 'x' }) === undefined, 'G3-16 非数组不覆盖');
  ok(run({}) === undefined, 'G3-17 空对象不覆盖');
  ok(run({ list: [{ n: '无版本号' }] }) === undefined, 'G3-18 无版本号条目被丢弃后不覆盖');
  /* 混入脏条目不应抛异常 */
  let threw = false;
  try { run({ list: [{ v: 'V1.7.0', n: 'ok', hi: 'notarray' }, null, 3, { v: 'V1.8.0' }] }); } catch (e) { threw = true; }
  ok(!threw, 'G3-19 脏数据不抛异常');
}

/* ---------------- G2 后台可维护 ---------------- */
const coreSrc = stripComments(fs.readFileSync(path.join(ROOT, 'admin/js/core.js'), 'utf8'));
const pagesSrcRaw = fs.readFileSync(path.join(ROOT, 'admin/js/pages.js'), 'utf8');
const pagesSrc = stripComments(pagesSrcRaw);
ok(/roadmap:\s*'data\/zb\/roadmap\.json'/.test(coreSrc), 'G2-1 后台 DBP 登记 roadmap 路径');
/* 按钮级权限：写动作必须映射，否则只读审计也能改排期（曾出过同类越权） */
['rmAdd', 'rmEdit', 'rmDel', 'rmPub', 'rmDone', 'rmPush', 'rmReset'].forEach((a) => {
  ok(new RegExp(a + ":\\s*'hotfix\\.push'").test(coreSrc), 'G2-2 按钮权限映射：' + a + ' → hotfix.push');
});
/* 七个动作必须真实存在于 pages.js 且未被注释 */
['rmAdd', 'rmEdit', 'rmDel', 'rmPub', 'rmDone', 'rmPush', 'rmReset'].forEach((a) => {
  ok(new RegExp('\\b' + a + '\\s*\\(').test(pagesSrc), 'G2-3 后台实现动作：' + a);
});
ok(/bind\(\)\s*\{\s*rmLoad\(\);/.test(pagesSrc), 'G2-4 进入页面时拉取云端排期（避免"下发没生效"错觉）');
ok(/DB\.set\(DBP\.roadmap/.test(pagesSrc), 'G2-5 下发写入 data/zb/roadmap.json');
ok(/d\.list\s*=\s*L2/.test(pagesSrc), 'G2-6 下发的字段名 list 与游戏端读取一致');
/* 新增/编辑必须校验版本号非空 —— 空版本号会让玩家端渲染出空白行 */
ok(/版本号不能为空/.test(pagesSrc), 'G2-7 版本号非空校验');
ok(/该版本号已存在/.test(pagesSrc), 'G2-8 版本号重复校验');

/* ---------------- G4 玩家端可见 ---------------- */
const uiSrc = stripComments(fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8'));
/* 必须精确到「设置页 tabs 数组里」含前瞻 —— 只判 /'前瞻'/ 的话，
 * 下面 tab === '前瞻' 分支本身就带这个字符串，把 tabs 删掉也照样命中，
 * 变异测试实测漏检。这里先取出 set 的 tabs 行再判。 */
const setTabsLine = (uiSrc.match(/set:\s*\[[^\]]*\]/) || [''])[0];
ok(/'前瞻'/.test(setTabsLine), 'G4-1 设置页 tabs 数组含「前瞻」', setTabsLine.slice(0, 80));
ok(/tab === '前瞻'/.test(uiSrc), 'G4-2 存在「前瞻」渲染分支');
const fwd = (uiSrc.match(/if \(tab === '前瞻'\)\s*\{([\s\S]*?)\n    \}/) || [null, ''])[1] || '';
ok(fwd.length > 0, 'G4-3 能提取前瞻渲染体');
ok(/pubDone/.test(fwd) && /pubNext/.test(fwd), 'G4-4 前瞻页走 OPS.pubDone/pubNext（只展示 pub 版本）');
ok(/v\.hi/.test(fwd), 'G4-5 展示的是玩家亮点 hi');
ok(!/\bv\.ok\b|\bv\.c\b/.test(fwd), 'G4-6 不展示内部字段（内容 c / 验收标准 ok 不外泄）');
ok(/curVerNum/.test(fwd), 'G4-7 展示当前版本号');
/* 转义：后台是自由文本输入，必须过转义，否则能打乱面板结构 */
ok(/replace\(\/<\/g/.test(fwd), 'G4-8 外显文本经过 HTML 转义');
/* 运营页的版本卡片也要跟云端走，不能继续只读内置表 */
ok(/OPS\.versions\(\)/.test(uiSrc), 'G4-9 运营页版本卡片改读 OPS.versions（含云端覆盖）');

/* ---------------- G6 关卡扩容铁律（制作人 20270426 定） ----------------
 * 铁律：一次只加一章 = 10 关，禁止一次性批量加章。
 * 历史教训：V1.1.0 一次加第 11-15 章共 50 关，数值跨度过大、场景与怪物投放集中，
 * 后续花了 V1.2.0 一整个版本削峰平滑。此后逐章 10 关推进。
 * 只约束「未发布」版本 —— 已发布的历史条目是事实记录，不改写。 */
const upcomingV = V.filter((x) => x.done === false);
ok(upcomingV.length > 0, 'G6-0 存在未发布版本可校验', 'n=' + upcomingV.length);
upcomingV.forEach((x) => {
  const txt = String(x.c || '') + ' ' + String(x.n || '') + ' ' + (x.hi || []).join(' ');
  /* G6-1 禁止跨章批量加关（第 16-18 章 30 关 这类写法）。
   * 豁免：纯调优类（第 6-9 章中期补强）不含关数字样，不是加关，放行。
   * 判据先看跨章片段后 10 字里有没有「N关」——有就是加关，不许跨章。 */
  const TUNE = /补强|优化|调整|平滑|重写|诊断|重做|回顾|翻新/;
  [...txt.matchAll(/第\s*(\d+)\s*[-~至]\s*(\d+)\s*章/g)].forEach((m) => {
    const tail = txt.slice(m.index, m.index + m[0].length + 10);
    const isAdd = /\d+\s*关/.test(tail);
    if (!isAdd && TUNE.test(tail)) return;
    ok(+m[2] - +m[1] <= 0, 'G6-1 ' + x.v + ' 禁止跨章批量加关', m[0] + (isAdd ? '（含关数，判为加关）' : ''));
  });
  /* G6-2 凡是新增章节，必须写明 10 关（一章 = 10 关），不许出现 20/30/50 关 */
  const add = [...txt.matchAll(/第\s*(\d+)\s*章[^，。、]*?(\d+)\s*关/g)];
  add.forEach((m) => ok(+m[2] === 10, 'G6-2 ' + x.v + ' 单章关数必须为 10', m[0]));
  const batch = [...txt.matchAll(/(?:共|总计)\s*(\d+)\s*关/g)];
  batch.forEach((m) => ok(+m[1] % 10 === 0 && +m[1] <= 10, 'G6-2b ' + x.v + ' 一批新增不得超过 10 关', m[0]));
});
/* G6-3 铁律本身必须在配置里留痕，避免后人不知情又批量加章 */
const cfgRaw = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
ok(/一次只加一章\s*=\s*10\s*关/.test(cfgRaw), 'G6-3 配置内留有关卡扩容铁律说明');

/* G7 排期双源一致：js/config.js（源）与 data/zb/roadmap.json（玩家端实际读取）
 * 必须同源。本轮实测 V1.3.7211111 发版后只改了源，玩家端数据仍停在 45 条，
 * 玩家在「设置 → 前瞻」看到的最新版本落后于实际版本 ——
 * 与「本地改了线上没传」同类，只是发生在两份数据文件之间。
 * 由 rmsync.cjs 提供比对（同一份实现，避免守卫与工具两套判据）。 */
const rms = (() => {
  try {
    const r = require('child_process').spawnSync('node', [path.join(ROOT, 'tools/rmsync.cjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') };
  } catch (e) { return { code: -1, out: String(e.message) }; }
})();
ok(rms.code === 0, 'G7-1 排期双源一致（config.js ↔ data/zb/roadmap.json）', rms.out.split('\n')[0]);

console.log('\n结果：PASS ' + PASS + ' / FAIL ' + FAILS.length);
if (FAILS.length) { FAILS.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
console.log('全部通过');
