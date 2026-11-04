#!/usr/bin/env node
/* ==========================================================================
 * uxdel 守卫变异验证 mutate_uxdel.cjs
 *
 * 立规原因：抓不住缺陷的断言等于不存在。uxdel.cjs 是黑名单守卫之外新增的
 *   「视觉替代证」，必须证明它真能抓住六类回退，而不是只会在干净仓库上报绿。
 *
 * 判据：注入缺陷后 uxdel.cjs 必须【非零退出 + 输出对应断言编号的 FAIL】；
 *   仅"工具崩了所以非零"不算捕获 —— 崩溃必须能被区分，否则又是假验证。
 *   每组结束强制还原，md5 逐字节一致才允许进入下一组（防污染扩散）。
 *
 * 用法：node tools/mutate_uxdel.cjs
 * 退出码：0 全部捕获且无残留 ／ 1 有未捕获或还原不一致
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const P = (p) => path.join(ROOT, p);

/* 【防污染】备份只放内存，不落盘 .bak —— 历史上备份源被污染后
 * "恢复"会把污染保护起来。每组 try/finally + md5 双重校验。 */
const CASES = [
  {
    id: 'M1', file: 'js/ui.js', want: 'U1',
    desc: '把已删的排行榜说明加回来（文案复活）',
    old: '暂无排行数据',
    neu: '暂无排行数据，通关后自动上传',
  },
  {
    id: 'M2', file: 'css/style.css', want: 'R2',
    desc: '把 .avp-c.on 高亮色删掉（说明已删但选中态看不出来）',
    old: '.avp-c.on{border-color:var(--q-y2);',
    neu: '.avp-c.on{opacity:1;',
  },
  {
    id: 'M3', file: 'js/ui.js', want: 'R1',
    desc: '去掉头像选中态 .on 接线',
    old: "p.avatar === a ? ' on' : ''",
    neu: "''",
  },
  {
    id: 'M4', file: 'admin/js/pages.js', want: 'R4',
    desc: '公告列表删掉「状态」列（又退回靠说明文字想象）',
    old: "['时间', '类型', '标题', '展示至', '状态', '操作']",
    neu: "['时间', '类型', '标题', '展示至', '操作']",
  },
  {
    id: 'M5', file: 'js/ui.js', want: 'K1',
    desc: '误删含真实差异信息的必要说明（一刀切）',
    old: '战斗中点击立即生效；战斗外使用将在下一场自动生效',
    neu: '',
  },
  {
    id: 'M6', file: 'admin/js/pages.js', want: 'R6',
    desc: '状态判定边界改错（展示至当天被判已过期）',
    old: 'Number(x.endAt) >= Number(now)',
    neu: 'Number(x.endAt) > Number(now)',
  },
];

let captured = 0, dirty = 0;
for (const c of CASES) {
  const fp = P(c.file);
  const orig = fs.readFileSync(fp, 'utf8');
  const h0 = md5(orig);
  const hits = orig.split(c.old).length - 1;
  /* 锚点允许命中多处（K1 保留项本就两处）：String.replace 用字符串参数
   * 只替换【首处】，仍是可逆变异。第一版写死 hits===1 把合法用例判成未捕获，
   * 且误计一次 dirty —— 变异脚本自己的判据也会骗人，已修。 */
  if (hits < 1) {
    console.log(`  × ${c.id} 变异锚点命中 0 次，本组判未捕获`);
    continue;
  }
  let verdict = '未捕获';
  try {
    fs.writeFileSync(fp, orig.replace(c.old, c.neu));
    const r = spawnSync('node', ['tools/uxdel.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    const out = String(r.stdout || '') + String(r.stderr || '');
    const named = new RegExp('×\\s*' + c.want + '\\b').test(out);
    const red = r.status !== 0 && /RESULT: PASS \d+ \/ FAIL [1-9]/.test(out);
    /* 崩溃也非零，但必须点名具体断言才算"判据抓到" */
    if (red && named) { captured++; verdict = '捕获✓'; }
    else if (red) verdict = '非零但未点名断言（疑似崩溃，不算捕获）';
    else verdict = '守卫仍报绿 ✗';
  } catch (e) {
    verdict = '执行异常：' + e.message;
  } finally {
    fs.writeFileSync(fp, orig);
    if (md5(fs.readFileSync(fp, 'utf8')) !== h0) { dirty++; console.log(`  × ${c.id} 还原不一致`); }
  }
  console.log(`  ${verdict.startsWith('捕获') ? '√' : '×'} ${c.id} ${c.desc} → ${verdict}`);
}

/* 还原后再跑一次基线，确认工作区干净 */
const base = spawnSync('node', ['tools/uxdel.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
const baseOk = base.status === 0 && /RESULT: PASS 16 \/ FAIL 0/.test(String(base.stdout || ''));
console.log('\n本轮验证 ' + CASES.length + ' 条，捕获 ' + captured + '/' + CASES.length +
  '；还原校验 ' + (dirty ? 'FAIL ' + dirty : 'PASS') + '；基线 ' + (baseOk ? 'PASS 16/0' : 'FAIL'));
process.exit(captured === CASES.length && dirty === 0 && baseOk ? 0 : 1);
