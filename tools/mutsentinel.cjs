#!/usr/bin/env node
/* ============================================================================
 * tools/mutsentinel.cjs —— 变异残留哨兵
 * ----------------------------------------------------------------------------
 * 为什么要这个（事故复盘，本轮真实发生）：
 *   我用 pkill 强杀了正在运行的 mutguard，它注入到 admin/index.html 的
 *   破图路径 `assets/icon/__mut_missing.png` 没能还原，留在了工作区里。
 *   更糟的是：mutguard 的快照机制「开工前拍照」，此刻工作区已是脏的，
 *   于是**污染被拍成了"干净快照"**。执行 --restore 时它回答：
 *       [无需恢复] 所有文件与快照一致
 *   而文件里确实躺着破图路径。快照机制反而成了污染的保护伞。
 *
 *   源码注释里其实写过这个风险（"若工作区已被污染，快照会固化污染，
 *   所以要做健康检查"）——但**注释写了，代码没做**。这正是本项目
 *   反复出现的事故类型：说得对，没落实。
 *
 * 哨兵三条判据（不依赖快照，独立取证）：
 *   S1 锚点证 —— mutguard 里每条用例的 `from`（原始正确值）必须仍在文件中。
 *                注入会改掉它，没还原就查无此物。这是最强判据，
 *                且天然覆盖全部 29 条用例，加新用例自动纳入。
 *   S2 标记证 —— 全仓库扫描变异特征串（__mut_ / _XXX / 破图名等），
 *                命中即污染。
 *   S3 语法证 —— 被注入过的文件必须能被 node --check / JSON.parse 解析。
 *                注入里有一条 `const UI = {{{` 专门破坏语法。
 *
 * 用法：
 *   node tools/mutsentinel.cjs          检查（有残留 exit 1）
 *   node tools/mutsentinel.cjs --json   机器可读输出
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = fs.existsSync(path.join(path.dirname(__dirname), 'js/config.js'))
  ? path.dirname(__dirname)
  : path.dirname(path.dirname(__dirname));

let pass = 0, fail = 0;
const bad = [];
const ok = (m) => { pass++; console.log('  √  ' + m); };
const ng = (m) => { fail++; bad.push(m); console.log('  x  ' + m); };

/* ---------------------------------------------------------------- S1 锚点证 */
/* 从 mutguard.cjs 解析 REG。
 * 为什么不 require：mutguard 顶层就有副作用（会跑基线），引入即执行。
 * 解析的是源码，所以新增加入的用例会自动进入哨兵覆盖面。 */
const MUT = path.join(ROOT, 'tools/mutguard.cjs');
const regSrc = fs.readFileSync(MUT, 'utf8');

function unesc(s) {
  /* 源码里是转义后的字面量，这里还原成真实文本 */
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\'/g, "'")
          .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
function parseReg(src) {
  const out = [];
  const re = /\{\s*guard:\s*'([^']+)'\s*,\s*file:\s*'([^']+)'\s*,\s*\n?\s*from:\s*(['"])([\s\S]*?)\3\s*,\s*to:\s*(['"])([\s\S]*?)\5/gi;
  let m;
  while ((m = re.exec(src))) {
    out.push({ guard: m[1], file: m[2], from: unesc(m[4]), to: unesc(m[6]) });
  }
  /* 兼容单行写法：from: "..." to: "..." 在同一行 */
  const re2 = /\{\s*guard:\s*'([^']+)'\s*,\s*file:\s*'([^']+)'\s*,\s*from:\s*(['"])([\s\S]*?)\3\s*,\s*to:\s*(['"])([\s\S]*?)\5/gi;
  while ((m = re2.exec(src))) {
    const rec = { guard: m[1], file: m[2], from: unesc(m[4]), to: unesc(m[6]) };
    if (!out.some(x => x.guard === rec.guard && x.from === rec.from)) out.push(rec);
  }
  return out;
}

console.log('=== 变异残留哨兵 ===\n');
console.log('— S1 锚点证：mutguard 每条用例的原始值必须仍在文件中 —');
const REG = parseReg(regSrc);
if (REG.length === 0) {
  ng('S1 解析不到任何用例（哨兵自己失明，等于没有检查）');
} else {
  /* 同一文件只统计一次缺失，避免刷屏 */
  const byFile = new Map();
  for (const r of REG) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  let miss = 0;
  for (const [file, list] of byFile) {
    const fp = path.join(ROOT, file);
    if (!fs.existsSync(fp)) { ng(`S1 ${file} 文件不存在`); continue; }
    const src = fs.readFileSync(fp, 'utf8');
    const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /* A 证：from 必须以「完整标识符」形式存在。
     * 【本轮真实事故】旧实现用 split(from) 数出现次数，而
     * `ENDLESS_UNLOCK_X` 里含 `ENDLESS_UNLOCK` 子串 —— 改名类注入
     * 100% 查不出来。config.js 里 ENDLESS_UNLOCK 被改成 _X 留在生产代码
     * （无尽模式解锁失效，玩家可见），哨兵却报「锚点完好」。
     * 所以两侧都要边界：左边不能是标识符字符，右边也不能。 */
    /* 【为什么只对"纯标识符锚点"加严格边界】
     * 上一版对全部锚点套 (?<![A-Za-z0-9_])...(?!...)，结果两种误报：
     *   ① `--sp-1:` 后面跟 `4px` 的值，数字被当成标识符续接 → 误判污染
     *   ② `?v=1.3.7` 前面是 `.js` 的 s，字母被当成标识符前缀 → 误判污染
     * 标点本身就是天然边界，只有纯标识符才需要额外边界来区分
     * `ENDLESS_UNLOCK` 与 `ENDLESS_UNLOCK_X`。 */
    const isIdent = t => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t);
    const present = (t) => isIdent(t)
      ? new RegExp('(?<![A-Za-z0-9_])' + esc(t) + '(?![A-Za-z0-9_])').test(src)
      : src.includes(t);
    const gone = list.filter(r => !present(r.from));
    /* B 证：注入串 to 不该还在文件里。改名类注入靠 A 证已能抓，
     * 数值类注入（ATK_PER: 0.015 → ATK_PER: 0）A 证抓不到——
     * from 完好无损，只是值被改了。这类必须靠 to 残留来发现。
     * 只查长度 >= 4 的注入串，避免过短文本误报。 */
    const left = list.filter(r => r.to && r.to.length >= 4 && src.includes(r.to));
    if (gone.length) {
      miss += gone.length;
      ng(`S1-A ${file}：${gone.length}/${list.length} 条原始锚点查无此物（未还原）`
        + `\n      例：${JSON.stringify(gone[0].from).slice(0, 90)}`);
    }
    if (left.length) {
      miss += left.length;
      ng(`S1-B ${file}：${left.length} 条注入串仍留在文件里（未还原）`
        + `\n      例：${JSON.stringify(left[0].to).slice(0, 90)}`);
    }
  }
  if (miss === 0) ok(`S1 全部 ${REG.length} 条用例锚点完好（文件数 ${byFile.size}）`);
}

/* ---------------------------------------------------------------- S2 标记证 */
console.log('\n— S2 标记证：全仓库扫描变异特征串 —');
/* 【为什么只扫这 15 个文件】mutguard 只会往 REG 里登记的文件注入，
 * 扫全仓库既慢又误伤——实测把 compat.cjs 自建测试元素 id `__mut_out`
 * 判成了污染。检查范围必须等于污染可能范围。 */
const MARKS = [
  { s: '__mut_missing', why: 'mutguard 注入的不存在资源名' },
  { s: '_XXX', why: '标识符改名类注入的惯用后缀' },
  { s: 'const UI = {{{', why: '语法破坏类注入' },
];
let markHit = 0;
for (const f of [...new Set(REG.map(x => x.file))]) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  let s;
  try { s = fs.readFileSync(fp, 'utf8'); } catch { continue; }
  for (const mk of MARKS) {
    if (s.includes(mk.s)) {
      markHit++;
      ng(`S2 ${f} 含变异标记 "${mk.s}"（${mk.why}）`);
    }
  }
}
if (markHit === 0) ok(`S2 全仓库无变异标记残留（扫描 ${MARKS.length} 种特征）`);

/* ---------------------------------------------------------------- S3 语法证 */
console.log('\n— S3 语法证：被注入过的文件必须仍可解析 —');
const files = [...new Set(REG.map(x => x.file))];
let synBad = 0;
for (const f of files) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  if (/\.json$/i.test(f)) {
    try { JSON.parse(fs.readFileSync(fp, 'utf8')); }
    catch (e) { synBad++; ng(`S3 ${f} JSON 解析失败：${e.message.slice(0, 60)}`); }
    continue;
  }
  if (!/\.(js|cjs)$/i.test(f)) continue;
  const r = cp.spawnSync('node', ['--check', fp], { encoding: 'utf8' });
  if (r.status !== 0) {
    synBad++;
    ng(`S3 ${f} 语法检查失败：${String(r.stderr || '').split('\n')[0].slice(0, 80)}`);
  }
}
if (synBad === 0) ok(`S3 ${files.length} 个受注入文件语法完好`);

/* ------------------------------------------------------------------- 结论 */
console.log('\n' + '='.repeat(58));
if (fail > 0) {
  console.log(`【污染】${fail} 项残留。执行顺序建议：`);
  console.log('  1) 先人工确认 bad 列表里每一项是"该还原"还是"基线已变更"');
  console.log('  2) 手工还原后重跑本哨兵，全绿再开工 mutguard');
  console.log('  3) 快照不可信时，删掉 tools/_mutsnap 让它重新拍照');
}
console.log(`RESULT: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
