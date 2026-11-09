#!/usr/bin/env node
/* 【visguard 变异验证】抓不住缺陷的守卫等于不存在。
 * 4 组：拆掉公告过滤 / 清空辱骂词表 / 删空状态样式 / 加回已删标语。
 * 每组：备份 → 注入 → 跑 visguard → 必须报 FAIL → 还原 → md5 逐字节一致。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const M = [
  { n: 'M1 拆掉登录公告过滤', f: 'js/ui.js', from: 'this.pubSafe(this.noticeUnread())', to: 'this.noticeUnread()' },
  { n: 'M2 清空辱骂词表', f: 'js/ui.js', from: "['傻逼', '煞笔'", to: "['', '煞笔'" },
  { n: 'M3 删空状态样式', f: 'css/style.css', from: ".empty::before{content:'○';font-size:26px;line-height:1;opacity:.35}", to: '' },
  { n: 'M4 加回登录副标语', f: 'index.html', from: '    <div class="lg-t">向 僵 尸 开 炮</div>', to: '    <div class="lg-t">向 僵 尸 开 炮</div>\n    <div class="lg-s">末 日 尸 潮 · 守 住 最 后 防 线</div>' },
];
let cap = 0, bad = 0;
for (const m of M) {
  const p = path.join(ROOT, m.f), orig = fs.readFileSync(p, 'utf8');
  if (!orig.includes(m.from)) { console.log('SKIP ' + m.n + '（锚点不在，判失败）'); bad++; continue; }
  fs.writeFileSync(p, orig.replace(m.from, m.to));
  const r = cp.spawnSync('node', [path.join(ROOT, 'tools/visguard.cjs')], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = r.status !== 0 && /FAIL=[1-9]/.test(out);
  fs.writeFileSync(p, orig);
  const restored = md5(fs.readFileSync(p, 'utf8')) === md5(orig);
  if (failed && restored) { cap++; console.log('CAPTURED ' + m.n); }
  else { bad++; console.log('ESCAPED ' + m.n + ' exit=' + r.status + ' restored=' + restored + ' :: ' + out.split('\n')[0]); }
}
const r0 = cp.spawnSync('node', [path.join(ROOT, 'tools/visguard.cjs')], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
console.log('BASELINE ' + ((r0.stdout || '').split('\n')[0] || 'no-output'));
console.log('mutate_visguard: CAPTURED=' + cap + '/' + M.length + ' BAD=' + bad);
process.exit(cap === M.length && bad === 0 && r0.status === 0 ? 0 : 1);
