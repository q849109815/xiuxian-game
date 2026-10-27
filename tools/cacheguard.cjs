#!/usr/bin/env node
/* ==========================================================================
 * 缓存冲刷守卫 cacheguard —— V1.3.71
 * --------------------------------------------------------------------------
 * 立规原因：线上曾出现「生产代码里混着测试注入语句（window.__MUT）」，
 *   因该语句休眠而玩家无感，靠肉眼永远发现不了。清除后若不冲刷缓存，
 *   已缓存旧文件的玩家在下一次版本升级前仍会用到那份带污染的代码。
 *   而冲刷缓存的唯一可靠手段是「全站资源 URL 的 ?v= 统一升版」——
 *   只要有一处漏了 ?v=，那一份资源就永远刷不掉。
 *
 * 本守卫不信任"我记得改过了"，只认全量扫描：
 *   C1 index.html 每个本地资源引用都带 ?v=
 *   C2 index.html 的 ?v= 全部等于 config.js 的 HOT_UPDATE.version
 *   C3 manifest 覆盖 index.html 引用的全部 js/css（漏一个就不被热更新追踪）
 *   C4 manifest 每项 ver 等于当前版本
 *   C5 js/ui.js 的 IMG_V 常量等于当前版本（否则动态拼接的图刷不掉）
 *   C6 js 内静态资源引用不得裸写（必须走 EX.resUrl 或自带 ?v=）
 *   C7 admin/index.html 的 ?v= 同步
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let P = 0, F = 0;
const ok = (m) => { P++; console.log('  √ ' + m); };
const no = (m) => { F++; console.log('  × ' + m); };

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const html = read('index.html');
const cfg = read('js/config.js');

/* 当前版本号：以 config.js 为准（它就是热更新比对用的值） */
const mv = cfg.match(/version:\s*'([^']+)',\s*\/\*\s*主版本号/);
const VER = mv ? mv[1] : null;
console.log('=== 缓存冲刷守卫 cacheguard ===\n当前版本: ' + VER + '\n');

/* ---- C1 / C2：index.html 引用 ---- */
const refs = [...html.matchAll(/(?:src|href)="((?:assets|css|js|data)\/[^"]+)"/g)].map((m) => m[1]);
const noV = refs.filter((u) => u.indexOf('?v=') < 0);
const vers = [...new Set([...html.matchAll(/\?v=([0-9][0-9.]*)/g)].map((m) => m[1]))];
console.log('— C1 引用证：index.html 本地资源全部带 ?v= —');
if (refs.length === 0) no('C1 未扫到任何本地资源引用（判据失效）');
else if (noV.length) { no(`C1 ${noV.length} 处引用不带 ?v=：${[...new Set(noV)].slice(0, 5).join(' , ')}`); }
else ok(`C1 ${refs.length} 处引用全部带 ?v=`);

console.log('— C2 版本证：index.html 的 ?v= 与 config.js version 一致 —');
if (!VER) no('C2 取不到 config.js 版本号（判据失效）');
else if (vers.length !== 1 || vers[0] !== VER) no(`C2 版本号不一致：html=${vers.join('/')} config=${VER}`);
else ok(`C2 全站 ?v= 统一为 ${VER}`);

/* ---- C3 / C4：manifest ---- */
const mbody = cfg.match(/manifest:\s*\[([\s\S]*?)\n\s*\],/);
const items = mbody ? [...mbody[1].matchAll(/\{\s*p:\s*'([^']+)',\s*ver:'([^']+)'/g)].map((m) => ({ p: m[1], ver: m[2] })) : [];
const need = [...new Set([...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=/g)].map((m) => m[1]))];
console.log('— C3 覆盖证：manifest 覆盖 index.html 引用的全部 css/js —');
const miss = need.filter((p) => !items.some((x) => x.p === p));
if (!need.length) no('C3 未取到 index.html 的 css/js 引用（判据失效）');
else if (miss.length) no(`C3 manifest 漏 ${miss.length} 个：${miss.join(' , ')}`);
else ok(`C3 manifest ${items.length} 项覆盖全部 ${need.length} 个引用`);

console.log('— C4 清单证：manifest 每项 ver == 当前版本 —');
const bad = items.filter((x) => x.ver !== VER);
if (!items.length) no('C4 manifest 为空（判据失效）');
else if (bad.length) no(`C4 ${bad.length} 项 ver 过期：${bad.map((x) => x.p + '@' + x.ver).join(' , ')}`);
else ok(`C4 ${items.length} 项 ver 全部为 ${VER}`);

/* ---- C5：IMG_V ---- */
console.log('— C5 常量证：ui.js 的 IMG_V == 当前版本 —');
const im = read('js/ui.js').match(/const\s+IMG_V\s*=\s*'([^']+)'/);
if (!im) no('C5 取不到 IMG_V（判据失效）');
else if (im[1] !== VER) no(`C5 IMG_V=${im[1]} 与版本 ${VER} 不一致`);
else ok(`C5 IMG_V = ${VER}`);

/* ---- C6：js 内裸引用 ---- */
console.log('— C6 裸路径证：js 内静态资源引用不得裸写 —');
const JSS = ['js/main.js', 'js/ui.js', 'js/battle.js', 'js/engine.js', 'js/user.js',
  'js/audio.js', 'js/ops.js', 'js/juice.js', 'js/chibi.js', 'js/config.js'];
const bare = [];
for (const f of JSS) {
  let s = strip(read(f));
  for (const m of s.matchAll(/(?:src|href)\s*=\s*['"]((?:assets|css|js|data)\/[^'"]+)['"]/g)) {
    const u = m[1];
    if (u.indexOf('${') >= 0 || u.indexOf('+') >= 0) continue; // 动态拼接，由 C5/resUrl 覆盖
    if (u.indexOf('?v=') < 0) bare.push(f + ' → ' + u);
  }
}
if (bare.length) no(`C6 ${bare.length} 处裸路径：${[...new Set(bare)].slice(0, 6).join(' ; ')}`);
else ok('C6 无裸路径资源引用');

/* ---- C7：后台 ---- */
console.log('— C7 后台证：admin/index.html ?v= 同步 —');
const ah = read('admin/index.html');
const av = [...new Set([...ah.matchAll(/\?v=([0-9][0-9.]*)/g)].map((m) => m[1]))];
if (av.length !== 1 || av[0] !== VER) no(`C7 后台版本号 ${av.join('/')} 与 ${VER} 不一致`);
else ok(`C7 后台 ?v= 同步为 ${VER}`);

/* ---- C8：后台动态图标常量 ----
 *
 * 为什么补这条（本轮实测挖出的真洞）：
 *   admin/js/core.js 的 AIMG_V 是 emojify 动态生成 <img class="ai"> 时
 *   拼在 ?v= 后面的版本戳，覆盖后台 14 个导航入口 + 头部菜单 + 各页面图标。
 *   它此前是写死的 '20270202a'，全站升到 1.3.7xxxxx 后它纹丝不动 ——
 *   图标换了，运营的浏览器仍命中旧 URL 的缓存，清缓存也刷不掉。
 *   C7 只查 index.html 的静态 ?v=，看不见 JS 常量，所以两轮缓存冲刷都没发现它。
 *   与 C5（前端 IMG_V）成对：前端一个、后台一个，缺一个就留一个刷不掉的入口。 */
console.log('— C8 后台常量证：admin/js/core.js 的 AIMG_V == 当前版本 —');
const ac = read('admin/js/core.js').match(/const\s+AIMG_V\s*=\s*'([^']+)'/);
if (!ac) no('C8 取不到 AIMG_V（判据失效：后台图标动态拼接路径已改？）');
else if (ac[1] !== VER) no(`C8 AIMG_V=${ac[1]} 与版本 ${VER} 不一致（后台图标刷不掉）`);
else ok(`C8 AIMG_V = ${VER}`);

console.log('\n==========================================================');
console.log(`RESULT: PASS=${P} FAIL=${F}`);
process.exit(F ? 1 : 0);
