#!/usr/bin/env node
/**
 * tools/mutate_shopux.cjs —— shopux 守卫的变异验证
 *
 * 铁律：抓不住缺陷的断言等于不存在。
 * 本脚本故意把四类坏改动塞回源码，守卫必须每一种都报红；
 * 还原后文件必须与原始逐字节一致。
 *
 * 用法：node tools/mutate_shopux.cjs   （退出码 0=全部捕获，1=有漏网）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'js', 'ui.js');
const crypto = require('crypto');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const ORIG = fs.readFileSync(TARGET);
const H0 = sha(TARGET);

const CASES = [
  {
    n: 'M1 月卡退回长说明（不给按钮）',
    from: '<button class="btn blk" data-buy="${_mc.id || \'SH05\'}" style="margin-top:6px">📅 开通月卡（💎${_mc.price || 300}）</button>',
    to: '<div class="lbl">未开通 · 在上方购买「月卡」后 30 天内每日可领</div>',
  },
  {
    n: 'M2 月卡 id 写死为不存在的 SH99',
    from: 'data-buy="${_mc.id || \'SH05\'}"',
    to: 'data-buy="SH99"',
  },
  {
    n: 'M3 战令退回说明文字',
    from: '<button class="btn sm blk" data-buy="${_pa.id || \'SH07\'}" style="margin-bottom:5px">🎖️ 升级进阶（💎${_pa.price || 680}）</button>',
    to: '<div class="lbl" style="text-align:left;margin-bottom:5px">按通关关卡数解锁，购买「战令(进阶)」解锁高级奖励</div>',
  },
  {
    n: 'M4 「待开发」暴露给玩家',
    from: "'<div class=\"empty\">内容建设中</div>'",
    to: "'<div class=\"empty\">待开发</div>'",
  },
  {
    n: 'M5 好友空状态复活指引句',
    from: "'<div class=\"lbl\">暂无好友</div>'",
    to: "'<div class=\"lbl\">还没有好友，点击下方添加</div>'",
  },
];

function runGuard() {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'shopux.cjs')], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

let caught = 0, missed = 0;
console.log('=== shopux 变异验证 ===');
const base = runGuard();
console.log('基线: exit=' + base.code + (base.code === 0 ? '（绿，符合预期）' : '（红，基线不干净，先修）'));
if (base.code !== 0) { console.log(base.out.slice(-800)); process.exit(1); }

for (const c of CASES) {
  let s = fs.readFileSync(TARGET, 'utf8');
  if (s.indexOf(c.from) < 0) { console.log('  SKIP ' + c.n + ' → 锚点未命中（源码已变更，需更新用例）'); missed++; continue; }
  fs.writeFileSync(TARGET, s.replace(c.from, c.to));
  const r = runGuard();
  const okc = r.code !== 0;
  if (okc) caught++; else missed++;
  console.log('  ' + (okc ? '捕获' : '漏网') + ' ' + c.n + '  exit=' + r.code);
  if (!okc) console.log(r.out.slice(-500));
  fs.writeFileSync(TARGET, ORIG);   // 每组都完整还原，避免上一组污染下一组
}

/* 还原校验 */
const H1 = sha(TARGET);
console.log('\n还原后 sha256 ' + (H1 === H0 ? '一致 ✓' : '不一致 ✗ ' + H1));
const fin = runGuard();
console.log('还原后守卫 exit=' + fin.code + (fin.code === 0 ? '（绿 ✓）' : '（红 ✗）'));
console.log('\n捕获 ' + caught + ' / 漏网 ' + missed);
process.exit(missed === 0 && H1 === H0 && fin.code === 0 ? 0 : 1);
