# CHANGELOG — app-template

> 模板自身的版本记录。基于模板的新项目可以删掉本文件；App 面向测试者的变更记录写 `docs/RELEASE_NOTES.md`。

## v0.2.0 — 2026-10-19

对齐 tick-me / beatlock 的现行配置与发布闸门，重点是 Xcode 27 / iOS 27。

### 变更

- **依赖**：expo 区间对齐 beatlock（`~57.0.27`），锁定到 `npx expo install --check` 要求的 **57.0.30**；
  其余 expo-* / react-native 0.86.3 / jest-expo 57.0.6 / @types/jest 29.5 按 `npx expo install --fix` 对齐。
  `expo install` 自动追加的 expo-secure-store / expo-sqlite 插件已撤回，原生配置不变。
- **UIScene**：`app.json` 的 `expo-build-properties` 加 `ios.enableSceneSupport: true`
  （Xcode 27 / iOS 27 SDK 无 UIScene 生命周期 = iOS 27 启动即崩）；CI 红线自查同步拦截。
- **E2E 脚本**（`scripts/`）：
  - `sim-setup.sh`：按已装 runtime 建「`<App> iOS<N>`」两台专用模拟器（最新 + 上一 iOS 大版本），只建不删。
  - `build-sim-release.sh`：Release 模拟器包 + 三项产物核验（bundle id / DTSDKName + UIApplicationSceneManifest / Hermes 字节码 bundle）。
  - `e2e-all.sh`：按名字或 UDID 跑多台（默认两台串行），每台冷启动判活 + 截图 + 崩溃报告，再跑全套 Maestro，
    `E2E_SKIP` 显式跳过、驱动抖动只补跑一次，末行 `E2E_ALL_OK` / `E2E_ALL_FAILED`。
- **Maestro 约定**：`smoke.yaml` → `01_smoke.yaml`（`NN_<场景>` 编号），新增 `config.yaml`（`subflows/` 不单跑、`debug-only` 排除）。
- **通用 skill**（`.claude/skills/`）：`app-verify`、`app-release`、`app-testflight`（含 `pipeline.sh` / `asc.py`），
  从 tick-me 的 tickme-verify / tickme-release / tickme-testflight 抽象，去掉产品名、bundle id、UDID、ASC 常量与业务功能。
- **Metro 端口**：以 `~/.claude/skills/rn-metro/ports.tsv` 为唯一真相源，起 Metro 走 `/rn-metro`；
  `init.sh` 只读校验登记表（拒 8081 与已登记给别的项目的端口），不写登记表。删掉了过时的「8081 tick-me」端口清单。
- **文档**：CLAUDE.md 新增「本机多项目共存（Metro 端口 / 专用模拟器）」「iOS 发布硬规则」（UIScene、
  最新 iOS 模拟器冷启动 Release + Maestro 才许发布、手表图标不能黑底）与踩坑 #15–#20；
  README / TESTING / HANDOFF / 实施技术方案的版本与流程说明同步到 v0.2.0；新增 `docs/RELEASE_NOTES.md`。

### 验证记录（2026-10-19，Xcode 27.1 / macOS 27.0）

验证在 scratchpad 副本里进行（`init.sh AppTemplate com.peterchen.apptemplate apptemplate 8189`），模板本体保持占位符。

| 项 | 结果 |
|---|---|
| `npx expo install --check` | `Dependencies are up to date` |
| `pnpm verify`（模板本体 + init 后副本） | tsc / eslint 无错；jest 5 suites、49 tests 全过 |
| `npx expo prebuild --platform ios --clean` | 「Installing CocoaPods」后无 `[!]`；`ios/AppTemplate/Info.plist` 含 `UIApplicationSceneManifest`（`UISceneDelegateClassName = EXExpoAppSceneDelegate`） |
| `scripts/build-sim-release.sh` | `SIM_RELEASE_OK`；`DTSDKName=iphonesimulator27.1`、`UIApplicationSceneManifest=yes`、`main.jsbundle` 4.0M Hermes 字节码 |
| `scripts/sim-setup.sh` | 新建 `AppTemplate iOS27`（iPhone 17 Pro / iOS 27.0）、`AppTemplate iOS26`（iPhone 17 Pro / iOS 26.5）；重跑走「已存在，复用」 |
| `scripts/e2e-all.sh`（两台） | iOS 27：cold-launch PASS（10s 后 pid 仍在）、01_smoke PASS；iOS 26.5：cold-launch PASS、01_smoke PASS；`通过 4 / 失败 0 / 跳过 0`，`E2E_ALL_OK` |
| 冷启动截图 | `docs/verification/v0.2-ios27-cold-launch.png`、`docs/verification/v0.2-ios26-cold-launch.png`（首页正常渲染） |
| `init.sh` 端口校验 | 8086（已登记给 tick-me）→ 拒绝；8081 → 拒绝；未登记端口 → 提示 `metro.sh port`；ports.tsv 未被改动 |
| `app-testflight/pipeline.sh` 守卫 | 缺配置 → `CONFIG_FAILED`；无 PyJWT 的 python → `CONFIG_FAILED`；带 `EXPO_PUBLIC_SKIP_ONBOARDING` → `DIRTY_ENV_FAILED`；缺条目 → `CHANGELOG_MISSING`（RELEASE_NOTES 里缩进的示例不会被误判） |

**未验证**：`app-testflight` 的 archive / export / altool 上传 / ASC 轮询段（需要真实签名与 ASC 凭据，且会产生真实上传，
不在模板升级范围内）——第一个基于 v0.2 的项目首次发 TestFlight 时验证并回流修正。
