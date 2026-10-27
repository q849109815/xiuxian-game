#!/usr/bin/env node
/**
 * 题材铁律守卫 themeguard
 *
 * 背景（本项目最严重的一次 P0）：
 *   V1.1.0 立项时把《向僵尸开炮》（末日废土 · 丧尸射击塔防）误做成修仙题材，
 *   「境界 / 灵石 / 突破 / 炼气 / 筑基 / 金丹 / 元婴 / 化神」等词进了配置与界面，
 *   被迫全量回滚。此后题材被钉死，但**长期没有守卫**，同类事故完全可以再犯。
 *
 * 铁律：末日废土 / 丧尸题材是唯一题材。
 *       出现修仙、仙侠、玄幻、武侠词 → 打回 + 计罚单。
 *
 * 断言：
 *   T1 扫描 js/html/css/md，禁止命中禁用词表（排除本守卫自身与事故档案）
 *   T2 每个禁用词都必须被词表覆盖（防止词表被删导致守卫空转）
 *   T3 题材铁律声明必须存在（V1.1.0 立项文档第 0 节）
 *
 * 用法：node tools/themeguard.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 禁用词：修仙 / 仙侠 / 玄幻 / 武侠体系
const BAN = ['修仙', '仙侠', '玄幻', '武侠', '炼气', '筑基', '金丹', '元婴',
  '化神', '灵石', '渡劫', '飞升', '功法', '灵根', '仙缘', '道友'];
// 正向锚点：末日废土题材必须存在
const ANCHOR = ['僵尸', '末日'];

// 豁免：事故档案与本守卫自身（它们在描述事故，不是真的跑偏）
// 注意：V1.0.x 历史文档成文于事故之前，属史料，豁免；但代码/界面一律不豁免。
const EXEMPT = [
  /tools[\\/]themeguard\.cjs$/,
  /tools[\\/]mistakes\.json$/,
  /V1\.1\.0大版本规划_重新立项\.md$/,
  /制作人周报_V1\.1\.0.*\.md$/,
  /制作人任务书_V1\.0\.1.*\.md$/,
  /制作人周报_V1\.0\.2.*\.md$/,
  /云端数据清理与后台一键清理.*\.md$/,
  /_trash[\\/]/,
  /\.mut[\\/]/,
  /tools[\\/]_/,
];

const EXTS = /\.(js|html|css|md|json)$/i;
let pass = 0, fail = 0;
const bad = [];
function ok(n, c, m) { if (c) { pass++; } else { fail++; bad.push(`${n} ${m}`); } }

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name === '.git' || f.name === 'lib') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (EXTS.test(f.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT).filter(p => !EXEMPT.some(r => r.test(p)));

// T1 禁用词扫描
// 代码/界面（js/html/css/json）零容忍：命中即违规，不看上下文。
// 文档（md）区分「真跑偏」与「引用铁律」：上下文含排除类词时属声明规矩，合法。
const NEG = /(永久排除|已排除|禁止|不再|回滚|不在|误做|事故|已永久|不做|范围外|推到)/;
const CODE_EXTS = /\.(js|html|css|json)$/i;
const hits = [];
let mentions = 0;
for (const p of files) {
  let s;
  try { s = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
  const isCode = CODE_EXTS.test(p);
  for (const w of BAN) {
    let i = s.indexOf(w);
    while (i >= 0) {
      const ctx = s.slice(Math.max(0, i - 40), i + w.length + 40);
      if (isCode) hits.push(`${path.relative(ROOT, p)} 命中「${w}」（代码零容忍）：…${ctx.replace(/\s+/g, ' ').slice(0, 60)}…`);
      else if (NEG.test(ctx)) mentions++;
      else hits.push(`${path.relative(ROOT, p)} 命中「${w}」：…${ctx.replace(/\s+/g, ' ').slice(0, 60)}…`);
      i = s.indexOf(w, i + 1);
    }
  }
}
ok('T1', hits.length === 0, `题材真命中 ${hits.length} 处：${hits.slice(0, 5).join('；')}`);

// T2 词表完整性（防止词表被清空导致守卫空转）
ok('T2', BAN.length >= 10, `禁用词表只有 ${BAN.length} 条，疑似被删`);

// T3 题材铁律声明存在
const decl = files.filter(p => /\.md$/.test(p)).some(p => {
  try { const s = fs.readFileSync(p, 'utf8'); return s.includes('末日废土') && (s.includes('题材')); } catch (e) { return false; }
});
ok('T3', decl, '未找到题材铁律声明（立项文档第 0 节）');

// T4 正向锚点：项目确实是末日废土
const cfg = path.join(ROOT, 'js', 'config.js');
let anchorOk = false;
try {
  const s = fs.readFileSync(cfg, 'utf8');
  anchorOk = ANCHOR.some(w => s.includes(w));
} catch (e) { }
ok('T4', anchorOk, 'config.js 未检出末日题材锚点（僵尸/末日）');

console.log('=== 题材铁律守卫 ===');
console.log(`扫描文件 ${files.length} 个，禁用词 ${BAN.length} 条，铁律引用 ${mentions} 处（合法）`);
console.log(`PASS ${pass} / FAIL ${fail}`);
bad.forEach(b => console.log('  ❌', b));
if (!fail) console.log('  ✅ 题材未跑偏，末日废土铁律完好');
process.exit(fail ? 1 : 0);
