#!/usr/bin/env node
/* ==========================================================================
 * 【删文案 · 视觉替代一致性守卫】tools/uxdel.cjs
 *
 * 立规原因：
 *   「删除多余的标语、说明文字和次要标签；如果删除就看不懂了，那就说明布局
 *    本身有问题，直接重新设计重做」这条规矩执行两轮后，ux3.cjs / adminux.cjs
 *    判的都是【黑名单】——只查"文字还在不在"，从来没有任何一条检查问过
 *    【删完之后还看不看得懂】。
 *
 *   V1.3.75 实测抓到的活样本：后台「公告管理」挂着一段长说明
 *   「当前状态：已接入 —— 发布后玩家登录即弹窗…过期公告不会显示」，
 *   而下面的公告列表只有【时间/类型/标题/操作】四列，运营根本看不出
 *   哪条公告已经过期下线，只能靠那句话想象。这是典型的"布局有病靠文字治"：
 *   删了说明就看不懂，不删就是一段没人读的机制说明。
 *
 *   更危险的是反向风险：选中态高亮 CSS 一旦被后人删掉或改回同色，
 *   「点选即换，自动保存」这句又已经被删了，界面就真的看不懂 ——
 *   而 ux3 的全绿不会有任何变化。黑名单守卫挡不住这种回退。
 *
 * 判据（三组，任一失败即退出码 1）：
 *   U 删得干净：已删文案不得复活（玩家端 3 处 + 后台 2 处）
 *   R 删了还看得懂：每条删除项必须有【布局自身的视觉替代】，且替代要真实接线，
 *     不是"写了个函数没人调"。公告状态判定用纯函数在 Node 里真实执行 4 组。
 *   K 保留项：含真实差异信息的说明不算"多余"，登记在案防止后人一刀切误删
 *   D 开发体验：状态口径只在一处定义，列表渲染调用它，不重写一遍 if/else
 *   A AI Agent 体验：自述头、判据、退出码语义齐备；工具自身异常显式判失败，
 *     绝不静默报绿（历史多轮"工具崩了却输出 PASS"即由此而来）
 *
 * 分级：U1~U3 玩家可见（五证口径）／U4~U5 运营可见／R1~R6 结构证。
 * 用法：node tools/uxdel.cjs
 * 退出码：0 全过 ／ 1 有缺陷（含本守卫自身异常）
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let P = 0, F = 0;
const ok = (m) => { P++; console.log('  √ ' + m); };
const no = (m) => { F++; console.log('  × ' + m); };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* 注释不参与判定：注释里出现旧文案是事故档案，不是界面文案 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

try {
  const ui = strip(read('js/ui.js'));
  const pages = strip(read('admin/js/pages.js'));
  const css = read('css/style.css');
  const self = read('tools/uxdel.cjs');

  /* ---------------- U 用户体验：删得干净 ---------------- */
  console.log('— U 删得干净 —');
  const DEAD_UI = [
    '点选即换，自动保存',
    '暂无排行数据，通关后自动上传',
    '换设备时用同一账号名+密码登录，存档自动继承',
  ];
  const back = DEAD_UI.filter((w) => ui.indexOf(w) >= 0);
  if (back.length) no('U1 玩家端已删说明复活：' + back.join(' / '));
  else ok('U1 玩家端 3 处冗余说明已清除');

  if (/暂无排行数据/.test(ui)) ok('U2 排行榜空状态保留自解释短文案');
  else no('U2 排行榜空状态被整段删空（连"暂无排行数据"都没了）');

  const DEAD_ADM = [
    '<span class="tag">已接入前端</span>',
    '当前状态：<span class="bd g">已接入</span>',
    '发布后玩家登录即弹窗提示',
    '过期（展示至日期已过）的公告不会显示',
  ];
  const backA = DEAD_ADM.filter((w) => pages.indexOf(w) >= 0);
  if (backA.length) no('U3 后台公告页旧 tag / 长说明残留：' + backA.join(' / '));
  else ok('U3 后台公告页次要标签与长说明已清除');

  if (/<h3>公告管理<\/h3>/.test(pages)) ok('U4 公告页标题保留且不再挂状态标签');
  else no('U4 公告页标题结构异常');

  /* ---------------- R 视觉替代：删了还看得懂 ---------------- */
  console.log('— R 删了还看得懂（布局自解释） —');
  /* R1 头像：选中项必须真的带 .on */
  if (/p\.avatar === a \? ' on' : ''/.test(ui)) ok('R1 头像弹窗选中态接线：当前项带 .on');
  else no('R1 头像弹窗选中态接线丢失（删了说明后玩家分不清当前头像）');

  /* R2 样式：.on 必须与默认态有可见差异，不能只是同名空规则 */
  const onRule = css.match(/\.avp-c\.on\{([\s\S]*?)\}/);
  const defRule = css.match(/\.avp-c\{([\s\S]*?)\}/);
  if (!onRule) no('R2 找不到 .avp-c.on 样式规则（高亮没了，说明却已删）');
  else if (!/border-color\s*:\s*var\(--q-y2\)/.test(onRule[1]))
    no('R2 .avp-c.on 不再有高亮色（与默认态无法区分）');
  else if (defRule && /border\s*:\s*2px solid var\(--q-y2\)/.test(defRule[1]))
    no('R2 默认态与选中态同色，选中态等于没有');
  else ok('R2 .avp-c.on 高亮色与默认边框色不同，选中可辨');

  /* R3 "自动保存"这句话删了，就必须真有保存动作 */
  const pick = ui.slice(ui.indexOf('pickAvatar()'), ui.indexOf('pickAvatar()') + 1400);
  if (/E\.save\(p\)/.test(pick)) ok('R3 点选后真实落盘 E.save(p)，"自动保存"不是空话');
  else no('R3 点选后没有保存动作，删掉说明等于骗玩家');

  /* R4 公告列表：状态必须由列呈现，而不是由说明文字呈现 */
  const table = pages.slice(pages.indexOf('async ntReload()'), pages.indexOf('async ntDel('));
  if (/\['时间', '类型', '标题', '展示至', '状态', '操作'\]/.test(table))
    ok('R4 公告列表含「展示至 / 状态」两列，状态可视化');
  else no('R4 公告列表缺状态列（删了长说明后运营看不出哪条已过期）');
  if (/noticeState\(x, _now\)/.test(table)) ok('R5 列表渲染真实调用状态函数');
  else no('R5 状态函数定义了却没被列表调用（零调用 = 没接线）');

  /* R6 真实执行断言：把纯函数抽出来在 Node 里跑，不靠字符串匹配 */
  const fm = pages.match(/const noticeState = \(x, now\) => \{[\s\S]*?\n\};/);
  if (!fm) no('R6 抽不到 noticeState 纯函数');
  else {
    const ctx = vm.createContext({ Number, Math, Date });
    vm.runInContext(fm[0] + '\n;globalThis.__f = noticeState;', ctx);
    const f = ctx.__f;
    const NOW = 1770000000000;
    const cases = [
      [{ title: '长期公告' }, NOW, '长期'],
      [{ endAt: NOW + 86400000 }, NOW, '生效中'],
      [{ endAt: NOW - 86400000 }, NOW, '已过期'],
      [{ endAt: NOW }, NOW, '生效中'],       // 边界：展示至当天仍应生效
    ];
    const bad = cases.filter((c) => f(c[0], c[1]) !== c[2]);
    if (bad.length) no('R6 状态判定真实执行失败：' + bad.length + '/4 组结果错误');
    else ok('R6 状态判定真实执行 4/4 通过（含展示至当天边界）');
  }

  /* ---------------- K 保留项：不是所有说明都该删 ---------------- */
  console.log('— K 保留项（防一刀切误删） —');
  const KEEP = '战斗中点击立即生效；战斗外使用将在下一场自动生效';
  const nKeep = (ui.match(/战斗中点击立即生效；战斗外使用将在下一场自动生效/g) || []).length;
  /* 这句含真实差异信息（战斗内外生效时机不同），删了确实看不懂，
   * 按规矩属于"该重做布局"而非"该一删了之"，登记在案等重做方案落地后再删。 */
  if (nKeep >= 2) ok('K1 必要说明仍在（' + nKeep + ' 处），已登记待布局重做后再删');
  else no('K1 必要说明被误删：' + KEEP.slice(0, 14) + '…（删了玩家不知道战斗外何时生效）');

  /* ---------------- D 开发体验：单一口径 ---------------- */
  console.log('— D 开发体验 —');
  const nDef = (pages.match(/const noticeState = \(x, now\) =>/g) || []).length;
  if (nDef === 1) ok('D1 状态口径只定义一处，不散落硬编码');
  else no('D1 noticeState 定义 ' + nDef + ' 处（应为 1）');
  if (!/const st = noticeState/.test(table) || /endAt\s*>=?\s*Date\.now\(\)/.test(table))
    no('D2 列表里重写了一遍状态判断（口径分叉）');
  else ok('D2 列表不重复实现状态判断');

  /* ---------------- A AI Agent 体验 ---------------- */
  console.log('— A AI Agent 体验 —');
  const head = self.slice(0, 2200);
  if (/立规原因/.test(head) && /判据/.test(head) && /退出码/.test(head))
    ok('A1 自述头含立规原因 / 判据 / 退出码语义');
  else no('A1 自述头不完整，Agent 无法判断该不该用本守卫');
  if (/process\.exit\(F \? 1 : 0\)/.test(self) && /RESULT: PASS/.test(self))
    ok('A2 输出 RESULT 行且退出码与 FAIL 数一致');
  else no('A2 退出码语义不明确');
  if (/catch \(e\)[\s\S]{0,300}no\(/.test(self))
    ok('A3 工具自身异常显式判失败，不静默报绿');
  else no('A3 缺少异常兜底');
} catch (e) {
  /* 工具崩了必须显式判失败 —— 历史上多次"崩溃却输出 PASS"就是漏了这一条 */
  no('AX-EXCEPTION 守卫自身异常：' + (e && e.message ? e.message : String(e)));
}

console.log('\nRESULT: PASS ' + P + ' / FAIL ' + F);
console.log(F ? '判据：任一 FAIL 即视为「删了看不懂 / 说明复活」，禁止发布'
             : '判据：文案已清且每条删除均有布局替代，玩家与运营仍看得懂');
process.exit(F ? 1 : 0);
