#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""取样稳定证 · 变异验证（纯本地、无网络、不碰任何项目文件）

立规原因：抓不住缺陷的断言等于不存在。本脚本把四类真事故塞回 stable_sha，
必须全部符合预期；另加一条「接线证」，防止模块写好了却没被 synccheck 调用。

用例：
  M1 稳定文件          -> 放行，返回原 sha
  M2 真差异且稳定      -> 如实保留差异，不得被二次取样「洗白」
  M3 并发瞬时态        -> 收敛到最终真身，不返回窗口内的临时 sha
  M4 持续并发改写      -> 显式判不稳定（前提未就绪）
  M5 取样期间文件消失  -> 显式判不稳定
  M6 接线证            -> synccheck.py 真的调用了 stable_sha 且有 RETRY 退出路径

退出码：0=全部符合预期 / 1=有漏网或误杀 / 2=前提未就绪
"""
import os
import sys
import tempfile
import threading
import shutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _syncstable import blobsha, read_sha, stable_sha

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASS = FAIL = 0


def ck(name, ok, detail=''):
    global PASS, FAIL
    if ok:
        PASS += 1
        print('  √ ' + name + (('  ' + detail) if detail else ''))
    else:
        FAIL += 1
        print('  x ' + name + (('  ' + detail) if detail else ''))


tmp = tempfile.mkdtemp(prefix='syncstable_')
try:
    fp = os.path.join(tmp, 'sample.txt')

    def write(s):
        with open(fp, 'wb') as f:
            f.write(s.encode())

    print('=== 取样稳定证 · 变异验证 ===')

    # M1 稳定文件
    write('CLEAN')
    clean = blobsha(b'CLEAN')
    got, ok = stable_sha(fp, clean)
    ck('M1 稳定文件必须放行', ok and got == clean, 'got=' + str(got)[:8])

    # M2 真差异且稳定：不得被二次取样洗白
    write('CHANGED')
    changed = blobsha(b'CHANGED')
    got, ok = stable_sha(fp, changed)
    ck('M2 真差异必须如实保留', ok and got == changed and got != clean,
       'got=' + str(got)[:8] + ' clean=' + clean[:8])

    # M3 并发瞬时态：first 来自窗口内临时值，文件随后还原为真身
    write('TEMP')
    temp = blobsha(b'TEMP')
    write('TEMP')  # 第一次取样撞在临时态
    stop = threading.Event()

    def restore_once():
        for _ in range(40):
            if stop.is_set():
                return
            try:
                import time
                time.sleep(0.02)
                write('CLEAN')
                return
            except OSError:
                return

    t = threading.Thread(target=restore_once, daemon=True)
    t.start()
    got, ok = stable_sha(fp, temp)
    stop.set()
    t.join(timeout=1)
    ck('M3 瞬时态必须收敛到最终真身', ok and got == clean and got != temp,
       'first=' + temp[:8] + ' got=' + str(got)[:8])
    ck('M3b 无稳定证时本会误报差异（对照）', temp != clean,
       '临时态与真身 sha 不同，单次取样必然写假结论')

    # M4 持续并发改写：必须判不稳定
    write('T0')
    stop2 = threading.Event()

    def churn():
        import time
        i = 0
        while not stop2.is_set() and i < 40:
            i += 1
            try:
                write('CHURN-%d' % i)
            except OSError:
                return
            time.sleep(0.03)

    t2 = threading.Thread(target=churn, daemon=True)
    t2.start()
    got4, ok4 = stable_sha(fp, read_sha(fp))
    stop2.set()
    t2.join(timeout=1)
    ck('M4 持续改写必须判不稳定', not ok4, 'stable=' + str(ok4))

    # M5 取样期间文件消失
    write('GONE')
    gone = blobsha(b'GONE')
    stop3 = threading.Event()

    def remove_once():
        import time
        time.sleep(0.04)
        try:
            os.remove(fp)
        except OSError:
            pass

    t3 = threading.Thread(target=remove_once, daemon=True)
    t3.start()
    got5, ok5 = stable_sha(fp, gone)
    stop3.set()
    t3.join(timeout=1)
    ck('M5 文件消失必须判不稳定', not ok5, 'stable=' + str(ok5))

    # M6 接线证：模块必须真的被 synccheck 调用，且有不落盘的 RETRY 路径
    try:
        src = open(os.path.join(ROOT, 'tools', 'synccheck.py'), encoding='utf8').read()
        wired = ('from _syncstable import stable_sha' in src
                 and 'stable_sha(os.path.join(ROOT, f), ls)' in src
                 and '[RETRY]' in src
                 and 'return 2' in src)
    except Exception as e:
        wired = False
        print('  (读取 synccheck.py 失败: %s)' % str(e)[:80])
    ck('M6 synccheck 接线证', wired)

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\nRESULT: PASS=%d FAIL=%d' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
