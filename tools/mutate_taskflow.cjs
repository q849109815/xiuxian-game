#!/usr/bin/env node
/* 【mutate_taskflow.cjs】变异验证：把 V1.3.86 修掉的 7 类旧形态分别塞回源码，
 * 证明 taskflow.cjs 真能抓到，而不是「上线即摆设」。
 * 立规原因：历史上多次「守卫建了但从没验证过抓不抓得住」，以及
 *   变异脚本被强杀导致污染残留进生产代码。本脚本：
 *   - 备份放内存、finally 必还原、还原后 md5 逐字节校验
 *   - 每组独立 spawn，单组失败不影响后续组还原
 *   - 不用「只加注释」冒充变异（V1.3.74 M3 的错题）
 * 说明：动态断言消费的是已归档的真实 Chrome 取证，单次变异不重跑浏览器；
 *   捕获以源码静态断言为准，发布前会重跑 _flowwalk_v1386.cjs 刷新取证。
 * 退出码：0=全部捕获且还原一致 / 1=存在漏捕获或还原不一致 / 2=崩溃。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const U = path.join(ROOT, 'js/ui.js'), C = path.join(ROOT, 'css/style.css');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const origU = fs.readFileSync(U), origC = fs.readFileSync(C);
const hU = md5(origU), hC = md5(origC);

const M = [
  { n: 'M1 加回笼统「前往关卡」按钮', file: U,
    from: "      </div>`;\n    }\n    if (tab === '成就') {",
    to: "      </div>\n      <button class=\"btn\" id=\"goTask\" style=\"width:100%\">前往关卡</button>`;\n    }\n    if (tab === '成就') {",
    expect: 'T1' },
  { n: 'M2 强化任务退回一刀切去关卡', file: U,
    from: "if (c === 'dailyUp') return { label: '去强化', key: 'gun', tab: this.PANELS.gun[1][0] };",
    to: "if (c === 'dailyUp') return { label: '去关卡', key: 'level', tab: '章节' };",
    expect: 'T2' },
  { n: 'M3 一个页签改回静态「未完成」', file: U,
    from: 'this.taskGoBtn(t)', to: "'<span class=\"st off\">未完成</span>'", expect: 'T3' },
  { n: 'M4 删掉行内按钮绑定', file: U,
    from: "$$('#pnBody [data-go]').forEach", to: "$$('#pnBody [data-go-x]').forEach", expect: 'T4' },
  { n: 'M5 删掉无尽卡片锚点', file: U,
    from: 'id="lvEndless"', to: 'id="lvEndlessX"', expect: 'T5' },
  { n: 'M6 任务行改回换行', file: C,
    from: '.zrow.zrow-go{flex-wrap:nowrap;gap:var(--sp-1)}',
    to: '.zrow.zrow-go{flex-wrap:wrap;gap:var(--sp-1)}', expect: 'T5' },
  { n: 'M7 加回未定义变量 gb 残留', file: U,
    from: "    $$('#pnBody [data-mq]').forEach",
    to: "    if (gb) gb.onclick = () => {};\n    $$('#pnBody [data-mq]').forEach", expect: 'T6' },
  { n: 'M8 把块注释写回任务渲染模板', file: U,
    from: "          return `<div class=\"zrow zrow-go\">\n            <div class=\"zav\">🏆</div>",
    to: "          return `<div class=\"zrow zrow-go\">\n            <div class=\"zav\">🏆</div>\n            /* leaked note */",
    expect: 'T13' },
];

let cap = 0; const bad = [];
const restore = () => { fs.writeFileSync(U, origU); fs.writeFileSync(C, origC); };
try {
  for (const m of M) {
    let buf = fs.readFileSync(m.file, 'utf8');
    const hit = buf.split(m.from).length - 1;
    if (!hit) { bad.push(m.n + ' :: 注入未命中'); continue; }
    buf = buf.replace(m.from, m.to);   /* 只替换第一处，保持文件其余不变 */
    fs.writeFileSync(m.file, buf);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/taskflow.cjs')],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const caught = r.status !== 0 && out.includes(m.expect);
    if (caught) cap++; else bad.push(m.n + ' :: 未捕获(status=' + r.status + ', 含' + m.expect + '=' + out.includes(m.expect) + ')');
    console.log((caught ? '  ok ' : '  X  ') + m.n + ' expect=' + m.expect + ' status=' + r.status);
    restore();
    if (md5(fs.readFileSync(U)) !== hU || md5(fs.readFileSync(C)) !== hC) { bad.push(m.n + ' :: 还原 md5 不一致'); restore(); }
  }
} catch (e) { bad.push('CRASH :: ' + String(e.message)); }
finally { restore(); }
const clean = md5(fs.readFileSync(U)) === hU && md5(fs.readFileSync(C)) === hC;
if (!clean) bad.push('最终还原 md5 不一致');
const fin = spawnSync(process.execPath, [path.join(ROOT, 'tools/taskflow.cjs')],
  { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
console.log('MUTATE_TASKFLOW CAPTURE=' + cap + '/' + M.length +
  ' RESTORE=' + (clean ? 'MD5_OK' : 'FAIL') + ' FINAL_GREEN=' + (fin.status === 0));
bad.forEach(x => console.log('  BAD ' + x));
process.exit(bad.length || cap !== M.length || fin.status !== 0 ? 1 : 0);
