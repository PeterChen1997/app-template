#!/usr/bin/env bash
# 本机闸门：取代已停用的 GitHub Actions verify.yml（默认本地 CI）。
# workto runner 在合并 / 批量发车时按 workto.delivery.json 的 merge.gate 跑 `pnpm run gate`，
# 依赖已由 runner 先 `pnpm install --frozen-lockfile` 装好，这里只跑检查本身。
# 改这个文件 = 改闸门：runner 只认主干上的版本，任务分支改过会停下交人。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ 类型检查"
pnpm exec tsc --noEmit

echo "→ Lint"
pnpm exec eslint src tests

echo "→ 单元测试"
pnpm test

# 上架红线自查：tsc / eslint / jest 都不管，破防的代价却是审核被拒或凭据泄露。
echo "→ ATS 必须显式钉在 app.json 里（不能退回 prebuild 模板默认）"
node -e "const c=require('./app.json').expo.ios.infoPlist.NSAppTransportSecurity; if(c.NSAllowsArbitraryLoads!==false) throw new Error('NSAllowsArbitraryLoads 必须显式为 false')"
echo "→ UIScene 支持必须开着（Xcode 27 / iOS 27 SDK 无 UIScene = iOS 27 启动即崩）"
node -e "const p=require('./app.json').expo.plugins.find((x)=>Array.isArray(x)&&x[0]==='expo-build-properties'); if(!p||p[1].ios.enableSceneSupport!==true) throw new Error('expo-build-properties.ios.enableSceneSupport 必须为 true')"
echo "→ 出口合规声明必须在"
node -e "if(require('./app.json').expo.ios.config.usesNonExemptEncryption!==false) throw new Error('缺 usesNonExemptEncryption')"

echo "✓ 闸门通过"
