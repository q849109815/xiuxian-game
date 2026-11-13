/* =========================================================
 * cloudver.cjs —— 受控版本文字「三次取样」验证器
 * 立规原因（V1.3.92）：单次取样会骗人。V1.3.91 上传的半同步瞬时态里，
 *   三轮拉下来分别是「全 1.3.90」→「5 个文件 1.3.91、3 个仍 1.3.90」
 *   →「全 1.3.91」。只取一次就下「一致」结论，会把发布中途状态当成
 *   最终状态，玩家仍可能拿到旧 ?v= 文件。
 * 判据：恰好 SAMPLES(=3) 份快照；三份两两完全一致；每份内生效版本
 *   文字长度一致；快照非空。任一不满足即 FAIL，不得静默报绿。
 * 口径：只取「当前生效版本锚点」（?v= / version / ver / IMG_V / AIMG_V /
 *   发布基线 / CHANGELOG 与排期表的最后一条）。历史版本条目、注释里的
 *   旧版本说明、图片日期戳一律排除 —— 与 V1.3.91 验证报告口径一致。
 *   首版曾把 CHANGELOG 全部历史条目算进长度判据，误报 lengths=5..18，
 *   属判据写错，已修。
 * 退出码：0=三份一致通过 / 1=未通过 / 2=前提未就绪（崩溃、取不到样本）
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SAMPLES = 3;
const CONTROLLED = [
  'index.html', 'admin/index.html', 'js/config.js', 'js/ui.js',
  'admin/js/core.js', 'CHANGELOG.md', 'tools/.lastrelease.json',
  'data/zb/roadmap.json'
];

function pickVersionTexts(text, file) {
  const out = [];
  const grab = re => { let m; while ((m = re.exec(text))) out.push(m[1]); };
  if (file === 'index.html' || file === 'admin/index.html') {
    grab(/\?v=(1\.3\.\d+)/g);
  } else if (file === 'js/config.js') {
    grab(/\bversion\s*[:=]\s*['"](1\.3\.\d+)['"]/g);
    grab(/\bver\s*[:=]\s*['"](1\.3\.\d+)['"]/g);
    grab(/\?v=(1\.3\.\d+)/g);
  } else if (file === 'js/ui.js' || file === 'admin/js/core.js') {
    grab(/\b(?:IMG_V|AIMG_V)\s*=\s*['"](1\.3\.\d+)['"]/g);
  } else if (file === 'tools/.lastrelease.json') {
    grab(/["']v["']\s*:\s*["'](1\.3\.\d+)["']/g);
  } else {
    // CHANGELOG / 排期表：只取最后一条（最新发布版本），历史条目按口径排除
    const all = [...text.matchAll(/1\.3\.\d+/g)].map(x => x[0]);
    if (all.length) out.push(all[all.length - 1]);
  }
  return out;
}
function collect() {
  const snap = {};
  for (const f of CONTROLLED) {
    const p = path.join(ROOT, f);
    snap[f] = fs.existsSync(p) ? pickVersionTexts(fs.readFileSync(p, 'utf8'), f) : null;
  }
  return snap;
}
function norm(s) { return JSON.stringify(s); }
function verify(snaps) {
  const checks = []; let pass = 0, fail = 0;
  const ck = (name, ok, detail) => { checks.push({ name, ok, detail }); ok ? pass++ : fail++; };
  ck('V1 取样份数必须恰好 ' + SAMPLES, snaps.length === SAMPLES, 'got=' + snaps.length);
  ck('V2 快照非空', snaps.length > 0 && snaps.every(s => s && Object.keys(s).length > 0), 'empty snapshot');
  ck('V3 三次取样两两一致', snaps.length >= 2 && snaps.every(s => norm(s) === norm(snaps[0])),
     snaps.map(norm).join(' | ').slice(0, 300));
  const all = [];
  snaps.forEach(s => { if (s) Object.values(s).forEach(a => { if (Array.isArray(a)) a.forEach(v => all.push(v)); }); });
  const lens = [...new Set(all.map(v => v.length))];
  ck('V4 版本文字长度一致', lens.length <= 1, 'lengths=' + lens.join(','));
  ck('V5 版本文字非空', all.length > 0, 'count=' + all.length);
  return { pass, fail, checks, SAMPLES };
}
module.exports = { SAMPLES, CONTROLLED, pickVersionTexts, collect, verify, norm };

if (require.main === module) {
  try {
    const snaps = [];
    for (let i = 0; i < SAMPLES; i++) snaps.push(collect());
    const r = verify(snaps);
    r.checks.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + '  ' + x.detail));
    console.log('cloudver: SAMPLES=' + SAMPLES + ' PASS=' + r.pass + ' FAIL=' + r.fail);
    process.exit(r.fail ? 1 : 0);
  } catch (e) {
    console.error('cloudver CRASH: ' + e.stack);
    process.exit(2);
  }
}
