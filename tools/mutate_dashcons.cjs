#!/usr/bin/env node
/* ============================================================================
 * tools/mutate_dashcons.cjs —— dashcons 守卫的变异验证（V1.3.77）
 * ----------------------------------------------------------------------------
 * 铁律：抓不住缺陷的断言等于不存在。
 * 做法：把修复逐条「塞回坏形态」，dashcons 必须当场报红；每步 try/finally
 * 还原并逐字节校验 md5，最后复跑一次确认基线回绿。
 *
 * 防污染纪律（测试部历史错题 ×2「强停检测造成污染」）：
 *   - 一次只改一个文件，绝不并发
 *   - 还原失败立即 exit 3，绝不继续下一组
 *   - 不依赖外部快照，备份就在内存里
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

function runGuard() {
  const r = spawnSync('node', ['tools/dashcons.cjs'], {
    cwd: ROOT, encoding: 'utf8', timeout: 180000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  return { red: r.status !== 0 && /FAIL=[1-9]/.test(out), status: r.status, out };
}

const CASES = [
  {
    id: 'M1', name: '判据退回无等号（复现 V1.3.77 事故本源）',
    file: 'tools/dashparse.cjs',
    from: '/biguard:\\s*PASS=?\\s*(\\d+)\\s+FAIL=?\\s*(\\d+)/i',
    to: '/biguard:\\s*PASS\\s*(\\d+)\\s+FAIL=?\\s*(\\d+)/i',
  },
  {
    id: 'M2', name: '删掉退出码判据（崩溃时靠 stdout 蒙混）',
    file: 'tools/dashparse.cjs',
    from: '  if (status !== 0) return null;\n',
    to: '',
  },
  {
    id: 'M3', name: '删掉 complete 完整性判据（残快照冒充结论）',
    file: 'tools/dashparse.cjs',
    from: '  if (ta.complete === false) return false;\n',
    to: '',
  },
  {
    id: 'M4', name: '实时基准 consistent 写死 true（分叉也判绿）',
    file: 'tools/synccheck.py',
    from: "'consistent': bad == 0,",
    to: "'consistent': True,",
  },
  {
    id: 'M5', name: 'D3 判据写死 true（假通过）',
    file: 'tools/fullscan.cjs',
    from: 'if (d3Fresh && d3Live.consistent === true) {',
    to: 'if (d3Fresh && true) {',
  },
  {
    id: 'M6', name: '并发锁退回只看 PID（身份核验失效）',
    file: 'tools/mutguard.cjs',
    from: "const cmd = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8')",
    to: "const cmd = fs.readFileSync('/procX/' + pid + '/cmdline', 'utf8')",
  },
];

let captured = 0;
console.log('=== dashcons 变异验证（' + CASES.length + ' 组）===');
for (const c of CASES) {
  const fp = path.join(ROOT, c.file);
  const orig = fs.readFileSync(fp, 'utf8');
  const before = md5(orig);
  if (!orig.includes(c.from)) {
    console.log('  x  ' + c.id + ' 变异锚点未命中（判未捕获，不算通过）  ' + c.name);
    continue;
  }
  let red = false;
  try {
    fs.writeFileSync(fp, orig.replace(c.from, c.to));
    const r = runGuard();
    red = r.red;
    if (red) captured++;
    console.log('  ' + (red ? '√' : 'x') + '  ' + c.id + ' ' + c.name
      + '  → exit=' + r.status + (red ? ' 已捕获' : ' 未捕获'));
  } finally {
    fs.writeFileSync(fp, orig);
    const after = md5(fs.readFileSync(fp, 'utf8'));
    if (after !== before) {
      console.error('[FATAL] ' + c.id + ' 还原失败，md5 不一致，立即停止（防污染）');
      process.exit(3);
    }
  }
}

/* 还原后基线必须回绿，否则说明变异留下了残留或守卫本身不稳定 */
const base = runGuard();
const restored = !base.red && base.status === 0;
console.log('-'.repeat(62));
console.log('还原后基线：' + (restored ? 'PASS（exit=0，md5 逐字节一致）' : 'FAIL（exit=' + base.status + '）'));
console.log('MUT: captured ' + captured + '/' + CASES.length);
process.exit(captured === CASES.length && restored ? 0 : 1);
