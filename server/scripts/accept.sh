#!/bin/bash
# curl 级验收脚本：健康检查 → 配对 → whoami → 401 断言 → 示例端点读写。
# 前置：服务已启动（默认 http://localhost:8790），PAIRING_SECRET 与服务端一致。
# 用法：PAIRING_SECRET=xxx ./scripts/accept.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://localhost:8790}"
SECRET="${PAIRING_SECRET:?请设置 PAIRING_SECRET（须等于服务端 PAIRING_SECRET）}"

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const p=process.argv[1].split(".");let c=v;for(const k of p){if(c==null)break;c=c[k]}console.log(typeof c==="string"?c:JSON.stringify(c))})' "$1"; }

echo "== 0. 健康检查"
curl -sf "$BASE/healthz" | json ok

echo "== 1. 配对领取长期 token"
PAIR=$(curl -sf -X POST "$BASE/v1/auth/pair" -H 'content-type: application/json' \
  -d "{\"pairingSecret\":\"$SECRET\"}")
TOKEN=$(echo "$PAIR" | json token)
DEVICE=$(echo "$PAIR" | json deviceId)
echo "deviceId: $DEVICE  token: ${TOKEN:0:12}..."
AUTH="Authorization: Bearer $TOKEN"

echo "== 2. whoami"
WHO=$(curl -sf "$BASE/v1/auth/whoami" -H "$AUTH" | json deviceId)
[ "$WHO" = "$DEVICE" ] || { echo "FAIL: whoami deviceId 不一致（$WHO != $DEVICE）"; exit 1; }
echo "whoami: $WHO"

echo "== 3. 错误 token 必须 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/auth/whoami" -H 'Authorization: Bearer at_bogus')
[ "$CODE" = "401" ] || { echo "FAIL: 错误 token 返回 $CODE 而非 401"; exit 1; }
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/entities/accept-e1")
[ "$CODE" = "401" ] || { echo "FAIL: 无 token 访问受保护端点返回 $CODE 而非 401"; exit 1; }
echo "401 断言通过"

echo "== 4. 示例端点：entities 透传写读"
curl -sf -X PUT "$BASE/v1/entities/accept-e1" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"payload":{"title":"验收实体","n":42}}' | json id
GOT=$(curl -sf "$BASE/v1/entities/accept-e1" -H "$AUTH" | json payload.title)
[ "$GOT" = "验收实体" ] || { echo "FAIL: payload 回读不一致（got=$GOT）"; exit 1; }
echo "回读: $GOT"

echo "== 5. 错误配对密钥必须 403"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/auth/pair" \
  -H 'content-type: application/json' -d '{"pairingSecret":"wrong"}')
[ "$CODE" = "403" ] || { echo "FAIL: 错误密钥返回 $CODE 而非 403"; exit 1; }
echo "403 断言通过"

echo "== 全部通过"
