#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tokenize.py —— 设计令牌迁移工具（幂等）

把 css/style.css（及 js 内联 style）中的硬编码色值/间距/字号/字重
迁移到 css/tokens.css 定义的令牌上，建立「单一真源」。

用法：
  python3 tools/tokenize.py --dry-run   只出报告，不写文件
  python3 tools/tokenize.py             执行迁移（自动 .bak）

安全约束：
  * 色值：仅当与某令牌色差 <= TOL 才替换（保真优先），否则保留原值并计入技术债
  * 间距：向下取整到 4pt 栅格（只会变小，绝不撑破布局）
  * 字号：非阶梯值向最近阶梯靠拢，11px 强制提到 12px
  * 字重：800/900 -> 700；且「字号<=14px 且 字重>=700」降为 600（中文小字防糊）
"""
import re, os, sys, shutil, datetime, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS  = os.path.join(ROOT, 'css', 'style.css')
TOK  = os.path.join(ROOT, 'css', 'tokens.css')
UIJS = os.path.join(ROOT, 'js', 'ui.js')

TOL = 28.0          # 色差阈值（RGB 欧氏距离）
SP_GRID = [0, 4, 8, 12, 16, 20, 24, 32]

FS_STEP = {12:'--fs-xs',13:'--fs-sm',14:'--fs-md',16:'--fs-lg',18:'--fs-xl',
           20:'--fs-2xl',24:'--fs-3xl',28:'--fs-4xl',32:'--fs-5xl',36:'--fs-display',
           44:'--fs-hero',64:'--fs-mega'}
FS_MAP = {11:12, 15:16, 19:20, 26:24, 30:28, 34:32, 46:44, 70:64}   # 非阶梯值 -> 阶梯
FW_MAP = {400:'--fw-regular',500:'--fw-medium',600:'--fw-semibold',700:'--fw-bold'}
FW_DOWN = {800:700, 900:700}

def norm_hex(h):
    h = h.lower().lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    elif len(h) == 8: h = h[:6]
    elif len(h) == 4: h = h[:3]; h = ''.join(c*2 for c in h)
    return h

def hex2rgb(h): return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def cdist(a, b): return sum((x-y)**2 for x, y in zip(a, b))**0.5

# ---------- L0 色板 ----------
def load_palette():
    t = open(TOK, encoding='utf-8').read()
    pal = {}
    for m in re.finditer(r'(--c-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})', t):
        pal[m.group(1)] = norm_hex(m.group(2))
    return pal

PAL = load_palette()
PAL_RGB = {k: hex2rgb(v) for k, v in PAL.items()}

def best_color(h):
    r = hex2rgb(h)
    bn, bd = None, 1e9
    for n, v in PAL_RGB.items():
        d = cdist(r, v)
        if d < bd: bd, bn = d, n
    return bn, bd

# ---------- 统计 ----------
stat = collections.Counter()
debt = {'color': collections.Counter(), 'space': collections.Counter(),
        'fs': collections.Counter()}

def repl_hex(m):
    raw = m.group(0)
    h = norm_hex(raw)
    if len(h) != 6: return raw
    n, d = best_color(h)
    if n and d <= TOL:
        stat['color'] += 1
        return 'var(%s)' % n
    debt['color']['#'+h] += 1
    return raw

def repl_px(m):
    """padding/margin/gap 的 px 值 -> 4pt 栅格（向下取整）"""
    v = int(m.group(1))
    if v < 4: return m.group(0)
    cand = [g for g in SP_GRID if g <= v]
    g = max(cand) if cand else 0
    stat['space'] += 1
    return 'var(--sp-%d)' % (SP_GRID.index(g) if g in SP_GRID else 0)

SP_IDX = {0:0, 4:1, 8:2, 12:3, 16:4, 20:5, 24:6, 32:8}

def repl_px2(m):
    v = int(m.group(1))
    if v < 4: return m.group(0)
    cand = [g for g in SP_GRID if g <= v]
    g = max(cand) if cand else 0
    stat['space'] += 1
    return 'var(--sp-%d)' % SP_IDX[g]

def repl_fs(m):
    v = int(m.group(1))
    tgt = v if v in FS_STEP else FS_MAP.get(v)
    if tgt is None:
        debt['fs'][str(v)+'px'] += 1
        return m.group(0)
    stat['fs'] += 1
    return 'var(%s)' % FS_STEP[tgt]

def repl_fw(m):
    v = int(m.group(1))
    v = FW_DOWN.get(v, v)
    if v not in FW_MAP: return m.group(0)
    stat['fw'] += 1
    return 'var(%s)' % FW_MAP[v]

# ---------- 处理 CSS ----------
def process_css(text):
    # 1) 摘掉既有 :root{...}（迁移后由 tokens.css 统一提供）
    roots = []
    def _cut(m):
        roots.append(m.group(0))
        return '/* :root moved to tokens.css */'
    text = re.sub(r':root\s*\{[^}]*\}', _cut, text)
    stat['root_blocks'] = len(roots)

    # 2) 色值（跳过已经是 var() 的）
    text = re.sub(r'#[0-9a-fA-F]{3,8}\b', repl_hex, text)

    # 3) 间距
    for prop in ('padding', 'margin', 'gap'):
        text = re.sub(prop + r'(?:-(?:top|bottom|left|right))?\s*:\s*([0-9]+)px\b',
                      lambda m: m.group(0).replace(m.group(1)+'px', repl_px2(m)), text)

    # 4) 字号
    text = re.sub(r'font-size\s*:\s*([0-9]+)px\b',
                  lambda m: m.group(0).replace(m.group(1)+'px', repl_fs(m)), text)
    # 5) 字重
    text = re.sub(r'font-weight\s*:\s*([0-9]{3})\b',
                  lambda m: m.group(0).replace(m.group(1), repl_fw(m)), text)

    # 6) 小字降粗：同一规则块内 font-size<=14 且 font-weight:700 -> 600
    def soften(block):
        fs = re.search(r'font-size\s*:\s*var\(--fs-(xs|sm|md)\)', block)
        if fs and re.search(r'font-weight\s*:\s*var\(--fw-bold\)', block):
            block = block.replace('var(--fw-bold)', 'var(--fw-semibold)')
            stat['soften'] += 1
        return block
    text = re.sub(r'\{[^{}]*\}', lambda m: soften(m.group(0)), text)
    return text

# ---------- 处理 JS 内联 style ----------
def process_js(text):
    def inner(m):
        s = m.group(0)
        s = re.sub(r'font-size\s*:\s*([0-9]+)px',
                   lambda x: x.group(0).replace(x.group(1)+'px', repl_fs(x)), s)
        s = re.sub(r'font-weight\s*:\s*([0-9]{3})',
                   lambda x: x.group(0).replace(x.group(1), repl_fw(x)), s)
        s = re.sub(r'#[0-9a-fA-F]{3,8}\b', repl_hex, s)
        return s
    return re.sub(r'style\s*=\s*["\'][^"\']*["\']', inner, text)

def main():
    dry = '--dry-run' in sys.argv
    css = open(CSS, encoding='utf-8').read()
    js  = open(UIJS, encoding='utf-8').read()

    # 校验：style.css 引用的 var() 是否都在 tokens.css 定义
    tok = open(TOK, encoding='utf-8').read()
    defined = set(re.findall(r'(--[a-z0-9-]+)\s*:', tok))
    used = set(re.findall(r'var\((--[a-z0-9-]+)', css))
    missing = sorted(used - defined)
    stat['missing_token'] = len(missing)

    out_css = process_css(css)
    out_js  = process_js(js)

    print('=== 迁移统计 ===')
    for k, v in stat.items(): print('  %-16s %s' % (k, v))
    print('=== 技术债（未映射，保留原值）===')
    for k, v in debt.items():
        print('  %-8s 种类 %d  出现 %d' % (k, len(v), sum(v.values())))
        for kk, vv in v.most_common(8): print('      %-12s x%d' % (kk, vv))
    if missing:
        print('!!! tokens.css 缺少定义: %s' % missing[:20])
    else:
        print('  令牌完整性: 全部引用已定义 OK')

    if dry:
        print('(dry-run，未写文件)')
        return 0
    if missing:
        print('!!! 存在未定义令牌，终止迁移（安全保护）')
        return 2

    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    shutil.copy(CSS,  CSS + '.bak_tok_' + ts)
    shutil.copy(UIJS, UIJS + '.bak_tok_' + ts)
    open(CSS, 'w', encoding='utf-8').write(out_css)
    open(UIJS, 'w', encoding='utf-8').write(out_js)
    print('已写入: css/style.css, js/ui.js  (备份 .bak_tok_%s)' % ts)
    return 0

if __name__ == '__main__':
    sys.exit(main())
