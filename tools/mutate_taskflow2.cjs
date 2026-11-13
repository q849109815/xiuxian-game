#!/usr/bin/env node
/* 【mutate_taskflow2.cjs】变异验证：把 V1.3.86b 修掉的旧形态塞回源码/取证，
 * 证明 taskflow2.cjs 静态与动态两类判据都真能抓到，而不是「上线即摆设」。
 * 立规原因：历史上多次「守卫建了但没证明抓得住」；且变异脚本被强杀曾把
 *   坏数据留在生产代码。本脚本：备份放内存、finally 必还原、还原后 md5 逐字节校验。
 * 静态 4 例改 js/ui.js；动态 2 例改真实取证快照（不重跑浏览器，判据消费的就是它）。
 * 退出码：0=全部捕获且还原一致 / 1=漏捕获或还原不一致 / 2=崩溃。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const U = path.join(ROOT, 'js/ui.js'), V = path.join(ROOT, '_vis/_v1386b_fix.json');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const origU = fs.readFileSync(U), origV = fs.readFileSync(V);
const hU = md5(origU), hV = md5(origV);
const run = () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/taskflow2.cjs')],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const restore = () => { fs.writeFileSync(U, origU); fs.writeFileSync(V, origV); };

const srcMut = [
  { n: 'M1 去强化退回武器库页签', expect: 'S1',
    from: 'tab: this.PANELS.gun[1][0]', to: "tab: '武器库'" },
  { n: 'M2 去扫荡删掉首关锚点', expect: 'S2',
    from: "if (c === 'dailySweep') return { label: '去扫荡', key: 'level', tab: '章节', focus: 'lvFirst' };",
    to: "if (c === 'dailySweep') return { label: '去扫荡', key: 'level', tab: '章节' };" },
  { n: 'M3 去关卡删掉首关锚点', expect: 'S3',
    from: "return { label: '去关卡', key: 'level', tab: '章节', focus: 'lvFirst' };",
    to: "return { label: '去关卡', key: 'level', tab: '章节' };" },
  { n: 'M4 关卡首行锚点被删', expect: 'S4',
    from: ' id="lvFirst"', to: '' },
];
const snapMut = [
  { n: 'M5 取证里把去强化改成不在首屏', expect: 'D1',
    fn: j => { const x = j.steps['H1_直达落点与目标控件可见性'].find(a => a.label === '去强化');
      if (!x) throw new Error('取证缺 H1 去强化'); x.inFirstScreen = false; return j; } },
  { n: 'M6 取证快照源码哈希被改（旧快照冒充当前）', expect: 'D0',
    fn: j => { j.srcHash = 'deadbeefdeadbeefdeadbeefdeadbeef'; return j; } },
];

let cap = 0; const bad = []; const total = srcMut.length + snapMut.length;
try {
  for (const m of srcMut) {
    let buf = fs.readFileSync(U, 'utf8');
    const hit = buf.split(m.from).length - 1;
    if (hit !== 1) { bad.push(m.n + ' :: 注入锚点命中 ' + hit + ' 次'); continue; }
    fs.writeFileSync(U, buf.replace(m.from, m.to));
    const r = run();
    const caught = r.status !== 0 && r.out.includes(m.expect);
    if (caught) cap++; else bad.push(m.n + ' :: 未捕获(status=' + r.status + ')');
    console.log((caught ? '  ok ' : '  X  ') + m.n + ' expect=' + m.expect + ' status=' + r.status);
    restore();
    if (md5(fs.readFileSync(U)) !== hU || md5(fs.readFileSync(V)) !== hV) { bad.push(m.n + ' :: 还原 md5 不一致'); restore(); }
  }
  for (const m of snapMut) {
    const j = JSON.parse(origV.toString('utf8'));
    fs.writeFileSync(V, JSON.stringify(m.fn(j), null, 2));
    const r = run();
    const caught = r.status !== 0 && r.out.includes(m.expect);
    if (caught) cap++; else bad.push(m.n + ' :: 未捕获(status=' + r.status + ')');
    console.log((caught ? '  ok ' : '  X  ') + m.n + ' expect=' + m.expect + ' status=' + r.status);
    restore();
    if (md5(fs.readFileSync(U)) !== hU || md5(fs.readFileSync(V)) !== hV) { bad.push(m.n + ' :: 还原 md5 不一致'); restore(); }
  }
} catch (e) { bad.push('CRASH :: ' + String(e.message)); }
finally { restore(); }
const clean = md5(fs.readFileSync(U)) === hU && md5(fs.readFileSync(V)) === hV;
if (!clean) bad.push('最终还原 md5 不一致');
const fin = run();
console.log('MUTATE_TASKFLOW2 CAPTURE=' + cap + '/' + total +
  ' RESTORE=' + (clean ? 'MD5_OK' : 'FAIL') + ' FINAL_GREEN=' + (fin.status === 0));
bad.forEach(x => console.log('  BAD ' + x));
const fails = bad.length + (cap !== total ? 1 : 0) + (clean ? 0 : 1) + (fin.status !== 0 ? 1 : 0);
console.log('RESULT: PASS=' + cap + ' FAIL=' + fails);
process.exit(bad.length || cap !== total || fin.status !== 0 ? 1 : 0);
