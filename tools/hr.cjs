#!/usr/bin/env node
/**
 * 人事裁决模块（制作人制度 · 连续 2 轮 C 即换人）
 *
 * 被 kpi.cjs 调用。设计原则：
 *  1. 单一事实源 —— 裁决只依据本轮客观分数 + 历史评级，不依据上一次的展示文本。
 *     （历史教训：曾出现展示文本报「已触发换人」而人事台账为空的自相矛盾。）
 *  2. 归因后再罚 —— C 必须区分「内部未交付」与「外部依赖/工具跑挂」，
 *     后者不计入连续 C，避免环境波动误杀。
 *  3. 换人不是终点 —— 新负责人带试用期，试用期评级须 ≥B，否则同样淘汰。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HRP = path.join(ROOT, 'tools', '_hr.json');

const DEFAULT_HEAD = { '策划': 'P', '美术': 'A', '程序': 'D', '音频': 'S', '测试': 'T', '运营': 'O' };

function load() {
  let hr = { roster: {}, log: [] };
  try { hr = JSON.parse(fs.readFileSync(HRP, 'utf8')); } catch (e) { }
  hr.roster = hr.roster || {}; hr.log = hr.log || [];
  Object.keys(DEFAULT_HEAD).forEach(d => {
    if (!hr.roster[d]) hr.roster[d] = { head: DEFAULT_HEAD[d] + '1', gen: 1, since: 1, probationUntil: null };
  });
  return hr;
}
const save = (hr) => fs.writeFileSync(HRP, JSON.stringify(hr, null, 1));

/**
 * @param {Object} o
 *   o.K      部门 → {score, items:[{got,max,note,cause}]}
 *   o.rank   score → 评级
 *   o.hist   部门 → 评级数组（调用方负责持久化）
 *   o.round  本轮轮次号
 *   o.flaky  本轮跑挂的守卫名数组（输出 0/0，分数不可信）
 * @returns {{hr, verdicts, fired, lines:string[]}}
 */
function judge(o) {
  const { K, rank, hist, round, flaky } = o;
  const hr = load();
  const lines = [];
  const isBad = (g) => ['C', 'D', 'E'].includes(String(g).replace('*', ''));

  // —— 归因：C 是否由内部未交付造成 ——
  const causeOf = (k) => {
    const miss = (K[k].items || []).filter(i => i.got < i.max);
    if (!miss.length) return 'none';
    return miss.some(i => (i.cause || 'internal') === 'internal') ? 'internal' : 'external';
  };

  const verdicts = [];
  const fired = [];

  // —— 0. 数据不可信：本轮不评级、不裁决、不写入历史 ——
  if (flaky && flaky.length) {
    lines.push(`  ⚠️ 本轮守卫跑挂: ${flaky.join(', ')}（输出 0/0）—— 分数不可信，本轮不评级、不触发任何人事裁决，请修复工具后重跑。`);
    return { hr, verdicts, fired, lines };
  }

  Object.keys(K).forEach(k => {
    const score = K[k].score;
    let g = rank(score);
    const cause = causeOf(k);
    // 纯外部依赖导致的 C 记 C*：责任不在部门，不计入连续、且中断连续计数
    if (isBad(g) && cause === 'external') g = g + '*';
    hist[k] = hist[k] || [];
    /* 同轮重复运行只覆写本轮评级，不追加 —— 否则连跑两次就能凑出「连续2轮C」 */
    if (hist[k].length >= round) hist[k][round - 1] = g;
    else { while (hist[k].length < round - 1) hist[k].push('-'); hist[k].push(g); }
    if (hist[k].length > 20) hist[k] = hist[k].slice(-20);
  });

  // —— 1. 试用期结算（先于本轮裁决：本轮就是试用结果）——
  const replacedThisRound = new Set();
  Object.keys(hr.roster).forEach(d => {
    const r = hr.roster[d];
    if (r.probationUntil == null) return;
    if (round < r.probationUntil) return;
    const g = String((hist[d] || []).slice(-1)[0] || '');
    if (!isBad(g) && ['A+', 'A', 'B'].includes(g)) {
      r.probationUntil = null;
      hr.log.push({ round, dept: d, action: 'PROBATION_PASS', head: r.head, grade: g });
      lines.push(`  ✅ 转正  ${d}  ${r.head}  试用期评级 ${g} ≥ B，正式接任`);
    } else {
      const old = r.head; r.gen++; const nh = DEFAULT_HEAD[d] + r.gen;
      r.head = nh; r.since = round; r.probationUntil = round + 1;
      replacedThisRound.add(d);   /* 同轮不重复处罚：已换过人就不再叠加连续C裁决 */
      hr.log.push({ round, dept: d, action: 'PROBATION_FAIL', from: old, to: nh, grade: g });
      lines.push(`  🔴 试用未过  ${d}  ${old} → ${nh}  试用期评级 ${g} 未达 B，再次换人`);
    }
  });

  // —— 2. 连续 C 裁决 ——
  const streakOf = (arr) => {
    let n = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const g = String(arr[i]);
      if (g.endsWith('*')) break;              // 外部依赖豁免：中断连续
      if (isBad(g)) n++; else break;
    }
    return n;
  };
  Object.keys(K).forEach(k => {
    const g = String((hist[k] || []).slice(-1)[0] || '');
    const n = streakOf(hist[k] || []);
    if (n >= 2) {
      verdicts.push({ dept: k, grade: g, streak: n, action: 'FIRE' });
    } else if (n === 1 && isBad(g)) {
      verdicts.push({ dept: k, grade: g, streak: n, action: 'WARN' });
    }
  });

  // —— 3. 执行换人 ——
  verdicts.filter(v => v.action === 'FIRE').forEach(v => {
    if (replacedThisRound.has(v.dept)) return;
    const r = hr.roster[v.dept];
    const old = r.head;
    const already = fired.some(x => x.dept === v.dept && x.round === round);
    if (already) return;
    r.gen++; const nh = DEFAULT_HEAD[v.dept] + r.gen;
    r.head = nh; r.since = round; r.probationUntil = round + 1;
    const rec = { dept: v.dept, grade: v.grade, streak: v.streak, round, at: new Date().toISOString(), from: old, to: nh };
    fired.push(rec);
    hr.log.push({ round, dept: v.dept, action: 'FIRE', from: old, to: nh, grade: v.grade, streak: v.streak });
  });

  save(hr);
  return { hr, verdicts, fired, lines };
}

module.exports = { judge, load };
