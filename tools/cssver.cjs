/* =========================================================
 * cssver.cjs —— CSS 版本戳与引入链常驻守卫（V1.3.96）
 * 立规原因：① V1.3.95 强停残留把 css/style.css 内两处 ?v= 推成 1.4.0，
 *   而当时没有任何常驻断言检查 css 内部资源戳，只能靠 fullscan 事后发现；
 *   ② 视觉覆盖层写好了却忘了在 index.html 挂 link = 玩家什么都看不到，
 *   与「改了没发版」是同一类洞；③ push.py 登记了不存在的 css 文件 = 幽灵路径。
 * 判据：
 *   C1 版本前提就绪且规范（崩溃/缺失 exit=2）
 *   C2 css/style.css 内所有 ?v= 值都等于当前版本
 *   C3 index.html 内所有本地 css/js 资源 ?v= 都等于当前版本
 *   C4 本地每个正式 css 文件都已在 index.html 引入（写了没挂必报红）
 *   C5 每个已引入的本地 css 文件真实存在（挂了幽灵路径必报红）
 *   C6 层叠顺序：tokens.css 在 style.css 之前，所有视觉覆盖层在其之后
 * 退出码：0=全过 / 1=有未过项 / 2=前提未就绪或崩溃
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };

let pass = 0, fail = 0;
const ck = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); ok ? pass++ : fail++; };
module.exports = { check };

function check() {
  const lines = [];
  let p = 0, f = 0;
  const ck2 = (n, ok, d) => { const s = (ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : ''); lines.push(s); ok ? p++ : f++; };

  let ver = null;
  try { ver = JSON.parse(R('tools/.version.json')).v; } catch (e) { ver = null; }
  const norm = typeof ver === 'string' && /^\d+\.\d+\.\d+$/.test(ver);
  ck2('C1 当前版本前提就绪且规范', norm, 'v=' + ver);
  if (!norm) return { pass: p, fail: f, lines, prereq: true };

  const style = R('css/style.css');
  const styleV = [...style.matchAll(/\?v=([\d.]+)/g)].map(x => x[1]);
  ck2('C2 css/style.css 内 ?v= 全部等于当前版本',
    styleV.length > 0 && styleV.every(v => v === ver),
    'n=' + styleV.length + ' set=' + [...new Set(styleV)].join(','));

  const html = R('index.html');
  const localRefs = [...html.matchAll(/(?:href|src)=["']((?:css|js|assets)\/[^"']+\?v=([\d.]+))["']/g)]
    .map(x => ({ file: x[1], v: x[2] }));
  ck2('C3 index.html 本地资源 ?v= 全部等于当前版本',
    localRefs.length > 0 && localRefs.every(x => x.v === ver),
    'n=' + localRefs.length + ' set=' + [...new Set(localRefs.map(x => x.v))].join(','));

  const cssFiles = fs.readdirSync(path.join(ROOT, 'css'))
    .filter(x => x.endsWith('.css') && !x.includes('.bak') && !x.startsWith('.'))
    .sort();
  const linked = [...html.matchAll(/href=["'](css\/[^"']+\.css)(?:\?v=[\d.]+)?["']/g)].map(x => x[1]);
  const missingLink = cssFiles.filter(x => !linked.includes('css/' + x));
  ck2('C4 本地每个正式 css 都已挂进 index.html', missingLink.length === 0,
    'css=' + cssFiles.length + ' 漏挂=' + missingLink.join(','));

  const ghost = linked.filter(x => !fs.existsSync(path.join(ROOT, x)));
  ck2('C5 已引入的 css 文件真实存在', ghost.length === 0,
    '幽灵=' + ghost.join(','));

  const iTokens = linked.indexOf('css/tokens.css');
  const iStyle = linked.indexOf('css/style.css');
  const overlays = linked.filter((x, i) => i > iStyle && /^css\/v\d+\.css$/.test(x));
  const orderOK = iTokens >= 0 && iStyle > iTokens && overlays.length >= 1
    && overlays.every(x => linked.indexOf(x) > iStyle);
  ck2('C6 层叠顺序：tokens 在前、覆盖层在后', orderOK,
    'tokens=' + iTokens + ' style=' + iStyle + ' overlays=' + overlays.join(','));

  return { pass: p, fail: f, lines, prereq: false };
}

if (require.main === module) {
  try {
    const r = check();
    r.lines.forEach(l => console.log(l));
    console.log('RESULT: PASS=' + r.pass + ' FAIL=' + r.fail);
    process.exit(r.prereq ? 2 : (r.fail ? 1 : 0));
  } catch (e) {
    console.error('cssver CRASH: ' + e.stack);
    process.exit(2);
  }
}
