#!/usr/bin/env node
/* 【_opaudit.cjs】交互操作性审计：找「渲染出来但没有任何事件绑定」的控件（死按钮）。
 * 立规原因：玩家判断"方不方便"的第一标准是点了有没有反应；此前守卫只查
 *   "面板能不能打开 / 有没有报错 / 有没有越界"，从不查控件是否接上行为。
 * 判据：r_* 渲染段出现的 id / data-* 必须在 b_* 绑定段（或全局委托）被消费。
 * 退出码：0=审计完成无死控件 / 1=发现死控件 / 2=工具崩溃。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const L = src.split('\n');
// 同级方法边界：两个空格缩进的方法定义
const bounds = [];
L.forEach((l, i) => { if (/^  [A-Za-z_$][\w$]*\s*\(/.test(l)) bounds.push(i); });
bounds.push(L.length);
const segs = [];
for (let i = 0; i < bounds.length - 1; i++) {
  const a = bounds[i], b = bounds[i + 1];
  const m = L[a].match(/^  ([A-Za-z_$][\w$]*)\s*\(/);
  if (m) segs.push({ name: m[1], text: L.slice(a, b).join('\n') });
}
const rSegs = segs.filter(x => /^r_/.test(x.name));
const bSegs = segs.filter(x => /^b_/.test(x.name));
const allBind = bSegs.map(x => x.text).join('\n') + '\n' +
  fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
// 允许全局消费的展示型 id（容器 / hud / 面板骨架，非交互控件）
const DISPLAY = new Set(['pnBody', 'pnTitle', 'panel', 'home', 'hud', 'app', 'toast', 'pnTabs', 'pnBox', 'pnClose']);
const rows = [];
for (const r of rSegs) {
  const ids = [...new Set([...r.text.matchAll(/id="([A-Za-z][\w-]*)"/g)].map(x => x[1]))]
    .filter(x => !DISPLAY.has(x));
  const datas = [...new Set([...r.text.matchAll(/\bdata-([a-z][\w-]*)=/g)].map(x => 'data-' + x[1]))];
  const own = (bSegs.find(b => b.name === 'b_' + r.name.slice(2)) || { text: '' }).text;
  const miss = [];
  ids.forEach(id => { if (!own.includes('#' + id) && !allBind.includes('#' + id)) miss.push('#' + id); });
  datas.forEach(d => { if (!own.includes(d) && !allBind.includes(d)) miss.push('[' + d + ']'); });
  rows.push({ panel: r.name.slice(2), ids, datas, miss });
}
const bad = rows.filter(x => x.miss.length);
console.log('RENDER=' + rSegs.length + ' BIND=' + bSegs.length + ' DEAD=' + bad.length);
bad.forEach(x => console.log('  DEAD ' + x.panel + ' :: ' + x.miss.join(' ')));
// 文案与行为不一致：按钮文案含"任务"但实际 open('level')
const goTask = [...src.matchAll(/id="goTask"[^>]*>([^<]*)</g)].map(x => x[1]);
const goHandler = (src.match(/gb\.onclick\s*=\s*\(\)\s*=>\s*\{([^}]*)\}/) || [])[1] || '';
console.log('GO_TASK_TEXT=' + JSON.stringify(goTask) + ' GO_TASK_HANDLER=' + goHandler.trim());
const mismatch = goTask.some(t => /任务/.test(t)) && /open\('level'/.test(goHandler);
if (mismatch) console.log('  MISMATCH goTask 文案指向任务/行为打开关卡选择');
else if (goTask.length) console.log('  OK goTask 文案与落点一致：' + JSON.stringify(goTask) + ' -> level');
process.exit(bad.length ? 1 : 0);
