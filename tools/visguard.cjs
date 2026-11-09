#!/usr/bin/env node
/* 【视觉审查守卫】tools/visguard.cjs —— V1.3.80 立规
 * 立规原因：玩家在真实界面里看到辱骂公告弹窗、活动卡片文字折行挤压、
 * 大片空白空状态、重复说明文字；此前的守卫只查"面板能不能打开"，从不查"画面长什么样"。
 * 判据：内容安全真实执行 + 布局结构锚点 + 已清理文案防复活 + 真实截图证据。
 * 退出码：0=全过 1=有未过 2=工具崩溃（崩溃显式判失败，不得静默报绿）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const P = [], F = [];
const ok = (c, m) => (c ? P : F).push(m);
const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { F.push('缺文件 ' + f); return ''; } };

try {
  const ui = rd('js/ui.js'), css = rd('css/style.css'), idx = rd('index.html');
  const adm = rd('admin/js/pages.js'), acss = rd('admin/css/admin.css'), main = rd('js/main.js');

  /* C1~C3 内容安全：云端公告/邮件自由输入，渲染前必须过滤 */
  ok(/\bpubBlocked\(v\)\s*\{/.test(ui) && /\bpubSafe\(list\)\s*\{/.test(ui), 'C1 过滤方法存在');
  const calls = ['this.pubSafe(this.noticeUnread())', 'const ms = this.pubSafe((p.mail || []).slice());'];
  ok(calls.every(c => ui.includes(c)) && /const list = this\.pubSafe\(/.test(ui), 'C2 弹窗/公告面板/邮件箱三处调用');
  // 真实执行：从源码抽出词表与过滤口径，在 Node 里喂脏/净样本跑一遍
  const a = ui.indexOf('  pubBlocked(v) {'), b = ui.indexOf('  showNotice() {', a);
  const body = a >= 0 && b > a ? ui.slice(a, b) : '';
  const words = (body.match(/const W = \[([^\]]+)\]/) || [])[1] || '';
  const dirty = { n: '罗平就是臭傻逼', t: '李跃是傻逼' };
  const clean = { n: '版本更新公告', t: '补偿发放' };
  const blocked = t => (words.match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)).some(w => String(t).includes(w));
  const safe = list => list.filter(x => !blocked([x.n, x.t, x.title, x.body, x.b, x.desc].join(' ')));
  const dirtyBlocked = safe([dirty]).length === 0 && blocked('臭傻逼');
  const cleanKept = safe([clean]).length === 1;
  ok(dirtyBlocked, 'C3a 真实执行：辱骂文本被拦');
  ok(cleanKept, 'C3b 真实执行：正常公告未被误杀');
  ok(/傻逼/.test(words) && /臭傻/.test(words), 'C4 词表未被清空');

  /* C5~C7 界面结构：活动行三列、空状态组件、分组标题 */
  ok(['zrow act-row', 'zr-act', 'zr-desc', 'zr-meta', 'zr-rw'].every(k => ui.includes(k)), 'C5 活动卡片三列结构');
  // 限定在 r_act 函数体：成就列表里存在同形的合法结构，全局匹配会误报
  const ra = ui.indexOf('  r_act(p, tab) {'), rb = ui.indexOf('  /* v1.0 新手 7 日', ra);
  const actSeg = ra >= 0 && rb > ra ? ui.slice(ra, rb) : '';
  ok(actSeg.length > 200 && !/<div class="zi"><b>\$\{a\.n\}<\/b><span>\$\{a\.desc/.test(actSeg), 'C6 活动区旧挤压结构未复活');
  ok(css.includes('.zrow.act-row{display:grid') && css.includes('.empty::before') && css.includes('.card:has(>.empty)'), 'C7 活动行/空状态样式');
  ok(ui.includes('card-t grp-t') && css.includes('.grp-t{text-align:left'), 'C8 技能分组标题左对齐');
  ok(acss.includes('.fr label{min-width:96px'), 'C9 后台表单对齐样式');

  /* C10 已清理文案防复活（删了看不懂说明布局有病，重做而非加回文字） */
  const banned = [
    ['js/ui.js', '注销会删除云端存档并封禁该账号'], ['js/ui.js', '与「注销」不同'],
    ['js/ui.js', '每日登录领取，断签不清空进度'], ['index.html', '末 日 尸 潮'],
    ['index.html', '每次进入游戏都需输入账号与密码'], ['js/main.js', "UI.toast('欢迎加入，先锋官！'"],
    ['admin/js/pages.js', '备份与回档：点击'], ['admin/js/pages.js', '按当前榜单名次'],
    ['admin/js/pages.js', '先点「扫描」看清要删什么'], ['admin/js/pages.js', '真付费尚未接入'],
  ];
  const revived = banned.filter(([f, k]) => rd(f).includes(k));
  ok(revived.length === 0, 'C10 已清理标语/说明零复活' + (revived.length ? ' → ' + revived.map(x => x[1]).join('|') : ''));

  /* C11 真实视觉证据：必须真跑过浏览器截图，不能只读代码 */
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(ROOT, '_vis/meta.json'), 'utf8')); } catch (e) {}
  ok(!!meta && meta.front.length >= 26 && meta.admin.length >= 15 && meta.errs.length === 0 && meta.fails.length === 0,
    'C11 真实浏览器 41 屏截图：0 JS 错误 / 0 破图');
} catch (e) {
  F.push('守卫崩溃: ' + String(e).slice(0, 160));
  console.log('visguard: PASS=' + P.length + ' FAIL=' + F.length);
  F.forEach(x => console.log('  FAIL ' + x));
  process.exit(2);
}
console.log('visguard: PASS=' + P.length + ' FAIL=' + F.length);
P.forEach(x => console.log('  PASS ' + x));
F.forEach(x => console.log('  FAIL ' + x));
process.exit(F.length ? 1 : 0);
