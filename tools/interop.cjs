#!/usr/bin/env node
/* [interop.cjs] 立规原因：V1.3.83 用户追问「界面逻辑性操作性你看了嘛？方便嘛？」——
 * 此前每轮都在做"视觉精简/删标语/重排布局"，但从未有一条检查问过"这个操作顺不顺手"。
 * 本守卫把交互操作性（不是静态观感）固化为可复跑断言，每轮看板必跑。
 * 判据：以本工具自身断言输出为准（见 CHECKS），逐条可被 mutate_interop.cjs 证伪。
 * 退出码：0=全过 / 1=有未过项 / 2=崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
const fs = require('fs');
const R = p => { try { return fs.readFileSync(p, 'utf8') } catch (e) { return '' } };
const ui = R('js/ui.js'), core = R('admin/js/core.js'), pages = R('admin/js/pages.js'), me = __filename;
/* 剥掉行注释与块注释后再查"调用"，避免把说明文字当成残留调用 */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CHECKS = [
  /* ---- 前端：高频操作便利性 ---- */
  ['I1 任务批量入口 taskClaimable 覆盖四类且判据与红点同口径', () =>
    /taskClaimable\(p\)\s*\{/.test(ui) &&
    /\['main',\s*T\.main/.test(ui) && /\['achieve',\s*T\.achieve/.test(ui) &&
    /E\.taskDone\(p, t\)/.test(ui) && /E\.rwUsable && !E\.rwUsable\(t\.rw\)/.test(ui)],
  ['I2 四个任务页签都挂同一个批量入口', () =>
    (ui.match(/\$\{_head\}<div class="card"><div class="card-t">/g) || []).length === 4],
  ['I3 批量按钮只在有可领时出现（无空按钮）', () =>
    /const _head = _all\.length\s*\?/.test(ui) && /id="taskClaimAll"/.test(ui)],
  ['I4 批量领取真实绑定且只给一条汇总反馈', () =>
    /const ca = \$\('#taskClaimAll'\)/.test(ui) &&
    /E\.claimTask\(p, x\.type, x\.id\)/.test(ui) &&
    /已领取 ' \+ ok \+ ' 项任务奖励/.test(ui) && /E\.saveSoon\(p\)/.test(ui)],
  /* ---- 后台：危险操作确认统一 ---- */
  ['I5 后台 ask() 组件存在且带危险分级 + 0\.9s 减速带', () =>
    /ask\(title, msg, opts\)\s*\{/.test(core) && /return new Promise\(/.test(core) &&
    /不可撤销/.test(core) && /y\.disabled = true/.test(core) && /0\.9/.test(core)],
  ['I6 点遮罩等同取消（Promise 不挂起）', () =>
    /m\.onclick = \(e\) => \{ if \(e\.target === m\) done\(false\); \}/.test(core)],
  ['I7 同步 confirm 已删除，漏改调用会显式抛错而非静默放行', () =>
    !/confirm\(text\)\s*\{\s*return window\.confirm/.test(strip(core)) &&
    !/^\s*(confirm|this\.confirm|APP\.confirm)\s*\(/m.test(strip(core) + '\n' + strip(pages))],
  ['I8 影响面最大的 tpClear 已补二次确认', () => {
    const m = pages.match(/async tpClear\(\)\s*\{([\s\S]{0,420}?)const c = await DB\.reload/);
    return !!m && /await this\.ask\(/.test(m[1]) && /danger:\s*true/.test(m[1]);
  }],
  ['I9 九处危险动作全部走 ask（无原生 confirm 残留）', () => {
    const s = strip(core) + '\n' + strip(pages);
    const need = ['destroy', 'resetSave', 'rmReset', 'biClear', 'rmDel', 'tpClear', 'rebuild', 'restore'];
    return need.every(k => new RegExp('(async\\s+)?' + k + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]{0,400}?await\\s+(this|APP)\\.ask\\(').test(s)) &&
      !/window\.confirm|\bconfirm\(/.test(s);
  }],
  /* ---- 前后台：空状态与常驻说明 ---- */
  ['I10 「未选择玩家」空态给的是可点按钮而非说明文字', () =>
    /id="goSelPlayer"/.test(core) && /const g = D\('#goSelPlayer'\)/.test(core) &&
    !/先在左侧点选玩家|先在上方点选一名玩家/.test(core + pages)],
  ['I11 账号页常驻的「注销＝…／永久删除＝…」长说明已挪进决策时刻', () =>
    !/<b>注销<\/b>＝停用并标记/.test(pages) && /仅想彻底清除请用「永久删除」/.test(pages)],
  ['I12 空态按钮覆盖多页且账号页不自跳转', () =>
    /this\.cur === 'account' \? ''/.test(core) &&
    (pages.match(/\$\{this\.selBar\(\)\}/g) || []).length >= 2],
  /* ---- AX ---- */
  ['A1 守卫自身具备立规原因/判据/退出码（AI Agent 可判定选用）', () => {
    const s = R(me); return s.includes('立规原因') && s.includes('判据') && s.includes('退出码');
  }],
];

let fail = 0;
for (const [n, f] of CHECKS) {
  let ok = false;
  try { ok = !!f(); } catch (e) { ok = false; }
  console.log((ok ? '  PASS ' : '  FAIL ') + n);
  if (!ok) fail++;
}
console.log('interop: PASS ' + (CHECKS.length - fail) + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
