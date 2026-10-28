#!/usr/bin/env node
/**
 * btprereq 守卫 —— 【前提类断言不得混入缺陷计数】
 * ------------------------------------------------------------------
 * 立规背景（V1.3.74）：
 *   看板连续出现「战斗布局守卫 未过 2 项」，而单独复跑全绿。
 *   查下来这两项是 B0「未能进入战斗」与 B2「三选一无法弹出」——
 *   它们衡量的是【测试环境有没有准备好】，不是【游戏有没有越界】。
 *   在负载高（多个浏览器工具串行、资源竞争）时二者偶发失败，
 *   被当成游戏缺陷记进 FAIL，看板于是显示「未过 2 项」。
 *
 *   假失败与假通过同样有害：反复误报会让看板使用者对「未过」脱敏，
 *   真正的越界失败（B1/B3/B4/B5/B6/B7/B8）反而被淹没。
 *   V1.3.72111111 那次「战斗画面漂移」是真缺陷，如果它混在一堆
 *   假失败里被忽略，玩家就会继续看到画面跑出屏幕。
 *
 * 本守卫断言：
 *   P1 btlayout 存在 PREREQ 独立计数器
 *   P2 btlayout 存在 pq() 前提登记函数
 *   P3 B0 前提失败走 pq（且带重试，重试耗尽才算未就绪）
 *   P4 B2 的「弹不出/取不到」走 pq；真越界仍走 bad
 *   P5 退出码三态：真缺陷=1 / 前提未就绪=2 / 全过=0
 *   P6 真实执行：从源码抽取计数与退出码片段实跑，验证 pq 不增 FAIL、三态退出码正确
 *   P7 dash 战斗布局守卫三态显示（未跑通/未过/前提未就绪）
 *   P8 dash 不得残留中性词「未跑」（工具故障必须显式判失败）
 *
 * 铁律：必须能被变异证伪。用 tools/mutate_btprereq.cjs 验证。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(path.dirname(__filename));
const R = p => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

let PASS = 0, FAIL = 0;
const ok = n => { PASS++; console.log('  √ ' + n); };
const bad = (n, d) => { FAIL++; console.log('  X ' + n + (d ? ' :: ' + d : '')); };

const btSrc = R('tools/btlayout.cjs');
const dashSrc = R('tools/dash.cjs');

/* P1 / P2：计数器与登记函数 */
if (/let\s+PREREQ\s*=\s*0\s*;/.test(btSrc)) ok('P1 btlayout 存在 PREREQ 独立计数器');
else bad('P1 btlayout 缺 PREREQ 计数器', '前提失败会混进 FAIL');

if (/const\s+pq\s*=\s*\(n,\s*d\)\s*=>\s*\{\s*PREREQ\+\+/.test(btSrc)) ok('P2 btlayout 存在 pq() 前提登记函数');
else bad('P2 btlayout 缺 pq()', '前提类断言无处登记');

/* P3：B0 走 pq + 有重试 */
const b0seg = (() => {
  const i = btSrc.indexOf("let e = null;");
  return i >= 0 ? btSrc.slice(i, i + 700) : '';
})();
if (b0seg && /for\s*\(let a\s*=\s*0;\s*a\s*<\s*3/.test(b0seg)) ok('P3a B0 带 3 次重试（负载高时首帧常未就绪）');
else bad('P3a B0 缺重试', '首帧未就绪会直接误报');
if (b0seg && /pq\('B0 未能进入战斗'/.test(b0seg)) ok('P3b B0 前提失败走 pq（不混入 FAIL）');
else bad('P3b B0 未走 pq', '环境问题会被报成游戏缺陷');

/* P4：B2 前提走 pq，越界仍走 bad */
const b2seg = (() => {
  const i = btSrc.indexOf("B2 三选一无法弹出");
  return i >= 0 ? btSrc.slice(Math.max(0, i - 200), i + 400) : '';
})();
if (/pq\('B2 三选一无法弹出'/.test(btSrc) && /pq\('B2 取不到 #choice'/.test(btSrc)) ok('P4a B2 前提分支走 pq');
else bad('P4a B2 前提分支未走 pq', 'UI 未就绪会被报成缺陷');
if (/bad\('B2 战斗中三选一越界'/.test(btSrc)) ok('P4b B2 真越界仍走 bad（前提改判不得削弱真缺陷检测）');
else bad('P4b B2 越界断言丢失', '把前提改判做成放行 = 守卫失效');

/* P5：退出码三态 */
if (/process\.exit\(FAIL\s*\?\s*1\s*:\s*\(PREREQ\s*\?\s*2\s*:\s*0\)\)/.test(btSrc)) ok('P5 退出码三态（1真缺陷/2前提未就绪/0全过）');
else bad('P5 退出码非三态', 'Agent 无法区分「游戏坏了」和「测试没跑起来」');

/* P6：真实执行 —— 抽取源码里的计数与退出码片段实跑 */
(function () {
  const m = btSrc.match(/let PASS = 0, FAIL = 0;[\s\S]*?const pq = \(n, d\) => \{ PREREQ\+\+; console\.log\([^\n]*\); \};/);
  if (!m) { bad('P6 抽不到计数片段（真实执行前提不满足）'); return; }
  const decl = m[0];
  const exitExpr = (btSrc.match(/process\.exit\((FAIL \? 1 : \(PREREQ \? 2 : 0\))\)/) || [])[1];
  if (!exitExpr) { bad('P6 抽不到退出码表达式'); return; }

  const run = (body) => {
    const fn = new Function(decl + '\n' + body + '\nreturn {p:PASS,f:FAIL,q:PREREQ,code:(' + exitExpr + ')};');
    return fn();
  };
  const c1 = run("pq('B0 未能进入战斗',''); pq('B2 取不到 #choice','');");
  if (c1.f === 0 && c1.q === 2 && c1.code === 2) ok('P6a 真实执行：两次前提失败 → FAIL=0 PREREQ=2 退出码2（不误报为缺陷）');
  else bad('P6a 真实执行前提场景不符', JSON.stringify(c1));

  const c2 = run("pq('B0',''); bad('B1 越界','');");
  if (c2.f === 1 && c2.q === 1 && c2.code === 1) ok('P6b 真实执行：前提+真缺陷并存 → 退出码1（真缺陷优先）');
  else bad('P6b 真实执行混合场景不符', JSON.stringify(c2));

  const c3 = run("ok('B0'); ok('B8');");
  if (c3.f === 0 && c3.q === 0 && c3.code === 0) ok('P6c 真实执行：全过 → 退出码0');
  else bad('P6c 真实执行全过场景不符', JSON.stringify(c3));
})();

/* P7：dash 三态显示 */
if (/未跑通✗\(判失败\)/.test(dashSrc) && /前提未就绪/.test(dashSrc)) ok('P7 dash 战斗布局守卫三态显示');
else bad('P7 dash 未做三态区分', '看板仍会把环境问题显示成「未过N项」');

/* P8：dash 不得残留中性词 */
const neutral = (dashSrc.match(/'未跑'/g) || []).length;
if (neutral === 0) ok('P8 dash 无中性词「未跑」（工具故障一律显式判失败）');
else bad('P8 dash 残留中性词「未跑」 ' + neutral + ' 处', '中性词等于静默，AX 不可用');

console.log('\n[btprereq] PASS ' + PASS + ' / FAIL ' + FAIL);
process.exit(FAIL ? 1 : 0);
