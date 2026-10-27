#!/usr/bin/env node
/**
 * 错题本（六部门复发错误台账）+ 开工前提醒
 *
 * 铁律：凡是复发过 >=2 次的错误，必须有守卫覆盖；
 *      没有守卫覆盖的错题，每轮开工前必须点名提醒。
 *
 * 用法：
 *   node tools/mistakes.cjs            输出开工前提醒 + 覆盖检查
 *   node tools/mistakes.cjs --json     JSON 输出
 *   node tools/mistakes.cjs --add <部门> <签名>   新增一条（幂等累加次数）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(__dirname, 'mistakes.json');

// 覆盖守卫存在性校验：guard 字段指向 tools/ 下的真实文件
function guardExists(g) {
  if (!g) return false;
  return fs.existsSync(path.join(ROOT, 'tools', g));
}

function load() {
  if (!fs.existsSync(FILE)) return [];
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return []; }
}
function save(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

let L = load();

const argv = process.argv.slice(2);
if (argv[0] === '--add') {
  const dept = argv[1] || '未指派';
  const sig = argv[2] || '';
  if (!sig) { console.error('用法: --add <部门> <签名>'); process.exit(2); }
  const hit = L.find(x => x.dept === dept && x.sig === sig);
  if (hit) { hit.n++; hit.last = new Date().toISOString().slice(0, 10); }
  else L.push({ dept, sig, n: 1, first: new Date().toISOString().slice(0, 10), last: null, guard: null, fix: '' });
  save(L);
  console.log('已登记：', dept, '|', sig, '| 累计', (hit ? hit.n : 1), '次');
  process.exit(0);
}

const DEPTS = ['策划', '美术', '程序', '音频', '测试', '运营'];

// 覆盖检查
let uncovered = [];
for (const x of L) {
  if (x.n >= 2 && !guardExists(x.guard)) uncovered.push(x);
}

if (argv.includes('--json')) {
  console.log(JSON.stringify({ list: L, uncovered: uncovered.map(x => x.sig) }, null, 2));
  process.exit(uncovered.length ? 1 : 0);
}

/* ===== 开工前真复检（probe）=====
 * 铁律：只列清单不算提醒。每条复发错题必须在开工前"真跑一遍"它对应的检查，
 *      看当前代码里有没有又出现同类迹象。超时单独归类为「未证明」，绝不冒充通过。
 * 用法： node tools/mistakes.cjs --probe [部门名]
 */
if (argv.includes('--probe')) {
  const { spawnSync } = require('child_process');
  const only = argv[argv.indexOf('--probe') + 1];
  // sig 关键字 -> 探针（cmd 相对 tools/ 目录；t 为超时秒）
  const PROBES = [
    { key: '零调用',      cmd: 'deadcfg.cjs',       t: 90 },
    { key: '漏传',        cmd: 'synccheck.py',      t: 180, net: 1 },
    { key: '括号',        cmd: 'cssbrace.cjs',      t: 60, builtin: 1 },
    { key: '版本号没升',  cmd: 'releaseguard.cjs',  t: 60 },
    { key: 'manifest',    cmd: 'cacheguard.cjs',    t: 60 },
    { key: '没登记',      cmd: 'assetguard.cjs',    t: 90 },
    { key: '主题脱节',    cmd: 'sceneTheme.cjs',    t: 60 },
    { key: '假通过',      cmd: 'toolaudit.cjs',     t: 150 },
    { key: '抓不住',      cmd: 'mutguard.cjs',      t: 150 },
    { key: '污染',        cmd: 'fullscan.cjs',      t: 150 },
    { key: '先于测试',    cmd: 'layoutguard.cjs',   t: 120 },
    { key: '排期',        cmd: 'roadmap.cjs',       t: 60 },
    { key: '日历',        cmd: 'roadmap.cjs',       t: 60 },
    { key: '题材',        cmd: 'themeguard.cjs',    t: 60 },
    { key: '50 关',       cmd: 'roadmap.cjs',       t: 60 },
    { key: '数值模型',    cmd: 'curve.cjs',         t: 120 },
    { key: '注释不符',    cmd: 'v110all.cjs',       t: 90 },
    { key: '听觉',        cmd: 'charsnd.cjs',       t: 90 },
  ];
  // 内建探针：CSS 括号配对（不依赖外部文件，秒级）
  function cssBrace() {
    const fsx = require('fs'), p = require('path');
    let bad = 0, files = 0;
    const walk = d => {
      for (const f of fsx.readdirSync(d)) {
        const fp = p.join(d, f), st = fsx.statSync(fp);
        if (st.isDirectory()) { if (!/^\.|node_modules|^_/.test(f)) walk(fp); continue; }
        if (!/\.css$/.test(f)) continue;
        files++;
        const s = fsx.readFileSync(fp, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        let dep = 0;
        for (const ch of s) { if (ch === '{') dep++; else if (ch === '}') { dep--; if (dep < 0) { bad++; dep = 0; } } }
        if (dep !== 0) bad++;
      }
    };
    walk(path.join(ROOT, 'css'));
    return { ok: bad === 0, msg: `扫 ${files} 个 css，括号不配对 ${bad} 处` };
  }

  const rows = [];
  const cache = {}; // 同 cmd 只跑一次（多条错题共用一个守卫）
  for (const x of L) {
    if (only && x.dept !== only) continue;
    const pb = PROBES.find(p => x.sig.includes(p.key));
    if (!pb) { rows.push({ ...x, st: 'NO_PROBE', msg: '无对应探针' }); continue; }
    if (pb.builtin) {
      if (!cache['__css']) cache['__css'] = cssBrace();
      const r = cache['__css'];
      rows.push({ ...x, st: r.ok ? 'PASS' : 'FAIL', msg: r.msg });
      continue;
    }
    if (cache[pb.cmd]) {
      const c = cache[pb.cmd];
      rows.push({ ...x, st: c.st, msg: c.msg + '（同守卫复用）' });
      continue;
    }
    const file = path.join(__dirname, pb.cmd);
    if (!fs.existsSync(file)) { rows.push({ ...x, st: 'NO_PROBE', msg: `守卫缺失 ${pb.cmd}` }); continue; }
    const bin = /\.py$/.test(pb.cmd) ? 'python3' : 'node';
    const r = spawnSync(bin, [file], { cwd: ROOT, timeout: pb.t * 1000, encoding: 'utf8' });
    let st = 'PASS', msg = '';
    if (r.error && r.error.code === 'ETIMEDOUT') { st = 'TIMEOUT'; msg = `超时 ${pb.t}s（未证明，绝不冒充通过）`; }
    else if (r.status === 0) { st = 'PASS'; msg = (String(r.stdout || '').split('\n').find(s => /PASS|通过|一致/.test(s)) || 'exit 0').trim().slice(0, 60); }
    else { st = 'FAIL'; msg = (String(r.stdout || '') + String(r.stderr || '')).split('\n').find(s => /FAIL|失败|不一致|❌/.test(s)) || ('exit ' + r.status); msg = String(msg).trim().slice(0, 90); }
    cache[pb.cmd] = { st, msg };
    rows.push({ ...x, st, msg });
  }
  console.log('=== 开工前真复检（每条复发错题必查当前代码）===');
  let fail = 0, to = 0, np = 0;
  for (const d of DEPTS) {
    const mine = rows.filter(x => x.dept === d).sort((a, b) => b.n - a.n);
    if (!mine.length) continue;
    console.log(`[${d}]`);
    for (const x of mine) {
      const icon = x.st === 'PASS' ? '✅' : x.st === 'FAIL' ? '❌' : x.st === 'TIMEOUT' ? '⏱' : '⚪';
      console.log(`  ${icon} ×${x.n} ${x.sig.slice(0, 30)} → ${x.st} ${x.msg}`);
      if (x.st === 'FAIL') fail++; if (x.st === 'TIMEOUT') to++; if (x.st === 'NO_PROBE') np++;
    }
  }
  console.log('');
  console.log(`复检 ${rows.length} 条：PASS ${rows.filter(x=>x.st==='PASS').length} / FAIL ${fail} / 超时 ${to} / 无探针 ${np}`);
  if (fail) { console.log('❌ 有复发迹象，必须先修再开工'); }
  else if (to) console.log('⏱ 有未证明项（超时≠通过），需分批补跑');
  process.exit(fail ? 1 : 0);
}

console.log('=== 六部门错题本 · 开工前提醒 ===');
let warnCnt = 0;
for (const d of DEPTS) {
  const mine = L.filter(x => x.dept === d).sort((a, b) => b.n - a.n);
  if (!mine.length) { console.log(`[${d}] 无历史错题`); continue; }
  const top = mine.filter(x => x.n >= 2);
  console.log(`[${d}] 错题 ${mine.length} 条，其中复发 ${top.length} 条`);
  for (const x of mine) {
    const cove = guardExists(x.guard) ? `守卫:${x.guard}` : '⚠无守卫覆盖';
    const flag = x.n >= 2 ? '🔁' : '  ';
    console.log(`  ${flag} ×${x.n} ${x.sig} —— ${cove}`);
    if (x.n >= 2 && !guardExists(x.guard)) { console.log(`     ↳ 必须补守卫，否则会再犯`); warnCnt++; }
  }
}

console.log('');
console.log(`复发错题（×2及以上）共 ${L.filter(x => x.n >= 2).length} 条`);
console.log(`其中无守卫覆盖 ${uncovered.length} 条`);
if (uncovered.length) {
  console.log('❌ 存在未被守卫覆盖的复发错题 —— 开工前必须补守卫或挂 P0');
  for (const x of uncovered) console.log('   ·', x.dept, x.sig);
} else {
  console.log('✅ 全部复发错题均有守卫覆盖');
}
process.exit(uncovered.length ? 1 : 0);

