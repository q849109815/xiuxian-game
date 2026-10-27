#!/usr/bin/env node
/**
 * 多端写入冲突 —— 深挖"分叉之后会怎样"
 * 上一轮实测：一端保存后云端 3200，另一端本地仍显示 2900（分叉）。
 * 本脚本追查分叉的后果：
 *   1. 被判 stale 的一方，界面有没有提示？（玩家是否知情）
 *   2. 该方【继续玩再保存】，会不会把云端 3200 覆盖成自己的旧值 = 真回档？
 *   3. 该方刷新重登，数据是否恢复到云端最新（自愈）？
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8951/index.html';
const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n + (d ? ' :: ' + d : '')); console.log('  OK ' + n + (d ? ' :: ' + d : '')); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  XX ' + n + (d ? ' :: ' + d : '')); };
const UID = 'ZZ_FORK';

const P = pg => pg.evaluate(() => {
  const t = (window.UI && UI.P) || window.P || {};
  return { gold: t.gold, dia: t.diamond, lv: t.lv };
});
const login = async (pg) => {
  await pg.evaluate(async (u) => {
    localStorage.setItem('zb_uid', u);
    try { await window.MAIN.login('分叉测试', '男'); } catch (e) {}
  }, UID);
  await pg.waitForTimeout(2500);
};
const add = (pg, g) => pg.evaluate((x) => {
  const t = (window.UI && UI.P) || window.P;
  try { window.E.grant(t, { gold: x }); } catch (e) {}
}, g);
// 捕获保存时弹出的提示
const saveAndCatch = async (pg) => {
  const r = await pg.evaluate(async () => {
    const seen = [];
    const ot = window.UI && UI.toast;
    if (ot) window.UI.toast = function (m, k) { seen.push(String(m)); return ot.apply(this, arguments); };
    const oa = window.alert; window.alert = function (m) { seen.push('alert:' + String(m)); };
    let err = null;
    try { await window.MAIN.save(); } catch (e) { err = String(e).slice(0, 120); }
    window.alert = oa;
    if (ot) window.UI.toast = ot;
    return { seen, err };
  });
  await pg.waitForTimeout(3500);
  return r;
};

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

  console.log('\n=== 建立基线 ===');
  const A = await mk(); await login(A); await saveAndCatch(A);
  const base = await P(A);
  console.log('  基线:', JSON.stringify(base));

  console.log('\n=== 制造分叉 ===');
  // A 加 1000 保存（先写，云端 = base+1000）
  await add(A, 1000);
  const ra = await saveAndCatch(A);
  const pa = await P(A);
  console.log('  A 加1000保存:', JSON.stringify(pa), '提示:', JSON.stringify(ra.seen));

  // B 新设备，读到的是 base（旧），加 400 后保存（后写，云端已是 base+1000）
  const B = await mk(); await login(B);
  const pb0 = await P(B);
  console.log('  B 读到:', JSON.stringify(pb0));
  await add(B, 400);
  const rb = await saveAndCatch(B);
  const pb1 = await P(B);
  console.log('  B 加400保存:', JSON.stringify(pb1));
  console.log('  B 保存提示:', JSON.stringify(rb.seen), 'err:', rb.err);

  // 云端真实值
  const C = await mk(); await login(C);
  const cloud = await P(C);
  console.log('  云端真实:', JSON.stringify(cloud));

  const hasTip = (rb.seen || []).some(s => /更新|冲突|其他设备|新进度|覆盖|失败/i.test(s));
  if (hasTip) ok('1 落后端保存时有冲突提示', (rb.seen || []).join(' / ').slice(0, 90));
  else bad('1 落后端保存时无任何提示', '提示=' + JSON.stringify(rb.seen));

  const lost = cloud.gold === base.gold;
  if (lost) bad('2 云端被旧档覆盖（回档）', `${pa.gold} -> ${cloud.gold}`);
  else ok('2 云端未被旧档覆盖', 'cloud=' + cloud.gold);

  console.log('\n=== 分叉后：落后端继续玩再保存 ===');
  // B 继续操作（玩家不知道自己落后），再加 200，再保存
  await add(B, 200);
  const rb2 = await saveAndCatch(B);
  const pb2 = await P(B);
  console.log('  B 再加200保存:', JSON.stringify(pb2), '提示:', JSON.stringify(rb2.seen));
  const D = await mk(); await login(D);
  const cloud2 = await P(D);
  console.log('  云端此时:', JSON.stringify(cloud2));
  if (cloud2.gold < cloud.gold) bad('3 继续保存导致回档！', `${cloud.gold} -> ${cloud2.gold}`);
  else ok('3 继续保存未导致回档', 'cloud=' + cloud2.gold);

  console.log('\n=== 落后端刷新重登是否自愈 ===');
  await B.reload({ waitUntil: 'load' });
  await B.waitForTimeout(1200);
  await login(B);
  const pb3 = await P(B);
  console.log('  B 重登后:', JSON.stringify(pb3), '云端:', cloud2.gold);
  if (pb3.gold === cloud2.gold) ok('4 重登后与云端一致（自愈）');
  else bad('4 重登后仍与云端不一致', `本地${pb3.gold} vs 云端${cloud2.gold}`);

  console.log('\n===== 结果 =====');
  console.log(`PASS ${R.pass.length} / FAIL ${R.fail.length}`);
  R.fail.forEach(f => console.log('  FAIL: ' + f));
  await b.close();
  process.exit(R.fail.length ? 1 : 0);
})();
