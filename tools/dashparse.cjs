#!/usr/bin/env node
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

module.exports = { parseBI, taComplete };
