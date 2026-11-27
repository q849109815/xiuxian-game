#!/usr/bin/env node
/* 【dashparse.cjs】立规原因：本工具为常驻守卫，历史上缺自述头，AI Agent 无法判断该不该选用。
 * 判据：以本工具自身断言输出为准（见文件内实现）。
 * 退出码语义：0=全部通过 / 1=存在未过项 / 2=工具崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
/* ============================================================================
 * tools/dashparse.cjs —— 进度看板判据共享模块（V1.3.77）
 * ----------------------------------------------------------------------------
 * 为什么要抽出来：
 *   V1.3.77 事故 —— biguard.cjs 实际输出 `biguard: PASS=12 FAIL=0`，
 *   而 dash.cjs 里写死的判据是 `/biguard: PASS (\d+) FAIL (\d+)/`（无等号），
 *   永远匹配不到，看板长期显示「埋点数据链路守卫 未跑通✗」；
 *   单独跑 biguard 却 exit=0 全绿。判据与实现散在两处，改了一边忘了另一边。
 *
 *   现在判据集中在这一个模块：看板（dash.cjs）与守卫（dashcons.cjs）
 *   require 同一份实现，任何一边改动都会立刻被另一边验证到。
 *   这就是「开发体验」和「AI Agent 使用体验」同时变好的具体做法：
 *   不再需要靠人肉记住「输出格式和正则要同步改」。
 * ==========================================================================*/
'use strict';

/* 埋点守卫输出解析。
 *  - 等号可选：PASS=12 / PASS 12 都认（工具输出格式演进不应让看板误报）
 *  - 大小写不敏感、允许任意空白
 *  - 退出码必须为 0：崩溃/超时（status !== 0 或 null）一律返回 null，
 *    看板判「未跑通✗」，绝不允许靠 stdout 里残留的 PASS 字样蒙混过关
 *  - FAIL>0 必须原样保留，不能把真失败吞成「未跑通」
 */
function parseBI(out, status) {
  if (status !== 0) return null;
  const m = String(out || '').match(/biguard:\s*PASS=?\s*(\d+)\s+FAIL=?\s*(\d+)/i);
  if (!m) return null;
  return { p: +m[1], f: +m[2] };
}

/* 工具体检快照完整性（对应 V1.3.77 残快照事故）。
 *  - 必须有 rows 且 complete !== false（toolaudit 分批未跑完会标 false）
 *  - 行数必须覆盖注册 GUARDS 全量，否则「可信 N/M」的 M 是假的
 *  - 每行不得空跑（pass=0 且 fail=0 = 工具崩了却落了一行）
 * 任一不满足 → false，看板显示「残快照←需重跑✗」，不拿残数字冒充结论。
 */
function taComplete(ta, names) {
  if (!ta || !Array.isArray(ta.rows)) return false;
  if (ta.complete === false) return false;
  if (names && names.length && (ta.total || 0) < names.length) return false;
  if (ta.rows.some(r => ((+r.pass || 0) + (+r.fail || 0)) === 0)) return false;
  return true;
}

/* 工具体检时效证（V1.3.96 收口改写）。
 * 旧判据拿「GUARDS 文件 mtime 是否早于快照 mtime」判断新鲜度，
 * 但 mistmut 的 M9 用例会注入 tools/themeguard.cjs 再还原，
 * 还原必然刷新 mtime；本沙盒 fs.utimesSync 报 EPERM 无法回退，
 * 于是每跑一次看板就把「可信 32/34」误判成「已过期←需重跑」。
 * mtime 不是内容——用它判断「工具变没变」本就不可靠。
 *
 * 新判据：① 快照年龄在 30 分钟内；② rows 名字覆盖 GUARDS 全量。
 * 第 ② 条同时接住了旧判据真正想防的「新工具注册了却没体检过」：
 * 新名字不在 rows 里，直接判不新鲜，不必比较任何时间戳。
 */
function taFresh(ta, names, snapMs, now) {
  if (!ta || !ta.at || !snapMs) return false;
  const age = (Number(now) || Date.now()) - snapMs;
  if (age < 0 || age > 30 * 60 * 1000) return false;
  if (!Array.isArray(ta.rows) || !Array.isArray(names) || !names.length) return false;
  const bare = n => String(n).replace(/\.(cjs|py)$/, '');
  const have = new Set(ta.rows.map(r => bare(r && r.name)));
  return names.every(n => have.has(bare(n)));
}

module.exports = { parseBI, taComplete, taFresh };
