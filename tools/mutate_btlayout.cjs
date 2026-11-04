#!/usr/bin/env node
/**
 * btlayout 变异验证 —— 证明守卫抓得住真缺陷，且不会把真缺陷洗成「前提未就绪」
 *
 * 铁律：抓不住缺陷的断言等于不存在。
 * V1.3.75 补充立规：本轮把 B5/B7 的「量不到盒子」归为 PREREQ 后，
 * 必须证明【真越界仍然 FAIL（exit=1）】，绝不能靠前提归类把缺陷吞掉。
 *
 * 用例：
 *   M1/M2 B8 震屏 save/restore 不配对（历史 P0 事故本源）
 *   M3    B7 防线落在可视区外（真缺陷，不得被判 PREREQ）
 *   M4    B5 技能栏塞满真溢出（真缺陷，不得被判 PREREQ）
 *
 * 判据：输出必须【点名对应断言 + FAIL>=1 + PREREQ=0 + exit=1】。
 *   崩溃或「前提未就绪 exit=2」一律不算捕获。
 * 防污染：备份只放内存，每组 finally 还原并 md5 逐字节校验。
 * 用法：node tools/mutate_btlayout.cjs
 * 退出码：0 全部捕获且无残留 / 1 有未捕获或还原不一致
 */
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const P = (f) => path.join(ROOT, f);

const M = [
  {
    n: 'M1 注入 save/restore 不配对（事故本源）', f: 'js/battle.js', want: /X B8/,
    mut: (s) => s.replace('if (_shk || _jsh) c.restore();', 'if (_shk) c.restore();'),
  },
  {
    n: 'M2 注入 完全不 restore', f: 'js/battle.js', want: /X B8/,
    mut: (s) => s.replace('if (_shk || _jsh) c.restore();', '/* no restore */'),
  },
  {
    n: 'M3 注入 B7 防线出屏（真缺陷不得洗成 PREREQ）', f: 'js/battle.js', want: /X B7/,
    mut: (s) => s.replace('this.wallY = this.H - 96;', 'this.wallY = this.H + 400;'),
  },
  {
    /* 第一版改 638 行 .bt-skills .bs{width:40px} 守卫仍报绿 —— 不是守卫失效：
     * css/style.css 里同名选择器有 4 处定义（540/638/791 等），后面的规则覆盖了我改的那处。
     * 变异改错位置是本项目复发项，改用 id + !important 追加到末尾才真正制造溢出。 */
    n: 'M4 注入 B5 技能栏真溢出（真缺陷不得洗成 PREREQ）', f: 'css/style.css', want: /X B5/,
    mut: (s) => s + '\n/*MUT*/ #btSkills .bs{width:300px !important;flex:0 0 300px !important}\n',
  },
];

let captured = 0, dirty = 0;
for (const c of M) {
  const fp = P(c.f);
  const orig = fs.readFileSync(fp, 'utf8');
  const h0 = md5(orig);
  const bad = c.mut(orig);
  if (!bad || bad === orig) {
    console.log('  × ' + c.n + ' :: 变异锚点未命中'); dirty++; continue;
  }
  let verdict = '未捕获';
  try {
    fs.writeFileSync(fp, bad);
    const r = cp.spawnSync('node', ['tools/btlayout.cjs', '360x640'],
      { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    const out = String(r.stdout || '') + String(r.stderr || '');
    const named = c.want.test(out);
    const realFail = /FAIL [1-9]/.test(out) && /PREREQ 0/.test(out) && r.status === 1;
    if (named && realFail) { captured++; verdict = '捕获✓（点名断言 + FAIL + exit=1）'; }
    else if (named && !realFail) verdict = '点名了但被判前提/未报红 ✗';
    else if (realFail) verdict = '报红但未点名目标断言 ✗';
    else verdict = '守卫仍报绿 ✗';
  } catch (e) {
    verdict = '执行异常：' + e.message;
  } finally {
    fs.writeFileSync(fp, orig);
    if (md5(fs.readFileSync(fp, 'utf8')) !== h0) { dirty++; console.log('  × ' + c.n + ' 还原不一致'); }
  }
  console.log('  ' + (verdict.startsWith('捕获') ? '√' : '×') + ' ' + c.n + ' → ' + verdict);
}

const base = cp.spawnSync('node', ['tools/btlayout.cjs', '360x640'],
  { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
const baseOut = String(base.stdout || '');
const baseOk = base.status === 0 && /FAIL 0/.test(baseOut);
console.log('\n[mutate_btlayout] 本轮验证 ' + M.length + ' 条，捕获 ' + captured + '/' + M.length +
  '；还原校验 ' + (dirty ? 'FAIL ' + dirty : 'PASS') + '；基线 ' + (baseOk ? 'PASS' : 'FAIL'));
process.exit(captured === M.length && dirty === 0 && baseOk ? 0 : 1);
