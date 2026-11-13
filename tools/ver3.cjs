/* =========================================================
 * ver3.cjs —— 「云端版本文字三次取样」常驻守卫（进度表固定项）
 * 立规原因：验证结论必须建立在重复取样上。单次取样撞上发布半同步窗口，
 *   会得出「全一致」的假结论；发布流程却据此放行，玩家拿到旧缓存文件。
 * 判据：A1 规范写明铁律 / A2 份数常量>=3 / A3 三份一致判过 /
 *   A4 只取一份必须判失败 / A5 三份不一致必须判失败 /
 *   A6 长度不一致必须判失败 / A7 空快照必须判失败 /
 *   A8 崩溃退出码语义 / A9 看板接入 / A10 上传清单登记 / A11 取样器实跑
 * 退出码：0=全过 / 1=未过 / 2=前提未就绪
 * ========================================================= */
'use strict';
const fs = require('fs'), cp = require('child_process'), path = require('path');
const ROOT = path.join(__dirname, '..');
const cv = require('./cloudver.cjs');
let pass = 0, fail = 0;
const ck = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); ok ? pass++ : fail++; };

try {
  const spec = fs.readFileSync(path.join(ROOT, '发布流程规范.md'), 'utf8');
  ck('A1 规范含三次取样铁律', spec.includes('受控铁律：版本文字必须三次取样'), '');

  ck('A2 取样份数常量 >=3', cv.SAMPLES >= 3, 'SAMPLES=' + cv.SAMPLES);

  const base = cv.collect();
  const clone = o => JSON.parse(JSON.stringify(o));
  const r3 = cv.verify([base, clone(base), clone(base)]);
  ck('A3 三份一致判通过', r3.fail === 0, 'PASS=' + r3.pass + ' FAIL=' + r3.fail);

  const r1 = cv.verify([base]);
  ck('A4 单次取样必须判失败', r1.fail > 0, 'FAIL=' + r1.fail);

  const bad = clone(base);
  const k = Object.keys(bad)[0];
  // 用「同长度、不同内容」的值：若只靠长度判据碰巧报红，会掩盖一致性判据被删。
  // 首版写 '1.3.0'（长度5）导致 M2 变异被 V4 误抓成「已捕获」，实为漏网。
  bad[k] = ['1.3.99'];
  const r2 = cv.verify([base, bad, clone(base)]);
  ck('A5 三次不一致必须判失败', r2.fail > 0, 'FAIL=' + r2.fail);

  const mix = clone(base);
  mix[Object.keys(mix)[0]] = ['1.3.9', '1.3.90'];
  const r4 = cv.verify([mix, clone(mix), clone(mix)]);
  ck('A6 长度不一致必须判失败', r4.fail > 0, 'FAIL=' + r4.fail);

  ck('A7 空快照必须判失败', cv.verify([]).fail > 0, '');

  const src = fs.readFileSync(path.join(__dirname, 'cloudver.cjs'), 'utf8');
  ck('A8 崩溃退出码语义', /process\.exit\(2\)/.test(src), '');

  const dash = fs.readFileSync(path.join(__dirname, 'dash.cjs'), 'utf8');
  ck('A9 进度表接入固定项', /A\('测试','云端版本三次取样'/.test(dash), '');

  const push = fs.readFileSync(path.join(__dirname, 'push.py'), 'utf8');
  ck('A10 上传清单登记新工具',
     /tools\/cloudver\.cjs/.test(push) && /tools\/ver3\.cjs/.test(push) && /tools\/mutate_ver3\.cjs/.test(push), '');

  const r = cp.spawnSync('node', ['tools/cloudver.cjs'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  ck('A11 取样器实跑通过', r.status === 0, 'exit=' + r.status);
} catch (e) {
  console.log('FAIL ver3 CRASH  ' + e.stack);
  fail++;
}
console.log('RESULT: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
