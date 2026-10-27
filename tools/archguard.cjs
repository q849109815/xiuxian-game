#!/usr/bin/env node
/**
 * archguard.cjs —— 前端架构守卫（静态检查，零依赖）
 *
 * 背景：本项目历史上「UI 不协调」反复复发，根因是没有单一真源——
 *       样式可以任意硬编码色值/间距/字号，几十轮打补丁后越改越乱。
 *       本守卫把 css/tokens.css 确立为唯一真源，并强制以下纪律：
 *
 * 规则：
 *   G1  style.css 内不得再出现 :root 定义块（令牌统一在 tokens.css）
 *   G2  style.css 内不得出现硬编码 #hex（必须用 var(--c-*) / 语义令牌）
 *   G3  所有 var(--x) 必须在 tokens.css 中定义
 *   G4  间距必须落在 4pt 栅格（0/4/8/12/16/20/24/32），且必须用 var(--sp-*)
 *   G5  字号必须取自阶梯 var(--fs-*)
 *   G6  字重必须取自阶梯 var(--fw-*)
 *   G7  中文防糊：字号 <=14px 时字重不得 >=700（小字粗体必然粘连）
 *   G8  ui.js 内联 style 中不得出现硬编码 font-size/色值
 *   G9  tokens.css 同一 :root 内不得重复定义同名令牌（CSS 静默覆盖，无报错）
 *
 * 退出码：0 = 全部通过；1 = 存在违规；2 = 依赖/输入缺失（绝不静默通过）
 *
 * 用法：node tools/archguard.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const p = (f) => path.join(ROOT, f);

const SP_GRID = [0, 4, 8, 12, 16, 20, 24, 32];
const FS_OK = /^var\(--fs-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|display|hero|mega)\)$/;
const FW_OK = /^var\(--fw-(regular|medium|semibold|bold)\)$/;
const FS_SMALL = /^var\(--fs-(xs|sm|md)\)$/;
const FW_HEAVY = /^var\(--fw-bold\)$/;

const FIX = process.argv.includes('--fix');
const fixG7 = new Set();   // --fix 模式：需要把 bold 降为 semibold 的行号

const v = [];   // violations
const stat = {};
const add = (rule, file, line, detail) => v.push({ rule, file, line, detail });

function read(f) {
  const fp = p(f);
  if (!fs.existsSync(fp)) { console.error('缺少输入文件: ' + f); process.exit(2); }
  return fs.readFileSync(fp, 'utf8');
}

const tokCss = read('css/tokens.css');
const styleCss = read('css/style.css');
const uiJs = read('js/ui.js');

/* ---------- 已定义令牌 ---------- */
const defined = new Set();
for (const m of tokCss.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
stat['令牌定义数'] = defined.size;

/* ---------- G0: CSS 注释标记必须平衡 ----------
 * 真实事故：tokens.css 的注释里把两个通配符令牌连写时，中间出现了
 *          「星号紧接斜杠」这一组合，提前关闭了注释块，后续注释正文被当作 CSS 解析，
 *          整表作废（cssRules.length=0），全站令牌取值为空、面板高度塌成 0。
 *          此类错误极其隐蔽——本人在写这段说明时就连续踩中两次，故单列规则强制拦截。
 *          提醒：本文件所有注释都不要写出「星号紧接斜杠」这个组合。
 * ========================================================================= */
{
  for (const f of ['css/tokens.css', 'css/style.css']) {
    const src = f === 'css/tokens.css' ? tokCss : styleCss;
    let depth = 0, line = 1, bad = [];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '\n') { line++; continue; }
      if (depth === 0 && src[i] === '/' && src[i + 1] === '*') { depth = 1; i++; continue; }
      if (depth === 1 && src[i] === '*' && src[i + 1] === '/') { depth = 0; i++; continue; }
      // 注释内部再次出现 /* 视为嵌套异常
      if (depth === 1 && src[i] === '/' && src[i + 1] === '*') { bad.push(line); }
    }
    if (depth !== 0) add('G0', f, line, '注释未闭合（文件末尾仍处于注释内）');
    if (bad.length) add('G0', f, bad[0], '注释内出现嵌套 /* 于第 ' + bad.slice(0, 3).join(',') + ' 行');
    const open = (src.match(/\/\*/g) || []).length, close = (src.match(/\*\//g) || []).length;
    // 计数法兜底：平衡时 open==close（注释内的 /* 已被上条捕获，此处仅提示）
    if (open !== close) add('G0', f, 1, '注释计数不平衡: /* x' + open + '  vs  */ x' + close);
  }
}

/* ---------- G9: 同一 :root 内不得重复定义令牌名 ----------
 * 实测事故：--c-red-750 在 tokens.css 第 70 行与第 121 行各定义一次，
 * 后者（#b8472f）静默覆盖前者，导致红点对比度修复"改了不生效"。
 * 同名重复在 CSS 中不报错、不告警，只能靠静态扫描发现。 */
{
  const tok = fs.readFileSync(p('css/tokens.css'), 'utf8');
  const seen = new Map();
  tok.split('\n').forEach((ln, i) => {
    const m = ln.match(/^\s*(--[A-Za-z0-9-]+)\s*:/);
    if (!m) return;
    if (seen.has(m[1])) add('G9', 'css/tokens.css', i + 1,
      '令牌重复定义 ' + m[1] + '（首次出现于第 ' + seen.get(m[1]) + ' 行，后者会静默覆盖前者）');
    else seen.set(m[1], i + 1);
  });
}

/* ---------- G1: style.css 不得再有 :root ---------- */
{
  const re = /:root\s*\{/g; let m;
  while ((m = re.exec(styleCss))) {
    add('G1', 'css/style.css', styleCss.slice(0, m.index).split('\n').length,
      '发现 :root 定义块，令牌必须集中于 css/tokens.css');
  }
}

/* ---------- G2: style.css 不得有硬编码 #hex ---------- */
{
  const lines = styleCss.split('\n');
  lines.forEach((ln, i) => {
    const s = ln.replace(/\/\*.*?\*\//g, '');
    for (const m of s.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      add('G2', 'css/style.css', i + 1, '硬编码色值 ' + m[0] + ' → 改用 var(--c-*) 或语义令牌');
    }
  });
}

/* ---------- G3: var() 引用必须已定义 ---------- */
{
  for (const f of ['css/style.css', 'js/ui.js']) {
    const src = f.endsWith('.css') ? styleCss : uiJs;
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      for (const m of ln.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
        if (!defined.has(m[1])) add('G3', f, i + 1, '引用未定义令牌 ' + m[1]);
      }
    });
  }
}

/* ---------- 选择器族层叠表：用于 G7 跨规则判定 ----------
 * 例：.gd span{font-size:12px} 与 .gd.on span{font-weight:700} 分属两条规则，
 *     但作用在同一元素上，实际渲染就是「12px 中文 + 粗体」→ 笔画粘连必糊。
 *     故按「去掉状态类后的选择器」归族，跨规则合并计算最终生效的字号/字重。 */
const STATE_CLS = /\.(on|act|active|cur|sel|selected|dis|disabled|hot|new|lock)\b/g;
const famFs = new Map();   // 族选择器 -> 该族基础 font-size
{
  for (const m of styleCss.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@')) continue;
    const fsM = m[2].match(/font-size\s*:\s*([^;}]+)/);
    if (!fsM) continue;
    const val = fsM[1].replace(/\/\*.*$/, '').replace(/!important/g, '').trim();
    if (!FS_OK.test(val)) continue;
    const fam = sel.replace(STATE_CLS, '').trim();
    if (!famFs.has(fam)) famFs.set(fam, val);
  }
}

/* ---------- G4/G5/G6/G7: 声明值合规 ---------- */
{
  const lines = styleCss.split('\n');
  let curFs = null;
  let curSel = '';
  lines.forEach((ln, i) => {
    const selM = ln.match(/([^{}@]+)\{/);
    if (selM) curSel = selM[1].trim();
    const s = ln.replace(/\/\*.*?\*\//g, '');
    const no = i + 1;

    // 值清洗：剥离块注释/行注释/!important，并只取令牌本身（避免注释文字被当值）
    const clean = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/!important/g, '').trim();
    const tok = (x, re) => { const m = x.match(re); return m ? m[0] : x; };

    // 间距
    for (const m of s.matchAll(/(?:padding|margin|gap)(?:-(?:top|bottom|left|right))?\s*:\s*([^;}]+)/g)) {
      const val = clean(m[1]);
      if (/^\d+px$/.test(val)) {
        add('G4', 'css/style.css', no, '间距硬编码 ' + val + ' → 改用 var(--sp-*)（4pt 栅格）');
      } else if (/^var\(--sp-half\)$/.test(val)) {
        /* 合法半档 */
      } else if (/^var\(--sp-(\d+)\)$/.test(val)) {
        const idx = +m[1].match(/--sp-(\d+)/)[1];
        if (![0, 1, 2, 3, 4, 5, 6, 8].includes(idx)) {
          add('G4', 'css/style.css', no, '间距档位越界 --sp-' + idx);
        }
      }
    }

    // 字号
    const fsM = s.match(/font-size\s*:\s*([^;}]+)/);
    if (fsM) {
      const val = tok(clean(fsM[1]), /var\(--fs-[a-z0-9]+\)/);
      curFs = val;
      if (!FS_OK.test(val)) add('G5', 'css/style.css', no, '字号不在阶梯: ' + val);
    }
    // 字重
    const fwM = s.match(/font-weight\s*:\s*([^;}]+)/);
    if (fwM) {
      const val = tok(clean(fwM[1]), /var\(--fw-[a-z]+\)/);
      if (!FW_OK.test(val)) add('G6', 'css/style.css', no, '字重不在阶梯: ' + val);
      // G7：小字 + 粗体（同行 / 同规则块 / 同选择器族，三者任一命中即违规）
      const famFsVal = curSel ? famFs.get(curSel.replace(STATE_CLS, '').trim()) : null;
      const effFs = curFs || famFsVal;
      if (effFs && FS_SMALL.test(effFs) && FW_HEAVY.test(val)) {
        if (FIX) {
          fixG7.add(no);
        } else {
          add('G7', 'css/style.css', no,
            '中文防糊：小字(' + effFs + (curFs ? '' : ' ←同族继承') + ') 不得用 ' + val);
        }
      }
    }
  });
}

/* ---------- G8: ui.js 内联 style ---------- */
{
  const lines = uiJs.split('\n');
  lines.forEach((ln, i) => {
    const s = ln.replace(/\/\*.*?\*\//g, '');
    for (const m of s.matchAll(/style\s*=\s*["'][^"']*["']/g)) {
      const seg = m[0];
      if (/font-size\s*:\s*\d+px/.test(seg)) {
        add('G8', 'js/ui.js', i + 1, '内联硬编码 font-size → 改用 var(--fs-*)');
      }
      if (/#[0-9a-fA-F]{3,8}\b/.test(seg)) {
        add('G8', 'js/ui.js', i + 1, '内联硬编码色值 → 改用 var(--c-*)');
      }
    }
  });
}

/* ---------- --fix：自动把「小字+粗体」降级为 semibold ---------- */
if (FIX && fixG7.size) {
  const lines = styleCss.split('\n');
  for (const no of fixG7) {
    lines[no - 1] = lines[no - 1].replace(/var\(--fw-bold\)/, 'var(--fw-semibold)');
  }
  fs.writeFileSync(p('css/style.css'), lines.join('\n'));
  console.log('--fix: 已将 ' + fixG7.size + ' 处「小字+粗体」降级为 var(--fw-semibold)');
}

/* ---------- 输出 ---------- */
console.log('=== 前端架构守卫 archguard ===');
for (const [k, n] of Object.entries(stat)) console.log('  ' + k + ': ' + n);

const byRule = {};
for (const x of v) (byRule[x.rule] ||= []).push(x);

if (!v.length) {
  console.log('结果: PASS 0 违规（G1~G9 全部通过）');
  /* 机读结果行：原先恒为「PASS 0」，与「脚本崩了、一条没查」无法区分。
   * 以「受检令牌数」作覆盖面：它掉了就说明扫描范围缩水，而不是真的全通过。 */
  console.log('RESULT: PASS=' + (stat['令牌定义数'] || 0) + ' FAIL=0');
  process.exit(0);
}
console.log('结果: FAIL ' + v.length + ' 处违规');
console.log('RESULT: PASS=' + ((stat['令牌定义数'] || 0) - v.length) + ' FAIL=' + v.length);
for (const r of Object.keys(byRule).sort()) {
  const arr = byRule[r];
  console.log('  ' + r + ' x' + arr.length + '  例: ' + arr[0].file + ':' + arr[0].line + ' ' + arr[0].detail);
  for (const x of arr.slice(1, 4)) console.log('      ' + x.file + ':' + x.line + ' ' + x.detail);
  if (arr.length > 4) console.log('      ...另 ' + (arr.length - 4) + ' 处');
}
process.exit(1);
