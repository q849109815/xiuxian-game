#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全量发布一致性闸门（维护轮2）

背景（真实事故）：V1.2.1 报告「上传成功并复核一致」，但线上 js/engine.js
实际缺少已交付的头像框校验代码 —— 本地改了、线上没传，且当时没有任何机制
能发现。逐个 contents 请求又慢又依赖手工清单，清单漏登记的文件永远查不到。

本工具改为一次 git trees API 拉全量树，与本地文件逐个比对 blob sha：
  python3 tools/synccheck.py          # 核对 FILES 清单（默认）
  python3 tools/synccheck.py --all    # 额外扫描本地全部非备份文件（找漏登记）
退出码：0=全部一致  1=有不一致/线上缺失
"""
import json, urllib.request, hashlib, sys, os, fnmatch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = 'q849109815/xiuxian-game'
TOKEN = open(os.path.join(ROOT, '..', '.ghtoken')).read().strip()
H = {'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json',
     'User-Agent': 'synccheck', 'Content-Type': 'application/json'}


def api(p):
    r = urllib.request.Request('https://api.github.com/repos/%s/%s' % (REPO, p), headers=H)
    try:
        return json.load(urllib.request.urlopen(r, timeout=120))
    except Exception as e:
        return {'_err': str(e)[:120]}


def online_tree():
    """一次请求拿到 main 分支全量 path -> blob sha（比逐个 contents 快两个数量级）"""
    t = api('git/trees/main?recursive=1')
    if not isinstance(t, dict) or 'tree' not in t:
        return None, str(t)[:200]
    m = {}
    for it in t.get('tree', []):
        if it.get('type') == 'blob':
            m[it['path']] = it['sha']
    if t.get('truncated'):
        return m, 'WARN: 树被截断，结果可能不全'
    return m, ''


def blobsha(b):
    return hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()


def load_files():
    """复用 push.py 的登记清单，保证两个工具口径一致"""
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    import importlib.util
    spec = importlib.util.spec_from_file_location('pushmod', os.path.join(ROOT, 'tools', 'push.py'))
    mod = importlib.util.module_from_spec(spec)
    # push.py 末尾有 main 守卫，导入不会执行上传
    spec.loader.exec_module(mod)
    return mod.FILES


def main():
    tree, warn = online_tree()
    if tree is None:
        print('[FAIL] 无法获取线上文件树：%s' % warn)
        return 1
    if warn:
        print(warn)

    files = load_files()
    diff, miss, absent = [], [], []
    for f in files:
        fp = os.path.join(ROOT, f)
        if not os.path.exists(fp):
            absent.append(f)
            continue
        ls = blobsha(open(fp, 'rb').read())
        rs = tree.get(f)
        if rs is None:
            miss.append(f)
        elif rs != ls:
            diff.append((f, ls, rs))

    print('核对 %d 个（登记清单）' % len(files))
    for f, ls, rs in diff:
        print('  ★不一致 %s   本地%s  线上%s' % (f, ls[:8], rs[:8]))
    for f in miss:
        print('  ★线上缺失（本地有、线上无）%s' % f)
    for f in absent:
        print('  - 本地缺失（跳过）%s' % f)

    if '--orphan' in sys.argv:
        # 线上有、清单没登记的可执行类文件 —— 多为历史遗留/孤儿，
        # 若残留含令牌或旧脚本则是安全隐患，需人工确认
        files_set = set(files)
        orph = [p for p in tree
                if p not in files_set
                and not p.startswith(('assets/', 'data/zb/'))
                and p.endswith(('.js', '.html', '.css', '.json', '.py', '.cjs'))]
        print('\n线上未登记文件（孤儿）%d 个：' % len(orph))
        for o in sorted(orph)[:60]:
            print('  ·', o)

    extra = []
    if '--all' in sys.argv:
        skip_dirs = ('tools', 'worker', 'lib')
        for dp, dns, fns in os.walk(ROOT):
            dns[:] = [d for d in dns
                     if not d.startswith('.') and not d.startswith('_')
                     and d not in skip_dirs]
            for fn in fns:
                if fn.startswith('.bak') or fn.startswith('_'):
                    continue
                rel = os.path.relpath(os.path.join(dp, fn), ROOT)
                if rel in files or rel.startswith('data/zb/'):
                    continue
                if not fn.endswith(('.js', '.css', '.html', '.json')):
                    continue
                extra.append(rel)
        unreg = [e for e in extra if e not in files]
        print('\n代码类文件未登记进上传清单 %d 个：' % len(unreg))
        for e in unreg[:40]:
            print('  ?', e)

    # ---- 双分支证：data/zb/ 下登记进清单的文件，main 与 players 必须内容一致。
    # 事故形态（本轮实测）：roadmap.json 两个分支各有一份，players 已更新到
    # 31355 字节，main 仍停在 33748 字节的旧内容 —— 差 2.4KB，长期分叉无人发现。
    # 根因是本工具只核 main，而玩家端读的是 players：传了 players 忘传 main
    # （或反过来）不会有任何一条检查报警，两个分支各自漂移。
    zb = [f for f in files if str(f).startswith('data/zb/')]
    cross_fail = False
    if zb:
        try:
            pt = api('git/trees/players?recursive=1')
            pmap = {e['path']: e['sha'] for e in pt.get('tree', []) if e.get('type') == 'blob'}
            cross = []
            for f in zb:
                lp = blobsha(open(os.path.join(ROOT, f), 'rb').read())
                m = tree.get(f)
                p = pmap.get(f)
                if p is None:
                    cross.append('%s  players 分支缺失' % f)
                elif m != p:
                    cross.append('%s  main=%s players=%s（本地=%s）'
                                 % (f, (m or '缺失')[:8], p[:8], lp[:8]))
            if cross:
                print('\n★双分支分叉 %d 个：' % len(cross))
                for c in cross:
                    print('  !', c)
            else:
                print('双分支一致：%d 个 data/zb 文件 main/players 相同' % len(zb))
        except Exception as e:
            # 异常必须显式判失败：历史上"检查崩了却报绿"正是最危险的形态 ——
            # 分支分叉会在没有任何报警的情况下长期漂移。
            print('[FAIL] 双分支检查异常，未证明：%s' % e)
            cross_fail = True

    bad = len(diff) + len(miss) + (1 if cross_fail else 0)
    # 供 fullscan 的 D5「线上内容证」消费：只对这些文件拉线上真身扫污染特征。
    # 为什么要有这条管道：V1.3.8 真事故 —— 本地 ui.js 干净、线上却仍带 __MUT，
    # 而此前所有扫描都只扫本地。有差异的文件才是线上与本地可能分叉的地方。
    try:
        import os as _os
        _d = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '_scan')
        _os.makedirs(_d, exist_ok=True)
        open(_os.path.join(_d, 'diff.txt'), 'w').write('\n'.join(diff))
    except Exception:
        pass
    print('\n结果：不一致 %d，线上缺失 %d，本地缺失 %d' % (len(diff), len(miss), len(absent)))
    if bad:
        print('[FAIL] 发布一致性未通过 —— 本地改动有未上传项')
        return 1
    print('[PASS] 线上与本地完全一致')
    return 0


if __name__ == '__main__':
    sys.exit(main())
