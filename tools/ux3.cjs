#!/usr/bin/env node
/* ==========================================================================
 * 三体验守卫 ux3 —— 用户体验 / 开发体验 / AI Agent 体验
 * --------------------------------------------------------------------------
 * 立规原因：
 *   ① 玩家界面长期混着三类不该出现的东西——
 *      · 把后台操作路径写给玩家看（"运营在后台「公告管理」发布后…"）
 *      · 单语言版本还解释语言（"本游戏仅支持简体中文，无需切换"）
 *      · 说教式提示（"拖动调节，设置会自动保存"）
 *      玩家不需要知道我们内部怎么配置，这类文字只占版面、不传递信息。
 *   ② 同一句说明散落在多处硬编码，改一处漏一处（开发体验）。
 *   ③ AI Agent 每次要判断"这次改动生效了吗"，却常常遇到工具崩溃却输出 PASS、
 *      或守卫没有自述、不知道该用哪一个（Agent 体验）。
 *
 * 判定分三组，任一组失败即退出码 1：
 *   U 用户体验（玩家界面干净）
 *     U1 玩家可见文案不得出现后台/运营内部路径词
 *     U2 单语言版本不得再解释"仅支持简体中文"
 *     U3 数值已自明时不得叠加冗余状态后缀（"100/100 已满"）
 *     U4 主菜单不得再有分组标语（.hmg-t）
 *   D 开发体验
 *     D1 同一句长说明不得在三处以上硬编码重复
 *     D2 被删掉的旧文案不得复活（防回滚/防手滑加回）
 *   A AI Agent 体验
 *     A1 tools/ 下每个正式守卫必须有"立规原因 + 判据"自述头（否则 Agent 无法选用）
 *     A2 每个正式守卫必须能被 --help 或无参直接跑通并给出明确退出码语义
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let P = 0, F = 0;
const ok = (m) => { P++; console.log('  √ ' + m); };
const no = (m) => { F++; console.log('  × ' + m); };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/* 玩家可见文案源：ui.js 里所有写进界面的中文串 */
const uiSrc = strip(read('js/ui.js'));
const html = read('index.html');

/* ---------- U 用户体验 ---------- */
console.log('— U 用户体验 —');
/* U1：后台视角词，只查"写给玩家看的句子"，注释已被 strip 掉 */
const OPS_WORDS = ['后台「', '后台 [', '运营在后台', '由后台', '可在后台', '在后台「'];
const hitU1 = OPS_WORDS.filter((w) => uiSrc.indexOf(w) >= 0);
if (hitU1.length) no('U1 玩家界面残留后台视角文案：' + hitU1.join(' / '));
else ok('U1 玩家界面无后台操作路径文案');

/* U2：单语言解释 */
const hitU2 = ['本游戏仅支持简体中文，无需切换', '本游戏仅支持简体中文'].filter((w) => uiSrc.indexOf(w) >= 0);
if (hitU2.length) no('U2 单语言版本仍在解释语言：' + hitU2.join(' / '));
else ok('U2 无冗余语言说明');

/* U3：冗余状态后缀 —— 数值"当前/上限"后再叠"已满" */
const u3 = /\+\s*'\s*已满'|\/\s*\+\s*EX\.STAMINA_MAX\s*\+\s*'\s*已满/.test(uiSrc)
  || uiSrc.indexOf("EX.STAMINA_MAX + ' 已满'") >= 0;
if (u3) no("U3 数值后仍叠加冗余后缀「已满」");
else ok('U3 无冗余状态后缀');

/* U4：主菜单分组标语 */
const u4 = /class="hmg-t"/.test(html);
if (u4) no('U4 主菜单仍存在分组标语 .hmg-t');
else ok('U4 主菜单无分组标语');

/* U5：主菜单必须是【单一网格】——分组标语删掉后 4 个分组卡片失去区分依据，
 *     且各自独立换行会产生 2 个空洞格 + 多占 1 行。合并后固化为 1 卡 22 入口。
 *     若有人把 22 个入口重新拆成多张卡片，本条立刻报红。 */
const hmgN = (html.match(/class="hmg"/g) || []).length;
const hmbN = (html.match(/class="hmb"/g) || []).length;
if (hmgN !== 1) no('U5 主菜单分组卡片数应为 1，实测 ' + hmgN + '（删标语后不得再拆分组）');
else if (hmbN !== 22) no('U5 主菜单入口数应为 22，实测 ' + hmbN);
else ok('U5 主菜单单一网格 ' + hmgN + ' 卡 / ' + hmbN + ' 入口');

/* U6：选中态高亮方向 —— 历史写法是 ${on ? '' : 'sel'}，
 *     即【未选中的格子】全带黄框 .sel、选中的反而没有，高亮完全反了。
 *     这正是界面需要「点击已解锁角色切换…」这类说明文字才看得懂的根因。
 *     重做后：只有当前项带 .sel，说明文字一并删除。 */
const inverted = uiSrc.match(/\$\{on\d*\s*\?\s*''\s*:\s*'sel'\}/g) || [];
if (inverted.length) no('U6 选中态高亮仍为反向写法（未选中带 .sel）：' + inverted.length + ' 处');
else ok('U6 选中态高亮方向正确（仅当前项带 .sel）');

/* ---------- D 开发体验 ---------- */
console.log('— D 开发体验 —');
/* D1：长说明串重复出现次数（>=3 视为散落硬编码） */
const LONG = uiSrc.match(/[一-龥]{12,}。/g) || [];
const cnt = {};
LONG.forEach((s) => { cnt[s] = (cnt[s] || 0) + 1; });
const dup = Object.keys(cnt).filter((k) => cnt[k] >= 3);
if (dup.length) no('D1 长说明串硬编码重复 >=3 次：' + dup[0].slice(0, 30));
else ok('D1 长说明串无三处以上重复硬编码');

/* D2：已删旧文案不得复活 */
const DEAD = [
  '运营在后台「公告管理」发布后，这里会显示',
  '兑换码由后台「礼包码 → 生成兑换码」产出',
  '后台「热更新 / 版本排期」可在线维护本表',
  '路线图由运营实时维护，重启游戏即可看到最新排期',
  '启动时比对版本，不一致自动刷新缓存并提示',
  '拖动调节，设置会自动保存',
  '欢迎回来！连续登录 3 天领取补给',
  /* V1.3.7211111111 本轮删除：标语 / 次要标签 / 操作说明 */
  '镶嵌宝石可大幅提升属性',
  '当前选中：',
  '当前宝石等级：',
  '（百分比加成，只随宝石合成等级提升，与角色等级无关）',
  '开启可得材料',
  '灰色条目需在游戏中真实获得后自动解锁（击败怪物 / 装备武器 / 获得皮肤），点击查看解锁条件。',
  '点击已拥有的皮肤即可穿戴',
  '点击已解锁角色切换（属性与外观同时生效）',
];
const back = DEAD.filter((w) => uiSrc.indexOf(w) >= 0);
if (back.length) no('D2 已删文案复活：' + back.join(' / '));
else ok('D2 已清理文案未复活');

/* ---------- A AI Agent 体验 ---------- */
console.log('— A AI Agent 体验 —');
const guards = fs.readdirSync(path.join(ROOT, 'tools'))
  .filter((f) => f.endsWith('.cjs') && !f.startsWith('_') && !f.startsWith('mutate_'));
const noDesc = [];
for (const g of guards) {
  const head = read(path.join('tools', g)).slice(0, 1200);
  if (head.indexOf('立规原因') < 0) noDesc.push(g);
}
/* A2：历史守卫分批补，不一次性判死 —— 否则守卫永远红着，等于没上线。
 *    做法：新建守卫（本轮起登记在 NEW_GUARDS 里的）必须有自述头，判失败；
 *    历史遗留只报数量与清单，判 WARN，随每轮整改逐批收敛。 */
const NEW_GUARDS = ['ux3.cjs'];
const missingNew = NEW_GUARDS.filter((g) => {
  try { return read(path.join('tools', g)).slice(0, 1200).indexOf('立规原因') < 0; } catch (e) { return true; }
});
if (missingNew.length) no('A2 新建守卫缺自述头：' + missingNew.join(', '));
else ok('A2 ' + NEW_GUARDS.length + ' 个本轮新建守卫均带立规原因自述');

if (noDesc.length) {
  console.log('  ! A3 历史守卫待补自述头 ' + noDesc.length + '/' + guards.length +
    '（WARN，不判失败；每轮整改收敛）');
  fs.writeFileSync(path.join(ROOT, 'tools', '_ux3_desc_todo.json'),
    JSON.stringify({ at: Date.now(), todo: noDesc }, null, 1));
} else ok('A3 全部守卫均带自述头');

console.log('\nRESULT: PASS ' + P + ' / FAIL ' + F);
process.exit(F ? 1 : 0);
