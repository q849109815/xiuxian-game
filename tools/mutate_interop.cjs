#!/usr/bin/env node
/* [mutate_interop.cjs] 立规原因：抓不住缺陷的断言等于不存在。本轮新建 interop.cjs，
 * 必须逐条证伪。历史事故：变异脚本被强杀未还原导致污染进生产、备份清单手写漏项。
 * 本脚本：内存备份（不落盘快照）、逐组注入→跑守卫→必须报红→finally 还原→md5 校验。
 * 退出码：0=全部捕获 / 1=存在漏网 / 2=崩溃或还原不一致（显式判失败）。 */
const fs = require('fs'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = '/data/workspace/zombie';
const F = { ui: 'js/ui.js', core: 'admin/js/core.js', pages: 'admin/js/pages.js' };
const orig = {}, md5 = s => crypto.createHash('md5').update(s).digest('hex');
for (const [k, p] of Object.entries(F)) { orig[k] = fs.readFileSync(ROOT + '/' + p, 'utf8'); }
const hash0 = Object.fromEntries(Object.entries(orig).map(([k, v]) => [k, md5(v)]));
const wr = (k, s) => fs.writeFileSync(ROOT + '/' + F[k], s);

const CASES = [
  ['M1 删掉任务批量按钮绑定（一键领取变死按钮）', 'ui',
    s => s.replace("    const ca = $('#taskClaimAll');", '    /* removed */'), 'I4'],
  ['M2 把 ask 换回同步原生 confirm（阻塞自动化 + 无分级）', 'core',
    s => s.replace('  ask(title, msg, opts) {', "  confirm(text) { return window.confirm(text); },\n  ask(title, msg, opts) {"), 'I7'],
  ['M3 抽掉 tpClear 的二次确认（一键清空全站文案）', 'pages',
    s => s.replace(/          if \(!await this\.ask\('清空全部提示文案覆盖',[\s\S]*?\{ danger: true, yes: '清空覆盖' \}\)\) return;\n/, ''), 'I8'],
  ['M4 把「注销＝…／永久删除＝…」长说明塞回列表页', 'pages',
    s => s.replace('        </div>` : \'\'}`;', "          <div class=\"hint\"><b>注销</b>＝停用并标记，账号记录保留，可在「显示已注销」里找回；\n            <b>永久删除</b>＝账号 / 存档 / 指令 / 索引 / 榜单全部物理删除，从此不再显示，不可恢复。</div>\n        </div>` : ''}`;"), 'I11'],
  ['M5 空态改回纯文字说明（删了就没有下一步）', 'core',
    s => s.replace('id="goSelPlayer">选择玩家</button>', 'id="goSelPlayerX">先在左侧点选玩家</button>'), 'I10'],
  ['M6 四个页签漏挂一个批量入口', 'ui',
    s => s.replace('return `${_head}<div class="card"><div class="card-t">周常任务', 'return `<div class="card"><div class="card-t">周常任务'), 'I2'],
];

let cap = 0, miss = 0;
try {
  for (const [name, key, mutate, expect] of CASES) {
    const before = orig[key];
    const bad = mutate(before);
    if (bad === before) { console.log('  X ' + name + ' :: 变异未命中'); miss++; continue; }
    wr(key, bad);
    const r = spawnSync('node', ['tools/interop.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    const out = String(r.stdout || '');
    const hit = r.status === 1 && out.includes('FAIL ' + expect);
    console.log((hit ? '  CAPTURED ' : '  MISSED   ') + name + (hit ? '' : ' :: exit=' + r.status));
    hit ? cap++ : miss++;
    wr(key, before);                       // 每组立即还原，不攒到最后
    if (md5(fs.readFileSync(ROOT + '/' + F[key], 'utf8')) !== hash0[key]) {
      console.log('  X 还原不一致 ' + key); miss++;
    }
  }
} finally {
  for (const k of Object.keys(F)) wr(k, orig[k]);   // 强杀/异常也兜底
}
let clean = true;
for (const [k, p] of Object.entries(F)) {
  if (md5(fs.readFileSync(ROOT + '/' + p, 'utf8')) !== hash0[k]) { clean = false; console.log('  X 最终污染未还原 ' + p); }
}
console.log('mutate_interop: CAPTURED ' + cap + '/' + CASES.length + ' · 还原 ' + (clean ? 'md5 一致' : 'FAILED'));
process.exit(miss || !clean ? 1 : 0);
