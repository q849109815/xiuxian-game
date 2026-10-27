#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""轻量上传：只传指定文件（避开 push.py 全量扫描在沙盒下的 502）。

用法: python3 tools/upsel.py <相对路径> [...]
分支规则: data/zb/* -> players 分支，其余 -> main
"""
import json, urllib.request, base64, hashlib, sys, os

ROOT = '/data/workspace/zombie'
REPO = 'q849109815/xiuxian-game'
TOKEN = open('/data/workspace/.ghtoken').read().strip()
H = {'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json',
     'User-Agent': 'upsel', 'Content-Type': 'application/json'}


def api(url, data=None, method=None):
    req = urllib.request.Request(url, headers=H, method=method,
                                 data=json.dumps(data).encode() if data else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'_err': e.code, '_body': e.read().decode()[:200]}


def get_sha(rel, br):
    j = api(f'https://api.github.com/repos/{REPO}/contents/{rel}?ref={br}')
    return j.get('sha') if isinstance(j, dict) and 'sha' in j else None


def push(rel, msg):
    br = os.environ.get('BR') or ('players' if rel.startswith('data/zb/') else 'main')
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        print(f'  × {rel} 本地不存在'); return False
    body = open(p, 'rb').read()
    sha = get_sha(rel, br)
    d = {'message': msg, 'content': base64.b64encode(body).decode(), 'branch': br}
    if sha:
        d['sha'] = sha
    r = api(f'https://api.github.com/repos/{REPO}/contents/{rel}', d, 'PUT')
    if isinstance(r, dict) and r.get('content'):
        # 复核：拉回线上比对 sha1
        j = api(f'https://api.github.com/repos/{REPO}/contents/{rel}?ref={br}')
        remote = base64.b64decode(j['content'].replace('\n', '')).decode('utf-8', 'replace')
        ok = remote == body.decode('utf-8', 'replace')
        print(f'  {"√" if ok else "×"} {rel} [{br}] 复核{"一致" if ok else "不一致"}')
        return ok
    print(f'  × {rel} 上传失败 {str(r)[:160]}')
    return False


if __name__ == '__main__':
    files = sys.argv[1:]
    msg = 'V1.3.7211111 后台图标版本戳同步与工具链缺陷修复'
    ok = 0
    for f in files:
        if push(f, msg):
            ok += 1
    print(f'上传成功 {ok}/{len(files)}')
    sys.exit(0 if ok == len(files) else 1)
