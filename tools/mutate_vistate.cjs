#!/usr/bin/env node
/**
 * 僵尸开炮 · vistate.cjs 的变异测试
 *
 * 证明这条断言不是摆设：往 CSS 末尾注入一条 !important 规则，
 * 把 .lvc.cur（芯片槽位 / 难度 / 章节的选中高亮）重新抹成不可见，
 * vistate.cjs 必须报 FAIL；还原后必须字节一致且重新 PASS。
 * 任一步不成立 → 该闸门不可信，禁止依据其结论。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const CSS = path.resolve(__dirname, '..', 'css', 'style.css');
const BAK = CSS + '.bak_mutvis';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/* 必须把 background/border-color/box-shadow 全部抹成与基类 .lvc 完全一致的值，
 * 否则仍会残留差异、闸门照样 PASS —— 那这个变异就证明不了任何东西
 * （首版正是漏了 box-shadow 而误判"闸门不可信"）。 */
const KILL = `
/* MUTATION-TEST-INJECT */
.lvc.cur{ background:var(--v2) !important; border-color:var(--ln) !important;
  box-shadow:none !important; }
`;

function run() {
  try {
    const out = execFileSync('node', [path.resolve(__dirname, 'vistate.cjs')],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') };
  }
}

const before = sha(CSS);
fs.copyFileSync(CSS, BAK);
let okAll = true;
try {
  fs.appendFileSync(CSS, KILL);
  const r1 = run();
  const caught = r1.code !== 0 && /lvc\.cur/.test(r1.out);
  console.log((caught ? 'ok' : 'X ') + ' 变异1 注入 !important 抹掉选中态 → vistate ' +
    (caught ? '报 FAIL（抓到）' : '【没抓到，闸门不可信】'));
  if (!caught) { console.log(r1.out.slice(-500)); okAll = false; }

  fs.copyFileSync(BAK, CSS);
  const same = sha(CSS) === before;
  console.log((same ? 'ok' : 'X ') + ' 变异2 还原后 style.css ' + (same ? '字节一致' : '不一致！'));
  if (!same) okAll = false;

  const r2 = run();
  const clean = r2.code === 0 && /PASS 0/.test(r2.out);
  console.log((clean ? 'ok' : 'X ') + ' 变异3 还原后 vistate ' + (clean ? 'PASS 0' : '仍失败'));
  if (!clean) { console.log(r2.out.slice(-500)); okAll = false; }
} finally {
  if (fs.existsSync(BAK)) { try { fs.copyFileSync(BAK, CSS); fs.unlinkSync(BAK); } catch (e) {} }
}

console.log('\n变异测试：' + (okAll ? 'PASS —— vistate 闸门可信' : 'FAIL —— 闸门不可信'));
process.exit(okAll ? 0 : 1);
