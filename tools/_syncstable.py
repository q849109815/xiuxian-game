#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""取样稳定证 —— 防止并发跑批把「瞬时态」写成发布结论。

立规原因（V1.3.96 收口实测）：上一轮同时跑 toolaudit 全量体检（内含大量
mutate_* 变异工具）、完整看板与 synccheck，变异工具会临时改写 js/config.js
再在 finally 还原。synccheck 的单次取样恰好撞进那个窗口，把临时态的 sha
写进 _scan/synclast.json（consistent=false, diff=['js/config.js']）。
随后 fullscan 的 D3 读到这份基准，报「确认污染，必须修」——而本地与云端
12 个受控文件逐字节一致，根本没有任何污染。

根因在取样端，不在判据端：单次取样无法区分「真差异」和「并发写入瞬间」。
本模块提供 stable_sha()：连续两次读到相同 sha 才认为文件已稳定，最多
tries 轮；持续变化或读不到就显式判「不稳定」，由调用方判前提未就绪、
不落盘、不写假结论。

sha 口径与 synccheck.blobsha 完全一致（Git blob sha），可直接与
git trees API 返回的 sha 比对。
退出码语义由调用方决定；本模块只返回 (sha_or_None, stable_bool)。
"""
import hashlib
import os
import time


def blobsha(b):
    return hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()


def read_sha(fp):
    try:
        with open(fp, 'rb') as f:
            return blobsha(f.read())
    except OSError:
        return None


def stable_sha(fp, first, tries=4, gap=0.12):
    """连续两次读到相同 sha 才算稳定。

    first: 调用方第一次取样拿到的 sha（可能来自并发窗口内的临时态）
    返回: (最终 sha, 是否稳定)
      - 稳定且等于 first       -> 真差异，调用方应如实报不一致
      - 稳定但不等于 first     -> 瞬时态已收敛，用最终 sha 重判
      - 不稳定 / 文件消失      -> (None 或最后一次值, False)，调用方须判前提未就绪
    """
    prev = first
    for _ in range(tries):
        time.sleep(gap)
        cur = read_sha(fp)
        if cur is None:
            return None, False
        if cur == prev:
            return cur, True
        prev = cur
    return prev, False
