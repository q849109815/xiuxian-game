#!/usr/bin/env node
/* 【taskflow2.cjs】立规原因：制作人追问「用视觉结合代码看看操作流程逻辑性方便吗」。
 *   V1.3.86 只证明「点直达按钮能落到对的面板」，V1.3.86b 真实 Chrome 补测
 *   证明落点对 ≠ 一步到位：
 *     去强化落 gun/武器库，而 #gunUp 只在「强化」页签渲染（targetFound=false）；
 *     去关卡/去扫荡落 level 顶部，首个「挑战」top=956 > 首屏 852，扫荡按钮更是不在；
 *     领取后页签是否保持、条目少页签的空旷程度，此前无取证。
 *   修复：dailyUp 动态取首个页签；去关卡/去扫荡补 focus=lvFirst；关卡首行加锚点。
 * 判据：源码静态 6 项 + 真实 Chrome 取证 6 项；取证以自身输出与 srcHash 为准，
 *   快照与当前 js/ui.js 不一致即判「需重跑」（历史错题：拿旧快照冒充当前状态）。
 * 退出码：0=全过 / 1=存在未过项 / 2=取证缺失、过期或工具崩溃（崩溃显式判失败）。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const R = p => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const J = p => { try { return JSON.parse(R(p)); } catch (e) { return null; } };
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

let P = 0; const F = [];
const ok = (c, n, d) => { if (c) { P++; console.log('  ok ' + n); } else { F.push(n + ' :: ' + d); console.log('  X  ' + n + ' :: ' + d); } };

try {
  const ui = R('js/ui.js'), walk = R('tools/_flowwalk_v1386b.cjs');
  const E = J('_vis/_v1386b_fix.json');
  if (!E || !E.ready || !E.steps) throw new Error('取证缺失或前提未就绪 → 需重跑 tools/_flowwalk_v1386b.cjs v1386b_fix');
  const S = E.steps;

  /* ---- 静态：防修复被改回去（变异可命中） ---- */
  ok(/c === 'dailyUp'[\s\S]{0,260}this\.PANELS\.gun\[1\]\[0\]/.test(ui) &&
     !/c === 'dailyUp'[^\n]*tab: '武器库'/.test(ui),
    'S1 去强化落「强化」页签且不写死武器库', 'dailyUp 分支被改回');
  ok(/c === 'dailySweep'[\s\S]{0,180}focus: 'lvFirst'/.test(ui),
    'S2 去扫荡补首关滚动锚点', 'dailySweep 缺 focus');
  ok(/return \{ label: '去关卡'[\s\S]{0,180}focus: 'lvFirst'/.test(ui),
    'S3 去关卡补首关滚动锚点', '默认分支缺 focus');
  ok(/id="lvFirst"/.test(ui) && /list\.map\(\(l, li\)/.test(ui),
    'S4 关卡首行锚点真实存在', 'lvFirst 或 map 索引缺失');
  ok(/focus: 'lvEndless'/.test(ui) && /id="lvEndless"/.test(ui),
    'S5 去无尽既有能力未被破坏', '无尽锚点缺失');
  ok(/P\.diffCleared/.test(walk), 'S6 取证存档含通关星级（扫荡按钮可渲染）',
    '取证前提丢失，[data-sw] 会恒为 false');

  /* ---- 动态：只认真实 Chrome 取证 ---- */
  ok(E.srcHash === md5(fs.readFileSync(path.join(ROOT, 'js/ui.js'))),
    'D0 取证快照与当前源码一致', '源码已变，快照过期 → 需重跑');
  const h1 = S['H1_直达落点与目标控件可见性'] || [];
  const by = Object.fromEntries(h1.map(x => [x.label, x]));
  const four = ['去关卡', '去强化', '去扫荡', '去无尽'];
  ok(four.every(l => by[l] && by[l].targetFound === true && by[l].inFirstScreen === true),
    'D1 四类直达的目标控件都在首屏', JSON.stringify(h1.map(x => x.label + ':' + x.targetFound + '/' + x.inFirstScreen)));
  ok(by['去强化'] && by['去强化'].tab !== '武器库',
    'D2 去强化不再停在没有强化按钮的页签', JSON.stringify(by['去强化'] || {}));
  ok(by['去关卡'] && by['去扫荡'] && by['去关卡'].bodyScrollTop > 0 && by['去扫荡'].bodyScrollTop > 0,
    'D3 去关卡/去扫荡真的滚到了首关（不是碰巧可见）',
    JSON.stringify({ a: by['去关卡'] && by['去关卡'].bodyScrollTop, b: by['去扫荡'] && by['去扫荡'].bodyScrollTop }));
  ok(by['去无尽'] && by['去无尽'].inFirstScreen === true && by['去无尽'].bodyScrollTop > 0,
    'D4 去无尽仍滚到无尽卡片', JSON.stringify(by['去无尽'] || {}));
  const h2 = S['H2_领取后页签保持'] || {};
  ok(h2.hadBtn === true && h2.before && h2.afterAll && h2.beforeOne && h2.afterOne &&
     h2.before.tab === h2.afterAll.tab && h2.beforeOne.tab === h2.afterOne.tab,
    'D5 领取奖励后留在当前页签', JSON.stringify(h2));
  ok(E.ready === true && (E.errs || []).length === 0,
    'D6 真实渲染 0 报错', JSON.stringify({ ready: E.ready, errs: E.errs }));

  /* 只记录不判失败：条目少页签的空旷量化，列入下轮「面板高度自适应」专项 */
  const h3 = S['H3_页签空白量化'] || [];
  console.log('  INFO 页签空白(px) ' + h3.map(x => x.tab + ':' + x.emptyPx).join(' '));
} catch (e) {
  F.push('CRASH :: ' + String(e.stack || e).slice(0, 300));
  console.log('  X  CRASH :: ' + String(e.message || e));
}
console.log('TASKFLOW2 PASS=' + P + ' FAIL=' + F.length);
F.forEach(x => console.log('  FAIL ' + x));
process.exit(F.length ? (F.some(x => x.startsWith('CRASH')) ? 2 : 1) : 0);
