# TESTING.md — __APP_NAME__

> 基于 template v0.2.0。测试基建的「为什么」见 docs/实施技术方案.md §测试。

## 一、通道分工

| 通道 | 工具 | 覆盖范围 | 入口 |
|---|---|---|---|
| 单元测试 | jest（node 环境 + 真 SQLite WASM） | core / application / infrastructure 纯逻辑、migration、guards、i18n、theme 契约 | `pnpm exec jest` |
| E2E | Maestro（`.maestro/NN_*.yaml`） | App 进程内全部 UI 流程 + 冷启动判活 | `scripts/e2e-all.sh`（Release 包、两台专用模拟器） |
| 系统层 | `xcrun simctl` + 脚本 | 通知横幅、深链、App Group 等进程外行为 | 按需脚本 |
| 真机手测 | 清单化 | 模拟器验不了的（DRM / 静音穿透 / 传感器等） | 见「四、真机清单」 |
| server 单测 | tsx + node:assert 向量测试 | server/ 全部逻辑（fastify.inject + 内存 PGLite） | `cd server && pnpm test` |

## 二、硬规约（四项目实测，违反的测试等于没测）

1. E2E 跑 **Release 构建**（Debug dev-client 无内嵌 bundle，clearState 后停在选 Metro 页）；
   需要跳过首启引导用 `EXPO_PUBLIC_SKIP_ONBOARDING=1` 编译期开关（打包前 export；这种包绝不上传）。
2. 定位一律 `testID` / accessibilityLabel，**禁文案定位、禁坐标 tap**（文案会改、会换语言）。
3. **「断言同一次调用的回声」等于没验**：验持久化必须走另一条读路径——离开页面再回来，
   以及 `launchApp` 杀进程重起后再断言。
4. 长页面断言前 `scrollUntilVisible`（iOS 无障碍树只暴露渲染窗口附近元素）。
5. 新 UI 落地必须同步埋 `testID`（review checklist 项）。
6. debug-only 通道（时钟 mock 深链等）打 `debug-only` tag，排除出常规跑。
7. 质量门槛内建进测试：向量数 / 匹配率不达标直接 exit 1，防止测试悄悄变弱。

## 二·五、E2E 怎么跑（发布闸门同款）

```bash
scripts/sim-setup.sh                 # 一次性：建「<App> iOS<最新>」「<App> iOS<上一>」两台专用模拟器
pnpm exec expo prebuild -p ios       # 改了原生 / app.json 才需要
scripts/build-sim-release.sh         # Release 模拟器包；末行 SIM_RELEASE_OK
scripts/e2e-all.sh                   # 默认两台串行；末行 E2E_ALL_OK 才算过
scripts/e2e-all.sh "<App> iOS27"     # 只跑一台（名字精确匹配，或传 UDID）
```

- **不需要 Metro**：Release 包内嵌 bundle。
- 每台先做**冷启动闸门**：卸载 → 安装 → 启动 → 等 10 秒（`E2E_LAUNCH_WAIT`）判进程仍在 → 截图
  `<结果目录>/<设备>/cold-launch.png`；进程不在就拷崩溃报告 `crash-*.ips`、该设备其余 flow 不跑、整体失败。截图要读。
- 然后逐条跑 `.maestro/` 顶层 flow（`config.yaml` 与 `subflows/` 不单跑；`debug-only` tag 自动跳过），
  每条一个 `<flow>.log` + 同名目录（Maestro 截图与日志），汇总在 `<结果目录>/summary.txt`。
- 某系统上环境跑不了的 flow 用 `E2E_SKIP="04 07"` 显式跳过，汇总里写 SKIP，**汇报必须说明原因**——不许静默略过。
- 只对 `driver did not start up` / `Broken pipe` 这类驱动抖动补跑一次；其余失败不许靠重跑洗绿。
- 两台串行，别与 xcodebuild / gradle 并行；多台 Booted 时一律带 UDID（脚本已带）。
- flow 命名 `NN_<场景>.yaml`（编号即顺序），子流程放 `subflows/` 用 `runFlow` 引用。
- 只在旧系统全绿**不算数**：发布前必须包含最新 iOS 大版本那台（见 CLAUDE.md「iOS 发布硬规则」）。

## 三、用例矩阵

> 四态：✅ 已覆盖 / ⬜ 待补 / 🔶 部分覆盖 / 🚫 本通道验不了（必须标注归属通道）。
> 新用例先在此登记编号，再写 flow / 测试。

| 编号 | 场景 | 单测 | E2E | 系统层 | 真机 |
|---|---|---|---|---|---|
| T-001 | App 冷启动显示首页 | 🚫→E2E | ✅ 01_smoke + cold-launch | — | — |
| T-002 | （示例）schema v1 migration 幂等 | ✅ | — | — | — |

## 四、真机手测清单

| 项 | 原因 | 最近验证 |
|---|---|---|
| （示例）锁屏场景 | 模拟器行为与真机不一致 | — |
