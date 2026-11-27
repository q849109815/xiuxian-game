#!/usr/bin/env node
/* =========================================================
 * btfxguard.cjs —— 战斗视觉深化层常驻守卫（V1.3.97）
 *
 * 立规原因：V1.3.96 踩过两次「写了没生效」——CSS 被 !important 主题层吃掉、
 * 覆盖层写好了忘挂 link。新一轮特效涉及 4 个文件（battle.js / ui.js /
 * btfx.js / v1397.css / index.html / manifest / push 清单），
 * 少了任何一处接线，玩家看到的都还是旧画面。
 *
 * 判据（全部静态可机读，不依赖浏览器，秒级）：
 *   G1 引入链：CSS 在 v1396 之后、JS 在 battle.js 之后、都带 ?v=
 *   G2 draw() 末尾挂了 BTFX.frame，且包在 try/catch 里
 *   G3 btfx.js 是纯表现层：不得写任何战斗数值 / 状态数组
 *   G4 透视网格已改暖：旧冷青紫常量一个都不许残留
 *   G5 CSS 有全屏闪光规则、有 reduced-motion 停用段
 *   G6 技能球输出 data-el / --elc，六个元素都有分色规则
 *   G7 热更 manifest 与上传清单都登记了新文件
 *   G8 运行时接线证：btfx.js 暴露 frame / domClass / lastFlash 供取证读取
 *
 * 退出码：0=全过 / 1=有未过项 / 2=前提未就绪或崩溃
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
let p = 0, f = 0;
const ck = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); ok ? p++ : f++; };
module.exports = { check };

function check() {
  let P = 0, F = 0, lines = [];
  const k = (n, ok, d) => { const s = (ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : ''); lines.push(s); ok ? P++ : F++; };

  const html = R('index.html'), battle = R('js/battle.js'), ui = R('js/ui.js'),
    btfx = R('js/btfx.js'), css = R('css/v1397.css'), cfg = R('js/config.js'),
    push = R('tools/push.py');
  const prereq = !html || !battle || !ui || !btfx || !css || !cfg || !push;
  if (prereq) {
    k('G0 前提：七个受检文件齐全', false, '缺文件');
    return { pass: P, fail: F, lines, prereq: true };
  }
  k('G0 前提：七个受检文件齐全', true);

  /* G1 引入链与顺序 */
  const iCss96 = html.indexOf('css/v1396.css'), iCss97 = html.indexOf('css/v1397.css');
  const iBt = html.indexOf('js/battle.js'), iFx = html.indexOf('js/btfx.js'), iUi = html.indexOf('js/ui.js');
  k('G1 新 CSS/JS 已引入且顺序正确',
    iCss96 > 0 && iCss97 > iCss96 && iBt > 0 && iFx > iBt && iFx < iUi
    && /css\/v1397\.css\?v=/.test(html) && /js\/btfx\.js\?v=/.test(html),
    'css96=' + iCss96 + ' css97=' + iCss97 + ' battle=' + iBt + ' btfx=' + iFx + ' ui=' + iUi);

  /* G2 draw 末尾 hook */
  const hook = /globalThis\.BTFX[\s\S]{0,160}BTFX\.frame\(c,\s*r\)/.test(battle)
    || /BTFX\.frame\(c,\s*r\)/.test(battle);
  const guarded = /try\s*\{\s*globalThis\.BTFX\.frame|try\s*\{\s*window\.BTFX\.frame/.test(battle)
    || /BTFX\.frame\(c,\s*r\);\s*\}\s*catch/.test(battle);
  k('G2 draw() 挂接特效层且异常不外溢', hook && guarded,
    'hook=' + hook + ' try/catch=' + guarded);

  /* G3 纯表现层：不得写战斗数值 / 状态数组 */
  const writes = [
    /\br\.(hp|wallHp|gold|coin|xp|lv|kills|mag|cd|skills|mods|zombies|bullets|drops|efx|floats|zones)\s*(=|\+=|-=)/,
    /\b(run|BT\.run)\.(hp|wallHp|gold|coin|xp|lv|kills)\s*(=|\+=|-=)/,
    /\.push\(\s*\{\s*t:\s*'/,
  ];
  const hit = writes.filter(re => re.test(btfx));
  k('G3 特效层不写任何战斗数值或状态', hit.length === 0, '命中禁写模式=' + hit.length);

  /* G4 冷青紫网格常量不得残留。
   * 判据必须限定在 drawPerspGround 函数体内并剥离注释：
   *  ① battle.js 别处（枪口焰 / 电系武器辉光）保留冷色是合理的元素语义；
   *  ② 本次修复的注释里会提到旧色值，全文扫描会把「说明文字」判成残留。
   * 上一轮刚吃过「判据范围写宽 → 假红」的亏，这里一次收准。 */
  const p0 = battle.indexOf('drawPerspGround(c) {');
  const p1 = p0 >= 0 ? battle.indexOf('\n  },', p0) : -1;
  const seg = p0 >= 0 ? battle.slice(p0, p1 > 0 ? p1 : p0 + 4200)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') : '';
  const cold = ['rgba(90,225,255', 'rgba(110,240,255', 'rgba(190,110,255',
    'rgba(120,235,255', 'rgba(150,120,255', 'rgba(48,14,86', 'rgba(16,26,42'];
  const left = seg ? cold.filter(s => seg.includes(s)) : ['段未取到'];
  k('G4 透视网格已改暖（函数体内旧冷色零残留）', seg.length > 0 && left.length === 0,
    '残留=' + left.join(',') + ' 段长=' + seg.length);
  k('G4b 暖色网格线真实存在', seg.includes('rgba(255,196,116') && seg.includes('rgba(255,170,88'));

  /* G5 CSS 闪光与无障碍 */
  k('G5 全屏技能闪光规则存在', /#battle\.fx-cast::after/.test(css) && /--fx-cast-rgb/.test(css));
  k('G5b reduced-motion 停用段存在',
    /prefers-reduced-motion:\s*reduce/.test(css) && /animation:\s*none\s*!important/.test(css));

  /* G6 技能球元素化 */
  const els = ['火', '冰', '电', '风', '毒', '物'];
  const cssEls = els.filter(e => css.includes('data-el="' + e + '"')).length;
  k('G6 技能球输出 data-el / --elc', /data-el="\$\{d\.el/.test(ui) && /--elc:\$\{el\.c\}/.test(ui));
  k('G6b 六元素各有分色规则', cssEls === 6, '命中=' + cssEls + '/6');

  /* G7 清单登记 */
  k('G7 热更 manifest 登记新文件',
    cfg.includes("p: 'css/v1397.css'") && cfg.includes("p: 'js/btfx.js'"));
  k('G7b 上传清单登记新文件',
    push.includes("'css/v1397.css'") && push.includes("'js/btfx.js'"));

  /* G8 运行时取证接口 */
  k('G8 特效层暴露取证接口',
    /frame:\s*frame/.test(btfx) && /domClass/.test(btfx) && /lastFlash/.test(btfx));

  return { pass: P, fail: F, lines, prereq: false };
}

if (require.main === module) {
  try {
    const r = check();
    r.lines.forEach(l => console.log(l));
    console.log('RESULT: PASS=' + r.pass + ' FAIL=' + r.fail);
    process.exit(r.prereq ? 2 : (r.fail ? 1 : 0));
  } catch (e) { console.error('btfxguard CRASH: ' + e.stack); process.exit(2); }
}
