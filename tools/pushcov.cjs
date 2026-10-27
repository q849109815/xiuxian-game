#!/usr/bin/env node
/**
 * 上传清单覆盖守卫（pushcov）
 * 职责：防止「本地改了、线上没有」——工具修好了却传不上去，等于没修。
 *
 * 事故背景：
 *   绩效工具 tools/kpi.cjs 修好了「换人台账对不上」的缺陷，但 push.py 的
 *   上传清单里根本没有它 —— 这份修复永远留在本地，线上仍跑旧版。
 *   与 assets/char、assets/scene、data/zb/roadmap.json、roadmap 双分支
 *   分叉是同一类洞的第 N 次复发：
 *     【文件不在上传清单 => 改动永远到不了线上，且无人告警】
 *
 * 覆盖面（三处来源取并集，任一缺失即 FAIL）：
 *   1) dash.cjs 登记的常驻工具数组
 *   2) dash.cjs 实际 spawn 调用的工具（新守卫接进看板后自动被覆盖）
 *   3) 显式核心集：绩效 / 人事 / 看板自身 / 本守卫
 *
 * 另加两条：
 *   N1 清单内不得有本地不存在的文件（占位符、拼错路径会让 check 永远跳过）
 *   E1 路径编码必须已修（中文文件名传不上去的根因）
 *
 * 用法：node tools/pushcov.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let P = 0, F = 0;
const ok = (n, c, d) => { if (c) { P++; } else { F++; console.log('FAIL ' + n + ' :: ' + d); } };

const pushSrc = fs.readFileSync(path.join(ROOT, 'tools/push.py'), 'utf8');
const dashSrc = fs.readFileSync(path.join(ROOT, 'tools/dash.cjs'), 'utf8');

/* --- 解析 push.py 的 FILES 清单 --- */
const mFiles = pushSrc.match(/FILES\s*=\s*\[([\s\S]*?)\n\]/);
if (!mFiles) { console.log('FAIL 解析 :: push.py 里找不到 FILES 清单'); process.exit(1); }
// 只取引号内路径，去掉注释里的中文说明（注释中也可能含引号路径样例）
const LIST = new Set();
for (const mm of mFiles[1].matchAll(/^\s*'([^'\n]+)',\s*(?:\/\/.*)?$/gm)) LIST.add(mm[1]);

/* --- 1) dash.cjs 登记的常驻工具数组 --- */
const mTools = dashSrc.match(/const tools\s*=\s*\[([^\]]*)\]/);
const A = mTools ? [...mTools[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
ok('U1-常驻数组已解析', A.length >= 20, '只解析到 ' + A.length + ' 个');

/* --- 2) dash.cjs 实际 spawn 调用的工具 --- */
const B = [...new Set([...dashSrc.matchAll(/'(tools\/[A-Za-z0-9_]+\.(?:cjs|py))'/g)].map(x => x[1]))];

/* --- 3) 显式核心集 --- */
const C = ['kpi.cjs', 'hr.cjs', 'dash.cjs', 'pushcov.cjs', 'mutguard.cjs', 'fullscan.cjs'];

const need = [...new Set([...A.map(t => 'tools/' + t), ...B, ...C.map(t => 'tools/' + t)])];
const miss = need.filter(f => !LIST.has(f));
ok('U2-上传清单全覆盖', miss.length === 0,
   miss.length + ' 个文件改动永远传不上线: ' + miss.slice(0, 8).join(', '));

/* --- U3 本地所有工具都必须在清单里（U2 只覆盖"已被 dash 登记"的，
 *     新建工具尚未登记时 U2 照样全绿 —— 这正是 adminux.cjs 漏登记的成因） --- */
/* 下划线开头的是一次性诊断脚本（_btdump / _audit 等），不属于常驻工具，不要求上传 */
const ONDISK = fs.readdirSync(path.join(ROOT, 'tools'))
  .filter((f) => (f.endsWith('.cjs') || f.endsWith('.py')) && !f.startsWith('_'))
  .map((f) => 'tools/' + f);
const missDisk = ONDISK.filter((f) => !LIST.has(f));
ok('U3-本地工具全部登记', missDisk.length === 0,
   missDisk.length + ' 个本地工具不在清单，改动永远传不上线: ' + missDisk.slice(0, 10).join(', '));

/* --- N1 清单内文件必须真实存在（占位符/拼错会让 check 静默跳过） --- */
const ghost = [...LIST].filter(f => !fs.existsSync(path.join(ROOT, f)));
ok('N1-清单无幽灵路径', ghost.length === 0, '本地不存在却被登记: ' + ghost.slice(0, 5).join(', '));

/* --- E1 中文/特殊字符路径必须做 URL 编码 --- */
ok('E1-路径已编码', /def apipath\(/.test(pushSrc) && /quote\(/.test(pushSrc) &&
   /contents\/%s\?ref=main' % apipath\(path\)/.test(pushSrc) &&
   /contents\/' \+ apipath\(f\)/.test(pushSrc),
   '未做 percent-encoding，中文文件名传不上去（报告类文件全部受影响）');

/* --- E2 编码函数真的能处理中文 --- */
const enc = '制作人周报_测试.md'.split('/').map(encodeURIComponent).join('/');
ok('E2-中文编码可用', enc.length > 0 && !/[\u4e00-\u9fa5]/.test(enc) && /%E5/.test(enc),
   '编码结果异常: ' + enc);
ok('E3-JS侧编码不破坏分隔符', 'a/b.md'.split('/').map(encodeURIComponent).join('/') === 'a/b.md',
   '分隔符被错误编码，路径会整体失效');

console.log('\n上传清单覆盖守卫：PASS ' + P + ' / FAIL ' + F);
process.exit(F ? 1 : 0);
