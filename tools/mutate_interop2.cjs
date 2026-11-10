#!/usr/bin/env node
/* 【mutate_interop2.cjs】变异验证：把 V1.3.84 的 5 类缺陷分别塞回源码，
 * 证明 interop2 守卫真能抓到，而不是"上线即摆设"。
 * 立规原因：历史上多次出现"守卫建了但从没验证过抓不抓得住"，以及
 *   变异脚本中途被强杀导致污染残留进生产代码。本脚本：
 *   - 备份放内存、finally 必还原、还原后 md5 逐字节校验
 *   - 每组独立 spawn，单组失败不影响后续组还原
 * 退出码：0=全部捕获且还原一致 / 1=存在漏捕获或还原不一致 / 2=崩溃。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const U = path.join(ROOT, 'js/ui.js'), C = path.join(ROOT, 'css/style.css');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const origU = fs.readFileSync(U), origC = fs.readFileSync(C);
const hU = md5(origU), hC = md5(origC);
const M = [
  /* V1.3.86：goTask 已从产品移除，原 M1 注入会命中 0（假变异）。
   * 改为把任务行内直达退回静态「未完成」，验证升级后的 S1 真能抓到。 */
  { n: 'M1 任务页签改回静态未完成（无直达）', file: U, from: 'this.taskGoBtn(t)', to: "'<span class=\"st off\">未完成</span>'", expect: 'S1' },
  { n: 'M2 取消描述去重', file: U, from: "const descShort = String(g.desc || '').replace(/\\s*[·•]\\s*每日\\s*\\d+\\s*次\\s*$/, '').trim();", to: "const descShort = String(g.desc || '').trim();", expect: 'S5' },
  { n: 'M3 限购达上限不再写状态', file: U, from: /const btnTxt = blocked \? '已达上限'/, to: "const btnTxt = stamFull ? '体力已满'", expect: 'S4' },
  { n: 'M4 价格与状态拆回两行', file: U, from: '<div class="gbuy">', to: '<div class="gbuy-x">', expect: 'S7' },
  { n: 'M5 删掉收紧样式', file: C, from: '/* V1.3.84 操作性整改：商店卡片 */', to: '/* removed */', expect: 'S9' },
];
let cap = 0; const bad = [];
const restore = () => { fs.writeFileSync(U, origU); fs.writeFileSync(C, origC); };
try {
  for (const m of M) {
    let buf = fs.readFileSync(m.file, 'utf8');
    const hit = m.from instanceof RegExp ? (buf.match(m.from) || []).length : (buf.split(m.from).length - 1);
    if (!hit) { bad.push(m.n + ' :: 注入未命中'); continue; }
    buf = m.from instanceof RegExp ? buf.replace(m.from, m.to) : buf.split(m.from).join(m.to);
    fs.writeFileSync(m.file, buf);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/interop2.cjs')], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const caught = r.status !== 0 && out.includes(m.expect);
    if (caught) cap++; else bad.push(m.n + ' :: 未捕获(status=' + r.status + ', 含' + m.expect + '=' + out.includes(m.expect) + ')');
    console.log((caught ? '  ok ' : '  X  ') + m.n + ' expect=' + m.expect + ' status=' + r.status);
    restore();
    if (md5(fs.readFileSync(U)) !== hU || md5(fs.readFileSync(C)) !== hC) { bad.push(m.n + ' :: 还原 md5 不一致'); restore(); }
  }
} catch (e) {
  bad.push('CRASH :: ' + String(e.message));
} finally { restore(); }
const clean = md5(fs.readFileSync(U)) === hU && md5(fs.readFileSync(C)) === hC;
if (!clean) bad.push('最终还原 md5 不一致');
const fin = spawnSync(process.execPath, [path.join(ROOT, 'tools/interop2.cjs')], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
console.log('MUTATE_INTEROP2 CAPTURE=' + cap + '/' + M.length + ' RESTORE=' + (clean ? 'MD5_OK' : 'FAIL') + ' FINAL_GREEN=' + (fin.status === 0));
bad.forEach(x => console.log('  BAD ' + x));
process.exit(bad.length || cap !== M.length || fin.status !== 0 ? 1 : 0);
