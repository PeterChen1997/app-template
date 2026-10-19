#!/usr/bin/env bash
# 打 Release 模拟器包（Maestro E2E 与冷启动闸门的唯一测试对象），并做三项产物核验。
#
# 用法：
#   scripts/build-sim-release.sh            # 产物在 ios/build-sim-release/
#   BUILD_LOG=/path/to/log scripts/build-sim-release.sh
#
# 为什么是 Release：Debug dev-client 没有内嵌 JS bundle，clearState 后停在「选 Metro」页，
# E2E 全挂；而且 Release 才是用户拿到的那个包——闪退只在 Release 上暴露的情况真实发生过。
#
# EXPO_PUBLIC_* 编译期开关（如 EXPO_PUBLIC_SKIP_ONBOARDING=1）在调用前 export 即可，
# 会被内联进 bundle；脚本会把它们打印出来，免得「以为带了其实没带」。
# ⚠️ 带了这类开关的包只能用于 E2E，绝不能拿去发 TestFlight（app-testflight 会拒绝脏环境）。
#
# 判定只看最后一行标记：SIM_RELEASE_OK / *_FAILED。构建日志必须落文件再 grep，
# 不接管道（xcodebuild | grep 的退出码是 grep 的，会假绿）。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
export PATH="/opt/homebrew/bin:${PATH}" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

APP_NAME=$(node -p "require('./app.json').expo.name")
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")
case "${APP_NAME}${BUNDLE_ID}" in
  *__*__*) echo "PLACEHOLDER_FAILED：app.json 里还有模板占位符，先跑 scripts/init.sh"; exit 1 ;;
esac

# expo prebuild 生成的工程名 = app.json name 去掉非字母数字
PROJ=$(printf '%s' "${APP_NAME}" | tr -cd '[:alnum:]')
WS="ios/${PROJ}.xcworkspace"
DERIVED="ios/build-sim-release"
LOG="${BUILD_LOG:-${ROOT}/ios/build-sim-release.log}"

[ -d "${WS}" ] || { echo "PREBUILD_MISSING：没有 ${WS}，先跑 pnpm exec expo prebuild -p ios"; exit 1; }

echo "== Release 模拟器包：${PROJ}（${BUNDLE_ID}）"
env | grep '^EXPO_PUBLIC_' | sed 's/^/   编译期开关 /' || echo "   无 EXPO_PUBLIC_* 开关"

xcodebuild -workspace "${WS}" -scheme "${PROJ}" -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "${DERIVED}" build > "${LOG}" 2>&1
if ! grep -q "BUILD SUCCEEDED" "${LOG}"; then
  grep " error:" "${LOG}" | sort -u | head -15
  echo "BUILD_FAILED：日志 ${LOG}"
  exit 1
fi

APP="${DERIVED}/Build/Products/Release-iphonesimulator/${PROJ}.app"
PL="${APP}/Info.plist"
[ -f "${PL}" ] || { echo "APP_MISSING_FAILED：找不到 ${APP}"; exit 1; }

# 核验 1：bundle id 是本项目的（装错包 = 后面全部白测）
GOT_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${PL}")
[ "${GOT_ID}" = "${BUNDLE_ID}" ] || { echo "BUNDLE_ID_FAILED：产物是 ${GOT_ID}，app.json 是 ${BUNDLE_ID}"; exit 1; }

# 核验 2：SDK 27+ 必须带 UIScene 清单（否则 iOS 27 启动即崩，
# 栈顶 _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke）
SDK=$(/usr/libexec/PlistBuddy -c 'Print :DTSDKName' "${PL}")
SDK_MAJOR=$(printf '%s' "${SDK}" | sed -E 's/^[a-z]+([0-9]+).*/\1/')
if /usr/libexec/PlistBuddy -c 'Print :UIApplicationSceneManifest' "${PL}" > /dev/null 2>&1; then
  SCENE=yes
else
  SCENE=no
fi
echo "   DTSDKName=${SDK}  UIApplicationSceneManifest=${SCENE}"
if [ "${SDK_MAJOR:-0}" -ge 27 ] && [ "${SCENE}" = no ]; then
  echo "SCENE_FAILED：${SDK} 打的包没有 UIApplicationSceneManifest——检查 app.json 里 expo-build-properties 的 ios.enableSceneSupport: true，然后重新 prebuild"
  exit 1
fi

# 核验 3：内嵌的是 Release JS bundle（Hermes 字节码），不是空包 / dev bundle
JSB="${APP}/main.jsbundle"
[ -s "${JSB}" ] || { echo "JSBUNDLE_FAILED：${APP} 里没有 main.jsbundle（Release 包不连 Metro，没 bundle 就是白屏）"; exit 1; }
MAGIC=$(head -c 8 "${JSB}" | xxd -p)
[ "${MAGIC}" = "c61fbc03c103191f" ] || { echo "JSBUNDLE_FAILED：main.jsbundle 不是 Hermes 字节码（magic=${MAGIC}），疑似 dev bundle"; exit 1; }
echo "   main.jsbundle $(du -h "${JSB}" | cut -f1)（Hermes 字节码）"

echo "SIM_RELEASE_OK ${APP}"
