#!/usr/bin/env bash
# TestFlight 全流程：递增 build → changelog 检查 → prebuild → archive → 归档核验 → export → altool 上传
# → 轮询 buildUploads → 等 build VALID。外测组 / Beta 审核 / 测试内容按项目在 SKILL.md 第 3 步补。
#
# 用法：TF_WORK=<ios/ 之外的工作目录> bash .claude/skills/app-testflight/pipeline.sh
#
# 配置（环境变量，或同目录 config.env——只放 ID，不放私钥）：
#   ASC_KEY_ID / ASC_ISSUER_ID   App Store Connect API key（私钥在 ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8）
#   ASC_APP_ID                   ASC 里 App 的数字 id
#   APPLE_TEAM_ID                开发者 Team ID（不是证书 CN 里那串）
#   PY                           装了 PyJWT 的 python3（默认 python3）
# 开关：
#   TF_NO_BUMP=1                 不递增 buildNumber（已手动递增 / 重跑同一 build）
#   TF_SKIP_PREBUILD=1           跳过 prebuild（已手动 prebuild + pod install）
#   TF_ALLOWED_PUBLIC_ENV="EXPO_PUBLIC_CHANNEL"   允许带进正式包的 EXPO_PUBLIC_* 变量白名单（空格分隔）
#
# 每一步看日志里的关键字判定，不看 exit code；任何一步失败立即退出并打印 *_FAILED。
# 成功路径的标记：BUMP → CHANGELOG_OK → PREBUILD_OK → ARCHIVE_OK → ARCHIVE_VERIFY_OK → EXPORT_OK
#                 → UPLOAD_OK → PROCESS_OK → VALID_OK → PIPELINE_OK
set -o pipefail
export PATH="/opt/homebrew/bin:${PATH}" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
SK="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "${SK}/../../.." && pwd)"
# shellcheck disable=SC1091
[ -f "${SK}/config.env" ] && . "${SK}/config.env"
PY="${PY:-python3}"
: "${TF_WORK:?需要 TF_WORK=<ios/ 之外的工作目录>（prebuild 会清空 ios/）}"
for v in ASC_KEY_ID ASC_ISSUER_ID ASC_APP_ID APPLE_TEAM_ID; do
  [ -n "${!v:-}" ] || { echo "CONFIG_FAILED：缺 ${v}（环境变量或 ${SK}/config.env）"; exit 1; }
done
export ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH
"${PY}" -c 'import jwt' 2>/dev/null || { echo "CONFIG_FAILED：${PY} 没有 PyJWT（pip install pyjwt cryptography，或用 PY= 指定解释器）"; exit 1; }
mkdir -p "${TF_WORK}"
cd "${REPO}" || exit 1

# 环境洁癖：EXPO_PUBLIC_* 会被内联进 bundle。E2E 用的开关（如 SKIP_ONBOARDING、debug 深链）一旦被带进正式包，
# 整条流水线不会有任何一步报错——静默出一个带测试后门的包。白名单之外一律拒绝。
DIRTY=""
for kv in $(env | grep '^EXPO_PUBLIC_' | cut -d= -f1); do
  case " ${TF_ALLOWED_PUBLIC_ENV:-} " in *" ${kv} "*) ;; *) DIRTY="${DIRTY} ${kv}" ;; esac
done
[ -z "${DIRTY}" ] || { echo "DIRTY_ENV_FAILED：环境里有会被内联进正式包的变量:${DIRTY}——开干净 shell 重跑，或列进 TF_ALLOWED_PUBLIC_ENV"; exit 1; }

APP_NAME=$(node -p "require('./app.json').expo.name")
PROJ=$(printf '%s' "${APP_NAME}" | tr -cd '[:alnum:]')

echo "== 0. 递增 buildNumber（version 不动；TF_NO_BUMP=1 跳过）=="
if [ "${TF_NO_BUMP:-0}" = "1" ]; then
  echo "BUMP_SKIPPED"
else
  node -e '
    const fs = require("fs");
    const j = JSON.parse(fs.readFileSync("app.json", "utf8"));
    const oldBuild = Number(j.expo.ios.buildNumber);
    const version = j.expo.version;
    if (!Number.isInteger(oldBuild) || !/^\d+\.\d+\.\d+$/.test(version)) {
      console.log("BUMP_FAILED: buildNumber 非整数或 version 非 x.y.z"); process.exit(1);
    }
    j.expo.ios.buildNumber = String(oldBuild + 1);
    fs.writeFileSync("app.json", JSON.stringify(j, null, 2) + "\n");
    console.log(`BUMP ${version}(${oldBuild}) -> ${version}(${oldBuild + 1})`);
  ' || exit 1
fi
BUILD=$(node -p "require('./app.json').expo.ios.buildNumber")
VERSION=$(node -p "require('./app.json').expo.version")

# 变更记录：docs/RELEASE_NOTES.md 必须有「## <version>(<build>)」标题的条目（项目可换成自己的检查命令 TF_CHANGELOG_CMD）
if [ -n "${TF_CHANGELOG_CMD:-}" ]; then
  BUILD="${BUILD}" VERSION="${VERSION}" bash -c "${TF_CHANGELOG_CMD}" || { echo "CHANGELOG_MISSING：${TF_CHANGELOG_CMD} 不通过（app.json 已升到 ${BUILD}，补完重跑传 TF_NO_BUMP=1）"; exit 1; }
else
  grep -Eq "^## ${VERSION//./\\.} ?\(${BUILD}\)" docs/RELEASE_NOTES.md 2>/dev/null \
    || { echo "CHANGELOG_MISSING：docs/RELEASE_NOTES.md 没有「## ${VERSION}(${BUILD})」条目——先补再发（app.json 已升到 ${BUILD}，重跑传 TF_NO_BUMP=1）"; exit 1; }
fi
echo "CHANGELOG_OK"
echo "== 目标 ${VERSION}(${BUILD}) =="

echo "== 1. prebuild =="
if [ "${TF_SKIP_PREBUILD:-0}" = "1" ]; then
  echo "PREBUILD_SKIPPED"
else
  pnpm exec expo prebuild -p ios > "${TF_WORK}/prebuild.log" 2>&1
  grep -q "Installing CocoaPods" "${TF_WORK}/prebuild.log" && ! grep -qE "\[!\]|Something went wrong|CocoaPods.*failed" "${TF_WORK}/prebuild.log" \
    && echo PREBUILD_OK || { tail -20 "${TF_WORK}/prebuild.log"; echo PREBUILD_FAILED; exit 1; }
fi
[ -d "ios/${PROJ}.xcworkspace" ] || { echo "PREBUILD_FAILED：ios/${PROJ}.xcworkspace 不存在"; exit 1; }
PL="ios/${PROJ}/Info.plist"
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "${PL}")" = "${BUILD}" ] || { echo "VERSION_MISMATCH：Info.plist 与 app.json 的 build 不一致"; exit 1; }

echo "== 2. archive =="
ARCHIVE="${TF_WORK}/${PROJ}.xcarchive"
rm -rf "${ARCHIVE}" "${TF_WORK}/export"
xcodebuild -workspace "ios/${PROJ}.xcworkspace" -scheme "${PROJ}" -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE}" -allowProvisioningUpdates archive > "${TF_WORK}/archive.log" 2>&1
grep -q "ARCHIVE SUCCEEDED" "${TF_WORK}/archive.log" && echo ARCHIVE_OK \
  || { grep -E " error:" "${TF_WORK}/archive.log" | sort -u | head -15; echo ARCHIVE_FAILED; exit 1; }

echo "== 2b. 归档核验（绿了的归档也可能是坏包）=="
APPDIR="${ARCHIVE}/Products/Applications/${PROJ}.app"
APL="${APPDIR}/Info.plist"
SDK=$(/usr/libexec/PlistBuddy -c 'Print :DTSDKName' "${APL}")
SDK_MAJOR=$(printf '%s' "${SDK}" | sed -E 's/^[a-z]+([0-9]+).*/\1/')
if /usr/libexec/PlistBuddy -c 'Print :UIApplicationSceneManifest' "${APL}" > /dev/null 2>&1; then SCENE=yes; else SCENE=no; fi
echo "   DTSDKName=${SDK}  UIApplicationSceneManifest=${SCENE}  CFBundleVersion=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "${APL}")"
# ① iOS 27 SDK 无 UIScene = iOS 27 上启动即崩
if [ "${SDK_MAJOR:-0}" -ge 27 ] && [ "${SCENE}" = no ]; then
  echo "ARCHIVE_BROKEN：${SDK} 打的包没有 UIApplicationSceneManifest（app.json expo-build-properties.ios.enableSceneSupport: true 后重新 prebuild）"; exit 1
fi
# ② 内嵌 bundle 必须是 Hermes 字节码的 Release bundle
JSB="${APPDIR}/main.jsbundle"
MAGIC=$(head -c 8 "${JSB}" 2>/dev/null | xxd -p)
[ "${MAGIC}" = "c61fbc03c103191f" ] || { echo "ARCHIVE_BROKEN：main.jsbundle 缺失或不是 Hermes 字节码（magic=${MAGIC:-无}）"; exit 1; }
# ③ React.framework 必须在且是 release 版（外网断时 RN Core 会静默退回源码编译，归档绿、装上即崩；
#    debug 版 React 约 68 MB，release 约 12 MB——带着 debug React 上传的包一启动就崩）
RF="${APPDIR}/Frameworks/React.framework/React"
if [ -f "${RF}" ]; then
  RF_MB=$(( $(stat -f%z "${RF}") / 1024 / 1024 ))
  [ "${RF_MB}" -lt 40 ] || { echo "ARCHIVE_BROKEN：React.framework ${RF_MB} MB，疑似 debug 版预编译框架"; exit 1; }
  echo "   React.framework ${RF_MB} MB"
else
  echo "ARCHIVE_BROKEN：Frameworks 里没有 React.framework，有的是：$(ls "${APPDIR}/Frameworks" 2>/dev/null | tr '\n' ' ')"; exit 1
fi
LBC="ios/Pods/React-Core-prebuilt/.last_build_configuration"
if [ -f "${LBC}" ] && [ "$(cat "${LBC}")" != "Release" ]; then
  echo "ARCHIVE_BROKEN：${LBC} 是 $(cat "${LBC}")，不是 Release"; exit 1
fi
echo "ARCHIVE_VERIFY_OK"

echo "== 3. export =="
EXPORT_PLIST="${TF_WORK}/ExportOptions.plist"
cat > "${EXPORT_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
# 只带 -allowProvisioningUpdates：Xcode 需已登录 Apple ID（有 distribution 证书）
xcodebuild -exportArchive -archivePath "${ARCHIVE}" -exportPath "${TF_WORK}/export" \
  -exportOptionsPlist "${EXPORT_PLIST}" -allowProvisioningUpdates > "${TF_WORK}/export.log" 2>&1
grep -q "EXPORT SUCCEEDED" "${TF_WORK}/export.log" && echo EXPORT_OK \
  || { grep -iE "error" "${TF_WORK}/export.log" | sort -u | head -15; echo EXPORT_FAILED; exit 1; }
IPA=$(ls "${TF_WORK}"/export/*.ipa | head -1)
echo "${IPA}"

echo "== 4. 防重复：build ${BUILD} 是否已在 ASC =="
if "${PY}" "${SK}/asc.py" GET "/v1/builds?filter[app]=${ASC_APP_ID}&filter[version]=${BUILD}" | grep -q "\"version\": \"${BUILD}\""; then
  echo "BUILD_${BUILD}_EXISTS_FAILED：这个 build 号已传过，不能复用——递增 buildNumber 再跑"; exit 1
fi

echo "== 5. upload =="
up() { xcrun altool --upload-app -f "${IPA}" -t ios --apiKey "${ASC_KEY_ID}" --apiIssuer "${ASC_ISSUER_ID}" > "${TF_WORK}/upload.log" 2>&1; }
up
if ! grep -qi "UPLOAD SUCCEEDED" "${TF_WORK}/upload.log" && grep -q 'Defaults.properties' "${TF_WORK}/upload.log"; then
  echo "TRANSPORTER_CACHE_RESET"; rm -rf "${HOME}/Library/Caches/com.apple.amp.itmstransporter"; up
fi
grep -qi "UPLOAD SUCCEEDED" "${TF_WORK}/upload.log" && echo UPLOAD_OK || { tail -20 "${TF_WORK}/upload.log"; echo UPLOAD_FAILED; exit 1; }
UUID=$(grep -oE "Delivery UUID: [0-9a-fA-F-]+" "${TF_WORK}/upload.log" | head -1 | awk '{print $3}')
echo "DELIVERY ${UUID}"

echo "== 6. 轮询 buildUploads（上传成功 ≠ 处理成功）=="
OK=0
for i in $(seq 1 40); do
  S=$("${PY}" "${SK}/asc.py" GET "/v1/buildUploads/${UUID}" | "${PY}" -c '
import json, sys
d = json.load(sys.stdin)
st = d.get("data", {}).get("attributes", {}).get("state")
print(st.get("state"), json.dumps(st.get("errors", []), ensure_ascii=False)[:400]) if st else print("TRANSIENT")')
  echo "poll ${i}: ${S}"
  case "${S}" in COMPLETE*) OK=1; break ;; FAILED*) echo PROCESS_FAILED; exit 1 ;; esac
  sleep 15
done
[ "${OK}" = 1 ] && echo PROCESS_OK || { echo "POLL_TIMEOUT：10 分钟没处理完，去 ASC 网页看"; exit 1; }

echo "== 7. 等 build VALID =="
OK=0
for i in $(seq 1 40); do
  ST=$("${PY}" "${SK}/asc.py" GET "/v1/builds?filter[app]=${ASC_APP_ID}&filter[version]=${BUILD}" | "${PY}" -c '
import json, sys
rows = json.load(sys.stdin).get("data", [])
print(rows[0]["attributes"]["processingState"] if rows else "NOT_YET")')
  echo "build ${BUILD}: ${ST}"
  case "${ST}" in VALID) OK=1; break ;; INVALID|FAILED) echo "PROCESS_FAILED：processingState=${ST}"; exit 1 ;; esac
  sleep 15
done
[ "${OK}" = 1 ] && echo VALID_OK || { echo "VALID_TIMEOUT：10 分钟没到 VALID"; exit 1; }
echo "PIPELINE_OK ${VERSION}(${BUILD})"
