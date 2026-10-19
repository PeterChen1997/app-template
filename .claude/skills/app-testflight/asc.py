#!/usr/bin/env python3
"""App Store Connect REST 小工具：asc.py GET <path> | asc.py POST|PATCH <path> '<json>'

输出原始 JSON（缩进），HTTP >= 400 时退出码 1。
配置走环境变量（或同目录 config.env，由 pipeline.sh source）：
  ASC_KEY_ID      API key 的 Key ID
  ASC_ISSUER_ID   Issuer ID
  ASC_KEY_PATH    .p8 私钥路径，默认 ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8
私钥只放在本机 ~/.appstoreconnect/private_keys/，绝不进仓库、绝不打印。
依赖 PyJWT（ES256）：用装了 PyJWT 的解释器跑（pipeline.sh 里的 PY 变量）。"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

import jwt

BASE = "https://api.appstoreconnect.apple.com"


def _cfg(name):
    v = os.environ.get(name, "")
    if not v:
        sys.exit(f"ASC_CONFIG_MISSING: 需要环境变量 {name}")
    return v


def token():
    kid = _cfg("ASC_KEY_ID")
    iss = _cfg("ASC_ISSUER_ID")
    key_path = os.environ.get("ASC_KEY_PATH") or os.path.expanduser(
        f"~/.appstoreconnect/private_keys/AuthKey_{kid}.p8")
    if not os.path.isfile(key_path):
        sys.exit(f"ASC_KEY_MISSING: 找不到私钥文件 {key_path}")
    now = int(time.time())
    with open(key_path) as f:
        return jwt.encode(
            {"iss": iss, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
            f.read(), algorithm="ES256", headers={"kid": kid},
        )


# 到 ASC 的链路偶发 TLS EOF：网络层错误重试 3 次（5s/10s/20s）；HTTP 4xx/5xx 原样返回给调用方判断
def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(4):
        req = urllib.request.Request(BASE + path, data=data, method=method, headers={
            "Authorization": "Bearer " + token(), "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")
        except (urllib.error.URLError, OSError) as e:
            if attempt == 3:
                raise
            wait = 5 * 2 ** attempt
            print(f"  ASC 网络错误（{e}），{wait}s 后重试 {attempt + 1}/3", file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError("unreachable")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("用法: asc.py GET|POST|PATCH <path> ['<json>']")
    method, path = sys.argv[1].upper(), sys.argv[2]
    body = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None
    status, out = call(method, path, body)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    sys.exit(0 if status < 400 else 1)
