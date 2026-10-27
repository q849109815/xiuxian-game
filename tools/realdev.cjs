#!/usr/bin/env node
/**
 * 真机验收清单 + 可自动化预检（测试部交付物）
 *
 * 背景：测试部「真机矩阵」长期以「缺外部设备」为由 0 分。
 * 制作人裁决：真机执行确实依赖外部设备，但「真机验收清单 + 不依赖设备的源码层预检」
 * 属于内部可交付物，不能拿来当挡箭牌。本工具把可控部分固化下来，
 * 剩余「实机执行」部分仍需真机，如实保留为未交付。
 *
 * 用法: node tools/realdev.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const rdAll = (dir, ext) => {
  const out = [];
  const walk = (d) => {
    let ls = []; try { ls = fs.readdirSync(path.join(ROOT, d)); } catch (e) { return; }
    ls.forEach(n => {
      const p = path.join(d, n);
      const st = fs.statSync(path.join(ROOT, p));
      if (st.isDirectory()) walk(p);
      else if (ext.some(e => n.endsWith(e))) out.push(p);
    });
  };
  walk(dir); return out;
};

let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  OK ${name}${info ? ' :: ' + info : ''}`); } else { fail++; console.log(`  XX ${name}${info ? ' :: ' + info : ''}`); } };

const HTML = rd('index.html');
const CSS = ['css/tokens.css', 'css/style.css'].map(rd).join('\n');
const JS = ['js/config.js', 'js/engine.js', 'js/ui.js', 'js/main.js', 'js/battle.js', 'js/audio.js', 'js/juice.js', 'js/net.js'].map(f => rd(f)).join('\n');

console.log('=== 真机验收清单与源码层预检 ===');
console.log('(标 [需真机] 的项目本工具不判定，列入清单交真机执行)\n');

// —— A. 视口与安全区 ——
ok(/viewport-fit=cover/.test(HTML), 'A1 viewport 含 viewport-fit=cover', '刘海屏全屏渲染');
ok(/width=device-width/.test(HTML), 'A2 viewport 含 width=device-width');
const sabCount = (CSS.match(/env\(\s*safe-area-inset-bottom/g) || []).length;
ok(sabCount >= 5, 'A3 底部安全区适配', `env(safe-area-inset-bottom) ${sabCount} 处`);
const satCount = (CSS.match(/env\(\s*safe-area-inset-top/g) || []).length;
ok(satCount >= 1, 'A4 顶部安全区适配', `env(safe-area-inset-top) ${satCount} 处`);

// —— B. 触控 ——
ok(/-webkit-tap-highlight-color\s*:\s*transparent/.test(CSS), 'B1 去除点击高亮', '防移动端灰块闪烁');
ok(/user-select\s*:\s*none/.test(CSS), 'B2 禁用长按选中', '防误选文本');
ok(/touch-action\s*:\s*none/.test(CSS), 'B3 canvas 禁用默认手势', '防拖拽/缩放干扰操作');

// —— C. 横竖屏 ——
/* C1 判据修正说明（制作人批注，防后人再误判）：
 * 第一版只查 `orientation:` 媒体查询，报「无横屏适配」——这是【误报】。
 * 实测项目用的是另一套等价实现：
 *   css/style.css  @media (max-height:599px)  → 矮屏/横屏登录框顶部对齐+压紧
 *   css/style.css  横屏弹窗 align-items:flex-start + overflow-y:auto
 *   js/battle.js   MINH 逻辑 + 整层等比缩放（容器高 < 520 时居中缩放）
 * 三者都不含 orientation 字样但确实生效，且 compat.cjs 的 3 种横屏视口实测 0 越界。
 * 故判据改为「任一等价实现存在」，避免用单一关键词否定真实交付。 */
const landCSS = /orientation\s*:/.test(CSS) || /@media\s*\(max-height:\s*5\d\dpx\)/.test(CSS);
const landJS = /MINH/.test(JS) && /sx\s*=/.test(JS);
const landCmt = /横屏/.test(CSS) && /横屏/.test(JS);
ok(landCSS && landJS, 'C1 横屏/矮屏适配', `CSS矮屏规则=${landCSS} 战斗层等比缩放=${landJS} 横屏注释=${landCmt}`);
ok(landCmt, 'C2 横屏处理有可追溯说明', '关键分支留有成因注释，便于真机复现时定位');

// —— D. 存储兜底（iOS 无痕必现） ——
ok(/Storage\.prototype|Object\.getPrototypeOf\(localStorage\)/.test(HTML), 'D1 localStorage 抛错兜底', 'iOS 无痕模式 setItem 抛错不阻断登录');

// —— E. 首屏体积（真机弱网） ——
const jsFiles = rdAll('js', ['.js']);
let raw = 0, gz = 0;
jsFiles.forEach(f => { const b = fs.readFileSync(path.join(ROOT, f)); raw += b.length; gz += zlib.gzipSync(b).length; });
const cssFiles = rdAll('css', ['.css']);
cssFiles.forEach(f => { const b = fs.readFileSync(path.join(ROOT, f)); raw += b.length; gz += zlib.gzipSync(b).length; });
ok(gz <= 700 * 1024, 'E1 首屏 JS+CSS gzip 体积', `${jsFiles.length}js+${cssFiles.length}css  raw ${(raw / 1024).toFixed(0)}KB → gzip ${(gz / 1024).toFixed(0)}KB`);
ok(gz / Math.max(raw, 1) < 0.5, 'E2 传输压缩生效', `压缩率 ${(100 - gz / Math.max(raw, 1) * 100).toFixed(1)}%（静态托管需开启 gzip/br）`);

// —— F. 图片体积（真机内存/流量） ——
const imgs = rdAll('assets', ['.png', '.jpg', '.jpeg', '.webp']);
let big = [];
imgs.forEach(f => { const s = fs.statSync(path.join(ROOT, f)).size; if (s > 250 * 1024) big.push(`${f} ${(s / 1024).toFixed(0)}KB`); });
ok(big.length === 0, 'F1 单图 ≤250KB', big.length ? `${big.length} 张超标: ${big.slice(0, 3).join(', ')}` : `${imgs.length} 张全部合规`);

// —— G. 可点热区（真机误触） ——
const hot = /--tap-min|min-height\s*:\s*4[4-9]px|min-width\s*:\s*4[4-9]px/.test(CSS);
ok(hot, 'G1 关键控件最小可点尺寸', hot ? '存在 44px 级声明' : 'CSS 无 44px 级最小尺寸声明（小屏易误触）');

// —— H. 真机清单（本工具不判定，交真机执行） ——
console.log('\n--- 需真机执行清单（内部无法自证，如实列出）---');
[
  'R1 iOS Safari 音频自动播放策略：首次交互前 AudioContext 是否静音',
  'R2 iOS Safari 100vh 与地址栏收缩：底部导航是否被遮挡',
  'R3 Android 低端机（4GB 内存以下）战斗帧率与内存增长',
  'R4 安卓 WebView 内核差异：canvas 合成层与 CSS filter 表现',
  'R5 真机弱网（3G）首屏加载时长与超时兜底',
  'R6 切后台再回前台：战斗计时/音频是否错位',
  'R7 系统字体缩放（大字体模式）下布局是否撑破',
  'R8 来电/通知打断后战斗状态恢复',
].forEach(s => console.log('  [需真机] ' + s));

console.log(`\n--- ${pass} passed, ${fail} failed ---`);
console.log(fail === 0 ? 'REALDEV: PASS' : 'REALDEV: FAIL');
process.exit(fail === 0 ? 0 : 1);
