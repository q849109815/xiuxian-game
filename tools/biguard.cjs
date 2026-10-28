#!/usr/bin/env node
/**
 * tools/biguard.cjs ——【埋点数据链路】守卫
 *
 * 立规原因（不是凭空加的）：
 *   表37 埋点的「写入玩家存档」一段要求 window.P 已就绪。但 boot() 里的
 *   game_start 在【登录读档之前】就触发 —— window.P 此时为 null，
 *   p._bi 那一段被整个跳过，事件只落进浏览器 localStorage，
 *   而后台「数据埋点」读的是随存档上传的 p._bi。
 *
 *   后果：全服玩家的启动事件一条都上不来，运营漏斗最上面一层是空的。
 *   这与历史上「埋点只存在玩家自己浏览器里 → 后台永远 0 条」是同一条链路上的洞，
 *   那次修了「写进存档」，这次修的是「登录前的那一段没人收」。
 *
 * 用法：node tools/biguard.cjs   （退出码 0=通过，1=失败）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n + (extra ? '  ← ' + extra : '')); } };

const opsSrc = R('js/ops.js');
const mainSrc = R('js/main.js');
/* 剥注释，防止"注释里写了 flushBI"也算通过 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const opsCode = strip(opsSrc);
const mainCode = strip(mainSrc);

/* ---------- 1. 真实执行：登录前埋点必须能被补写进存档 ---------- */
function runReal() {
  const sandbox = {
    window: null, localStorage: null, console,
    Date, JSON, Math, setTimeout, clearTimeout, isFinite, Number, String, Array, Object,
  };
  const store = {};
  sandbox.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const w = {
    EX: { TRACK_EVENTS: [{ id: 'game_start', n: '玩家启动', pr: 'P0' }] },
    localStorage: sandbox.localStorage,
  };
  sandbox.window = w;
  w.window = w;
  /* ops.js 里是裸引用 EX（config.js 挂的全局），沙盒必须同时提供裸全局 */
  sandbox.EX = w.EX;
  vm.createContext(sandbox);
  vm.runInContext(opsSrc, sandbox, { filename: 'ops.js' });

  const OPS = sandbox.window.OPS;
  if (!OPS) return { err: 'OPS 未挂载到 window' };

  /* 阶段一：登录前（window.P 为 null）触发 game_start */
  sandbox.window.P = null;
  OPS.track('game_start', { ver: '1.0' });
  const bufBefore = OPS.trackBuf().length;

  /* 阶段二：登录完成，拿到带 uid 的存档 */
  const p = { uid: 'u_test_001' };
  sandbox.window.P = p;
  const flushed = (typeof OPS.flushBI === 'function') ? OPS.flushBI(p) : -1;

  return {
    bufBefore,
    flushed,
    bi: Array.isArray(p._bi) ? p._bi.slice() : [],
    hasFlush: typeof OPS.flushBI === 'function',
  };
}

const r = runReal();
ok(!r.err, 'B1 ops.js 可真实执行并挂载 OPS', r.err);
ok(r.bufBefore >= 1, 'B2 登录前触发的埋点必须落进本地缓冲', 'localStorage 条数=' + r.bufBefore);
ok(r.hasFlush, 'B3 OPS.flushBI 必须存在（否则登录前事件无人接收）');
ok(r.flushed >= 1, 'B4 flushBI 必须返回非空条数', '返回值=' + r.flushed);
ok(r.bi.length >= 1, 'B5 登录前埋点必须被补写进存档 p._bi', 'p._bi=' + JSON.stringify(r.bi));
ok(r.bi.some((x) => x.ev === 'game_start'), 'B6 补写内容必须包含 game_start 本体', '实际=' + JSON.stringify(r.bi));
ok(r.bi.every((x) => x.ev && x.t && x.pr), 'B7 补写记录字段完整（ev/t/pr）');

/* ---------- 2. 源码层接线：flushBI 必须在 P 赋值之后被调用 ---------- */
const setP = mainCode.indexOf('window.P = p');
const callFlush = mainCode.indexOf('flushBI(');
ok(setP > 0, 'B8 main.js 存在存档赋值点 window.P = p');
ok(callFlush > 0, 'B9 main.js 必须调用 flushBI（剥注释后）');
ok(callFlush > setP && setP > 0, 'B10 flushBI 调用必须位于 window.P = p 之后（顺序错了等于没补）',
  'setP@' + setP + ' flush@' + callFlush);

/* ---------- 3. 存档侧：p._bi 上限仍受控，不得把存档撑爆 ---------- */
const capOk = /_bi\.length\s*>\s*30/.test(opsCode) || /slice\(-30\)/.test(opsCode);
ok(capOk, 'B11 p._bi 必须保留 30 条上限（存档体积治理）');

/* ---------- 4. 不得破坏既有行为：有 P 时仍直接写存档 ---------- */
function runWithP() {
  const store = {};
  const sandbox = {
    Date, JSON, Math, setTimeout, clearTimeout, isFinite, Number, String, Array, Object, console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  };
  const w = { EX: { TRACK_EVENTS: [] }, localStorage: sandbox.localStorage };
  sandbox.window = w; w.window = w;
  sandbox.EX = w.EX;
  vm.createContext(sandbox);
  vm.runInContext(opsSrc, sandbox, { filename: 'ops.js' });
  const p = { uid: 'u2' };
  sandbox.window.P = p;
  sandbox.window.OPS.track('after_login', {});
  return Array.isArray(p._bi) && p._bi.length >= 1;
}
ok(runWithP(), 'B12 登录后（P 就绪）的埋点仍直接写入存档，不被暂存逻辑破坏');

console.log('biguard: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
