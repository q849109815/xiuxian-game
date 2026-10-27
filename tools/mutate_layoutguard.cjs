#!/usr/bin/env node
/**
 * mutate_layoutguard —— 布局越界守卫的变异验证
 * ------------------------------------------------------------------
 * 铁律：抓不住缺陷的守卫等于不存在。
 * layoutguard 是本轮新建的守卫，必须先证明它能抓住本次线上事故的两种形态：
 *
 *   V1 主界面基地建筑行：把修复后的 4 列等宽网格改回固定 96px
 *      → 第 4 张卡右边缘回到 420（视口 360），L1 必须 FAIL
 *   V2 技能三选一描述：把 line-clamp:3 改成 unset（不截断）
 *      → 长描述撑爆卡片，L3b 必须 FAIL
 *   V3 事故本源：把 var(--txt2) 的右括号去掉（整条规则被 CSS 解析器丢弃）
 *      → 截断规则整体失效，L3b 必须 FAIL
 *
 * 安全约束（源自 V1.3.8 污染事故）：
 *   - 备份落在 .mut/ 独立目录，绝不以源码现拍快照做备份源；
 *   - 每条用例跑完立即还原并校验 md5，异常也要 finally 还原；
 *   - 与 mutguard 共用 .mut 锁，避免并发互毁备份。
 *
 * 用法：node tools/mutate_layoutguard.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(path.dirname(__filename));
const CSS = path.join(ROOT, 'css', 'style.css');
const MUT = path.join(ROOT, '.mut');
const LOCK = path.join(MUT, '.mut.lock');

const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const sleep = (ms) => { const t = Date.now(); while (Date.now() - t < ms); };

/* 并发锁：第二个实例直接拒绝开工（V1.3.8 污染事故根因之一） */
fs.mkdirSync(MUT, { recursive: true });
if (fs.existsSync(LOCK)) {
  const age = Date.now() - fs.statSync(LOCK).mtimeMs;
  if (age < 15 * 60 * 1000) {
    console.error('[mutate_layoutguard] 检测到其他变异实例正在运行（锁存活 ' + Math.round(age / 1000) + 's），拒绝开工以免互毁备份');
    process.exit(2);
  }
}
fs.writeFileSync(LOCK, String(process.pid));

const CASES = [
  {
    id: 'V1',
    name: '主界面建筑行改回固定96px → 第4张卡出屏',
    from: '.hm-base .bs{width:auto;min-width:0}',
    to: '.hm-base .bs{width:96px;min-width:96px}',
    expect: 'L1',
  },
  {
    id: 'V2',
    name: '三选一描述 clamp:3 → unset（不截断）',
    from: '-webkit-line-clamp:3;\n  -webkit-box-orient:vertical;overflow:hidden;line-height:1.35;margin:var(--sp-1)}',
    to: '-webkit-line-clamp:unset;\n  -webkit-box-orient:vertical;overflow:visible;line-height:1.35;margin:var(--sp-1)}',
    expect: 'L3b',
  },
  {
    id: 'V3',
    name: '事故本源：var(--txt2 缺右括号 → 整条规则失效',
    from: '.ccard .cd2{font-size:var(--fs-xs);color:var(--txt2);display:-webkit-box;',
    to: '.ccard .cd2{font-size:var(--fs-xs);color:var(--txt2;display:-webkit-box;',
    expect: 'L3b',
  },
];

let pass = 0, fail = 0;
const orig = fs.readFileSync(CSS, 'utf8');
const origHash = md5(CSS);

try {
  for (const c of CASES) {
    if (!orig.includes(c.from)) {
      console.log('  ? ' + c.id + ' 锚点未命中（源码已变更，用例需同步）');
      fail++;
      continue;
    }
    fs.writeFileSync(CSS, orig.split(c.from).join(c.to));
    let out = '', code = 0;
    try {
      /* 单宽度跑，控制时长；绝不强停（强停=注入残留=污染） */
      out = execFileSync('node', [path.join(ROOT, 'tools', 'layoutguard.cjs'), '360'],
        { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    } catch (e) {
      code = (e.status === undefined) ? -1 : e.status;
      out = String(e.stdout || '') + String(e.stderr || '');
    }
    fs.writeFileSync(CSS, orig);
    const restored = md5(CSS) === origHash;

    const caught = code !== 0 && out.includes(c.expect);
    if (caught && restored) {
      pass++;
      const line = (out.split('\n').find((l) => l.includes(c.expect)) || '').trim();
      console.log('  OK ' + c.id + ' 捕获 :: ' + c.name + '  [' + line.slice(0, 90) + ']');
    } else {
      fail++;
      console.log('  XX ' + c.id + ' 未捕获 :: ' + c.name
        + '  exit=' + code + ' 命中=' + out.includes(c.expect) + ' 还原=' + restored);
    }
    if (!restored) { console.error('FATAL 还原失败，源码已被污染'); break; }
    sleep(300);
  }
} finally {
  fs.writeFileSync(CSS, orig);
  try { fs.unlinkSync(LOCK); } catch (e) {}
}

const clean = md5(CSS) === origHash;
console.log('\n[mutate_layoutguard] 捕获 ' + pass + ' / ' + CASES.length
  + '   源码还原=' + (clean ? 'md5一致' : '不一致（污染！）'));
process.exit(fail || !clean ? 1 : 0);
