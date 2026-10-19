#!/usr/bin/env bash
# 发布闸门的 E2E 部分：在专用模拟器上「冷启动 Release 包 + 跑完整套 Maestro flow」，默认两台各跑一遍。
#
# 用法：
#   scripts/e2e-all.sh                         # 默认：「<App> iOS<最新大版本>」+「<App> iOS<上一大版本>」
#   scripts/e2e-all.sh "<App> iOS27"           # 指定模拟器名（精确匹配）或 UDID，可多个
#   scripts/e2e-all.sh C11A2851-...-30E53618427C
#
# 前置：
#   1. scripts/sim-setup.sh 建好专用模拟器（只用本项目自己的，不往别人的模拟器上装包）；
#   2. scripts/build-sim-release.sh 打好 Release 模拟器包（E2E 需要的 EXPO_PUBLIC_* 开关在打包时带上）。
#   本脚本不需要、也不会启动 Metro——Release 包内嵌 bundle。
#
# 环境变量：
#   E2E_OUT          结果目录（默认 /tmp/<工程名>-e2e-<时间戳>）
#   E2E_SKIP         显式跳过的 flow 前缀，如 "04 07"（某系统上环境跑不了的 flow）。
#                    跳过会在汇总里写 SKIP，调用方必须在汇报里说明原因——不许静默略过。
#   E2E_APP          .app 路径（默认 ios/build-sim-release/Build/Products/Release-iphonesimulator/<工程名>.app）
#   E2E_LAUNCH_WAIT  冷启动后等几秒再判活（默认 10）
#   E2E_KEEP_BOOTED  =1 时不关闭本脚本启动的模拟器（默认跑完关掉；原本就开着的不动）
#
# 每台设备的产物：<E2E_OUT>/<设备名>/cold-launch.png、<flow>.log、<flow>/（Maestro 截图与日志）、
# 冷启动失败时的崩溃报告 crash-*.ips；汇总在 <E2E_OUT>/summary.txt。
# 判定只看末行：E2E_ALL_OK（退出 0）/ E2E_ALL_FAILED（退出 1）。「大多数绿」不算过。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
export PATH="${JAVA_HOME}/bin:/opt/homebrew/bin:${PATH}"

command -v maestro > /dev/null || { echo "MAESTRO_MISSING：brew install maestro（需要 JDK 17+）"; exit 1; }

APP_NAME=$(node -p "require('./app.json').expo.name")
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")
case "${APP_NAME}${BUNDLE_ID}" in
  *__*__*) echo "PLACEHOLDER_FAILED：app.json 里还有模板占位符，先跑 scripts/init.sh"; exit 1 ;;
esac
PROJ=$(printf '%s' "${APP_NAME}" | tr -cd '[:alnum:]')
APP="${E2E_APP:-${ROOT}/ios/build-sim-release/Build/Products/Release-iphonesimulator/${PROJ}.app}"
[ -d "${APP}" ] || { echo "APP_MISSING：${APP} 不存在，先跑 scripts/build-sim-release.sh"; exit 1; }
OUT="${E2E_OUT:-/tmp/${PROJ}-e2e-$(date +%Y%m%d-%H%M%S)}"
WAIT="${E2E_LAUNCH_WAIT:-10}"
mkdir -p "${OUT}"
SUMMARY="${OUT}/summary.txt"
: > "${SUMMARY}"
log() { echo "$*" | tee -a "${SUMMARY}"; }

# 设备信息：UDID → 「名字<TAB>runtime<TAB>状态」
device_info() {
  xcrun simctl list devices -j | node -e '
    const udid = process.argv[1];
    const all = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
    for (const [runtime, list] of Object.entries(all)) {
      for (const d of list) {
        if (d.udid === udid) console.log([d.name, runtime.split(".").at(-1), d.state].join("\t"));
      }
    }' "$1"
}

# 名字或 UDID → UDID（名字精确匹配；匹配不到或重名都直接失败，不猜）
resolve_udid() {
  local arg="$1"
  if printf '%s' "${arg}" | grep -Eq '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'; then
    [ -n "$(device_info "${arg}")" ] && echo "${arg}"
    return
  fi
  xcrun simctl list devices -j | node -e '
    const name = process.argv[1];
    const all = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
    const hits = Object.values(all).flat().filter((d) => d.name === name && d.isAvailable);
    if (hits.length === 1) console.log(hits.at(0).udid);
    else if (hits.length > 1) console.error(`AMBIGUOUS：有 ${hits.length} 台叫「${name}」的模拟器`);
  ' "${arg}"
}

# 默认设备：本项目名下「<App> iOS<N>」里 N 最大的两台
default_devices() {
  xcrun simctl list devices -j | node -e '
    const app = process.argv[1];
    const all = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
    const esc = app.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
    const re = new RegExp("^" + esc + " iOS(\\d+)$");
    const seen = new Map();
    for (const d of Object.values(all).flat()) {
      const m = re.exec(d.name);
      if (m && d.isAvailable) seen.set(Number(m.at(1)), d.name);
    }
    [...seen.keys()].sort((a, b) => b - a).slice(0, 2).forEach((k) => console.log(seen.get(k)));
  ' "${APP_NAME}"
}

if [ "$#" -gt 0 ]; then
  TARGETS=("$@")
else
  TARGETS=()
  while IFS= read -r line; do [ -n "${line}" ] && TARGETS+=("${line}"); done < <(default_devices)
  [ "${#TARGETS[@]}" -gt 0 ] || { echo "NO_DEVICE：没有「${APP_NAME} iOS<N>」专用模拟器，先跑 scripts/sim-setup.sh"; exit 1; }
  [ "${#TARGETS[@]}" -ge 2 ] || log "⚠️  只找到 1 台专用模拟器（${TARGETS[*]}），双系统闸门缺一台——跑 scripts/sim-setup.sh 补建"
fi

total_fail=0
total_pass=0
total_skip=0

run_device() {
  local target="$1" udid info name runtime state booted_by_us=0
  udid=$(resolve_udid "${target}")
  if [ -z "${udid}" ]; then
    log "FAIL 设备「${target}」：找不到（名字须精确匹配，或传 UDID）"
    total_fail=$((total_fail + 1))
    return
  fi
  info=$(device_info "${udid}")
  name=$(printf '%s' "${info}" | cut -f1)
  runtime=$(printf '%s' "${info}" | cut -f2)
  state=$(printf '%s' "${info}" | cut -f3)
  local dev_out="${OUT}/${name// /_}"
  mkdir -p "${dev_out}"
  log ""
  log "== 设备：${name} / ${runtime}（${udid}）"

  if [ "${state}" != "Booted" ]; then
    xcrun simctl boot "${udid}" && booted_by_us=1
  fi
  xcrun simctl bootstatus "${udid}" -b > /dev/null 2>&1

  # 软键盘联想会把联想词带进 inputText 的输入框（中文尤甚），只关联想
  xcrun simctl spawn "${udid}" defaults write -g KeyboardPrediction -bool false

  # ---- 冷启动闸门：卸载 → 装 → 启动 → 等 N 秒 → 进程还在 + 截图 ----
  xcrun simctl terminate "${udid}" "${BUNDLE_ID}" > /dev/null 2>&1
  xcrun simctl uninstall "${udid}" "${BUNDLE_ID}" > /dev/null 2>&1
  if ! xcrun simctl install "${udid}" "${APP}"; then
    log "FAIL cold-launch（install 失败）"
    total_fail=$((total_fail + 1))
    finish_device "${udid}" "${booted_by_us}"
    return
  fi
  local launch_out pid alive
  launch_out=$(xcrun simctl launch "${udid}" "${BUNDLE_ID}" 2>&1)
  pid=$(printf '%s' "${launch_out}" | grep -oE '[0-9]+$')
  sleep "${WAIT}"
  alive=$(xcrun simctl spawn "${udid}" launchctl list | grep "UIKitApplication:${BUNDLE_ID}" | awk '{print $1}' | head -1)
  xcrun simctl io "${udid}" screenshot "${dev_out}/cold-launch.png" > /dev/null 2>&1
  if printf '%s' "${alive}" | grep -Eq '^[0-9]+$'; then
    log "PASS cold-launch（launch pid ${pid:-?}，${WAIT}s 后仍在运行 pid ${alive}；截图 ${dev_out}/cold-launch.png）"
    total_pass=$((total_pass + 1))
  else
    local ips
    ips=$(ls -t "${HOME}"/Library/Logs/DiagnosticReports/"${PROJ}"-*.ips 2>/dev/null | head -1)
    [ -n "${ips}" ] && cp "${ips}" "${dev_out}/crash-$(basename "${ips}")"
    log "FAIL cold-launch（${WAIT}s 后进程不在 = 启动即崩；launch 输出：${launch_out}；崩溃报告：${ips:-无}）"
    log "     iOS 27 + 无 UIScene 的典型栈顶：_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke"
    total_fail=$((total_fail + 1))
    finish_device "${udid}" "${booted_by_us}"
    return
  fi

  # ---- 全套 Maestro flow（.maestro/ 顶层；subflows/ 只被 runFlow 引用，不单跑）----
  local f base skipped p flow_log
  for f in "${ROOT}"/.maestro/*.yaml; do
    base=$(basename "${f}" .yaml)
    [ "${base}" = "config" ] && continue
    # debug-only：依赖 __DEV__ 入口的 flow，Release 包跑不了，单独用 Debug 包跑
    if sed '/^---/q' "${f}" | grep -Eq '^[[:space:]]*-[[:space:]]*debug-only[[:space:]]*$'; then
      log "SKIP ${base}（debug-only，Release 包不跑）"
      total_skip=$((total_skip + 1))
      continue
    fi
    skipped=0
    for p in ${E2E_SKIP:-}; do
      [[ "${base}" == "${p}"_* || "${base}" == "${p}" ]] && skipped=1
    done
    if [ "${skipped}" = 1 ]; then
      log "SKIP ${base}（E2E_SKIP 显式跳过——汇报里必须写原因）"
      total_skip=$((total_skip + 1))
      continue
    fi
    flow_log="${dev_out}/${base}.log"
    if maestro test --udid "${udid}" --test-output-dir "${dev_out}/${base}" "${f}" > "${flow_log}" 2>&1; then
      log "PASS ${base}"
      total_pass=$((total_pass + 1))
    elif grep -q "driver did not start up\|Broken pipe" "${flow_log}" \
      && maestro test --udid "${udid}" --test-output-dir "${dev_out}/${base}" "${f}" > "${flow_log}" 2>&1; then
      # 上一条 flow 杀进程后，紧接着的 flow 偶发驱动没起来（环境抖动），只补跑这一种
      log "PASS ${base}（驱动抖动后补跑）"
      total_pass=$((total_pass + 1))
    else
      log "FAIL ${base}  → ${flow_log}"
      total_fail=$((total_fail + 1))
    fi
  done
  finish_device "${udid}" "${booted_by_us}"
}

finish_device() {
  local udid="$1" booted_by_us="$2"
  if [ "${booted_by_us}" = 1 ] && [ "${E2E_KEEP_BOOTED:-0}" != 1 ]; then
    xcrun simctl shutdown "${udid}" > /dev/null 2>&1
  fi
}

# 模拟器串行跑，别并行（并行时驱动卡死、点击落空，全是假红）
for t in "${TARGETS[@]}"; do
  run_device "${t}"
done

log ""
log "== 通过 ${total_pass} / 失败 ${total_fail} / 跳过 ${total_skip}（结果目录 ${OUT}）"
if [ "${total_fail}" -eq 0 ]; then
  log "E2E_ALL_OK"
else
  log "E2E_ALL_FAILED"
  exit 1
fi
