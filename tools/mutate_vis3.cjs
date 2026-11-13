/* [mutate_vis3.cjs] 立规原因：抓不住缺陷的断言等于不存在。
 * 对 V1.3.88 三类真缺陷逐一「把 bug 塞回去」，要求 tools/vis3.cjs 当场报红。
 * 判据：每组变异必须 exit!=0 且输出点名对应断言；finally 无条件还原并逐字节校验 md5，
 * 防止历史事故「强停/异常退出把变异留在产品代码里」。
 * 退出码：0=全部捕获且还原一致 / 1=有未捕获或还原失败 / 2=崩溃。
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const F = f => path.join(ROOT, f);
const read = f => fs.readFileSync(F(f), 'utf8');
const write = (f, s) => fs.writeFileSync(F(f), s);

const CASES = [
  { id: 'M1 变量掉出 :root（事故本源）', file: 'css/tokens.css',
    mut: s => { const line = '  --bt-status-top:58px;\n'; return s.indexOf(line) >= 0 ? s.replace(line, '') + '\n' + line : null; },
    want: ['S1', 'D1'] },
  { id: 'M2 顶栏改回横排挤压', file: 'css/style.css',
    mut: s => { const a = '#battle .btb-mid{flex-direction:column;align-items:center;justify-content:center;gap:0;text-align:center}';
      const b = '#battle .btb-mid{flex-direction:row;align-items:center;justify-content:center;gap:0;text-align:center}';
      return s.indexOf(a) >= 0 ? s.replace(a, b) : null; },
    want: ['S3', 'D4'] },
  { id: 'M3 换弹盘删默认图（空框）', file: 'index.html',
    mut: s => { const re = /(<img id="btGunImg" class="gun-ic" )src="assets\/icon\/nav_gun\.png\?v=[0-9.]+"( alt="")/;
      return re.test(s) ? s.replace(re, '$1$2') : null; },
    want: ['S4', 'D5'] },
  { id: 'M4 空状态缩回 170px（半屏裸黑）', file: 'css/style.css',
    mut: s => { const a = '#panel .card>.empty{min-height:min(62vh,520px);';
      const b = '#panel .card>.empty{min-height:170px;';
      return s.indexOf(a) >= 0 ? s.replace(a, b) : null; },
    want: ['S6', 'D6'] }
];

let pass = 0, fail = 0;
for (const c of CASES) {
  const orig = read(c.file), sum = md5(orig);
  const mutated = c.mut(orig);
  if (mutated === null) { console.log('SKIP ' + c.id + ' 变异锚点未命中（守卫与源码已漂移，需修）'); fail++; continue; }
  try {
    write(c.file, mutated);
    const r = spawnSync('node', ['tools/vis3.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const named = c.want.filter(w => out.indexOf(w) >= 0);
    const caught = (r.status !== 0 && r.status !== null) && named.length > 0;
    if (caught) { pass++; console.log('PASS ' + c.id + ' exit=' + r.status + ' 点名=' + named.join('/')); }
    else { fail++; console.log('FAIL ' + c.id + ' exit=' + r.status + ' 未点名预期断言 ' + c.want.join('/') + ' | ' + out.slice(-300)); }
  } catch (e) { fail++; console.log('FAIL ' + c.id + ' 异常 ' + e.message); }
  finally {
    write(c.file, orig);
    const back = md5(read(c.file));
    if (back !== sum) { fail++; console.log('FAIL ' + c.id + ' 还原后 md5 不一致！'); }
    else console.log('     还原 md5 一致 ' + back.slice(0, 10));
  }
}
console.log('\n变异验证：捕获 ' + pass + '/' + CASES.length + '，失败 ' + fail);
console.log('RESULT: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
