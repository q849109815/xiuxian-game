/* tools/tips.cjs ——【V1.3.0】提示文案统一层守卫
 *
 * 背景：EX.tips 是 41 条已写好的提示文案池，但历史上大部分键【零调用】，
 * 界面提示全是硬编码 —— 运营想改一句「购买成功」必须发版。
 *
 * 本守卫做四件事：
 *   A. 逐键断言：每条文案要么真接线（代码里出现 tip('x.y')），要么显式登记为待接线
 *   B. 覆盖层：TIP_OVERRIDE 生效 / 非字符串忽略回退
 *   C. 行为：占位符替换、缺键回退、脏值不崩
 *   D. 防回归：单引号字符串里不得残留 ${} 模板语法（本轮实测踩过的坑）
 *
 * 用法：node tools/tips.cjs   （退出码 0=通过，1=失败）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n + (extra ? ' → ' + extra : '')); } };

/* ---------- 解析 EX.tips 叶子键 ---------- */
function tipKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const i = src.indexOf('\n  tips: {');
  if (i < 0) throw new Error('未找到 tips 块');
  const j = src.indexOf('\n  },', i + 1);
  const block = src.slice(i, j);
  const keys = [];
  const stack = [];
  for (let line of block.split('\n')) {
    const s = line.replace(/\/\/.*/, '');
    if (/^\s*\}/.test(s)) { if (stack.length) stack.pop(); continue; }
    const open = s.match(/^\s*(\w+):\s*\{/);
    if (open) { stack.push(open[1]); continue; }
    const re = /(\w+):\s*'[^']*'/g; let m;
    while ((m = re.exec(s))) keys.push(stack.concat([m[1]]).join('.'));
  }
  return keys.map(k => k.replace(/^tips\./, ''));
}

/* ---------- 待接线白名单（必须写明原因，禁止无限期挂着） ---------- */
const WHITELIST = {
  'float.crit': '飘字为纯数字+配色，加文字会遮挡僵尸本体，需美术定样式后再接',
  'float.miss': '同 float.crit',
  'float.block': '同 float.crit',
  'float.heal': '回血飘字沿用 +N 数字样式，需美术定样式',
  'float.dmg': '伤害飘字为纯数字，加「-」前缀由代码控制，需美术定样式',
  'float.gold': '拾取飘字由 battle 拼多个道具名，需先统一格式',
  'float.xp': '经验飘字需先落地经验条 HUD',
  'float.lvup': '升级播报走 VO 语音，字幕需美术定位',
  'float.wallHit': '防线受损走 juice 红闪，文字需美术定位',
  'float.immune': '免疫提示需美术定配色',
  'float.frozen': '同 float.crit',
  'float.burn': '同 float.crit',
  'float.poison': '同 float.crit',
  'popup.adLimit': '广告次数上限后走置灰按钮，缺 toast 触发点，需补交互',
  'popup.reviveOk': '复活走结算流程，需确认弹窗时机',
  'popup.clearConfirm': '清空存档确认框在设置页，需 UX 复核后接',
  'popup.resetConfirm': '后台重置按钮，需后台确认框改造',
  'sys.saveOk': '存档成功目前静默，需 UX 决定是否打扰玩家',
  'sys.saveFail': '存档失败目前静默，需 UX 决定',
  'sys.offline': '离线状态条已有 UI 表达，文案待统一',
  'sys.online': '同 sys.offline',
  'sys.netRetry': '重连提示需配合 net.js 状态机改造',
  'sys.reload': '换弹提示需战斗 HUD 定位',
  /* V1.3.4：sys.newWave 已由策划删除（语义重复），不再登记为待接线。
   * 若有人把它加回 config，A1「无未登记死键」会立刻失败 —— 防回归。 */
  'err.dataErr': '数据读取失败路径待梳理',
  'err.loadErr': '资源加载失败路径待梳理',
  'err.opFail': '通用失败兜底，需先定义触发点',
  'err.notFound': '后台查无此玩家，属后台文案，非玩家端',
};

/* ---------- 收集源码引用 ---------- */
let SRC = '';
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
  if (f.endsWith('.js') && f !== 'config.js') SRC += fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
}

const keys = tipKeys();
console.log('== V1.3.0 提示文案守卫 ==');
console.log('tips 叶子键总数: ' + keys.length);

/* A. 逐键断言 */
const wired = [], pending = [], ghost = [];
for (const k of keys) {
  const re = new RegExp("tip\\(\\s*'" + k.replace(/\./g, '\\.') + "'");
  if (re.test(SRC)) wired.push(k);
  else if (WHITELIST[k]) pending.push(k);
  else ghost.push(k);
}
console.log('已接线: ' + wired.length + ' / 已登记待接线: ' + pending.length + ' / 未登记: ' + ghost.length);
ok('A1 无未登记死键', ghost.length === 0, ghost.join(', '));
ok('A2 已接线数 >= 12', wired.length >= 12, '实际 ' + wired.length);
/* A4 逐键硬断言：本轮明确接线的高频提示，掉一条就失败（阈值断言抓不住单条缺失） */
const MUST_WIRED = ['popup.noCoin', 'popup.noStamina', 'popup.lvLocked', 'popup.buyOk',
  'sys.waveIn', 'sys.bossIn', 'err.netErr'];
for (const k of MUST_WIRED) {
  const re = new RegExp("tip\\(\\s*'" + k.replace(/\./g, '\\.') + "'");
  ok('A4 必须接线: ' + k, re.test(SRC));
}
for (const k of pending) ok('A3 待接线须写明原因: ' + k, String(WHITELIST[k] || '').length > 8);

/* ---------- V1.3.4 新增断言 ---------- */
/* E. 策划：语义重复键 sys.newWave 已删除（由 sys.waveIn 覆盖）。
 * 加回来会变成「未登记死键」，A1 直接失败 —— 这里再显式断言一次便于定位。 */
ok('E1 sys.newWave 已删除', !keys.includes('sys.newWave'),
  keys.includes('sys.newWave') ? '该键仍存在（与 waveIn 语义重复）' : '');
ok('E2 白名单不含已删键', WHITELIST['sys.newWave'] === undefined);

/* F. 运营/程序：后台「提示文案热改」表单（运营不必再手写裸 JSON）。
 * 此前 TIP_OVERRIDE 只能靠热更新页手填 JSON，本轮做成可视化表单。 */
const ADM = fs.readFileSync(path.join(ROOT, 'admin/js/pages.js'), 'utf8');
ok('F1 后台引用 TIP_OVERRIDE', /TIP_OVERRIDE/.test(ADM));

/* F0【V1.3.8 体检补】必须查 config.js 源码里真的有 TIP_OVERRIDE 键。
 *
 * 为什么非要这条：B4~B8 是在 vm 里【自己赋值】EX.TIP_OVERRIDE 来测覆盖逻辑，
 * 于是 config.js 里这个键被改名或删掉，守卫照样全绿 ——
 * 变异验证当场判了「假通过」。而真实后果是运营热改静默失效：
 * 界面不报错、功能不崩，就是改了没反应，正是本工具要防的那类坑。 */
const CFGSRC = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
ok('F0 config.js 存在 TIP_OVERRIDE 键', /\bTIP_OVERRIDE\s*:/.test(CFGSRC),
  '未找到 TIP_OVERRIDE: —— 运营热改将静默失效');
ok('F2 后台有 tpEdit 动作', /\btpEdit\b/.test(ADM));
ok('F3 后台有 tpClear 动作', /\btpClear\b/.test(ADM));
ok('F4 后台有提示文案页签', /seg\('tip'/.test(ADM));

/* B. 覆盖层 —— 真加载 config.js 执行 */
function loadEX() {
  const code = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const sandbox = { window: {}, console };
  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;globalThis.__EX = EX;', sandbox, { filename: 'config.js' });
  return sandbox.__EX;
}
let EX = null;
try { EX = loadEX(); ok('B0 config.js 可加载', !!EX); }
catch (e) { ok('B0 config.js 可加载', false, e.message); }

if (EX) {
  ok('B1 默认取表内值', EX.tip('popup.noCoin', { v: 300 }) === '金币不足（需 300）', EX.tip('popup.noCoin', { v: 300 }));
  ok('B2 缺键回退叶子名', EX.tip('zzz.nope') === 'nope', EX.tip('zzz.nope'));
  ok('B3 无 vars 不留残占位符', !/\{|\（\s*\）/.test(EX.tip('popup.noCoin')), EX.tip('popup.noCoin'));

  EX.TIP_OVERRIDE = { 'popup.noCoin': '金库告急（还差 {v}）', 'popup.buyOk': '到手了！' };
  ok('B4 覆盖生效', EX.tip('popup.noCoin', { v: 300 }) === '金库告急（还差 300）', EX.tip('popup.noCoin', { v: 300 }));
  ok('B5 覆盖无占位符', EX.tip('popup.buyOk') === '到手了！', EX.tip('popup.buyOk'));

  EX.TIP_OVERRIDE = { 'popup.noCoin': 123, 'popup.buyOk': null, 'popup.noStamina': '   ' };
  ok('B6 数字覆盖被忽略', EX.tip('popup.noCoin', { v: 1 }) === '金币不足（需 1）', EX.tip('popup.noCoin', { v: 1 }));
  ok('B7 null 覆盖被忽略', EX.tip('popup.buyOk') === '购买成功', EX.tip('popup.buyOk'));
  ok('B8 空白覆盖被忽略', EX.tip('popup.noStamina', { v: 2 }) === '体力不足（需 2）', EX.tip('popup.noStamina', { v: 2 }));
  EX.TIP_OVERRIDE = {};

  /* C. 脏值不崩 */
  let crashed = false;
  try {
    EX.tip(null); EX.tip(undefined, null); EX.tip('', {}); EX.tip('a.b.c.d.e');
    EX.tip('popup.noCoin', { v: undefined }); EX.tip('popup.noCoin', 'x');
  } catch (e) { crashed = true; ok('C1 脏值不崩', false, e.message); }
  if (!crashed) ok('C1 脏值不崩', true);
  ok('C2 脏值不出 undefined', !/undefined|NaN/.test(EX.tip('popup.noCoin', { v: undefined })), EX.tip('popup.noCoin', { v: undefined }));
}

/* D. 单引号字符串里不得残留 ${} —— 本轮实测踩过的坑 */
/* 真正的引号状态机：跨行模板字符串里的 ${} 是合法的，单/双引号串里的才是残留 */
function strayTemplate(src, file) {
  const out = [];
  /* 上下文栈：'`' 模板串 / '"' / "'" 普通串 / '{' 模板内 ${} 代码区（引号照常生效） */
  const st = [];
  const top = () => st[st.length - 1] || null;
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    const t = top();
    if (t === null || t === '{') {
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      /* 正则字面量：/…/ 内含引号（如 /'/g），必须整段跳过，否则会把引号当字符串起点、
       * 导致后面所有 ${ 被误判成残留模板语法（实测一次误报 45 处）。 */
      if (c === '/') {
        let k = i - 1;
        while (k >= 0 && /\s/.test(src[k])) k--;
        const prev = k >= 0 ? src[k] : '';
        if (prev === '' || '(,=:[!&|?{};+-*%~^'.includes(prev)) {
          i++; let cls = false, esc = false;
          while (i < src.length) {
            const ch = src[i];
            if (esc) { esc = false; i++; continue; }
            if (ch === '\\') { esc = true; i++; continue; }
            if (cls) { if (ch === ']') cls = false; i++; continue; }
            if (ch === '[') { cls = true; i++; continue; }
            if (ch === '/') { i++; break; }
            if (ch === '\n') break;
            i++;
          }
          continue;
        }
      }
      if (c === "'" || c === '"' || c === '`') { st.push(c); i++; continue; }
      if (t === '{') {
        if (c === '{') { st.push('{'); i++; continue; }
        if (c === '}') { st.pop(); i++; continue; }
      }
      i++; continue;
    }
    /* 处于字符串内部 */
    if (c === '\\') { i += 2; continue; }
    if (c === t) { st.pop(); i++; continue; }
    if (t === '`' && c === '$' && n === '{') { st.push('{'); i += 2; continue; }
    /* 单/双引号串内出现 ${ → 不会插值，属残留模板语法 */
    if (c === '$' && n === '{') {
      const end = src.indexOf('}', i);
      out.push(file + ' 偏移' + i + ': …' + src.slice(Math.max(0, i - 24), (end < 0 ? i + 40 : end + 1)).replace(/\n/g, ' ') + '…');
      i = (end < 0 ? i + 2 : end + 1); continue;
    }
    i++;
  }
  return out;
}
for (const f of ['js/ui.js', 'js/main.js', 'js/battle.js']) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const bad = strayTemplate(s, f);
  ok('D1 单/双引号串无残留模板语法: ' + f, bad.length === 0, bad.length + ' 处，如: ' + (bad[0] || ''));
}

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
