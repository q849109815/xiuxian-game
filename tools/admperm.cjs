#!/usr/bin/env node
/* admperm.cjs —— 后台权限覆盖守卫
 *
 * 背景：admin/js/core.js 的 PERM.canAct() 对「未映射的动作」一律 return true
 * （失败开放）。只要新加一个写操作按钮却忘了写进 PERM.ACT，
 * 任何低权限角色都能点——GM 能推热更、只读审计能清空日志。
 *
 * 本工具不靠动作名猜，而是直接看处理函数里有没有真实写入：
 *   DB.set / pushOp / AUDIT.clear / localStorage 删除  → 视为写操作
 * 写操作必须出现在 PERM.ACT 里，否则 FAIL。
 *
 * 用法: node tools/admperm.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'admin/js/core.js'), 'utf8');
const pages = fs.readFileSync(path.join(ROOT, 'admin/js/pages.js'), 'utf8');

/* 1. 取 PERM.ACT 已映射的键 —— 连同它映射到的权限字符串
 *
 * 【V1.2.3 维护轮3 修复】此前只校验「动作有没有映射」，从不校验
 * 「映射到的权限字符串是否真实存在」。实测变异验证发现：
 *   把 hkNow: 'hotfix.push' 改成 hkNow: 'hotfix.pushX'，守卫依然 PASS。
 *   后果：一个拼错的权限名，等价于把该动作从权限表里摘掉 ——
 *   has() 对所有角色都返回 false，超级管理员也点不了；
 *   反之若有人填成 'all' 则是彻底放行。两者都是越权，必须拦。 */
const m = braceBlock(core, 'ACT');
const mapped = new Set();
const actPerm = new Map();          /* 动作 → 权限字符串 */
if (m) for (const mm of m.matchAll(/([A-Za-z0-9_]+)\s*:\s*'([^']+)'/g)) {
  mapped.add(mm[1]); actPerm.set(mm[1], mm[2]);
}

/* 1b. 取权限字典：优先 PERM.PERMS 显式字典；
 * 字典缺失时退化为「ROLES 授予表里出现过的权限」（弱校验，仅兜底）。
 *
 * 【V1.2.3 维护轮3】权限字典的引入原因见 core.js 中 PERMS 的注释：
 * 没有字典就无法区分「仅超管（最小权限设计）」与「拼错的权限名」，
 * 变异验证实测证明这一点 —— hkNow:'hotfix.pushX' 曾一路 PASS。 */
function permDict() {
  const pb = core.match(/PERMS:\s*\[([\s\S]*?)\n {2}\],/);
  if (pb) {
    const s = new Set();
    for (const mm of pb[1].matchAll(/'([a-zA-Z][a-zA-Z0-9_.]*)'/g)) s.add(mm[1]);
    if (s.size) return { set: s, src: 'PERMS 字典' };
  }
  return { set: definedPerms, src: 'ROLES 授予表（弱）' };
}

/* 1c. 取 ROLES 里真实定义过的权限集合（支持 xxx.* 通配与 'all'）
 * 注意：不能用 /ROLES:\s*\{([\s\S]*?)\n {2}\},/ 惰性匹配——
 * 实测它会提前截断（只抓到 631 字符，丢掉 plan/devops/audit 三个角色），
 * 导致合法权限被误判成未定义。改用花括号配平提取，才抓得全。 */
function braceBlock(src, key) {
  const k = src.indexOf(key + ': {');
  if (k < 0) return '';
  let i = src.indexOf('{', k), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(k, i + 1); }
  }
  return '';
}
const definedPerms = new Set(['all']);
const roleBlock = braceBlock(core, 'ROLES');
/* 字符类必须含 `*`：ROLES 里大量权限是 'xxx.*' 通配，
 * 漏掉 * 会把所有通配权限丢掉（实测只剩 12 个具体权限），
 * 于是合法权限被误判成未定义。 */
if (roleBlock) for (const mm of roleBlock.matchAll(/'([a-zA-Z][a-zA-Z0-9_.*]*)'/g)) definedPerms.add(mm[1]);
const DICT = permDict();
const permValid = p => DICT.set.has(p);
/* 是否被任何「非超管」角色持有 —— 仅用于提示，不作 FAIL 依据
 * （bi.clear / log.clear 这类破坏性操作故意只给超管，属最小权限设计） */
const grantedToSomeRole = p => {
  for (const d of definedPerms) {
    if (d === 'all' || d === 'GM' || !d.includes('.')) continue;
    if (p === d || (d.endsWith('.*') && p.startsWith(d.slice(0, -1)))) return true;
  }
  return false;
};

/* 2. 取页面里出现的所有 data-a 动作 */
const acts = new Set();
for (const mm of pages.matchAll(/data-a="([A-Za-z0-9_]+)"/g)) acts.add(mm[1]);

/* 3. 在 pages.js 里定位每个动作的处理函数体，判断是否为写操作 */
const WRITE_RE = /\bDB\.set\s*\(|\bpushOp\s*\(|\bAUDIT\.clear\s*\(|localStorage\.removeItem/;
function handlerBody(name) {
  /* 形如:  name (t) { ... }  或  async name (t) { ... } —— 取到匹配的右花括号 */
  const re = new RegExp('(?:async\\s+)?' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const hit = pages.match(re);
  if (!hit) return '';
  let i = hit.index + hit[0].length - 1, depth = 0;
  for (; i < pages.length; i++) {
    if (pages[i] === '{') depth++;
    else if (pages[i] === '}') { depth--; if (!depth) return pages.slice(hit.index, i + 1); }
  }
  return '';
}

const bad = [];
for (const a of acts) {
  if (mapped.has(a)) continue;
  const body = handlerBody(a);
  if (body && WRITE_RE.test(body)) bad.push(a);
}

/* 4. 反向：映射了但页面已不存在的动作（死映射，无害，仅提示） */
const dead = [...mapped].filter((a) => !acts.has(a));

/* 5. 权限字符串有效性：映射到了一个 ROLES 里根本没定义的权限名 */
const badPerm = [...actPerm.entries()].filter(([, p]) => !permValid(p));

console.log('已映射 %d / 页面动作 %d / 权限字典 %d（来源：%s）',
  mapped.size, acts.size, DICT.set.size, DICT.src);
if (dead.length) console.log('提示 死映射 %d 个: %s', dead.length, dead.join(', '));
const adminOnly = [...new Set(actPerm.values())].filter(p => permValid(p) && !grantedToSomeRole(p));
if (adminOnly.length) console.log('提示 仅超管可用（最小权限设计）: %s', adminOnly.join(', '));
let fail = 0;
if (bad.length) {
  console.log('\nFAIL 以下动作会写数据但没有权限映射（canAct 一律放行）:');
  bad.forEach((a) => console.log('   - ' + a));
  fail++;
}
if (badPerm.length) {
  console.log('\nFAIL 以下动作映射到了未定义的权限名（拼错/改名即等于越权或失效）:');
  badPerm.forEach(([a, p]) => console.log(`   - ${a} → '${p}'`));
  fail++;
}
if (fail) { console.log('\nRESULT: PASS=0 FAIL=' + fail); process.exit(1); }
console.log('\nPASS 全部写操作均已纳入权限映射，且权限名全部有效');
/* 机读计数行（toolaudit 要求）：此前只有中文结论，下游无法自动核验缩水 */
console.log('\nRESULT: PASS=' + (mapped ? mapped.size : 0) + ' FAIL=0');
