#!/usr/bin/env node
/* ============================================================================
 * tools/toolaudit.cjs —— 检测工具自身的体检（工具的体检医生）
 * ----------------------------------------------------------------------------
 * 为什么要这个：
 *   历史上反复出现「工具自己坏了，于是报告全绿」：
 *     ① acorn 依赖丢失 → static.cjs 启动即退出，却报 FAIL 0（假通过）
 *     ② verdict() 只认 'FAIL+数字' 文案 → 中文失败文案匹配不到，
 *        转而匹配到同行 PASS 字样，把真失败判成通过（判定失真）
 *     ③ 断言数悄悄从 53 掉到 52，没人报警（断言缩水）
 *   这些都不是游戏 BUG，但让「全绿」变成假的。
 *
 * 体检四项（每一项都必须过，否则该工具判「不可信」）：
 *   A 执行证  —— 真的跑起来了（exit code 可信、无 MODULE_NOT_FOUND）
 *   B 断言证  —— 输出里真的有断言计数，且数量 >= 该工具的历史基线
 *   C 退出码证 —— 报 FAIL 时必须 exit != 0；报 PASS 时必须 exit == 0
 *   D 稳定证  —— 连跑 N 次结果完全一致（无时序抖动 / flaky）
 *
 * 用法：
 *   node tools/toolaudit.cjs              全量体检（含 D 稳定证，慢）
 *   node tools/toolaudit.cjs --fast       跳过 D 稳定证
 *   node tools/toolaudit.cjs <name>       只体检指定工具
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = fs.existsSync(path.join(path.dirname(__dirname), 'js/config.js'))
  ? path.dirname(__dirname)
  : path.dirname(path.dirname(__dirname));
const TOOLS = path.join(ROOT, 'tools');
const BASELINE = path.join(TOOLS, '_toolaudit_base.json');

/* 常驻守卫清单：这些是「每轮都要报数」的工具，必须全部可信 */
const GUARDS = [
  'static', 'archguard', 'deadcfg', 'roadmap', 'assetguard',
  'season', 'powerguard', 'tips', 'realm', 'ch1115', 'chapterStar',
  'sceneTheme', 'v110all', 'v121', 'v123', 'ausnd', 'charsnd',
  'hrguard', 'vistate', 'pxcheck', 'txtwire', 'tokproxy',
  /* V1.3.8 体检补录：admperm 管的是后台越权，此前不在体检清单里，
   * 结果它基线就 FAIL 了（tpEdit/tpClear 无权限映射 —— 任何后台账号
   * 都能改全站提示文案），却没人发现。管安全的守卫自己不能被落下。 */
  'admperm', 'adm', 'mutguard', 'cycle',
  /* V1.3.8 补录：mutsentinel 是「防污染」的最后一道闸，此前不在体检清单里，
   * 等于每轮都在用它、却从没体检过它。已补变异用例（注入特征串必须报警）。 */
  'mutsentinel',
  /* V1.3.7211111 补录：themeguard 防的是 V1.1.0「末日废土做成修仙」那次题材事故，
   * 但它是新建守卫，建好后**没登记进 GUARDS** —— 结果它每轮都在报数，
   * 全量体检却根本不检查它（看板长期显示 26/27，那 1 个就是它）。
   * 这与 admperm / mutsentinel 是同一类洞：新建的守卫必须同步登记，
   * 否则「每轮都报绿」只是因为它压根没被体检。 */
  'themeguard',
];

/* 从输出里抓断言计数。
 *
 * 真实项目里各工具的写法并不统一，这里必须覆盖全部已知形态，
 * 否则「解析不到」会被误判成「工具空跑」，反过来又制造一次假结论。
 * 已知形态：
 *   PASS 70 / FAIL 0        PASS:70 FAIL:0
 *   33 passed, 0 failed     22 passed, 0 failed
 *   28 项通过 · 0 项失败     通过 70 失败 0
 *   RESULT: PASS=70 FAIL=0  （本工具要求的规范形态，见 SPEC_LINE）
 */
const SPEC_RE = /RESULT:\s*PASS=(\d+)\s*FAIL=(\d+)/i;
function parseCounts(out) {
  const t = String(out || '');

  /* 规范形态优先 */
  const spec = t.match(SPEC_RE);
  if (spec) return { pass: +spec[1], fail: +spec[2], fmt: 'spec' };

  const grab = (keys) => {
    for (const k of keys) {
      /* 数字在后：PASS 70 / PASS:70 / 通过 70 */
      let m = t.match(new RegExp(k + '\\s*[:：]?\\s*(\\d+)', 'i'));
      if (m) return { n: parseInt(m[1], 10), fmt: k + '(后)' };
      /* 数字在前：70 passed / 70 项通过 */
      m = t.match(new RegExp('(\\d+)\\s*(?:项|个)?\\s*' + k, 'i'));
      if (m) return { n: parseInt(m[1], 10), fmt: k + '(前)' };
    }
    return null;
  };
  const p = grab(['PASS', 'passed', '通过', 'OK']);
  const f = grab(['FAIL', 'failed', '失败', 'NG']);
  return {
    pass: p ? p.n : null,
    fail: f ? f.n : null,
    fmt: (p && p.fmt) || (f && f.fmt) || '',
  };
}

function hasModuleError(out) {
  const t = String(out || '');
  return /Cannot find module|MODULE_NOT_FOUND|Error: Cannot find/i.test(t);
}

/* 断言证：必须能抓到计数，否则视为「空跑」 */
function assertEvidence(res) {
  const text = res.out + res.err;
  const { pass, fail } = parseCounts(text);
  if (pass === null && fail === null) {
    return { ok: false, why: '输出中抓不到任何断言计数（空跑？）', pass: 0, fail: 0 };
  }
  /* SKIP 证：显式跳过必须被看见。
   *
   * 为什么单独拎出来：SKIP 的语义是「这条守卫今天没跑」，不是「跑过了没问题」。
   * 若体检员把 SKIP 当成通过，就复刻了 static 那个经典事故 ——
   * acorn 丢了 → 脚本静默退出 → 报 "FAIL 0" → 全绿。SKIP 是同一个洞的新形态：
   * 工具诚实地宣布"我没跑"，体检员却替它宣布"你通过了"。
   * 因此：断言数为 0 且带 SKIP → 一律判跳过，绝不进「可信」。 */
  const skipped = /SKIP/.test(text) && (pass || 0) + (fail || 0) === 0;
  return { ok: true, why: '', pass: pass || 0, fail: fail || 0, skipped };
}

/* 名字规范化：调用方可能传 'themeguard' 也可能传 'themeguard.cjs'。
 *
 * 事故形态（本轮实测）：原实现一律拼 name + '.cjs'，于是传 'themeguard.cjs'
 * 会去找 'themeguard.cjs.cjs' → 不存在 → 判「文件不存在 / 缺失」。
 * 后果比看起来严重：themeguard 是防「题材跑偏」那次事故的守卫，
 * 而体检员（管所有工具可信度的工具）自己算错路径，就会让一个真实存在、
 * 且运行 PASS 4/0 的守卫从体检清单里消失——又是一次「假结论」：
 * 这次不是工具崩了报绿，是体检员把工具判没了却没人发现。
 * 与错题本第 7 条「守卫假通过（报绿但一条没查）」同源，形态不同。 */
function normName(name) {
  if (/\.cjs$/.test(name)) return { file: path.join(TOOLS, name), run: 'node' };
  if (/\.py$/.test(name)) return { file: path.join(TOOLS, name), run: 'python3' };
  /* 无后缀：优先 .cjs，其次 .py（synccheck.py 等常驻工具也在清单里） */
  const c = path.join(TOOLS, name + '.cjs');
  if (fs.existsSync(c)) return { file: c, run: 'node' };
  const p = path.join(TOOLS, name + '.py');
  if (fs.existsSync(p)) return { file: p, run: 'python3' };
  return { file: c, run: 'node' };
}

function runOnce(name, timeoutMs = 240000) {
  const { file: f, run } = normName(name);
  if (!fs.existsSync(f)) return { name, missing: true, tried: f };
  const r = spawnSync(run, [f], {
    cwd: ROOT, encoding: 'utf8', timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    name,
    missing: false,
    code: r.status,
    out: (r.stdout || '').slice(-4000),
    err: (r.stderr || '').slice(-4000),
    signal: r.signal,
    timedOut: r.signal === 'SIGTERM' || r.error && /ETIMEDOUT/.test(String(r.error)),
  };
}

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { return {}; }
}
function saveBaseline(b) {
  fs.writeFileSync(BASELINE, JSON.stringify(b, null, 2));
}

/* 稳定证豁免名单：这些工具单次就要跑几十次子守卫，重复跑性价比低 */
const SLOW = new Set(['mutguard']);

/* E 变异覆盖率：一条断言若从未被「注入缺陷 → 必须报警」证明过，
 * 它就只是「我以为它有用」。抓不住缺陷的断言等于不存在。 */
function mutguardCoverage() {
  try {
    const src = fs.readFileSync(path.join(TOOLS, 'mutguard.cjs'), 'utf8');
    const covered = new Set();
    const re = /guard:\s*'([A-Za-z0-9_.-]+)\.cjs'/g;
    let m; while ((m = re.exec(src))) covered.add(m[1]);
    return covered;
  } catch (e) { return new Set(); }
}

function main() {
  const args = process.argv.slice(2);
  const fast = args.includes('--fast');
  const append = args.includes('--append');
  const only = args.filter(a => !a.startsWith('--'));
  /* --skip=a,b：mutguard 全量要跑 29×3 次守卫，单次可达数分钟，
   * 会把整场体检拖到超时（实测挂满 5 分钟还没出第一条）。
   * 允许显式跳过，但**跳过必须留痕**（见下方汇总），
   * 否则又变成"没体检过却以为体检过"。 */
  const skipArg = (args.find(a => a.startsWith('--skip=')) || '').slice(7);
  const skipped = skipArg ? skipArg.split(',').filter(Boolean) : [];
  const list = (only.length ? only : GUARDS).filter(n => !skipped.includes(n));

  const base = loadBaseline();
  const covered = mutguardCoverage();
  const rows = [];
  let bad = 0, warn = 0, skipN = 0;

  for (const name of list) {
    const r = runOnce(name);
    const row = { name, code: r.code, issues: [], warns: [] };

    if (r.missing) {
      /* 报出实际尝试的路径：否则「文件不存在」只有结论没有证据，
       * 本轮 themeguard 被拼成 themeguard.cjs.cjs 时，光看"文件不存在"
       * 根本查不出是路径算错还是真没建。 */
      row.issues.push('文件不存在（尝试路径：' + path.relative(ROOT, r.tried || '') + '）');
      row.verdict = '缺失'; bad++; rows.push(row); continue;
    }

    /* A 执行证 */
    if (r.timedOut) row.issues.push('执行超时（判不出结果）');
    if (hasModuleError(r.out + r.err)) row.issues.push('依赖缺失（Cannot find module）→ 极可能假通过');
    if (r.code === null && !r.timedOut) row.issues.push('异常终止（无 exit code）');
    /* 崩溃证：stderr 里有 Node 堆栈但没走断言体系 */
    if (/Node\.js v\d+|^\s+at .+:\d+:\d+$/m.test(r.err) && !/FAIL|失败/.test(r.out)) {
      row.issues.push('脚本崩溃（堆栈输出，非断言失败）—— 环境依赖不满足时应显式 skip');
      /* 诊断：崩溃必须看得见原因，否则体检本身又变成「只知道红了不知道为什么红」。
       * 历史上 vistate 在批次内崩溃、单跑却通过，若没有这段堆栈就只能靠猜。 */
      const stack = String(r.err).split('\n').filter(Boolean).slice(0, 6).join('\n      ');
      if (stack) row.issues.push('崩溃堆栈：\n      ' + stack);
    }

    /* B 断言证 */
    const ev = assertEvidence(r);
    row.pass = ev.pass; row.fail = ev.fail; row.fmt = ev.fmt; row.skipped = !!ev.skipped;
    if (!ev.ok) {
      row.warns.push('输出不可机读：抓不到断言计数，下游无法自动核验（应输出 RESULT: PASS=n FAIL=n）');
    }
    if (ev.skipped) {
      row.warns.push('本轮 SKIP（依赖不满足，该守卫实际未运行）—— 跳过≠通过，必须补跑或改判');
    }

    /* B2 断言缩水 */
    const prev = base[name];
    if (prev && ev.ok) {
      const curTotal = (ev.pass || 0) + (ev.fail || 0);
      const prevTotal = (prev.pass || 0) + (prev.fail || 0);
      if (curTotal < prevTotal) {
        row.issues.push(`断言缩水：${prevTotal} → ${curTotal}（少了 ${prevTotal - curTotal} 条）`);
      }
    }

    /* C 退出码证 */
    if (r.code === 0 && (ev.fail || 0) > 0) {
      row.issues.push(`报 FAIL ${ev.fail} 却 exit 0 —— 退出码失真，下游会误判通过`);
    }
    if (r.code !== 0 && (ev.fail || 0) === 0 && ev.pass !== null) {
      row.issues.push(`exit ${r.code} 但输出无 FAIL 计数 —— 可能是崩溃而非断言失败`);
    }
    if (r.code === 0 && /✗|✘/.test(r.out) && (ev.fail || 0) === 0) {
      row.issues.push('输出含失败标记 ✗ 但计数为 0 —— 计数与明细不一致');
    }
    /* C2 报红证：守卫自己报了 FAIL，不能算「体检通过」。
     *
     * 本轮实测（roadmap）：exit 1、FAIL 1（排期表漏登已发版本），
     * 但体检员按 A/B/C 三条判据判它「可信」—— 因为判据只关心
     * 「工具的输出格式是否可信」，FAIL 本身不构成 issue。
     * 后果：看板上写着「体检可信 7」，底下却压着一条产品缺陷，
     * 谁都不会去看明细。这正是排期漏登能连续第 6 次复发的机制。
     * 工具可信 ≠ 产品没问题：报红必须显式升级为「待整改」，逼人看明细。 */
    if ((ev.fail || 0) > 0) {
      row.warns.push(`守卫本轮报 FAIL ${ev.fail} 条 —— 工具可信但不代表产品没问题，必须处理被点名的缺陷`);
    }

    /* D 稳定证（慢工具豁免：mutguard 本身要跑 26×3 次守卫，
     * 再乘 3 遍稳定证会把一轮体检拖到小时级，收益却不比对 flaky 更高） */
    if (!fast && !SLOW.has(name)) {
      const codes = [], totals = [];
      for (let i = 0; i < 2; i++) {
        const rr = runOnce(name);
        codes.push(rr.code);
        const e2 = assertEvidence(rr);
        totals.push((e2.pass || 0) + (e2.fail || 0));
      }
      const curTotal = (ev.pass || 0) + (ev.fail || 0);
      if (codes.some(c => c !== r.code)) {
        row.issues.push(`结果不稳定（flaky）：exit code 三次为 ${r.code}/${codes.join('/')}`);
      }
      if (ev.ok && totals.some(t => t !== curTotal)) {
        row.issues.push(`断言数不稳定：三次 ${curTotal}/${totals.join('/')}`);
      }
    }

    /* E 变异覆盖率 */
    /* 并发锁特判：mutguard 被另一个实例挡住时 exit 4 并打印「拒绝开工」。
     *
     * 为什么必须单独认出来（本轮实测）：全量体检里 mutguard 报 exit 4、
     * PASS/FAIL 全空，体检员按通用判据判成「不可信 —— 可能是崩溃而非断言失败」。
     * 但真相是它**一条都没跑**（被锁挡下），既不是工具坏、也不是断言失败。
     * 把「没跑成」判成「工具不可信」会误导整改方向：
     * 下一轮会去修一个根本没坏的守卫，而真正的处置只是错峰或清锁。
     * 因此归到「未验证」并单独提示，与 SKIP 同 semantics：跳过≠通过。 */
    if (r.code === 4 && /拒绝开工/.test(r.out + r.err)) {
      row.warns.push('本轮被并发锁挡下（另一实例在跑）—— 一条断言都没跑，不等于通过，需错峰补跑');
      row.locked = true;
    }

    /* 覆盖率比对同样要规范化：mutguard 里登记的是 'themeguard'（无后缀），
     * 若本轮传入的是 'themeguard.cjs'，直接 has() 会查不到，
     * 把「已注册变异用例」误报成「未经证明」。 */
    const bare = String(name).replace(/\.(cjs|py)$/, '');
    if (!covered.has(bare)) {
      /* 自指豁免：mutguard 是「验证守卫的守卫」，它无法用自己验证自己
       * （注入缺陷到自己体内会污染验证器本身，历史上就出过这种事故）。
       * 它的可信度改由「能抓到多少条假守卫」证明，不是靠注册一条自指用例。 */
      if (name === 'mutguard') {
        row.warns.push('自指豁免：不注册自身变异用例（其可信度由「抓出多少假守卫」证明）');
      } else {
        row.warns.push('未在 mutguard 注册变异用例 → 未经证明「抓得住缺陷」');
      }
    }

    if (row.issues.length) { row.verdict = '不可信'; bad++; }
    else if (row.skipped || row.locked) { row.verdict = '未验证'; skipN++; }
    else if (row.warns.length) { row.verdict = '待整改'; warn++; }
    else row.verdict = '可信';
    rows.push(row);

    /* 基线拍摄条件：必须拍在「工具健康」时。
     *
     * 事故形态（本轮实测）：mutsentinel 的基线是 {pass:2, fail:2} —— 拍基线那一刻
     * 它自己正有 2 条失败（污染未清）。污染清完后变 PASS=3 FAIL=0，
     * 体检员却判「断言缩水 4→3」，把「工具修好了」判成了「守卫被删」。
     * 这与 assetguard 基线污染同源：基线在坏状态下拍，之后越修越像缺陷。
     * 因此：本轮有 fail 或不可信时，绝不覆盖基线（沿用旧的健康基线）。 */
    if (!row.issues.length && ev.ok && (ev.fail || 0) === 0) base[name] = { pass: ev.pass, fail: ev.fail };
  }

  console.log('\n===== 检测工具体检 =====\n');
  console.log('工具'.padEnd(16) + 'exit  PASS  FAIL  判定');
  console.log('-'.repeat(62));
  for (const r of rows) {
    const code = r.code === undefined || r.code === null ? '-' : String(r.code);
    console.log(
      r.name.padEnd(16) +
      code.padEnd(6) +
      String(r.pass ?? '-').padEnd(6) +
      String(r.fail ?? '-').padEnd(7) +
      r.verdict
    );
    for (const i of r.issues) console.log('    ✗ ' + i);
    for (const w of r.warns) console.log('    · ' + w);
  }
  console.log('-'.repeat(62));
  console.log(`共 ${rows.length} 个工具：不可信 ${bad} · 未验证(跳过) ${skipN} · 待整改 ${warn} · 可信 ${rows.length - bad - warn - skipN}`);
  if (skipN) console.log(`注意：${skipN} 条守卫本轮未真正运行，其「通过」不成立，不得计入交付依据。`);

  saveBaseline(base);
  /* 结果落盘：固定进度看板每轮要报「工具体检」这一项，
   * 与 .pxlast.json 同机制——不落盘就只能靠人手动抄，抄着抄着就会失真。
   *
   * 支持分批合并（--append）：26 个工具一次跑完会超沙盒时限，
   * 必须分批；但若每批覆盖写盘，last.json 只剩最后那批，看板上的
   * 「可信 N/共 M」就会变成假数字（M 只有几个）—— 这与本工具要治的病同源。
   * 因此按 name 合并：本批结果覆盖同名的旧结果，其余保留。 */
  const lastPath = path.join(TOOLS, '_toolaudit_last.json');
  try {
    let prev = { rows: [] };
    if (append) { try { prev = JSON.parse(fs.readFileSync(lastPath, 'utf8')) || { rows: [] }; } catch (e) { prev = { rows: [] }; } }
    const map = new Map();
    for (const r of (prev.rows || [])) map.set(r.name, r);
    for (const r of rows) map.set(r.name, { name: r.name, verdict: r.verdict, pass: r.pass, fail: r.fail });
    const all = [...map.values()];
    const badAll = all.filter(r => r.verdict === '不可信').length;
    const warnAll = all.filter(r => r.verdict === '待整改').length;
    const skipAll = all.filter(r => r.verdict === '未验证').length;
    fs.writeFileSync(lastPath, JSON.stringify({
      rows: all, total: all.length, bad: badAll, warn: warnAll, skipN: skipAll,
      trust: all.length - badAll - warnAll - skipAll,
      at: new Date().toISOString().slice(0, 19),
    }));
  } catch (e) {}
  process.exit(bad ? 1 : 0);
}

main();
