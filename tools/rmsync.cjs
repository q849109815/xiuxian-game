#!/usr/bin/env node
/* ==========================================================================
 * 排期数据源同步 rmsync
 *
 * 背景（本轮实测）：排期有【两处数据源】——
 *   ① js/config.js 的 EX.VERSIONS（源，被 roadmap.cjs 校验）
 *   ② data/zb/roadmap.json（玩家端实际读取，在 players 分支）
 * 两者此前【从未校验一致】：V1.3.7211111 发版后只改了 ①，② 仍停在 45 条，
 * 玩家在「设置 → 前瞻」看到的最新版本落后于实际版本。
 * 这与「本地改了线上没传」是同一类洞，只是发生在两份数据文件之间。
 *
 * 铁律：源只有一处。改 config.js 后必须跑本脚本同步 ②，
 *       并由 roadmap.cjs 的 G5-8 断言两处一致（不一致即 FAIL）。
 *
 * 用法：
 *   node tools/rmsync.cjs           同步（写回 data/zb/roadmap.json）
 *   node tools/rmsync.cjs --check   只比对不写入（供守卫调用）
 * ========================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'js/config.js');
const RM = path.join(ROOT, 'data/zb/roadmap.json');

/* 在沙箱里真实执行 config.js 取 EX.VERSIONS —— 不用正则抠，
 * 正则抠数组会踩「嵌套对象/尾逗号/注释」三连坑（历史上踩过多次）。 */
function readVersions() {
  const src = fs.readFileSync(CFG, 'utf8');
  const ctx = vm.createContext({ window: {}, document: {}, console, Math, Date, JSON });
  try {
    vm.runInContext(src + '\n;globalThis.__V = (typeof EX !== "undefined" ? EX.VERSIONS : null);', ctx);
  } catch (e) {
    console.error('❌ config.js 执行失败：' + e.message); process.exit(1);
  }
  const V = ctx.__V || (ctx.EX && ctx.EX.VERSIONS);
  if (!Array.isArray(V) || !V.length) { console.error('❌ 取不到 EX.VERSIONS'); process.exit(1); }
  return V;
}
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const list = readVersions().map((x) => ({
  v: x.v, n: x.n, wk: x.wk, eta: x.eta, tp: x.tp, c: x.c, ms: x.ms, ok: x.ok, pr: x.pr,
  done: !!x.done, pub: !!x.pub, hi: x.hi || [], dp: x.dp || {},
}));

const cur = JSON.parse(fs.readFileSync(RM, 'utf8'));
const same = md5(JSON.stringify(list)) === md5(JSON.stringify(cur.list));

if (process.argv.includes('--check')) {
  console.log(`排期双源比对：config ${list.length} 条 / roadmap.json ${cur.list.length} 条 → ${same ? '一致' : '不一致'}`);
  if (!same) {
    const a = list.map((x) => x.v), b = cur.list.map((x) => x.v);
    console.log('  config 独有：' + (a.filter((x) => !b.includes(x)).join(', ') || '无'));
    console.log('  json 独有：' + (b.filter((x) => !a.includes(x)).join(', ') || '无'));
  }
  console.log(`RESULT: PASS=${same ? 1 : 0} FAIL=${same ? 0 : 1}`);
  process.exit(same ? 0 : 1);
}

if (same) { console.log('✅ 排期双源已一致，无需同步'); process.exit(0); }
fs.writeFileSync(RM, JSON.stringify({ list, updatedAt: cur.updatedAt, by: 'pm' }, null, 1));
console.log(`✅ 已同步：${cur.list.length} → ${list.length} 条`);
console.log('RESULT: PASS=1 FAIL=0');
