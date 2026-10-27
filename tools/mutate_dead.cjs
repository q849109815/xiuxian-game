#!/usr/bin/env node
/**
 * 僵尸开炮 · dead.cjs 的【变异测试】(mutation test)
 *
 * 为什么必须有这个：
 *   闸门/探测器历史上多次"全绿但其实是假的"——要么依赖没装直接崩退出、
 *   要么判据写错把真缺陷当成正常。一条抓不住注入缺陷的断言等于不存在。
 *   上一轮往面板塞了坏按钮却没被抓到，正是这个环节缺失。
 *
 * 做法（外部注入，端到端证明，不依赖 dead.cjs 自身代码）：
 *   1. 往 js/ui.js 的商城面板塞一个【点了完全没反应】的按钮（真死键）
 *   2. 跑 dead.cjs，断言它报出这个死键
 *   3. 还原 ui.js，断言字节一致，再跑一次断言 0 死键
 * 任一步失败 → 探测器不可信，退出码非 0。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const UI = path.resolve(__dirname, '..', 'js', 'ui.js');
const BAK = UI + '.bak_mut';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const ANCHOR = `  r_shop(p, tab) {
    /* 标题直接取 tab`;
const INJECT = `  r_shop(p, tab) {
    if (window.__MUT) return '<div class="card"><div class="card-t">变异</div>' +
      '<button class="btn sm" id="__mutbtn">变异死键</button></div>';
    /* 标题直接取 tab`;

function runDead(env) {
  try {
    const out = execFileSync('node', [path.resolve(__dirname, 'dead.cjs'), '393', 'shop'],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
        env: Object.assign({}, process.env, env || {}) });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') };
  }
}

const before = sha(UI);
fs.copyFileSync(UI, BAK);

let okAll = true;
try {
  /* ---- 步骤 1：注入真死键 ---- */
  let src = fs.readFileSync(UI, 'utf8');
  if (!src.includes(ANCHOR)) { console.log('X 锚点未找到，变异测试无法进行'); process.exit(2); }
  src = src.replace(ANCHOR, INJECT);
  fs.writeFileSync(UI, src);
  // 用 MUT 开关打开注入分支（dead.cjs 的 addInitScript 会设置 window.__MUT）
  if (!fs.readFileSync(UI, 'utf8').includes('__mutbtn')) {
    console.log('X 注入失败'); process.exit(2);
  }

  /* ---- 步骤 2：断言探测器抓得到 ---- */
  const r1 = runDead({ MUT: '1' });
  const caught = /变异死键/.test(r1.out) || r1.code !== 0;
  console.log((caught ? 'ok' : 'X ') + ' 变异1 注入死键 → 探测器' + (caught ? '抓到' : '【没抓到，探测器不可信】'));
  if (!caught) { console.log(r1.out.slice(-600)); okAll = false; }

  /* ---- 步骤 3：还原并断言字节一致 ---- */
  fs.copyFileSync(BAK, UI);
  const after = sha(UI);
  const same = after === before;
  console.log((same ? 'ok' : 'X ') + ' 变异2 还原后 ui.js ' + (same ? '字节一致' : '不一致！'));
  if (!same) okAll = false;

  /* ---- 步骤 4：还原后断言 0 死键 ---- */
  const r2 = runDead({});
  const clean = /死键 0 /.test(r2.out);
  console.log((clean ? 'ok' : 'X ') + ' 变异3 还原后探测器报 ' + (clean ? '死键 0' : '仍有死键'));
  if (!clean) { console.log(r2.out.slice(-600)); okAll = false; }
} finally {
  if (fs.existsSync(BAK)) { try { fs.copyFileSync(BAK, UI); fs.unlinkSync(BAK); } catch (e) {} }
}

console.log('\n变异测试：' + (okAll ? 'PASS —— 探测器可信' : 'FAIL —— 探测器不可信，禁止依据其结论'));
process.exit(okAll ? 0 : 1);
