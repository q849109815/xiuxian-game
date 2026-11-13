/* =========================================================
 * artharmonize.cjs —— 美术资源统一化（V1.3.92 全量视觉重做）
 * 立规原因：31 张角色/BOSS/怪物立绘里，多数带 AI 生成水印、荧光高饱和
 *   背景或彼此不一致的色调，与低饱和末日废土主界面割裂。AI 重绘受单次
 *   生成上限约束，故用本工具对「全部 jpg 立绘」做统一后处理，旗舰资源
 *   另用重绘图替换。
 * 【V1.3.92 修正】首版把 assets/chibi（64 张带 alpha 的 Q 版小人）也纳入
 *   统一化。真实截图取证发现：blur 补片会污染透明通道、抹掉描边，卡片里
 *   只剩一条色块 —— 属于「为了好看破坏现有功能」，违反三体验规则。
 *   现改为：chibi / skin 一律从 _bak_art 逐张还原，只处理无 alpha 的
 *   assets/char/*.jpg。判据以真实渲染为准，不以「处理张数多」为准。
 * 判据：每张图去右下角水印、统一饱和度/明度、压缩体积；
 *   原图全部备份到 _bak_art/，可逐字节还原。
 * 退出码：0=全部处理成功 / 1=有失败 / 2=前提未就绪
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const ROOT = path.join(__dirname, '..');
const NEW = path.join(ROOT, '_new');
const BAK = path.join(ROOT, '_bak_art');
const MAP = {
  'c01_jack.jpg': 'assets/char/c01_jack.jpg',
  'c02_aila.jpg': 'assets/char/c02_aila.jpg',
  'c03_lei.jpg': 'assets/char/c03_lei.jpg',
  'c07_ying.jpg': 'assets/char/c07_ying.jpg',
  'boss_baoshi.jpg': 'assets/char/boss_baoshi.jpg',
  'boss_gangtie.jpg': 'assets/char/boss_gangtie.jpg',
  'boss_xiudao.jpg': 'assets/char/boss_xiudao.jpg',
  'z_cap.jpg': 'assets/char/z_cap.jpg',
  'main_bg.jpg': 'assets/scene/main_bg.jpg',
  'wasteland.jpg': 'assets/scene/wasteland.jpg'
};
/* 定向替换：真实浏览器取证发现主界面 .hm-bg 用的是 city.jpg，
 * 战斗首关同样读 city.jpg —— 只换 main_bg.jpg 玩家永远看不到。
 * 营地图给主界面专用，桥梁战场图给战斗场景表，各归其位。 */
const EXTRA = [
  { src: 'main_bg.jpg', dst: 'assets/scene/home_v1392.jpg', resize: [720, 1280] },
  { src: 'wasteland.jpg', dst: 'assets/scene/city.jpg', resize: [720, 1280] }
];
const RESTORE_DIRS = ['assets/chibi', 'assets/skin'];
const DIRS = ['assets/char'];

async function patchWatermark(buf) {
  const meta = await sharp(buf).metadata();
  const w = meta.width, h = meta.height;
  const bw = Math.max(48, Math.round(w * 0.17)), bh = Math.max(28, Math.round(h * 0.09));
  const left = w - bw, top = h - bh, srcTop = Math.max(0, top - bh);
  const patch = await sharp(buf).extract({ left, top: srcTop, width: bw, height: bh })
    .blur(16).toBuffer();
  return sharp(buf).composite([{ input: patch, left, top }]).toBuffer();
}
async function treat(src, dst, opts) {
  const buf = fs.readFileSync(src);
  const rel = path.relative(ROOT, dst);
  const bak = path.join(BAK, rel);
  fs.mkdirSync(path.dirname(bak), { recursive: true });
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, buf);
  let img = sharp(await patchWatermark(buf));
  if (opts.resize) img = img.resize(opts.resize[0], opts.resize[1], { fit: 'cover' });
  img = img.modulate({ saturation: 0.90, brightness: 1.03 });
  const out = /\.png$/i.test(dst)
    ? await img.png({ compressionLevel: 9 }).toBuffer()
    : await img.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, out);
  return { before: buf.length, after: out.length };
}
(async () => {
  let ok = 0, bad = 0, restored = 0;
  /* 先还原带 alpha 的 Q 版 / 皮肤图，避免透明通道被补片污染 */
  for (const d of RESTORE_DIRS) {
    const srcDir = path.join(BAK, d), dstDir = path.join(ROOT, d);
    if (!fs.existsSync(srcDir)) continue;
    for (const f of fs.readdirSync(srcDir)) {
      const s = path.join(srcDir, f), t = path.join(dstDir, f);
      if (!fs.existsSync(t) || !fs.readFileSync(s).equals(fs.readFileSync(t))) {
        fs.mkdirSync(path.dirname(t), { recursive: true });
        fs.writeFileSync(t, fs.readFileSync(s));
        restored++;
      }
    }
  }
  console.log('RESTORE 带透明通道资源 ' + restored + ' 张（Q版/皮肤保持原样）');

  for (const [n, rel] of Object.entries(MAP)) {
    const src = path.join(NEW, n), dst = path.join(ROOT, rel);
    if (!fs.existsSync(src)) { console.log('MISS ' + n); bad++; continue; }
    try {
      const bg = /^main_bg|^wasteland/.test(n);
      const r = await treat(src, dst, { resize: bg ? [720, 1280] : [512, 512] });
      console.log('NEW  ' + rel + '  ' + (r.before / 1024 | 0) + 'KB -> ' + (r.after / 1024 | 0) + 'KB');
      ok++;
    } catch (e) { console.log('FAIL ' + rel + '  ' + e.message); bad++; }
  }
  for (const e of EXTRA) {
    const src = path.join(NEW, e.src), dst = path.join(ROOT, e.dst);
    if (!fs.existsSync(src)) { console.log('MISS ' + e.src); bad++; continue; }
    try {
      const r = await treat(src, dst, { resize: e.resize });
      console.log('SCENE ' + e.dst + '  ' + (r.after / 1024 | 0) + 'KB');
      ok++;
    } catch (err) { console.log('FAIL ' + e.dst + '  ' + err.message); bad++; }
  }
  for (const d of DIRS) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(jpg|jpeg)$/i.test(f)) continue;
      const dst = path.join(dir, f);
      if (Object.values(MAP).includes(path.relative(ROOT, dst))) continue;
      try { await treat(dst, dst, {}); ok++; }
      catch (e) { console.log('FAIL ' + path.relative(ROOT, dst) + '  ' + e.message); bad++; }
    }
  }
  console.log('artharmonize: 处理 ' + ok + ' 张 / 失败 ' + bad + ' 张，原图备份于 _bak_art/');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('artharmonize CRASH: ' + e.stack); process.exit(2); });
