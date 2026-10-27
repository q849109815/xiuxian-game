#!/usr/bin/env node
/**
 * 静态闸门 G0：不启浏览器，纯文本/AST 级检查。
 * 重点防复发：JS 代码被误插进模板字符串（变成 HTML 文本 + 引用未定义变量）。
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/audio.js','js/battle.js','js/chibi.js','js/config.js','js/engine.js',
               'js/main.js','js/net.js','js/ops.js','js/ui.js','js/user.js'];
const R = { fail: [] };
const bad = (f, n, d) => { R.fail.push(f + ': ' + n + (d ? ' :: ' + d : '')); console.log('  X ' + f + ' ' + n + (d ? ' :: ' + d : '')); };

/* ── S1: 模板字符串里混入 JS 代码（用 AST 精确判定，不用脆弱的状态机） ── */
let acorn = null;
// 维护轮2：acorn 已随项目落在 lib/node_modules，但 require 的默认解析路径
// 不含它 —— 历史上因此反复报「依赖缺失」，静态检查等于没跑。
// 这里按「项目本地 → 全局」顺序解析，本地命中就不再走 npm 自愈（免网络）。
for (const c of [require('path').join(__dirname, '..', 'lib', 'node_modules', 'acorn'),
                 'acorn',
                 '/usr/local/lib/node_modules/acorn']) {
  try { acorn = require(c); break; } catch (e) { /* 试下一个候选 */ }
}
/* 自愈：环境重置后 acorn 会丢失，历史上反复导致"检查根本没跑"。
 * 这里自动补装一次，避免每轮都要人工修依赖。补装失败仍按铁律判失败。 */
if (!acorn) {
  try {
    require('child_process').execSync('npm i -g acorn --silent', { stdio: 'ignore', timeout: 120000 });
    acorn = require('/usr/local/lib/node_modules/acorn');
    console.log('  · G0 依赖自愈 :: acorn 已自动补装');
  } catch (e) { acorn = null; }
}
/* 铁律：依赖缺失必须【显式判失败】，绝不能静默跳过。
 * 历史上本脚本因 acorn 未安装直接 MODULE_NOT_FOUND 崩溃，
 * 若在 CI 里被 `|| true` 或后台运行吞掉，就等于"检查通过"的假象。 */
if (!acorn) {
  console.log('  X G0 依赖缺失 :: acorn 未安装，静态检查无法执行（npm i -g acorn）');
  process.exit(2);
}
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (e) { bad(f, 'S1 无法解析', String(e.message).slice(0, 100)); continue; }
  // 模板字符串的"文本片段"里若出现 JS 声明/语句，说明代码被当成文本插进去了
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'TemplateLiteral') {
      (n.quasis || []).forEach((q) => {
        const txt = (q.value && (q.value.cooked || q.value.raw)) || '';
        const m = txt.match(/^[ \t]*(const|let|var)\s+[A-Za-z_$][\w$]*\s*=/m);
        if (m) bad(f, 'S1 模板文本内混入JS声明', m[0].trim().slice(0, 50));
        const m2 = txt.match(/^[ \t]*(if|for|while|switch|return)\s*[(\s]/m);
        if (m2) bad(f, 'S1 模板文本内混入JS语句', m2[0].trim().slice(0, 50));
      });
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  })(ast);
}

/* ── S6: 块注释被写进模板字符串（会原样渲染成玩家可见文本） ──
 * 历史上宝石面板的「置灰样式…disabled」注释就写在 return `...` 里面，
 * 玩家打开宝石页会在按钮上方看到一大段开发备注。
 * S1 只查 JS 声明/语句，查不出纯注释，故单列一条。
 * 判定：同一段模板文本里【同时出现 /* 与 *\/】（路径通配 data/config/*.json
 * 只有 /* 没有 *\/，不会误报）。 */
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (e) { continue; }
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'TemplateLiteral') {
      (n.quasis || []).forEach((q) => {
        const txt = (q.value && (q.value.cooked || q.value.raw)) || '';
        if (txt.includes('/*') && txt.includes('*/'))
          bad(f, 'S6 模板文本内含块注释', txt.slice(txt.indexOf('/*'), txt.indexOf('/*') + 60).replace(/\s+/g, ' '));
      });
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  })(ast);
}

/* ── S2: 语法可解析 ── */
for (const f of FILES) {
  try { new Function(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { bad(f, 'S2 语法错误', String(e.message).slice(0, 120)); }
}

/* ── S3: CSS 括号平衡 ── */
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const open = (css.match(/\{/g) || []).length, close = (css.match(/\}/g) || []).length;
if (open !== close) bad('css/style.css', 'S3 花括号不平衡', open + ' vs ' + close);

/* ── S4: 版本号一致性（不同步会导致玩家看到虚假"发现新版本"） ── */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const vs = [...html.matchAll(/\?v=([\w-]+)/g)].map(m => m[1]);
const uniq = [...new Set(vs)];
if (uniq.length > 1) bad('index.html', 'S4 版本号不一致', uniq.join(','));
else console.log('  S4 版本号统一: ' + uniq[0]);

/* ── S4b: CSS 里会把内容翻过来的变换 ──
 * 真实案例（同类错误已发生三次）：
 *   ① .lg-box  transform:perspective(700px) rotateX(180deg) → 登录框整体上下颠倒，
 *      玩家要「反着拿手机」才能填账号密码；
 *   ② .cc-new  transform:rotate(180deg) → 技能卡「新」角标倒着显示；
 *   ③ @keyframes ldPop 0%/100% rotate(-180deg) → 加载页 logo 静止帧倒置且每 1.2s 转满 360°。
 * 判定只看【静态】规则——动画关键帧允许小幅摆动（<=5deg），大角度一律报警。 */
(function () {
  /* 必须先剥注释：注释里为说明问题会原样写出 rotate(180deg) 这类字串，
     不剥会把自己的注释当成缺陷报警（误报）。 */
  const cssN = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = [...cssN.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const bigRot = /rotate(?:[XYZ])?\(\s*(-?)(1[0-9]{2}|[2-9][0-9]|9[0-9]|[6-9][0-9])(?:\.\d+)?deg\s*\)/;
  const negScale = /scale(?:[XY])?\(\s*-\s*[\d.]/;
  decls.forEach((d) => {
    const sel = d[1].trim().split('\n').pop().trim().slice(0, 60);
    const body = d[2];
    if (sel.startsWith('@keyframes')) return;   /* 关键帧单独判 */
    const m = body.match(bigRot);
    if (m) bad('css/style.css', 'S4b 元素被大角度旋转(内容会倒置/侧倒)', sel + ' -> ' + m[0]);
    const s = body.match(negScale);
    if (s) bad('css/style.css', 'S4b 负缩放(内容会镜像翻转)', sel + ' -> ' + s[0]);
  });
  [...cssN.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n?\s*\}\s*\n?\s*\}/g)].forEach((k) => {
    [...k[2].matchAll(/rotate(?:[XYZ])?\(\s*(-?[\d.]+)deg\s*\)/g)].forEach((m) => {
      if (Math.abs(parseFloat(m[1])) > 5) {
        bad('css/style.css', 'S4b 关键帧大角度旋转', k[1] + ' -> ' + m[0]);
      }
    });
  });
  console.log('  S4b CSS 倒置变换检查完成');
})();

/* ── S5: 残留标记（开发备注/调试代码泄漏到界面） ── */
for (const f of FILES) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const hit = [];
  if (/console\.log\(/.test(s)) hit.push('console.log');
  if (/debugger/.test(s)) hit.push('debugger');
  if (hit.length) console.log('  ! ' + f + ' 调试残留: ' + hit.join(',') + '（仅提示）');
}

console.log('\n[S0] 静态闸门: FAIL ' + R.fail.length);
/* 机读结果行：原先只输出「FAIL 0」，体检员读到 PASS=0 FAIL=0 ——
 * 与「脚本崩溃、一条没查」完全无法区分（acorn 丢失事故就是这个形态）。
 * 补上覆盖面（受检文件数）：文件数掉了 = 检查范围缩水，立刻可见。 */
console.log('RESULT: PASS=' + FILES.length + ' FAIL=' + R.fail.length);
process.exit(R.fail.length ? 1 : 0);
