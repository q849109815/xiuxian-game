#!/usr/bin/env node
/* ==========================================================================
 * 【发版流程闸门】tools/release.cjs
 *
 * 立项原因（制作人 原话：「这个加入到开发流程里面，不然这样搞几次被投诉死」）：
 *   历史上多次出现「改了代码没升版本号 → 玩家浏览器还吃旧缓存 → 线上表现与
 *   发布内容不一致 → 玩家投诉」。版本号是唯一能强制冲刷全站缓存的开关，
 *   所以「发版必升版本 + 全量冲刷校验」不能靠人记，必须变成闸门。
 *
 * 用法：
 *   node tools/release.cjs check          # 只校验，不改任何东西（随时可跑）
 *   node tools/release.cjs go "变更说明"   # 一键发版：bump → 校验 → 上传 → 复核 → 封存
 *   node tools/release.cjs seal           # 仅封存当前版本为「已发布」（含线上复核）
 *
 * 闸门共 12 条，任一 FAIL 即中止发版（退出码 1）：
 *   R0  污染残留证   —— 真源码内不得残留测试注入物
 *   R1  版本递增证   —— 本次版本必须严格大于上次已发布版本 ★核心★
 *   R2  全站 ?v= 与 config.version 一致
 *   R3  manifest 覆盖 index.html 引用的全部 css/js
 *   R4  manifest 每项 ver == 当前版本
 *   R5  ui.js IMG_V == 当前版本
 *   R6  js 内静态资源引用不得裸写（裸写升版本也刷不掉）
 *   R7  admin/index.html ?v= 同步
 *   R8  语法闸门（待传 js 全部 node --check）
 *   R9  静态闸门
 *   R10 架构守卫
 *   R11 CHANGELOG 已含本次版本条目
 *   （上传后）R12 线上复核一致
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VER_FILE = path.join(__dirname, '.version.json');
const REL_FILE = path.join(__dirname, '.release.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

const R = { pass: [], fail: [] };
const ok = (n, d = '') => { R.pass.push(n); if (d) console.log('  √ ' + n + ' :: ' + d); else console.log('  √ ' + n); };
const bad = (n, d = '') => { R.fail.push(n + (d ? ' :: ' + d : '')); console.log('  X ' + n + (d ? ' :: ' + d : '')); };

function readVer() {
  if (!fs.existsSync(VER_FILE)) return '0.0.0';
  try { return JSON.parse(fs.readFileSync(VER_FILE, 'utf8')).v; } catch (e) { return '0.0.0'; }
}
function readReleased() {
  if (!fs.existsSync(REL_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(REL_FILE, 'utf8')); } catch (e) { return null; }
}
function cmpVer(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map(Number);
  const pb = String(b || '').replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
function run(cmd, tmo = 240000) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: tmo, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* ---------------- 各证 ---------------- */
function cR0() {
  const r = run('node tools/mutsentinel.cjs');
  if (r.code === 0) ok('R0 污染残留证', '真源码无测试注入物');
  else bad('R0 污染残留证', '残留未清，上传会把污染带到生产：' + r.out.slice(-160).replace(/\n/g, ' '));
}
function cR1(cur) {
  const rel = readReleased();
  if (!rel || !rel.v) { ok('R1 版本递增证', '无历史发布记录，V' + cur + ' 作为首发基线'); return; }
  const d = cmpVer(cur, rel.v);
  if (d > 0) ok('R1 版本递增证', 'V' + rel.v + ' → V' + cur + '（已递增，缓存会被强制冲刷）');
  else bad('R1 版本递增证', '当前 V' + cur + ' 未大于已发布 V' + rel.v
    + ' —— 不升版本玩家吃旧缓存，这正是被投诉的成因。请先 node tools/ver.cjs patch "说明"');
}
function cCache() {
  const r = run('node tools/cacheguard.cjs');
  const out = r.out || '';
  const m = out.match(/RESULT:\s*PASS=(\d+)\s+FAIL=(\d+)/);
  const pf = m ? { p: +m[1], f: +m[2] } : null;
  if (r.code === 0 && pf && pf.f === 0) ok('R2~R7 缓存冲刷证', '全站 ?v=/manifest/IMG_V/后台 共 ' + pf.p + ' 项全过');
  else bad('R2~R7 缓存冲刷证', '缓存冲刷不完整（有资源升版本也刷不掉）：' + out.slice(-200).replace(/\n/g, ' '));
}
function cR8() {
  let bads = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    if (!f.endsWith('.js')) continue;
    const r = run('node --check js/' + f, 30000);
    if (r.code !== 0) bads.push(f);
  }
  if (!bads.length) ok('R8 语法闸门', 'js 目录全部通过 node --check');
  else bad('R8 语法闸门', '语法错误：' + bads.join(', ') + ' —— 上传即白屏');
}
function cR9() {
  const r = run('node tools/static.cjs');
  const m = (r.out || '').match(/FAIL\s+(\d+)/);
  if (r.code === 0 && m && +m[1] === 0) ok('R9 静态闸门', 'FAIL 0');
  else bad('R9 静态闸门', (r.out || '').slice(-160).replace(/\n/g, ' '));
}
function cR10() {
  const r = run('node tools/archguard.cjs');
  const m = (r.out || '').match(/FAIL=(\d+)/);
  if (r.code === 0 && m && +m[1] === 0) ok('R10 架构守卫', '0 违规');
  else bad('R10 架构守卫', (r.out || '').slice(-160).replace(/\n/g, ' '));
}
function cR11(cur) {
  if (!fs.existsSync(CHANGELOG)) { bad('R11 CHANGELOG 证', '不存在'); return; }
  const s = fs.readFileSync(CHANGELOG, 'utf8');
  if (s.indexOf('V' + cur) >= 0) ok('R11 CHANGELOG 证', '已含 V' + cur + ' 条目');
  else bad('R11 CHANGELOG 证', '未含 V' + cur + ' 条目 —— 玩家看不到这次改了什么');
}
function cR12() {
  const r = run('python3 tools/synccheck.py', 300000);
  const out = r.out || '';
  const m = out.match(/不一致\s*(\d+)/);
  if (r.code === 0 && m && +m[1] === 0) ok('R12 线上复核证', '全量核对一致 0 差异');
  else bad('R12 线上复核证', '线上与本地仍有差异：' + out.slice(-200).replace(/\n/g, ' '));
}

function checkAll(withOnline) {
  const cur = readVer();
  console.log('=== 发版闸门 · 当前版本 V' + cur + ' ===');
  cR0(); cR1(cur); cCache(); cR8(); cR9(); cR10(); cR11(cur);
  if (withOnline) cR12();
  console.log('==========================================');
  console.log('RESULT: PASS=' + R.pass.length + ' FAIL=' + R.fail.length);
  if (R.fail.length) { console.log('\n[中止] 存在未过项，禁止发布：'); R.fail.forEach(f => console.log('  · ' + f)); }
  return R.fail.length === 0;
}

const mode = (process.argv[2] || 'check').toLowerCase();
const note = process.argv.slice(3).join(' ');

if (mode === 'check') {
  process.exit(checkAll(false) ? 0 : 1);
}

if (mode === 'seal') {
  const cur = readVer();
  if (!checkAll(true)) process.exit(1);
  const rec = { v: cur, at: new Date().toISOString(), note: note || '' };
  fs.writeFileSync(REL_FILE, JSON.stringify(rec, null, 2));
  console.log('\n[封存] 已记录本次发布版本 V' + cur + '，下次发版必须大于它。');
  process.exit(0);
}

/* 发布锁：V1.3.72 事故——网关 502 后命令被重跑一次，版本号被 bump 两次
 * （1.3.71 → 1.3.72 → 1.3.73），CHANGELOG 多出一条，且多出的版本无对应内容。
 * 根因是 bump 不幂等。锁文件让重跑直接中止，改为提示先确认状态。 */
const LOCK = path.join(__dirname, '.releaselock');
function acquireLock() {
  if (fs.existsSync(LOCK)) {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (age < 10 * 60 * 1000) {
      console.log('[中止] 检测到进行中的发版锁（' + Math.round(age / 1000) + ' 秒前创建）。');
      console.log('       这通常是网关超时后命令被重跑导致的 —— 版本号不幂等，重跑会把版本顶上去。');
      console.log('       请先 node tools/release.cjs check 确认当前版本与 CHANGELOG，');
      console.log('       确认无需重跑后执行 rm tools/.releaselock 再发版。');
      process.exit(2);
    }
  }
  fs.writeFileSync(LOCK, JSON.stringify({ at: new Date().toISOString(), pid: process.pid }));
}
function releaseLock() { try { fs.unlinkSync(LOCK); } catch (e) {} }

if (mode === 'go') {
  acquireLock();
  const before = readVer();
  console.log('[1/5] 版本号末尾 +1（强制冲刷全站缓存）');
  const r = run('node tools/ver.cjs patch ' + JSON.stringify(note || '修复与优化'));
  console.log(r.out.trim().split('\n').map(x => '      ' + x).join('\n'));
  const after = readVer();
  if (cmpVer(after, before) <= 0) { console.log('[中止] 版本号未递增，无法保证缓存冲刷'); releaseLock(); process.exit(1); }

  console.log('\n[2/5] 发版前闸门校验');
  if (!checkAll(false)) { releaseLock(); process.exit(1); }

  console.log('\n[3/5] 上传');
  const p = run('python3 tools/push.py push ' + JSON.stringify('V' + after + ' ' + (note || '')), 600000);
  console.log(p.out.trim().split('\n').slice(-12).map(x => '      ' + x).join('\n'));

  console.log('\n[4/5] 线上复核');
  const R2 = { pass: [], fail: [] };
  const saved = R.pass.length; R.pass.length = saved; /* 保留，不清零 */
  const r12 = run('python3 tools/synccheck.py', 300000);
  const mo = (r12.out || '').match(/不一致\s*(\d+)/);
  if (r12.code === 0 && mo && +mo[1] === 0) { console.log('  √ R12 线上复核证 :: 全量核对一致 0 差异'); R.pass.push('R12'); }
  else { console.log('  X R12 线上复核证 :: ' + (r12.out || '').slice(-200).replace(/\n/g, ' ')); R.fail.push('R12'); }

  console.log('\n[5/5] 封存');
  if (R.fail.length) {
    console.log('[中止] 未全部通过，本次不封存版本号（下次仍会从 V' + after + ' 继续递增）');
    releaseLock(); process.exit(1);
  }
  fs.writeFileSync(REL_FILE, JSON.stringify({ v: after, at: new Date().toISOString(), note: note || '' }, null, 2));
  console.log('  √ 已封存 V' + after + '，下次发版必须大于它');
  console.log('\n=== 发版完成 V' + before + ' → V' + after + ' · PASS=' + R.pass.length + ' FAIL=0 ===');
  releaseLock(); process.exit(0);
}

console.log('用法： node tools/release.cjs  check | go "说明" | seal');
