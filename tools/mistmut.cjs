#!/usr/bin/env node
/**
 * 错题复发变异验证 —— 防「重复犯错」的实质闸门
 *
 * 背景（制作人要求）：老是犯错的部门要多提醒、别重复犯错。
 * 但「错题本里登记了守卫名」不等于「真的不会再犯」——
 * 历史上多次出现：守卫在册，却抓不住该错的具体复发形态（形同虚设）。
 * 典型：deadcfg 自判失效、tips 阈值断言、R4 正则扫出 0 项仍报绿。
 *
 * 铁律（沿用）：抓不住缺陷的断言等于不存在。
 * 所以每条复发错题都必须证明：把它按历史形态重新注入，对应守卫会报红。
 *
 * 用法：
 *   node tools/mistmut.cjs                  跑全部用例
 *   node tools/mistmut.cjs --only M1,M5     只跑指定用例
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const T = (p) => path.join(ROOT, p);
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const rd = (p) => fs.readFileSync(T(p), 'utf8');
const wr = (p, s) => fs.writeFileSync(T(p), s);

/* 每条用例：注入「该错的历史复发形态」→ 跑守卫 → 必须报红 → 还原且 md5 一致 */
const CASES = [
  {
    id: 'M1', dept: '程序', n: 8,
    sig: '配置写了但零调用（配了不生效）',
    guard: 'deadcfg.cjs',
    file: 'js/config.js',
    inject: (s) => s.replace('DROP_EVENT_TXT', 'DROP_EVENT_TXT_X'),
    why: '已接线配置被改名 → 运营填了值、界面永远不生效，而配置还在（肉眼查不出）'
  },
  {
    id: 'M5', dept: '美术', n: 2,
    sig: '资源画了没登记上传清单（本地有、线上无）',
    guard: 'assetguard.cjs',
    file: 'tools/push.py',
    inject: (s) => s.replace("    'assets/cg/cg01_horde.jpg', ", ''),
    why: '清单漏登一张图 → 本地有、线上 404，玩家看到空图'
  },
  {
    id: 'M6', dept: '运营', n: 3,
    sig: '排期数据失真 / 建了字段不填',
    guard: 'roadmap.cjs',
    file: 'js/config.js',
    inject: (s) => {
      /* 按行定位删除 V1.3.8 的 dp 整行（正则难写准：行尾是 `} },` 不是 `} }},`）。
       * 删掉后 `hi: [...],` 保留尾逗号，对象字面量仍合法。 */
      const i = s.indexOf("{ v: 'V1.3.8',");
      if (i < 0) return s;
      const j = s.indexOf('\n      dp: {', i);
      if (j < 0) return s;
      const k = s.indexOf('\n', j + 1);
      /* 整行替换为 dp: {} —— 保留行尾逗号与记录闭合，语法必然合法；
       * 若只删内容会连 `},` 一起删掉，config.js 直接语法错误（已踩过）。 */
      return s.slice(0, j) + '\n      dp: {} },' + s.slice(k);
    },
    why: '未来版本缺六部门分工 → 玩家端前瞻页那张卡片空白，对外承诺失真'
  },
  {
    id: 'M10', dept: '策划', n: 1,
    sig: '题材跑偏（末日废土做成修仙）',
    guard: 'themeguard.cjs',
    file: 'js/config.js',
    inject: (s) => s.replace("n: '玩家可感知交叉验证'", "n: '玩家可感知交叉验证（修仙境界体系）'"),
    why: 'V1.1.0 最严重 P0，此前长期无守卫，同类事故完全可以再犯'
  },
  {
    id: 'M7', dept: '策划', n: 2,
    sig: '数值模型解析错误导致结论反转',
    guard: 'curve.cjs',
    file: 'tools/curve.cjs',
    inject: (s) => {
      /* 必须打真实计算行：历史同类错误——注入打进注释里，源码一字未改，
       * 守卫自然报绿，据此误判「已捕获」。这里反向注入：把修复后的口径
       * 改回事故形态（读 l.rw.gold 恒 undefined → 养成收益全程归零）。 */
      const t = 'Number(l.gold)';
      if (!s.includes(t)) return s;
      return s.replace(t, 'Number((l.rw||{}).gold)');
    },
    why: '事故本源：标量错配 → 养成收益全程归零，误判 6 章卡死并下发错误调优结论'
  },
  {
    id: 'M9', dept: '测试', n: 6,
    sig: '守卫假通过（报绿但一条没查）',
    guard: 'toolaudit.cjs',
    /* 只审计被注入的那一个工具：全量体检要数分钟，
     * 超时被杀时 finally 来不及还原 → 注入叠加 4 次污染 themeguard.cjs（已踩）。 */
    args: ['themeguard.cjs'],
    file: 'tools/themeguard.cjs',
    inject: (s) => "throw new Error('MUT-BOOM');\n" + s,
    why: '守卫崩溃即假通过：历史上 vistate/adm 崩溃无人察觉，工具体检必须判不可信',
    /* selfSig：守卫【自身】必须真的跑完并产出报告，才算「捕获」。
     * 为什么以前判不了：注入的 `throw new Error('MUT-BOOM')` 会被被审工具
     *   themeguard 的栈回显出来，旧判据 CRASH 正则里含 `throw new Error`，
     *   于是「守卫正确识别出目标崩溃」被误判成「守卫自己崩了」——
     *   这是判定工具自身的假阴性，与它要防的「守卫假通过」是同一类洞。
     * 现在改为：以守卫自身报告签名为准；注入串所在行先行剥离再测崩溃词。 */
    selfSig: /共 \d+ 个工具/
  },
  {
    id: 'M2', dept: '程序', n: 3,
    sig: '改了本地但没传到线上（线上漏传）',
    guard: 'synccheck.py',
    file: 'js/config.js',
    inject: (s) => s + '\n/* MUT-LOCAL-ONLY */\n',
    py: true, slow: true,
    why: '本地改了不上传 → 线上跑的还是旧代码，玩家侧等于没修'
  }
];

/* 已由专项变异脚本证明过的复发错题（不再重复注入，避免耗时与污染风险） */
const PROVEN = [
  { id: 'M3', dept: '程序', n: 2, sig: 'CSS 括号缺失致整条声明被丢弃', guard: 'layoutguard.cjs', by: 'mutate_layoutguard.cjs（3/3 含事故本源）' },
  { id: 'M4', dept: '程序', n: 2, sig: '版本号没升导致玩家拿旧缓存', guard: 'releaseguard.cjs', by: 'mutate_releaseguard.cjs（5/5）' },
  { id: 'M8', dept: '测试', n: 2, sig: '测试污染残留进代码/生产', guard: 'fullscan.cjs', by: 'mutate_fullscan.cjs（6/6 含线上内容证）' }
];

const only = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '');
const list = only ? CASES.filter(c => only.split(',').includes(c.id)) : CASES;

const runGuard = (g, ms, args) => {
  const argv = (args || []).slice();
  try {
    const out = g.endsWith('.py')
      ? execFileSync('python3', [T('tools/' + g)].concat(argv), { cwd: ROOT, encoding: 'utf8', timeout: ms })
      : execFileSync('node', [T('tools/' + g)].concat(argv), { cwd: ROOT, encoding: 'utf8', timeout: ms });
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: (e.status == null ? -1 : e.status), out: String(e.stdout || '') + String(e.stderr || '') };
  }
};

/* ------------------------------------------------------------------
 * 捕获判据 judge()
 *
 * 为什么单独抽成函数并带自证：判据本身也可能是假的。
 * 已踩：CRASH 正则里含 `throw new Error`，而注入串恰好就是它 →
 *   守卫明明正确报红，却因为目标工具的栈里回显了注入行而被判「守卫崩溃」。
 *   这是「抓不住缺陷的判据」的镜像形态 —— 把真捕获说成假崩溃。
 *
 * 现在三条判据叠加：
 *   J1 守卫自身报告签名（selfSig，若提供）：没产出报告 = 守卫自己崩了，不算捕获
 *   J2 剥离注入串所在行后再测崩溃词：避免目标工具的栈回显污染判定
 *   J3 退出码非 0：守卫必须真的报红
 * ---------------------------------------------------------------- */
function judge(out, code, selfSig) {
  const raw = String(out || '');
  /* J2：注入行统一带 MUT- 前缀，剥离后再测崩溃词 */
  const clean = raw.split('\n').filter((l) => !/MUT-/.test(l)).join('\n');
  const CRASH = /TypeError|ReferenceError|SyntaxError|Cannot read|Unexpected token|Cannot find module|MODULE_NOT_FOUND/;
  let crashed = false, why = '';
  /* selfSig 是守卫「跑完了」的完成证：只要报告出来了，说明守卫自己没崩，
   * 输出里的崩溃词属于【被审目标】（守卫正在如实报告它崩了）—— 这正是捕获。
   * 没有 selfSig 的用例才退回崩溃词检测（剥离注入行后测）。 */
  if (selfSig) { crashed = !selfSig.test(raw); if (crashed) why = '守卫自身未产出报告'; }
  else if (CRASH.test(clean)) { crashed = true; why = '守卫自身抛异常'; }
  const m = raw.match(/FAIL[=: ]*(\d+)/);
  return { crashed, captured: code !== 0 && !crashed, why, f: m ? m[1] : null };
}

/* 判据自证：抓不住缺陷的判据等于不存在，这条对判据自己也成立。
 * node tools/mistmut.cjs --selftest */
if (process.argv.includes('--selftest')) {
  const SIG = /共 \d+ 个工具/;
  const cases = [
    { n: 'A 守卫跑完并报红（正确捕获）', out: '共 1 个工具：不可信 1\nFAIL=1', code: 1, sig: SIG, want: 'captured' },
    { n: 'B 守卫跑完但报绿（形同虚设）', out: '共 1 个工具：不可信 0 · 可信 1', code: 0, sig: SIG, want: 'missed' },
    { n: 'C 守卫自己崩了（不产出报告）', out: 'TypeError: x of undefined', code: 1, sig: SIG, want: 'crashed' },
    { n: 'D 目标崩溃被守卫正确记录', out: "共 1 个工具：不可信 1\nthrow new Error('MUT-BOOM')", code: 1, sig: SIG, want: 'captured' },
  ];
  let p = 0, f = 0;
  for (const c of cases) {
    const v = judge(c.out, c.code, c.sig);
    const got = v.crashed ? 'crashed' : (v.captured ? 'captured' : 'missed');
    const ok = got === c.want;
    ok ? p++ : f++;
    console.log(`${ok ? '✅' : '❌'} ${c.n} → 判为 ${got}（应为 ${c.want}）`);
  }
  console.log(`\n判据自证 PASS ${p} / FAIL ${f}`);
  process.exit(f ? 1 : 0);
}

/* 启动前残留清理：上一轮若被中断（超时/被杀），注入会留在文件里，
 * 下一轮再跑就会叠加（实测 themeguard.cjs 被叠加 4 层 MUT-BOOM）。
 * 这里先用 .bak_mistmut_* 备份还原，再把残留的已知特征剥掉。 */
(function cleanup() {
  for (const c of CASES) {
    const fp = T(c.file);
    const bak = fp + '.bak_mistmut_' + c.id;
    if (fs.existsSync(bak)) { try { fs.copyFileSync(bak, fp); fs.unlinkSync(bak); } catch (e) {} }
    if (!fs.existsSync(fp)) continue;
    let s = fs.readFileSync(fp, 'utf8');
    const inj = "throw new Error('MUT-BOOM');\n";
    let n = 0;
    while (s.startsWith(inj)) { s = s.slice(inj.length); n++; }
    if (n) { fs.writeFileSync(fp, s); console.log('[cleanup] ' + c.file + ' 剥离残留注入 ×' + n); }
  }
})();

let pass = 0, fail = 0;
const rows = [];
console.log('=== 错题复发变异验证（防重复犯错闸门）===\n');

for (const c of list) {
  const fp = T(c.file);
  const bak = fp + '.bak_mistmut_' + c.id;
  const before = md5(fp);
  fs.copyFileSync(fp, bak);

  let captured = false, crashed = false, detail = '', restored = false;
  try {
    const src = rd(c.file);
    const mut = c.inject(src);
    if (mut === src) throw new Error('注入未生效（替换目标未命中），用例本身失效');
    wr(c.file, mut);

    const r = runGuard(c.guard, c.slow ? 300000 : 180000, c.args);
    /* 捕获判据：退出码非 0 **且**不是崩溃退出。
     * 为什么必须排除崩溃：M7 实测注入后 curve.cjs 直接 TypeError 抛栈，
     * 退出码同样非 0 —— 若只认退出码，会把「工具崩了」误判成「守卫抓住了」，
     * 这是「守卫假通过」的镜像陷阱。崩溃必须单独归类，且不算捕获。 */
    const v = judge(r.out, r.code, c.selfSig);
    crashed = v.crashed; captured = v.captured;
    detail = `守卫退出码 ${r.code}` + (v.f ? `，FAIL=${v.f}` : '');
    if (crashed) detail += ' ← 工具崩溃（非捕获，判据无效）' + (v.why ? `（${v.why}）` : '');
    else if (!captured) detail += ' ← 未捕获，守卫形同虚设';
  } catch (e) {
    detail = '用例异常: ' + e.message;
  } finally {
    fs.copyFileSync(bak, fp);
    fs.unlinkSync(bak);
    restored = md5(fp) === before;
  }

  const okCase = captured && restored;
  okCase ? pass++ : fail++;
  rows.push({ ...c, captured, restored, detail });
  console.log(`${okCase ? '✅' : '❌'} ${c.id} [${c.dept} ×${c.n}] ${c.sig}`);
  console.log(`     守卫 ${c.guard} · ${detail} · 还原${restored ? '一致' : '❌不一致'}`);
}

for (const p of PROVEN) {
  console.log(`✅ ${p.id} [${p.dept} ×${p.n}] ${p.sig}`);
  console.log(`     守卫 ${p.guard} · 已由 ${p.by} 证明`);
}

const total = CASES.length + PROVEN.length;
const got = (only ? pass : pass + PROVEN.length);
console.log(`\n复发错题共 ${total} 条，本轮验证 ${list.length} 条，捕获 ${pass}/${list.length}`);
if (!only && list.length === CASES.length) {
  console.log(`合计已证明可捕获 ${got}/${total} 条`);
}
if (fail) {
  console.log('❌ 存在复发错题未被守卫捕获 —— 禁止发版，必须先补守卫');
} else if (!only) {
  console.log('✅ 全部复发错题均已证明能被守卫捕获');
}
process.exit(fail ? 1 : 0);
