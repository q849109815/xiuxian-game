#!/usr/bin/env node
/* ==========================================================================
 * 【V1.2.3 守卫】版本排期可视化（后台六部门 + 玩家端前瞻）
 *
 * 背景：V1.2.2 已把排期做成「后台可在线维护」，但排期数据本身停在 V1.4.0，
 * 且【没有任何部门分工信息】—— 后台看到的只是版本号+一句话，玩家端「前瞻」
 * 也只能看到若干条亮点。本轮要求：排期链条补齐、每个版本带六部门分工、
 * 玩家在游戏里能看到「各部门正在做什么」。
 *
 * 断言分组：
 *   A 排期数据    未来版本数量、可见性、亮点、版本号递增
 *   B 部门分工    未来版本必须六部门齐全（缺一个 = 该部门没排活）
 *   C 链路透传    main.js 的 roadmap 清洗必须保留 dp（否则下发后部门信息丢失）
 *   D 玩家端渲染  ui.js 前瞻页必须有「各部门进度」卡片且只取 next[0]
 *   E 后台可维护  admin pages.js 表格含六部门列、表单可填、可读取
 *   F 云端文件    data/zb/roadmap.json 存在且结构与内置一致（下发用）
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DEPS = ['策划', '美术', '程序', '音频', '测试', '运营'];

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n + (extra ? '  ← ' + extra : '')); } };

/* ---- 解析 config.js 的 VERSIONS（括号配对，不用正则，避免嵌套误判） ---- */
function readVersions() {
  const s = R('js/config.js');
  const start = s.indexOf('VERSIONS: [') + 'VERSIONS: '.length;
  let d = 0, i = start;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '[') d++;
    else if (c === ']') { d--; if (d === 0) { i++; break; } }
  }
  return eval(s.slice(start, i));
}
/* ---- 版本号比较（逐段数字，1.2.10 > 1.2.9） ---- */
const cmpVer = (a, b) => {
  const pa = String(a || '').replace(/^v/i, '').split('.').map(Number);
  const pb = String(b || '').replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
};

const V = readVersions();
const next = V.filter((x) => !x.done && x.pub !== false);

console.log('=== V1.2.3 版本排期守卫 ===');
console.log('排期总数 ' + V.length + ' · 未来可见 ' + next.length);

/* ---------- A 排期数据 ---------- */
ok(V.length >= 20, 'A1 排期总数 >= 20', V.length);
ok(next.length >= 6, 'A2 未来可见版本 >= 6 条（玩家要有得看）', next.length);
ok(next.every((x) => (x.hi || []).length >= 2), 'A3 每个未来版本至少 2 条玩家亮点',
  next.filter((x) => (x.hi || []).length < 2).map((x) => x.v).join(','));
ok(next.every((x) => String(x.n || '').trim()), 'A4 每个未来版本有名称');
ok(next.every((x) => ['patch', 'minor', 'major'].indexOf(x.tp) >= 0), 'A5 类型合法');
for (let i = 1; i < V.length; i++) {
  ok(cmpVer(V[i].v, V[i - 1].v) > 0, 'A6 版本号递增 ' + V[i - 1].v + '→' + V[i].v);
}
/* 必须有 minor 级未来版本（不能全是修 BUG） */
ok(next.some((x) => x.tp === 'minor'), 'A7 未来版本含 minor（不能全是修BUG）');

/* ---------- B 六部门分工 ---------- */
const missDp = next.filter((v) => {
  const d = (v && v.dp) || {};
  return DEPS.some((k) => !String(d[k] || '').trim());
});
ok(missDp.length === 0, 'B1 未来版本六部门分工齐全', '缺: ' + missDp.map((v) => v.v).join(','));
/* 已发布版本不强求 dp，但「下一个要发布的版本」必须有 —— 玩家端只展示 next[0] */
const n0 = next[0];
ok(n0 && n0.dp && DEPS.every((k) => String((n0.dp || {})[k] || '').trim()),
  'B2 下一个版本（玩家端展示的那条）六部门齐全', n0 ? n0.v : '无未来版本');
/* 部门分工不能是套话：至少 6 字，且不能全篇相同 */
const dpTexts = next.map((v) => DEPS.map((k) => String((v.dp || {})[k] || '')).join('|'));
ok(new Set(dpTexts).size === dpTexts.length, 'B3 各版本部门分工不得重复')
ok(next.every((v) => DEPS.every((k) => String((v.dp || {})[k] || '').length >= 4)),
  'B4 部门分工每条至少 4 字（禁止空话）');

/* ---------- C 链路透传（关键：下发后不能丢 dp） ---------- */
const main = R('js/main.js');
const seg = main.slice(main.indexOf("key === 'roadmap'"), main.indexOf("key === 'roadmap'") + 2600);
ok(/dp:/.test(seg), 'C1 main.js roadmap 清洗含 dp 字段');
ok(/'策划'/.test(seg) && /'运营'/.test(seg), 'C2 dp 白名单含六部门键名');
ok(/\.slice\(0,\s*\d+\)/.test(seg), 'C3 dp 文本有长度截断（防后台填超长撑破面板）');
ok(/Array\.isArray\(x\.hi\)/.test(seg), 'C4 hi 透传仍在（不能为加 dp 把 hi 弄丢）');

/* ---------- D 玩家端渲染 ---------- */
const ui = R('js/ui.js');
const segUI = ui.slice(ui.indexOf("tab === '前瞻'"), ui.indexOf("tab === '前瞻'") + 4200);
/* D1 必须匹配【渲染字符串】而非注释：ui.js 注释里也出现过「各部门进度」，
 * 宽松正则会导致"删掉卡片但守卫仍通过"。用带 HTML 上下文的精确串。 */
ok(/card-t">各部门进度/.test(segUI), 'D1 前瞻页渲染出「各部门进度」卡片（精确匹配，防注释误判）');
ok(/next\[0\]/.test(segUI), 'D2 只展示 next[0]（不把整张排期塞给玩家）');
ok(/策划/.test(segUI) && /运营/.test(segUI), 'D3 六部门键名在玩家端渲染');
ok(/E9\(dp\[k\]\)/.test(segUI), 'D4 部门文案经过转义（后台自由输入不能打乱面板）');
/* 玩家端不能出现内部字段 c/ok（内容与验收标准属内部） */
const usesInternal = /dp\[k\][\s\S]{0,200}?v\.c\b/.test(segUI);
ok(!usesInternal, 'D5 部门卡片不泄露内部字段 c/ok');

/* ---------- E 后台可维护 ---------- */
const adm = R('admin/js/pages.js');
/* E1 精确匹配表头数组：pages.js 里 dpForm 的 label 也叫「六部门分工」，
 * 只测裸词会漏掉"表头列被删"的情况。 */
ok(/'六部门分工',\s*'状态'/.test(adm), 'E1 后台排期表含「六部门分工」列（精确匹配表头）');
ok(/const DEPS\s*=/.test(adm), 'E2 后台定义六部门常量');
ok(/dpForm/.test(adm) && /dpRead/.test(adm), 'E3 后台有部门表单与读取函数');
ok(/id="dp_\$\{j\}"|id="dp_/.test(adm), 'E4 部门输入框 id 用下标（避免中文选择器兼容问题）');
ok(/dp:\s*dpRead\(this\)/.test(adm), 'E5 新增与编辑都会写入 dp');
/* 后台表格未排活要有占位提示 */
ok(/未排/.test(adm), 'E6 未排活的部门有占位提示');

/* ---------- F 云端下发文件 ---------- */
const rp = path.join(ROOT, 'data/zb/roadmap.json');
if (fs.existsSync(rp)) {
  try {
    const j = JSON.parse(fs.readFileSync(rp, 'utf8'));
    const list = Array.isArray(j.list) ? j.list : j;
    ok(Array.isArray(list) && list.length >= V.length - 2, 'F1 roadmap.json 条目数与内置基本一致',
      list ? list.length : 0);
    ok(list.every((x) => String(x.v || '').trim()), 'F2 每条有版本号');
    const withDp = list.filter((x) => x.dp && Object.keys(x.dp).length >= 6).length;
    ok(withDp >= 6, 'F3 roadmap.json 含六部门分工的条目 >= 6', withDp);
  } catch (e) { ok(false, 'F1 roadmap.json 解析失败', e.message); }
} else {
  ok(false, 'F1 data/zb/roadmap.json 不存在（未下发，玩家看到的是内置排期）');
}
/* 上传清单必须含 roadmap.json，否则「本地有、线上无」重演 */
const push = R('tools/push.py');
ok(/data\/zb\/roadmap\.json/.test(push), 'F4 上传清单含 data/zb/roadmap.json');

/* ---------- G 真实执行：把 ui.js 前瞻段拿出来真跑一遍，看渲染出的 HTML ----------
 * 静态断言（D 组）只能证明"代码里有这段"，证明不了"玩家真能看到"。
 * 这里在 vm 里加载 config.js + ops.js，再把 ui.js 的前瞻分支包成函数执行，
 * 断言输出 HTML 里确实有「各部门进度」和六部门文案。 */
try {
  const vm = require('vm');
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Math, Date, JSON,
    Number, String, Array, Object, isNaN, parseInt, parseFloat, setTimeout,
    location: { pathname: '/' },
    localStorage: { getItem: () => null, setItem() {} },
  });
  ctx.window = ctx;
  for (const f of ['js/config.js', 'js/ops.js']) {
    vm.runInContext(R(f), ctx, { filename: f });
  }
  const OPS = ctx.OPS || ctx.window.OPS;
  ok(!!OPS, 'G0 OPS 可加载');
  const pn = OPS.pubNext(), pd = OPS.pubDone(8);
  ok(pn.length >= 6, 'G1 玩家可见的未来版本 >= 6 条', pn.length);
  ok(pd.length >= 5, 'G2 玩家可见的已发布版本 >= 5 条', pd.length);

  const uiSrc = R('js/ui.js');
  const a = uiSrc.indexOf("if (tab === '前瞻')");
  const b = uiSrc.indexOf('/* ---------- 运营', a);
  ok(a > 0 && b > a, 'G3 能定位到 ui.js 前瞻分支');
  if (a > 0 && b > a) {
    const seg = uiSrc.slice(a, b);
    /* 把「if (tab === '前瞻') { ... }」整段包成函数体：
     * 段首的 if 与段尾的 } 正好配对，外面再套一层 function 即是合法函数。 */
    const fn = vm.runInContext(
      '(function(tab, window, EX){' + seg + '})', ctx);
    const html = fn('前瞻', { OPS }, ctx.EX);
    ok(typeof html === 'string' && html.length > 200, 'G4 前瞻页渲染出内容', typeof html);
    ok(/各部门进度/.test(html), 'G5 渲染结果含「各部门进度」卡片');
    const n0 = pn[0];
    ok(n0 && new RegExp(n0.v).test(html), 'G6 渲染结果含下一个版本号 ' + (n0 ? n0.v : ''));
    const dpHit = DEPS.filter((k) => new RegExp(k).test(html));
    ok(dpHit.length === 6, 'G7 渲染结果含六部门名', dpHit.join(','));
    /* 部门文案必须真的出现在 HTML 里（不是只有部门名） */
    const hitText = n0 && n0.dp ? DEPS.filter((k) => html.indexOf(String(n0.dp[k])) >= 0) : [];
    ok(hitText.length === 6, 'G8 六部门的具体分工文案都渲染出来了', hitText.length + '/6');
    /* 内部字段不得外泄 */
    ok(n0 && html.indexOf(String(n0.ok || '__NA__')) < 0, 'G9 内部验收标准 ok 不外泄');
    ok(n0 && html.indexOf(String(n0.c || '__NA__')) < 0, 'G10 内部内容字段 c 不外泄');
    /* XSS：后台排期里塞标签不得打乱结构 */
    const evil = Object.assign({}, n0, { dp: Object.assign({}, n0.dp, { 策划: '<img src=x onerror=alert(1)>' }) });
    const fn2 = vm.runInContext('(function(tab, window, EX){' + seg + '})', ctx);
    ctx.OPS.pubNext = () => [evil].concat(pn.slice(1));
    const html2 = fn2('前瞻', { OPS }, ctx.EX);
    ok(!/<img/.test(html2), 'G11 部门文案含 HTML 标签被转义（防后台填错打乱面板）');
  }
} catch (e) {
  ok(false, 'G0 真实执行环境异常', e.message);
}

console.log('\n=== ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + fail + ' ===');
process.exit(fail ? 1 : 0);
