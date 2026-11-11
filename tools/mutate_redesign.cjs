/* [mutate_redesign.cjs] 立规原因：抓不住缺陷的断言等于不存在；历史上多次出现
 * 「变异脚本改坏结构 / 强停遗留污染 / 快照被污染仍报无需恢复」。
 * 判据：每条用例必须让 redesign.cjs 以 exit=1 报出对应断言编号；每组结束后逐字节还原并校验 md5。
 * 退出码：0=全部捕获 / 1=存在未捕获或还原不一致 / 2=崩溃（不静默报绿）。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = '/data/workspace/zombie';
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const guard = path.join(ROOT, 'tools', 'redesign.cjs');
const shotPath = path.join(ROOT, '_vis', '_shot_v1387.json');

const cases = [
  { id: 'M1', hit: 'R1', desc: '删掉一个功能入口',
    file: 'index.html',
    mut: s => s.replace(/\s*<button class="hmb" data-p="season">[\s\S]*?<\/button>/, '') },
  { id: 'M2', hit: 'R5', desc: '删掉抽屉与 Tab 的绑定实现（制造死按钮）',
    file: 'js/ui.js',
    mut: s => s.replace(/UI\.open\(t\.dataset\.p\)/, 'void 0') },
  { id: 'M3', hit: 'R8', desc: '把技能页说明行加回来',
    file: 'index.html',
    mut: s => s.replace('<div id="chCards"></div>', '<div class="ch-sub">局内技能选择 · 可叠加至 10 级</div><div id="chCards"></div>') },
  { id: 'M4', hit: 'R7', desc: '把「本局」次要标签加回来',
    file: 'index.html',
    mut: s => s.replace('<div class="bs-res">', '<div class="bs-res"><i class="bs-lb">本局</i>') },
  { id: 'M5', hit: 'R11', desc: '删掉重做样式分段标记',
    file: 'css/style.css',
    mut: s => s.replace('V1.3.87 界面重做 · 功能界面', '已移除标记') },
  { id: 'M6', hit: 'R15', desc: '伪造取证快照为 FAIL（守卫必须消费真实证据）',
    file: '_vis/_shot_v1387.json',
    mut: s => { const o = JSON.parse(s); o.pageErrors = 9; return JSON.stringify(o, null, 2); } },
  { id: 'M7', hit: 'R6', desc: '删掉一个底部 Tab',
    file: 'index.html',
    mut: s => s.replace(/\s*<button class="tab" data-p="shop"[\s\S]*?<\/button>/, '') }
];

let caught = 0, restored = 0, bad = [];
try {
  for (const c of cases) {
    const fp = path.join(ROOT, c.file);
    const orig = fs.readFileSync(fp, 'utf8');
    const before = md5(orig);
    const mutated = c.mut(orig);
    if (mutated === orig) { bad.push(c.id + ' 变异未生效（改错位置）'); continue; }
    let out = '', code = 0;
    try {
      fs.writeFileSync(fp, mutated);
      out = execFileSync('node', [guard], { encoding: 'utf8', cwd: ROOT });
    } catch (e) {
      out = (e.stdout || '') + (e.stderr || '');
      code = e.status == null ? 2 : e.status;
    } finally {
      fs.writeFileSync(fp, orig);
    }
    const after = md5(fs.readFileSync(fp, 'utf8'));
    if (after !== before) bad.push(c.id + ' 还原后 md5 不一致');
    else restored++;
    const hitOk = code === 1 && out.includes('FAIL ' + c.hit);
    if (hitOk) caught++; else bad.push(c.id + ' 未捕获（exit=' + code + ' hit=' + c.hit + '）');
    console.log(c.id + ' ' + c.desc + ' -> ' + (hitOk ? 'CAUGHT' : 'MISSED') + ' exit=' + code + ' restore=' + (after === before ? 'OK' : 'BAD'));
  }
  const ok = caught === cases.length && restored === cases.length && bad.length === 0;
  console.log('SUMMARY caught=' + caught + '/' + cases.length + ' restored=' + restored + '/' + cases.length + (bad.length ? ' bad=' + bad.join(' | ') : ''));
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error('CRASH ' + e.message);
  process.exit(2);
}
