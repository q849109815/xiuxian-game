#!/usr/bin/env node
/**
 * 新手前 10 分钟守卫 newbie.cjs（V1.3.8 策划部 P-18 验收工具）
 *
 * 背景：V1.3.8 主题「新手前 10 分钟」，验收标准是
 *   「新手前 10 分钟流失率可测且有下降」。
 *   但历史上所有闸门都只查「功能在不在」，没有任何一条问过
 *   「新玩家头十分钟到底看得到什么、会不会被卡住」。
 *   本守卫把新手体验拆成可判定的硬断言。
 *
 * 断言：
 *   N1 12 个引导节点，每个都必须有真实 firing 点（源码 guideTrigger('<ev>')）
 *   N2 引导文案不得引用已移除控件（摇杆 / 移动 / 左下角）
 *   N3 必做引导（must）的顺序必须与实际解锁链一致，不得倒序
 *   N4 前 3 章难度余量必须单调下降（新玩家推图不能忽然变简单再忽然变难）
 *   N5 新手漏斗埋点 funnel_convert 必须有上报点
 *   N6 首关 1-1 必须无前置解锁（新玩家进游戏即可开打）
 *
 * 用法：node tools/newbie.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const bad = [];
const ok = (n, c, m) => { if (c) pass++; else { fail++; bad.push(`${n} ${m}`); } };

const cfg = R('js/config.js');
const ui = R('js/ui.js');
const SRC = ['js/ui.js', 'js/main.js', 'js/battle.js', 'js/engine.js'].map(R).join('\n');

/* ---- 解析引导表 ---- */
const gBlock = cfg.slice(cfg.indexOf('guides: ['), cfg.indexOf('ads: ['));
const guides = [];
const re = /\{\s*id:\s*(\d+),\s*n:\s*'([^']*)',\s*trig:\s*'([^']*)',\s*txt:\s*'([^']*)'[^}]*?must:\s*(true|false)/g;
let m;
while ((m = re.exec(gBlock))) guides.push({ id: +m[1], n: m[2], trig: m[3], txt: m[4], must: m[5] === 'true' });
const altRe = /\{\s*id:\s*(\d+),\s*n:\s*'([^']*)',\s*trig:\s*'([^']*)',\s*txt:\s*'([^']*)'[^}]*?\}/g;

ok('N0', guides.length === 12, `解析到引导 ${guides.length} 条（应为 12）`);

/* ---- N1 每个引导都有 firing 点 ---- */
const mapBlock = ui.slice(ui.indexOf('guideTrigger(ev)'), ui.indexOf('guideTrigger(ev)') + 1600);
const evMap = {};
const evRe = /(\w+):\s*(\d+),\s*\/\*/g;
let e;
while ((e = evRe.exec(mapBlock))) evMap[e[2]] = e[1];
const noFire = guides.filter(g => !evMap[g.id] || !SRC.includes(`guideTrigger('${evMap[g.id]}')`));
ok('N1', noFire.length === 0, `${noFire.length} 条引导无 firing 点：${noFire.map(g => g.id + g.n).join('、')}`);

/* ---- N2 文案不得引用已移除控件 ---- */
const DEAD = ['摇杆', '移动角色', '左下角', '拖动'];
const deadHit = guides.filter(g => DEAD.some(w => g.txt.includes(w)));
ok('N2', deadHit.length === 0, `引导文案引用已移除控件：${deadHit.map(g => g.id + '「' + g.txt + '」').join('；')}`);

/* ---- N3 must 引导顺序与解锁链一致 ---- */
const ord = /解锁|通关\s*(\d+)-(\d+)/;
const seq = [];
for (const g of guides.filter(x => x.must)) {
  const mm = g.trig.match(/(\d+)-(\d+)/);
  seq.push({ id: g.id, lv: mm ? (+mm[1]) * 100 + (+mm[2]) : 0 });
}
let disorder = [];
for (let i = 1; i < seq.length; i++) if (seq[i].lv && seq[i - 1].lv && seq[i].lv < seq[i - 1].lv) disorder.push(`${seq[i - 1].id}→${seq[i].id}`);
ok('N3', disorder.length === 0, `必做引导顺序倒挂：${disorder.join('、')}`);

/* ---- N4 前 3 章余量单调下降 ---- */
let curveOut = '';
try {
  curveOut = require('child_process').spawnSync('node', ['tools/curve.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 }).stdout || '';
} catch (err) { }
const rows = [...curveOut.matchAll(/^\s*(\d+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d.]+)%/gm)]
  .map(x => ({ ch: +x[1], margin: +x[6] })).filter(x => x.ch <= 3);
let nonMono = [];
for (let i = 1; i < rows.length; i++) if (rows[i].margin > rows[i - 1].margin) nonMono.push(`第${rows[i - 1].ch}章→第${rows[i].ch}章 余量反弹`);
ok('N4', rows.length >= 3 && nonMono.length === 0, `前三章余量 ${rows.map(r => r.ch + ':' + r.margin + '%').join(' ')} ${nonMono.join('；')}`);

/* ---- N7 引导不得教「不需要玩家操作」的自动机制 ----
 * 与 N2（教已移除控件）是同一类错误的两面：
 *   N2 教了【不存在】的操作（摇杆）；N7 教了【不需要人做】的操作（拾取）。
 * 实测：掉落是自动磁吸回收（battle.js 磁吸半径 90、<26 自动 pick），
 *   玩家没有任何拾取动作，而必做引导 4 原本写「拾取掉落物」——
 *   新玩家会去找一个不存在的拾取按钮，找不到就以为是自己不会玩。
 * 这类文案错误不会崩、不报错，只有真人试玩才会发现，所以必须进守卫。 */
const AUTO = ['拾取掉落物', '手动拾取', '点击拾取'];
const autoHit = guides.filter(g => AUTO.some(w => g.txt.includes(w)));
ok('N7', autoHit.length === 0, `引导教了自动完成的操作：${autoHit.map(g => g.id + '「' + g.txt + '」').join('；')}`);

/* ---- N8 引导文案必须非空且与节点名不同义重复 ----
 * 文案为空时弹窗只有标题没有说明，新手等于没被引导；
 * 文案直接照抄节点名（如 n='战斗引导'、txt='战斗引导'）同样无信息量。 */
const empty = guides.filter(g => !g.txt || !g.txt.trim() || g.txt.trim() === g.n.trim());
ok('N8', empty.length === 0, `引导文案为空或照抄节点名：${empty.map(g => g.id + g.n).join('、')}`);

/* ---- N5 漏斗埋点 ---- */
ok('N5', SRC.includes("funnel_convert"), '新手漏斗埋点 funnel_convert 无上报点');

/* ---- N6 首关无前置解锁 ---- */
const lvBlock = cfg.slice(cfg.indexOf('levels: ['), cfg.indexOf('levels: [') + 4000);
const firstLine = lvBlock.split('\n').find(l => /unlock:\s*'1-1'|lv:\s*'1-1'|id:\s*'1-1'/.test(l)) || '';
ok('N6', /1-1/.test(lvBlock) && !/unlock:\s*'[^']+',\s*[^']*1-1/.test(firstLine), `首关疑似存在前置解锁：${firstLine.slice(0, 80)}`);

console.log('=== 新手前 10 分钟守卫（V1.3.8）===');
console.log(`引导 ${guides.length} 条，必做 ${guides.filter(g => g.must).length} 条`);
console.log(`PASS ${pass} / FAIL ${fail}`);
bad.forEach(b => console.log('  ❌', b));
if (!fail) console.log('  ✅ 新手前 10 分钟链路完好');
process.exit(fail ? 1 : 0);
