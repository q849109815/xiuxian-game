#!/usr/bin/env node
/**
 * pushcov 变异验证
 * 铁律：抓不住问题的守卫等于不存在。
 * 本脚本故意把三类缺陷塞回 push.py，每注入一次都必须被 pushcov 报红；
 * 还原后必须字节一致、回到全绿。
 *
 * 分批：每组「独立注入 -> 立即校验 -> 立即还原」
 * 教训（维护轮3）：一次跑不完被强杀 => 污染残留进生产
 *
 * 用法：node tools/mutate_pushcov.cjs
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const T = path.join(ROOT, 'tools', 'push.py');
const BAK = path.join(ROOT, '.mut', 'pushcov_push.py');
fs.mkdirSync(path.dirname(BAK), { recursive: true });

const orig = fs.readFileSync(T);
fs.writeFileSync(BAK, orig);
const md5 = b => crypto.createHash('md5').update(b).digest('hex').slice(0, 12);
const base = md5(orig);

const CASES = [
  { n: 'M1-删掉kpi.cjs登记',       want: 'U2', f: s => s.replace(/^ {4}'tools\/kpi\.cjs',\n/m, '') },
  { n: 'M2-去掉路径编码函数',       want: 'E1', f: s => s.replace(/def apipath\(/, 'def apipathXx(') },
  { n: 'M3-插入不存在的幽灵路径',   want: 'N1', f: s => s.replace(/^ {4}'index\.html',\n/m, "    'index.html',\n    'tools/zzz_ghost.cjs',\n") },
  { n: 'M4-取消PUT侧编码调用',      want: 'E1', f: s => s.replace(/contents\/' \+ apipath\(f\)/, "contents/' + f") },
];

let caught = 0, bad = [];
const run = () => {
  const r = cp.spawnSync('node', ['tools/pushcov.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

for (const c of CASES) {
  fs.writeFileSync(T, c.f(orig.toString('utf8')));
  if (md5(fs.readFileSync(T)) === base) { bad.push(c.n + ' :: 注入无效（文件未改变）'); continue; }
  const r = run();
  const hit = r.code === 1 && r.out.includes(c.want);
  if (hit) caught++; else bad.push(c.n + ' :: 期望捕获 ' + c.want + '，实际 exit=' + r.code);
  console.log((hit ? '  捕获 ' : '  未捕获 ') + c.n + ' (exit=' + r.code + ')');
  fs.writeFileSync(T, orig);
  if (md5(fs.readFileSync(T)) !== base) { console.log('  !! 还原失败'); bad.push(c.n + ' :: 还原后字节不一致'); }
}

const fin = run();
const clean = fin.code === 0 && md5(fs.readFileSync(T)) === base;
console.log('\n变异验证：捕获 ' + caught + '/' + CASES.length +
            '，还原' + (clean ? '一致' : '不一致') + '，基线 exit=' + fin.code);
if (bad.length) console.log('问题: ' + bad.join(' | '));
process.exit(bad.length || !clean ? 1 : 0);
