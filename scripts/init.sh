#!/usr/bin/env bash
# 模板初始化：把四个占位符替换成新 App 的真实值。
#
# 用法：
#   交互式    ./scripts/init.sh
#   参数式    ./scripts/init.sh <app-name> <bundle-id> <scheme> <metro-port>
# 示例：
#   ./scripts/init.sh myapp com.peterchen.myapp myapp 8090
#
# 只做字面量替换，不 git commit——替换完自己 review diff 再提交。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

APP_NAME="${1:-}"
BUNDLE_ID="${2:-}"
SCHEME="${3:-}"
METRO_PORT="${4:-}"

if [ -z "$APP_NAME" ]; then read -r -p "App 名（app.json name/slug）: " APP_NAME; fi
if [ -z "$BUNDLE_ID" ]; then read -r -p "Bundle ID（如 com.example.myapp）: " BUNDLE_ID; fi
if [ -z "$SCHEME" ]; then read -r -p "Deep link scheme（小写字母）: " SCHEME; fi
if [ -z "$METRO_PORT" ]; then read -r -p "Metro 端口（多项目共存时错开，如 8090）: " METRO_PORT; fi

for v in "$APP_NAME" "$BUNDLE_ID" "$SCHEME" "$METRO_PORT"; do
  if [ -z "$v" ]; then
    echo "四个值都不能为空" >&2
    exit 1
  fi
done

if ! printf '%s' "$METRO_PORT" | grep -Eq '^[0-9]+$'; then
  echo "Metro 端口必须是数字：$METRO_PORT" >&2
  exit 1
fi

if [ "$METRO_PORT" = "8081" ]; then
  echo "8081 不分配给任何项目（rn-metro 约定），换一个登记过的端口" >&2
  exit 1
fi

# Metro 端口以全局登记表为准（rn-metro skill）。这里只读不写：
# 登记表是多项目共享的真相源，写入交给 `metro.sh port` 自己做。
PORTS_TSV="${HOME}/.claude/skills/rn-metro/ports.tsv"
PORT_REGISTERED=unknown
if [ -f "${PORTS_TSV}" ]; then
  OWNER=$(awk -F'\t' -v p="${METRO_PORT}" '!/^#/ && $1 == p {print $2}' "${PORTS_TSV}")
  if [ -z "${OWNER}" ]; then
    PORT_REGISTERED=no
  elif [ "${OWNER}" = "$(cd "${ROOT}" && pwd -P)" ]; then
    PORT_REGISTERED=yes
  else
    echo "端口 ${METRO_PORT} 已登记给 ${OWNER}——换端口。推荐先在项目根目录跑" >&2
    echo "  ~/.claude/skills/rn-metro/metro.sh port" >&2
    echo "让它分配并登记一个端口，再把那个端口传给本脚本。" >&2
    exit 1
  fi
fi

# 占位符可能散落在配置、源码与文档里（app.json / package.json / .maestro /
# src/** / docs/** / CLAUDE.md ...），直接全仓扫，跳过 node_modules 与 .git，
# 也跳过本脚本自己（脚本正文里引用占位符是说明，不是待替换点）。
# BSD sed（macOS）需要 -i ''。
# 注意：变量一律写 ${var} 带花括号——bash 解析 $var 后面紧跟中文标点时
# 会把多字节字符吞进变量名，set -u 下直接 unbound variable。
replace_all() {
  local placeholder="$1" value="$2"
  grep -rl --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.expo \
    --exclude-dir=ios --exclude-dir=android -F "${placeholder}" "${ROOT}" 2>/dev/null |
    grep -v "scripts/init.sh$" |
    while IFS= read -r file; do
      sed -i '' "s|${placeholder}|${value}|g" "${file}"
      echo "  替换 ${placeholder} -> ${value}: ${file}"
    done
}

echo "→ 替换占位符"
replace_all "__APP_NAME__" "$APP_NAME"
replace_all "__BUNDLE_ID__" "$BUNDLE_ID"
replace_all "__SCHEME__" "$SCHEME"
replace_all "__METRO_PORT__" "$METRO_PORT"

echo ""
echo "✓ 占位符替换完成。接下来："
echo "  1. review diff：git diff"
case "${PORT_REGISTERED}" in
  no)
    echo "  2. ⚠️  Metro 端口 ${METRO_PORT} 还没在 rn-metro 登记表里。在项目根目录跑："
    echo "       ~/.claude/skills/rn-metro/metro.sh port"
    echo "     它会登记一个端口；若与 ${METRO_PORT} 不同，以它为准改 package.json 与 CLAUDE.md。"
    echo "     起 Metro 一律走 /rn-metro（metro.sh start），不要裸跑 expo start。" ;;
  yes)
    echo "  2. Metro 端口 ${METRO_PORT} 已在 rn-metro 登记表里，起 Metro 走 /rn-metro（metro.sh start）。" ;;
  *)
    echo "  2. 没找到 rn-metro 登记表（~/.claude/skills/rn-metro/ports.tsv），自行确认端口 ${METRO_PORT} 不与其他项目冲突。" ;;
esac
echo "  3. 建本项目专用模拟器（最新 iOS 大版本 + 上一大版本，命名「${APP_NAME} iOS<N>」）："
echo "       ./scripts/sim-setup.sh"
echo "     把输出的 UDID 登记进 CLAUDE.md「专用模拟器」一节；不往别的项目的模拟器上装包。"
echo "  4. pnpm install && pnpm verify"
echo "  5. 首次 E2E：pnpm exec expo prebuild -p ios && ./scripts/build-sim-release.sh && ./scripts/e2e-all.sh"
