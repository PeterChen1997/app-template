# TESTING.md — __APP_NAME__

> 基于 template v0.1.0。测试基建的「为什么」见 docs/实施技术方案.md §测试。

## 一、通道分工

| 通道 | 工具 | 覆盖范围 | 入口 |
|---|---|---|---|
| 单元测试 | jest（node 环境 + 真 SQLite WASM） | core / application / infrastructure 纯逻辑、migration、guards、i18n、theme 契约 | `pnpm exec jest` |
| E2E | Maestro（`.maestro/*.yaml`） | App 进程内全部 UI 流程 | `maestro test .maestro/ --exclude-tags=debug-only` |
| 系统层 | `xcrun simctl` + 脚本 | 通知横幅、深链、App Group 等进程外行为 | 按需脚本 |
| 真机手测 | 清单化 | 模拟器验不了的（DRM / 静音穿透 / 传感器等） | 见「四、真机清单」 |
| server 单测 | tsx + node:assert 向量测试 | server/ 全部逻辑（fastify.inject + 内存 PGLite） | `cd server && pnpm test` |

## 二、硬规约（四项目实测，违反的测试等于没测）

1. E2E 跑 **Release 构建**（Debug dev-client 无内嵌 bundle，clearState 后停在选 Metro 页）；
   需要跳过首启引导用 `EXPO_PUBLIC_SKIP_ONBOARDING=1` 编译期开关。
2. 定位一律 `testID` / accessibilityLabel，**禁文案定位、禁坐标 tap**（文案会改、会换语言）。
3. **「断言同一次调用的回声」等于没验**：验持久化必须走另一条读路径——离开页面再回来，
   以及 `launchApp` 杀进程重起后再断言。
4. 长页面断言前 `scrollUntilVisible`（iOS 无障碍树只暴露渲染窗口附近元素）。
5. 新 UI 落地必须同步埋 `testID`（review checklist 项）。
6. debug-only 通道（时钟 mock 深链等）打 `debug-only` tag，排除出常规跑。
7. 质量门槛内建进测试：向量数 / 匹配率不达标直接 exit 1，防止测试悄悄变弱。

## 三、用例矩阵

> 四态：✅ 已覆盖 / ⬜ 待补 / 🔶 部分覆盖 / 🚫 本通道验不了（必须标注归属通道）。
> 新用例先在此登记编号，再写 flow / 测试。

| 编号 | 场景 | 单测 | E2E | 系统层 | 真机 |
|---|---|---|---|---|---|
| T-001 | App 冷启动显示首页 | 🚫→E2E | ✅ smoke | — | — |
| T-002 | （示例）schema v1 migration 幂等 | ✅ | — | — | — |

## 四、真机手测清单

| 项 | 原因 | 最近验证 |
|---|---|---|
| （示例）锁屏场景 | 模拟器行为与真机不一致 | — |
