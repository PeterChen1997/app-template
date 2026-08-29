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
echo "  2. 给本项目分配一台专用模拟器并记下 UDID（多项目并行时不共用），"
echo "     配合 Metro 端口 $METRO_PORT 使用："
echo "       xcrun simctl list devices | grep -i booted"
echo "       pnpm ios -- --udid <UDID>"
echo "  3. 把分配结果写进项目自己的开发文档（哪台模拟器、哪个端口）"
echo "  4. pnpm install && pnpm verify"
