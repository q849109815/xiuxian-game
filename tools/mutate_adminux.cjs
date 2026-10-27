#!/usr/bin/env node
/* mutate_adminux.cjs —— 证明 adminux 守卫抓得住缺陷
 * 铁律：抓不住问题的守卫等于不存在。逐条注入坏改动，守卫必须 exit 1；
 * 还原后文件 md5 必须与变异前逐字节一致。
 */
'use strict';
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = ['admin/js/pages.js', 'admin/css/admin.css'];
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');

const MUTS = [
  { id: 'M1', want: ['U1', 'U2'], f: 'admin/js/pages.js',
    a: 'const NOT_READ = wired();',
    b: `const NOT_READ = '<div class="hint" style="margin:8px 0;color:#7ee08a">✅ 已接入游戏端（CFG_FILES）—— 这里保存的配置会在玩家下次登录时生效。</div>';`,
    why: '商城/社交恢复逐字复制的整句徽章（含内部名 CFG_FILES）' },
  { id: 'M2', want: ['U3'], f: 'admin/js/pages.js',
    a: '<h3 style="font-size:13px;margin:16px 0 8px">文案表<span class="tag">${keys.length} 条</span></h3>',
    b: '<div class="fr"><label class="wide">当前语言</label><select id="lg_s" disabled><option value="zh">中文</option></select></div>\n            <h3 style="font-size:13px;margin:16px 0 8px">文案表<span class="tag">${keys.length} 条</span></h3>',
    why: '把 disabled 语言下拉加回来（禁用控件冒充可操作）' },
  { id: 'M3', want: ['U4'], f: 'admin/js/pages.js',
    a: '<div class="fr"><label class="wide">新版本号</label><input id="hv_v" value="${U.esc(H.version || \'\')}"></div>',
    b: '<div class="hint">改版本号需同步改 index.html 里的 ?v= 与 config.js 的 HOT_UPDATE.version，否则玩家拿不到新代码</div>\n            <div class="fr"><label class="wide">新版本号</label><input id="hv_v" value="${U.esc(H.version || \'\')}"></div>',
    why: '恢复「记得手动同步」式静态教训' },
  { id: 'M4', want: ['U6'], f: 'admin/js/pages.js',
    a: '<div class="hint">时限封禁到期后自动解封，无需手工操作</div>',
    b: '<div class="hint">时限封禁到期后自动解封，无需手工操作</div>\n            <div class="hint">时限封禁到期后自动解封，无需手工操作</div>',
    why: '同一句说明被复制到两处' },
  { id: 'M5', want: ['D4'], f: 'admin/css/admin.css',
    a: '.wired{color:#7ee08a;font-size:11.5px;line-height:1.7;margin:8px 0}',
    b: '',
    why: '删掉徽章样式（徽章还在，样式没了）' },
  { id: 'M6', want: ['A1'], f: 'admin/js/pages.js',
    a: 'const multi = L.length > 1;',
    b: 'const multi = true;',
    why: '把多语种自适应写死（单语种精简时误删分支能力）' },
];

const BACK = '.bak_mut_adminux';
fs.mkdirSync(path.join(ROOT, BACK), { recursive: true });
const before = {};
TARGETS.forEach((f) => {
  before[f] = md5(f);
  fs.copyFileSync(path.join(ROOT, f), path.join(ROOT, BACK, path.basename(f)));
});

const run = () => cp.spawnSync('node', ['tools/adminux.cjs'], { cwd: ROOT, encoding: 'utf8' });
const restore = () => TARGETS.forEach((f) => fs.copyFileSync(path.join(ROOT, BACK, path.basename(f)), path.join(ROOT, f)));

/* 先跑基线 */
let r = run();
if (r.status !== 0) { console.log('!! 基线未通过，中止'); restore(); process.exit(1); }
console.log('基线 PASS(exit 0)\n');

let caught = 0, missed = 0;
for (const m of MUTS) {
  restore();
  const p = path.join(ROOT, m.f);
  let s = fs.readFileSync(p, 'utf8');
  const c = s.split(m.a).length - 1;
  if (c < 1) { console.log(`${m.id} !! 注入点不存在`); missed++; continue; }
  s = s.replace(m.a, m.b);
  fs.writeFileSync(p, s);
  const rr = run();
  const bad = rr.status !== 0 && m.want.every((w) => (rr.stdout || '').includes('FAIL ' + w));
  if (bad) { caught++; console.log(`${m.id} 捕获 ✓  ${m.why}  → ${m.want.join(',')} 报红`); }
  else { missed++; console.log(`${m.id} 未捕获 ✗  ${m.why}  exit=${rr.status}`); }
}
restore();
const after = {};
TARGETS.forEach((f) => { after[f] = md5(f); });
const clean = TARGETS.every((f) => before[f] === after[f]);
console.log('\n变异捕获 ' + caught + '/' + MUTS.length + '，还原后字节一致：' + (clean ? '是' : '否'));
if (!clean) TARGETS.forEach((f) => console.log('  ' + f + ' ' + before[f] + ' -> ' + after[f]));
r = run();
console.log('还原后守卫 exit=' + r.status);
process.exit(missed === 0 && clean && r.status === 0 ? 0 : 1);
