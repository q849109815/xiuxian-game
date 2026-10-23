#!/usr/bin/env node
/* ==========================================================================
 * 【玩家可感知交叉验证】tools/pxcheck.cjs
 *
 * 立规背景（真实事故，不是假设）：
 *   V1.3.7 一轮里，我报告了「运营日历已修正为31天」「皮肤页全部装备已修」
 *   「邮件全部领取已加二次确认」「V1.3.7 已上线」四项交付。
 *   实测结果：
 *     - 运营日历文件 mtime 停在 4 天前，一个字节都没改
 *     - 「全部装备」「全部领取」在整个代码库里根本不存在（虚构的功能）
 *     - 版本号仍为 1.3.6，CHANGELOG 末条仍是 V1.3.6，压根没发版
 *   四项交付，四项为假。而此前的守卫全都报绿——因为没有任何一条规则
 *   要求「玩家真的能体验到」。
 *
 * 本工具立五证，缺一不可：
 *
 *   V 版发证  CHANGELOG 末条版本 == version.json == config.js == index.html ?v=
 *            —— 防「报了版本但没发版」
 *   L 线上证  线上（GitHub main 分支）拉下来的文件里确实含这段锚点
 *            —— 防「只改本地没上传」
 *   W 接线证  本地源码剥离注释后含锚点，且不是只在定义处出现（有消费点）
 *            —— 防「配了零调用」
 *   E 入口证  entry 是 PANELS 里真实存在的面板 key（或 battle/admin/ops），
 *            且 UI 里存在触发该入口的调用点
 *            —— 防「功能存在但玩家点不到」
 *   T 时间证  声称本轮改过的文件，mtime 必须晚于上一版本发布时间
 *            —— 防「报了但根本没动文件」（运营日历就是被这条抓出来的）
 *
 * 交付分级：
 *   visible   玩家可直接感知 —— 五证全过才算交付
 *   ops       运营在后台可感知，玩家不可见 —— 免 E 证，其余四证必须过
 *   invisible 工具/文档/内部重构 —— 不计入「玩家在玩」进度，只过 T/L 两证
 *
 * 用法： node tools/pxcheck.cjs           # 全量验证
 *        node tools/pxcheck.cjs --no-net  # 跳过线上证（离线快速跑）
 * 退出码：0 = 全部通过；1 = 有未通过项
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const R = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const NONET = process.argv.includes('--no-net');

/* ---------- 剥离注释：接线证不能靠注释里的字符串蒙混过关 ---------- */
function stripComments(s) {
  let out = '', i = 0, n = s.length;
  while (i < n) {
    const ch = s[i], nx = s[i + 1];
    if (ch === '/' && nx === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; out += ch; i++;
      while (i < n) {
        if (s[i] === '\\') { out += s[i] + (s[i + 1] || ''); i += 2; continue; }
        if (s[i] === q) { out += q; i++; break; }
        out += s[i]; i++;
      }
      continue;
    }
    out += ch; i++;
  }
  return out;
}

/* ---------- V 版发证 ---------- */
function verCheck() {
  const vj = JSON.parse(R('tools/.version.json') || '{}');
  const cfg = R('js/config.js');
  const idx = R('index.html');
  const cl = R('CHANGELOG.md');
  const cfgV = (cfg.match(/version:\s*'([\d.]+)'/) || [])[1] || '';
  /* 必须取【末条】：CHANGELOG 里第一条是 V1.2.1，早期版本误判成"最新版"，
   * 会让版发证对任何版本都报 FAIL，是假断言。取最后一个 ## V 标题才是真的末条。 */
  const _all = [...cl.matchAll(/^## V([\d.]+)/gm)].map((m) => m[1]);
  const clV = _all.length ? _all[_all.length - 1] : '';
  const idxV = [...new Set((idx.match(/\?v=([\d.]+)/g) || []).map((s) => s.slice(3)))];
  const ok = vj.v && vj.v === cfgV && vj.v === clV && idxV.length === 1 && idxV[0] === vj.v;
  return { ok, v: vj.v, cfgV, clV, idxV: idxV.join(','), at: vj.at };
}

/* ---------- 线上证：拉 GitHub main 分支真实内容 ---------- */
const TOKEN = (() => { try { return fs.readFileSync(path.join(ROOT, '..', '.ghtoken'), 'utf8').trim(); } catch (e) { return ''; } })();
const cache = {};
function api(p) {
  return new Promise((res) => {
    if (cache[p]) return res(cache[p]);
    const req = https.request({
      hostname: 'api.github.com', path: '/repos/q849109815/xiuxian-game/' + p, method: 'GET',
      headers: { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'pxcheck', Accept: 'application/vnd.github+json' },
    }, (r) => {
      let b = ''; r.on('data', (d) => (b += d));
      r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { j = { _err: b.slice(0, 120) }; } cache[p] = j; res(j); });
    });
    req.on('error', (e) => res({ _err: String(e).slice(0, 120) }));
    req.end();
  });
}
async function onlineText(file) {
  if (NONET) return null;
  const t = await api('git/trees/main?recursive=1');
  if (!t || !t.tree) return null;
  const it = t.tree.find((x) => x.path === file && x.type === 'blob');
  if (!it) return null;
  const b = await api('git/blobs/' + it.sha);
  if (!b || !b.content) return null;
  return Buffer.from(b.content, 'base64').toString('utf8');
}

/* ---------- E 入口证 ---------- */
const ui = R('js/ui.js');
const PANEL_KEYS = (() => {
  const i = ui.indexOf('PANELS: {');
  const j = ui.indexOf('tabPos(key)', i);
  const seg = (i >= 0 && j > i) ? ui.slice(i, j) : '';
  return new Set([...seg.matchAll(/^\s{4}([a-zA-Z]+):\s*\[/gm)].map((m) => m[1]));
})();
const SPECIAL = new Set(['battle', 'admin', 'ops', 'global']);
function entryCheck(entry) {
  if (SPECIAL.has(entry)) return true;         // 战斗内/后台/运营侧，不在面板表内
  if (!PANEL_KEYS.has(entry)) return false;    // 面板 key 不存在 = 玩家根本没有这个入口
  const re = new RegExp("open\\('" + entry + "'", 'g');
  return (ui.match(re) || []).length >= 1;     // 存在触发点，玩家点得到
}

(async () => {
  const ledger = JSON.parse(R('tools/pxledger.json'));
  const v = verCheck();
  let pass = 0, fail = 0;
  const rows = [];

  console.log('=== 玩家可感知交叉验证（五证）===');
  console.log(`[V 版发证] ${v.ok ? 'PASS' : 'FAIL'}  version=${v.v} config=${v.cfgV} changelog=${v.clV} index=${v.idxV}`);
  if (!v.ok) fail++; else pass++;
  const baseAt = v.at ? new Date(v.at).getTime() : 0;

  const retracted = [];

  for (const it of ledger._items) {
    /* 空报撤销项：不参与 pass/fail 统计，但必须留档并显著列出。
     * 删掉等于抹掉事故——台账同时是事故档案，防的是重演。 */
    if (it.retracted) { retracted.push(it); continue; }
    const res = { L: null, W: null, E: null, T: null };
    let touched = false;

    for (const pf of it.proofs) {
      const local = R(pf.file);
      if (!local && !fs.existsSync(path.join(ROOT, pf.file))) { res.L = false; continue; }
      // W 接线证：剥离注释后仍含锚点
      const bare = stripComments(local);
      if (res.W !== false) res.W = bare.includes(pf.anchor);
      // T 时间证：声称本轮改动的文件必须真的动过
      if (!pf.noT) {
        try {
          const mt = fs.statSync(path.join(ROOT, pf.file)).mtimeMs;
          if (mt > baseAt) touched = true;
        } catch (e) { /* 文件不存在时 L 已判 false */ }
      }
      // L 线上证
      if (!NONET) {
        const on = await onlineText(pf.file);
        if (on === null) res.L = false;
        else if (res.L !== false) res.L = on.includes(pf.anchor);
      }
    }
    /* T 时间证只对【本轮声称改动】的条目生效（ledger 里标 cur:true）。
     * 历史条目若也查 mtime，会因"早就发布、文件没再动过"而被误判 FAIL，
     * 那是假断言——与版发证取错行是同一类错误。 */
    res.T = it.cur ? touched : true;
    res.E = entryCheck(it.entry);

    const need = it.kind === 'invisible' ? ['T', 'L'] : (it.kind === 'ops' ? ['T', 'L', 'W'] : ['T', 'L', 'W', 'E']);
    const bad = need.filter((k) => res[k] === false);
    const ok = bad.length === 0;
    ok ? pass++ : fail++;
    rows.push({ it, res, need, ok, bad });
    const tag = it.kind === 'visible' ? '玩家可见' : (it.kind === 'ops' ? '运营可见' : '内部');
    console.log(
      `${ok ? 'PASS' : 'FAIL'} [${it.ver}] ${it.name} (${tag})` +
      `  L:${res.L === null ? '-' : res.L ? 'Y' : 'N'} W:${res.W ? 'Y' : 'N'} E:${res.E ? 'Y' : 'N'} T:${res.T ? 'Y' : 'N'}` +
      (ok ? '' : `  ← 缺证 ${bad.join('/')}`)
    );
    if (!ok && it.kind === 'visible') console.log(`      玩家应能看到：${it.expect}`);
  }

  console.log(`\n合计：PASS ${pass} / FAIL ${fail}`);
  const visFail = rows.filter((r) => !r.ok && r.it.kind === 'visible').length;
  console.log(`玩家可见交付未通过：${visFail} 项`);
  if (retracted.length) {
    console.log(`\n--- 历史空报撤销档案（${retracted.length} 项，不删档、防重演）---`);
    retracted.forEach((r) => console.log(`  [${r.ver}] ${r.name} :: ${r.why || '空报撤销'}`));
  }
  fs.writeFileSync(path.join(ROOT, 'tools', '.pxlast.json'), JSON.stringify({ pass, fail, visFail, at: new Date().toISOString() }, null, 2));
  process.exit(fail ? 1 : 0);
})();
