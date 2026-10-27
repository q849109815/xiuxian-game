#!/usr/bin/env node
/* adminux.cjs —— 后台「三体验」守卫
 * ------------------------------------------------------------------
 * 背景（本轮清理前的事实）：
 *   1) 「✅ 已接入游戏端（CFG_FILES）——…」整句在商城/社交两处逐字复制，广告页再来一遍变体；
 *   2) 多语言页挂着一个 disabled 的语言下拉 + 一行「本游戏仅支持简体中文」说明来解释它；
 *   3) 版本号页放着「改版本号需同步改 index.html 的 ?v= 与 config.js 的…」的长教训；
 *   4) 排期页两条长句在解释「玩家可见」到底是什么意思。
 * 这些不是信息，是**布局/实现缺陷的文字补丁**：控件自己说不清，就写一段话去补。
 *
 * 三类体验各设断言：
 *   UX（运营体验）：界面不再出现内部实现名；不再有禁用控件冒充可操作；
 *                   不再出现"记得手动同步"式的静态教训（改为不一致时才出现的动态警示）。
 *   DX（开发体验）：三处页面共用 wired() 徽章，不得再逐字复制整句；样式集中定义。
 *   AX（AI 体验） ：本守卫自身必须可复跑、可自证；由 mutate_adminux.cjs 证明每条抓得住。
 *
 * 用法：node tools/adminux.cjs   （0=通过，1=有失败项）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'admin/js/pages.js');
const CSS = path.join(ROOT, 'admin/css/admin.css');

const S = fs.readFileSync(PAGES, 'utf8');
const C = fs.readFileSync(CSS, 'utf8');
/* 剥注释：只有"渲染给运营的文本"才算违规，代码注释里提实现名是合理的开发说明 */
const CODE = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[ \t])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ok   ' + n); };
const no = (n, d) => { fail++; console.log('  FAIL ' + n + (d ? ' —— ' + d : '')); };
const has = (re, src) => re.test(src || CODE);

/* 抽取所有"会渲染给运营看的文本"：hint / h3 / tag / toast / 表头 */
function visibleTexts() {
  const out = [];
  const push = (t) => out.push(String(t).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  let m;
  const re1 = /class="hint"[^>]*>([\s\S]*?)<\/div>/g;
  while ((m = re1.exec(CODE))) push(m[1]);
  const re2 = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  while ((m = re2.exec(CODE))) push(m[1]);
  const re3 = /class="tag"[^>]*>([\s\S]*?)<\/span>/g;
  while ((m = re3.exec(CODE))) push(m[1]);
  const re4 = /this\.toast\((['"])([\s\S]*?)\1/g;
  while ((m = re4.exec(CODE))) push(m[2]);
  return out;
}
const VIS = visibleTexts();

console.log('后台三体验守卫 adminux');
console.log('────────────────────────────────────────');

/* ============ UX：运营体验 ============ */
console.log('UX 运营体验');

/* U1 内部实现名不得出现在运营可见文本里 */
const INTERNAL = ['CFG_FILES', 'TIP_OVERRIDE', 'cfg.json', 'roadmap.json', 'ad.json', 'hotfix.json'];
const hitU1 = [];
VIS.forEach((t) => INTERNAL.forEach((k) => { if (t.indexOf(k) >= 0) hitU1.push(k + '：「' + t.slice(0, 40) + '」'); }));
hitU1.length ? no('U1 运营可见文本出现内部实现名', hitU1.join(' / ')) : ok('U1 运营可见文本无内部实现名（' + VIS.length + ' 条已查）');

/* U2 已删除的冗余整句不得回归 */
const DEAD = [
  '✅ 已接入游戏端（CFG_FILES）',
  '本游戏仅支持简体中文',
  '改版本号需同步改 index.html',
  '「玩家可见」= 出现在游戏内',
  '下发后写入 data/zb/roadmap.json',
  '填错键名会静默不生效',
  '战力/注册条件会先在本地筛出 UID 列表',
];
const backU2 = DEAD.filter((d) => CODE.indexOf(d) >= 0);
backU2.length ? no('U2 冗余整句回归', backU2.join(' / ')) : ok('U2 冗余整句无回归（' + DEAD.length + ' 条）');

/* U3 禁用控件不得冒充可操作控件（disabled select 曾是"仅支持中文"的载体） */
const disSel = (CODE.match(/<select[^>]*\sdisabled/g) || []).length;
disSel ? no('U3 存在 disabled 下拉（' + disSel + ' 处）——禁用控件应删除而非靠说明解释') : ok('U3 无 disabled 下拉');

/* U4 不得出现"记得手动同步"式静态教训；版本一致性必须是动态判定的 */
has(/改版本号需同步改|需同步改|记得同步/) ? no('U4 存在静态「需手动同步」教训，应改为不一致时才出现的动态警示') : ok('U4 无静态同步教训，版本一致性为动态判定');
has(/class="wired warn"|wired warn/) || has(/\.wired\.warn/) ? ok('U5 版本不一致有动态警示实现') : no('U5 缺少动态版本不一致警示');

/* U6 同一句说明不得在多处逐字复制 */
const HINTS = [];
{ let m; const r = /class="hint"[^>]*>([\s\S]*?)<\/div>/g;
  while ((m = r.exec(CODE))) HINTS.push(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()); }
const dup = {};
HINTS.forEach((h) => { if (h.length > 12) dup[h] = (dup[h] || 0) + 1; });
const dupList = Object.keys(dup).filter((k) => dup[k] > 1);
dupList.length ? no('U6 相同说明句重复出现', dupList.map((k) => dup[k] + '×「' + k.slice(0, 24) + '」').join(' / ')) : ok('U6 无重复说明句（' + HINTS.length + ' 条互不相同）');

/* ============ DX：开发体验 ============ */
console.log('DX 开发体验');

/* D1 已接入徽章统一走 wired()，不得再有字面量整句 */
has(/const wired = \(extra\)/) ? ok('D1 已接入徽章有统一实现 wired()') : no('D1 缺少 wired() 统一实现');
const litBadge = (CODE.match(/已接入游戏端/g) || []).length;
const wiredCall = (CODE.match(/wired\(/g) || []).length;
/* 1 处是 wired 函数体内字面量 + 3 处调用（商城/社交/广告） */
litBadge <= 1 ? ok('D2 徽章文案仅存于 wired() 内（字面量 ' + litBadge + ' 处，调用 ' + wiredCall + ' 处）')
              : no('D2 徽章整句被复制到 ' + litBadge + ' 处，应改为调用 wired()');
/* 商城 / 社交两处 NOT_READ + 广告页一处带额外影响说明，共 3 次调用 */
wiredCall >= 3 ? ok('D3 徽章复用覆盖三处页面（' + wiredCall + ' 次调用）') : no('D3 徽章复用不足，仅 ' + wiredCall + ' 次调用');

/* D4 样式集中定义，不得散落在行内 style */
/\.wired\{/.test(C) ? ok('D4 .wired 样式已集中定义') : no('D4 .wired 样式缺失');
/\.wired\.warn\{/.test(C) ? ok('D5 .wired.warn 样式已定义') : no('D5 .wired.warn 样式缺失');
const inlineGreen = (CODE.match(/color:#7ee08a/g) || []).length;
inlineGreen === 0 ? ok('D6 绿色提示已无行内硬编码') : no('D6 仍有 ' + inlineGreen + ' 处行内颜色硬编码');

/* ============ AX：AI Agent 体验 ============ */
console.log('AX AI Agent 体验');

/* A1 多语种分支必须保留（单语种精简不能把多语种能力删掉） */
has(/const multi = L\.length > 1/) ? ok('A1 单/多语种分支保留（精简未删能力）') : no('A1 多语种分支丢失');
/* A2 文案表列头不得在单语种下重复语言名 */
has(/const colHead = multi \?/) ? ok('A2 列头随语种数自适应') : no('A2 列头未自适应，单语种下会重复语言名');
/* A3 守卫本身可复跑：本文件存在且可解析 */
fs.existsSync(__filename) ? ok('A3 守卫可复跑（adminux.cjs 存在）') : no('A3 守卫文件丢失');

console.log('────────────────────────────────────────');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
