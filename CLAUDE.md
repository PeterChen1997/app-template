# CLAUDE.md — __APP_NAME__

> 基于 **template v0.1.0**（app-template）。共性工程约定与踩坑合集随模板维护，
> 本文件只在「本项目差异」各节追加内容；新增踩坑时用【共性】/【本仓库】标记，
> 【共性】条目定期回流模板仓库。

__APP_NAME__ 是（一句话描述本 App 是什么、给谁用、核心体验）。

**新会话先读 `docs/HANDOFF.md`**：当前进度、环境要点、下一步任务与技术债都在那里。
架构蓝图见 `docs/实施技术方案.md`，改动前先读对应章节，不要凭猜测扩展架构。

## 一、关键命令（可复制粘贴）

```bash
pnpm exec tsc --noEmit            # 类型检查
pnpm exec eslint src tests       # lint（配置见 eslint.config.js）
pnpm exec jest                   # 单测
pnpm verify                      # 以上三合一，唯一的「绿了才算完」入口
pnpm start                       # Metro，固定 __METRO_PORT__（独占，禁自动 +1）
pnpm exec expo prebuild -p ios   # 改 app.json / plugins / modules / targets 后必跑
cd ios && LANG=en_US.UTF-8 pod install   # 只增删 Swift 文件时的快路径
```

- 本项目专用模拟器：（填 iPhone 型号 + UDID，不要和其他项目共用）
- 已占用 Metro 端口：8081 tick-me / 8082 chatme / 8083 beatlock / 8084 deeplisten / __METRO_PORT__ 本项目
- E2E：`maestro test .maestro/`（跑 Release 构建，见 TESTING.md）

## 二、架构不变量（改动前必读）

1. 分层 `app → features → application → core`；`infrastructure` 只被 `application` 依赖。
   `src/core/**` 零平台依赖——core 需要平台能力时定义契约类型（如 `SqlDatabase`），
   infrastructure 实现、application 注入。两条由 `eslint.config.js` 强制，违反直接 error。
2. zustand 只存 UI/运行态；持久态一律走 SQLite Repository，禁止把 DB 全量 mirror 进 store。
3. Migration 单向、只追加、发布后不可修改；版本用 `PRAGMA user_version`；
   连接级 PRAGMA（WAL / foreign_keys / busy_timeout）不进 migration，统一在开连接时设置；
   写事务必须走 `withSerializedTransaction`（expo-sqlite 同连接并发事务直接抛）。
4. 本项目领域铁律：（**必填**——写下本 App 的等价铁律并在 eslint.config.js 的规则位落地。
   参考：beatlock 是「JS 永不驱动每一拍，UI 禁 import 原生音频模块」；chatme 是「haptics 唯一出口」。）
5. 原生 target（widget / share / watch）只读写 App Group 里的 JSON DTO，绝不出现第二套业务核心。

## 三、工程规范

- 类型一律 `type`，不用 `interface`（ESLint error）。
- **禁止一切 `as` 断言，唯一例外 `as const`**；尖括号断言同禁（ESLint error）。
  `JSON.parse` / 网络响应 / SQLite 行必须经 `src/core/domain/guards.ts` 守卫收窄，
  新增守卫连同 fixture 一起写测试。
- 数组取元素用 `.at(0)`，不用 `[0]`；JSX 里 `key` 必须写在 spread **之前**。
- 用户可见文案集中在 `src/core/i18n/`：`zh-Hans.ts` 是形状基准（不写 `as const`），
  `en.ts` 每个导出标 `typeof zh.X`，只加中文不加英文 tsc 直接报错。
  组件用 `useStrings()`；回调 / Alert / application 层用 `getStrings()`。
  **禁止把文案存进模块级常量**（语言会冻结在模块求值那一刻），派生列表写成函数。
- 弹窗禁用系统 `Alert` / `ActionSheetIOS`，统一走 `src/features/dialog/`。
- 日志只走 `src/infrastructure/logger`（内置脱敏）。
  **绝不记录用户内容正文，绝不记录 API Key 或任何凭据**，包括错误分支和调试期。
- 每个可交互元素同时带 `testID` + 完整 `accessibilityLabel`（Maestro 依赖）。
- commit 用 conventional commits（中文 message 含 Why），PR 用 draft。

## 四、沉淀规则

- **发生 ≥3 次的共性问题 + 固定流程 → 做成 skill；其余只写踩坑记录，不流程化。**
- 未达标的先观察，仍频繁出错再升级。
- 踩坑记录格式统一：**条件 + 症状 + 处置**，并标【共性】或【本仓库】。

## 五、失败诊断优先序

新失败先过这张清单，再排查业务代码：

1. 端口对不对？Metro 在别的端口起了会加载别家 bundle，症状是「陌生原生模块缺失」。
2. 需要 prebuild 吗？改了 modules / plugins / targets / app.json 没重跑 prebuild。
3. 新增 Swift 文件后 pod install 跑了吗？（CocoaPods 把文件列表快照进 pbxproj，
   症状伪装成 `cannot find 'X' in scope`。）
4. Fast Refresh 假阴性？先杀 App 冷启动再看，白屏/行为怪不一定是代码问题。
5. dev-client 卡 splash？判据：Metro 日志没有新的「iOS Bundled」行。

同一环境缺陷排查超过 2 轮仍无进展 → 停下来记录现象，换验证路径，禁止继续烧。

## 六、踩坑记录

> 以下为模板自带的【共性】条目（四项目实测），本项目新增的往后追加。

1. 【共性】pnpm + 本地 Expo Module：`.npmrc` 必须 `node-linker=hoisted`，否则
   `expo-modules-core` 解析失败。
2. 【共性】`xcodebuild | grep` 会假绿（退出码是管道尾命令的）→ 重定向到日志文件后
   `grep -q "BUILD SUCCEEDED"` 判定。
3. 【共性】非交互 shell 跑 pod install 必须 `LANG=en_US.UTF-8`；CocoaPods 用 brew 版
   （PATH 前置 `/opt/homebrew/bin`）。
4. 【共性】Debug 构建带 `ENABLE_DEBUG_DYLIB=NO`，否则 AppIntents / LiveActivityIntent 失效。
5. 【共性】`expo prebuild` 不带 `--clean` 也会重建 `ios/`；`ios/` 是产物且 gitignore，
   一切原生配置必须经 app.json / plugins 落地。
6. 【共性】expo-notifications 无条件注入 `aps-environment`，免费个人开发者真机构建必挂
   → `withoutApsEntitlement` 类 plugin 剥离，且必须排在 expo-notifications **之前**
   （config plugin mod 链 LIFO，后注册先执行）。
7. 【共性】iOS 每 App 64 条待触发本地通知上限，超出**静默丢弃**。
8. 【共性】RN iOS 受控 TextInput 会打断中文输入法 marked text → 半受控
   `defaultValue + onChangeText + ref.clear()`。
9. 【共性】RN 0.86 iOS 显式 lineHeight 自动乘 fontScale，运行中切字号的截图是假象。
10. 【共性】RN 0.86 Release 装真机：预编译 xcframework 未签名，需逐个补签
    （deeplisten `scripts/install-device.sh` 可参考），用证书 SHA-1 指纹而非名字。
11. 【共性】连续 Maestro `clearState` 4–5 次会搞坏模拟器安装（installd 状态混乱），分批跑。
12. 【共性】React Compiler 开启后 reanimated shared value 必须用 `.get()/.set()`，
    直接 `.value =` 被 `react-hooks/immutability` 判 error。
13. 【共性】环境变量前缀用项目名（如 `MYAPP_LLM_*`）而非厂商名（`ANTHROPIC_*`），
    避免开发机全局变量静默覆盖 `.env`。
14. 【共性】「import 即抛」的原生模块只能动态 import：包内用 `requireNativeModule` 的
    在模块求值时抛（静态引 = 全 App 红屏）；`requireOptionalNativeModule` 的可静态引。
    新增依赖去 `node_modules/.pnpm/<pkg>@*/.../build` grep 这两个函数名。
