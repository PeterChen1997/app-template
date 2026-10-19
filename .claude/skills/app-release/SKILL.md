---
name: app-release
description: iOS 发布 SOP。任何「发版 / 发包 / 发 TestFlight / 提审 / 上线」都先走这里：单测 → Release 包在最新 iOS 大版本与上一大版本冷启动 → 两个系统各跑全套 Maestro E2E → 手表图标 → 风险先告诉用户 → 小改动只发 TestFlight；大功能或用户明确要正式版才提 App Store。E2E 没跑或只跑了旧系统，不许说「可以发布」。
---

按顺序执行；任何一步失败就停下报告，不许「大多数绿」就往下走。每一步都要贴判据输出，不贴等于没跑。

## 0. 定性（先做，决定终点）
- **小功能 / bug 修复**（默认）→ 终点是 **TestFlight**（第 6 步），不提 App Store。
- **大功能，或用户在本次对话里明确说了「发正式版 / 提审 / 上架」** → 终点是 App Store（第 7 步）。
  默认前提：要上架的 build 已在 TestFlight 跑过一段时间（项目在 CLAUDE.md 定天数，没定就按 7 天）；
  不满就只发 TestFlight，把「几号可以提审」写进报告。用户明确要破例时，先写清风险再执行。
- 改了原生（app.json / plugins / modules / targets / 原生依赖）→ 第 2–4 步一个都不能省。
- **升级 Xcode 后的第一个包**：第 2–3 步必须全部重来，且先在新系统上冷启动（新 SDK 的启动期检查只在新系统上触发）。
- 一次只允许一个会话动原生与发布流水线：开始前 `git status` + `pgrep -fl pipeline.sh` 双查。

## 1. 单测 + 类型 + lint + 变更记录
```bash
pnpm verify                 # typecheck + lint + jest，末尾 Tests: N passed、0 failed
```
- `docs/RELEASE_NOTES.md` 已有**即将递增到的** build 条目（当前 `app.json` 的 `expo.ios.buildNumber` + 1），
  写给测试者看的人话；`/app-testflight` 流水线递增后会检查，没有直接 `CHANGELOG_MISSING` 退出。
- 动了 `server/` 才跑 `cd server && pnpm test`。

## 2. Release 模拟器包 + 两个系统冷启动
```bash
export PATH="/opt/homebrew/bin:$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
pnpm exec expo prebuild -p ios                     # 改了原生 / app.json 才需要；看「Installing CocoaPods」后无 [!]
scripts/sim-setup.sh                               # 确认专用模拟器在（最新大版本 + 上一大版本；只建不删）
<E2E 需要的 EXPO_PUBLIC_* 开关> scripts/build-sim-release.sh   # 末行 SIM_RELEASE_OK
```
`build-sim-release.sh` 已核验：bundle id 是本项目的、`DTSDKName` 为 `iphonesimulator27.x` 时必须有
`UIApplicationSceneManifest`、内嵌的是 Hermes 字节码的 Release bundle。任何 `*_FAILED` 直接停。

冷启动在下一步的 `e2e-all.sh` 里自动做（卸载 → 安装 → 启动 → 等 10 秒判活 → 截图）。**截图必须读**：
① 没闪退；② 首页关键控件 / 图标都在（新系统上 Release 包出现过图标整块消失、断言读无障碍标签照样绿的情况，
截图不看等于没验）。

## 3. 全套 E2E × 2（最新 iOS 大版本 + 上一大版本）
```bash
scripts/e2e-all.sh                                 # 默认跑「<App> iOS<最新>」与「<App> iOS<上一>」，串行
# 某系统上环境跑不了的 flow 显式跳过并写原因（不许静默略过）：
# E2E_SKIP="04 07" scripts/e2e-all.sh "<App> iOS27"
```
- 判据：末行 `E2E_ALL_OK`；每台的 `cold-launch` 为 PASS；`summary.txt` 里每条 flow 都是 PASS 或带原因的 SKIP。
- **两台串行，别并行**，也别与 xcodebuild / gradle 并行（并行时驱动卡死、点击落空，全是假红）。
- 失败先看 `<结果目录>/<设备>/<flow>.log` 与同名目录里的截图，分清「flow 过时」「环境」「真回归」：
  真回归不许发；flow 过时就修 flow 再跑；环境问题换路径验证，并写进汇报。
- 只在旧系统上全绿**不算数**：iOS 27 启动即崩的包就是这样上的 TestFlight。

## 4. 手表 App 图标（有 watch target 才做）
- 手表图标**不能用黑色 / 近黑背景**：watchOS 把图标裁成圆形，黑底在表盘上看不出轮廓，App Review 按 Guideline 4 - Design 拒。
- 核对 watch target 的 1024 图标文件（读图）：背景是浅色或品牌色，**不是直接复用深色的 iPhone 图标**。
- 手表 App 不随 iPhone App 自动装到模拟器，要单独 `simctl install` 到配对的手表模拟器上冷启动一次；跑 Maestro 前把手表模拟器关掉。

## 5. 风险汇报（发之前写给用户，不是发完）
一段话列清：① 本次改动验证的盲区（模拟器验不了的：真机性能 / 传感器 / 推送 / 手表振动等）；
② 线上版本正在受影响的问题与影响面；③ 走第 7 步时是否满足 TestFlight 天数、是否破例。有风险直接说，不要埋在长报告里。

## 6. TestFlight
`/app-testflight`（递增 build → changelog 检查 → prebuild → archive → 归档核验 → export → altool 上传 → 等 VALID）。
**流水线一进入上传步骤就当已传上**：想再加改动只能递增 build 号重跑，不能复用 build 号。

## 7. App Store（只在第 0 步判定为正式版时）
前提：版本号大于在售版本（已上架的版本号不能复用）；该 build `processingState` 为 VALID 且满足 TestFlight 天数；
内购 / 订阅有改动要一并加进审核项。提审方式按项目（ASC 网页或项目自己的脚本），提交后核对 App Store 版本状态为
`WAITING_FOR_REVIEW`。不要过期挂在待审 App Store 版本上的 build。

## 8. 回写与提交
`docs/RELEASE_NOTES.md` 条目、新踩的坑（条件 + 症状 + 处置，标【共性】/【本仓库】）、`docs/HANDOFF.md` 进度；
提交信息结尾带版本 `+ 版本 <version>(<build>)`。push / 合并按项目规则单独确认。
