#!/usr/bin/env node
/* ============================================================================
 * mutate_toolaudit.cjs —— toolaudit「别名旧账清理」变异验证
 * ----------------------------------------------------------------------------
 * 事故：体检快照里长期躺着 'themeguard.cjs'（带后缀）一条 0/0 不可信，
 * 与正常的 'themeguard' 并存，永远等不到覆盖；total 虚高，
 * complete 判据被幽灵条目蒙混，看板多报一个「不可信」。
 *
 * M0 注入两条旧账（1 别名 + 1 幽灵）
 * M1 跑一次单工具体检后，两条都必须消失
 * M2 themeguard 必须是本轮真实结果（不是 0/0 不可信）
 * M3 输出里必须有机读的 ALIAS_CLEAN=2
 * M4 还原快照，md5 逐字节一致（正式清理由真实全量体检完成）
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const LAST = path.join(__dirname, '_toolaudit_last.json');
const BASE = path.join(__dirname, '_toolaudit_base.json');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

const origLast = fs.existsSync(LAST) ? fs.readFileSync(LAST) : null;
const origBase = fs.existsSync(BASE) ? fs.readFileSync(BASE) : null;
const MR = path.join(__dirname, 'mutate_mutrestore.cjs');
const origMR = fs.existsSync(MR) ? fs.readFileSync(MR) : null;
const TOOLAUDIT = path.join(__dirname, 'toolaudit.cjs');
let ok = 0, fail = 0;
const good = m => { ok++; console.log('  √ ' + m); };
const bad = m => { fail++; console.log('  x ' + m); };

try {
  const snap = JSON.parse(origLast.toString('utf8'));
  /* 注入态必须可控：先清掉真实快照里可能已有的带后缀别名，
   * 否则 merged 会随历史残留条数浮动，断言写死数字就会变成第二次假失败。 */
  snap.rows = snap.rows.filter(r => !/\.(cjs|py)$/.test(r.name));
  snap.rows.push({ name: 'themeguard.cjs', verdict: '不可信', pass: 0, fail: 0 });
  snap.rows.push({ name: 'ghost_old.cjs', verdict: '不可信', pass: 0, fail: 0 });
  fs.writeFileSync(LAST, JSON.stringify(snap));
  good('M0 已注入别名旧账 + 幽灵条目各 1 条');

  const r = spawnSync('node', [path.join(__dirname, 'toolaudit.cjs'), '--fast', '--append', 'themeguard'],
    { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const after = JSON.parse(fs.readFileSync(LAST, 'utf8'));
  const names = after.rows.map(x => x.name);

  (!names.includes('themeguard.cjs') && !names.includes('ghost_old.cjs'))
    ? good('M1 两条旧账均被清理，不再冒充本轮结论')
    : bad('M1 旧账仍在：' + names.filter(n => /\.cjs$/.test(n)).join(','));

  const tg = after.rows.find(x => x.name === 'themeguard');
  (tg && !(tg.pass === 0 && tg.fail === 0 && tg.verdict === '不可信'))
    ? good('M2 themeguard 为本轮真实体检结果（' + (tg ? tg.verdict + ' ' + tg.pass + '/' + tg.fail : '-') + '）')
    : bad('M2 themeguard 仍是 0/0 不可信');

  (/ALIAS_MERGED=1/.test(out) && /ALIAS_DROPPED=1/.test(out))
    ? good('M3 输出含可机读 ALIAS_MERGED=1 / ALIAS_DROPPED=1')
    : bad('M3 未输出分类计数 :: ' + out.slice(-400));

  /TOTAL=\d+\/\d+ COMPLETE=/.test(out)
    ? good('M3 输出含 TOTAL/COMPLETE 完整性标记')
    : bad('M3 缺完整性标记');

  /* M5/M6：覆盖率判据必须真的会因为「独立变异脚本被掏空」而翻脸，
   * 否则新加的扩展只是把待整改强行涂绿，属于自欺。 */
  const runMR = () => spawnSync('node', [TOOLAUDIT, '--fast', '--append', 'mutrestore'],
    { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  fs.writeFileSync(MR, '/* 空壳：不具备注入/还原/机读结果 */\n');
  const r5 = runMR();
  /未经证明|未在 mutguard 注册变异用例/.test((r5.stdout || '') + (r5.stderr || ''))
    ? good('M5 掏空独立变异脚本 → 覆盖率判据立刻报「未经证明」')
    : bad('M5 判据没翻脸 :: ' + String(r5.stdout || '').slice(-300));
  fs.writeFileSync(MR, origMR);
  const r6 = runMR();
  const o6 = (r6.stdout || '') + (r6.stderr || '');
  (/可信/.test(o6) && !/未经证明/.test(o6))
    ? good('M6 还原独立变异脚本 → mutrestore 判可信')
    : bad('M6 还原后仍未转可信 :: ' + o6.slice(-300));

  /* M7：锁判据修复的静态自证（动态复现见本轮周报：修复前 exit4 被判不可信，
   * 修复后无锁重跑判可信；此处保证排除条件不会被后人悄悄删掉）。 */
  const ta = fs.readFileSync(TOOLAUDIT, 'utf8');
  (/ev\.pass !== null && !\/拒绝开工\/\.test/.test(ta) && /row\.locked/.test(ta))
    ? good('M7 并发锁前提未就绪的排除条件与 locked 分支均在')
    : bad('M7 锁判据修复被删或改写');
} catch (e) {
  bad('脚本异常：' + e.message);
} finally {
  if (origLast !== null) fs.writeFileSync(LAST, origLast);
  else if (fs.existsSync(LAST)) fs.unlinkSync(LAST);
  if (origBase !== null) fs.writeFileSync(BASE, origBase);
  else if (fs.existsSync(BASE)) fs.unlinkSync(BASE);
  if (origMR !== null) fs.writeFileSync(MR, origMR);
  const same = origLast !== null && md5(fs.readFileSync(LAST)) === md5(origLast);
  same ? good('M4 快照还原后 md5 逐字节一致') : bad('M4 快照还原失败');
  const sameMR = origMR !== null && md5(fs.readFileSync(MR)) === md5(origMR);
  sameMR ? good('M4 独立变异脚本还原后 md5 逐字节一致') : bad('M4 独立变异脚本还原失败');
}

console.log('\nRESULT: PASS=' + ok + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
