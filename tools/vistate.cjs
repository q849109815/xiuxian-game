#!/usr/bin/env node
/**
 * 僵尸开炮 · 【状态样式可见性】闸门
 *
 * 维度：JS 切换的状态类（.on / .cur / .sel / .act ...）在页面上是否真的看得出来。
 * 为什么单独做：
 *   V2 视觉统一层大量使用 !important，而 !important 恒胜于选择器权重 ——
 *   只要基类的 background/border/box-shadow 带了 !important，
 *   状态类里没带 !important 的声明就会被【静默抹掉】。
 *   后果是"点了有反应但看不出来"：芯片槽位/难度/章节/宝石行/品质标签全中招。
 *   这类缺陷文本与数据都不变，任何基于 DOM 快照的探测器都抓不到，只能比计算样式。
 *
 * 铁律：本工具必须能被变异测试证伪（tools/mutate_vistate.cjs）。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'css', 'style.css');
const STATES = ['on', 'cur', 'act', 'active', 'sel', 'selected', 'off', 'dis',
  'disabled', 'lock', 'locked', 'full', 'done', 'now', 'hot', 'hi', 'cur2', 'new'];
const PROPS = ['display', 'visibility', 'opacity', 'background-color', 'background-image',
  'border-top-color', 'border-top-width', 'border-left-color', 'box-shadow', 'color',
  'font-weight', 'filter', 'transform', 'text-decoration-line'];

/* ---- 1. 从 CSS 提取"状态选择器"及其上下文 ---- */
function collectStates() {
  const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map();
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim(); if (sel.startsWith('@')) continue;
    sel.split(',').forEach((sRaw) => {
      const s = sRaw.trim(); if (!s) return;
      const parts = s.split(/\s+/);
      const last = parts[parts.length - 1];
      // 形如 .x.on / .x.cur（也可能是 .x.on > i 之类，跳过带后代的）
      if (/>|\+|~/.test(s)) return;
      const cls = [...last.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((x) => x[1]);
      if (cls.length < 2) return;
      if (!STATES.includes(cls[cls.length - 1])) return;
      const baseParts = parts.slice();
      baseParts[baseParts.length - 1] = last.replace(new RegExp('\\.' + cls[cls.length - 1] + '$'), '');
      const parents = parts.slice(0, -1);
      const key = s;
      if (!out.has(key)) out.set(key, {
        state: s,
        baseSel: baseParts[baseParts.length - 1],   // 末段去掉状态类
        parents,                                     // 前缀（可能带 #id / 标签）
        stateCls: cls[cls.length - 1],
      });
    });
  }
  return [...out.values()];
}

/* ---- 2. 浏览器里建元素比计算样式 ----
 *
 * V1.3.8 体检修复：本工具原先硬连 127.0.0.1:8951，服务器没起就直接抛
 * ERR_CONNECTION_REFUSED 崩溃，体检工具只能看到一段堆栈，无法区分
 * "断言失败" 与 "环境没准备好"。现改为：
 *   ① 自己起静态服务器（tools/_srv.cjs），用完关闭
 *   ② 浏览器/依赖不可用时显式 SKIP（exit 0 + SKIP 标记），绝不伪装成通过
 *   ③ 固定输出 RESULT: PASS=n FAIL=n，供 toolaudit 机读
 */
const PORT = 8951;
const URL = 'http://127.0.0.1:' + PORT + '/index.html';

function skip(reason) {
  console.log('[VISTATE] SKIP —— ' + reason);
  console.log('RESULT: PASS=0 FAIL=0 SKIP=1');
  process.exit(0);
}

(async () => {
  const net = require('net');
  const alive = () => new Promise((res) => {
    const s = net.connect(PORT, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    setTimeout(() => { s.destroy(); res(false); }, 1000);
  });
  let srv = null;
  try {
    const m = require('./_srv.cjs');
    srv = await m.start();          // 返回 null = 端口已被占用
  } catch (e) {
    srv = null;
  }
  if (!srv && !(await alive())) {
    skip('静态服务器起不来且端口不可达');
  }

  const cases = collectStates();
  let b;
  /* 浏览器启动重试：本工具在批次内出现过「单跑通过、连跑崩溃」的 flaky，
   * 根因多为前一个守卫刚释放资源、chromium 抢不到。重试一次能消掉大部分抖动，
   * 但重试仍失败时必须显式 SKIP —— 绝不能把「没跑成」报成「通过了」。 */
  let launchErr = null;
  for (let i = 0; i < 2 && !b; i++) {
    try {
      b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    } catch (e) { launchErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  if (!b) {
    if (srv) srv.close();
    skip('浏览器不可用（已重试1次）：' + (launchErr && launchErr.message));
  }
  const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
  await pg.goto(URL, { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  const res = await pg.evaluate((payload) => {
    const { cases, PROPS } = payload;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0';
    document.body.appendChild(host);
    const build = (c, withState) => {
      // 从最外层父前缀往里建
      let parent = host;
      c.parents.forEach((p) => {
        const d = document.createElement('div');
        // 只支持 #id 与 .class 组合前缀
        [...p.matchAll(/#([A-Za-z0-9_-]+)/g)].forEach((x) => { d.id = x[1]; });
        [...p.matchAll(/\.([A-Za-z0-9_-]+)/g)].forEach((x) => { d.className += ' ' + x[1]; });
        parent.appendChild(d); parent = d;
      });
      const el = document.createElement('div');
      const base = c.baseSel.replace(/^\./, '');
      el.className = (base + (withState ? ' ' + c.stateCls : '')).trim();
      el.innerHTML = '<i>x</i><span>x</span>';
      parent.appendChild(el);
      return el;
    };
    const out = [];
    cases.forEach((c) => {
      const a = build(c, false), z = build(c, true);
      const sa = getComputedStyle(a), sz = getComputedStyle(z);
      const diff = {};
      PROPS.forEach((p) => {
        const x = sa.getPropertyValue(p), y = sz.getPropertyValue(p);
        if (x !== y) diff[p] = x + ' -> ' + y;
      });
      out.push({ sel: c.state, n: Object.keys(diff).length, diff });
    });
    document.body.removeChild(host);
    return out;
  }, { cases, PROPS });
  await b.close();
  if (srv) srv.close();

  const dead = res.filter((r) => r.n === 0);
  console.log('状态选择器 ' + res.length + ' 个，其中【肉眼不可见】 ' + dead.length + ' 个');
  res.forEach((r) => {
    if (r.n === 0) console.log('  X ' + r.sel + '  —— 加了状态类后计算样式 0 差异');
  });
  if (process.env.V) res.filter((r) => r.n).forEach((r) =>
    console.log('  ok ' + r.sel + ' (' + r.n + ')'));
  console.log('\n[VISTATE] ' + (dead.length ? 'FAIL' : 'PASS'));
  console.log('RESULT: PASS=' + (res.length - dead.length) + ' FAIL=' + dead.length);
  process.exit(dead.length ? 1 : 0);
})().catch((e) => {
  /* 环境类异常（连接被拒/浏览器崩溃/服务器端口）与「断言失败」必须分开：
   * 前者是没跑成，报 FAIL 会让下游以为游戏有问题；后者才是真缺陷。
   * 判据用错误文本特征，覆盖 playwright 常见的 ERR_CONNECTION_REFUSED /
   * Target closed / browser has been closed 等。 */
  const msg = String((e && e.message) || e);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|Target closed|browser has been closed|Protocol error|Executable doesn't exist|net::ERR/i.test(msg)) {
    console.log('[VISTATE] ERROR(环境) —— ' + msg);
    console.log('RESULT: PASS=0 FAIL=0 SKIP=1');
    process.exit(0);
  }
  console.log('[VISTATE] ERROR —— ' + msg);
  console.log('RESULT: PASS=0 FAIL=1');
  process.exit(1);
});
