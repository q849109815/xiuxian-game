#!/usr/bin/env node
/* 【taskflow.cjs】立规原因：制作人追问「界面逻辑性操作性你视觉看了嘛？方便嘛？
 * 用视觉结合代码看看操作流程逻辑性方便吗」。
 *   V1.3.85 的 10 条走查覆盖领取/购买/返回/页签记忆，没有覆盖
 *   「玩家看到一条未完成任务，能不能一步走到该做的事」。
 *   真实浏览器取证（_flowwalk_v1386 before）结论：
 *     日常页 5 条未完成、行内入口 0 个；唯一「前往关卡」在 y=1058（首屏 852 外）；
 *     点它一律落 level，对「强化1次」该去武器页、「无尽1次」该去无尽卡片(y=2263)是错落点；
 *     周常页 2 条未完成、入口 0 个。
 * 判据：源码静态 6 项 + 真实 Chrome 取证 6 项，全部以自身输出为准。
 * 取证过期即判「需重跑」（历史错题：拿旧快照冒充当前状态），不做静默报绿。
 * 退出码：0=全过 / 1=存在未过项 / 2=取证缺失或工具崩溃（崩溃显式判失败）。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = p => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const J = p => { try { return JSON.parse(R(p)); } catch (e) { return null; } };

let P = 0; const F = [];
const ok = (c, n, d) => { if (c) { P++; console.log('  ok ' + n); } else { F.push(n + ' :: ' + d); console.log('  X  ' + n + ' :: ' + d); } };

try {
  const ui = R('js/ui.js'), css = R('css/style.css');
  const E = J('_vis/_v1386_after2.json');
  if (!E || !E.ready || !E.steps) throw new Error('取证缺失或前提未就绪 → 需重跑 tools/_flowwalk_v1386.cjs v1386_after2');
  const S = E.steps;

  /* ---- 源码静态：防本轮整改被改回去（变异可命中） ---- */
  ok(!/id="goTask"/.test(ui) && !/>前往关卡</.test(ui), 'T1 不再有笼统「前往关卡」按钮',
    'goTask 或 前往关卡 残留');
  ok(/taskGo\(t\)\s*\{/.test(ui) && /c === 'dailyUp'[\s\S]{0,120}key: 'gun'/.test(ui) &&
     /dailyEndless[\s\S]{0,160}focus: 'lvEndless'/.test(ui),
    'T2 按任务类型分派落点（强化→武器 / 无尽→锚点）', 'taskGo 映射缺失或被改');
  const btnCalls = (ui.match(/this\.taskGoBtn\([ta]\)\)\}/g) || []).length;
  ok(btnCalls >= 4, 'T3 四个任务页签都用行内直达', '调用数=' + btnCalls);
  ok(/\$\$\('#pnBody \[data-go\]'\)\.forEach/.test(ui) &&
     /this\.open\(b\.dataset\.go, b\.dataset\.gtab \|\| undefined\)/.test(ui),
    'T4 行内按钮真绑定且走 open() 返回栈', '绑定缺失');
  ok(/id="lvEndless"/.test(ui) && /\.zrow\.zrow-go\{flex-wrap:nowrap/.test(css),
    'T5 无尽锚点与任务行不换行样式', '锚点或 nowrap 样式缺失');
  ok(!/\bgb\.onclick\b/.test(ui) && !/const gb = \$\('#goTask'\)/.test(ui),
    'T6 无残留未定义变量（防整段绑定抛错）', 'gb 残留会让领取按钮全死');
  /* V1.3.6 背包分解区曾把块注释写进模板字符串，玩家看到一串源码文字；
   * 本轮我自己又犯了一次（写「删重复描述」说明时），故立复发断言。 */
  /* V1.3.86b 自查：原第二条宽正则会误伤 open() 里 tab 渲染后的正常注释
   * （实测命中 `${t}">...` 后的「单分类时不显示 tab 区」，与任务模板无关），
   * 属于长期假红。收紧为只认真实事故形态：块注释紧跟在渲染出的 🏆 行后面。
   * 收紧后由 mutate_taskflow.cjs 的 M8 证明仍能抓住「注释写进模板」的复发。 */
  ok(!/<div class="zav">🏆<\/div>\s*\/\*/.test(ui),
    'T13 任务渲染模板内无块注释（防渲染给玩家）', '模板内发现注释');

  /* ---- 真实 Chrome 取证 ---- */
  const g1 = S['G1_日常页未完成入口'] || {}, g5 = S['G5_周常页入口'] || {};
  ok(g1.inlineGo === 5 && g1.hasGoTask === false, 'T7 日常 5 条未完成全有行内入口',
    JSON.stringify({ inlineGo: g1.inlineGo, hasGoTask: g1.hasGoTask }));
  ok(g5.hasInlineGo === 2 && g5.hasGoTask === false, 'T8 周常 2 条未完成补齐入口（此前 0）',
    JSON.stringify({ n: g5.hasInlineGo, hasGoTask: g5.hasGoTask }));
  ok(g5.leakedComment === false, 'T14 周常页玩家可见文本无源码注释残留',
    'leakedComment=' + g5.leakedComment);
  const g7 = S['G7_四页签行内入口'] || [];
  const byTab = Object.fromEntries(g7.map(x => [x.tab, x]));
  ok(byTab['主线']?.unfinishedBtns >= 1 && byTab['日常']?.unfinishedBtns === 5 &&
     byTab['周常']?.unfinishedBtns === 2 && byTab['成就']?.unfinishedBtns >= 1,
    'T9 四页签直达按钮数符合任务表', JSON.stringify(g7.map(x => x.tab + ':' + x.unfinishedBtns)));
  ok((byTab['日常']?.labels || []).includes('去强化') &&
     (byTab['日常']?.labels || []).includes('去无尽') &&
     (byTab['日常']?.keys || []).includes('gun'),
    'T10 落点按任务分化（不再一刀切去关卡）', JSON.stringify(byTab['日常'] || {}));
  const g8 = S['G8_点击落点与返回'] || {};
  ok(g8.up?.landed === 'gun' && g8.endless?.landed === 'level' &&
     g8.endless?.inFirstScreen === true && g8.back?.landed === 'task' && g8.back?.tab === '日常',
    'T11 去强化/去无尽/◀ 回任务 闭环实测', JSON.stringify(g8));
  const g9 = S['G9_领取绑定未破坏'] || {};
  ok(g9['[data-dq]'] === true && g9.claimAll === true && (E.errs || []).length === 0,
    'T12 领取绑定未破坏且 0 报错', JSON.stringify({ g9, errs: E.errs }));
} catch (e) {
  F.push('CRASH :: ' + String(e.stack || e).slice(0, 300));
  console.log('  X  CRASH :: ' + String(e.message || e));
}
console.log('TASKFLOW PASS=' + P + ' FAIL=' + F.length);
F.forEach(x => console.log('  FAIL ' + x));
process.exit(F.length ? (F.some(x => x.startsWith('CRASH')) ? 2 : 1) : 0);
