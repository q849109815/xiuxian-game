#!/usr/bin/env node
/**
 * tools/mutate_biguard.cjs —— biguard 守卫的变异验证
 *
 * 铁律：抓不住缺陷的断言等于不存在。
 * 本脚本故意把四类坏改动塞回源码，守卫必须每一种都报红；
 * 还原后文件必须与原始逐字节一致。
 *
 * 用法：node tools/mutate_biguard.cjs   （退出码 0=全部捕获，1=有漏网）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const FILES = ['js/ops.js', 'js/main.js'];
const BACKUP = {};
FILES.forEach((f) => {
  const abs = path.join(ROOT, f);
  BACKUP[f] = { buf: fs.readFileSync(abs), sha: sha(abs) };
});

/* 变异用例：每条都必须被 biguard 抓住 */
const CASES = [
  {
    n: 'M1 登录前埋点不再暂存（退回"直接丢弃"）',
    file: 'js/ops.js',
    from: `          /* 登录前：暂存，flushBI 时补写。不丢事件。 */
          BI_PENDING.push({ ev: ev, n: def ? def.n : ev, t: Date.now(), pr: def ? def.pr : 'P2' });
          if (BI_PENDING.length > 30) BI_PENDING.splice(0, BI_PENDING.length - 30);`,
    to: `          /* 登录前：直接丢弃（变异） */`,
  },
  {
    n: 'M2 删除 flushBI 调用（main 不再补写）',
    file: 'js/main.js',
    from: `    try { if (window.OPS && OPS.flushBI) OPS.flushBI(p); } catch (e) {}`,
    to: ``,
  },
  {
    n: 'M3 flushBI 空实现（定义了但不干活）',
    file: 'js/ops.js',
    from: `        while (BI_PENDING.length) p._bi.push(BI_PENDING.shift());`,
    to: `        /* 变异：不补写 */`,
  },
  {
    n: 'M4 flushBI 调用挪到 window.P = p 之前（顺序错=没补）',
    file: 'js/main.js',
    from: `    P = p; window.P = p; UI.P = p;
    /* 补写登录前（boot 阶段）产生的埋点：game_start 等在 window.P 就绪前
     * 就触发过，此前整段被跳过、永远进不了存档，运营后台启动量缺一层。 */
    try { if (window.OPS && OPS.flushBI) OPS.flushBI(p); } catch (e) {}`,
    to: `    try { if (window.OPS && OPS.flushBI) OPS.flushBI(p); } catch (e) {}
    P = p; window.P = p; UI.P = p;`,
  },
];

function restore() {
  FILES.forEach((f) => {
    fs.writeFileSync(path.join(ROOT, f), BACKUP[f].buf);
  });
}

let caught = 0, missed = 0;
try {
  for (const c of CASES) {
    restore();
    const abs = path.join(ROOT, c.file);
    let s = fs.readFileSync(abs, 'utf8');
    if (!s.includes(c.from)) {
      console.log('  SKIP ' + c.n + ' ← 锚点未命中，用例失效');
      missed++;
      continue;
    }
    s = s.replace(c.from, c.to);
    fs.writeFileSync(abs, s);
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'biguard.cjs')], { cwd: ROOT });
    const code = r.status;
    if (code === 1) { caught++; console.log('  OK   ' + c.n + ' → 捕获'); }
    else { missed++; console.log('  MISS ' + c.n + ' → 未捕获（exit=' + code + '）'); }
  }
} finally {
  restore();
}

let allOk = true;
FILES.forEach((f) => {
  const abs = path.join(ROOT, f);
  if (sha(abs) !== BACKUP[f].sha) { console.log('  ERR  ' + f + ' 还原后 sha 不一致'); allOk = false; }
});

console.log('mutate_biguard: 捕获=' + caught + ' 漏网=' + missed + ' 还原一致=' + (allOk ? '是' : '否'));
process.exit(missed === 0 && allOk ? 0 : 1);
