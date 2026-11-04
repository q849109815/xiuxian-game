#!/usr/bin/env node
/* ==========================================================================
 * 技能卡文案断言变异验证 mutate_skillcard.cjs
 * 立规原因：抓不住缺陷的断言等于不存在。uxdel 新增的 R7/R8/K2 必须证明
 *   真能抓住「重复标语复活」「有效信息被误删」，而不是在干净仓库上报绿。
 * 防污染：备份只放内存，每组 try/finally + md5 逐字节校验后才进入下一组。
 * 用法： node tools/mutate_skillcard.cjs
 * 退出码：0 全部捕获且无残留 / 1 有未捕获或还原不一致
 * ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const P = (p) => path.join(ROOT, p);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const CASES = [
  { id: 'M1', want: 'R7', desc: '把「学习<技能名>」重复标语塞回技能卡',
    old: '<div class="cl">${kindTxt} · ${s.up}</div>',
    neu: "<div class=\"cl\">${isNew ? '<b style=\"color:var(--c-red-450)\">学习' + s.n + '</b>' : kindTxt} · ${s.up}</div>" },
  { id: 'M2', want: 'R8', desc: '把类型与提升数值一起删掉（删了真看不懂）',
    old: '<div class="cl">${kindTxt} · ${s.up}</div>',
    neu: '<div class="cl"></div>' },
];

let cap = 0, bad = 0;
for (const c of CASES) {
  const src = fs.readFileSync(P('js/ui.js'), 'utf8');
  const before = md5(src);
  if (src.indexOf(c.old) < 0) { console.log(`  × ${c.id} 注入锚点不存在`); bad++; continue; }
  try {
    fs.writeFileSync(P('js/ui.js'), src.replace(c.old, c.neu));
    const r = spawnSync('node', ['tools/uxdel.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const hit = r.status !== 0 && out.indexOf(c.want) >= 0 && /FAIL [1-9]/.test(out);
    console.log(`  ${hit ? '√' : '×'} ${c.id} ${c.desc} → exit=${r.status} ${hit ? '捕获 ' + c.want : '未捕获'}`);
    if (hit) cap++; else bad++;
  } catch (e) { console.log(`  × ${c.id} 异常 ${e.message}`); bad++; }
  finally {
    fs.writeFileSync(P('js/ui.js'), src);
    const after = md5(fs.readFileSync(P('js/ui.js'), 'utf8'));
    if (after !== before) { console.log(`  × ${c.id} 还原不一致（污染）`); bad++; }
  }
}
const r0 = spawnSync('node', ['tools/uxdel.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
const clean = r0.status === 0 && /PASS \d+ \/ FAIL 0/.test(r0.stdout || '');
console.log(`\n[mutate_skillcard] 捕获 ${cap}/${CASES.length}，基线 ${clean ? '绿' : '红'}，残留 ${bad ? '有' : '无'}`);
console.log(clean ? '判据：每条新断言都证明抓得住对应缺陷，还原逐字节一致' : '判据失败：基线未回到全绿');
process.exit(cap === CASES.length && clean && !bad ? 0 : 1);
