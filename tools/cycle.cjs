#!/usr/bin/env node
/* ============================================================================
 * 小版本（PATCH）闭环流程
 * ----------------------------------------------------------------------------
 * 制度：发布 → 自查 → 修复 → 确认 → 才开下一代
 *
 * 为什么需要这个工具：
 *   V1.3.5 对刚发布的 V1.3.4 做自查，一次就抓出两个「发布后无人发现」的问题：
 *     ① deadcfg 登记册残留已删除的 sys.newWave → 守卫长期 FAIL
 *     ② realm 守卫取样顺序写错 → 军衔满阶加成恒为 0，守卫长期误报
 *   两者都不是玩家能看见的 BUG，但都让「全绿」变成假的。发布后不自查，
 *   就等于把上一轮的债原封不动背进下一轮。
 *
 * 小版本方向定义（PM 拍板，写死在这里，不得临时起意）：
 *   一个小版本只做三种事，且必须能从候选池里追到来源：
 *     A 修 BUG      —— 玩家可感知的缺陷
 *     B 补接线      —— 配了不生效 / 历史挂账
 *     C 体验微调    —— 不改战斗数值逻辑
 *   小版本【不做】新玩法、不做数值重构、不做题材改动（那是 MINOR / MAJOR）。
 *   每个小版本必须有可验证的完成标准（roadmap 的 ok 字段），
 *   给不出量化标准的条目不得进入小版本。
 *
 * 用法:
 *   node tools/cycle.cjs status              查看当前版本所处阶段
 *   node tools/cycle.cjs check [--full]      自查（默认核心集，--full 全量）
 *   node tools/cycle.cjs fix <id> <说明>     登记某条发现项已修复
 *   node tools/cycle.cjs confirm             确认收口（自查绿 + 发现项全关闭）
 *   node tools/cycle.cjs next [版本]         开下一代（未确认会拒绝）
 *   node tools/cycle.cjs backlog             查看小版本候选池
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

/* __dirname = <项目根>/tools —— 向上一级即项目根 */
const ROOT = fs.existsSync(path.join(path.dirname(__dirname), 'js/config.js'))
  ? path.dirname(__dirname)
  : path.dirname(path.dirname(__dirname));
const STATE = path.join(__dirname, '_cycle.json');

/* 核心自查集：每次发布后必跑 */
const CORE = ['static', 'archguard', 'deadcfg', 'roadmap', 'assetguard',
              'season', 'powerguard', 'tips'];
/* 全量自查集：--full 时追加 */
const FULL_EXTRA = ['realm', 'ch1115', 'chapterStar', 'sceneTheme', 'v110all',
                    'v121', 'v123', 'ausnd', 'charsnd', 'hrguard', 'vistate'];

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return null; }
}
function writeState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}
function run(name) {
  const f = path.join(__dirname, name + '.cjs');
  if (!fs.existsSync(f)) return { name, skip: true };
  let out = '', code = 0;
  try {
    out = execFileSync('node', [f], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); code = e.status == null ? 1 : e.status; }
  const sum = (out.match(/\[?\s*(PASS|FAIL)[^\n]{0,60}/g) || []).slice(-2).join(' | ');
  return { name, code, sum: sum.replace(/\s+/g, ' ').trim() };
}

/* 部分守卫（vistate 等）需要真实浏览器加载页面，依赖本地静态服务。
 * 自查必须自己把服务拉起来，否则会像 V1.3.5 首跑那样因
 * ERR_CONNECTION_REFUSED 误判为「产品失败」。 */
function portOpen(port) {
  try {
    execFileSync('python3', ['-c',
      "import socket,sys;s=socket.socket();s.settimeout(0.4);" +
      "sys.exit(0 if s.connect_ex(('127.0.0.1'," + port + "))==0 else 1)"], { stdio: 'ignore' });
    return true;
  } catch (e) { return false; }
}
let srvProc = null;
function ensureServer(port) {
  if (portOpen(port)) return false;
  srvProc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 25 && !portOpen(port); i++) execFileSync('sleep', ['0.3']);
  return true;
}
function stopServer() { if (srvProc) { try { srvProc.kill(); } catch (e) {} srvProc = null; } }

/* ---------- 结构核对（不跑守卫也能查的一致性） ---------- */
function structCheck() {
  const r = [];
  const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const m = cfg.match(/version:\s*'([\d.]+)'/);
  const verCfg = m ? m[1] : null;

  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const vers = [...new Set((idx.match(/\?v=([\d.]+)/g) || []).map(s => s.slice(3)))];

  const cl = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const clLast = (cl.match(/^## V([\d.]+)/gm) || []).slice(-1)[0];

  const rmLines = [...cl.matchAll(/^## V([\d.]+)/gm)].map(x => x[1]);
  const rm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/zb/roadmap.json'), 'utf8'));
  const list = rm.list || rm.rows || [];
  const cur = list.filter(x => x.done && x.pub).map(x => x.v).slice(-1)[0];

  if (!verCfg) r.push({ id: 'V0', ok: false, msg: 'config.js 未找到版本号' });
  else r.push({ id: 'V1', ok: true, msg: 'config.js 版本 ' + verCfg });

  const idxBad = vers.filter(v => v !== verCfg);
  r.push({ id: 'V2', ok: idxBad.length === 0,
    msg: idxBad.length ? 'index.html 版本戳不一致: ' + idxBad.join(',') : 'index.html 版本戳全部一致' });

  r.push({ id: 'V3', ok: !!(clLast && clLast.indexOf(verCfg) >= 0),
    msg: clLast ? ('CHANGELOG 最新条目 ' + clLast) : 'CHANGELOG 无条目' });

  r.push({ id: 'V4', ok: !!(cur && cur.indexOf(verCfg) >= 0),
    msg: cur ? ('排期表最新已发布 ' + cur) : '排期表无已发布项' });

  /* V5 口径：CHANGELOG 是自 V1.2.1 才建立的，排期表里还有 14 个更早的
   * 已发布版本（V1.0.x~V1.2.0）没有条目 —— 那是建档前的历史欠账，
   * 单独挂账（P2 文档债），不能因此让自查永远红。
   * 所以判据收紧为：【建档之后】的每个已发布版本都必须有 CHANGELOG 条目。 */
  const cmp = (a, b) => {
    const pa = String(a).replace(/^V/, '').split('.').map(Number);
    const pb = String(b).replace(/^V/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  };
  const clSet = new Set(rmLines);
  const minCl = rmLines.slice().sort(cmp)[0];
  const doneVs = list.filter(x => x.done).map(x => String(x.v));
  const missing = !minCl ? [] : doneVs.filter(v => cmp(v, minCl) >= 0 && !clSet.has(String(v).replace(/^V/, '')));
  r.push({ id: 'V5', ok: missing.length === 0,
    msg: missing.length ? ('已发布但无更新日志: ' + missing.join(','))
      : ('建档后已发布版本全部有日志（' + doneVs.length + ' 个已发布，其中 ' +
         doneVs.filter(v => minCl && cmp(v, minCl) < 0).length + ' 个属建档前历史）') });

  return { ver: verCfg, rows: r };
}

/* ---------- 命令 ---------- */
const argv = process.argv.slice(2);
const cmd = argv[0] || 'status';

if (cmd === 'status') {
  const s = readState();
  const st = structCheck();
  console.log('=== 小版本闭环状态 ===');
  if (!s) {
    console.log('尚无闭环记录，先执行：node tools/cycle.cjs check');
  } else {
    const openF = (s.findings || []).filter(f => !f.fixed);
    console.log('版本        :', s.ver);
    console.log('当前阶段    :', s.stage);
    console.log('发现项      :', (s.findings || []).length, '（未修复', openF.length, '）');
    openF.forEach(f => console.log('   · [' + f.id + ']', f.desc));
    if (s.lastCheck) console.log('上次自查    :', s.lastCheck.ts, s.lastCheck.mode, 'exit=' + s.lastCheck.exit);
  }
  console.log('--- 结构核对 ---');
  st.rows.forEach(x => console.log((x.ok ? '  √ ' : '  X ') + x.id, x.msg));
  /* 机读结果行：体检员要求每个常驻工具输出 RESULT，否则只能靠 exit code 猜，
   * 而 exit code 区分不出「几项通过」和「根本没跑」——覆盖面缩水会静默溜过去。 */
  const okN = st.rows.filter(x => x.ok).length;
  const badN = st.rows.length - okN;
  console.log('RESULT: PASS=' + okN + ' FAIL=' + badN);
  process.exit(badN ? 1 : 0);
}

if (cmd === 'check') {
  const full = argv.includes('--full');
  const list = full ? CORE.concat(FULL_EXTRA) : CORE;
  const st = structCheck();
  console.log('=== 自查 · 结构核对 ===');
  st.rows.forEach(x => console.log((x.ok ? '  √ ' : '  X ') + x.id, x.msg));

  console.log('\n=== 自查 · 常驻守卫（' + (full ? '全量' : '核心') + ' ' + list.length + ' 项）===');
  if (ensureServer(8951)) console.log('  (已自动拉起本地静态服务 127.0.0.1:8951)');
  let bad = 0, skipN = 0;
  const fails = [];
  for (const t of list) {
    const r = run(t);
    if (r.skip) { skipN++; console.log('  - ' + t + ' (无此守卫)'); continue; }
    if (r.code !== 0) { bad++; fails.push(t); }
    console.log('  ' + (r.code === 0 ? '√' : 'X') + ' ' + t + '  exit=' + r.code +
                (r.sum ? '  :: ' + r.sum : ''));
  }
  stopServer();
  const sBad = st.rows.filter(x => !x.ok).length;
  const exit = (bad + sBad) ? 1 : 0;

  const s = readState() || { ver: st.ver, stage: 'released', findings: [], history: [] };
  s.ver = st.ver;
  s.lastCheck = { ts: new Date().toISOString().slice(0, 19), mode: full ? 'full' : 'core', exit };
  writeState(s);

  console.log('\n结果：守卫失败 ' + bad + '，结构异常 ' + sBad);
  if (fails.length) console.log('失败守卫：' + fails.join(', '));
  console.log('RESULT: PASS=' + (st.rows.filter(x => x.ok).length + (list.length - bad - skipN)) +
              ' FAIL=' + (bad + sBad));
  console.log(exit ? '[FAIL] 自查未通过 —— 进入「修复」阶段，修复后重新 check'
                   : '[PASS] 自查通过 —— 可执行 confirm');
  process.exit(exit);
}

if (cmd === 'fix') {
  const id = argv[1], note = argv.slice(2).join(' ');
  if (!id || !note) { console.error('用法: node tools/cycle.cjs fix <发现项ID> <修复说明>'); process.exit(2); }
  const s = readState();
  if (!s) { console.error('无闭环记录'); process.exit(2); }
  s.findings = s.findings || [];
  const f = s.findings.find(x => x.id === id);
  if (!f) { s.findings.push({ id, desc: note, fixed: true, fix: note }); }
  else { f.fixed = true; f.fix = note; }
  s.stage = 'fixed';
  writeState(s);
  console.log('[OK] 已登记修复', id, '→', note);
  const open = s.findings.filter(x => !x.fixed).length;
  console.log('剩余未修复', open, open ? '（仍需处理）' : '（可 confirm）');
  process.exit(0);
}

if (cmd === 'confirm') {
  const s = readState();
  if (!s) { console.error('无闭环记录，先 check'); process.exit(2); }
  const open = (s.findings || []).filter(f => !f.fixed);
  if (!s.lastCheck) { console.error('[FAIL] 尚未执行自查'); process.exit(1); }
  if (s.lastCheck.exit !== 0) { console.error('[FAIL] 上次自查未通过（exit=' + s.lastCheck.exit + '），先修复并重跑 check'); process.exit(1); }
  if (open.length) { console.error('[FAIL] 仍有 ' + open.length + ' 条发现项未修复'); process.exit(1); }
  if (s.lastCheck.mode !== 'full') {
    console.error('[FAIL] 确认要求【全量】自查（check --full），上次为 ' + s.lastCheck.mode);
    process.exit(1);
  }
  s.stage = 'confirmed';
  s.confirmedAt = new Date().toISOString().slice(0, 19);
  (s.history = s.history || []).push({ ver: s.ver, confirmedAt: s.confirmedAt, findings: (s.findings || []).length });
  writeState(s);
  console.log('[PASS] ' + s.ver + ' 确认收口 —— 允许开启下一代');
  process.exit(0);
}

if (cmd === 'next') {
  const s = readState();
  if (!s) { console.error('无闭环记录'); process.exit(2); }
  if (s.stage !== 'confirmed') {
    console.error('[FAIL] 当前版本 ' + s.ver + ' 处于「' + s.stage + '」，未完成 发布→自查→修复→确认');
    console.error('       按顺序执行：check --full → fix <id> <说明> → confirm → next');
    process.exit(1);
  }
  const rm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/zb/roadmap.json'), 'utf8'));
  const list = rm.list || rm.rows || [];
  const nextItem = list.find(x => !x.done);
  if (!nextItem) { console.error('[FAIL] 候选池为空，先让策划部排期'); process.exit(1); }
  const nv = (argv[1] || nextItem.v).replace(/^V/, '');
  s.ver = nv; s.stage = 'released'; s.findings = []; s.lastCheck = null;
  (s.history = s.history || []).push({ opened: nv, at: new Date().toISOString().slice(0, 19) });
  writeState(s);
  console.log('[OK] 开启下一代：V' + nv + ' —— ' + nextItem.n);
  console.log('     方向来源：候选池（' + nextItem.tp + ' / ' + nextItem.pr + '）');
  console.log('     完成标准：' + nextItem.ok);
  console.log('     下一步：开发完成后执行 check --full');
  process.exit(0);
}

if (cmd === 'backlog') {
  const rm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/zb/roadmap.json'), 'utf8'));
  const list = rm.list || rm.rows || [];
  const pend = list.filter(x => !x.done && (x.tp === 'patch' || /^V1\.\d+\.[1-9]\d*$/.test(x.v)));
  console.log('=== 小版本候选池（PATCH）===');
  pend.slice(0, 8).forEach(x => {
    console.log('  ' + x.v + ' [' + (x.pr || '-') + '] ' + x.n);
    console.log('      完成标准: ' + (x.ok || '（缺标准，不得进入小版本）'));
  });
  console.log('共 ' + pend.length + ' 条');
  process.exit(0);
}

console.error('未知命令: ' + cmd);
process.exit(2);
