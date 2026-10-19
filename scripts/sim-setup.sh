#!/usr/bin/env bash
# 创建 / 查找本项目的专用模拟器：最新 iOS 大版本 + 上一大版本各一台，命名「<App> iOS<N>」。
#
# 用法：
#   scripts/sim-setup.sh                  # 默认机型 iPhone 17 Pro
#   SIM_DEVICE_TYPE="iPhone 16 Pro" scripts/sim-setup.sh
#
# 约定（多项目、多会话并行时的硬规矩）：
# - 每个项目只用自己名下的模拟器，不往别的项目（或无主的「iPhone 17 Pro」共享机）上装包；
# - 只创建、不删除：同名已存在就复用，脚本绝不 simctl delete 任何设备；
# - 跑完把输出的 UDID 登记进 CLAUDE.md「专用模拟器」一节；
# - 新 iOS 大版本出来、装了新 runtime 后重跑一次，会补建新的那台。
#
# 输出：每台一行 `SIM <名字> <UDID> <runtime>`，最后 `SIM_SETUP_OK`。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME=$(node -p "require('${ROOT}/app.json').expo.name")
case "${APP_NAME}" in
  *__*__*) echo "PLACEHOLDER_FAILED：app.json name 还是占位符，先跑 scripts/init.sh" >&2; exit 1 ;;
esac
DEVICE_TYPE="${SIM_DEVICE_TYPE:-iPhone 17 Pro}"

# 已安装且可用的 iOS runtime，按大版本取每个大版本里最新的那个，再取最大的两个大版本
RUNTIMES=$(xcrun simctl list runtimes -j | node -e '
  const rows = JSON.parse(require("fs").readFileSync(0, "utf8")).runtimes
    .filter((r) => r.platform === "iOS" && r.isAvailable);
  const byMajor = new Map();
  for (const r of rows) {
    const major = Number(r.version.split(".").at(0));
    const prev = byMajor.get(major);
    const newer = !prev || r.version.localeCompare(prev.version, undefined, { numeric: true }) > 0;
    if (newer) byMajor.set(major, r);
  }
  const majors = [...byMajor.keys()].sort((a, b) => b - a).slice(0, 2);
  for (const m of majors) console.log(`${m}\t${byMajor.get(m).identifier}`);
')
[ -n "${RUNTIMES}" ] || { echo "NO_RUNTIME：没有可用的 iOS 模拟器 runtime（Xcode → Settings → Components 下载）" >&2; exit 1; }
[ "$(printf '%s\n' "${RUNTIMES}" | wc -l | tr -d ' ')" -ge 2 ] || echo "⚠️  只装了一个 iOS 大版本的 runtime，上一大版本那台建不了——双系统闸门缺一台，需补装 runtime" >&2

while IFS=$'\t' read -r MAJOR RUNTIME; do
  NAME="${APP_NAME} iOS${MAJOR}"
  # 精确匹配名字（行首缩进 + 名字 + 空格 + 括号），避免「X iOS2」误中「X iOS27」
  UDID=$(xcrun simctl list devices | grep -E "^ +$(printf '%s' "${NAME}" | sed 's/[][\.*^$]/\\&/g') \(" | grep -oE '[0-9A-F-]{36}' | head -1 || true)
  if [ -z "${UDID}" ]; then
    UDID=$(xcrun simctl create "${NAME}" "${DEVICE_TYPE}" "${RUNTIME}")
    echo "SIM ${NAME} ${UDID} ${RUNTIME}（新建）"
  else
    echo "SIM ${NAME} ${UDID} ${RUNTIME}（已存在，复用）"
  fi
done <<< "${RUNTIMES}"

echo "SIM_SETUP_OK"
