#!/usr/bin/env node
/* 【mutate_flowguard.cjs】立规原因：抓不住问题的守卫等于不存在。
 * 本脚本把本轮四类修复分别塞回坏形态，验证 flowguard 当场报红；
 * 每例结束都从干净备份还原并校验 md5 逐字节一致（防变异污染进生产）。
 * 退出码：0=全部捕获且还原干净 / 1=有逃逸或还原不一致 / 2=崩溃。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const P = p => path.join(ROOT, p);
const read = p => fs.readFileSync(P(p), 'utf8');
const write = (p, s) => fs.writeFileSync(P(p), s);
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

const cases = [
  { n: 'M1 把「买完踢出商城」塞回去', f: 'js/ui.js',
    from: '      this.open(\'shop\', tab);\n      this.home();',
    to:   '      let soldOut = false; if (g.limit) { try { const lm2 = E.giftCan(p, g); soldOut = !!(lm2 && !lm2.ok); } catch (e) {} }\n      if (soldOut) { this.close(); } else { this.open(\'shop\', tab); }\n      this.home();' },
  { n: 'M2 删掉「明日刷新」去重文案', f: 'js/ui.js',
    from: "const _period = { daily: '明日刷新', weekly: '下周刷新', monthly: '下月刷新' };",
    to:   "const _period = { daily: '今日已售罄', weekly: '今日已售罄', monthly: '今日已售罄' };" },
  { n: 'M3 价格图标放大回 48px', f: 'css/style.css',
    from: '.gcell .gbuy button .ei{width:14px;height:14px;',
    to:   '.gcell .gbuy button .ei{width:48px;height:48px;' },
  { n: 'M4 取证里伪造「买完面板关闭」', f: '_vis/_flowwalk_final2.json',
    from: '"panelOpen": true', to: '"panelOpen": false' },
  { n: 'M5 取证里伪造原生 confirm', f: '_vis/_flowwalk_final2.json',
    from: '"nativeDialogs": 0', to: '"nativeDialogs": 1' },
  { n: 'M6 删掉取证工具的等图前提', f: 'tools/_flowwalk.cjs',
    from: 'const waitImgs = async (p) => {', to: 'const __waitImgsRemoved = async (p) => {' }
];

let cap = 0, esc = 0, dirty = 0;
for (const c of cases) {
  const orig = read(c.f);
  if (orig.indexOf(c.from) < 0) { console.log('  SKIP ' + c.n + '（锚点不存在，判据失效）'); esc++; continue; }
  const mutated = orig.replace(c.from, c.to);
  write(c.f, mutated);
  try {
    const r = spawnSync('node', ['tools/flowguard.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    const out = String(r.stdout || '');
    const caught = r.status !== 0 && /FAIL/.test(out);
    console.log('  ' + (caught ? 'CAPTURED' : 'ESCAPED  ') + ' ' + c.n + (caught ? '' : ' <<< 守卫没抓住'));
    if (caught) cap++; else esc++;
  } catch (e) { console.log('  CRASH ' + c.n + ' ' + e.message); esc++; }
  finally {
    write(c.f, orig);
    if (md5(read(c.f)) !== md5(orig)) { console.log('  DIRTY  ' + c.n + ' 还原不一致'); dirty++; }
  }
}
console.log('mutate_flowguard: 捕获 ' + cap + '/' + cases.length + '，逃逸 ' + esc + '，污染 ' + dirty);
process.exit(esc || dirty ? 1 : 0);
