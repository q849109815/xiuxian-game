#!/usr/bin/env node
/**
 * ver.cjs 同步回读校验的变异验证
 * 事故背景：bump1 打印「版本字段同步 14 处」，实测 config.js 中新版本号出现 0 次，
 *          而当时无任何报错 —— 靠 cacheguard/releaseguard 报红才被发现。
 * 本验证：故意让版本同步失效，ver.cjs 必须中止（exit=2），不得静默放行。
 * 安全：全程备份 -> 注入 -> 校验 -> 还原 -> md5 比对
 */
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
/* 备份清单必须覆盖 ver.cjs 会改动的所有文件。
   事故（本轮自建脚本首跑即踩）：初版漏了 admin/index.html，
   变异用例跑 bump1 时把后台 ?v= 推到 1.3.721111111111（多一位），
   还原时没覆盖它 => 污染留在工作区并被上传到线上，被 cacheguard C7 抓出。
   这里改为从 ver.cjs 的 TARGETS 动态解析，杜绝以后新增目标再次漏备份。 */
const REL = (() => {
  const vs = fs.readFileSync(path.join(__dirname, 'ver.cjs'), 'utf8');
  const m = vs.match(/const TARGETS\s*=\s*\[([\s\S]*?)\]/);
  const tg = m ? [...m[1].matchAll(/f:\s*'([^']+)'/g)].map(x => x[1]) : [];
  return [...new Set([...tg, 'js/config.js', 'js/ui.js', 'admin/js/core.js',
                      'admin/index.html', 'tools/ver.cjs', 'tools/.version.json', 'CHANGELOG.md'])];
})();
const md5 = b => crypto.createHash('md5').update(b).digest('hex').slice(0, 12);
const snap = {};
for (const f of REL) { const p = path.join(ROOT, f); snap[f] = fs.existsSync(p) ? md5(fs.readFileSync(p)) : null; }
const bak = {};
for (const f of REL) { const p = path.join(ROOT, f); if (fs.existsSync(p)) bak[f] = fs.readFileSync(p); }

const restore = () => { for (const f of REL) if (bak[f]) fs.writeFileSync(path.join(ROOT, f), bak[f]); };
let caught = 0, bad = [];

/* M1：让 version 字段同步的正则是失效形式（模拟结构变化后同步静默失败） */
const vp = path.join(ROOT, 'tools/ver.cjs');
let vs = fs.readFileSync(vp, 'utf8');
const NEEDLE = 'HOT_UPDATE:' + '\\s*' + '\\{';
const m1 = vs.split(NEEDLE).join('HOT_UPDATE_NEVER:' + '\\s*' + '\\{');
if (m1 === vs.toString()) { console.log('M1 注入失败'); }
else {
  fs.writeFileSync(vp, m1);
  const r = cp.spawnSync('node', ['tools/ver.cjs', 'bump1', 'mut'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const hit = r.status === 2 && /回读校验未通过/.test((r.stdout || '') + (r.stderr || ''));
  if (hit) caught++; else bad.push('M1 期望 exit=2 且报回读校验未通过，实际 exit=' + r.status);
  console.log((hit ? '  捕获 ' : '  未捕获 ') + 'M1-版本同步失效应中止 (exit=' + r.status + ')');
  restore();
}

/* M2：manifest ver 同步失效 */
restore();
let vs2 = fs.readFileSync(vp, 'utf8');
const m2 = vs2.replace(/\(ver\\s\*:\\s\*'\)\[\\w\.\\-\]\+\('/g, "(ver_NEVER\\s*:\\s*')[\\w.\\-]+('");
if (m2 === vs2.toString()) { console.log('M2 注入失败'); }
else {
  fs.writeFileSync(vp, m2);
  const r = cp.spawnSync('node', ['tools/ver.cjs', 'bump1', 'mut'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const hit = r.status === 2 && /回读校验未通过/.test((r.stdout || '') + (r.stderr || ''));
  if (hit) caught++; else bad.push('M2 期望 exit=2，实际 exit=' + r.status);
  console.log((hit ? '  捕获 ' : '  未捕获 ') + 'M2-manifest同步失效应中止 (exit=' + r.status + ')');
  restore();
}

restore();
const clean = REL.every(f => !snap[f] || md5(fs.readFileSync(path.join(ROOT, f))) === snap[f]);
console.log('\nver 回读校验变异：捕获 ' + caught + '/2，还原' + (clean ? '一致' : '不一致'));
if (bad.length) console.log('问题: ' + bad.join(' | '));
process.exit((bad.length || !clean) ? 1 : 0);
