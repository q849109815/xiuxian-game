#!/usr/bin/env node
/**
 * 验证：多端冲突弹窗修复
 *  A 正常单设备连续保存 —— 不得误弹冲突窗（否则玩家被烦死）
 *  B 落后端保存 —— 必须弹出明确选择窗（而非静默失败）
 *  C 选「仍用本机继续」—— 窗关闭，之后降级为节流 toast
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n + (d ? ' :: ' + d : '')); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };
const UID = 'ZZ_ASK';

const P = pg => pg.evaluate(() => {
  const t = (window.UI && UI.P) || window.P || {};
  return { gold: t.gold };
});
const login = async (pg) => {
  await pg.evaluate(async (u) => {
    localStorage.setItem('zb_uid', u);
    try { await window.MAIN.login('冲突弹窗', '男'); } catch (e) {}
  }, UID);
  await pg.waitForTimeout(2500);
  /* 公告/新版本/维护三个全屏遮罩会挡住面板弹窗，测试前先收起 */
  await pg.evaluate(() => {
    try { const m = document.getElementById('maintMask'); if (m) m.style.display = 'none'; } catch (e) {}
    try { if (window.UI) UI._maskQ = []; } catch (e) {}
  });
};
const add = (pg, g) => pg.evaluate((x) => {
  const t = (window.UI && UI.P) || window.P;
  try { window.E.grant(t, { gold: x }); } catch (e) {}
}, g);
const save = async (pg) => {
  await pg.evaluate(async () => { try { await window.MAIN.save(); } catch (e) {} });
  await pg.waitForTimeout(3200);
};
const dismissMask = pg => pg.evaluate(() => {
  try { const m = document.getElementById('maintMask'); if (m) m.style.display = 'none'; } catch (e) {}
  try { if (window.UI) UI._maskQ = []; } catch (e) {}
});
const askVisible = pg => pg.evaluate(() => {
  const b = document.getElementById('sweepBox');
  if (!b || !b.classList.contains('on')) return null;
  const t = b.querySelector('.pn-hd b');
  const m = b.querySelector('.ask-msg');
  const y = b.querySelector('#askYes');
  const n = b.querySelector('#askNo');
  return { title: t ? t.textContent : '', msg: m ? m.textContent : '', yes: y ? y.textContent : '', no: n ? n.textContent : '' };
});

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const mk = async () => {
    const c = await b.newContext({ viewport: { width: 393, height: 852 } });
    const p = await c.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    return p;
  };

  console.log('\n=== A 单设备连续保存，不得误弹冲突窗 ===');
  const A = await mk(); await login(A); await save(A);
  let falsePos = 0;
  for (let i = 0; i < 5; i++) {
    await add(A, 10);
    await save(A);
    const v = await askVisible(A);
    if (v && /进度冲突/.test(v.title)) { falsePos++; console.log('  第' + (i + 1) + '次误弹:', v.title); }
  }
  console.log('  误弹次数:', falsePos);
  if (falsePos === 0) ok('A1 单设备连续保存无误报弹窗');
  else bad('A1 单设备误报冲突弹窗', falsePos + ' 次');

  console.log('\n=== B 落后端保存，应弹明确选择窗 ===');
  // 新设备 B 读到云端最新，然后让 A（旧 rev）先写，制造 B 落后
  const B = await mk(); await login(B);
  const pb0 = await P(B);
  console.log('  B 读到:', JSON.stringify(pb0));
  // A 端先推进云端
  await add(A, 1000); await save(A);
  const pa = await P(A);
  console.log('  A 推进到:', JSON.stringify(pa));
  // B 端（rev 落后）加币保存 → 应 stale
  await add(B, 400);
  await B.evaluate(async () => { try { await window.MAIN.save(); } catch (e) {} });
  await B.waitForTimeout(3000);
  const box = await askVisible(B);
  await dismissMask(B);
  console.log('  B 弹窗:', JSON.stringify(box));
  if (box && /进度冲突/.test(box.title)) ok('B1 落后端弹出冲突选择窗', box.title);
  else bad('B1 落后端未弹冲突窗', JSON.stringify(box));
  if (box && box.yes && box.no) ok('B2 提供两个明确选项', box.yes + ' / ' + box.no);
  else bad('B2 选项缺失', JSON.stringify(box));

  console.log('\n=== C 选「仍用本机继续」后应关闭，不阻塞 ===');
  if (box) {
    await dismissMask(B);
    await B.waitForTimeout(300);
    await B.click('#askNo');
    await B.waitForTimeout(800);
    const after = await askVisible(B);
    if (!after) ok('C1 选择后弹窗关闭'); else bad('C1 弹窗未关闭');
    // 继续保存应降级为 toast，不再弹窗打断
    await add(B, 200);
    await B.evaluate(async () => { try { await window.MAIN.save(); } catch (e) {} });
    await B.waitForTimeout(3000);
    const again = await askVisible(B);
    if (!again) ok('C2 后续保存不再重复弹窗（降级为提示）');
    else bad('C2 后续仍重复弹窗');
  } else {
    bad('C 无弹窗可测');
  }

  console.log('\n===== 结果 =====');
  console.log(`PASS ${R.pass.length} / FAIL ${R.fail.length}`);
  R.fail.forEach(f => console.log('  FAIL: ' + f));
  await b.close();
  process.exit(R.fail.length ? 1 : 0);
})();
