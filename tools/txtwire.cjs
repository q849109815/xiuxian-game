#!/usr/bin/env node
/**
 * 【V1.1.0 联合改善】运营文案热改层 · 接线守卫
 * 部门：策划（文案表）+ 程序（接线）+ 运营（热改）+ 测试（本守卫）
 *
 * 背景：TXT_001~008 与 OPS.t() 曾是全项目零调用的「空头预留层」，
 *       运营以为改配置就能改界面，实际纹丝不动。
 *
 * 铁律：每条断言必须可被变异测试证伪（改坏必须 FAIL，还原必须 PASS）。
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let PASS = 0; const FAILS = [];
const ok = (c, n, d) => { if (c) PASS++; else { FAILS.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); } };

/* ── 加载 config.js（真实执行，非正则） ── */
const ctx = vm.createContext({ console, Math, Date, JSON, Number, String, Array, Object, isNaN, parseInt, parseFloat, setTimeout, location: { pathname: '/' }, window: null, document: null });
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'), ctx, { filename: 'config.js' });
const CFG = ctx.EX;
const UI = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');

console.log('=== 运营文案热改层 · 接线守卫 ===\n');

/* ── 策划部：文案表 ── */
ok(!!CFG.I18N, 'C1 I18N 文案表存在');
for (let i = 1; i <= 8; i++) {
  const id = 'TXT_00' + i;
  const e = CFG.I18N[id];
  ok(e && typeof e.zh === 'string' && e.zh.trim(), 'C2 文案表含 ' + id);
}
ok(!!CFG.TEXT_OVERRIDE && typeof CFG.TEXT_OVERRIDE === 'object', 'C3 TEXT_OVERRIDE 覆盖层存在');

/* ── 程序部：txt() 行为 ── */
ok(CFG.txt('TXT_001') === '出击', 'D1 txt 默认取 zh', CFG.txt('TXT_001'));
ok(CFG.txt('TXT_002') === '设置', 'D2 txt(TXT_002)=设置', CFG.txt('TXT_002'));
ok(CFG.txt('NOPE_X') === 'NOPE_X', 'D3 未知 id 回退 id 本身（不刷 undefined）', CFG.txt('NOPE_X'));

/* 覆盖生效 */
CFG.TEXT_OVERRIDE.TXT_001 = '立即出击';
ok(CFG.txt('TXT_001') === '立即出击', 'D4 覆盖层优先于 zh', CFG.txt('TXT_001'));
/* 脏值防护：后台极易填成非字符串 */
CFG.TEXT_OVERRIDE.TXT_001 = 123;
ok(CFG.txt('TXT_001') === '出击', 'D5 非字符串覆盖被忽略', CFG.txt('TXT_001'));
CFG.TEXT_OVERRIDE.TXT_001 = '   ';
ok(CFG.txt('TXT_001') === '出击', 'D6 空白覆盖被忽略', CFG.txt('TXT_001'));
CFG.TEXT_OVERRIDE.TXT_001 = null;
ok(CFG.txt('TXT_001') === '出击', 'D7 null 覆盖被忽略', CFG.txt('TXT_001'));
delete CFG.TEXT_OVERRIDE.TXT_001;
ok(CFG.txt('TXT_001') === '出击', 'D8 删除覆盖后回退默认值');

/* ── 运营部：接线点（ui.js 源码真实出现 EX.txt('TXT_00x')） ── */
const WIRED = { TXT_001: '出击按钮', TXT_002: '设置入口', TXT_003: '结算胜利标题', TXT_004: '广告复活按钮', TXT_005: '武器强化页签', TXT_006: '技能三选一标题' };
for (const [id, name] of Object.entries(WIRED)) {
  const re = new RegExp("EX\\.txt\\('" + id + "'\\)");
  ok(re.test(UI), 'O1 ui.js 已接线 ' + id + '（' + name + '）');
}
/* 剩余两条须显式登记为待办，防止悄悄遗忘 */
ok(/TXT_007/.test(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8')), 'O2 TXT_007 仍在表内（待界面落地）');
ok(/TXT_008/.test(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8')), 'O3 TXT_008 仍在表内（待界面落地）');

/* ── 测试部：默认值与界面原文一致（接线后视觉零变化） ── */
ok(CFG.txt('TXT_003') === '恭 喜 获 得', 'T1 结算标题默认值与原文一致', CFG.txt('TXT_003'));
ok(CFG.txt('TXT_004') === '看广告原地复活', 'T2 复活按钮默认值与原文一致', CFG.txt('TXT_004'));
ok(CFG.txt('TXT_005') === '强化', 'T3 武器页签默认值与原文一致', CFG.txt('TXT_005'));
ok(CFG.txt('TXT_006') === '选择技能', 'T4 三选一标题默认值与原文一致', CFG.txt('TXT_006'));

console.log('\n--- PASS ' + PASS + ' / FAIL ' + FAILS.length + ' ---');
process.exit(FAILS.length ? 1 : 0);
