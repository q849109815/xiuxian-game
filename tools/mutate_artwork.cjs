/* =========================================================
 * mutate_artwork.cjs —— 全量美术资源守卫的变异验证（V1.3.93 补建）
 * 立规原因：上一轮 artwork.cjs 的 A12 只查 push.py 里有没有那行字符串，
 *   于是「清单登记了 tools/mutate_artwork.cjs，文件却根本不存在」被判为
 *   已交付 —— pushcov N1 当场点名幽灵路径。抓不住缺陷的断言等于不存在，
 *   补建本脚本并给 A12 加上「文件真实存在」判据。
 * 判据：7 组变异分别把真实缺陷塞回源码/资源，artwork.cjs 必须报红；
 *   每组还原后 md5 逐字节一致；注入点必须真实命中，否则计「失效」而非
 *   含糊判过（历史错题：变异只加了注释 / 锚点写错，误判守卫失效）。
 * 退出码：0=全捕获且还原干净 / 1=有漏网或还原异常 / 2=前提未就绪或崩溃
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const sharp = (() => { try { return require('sharp'); } catch (e) { return null; } })();
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const P = f => path.join(ROOT, f);

let caught = 0, missed = 0, restoreErr = 0, invalid = 0;
const rows = [];

function backup(files) {
  const m = new Map();
  for (const f of files) m.set(f, fs.readFileSync(P(f)));
  return m;
}
function restore(m) {
  let bad = 0;
  for (const [f, b] of m) {
    fs.writeFileSync(P(f), b);
    if (md5(fs.readFileSync(P(f))) !== md5(b)) { bad++; console.log('  ! 还原异常 ' + f); }
  }
  restoreErr += bad;
  return bad;
}
function runGuard() {
  return cp.spawnSync('node', ['tools/artwork.cjs'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
}
function judge(name, tag, r) {
  const out = (r.stdout || '') + (r.stderr || '');
  const hit = out.includes('FAIL ' + tag) && r.status !== 0;
  if (hit) { caught++; rows.push('  √ ' + name + '  → ' + tag + ' 报红 exit=' + r.status); }
  else { missed++; rows.push('  x ' + name + '  → 未捕获（exit=' + r.status + '）'); console.log(out.slice(-700)); }
}

async function main() {
  if (!sharp) { console.log('前提未就绪：sharp 缺失'); process.exit(2); }

  const cases = [
    { name: 'M1 BOSS 背景改回偏冷绿', tag: 'A8', files: ['assets/char/boss_baoshi.jpg'],
      async inject() {
        /* 首版只改 (2,2) 一个像素再存 JPEG，压缩把这点改动抹平了，
         * 守卫没报红却被误判成「守卫失效」—— 是变异根本没生效，不是判据坏。
         * 历史错题（变异改错位置/只加注释）复发一次，这里改为整图注入。 */
        const f = P('assets/char/boss_baoshi.jpg');
        const bad = await sharp({ create: { width: 512, height: 512, channels: 3,
          background: { r: 10, g: 16, b: 9 } } }).jpeg({ quality: 90 }).toBuffer();
        fs.writeFileSync(f, bad);   // g>r，棕灰判据必然失守
        return true;
      } },
    { name: 'M2 战斗贴图右下角注入洋红水印块', tag: 'A4', files: ['assets/chibi/hero_base.png'],
      async inject() {
        const f = P('assets/chibi/hero_base.png');
        const im = sharp(fs.readFileSync(f)); const meta = await im.metadata();
        const svg = Buffer.from('<svg width="64" height="32"><rect width="64" height="32" fill="#ff2bd6"/></svg>');
        fs.writeFileSync(f, await sharp(fs.readFileSync(f)).composite([{ input: svg, left: Math.max(0, meta.width - 64), top: Math.max(0, meta.height - 32) }]).png().toBuffer());
        return true;
      } },
    { name: 'M3 两张副武器贴图改成同一张', tag: 'A7', files: ['assets/chibi/s01.png'],
      async inject() { fs.copyFileSync(P('assets/chibi/s02.png'), P('assets/chibi/s01.png')); return true; } },
    { name: 'M4 删掉暗调立绘提亮', tag: 'A10', files: ['css/style.css'],
      async inject() {
        const f = P('css/style.css'), s = fs.readFileSync(f, 'utf8');
        if (!s.includes('filter:brightness(1.16)')) return false;
        fs.writeFileSync(f, s.replace('filter:brightness(1.16)', 'filter:brightness(1.0)'));
        return true;
      } },
    { name: 'M5 上传清单漏登一张战斗贴图', tag: 'A11', files: ['tools/push.py'],
      async inject() {
        const f = P('tools/push.py'), s = fs.readFileSync(f, 'utf8');
        const line = "    'assets/chibi/hero_base.png',\n";
        if (!s.includes(line)) return false;
        fs.writeFileSync(f, s.replace(line, ''));
        return true;
      } },
    { name: 'M6 进度看板删掉美术固定项', tag: 'A13', files: ['tools/dash.cjs'],
      async inject() {
        const f = P('tools/dash.cjs'), L = fs.readFileSync(f, 'utf8').split('\n');
        const i = L.findIndex(l => l.startsWith("A('测试','全量美术资源'"));
        if (i < 0) return false;
        L.splice(i, 1); fs.writeFileSync(f, L.join('\n'));
        return true;
      } },
    { name: 'M7 变异脚本文件消失（幽灵登记）', tag: 'A12', files: [],
      async inject() {
        const self = P('tools/mutate_artwork.cjs'), hid = self + '.hidden';
        if (!fs.existsSync(self)) return false;
        fs.renameSync(self, hid); return true;
      },
      async undo() {
        const self = P('tools/mutate_artwork.cjs'), hid = self + '.hidden';
        if (fs.existsSync(hid)) fs.renameSync(hid, self);
      } },
  ];

  for (const c of cases) {
    const snap = backup(c.files);
    let ok = false;
    try {
      ok = await c.inject();
      if (!ok) { invalid++; rows.push('  x ' + c.name + '  → 注入点无效（不算捕获）'); }
      else judge(c.name, c.tag, runGuard());
    } catch (e) {
      invalid++; rows.push('  x ' + c.name + '  → 注入异常 ' + e.message);
    } finally {
      if (c.undo) await c.undo();
      if (c.files.length) restore(snap);
    }
  }

  const final = runGuard();
  rows.push('  · 还原后复跑 artwork.cjs：exit=' + final.status + ' / ' + ((final.stdout || '').trim().split('\n').pop() || ''));
  if (final.status !== 0) { missed++; rows.push('  x 还原后未回到全绿'); }

  console.log('\n=== 美术守卫变异验证 ===');
  console.log(rows.join('\n'));
  console.log('\nRESULT: 捕获 ' + caught + '/' + cases.length + '  漏网 ' + missed + '  注入失效 ' + invalid + '  还原异常 ' + restoreErr);
  process.exit((missed || invalid || restoreErr) ? 1 : 0);
}
main().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
