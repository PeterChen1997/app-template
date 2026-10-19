# CLAUDE.md — __APP_NAME__

> 基于 **template v0.2.0**（app-template）。共性工程约定与踩坑合集随模板维护，
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
~/.claude/skills/rn-metro/metro.sh start   # Metro（/rn-metro），固定 __METRO_PORT__，不要裸跑 expo start
pnpm exec expo prebuild -p ios   # 改 app.json / plugins / modules / targets 后必跑
cd ios && LANG=en_US.UTF-8 pod install   # 只增删 Swift 文件时的快路径
scripts/sim-setup.sh             # 建 / 查本项目专用模拟器（最新 iOS 大版本 + 上一大版本）
scripts/build-sim-release.sh     # Release 模拟器包 + 产物核验，末行 SIM_RELEASE_OK
scripts/e2e-all.sh               # 两台专用模拟器：冷启动判活 + 截图 + 全套 Maestro，末行 E2E_ALL_OK
```

- 改原生后的验证走 `/app-verify`；发版只走 `/app-release`（TestFlight 上传走 `/app-testflight`）。
- E2E 只跑 Release 包，不需要 Metro；判据与约定见 TESTING.md。

## 一·五、本机多项目共存（Metro 端口 / 专用模拟器）

**Metro 端口 = __METRO_PORT__**，唯一真相源是全局登记表 `~/.claude/skills/rn-metro/ports.tsv`：

1. 新项目**先登记再用**：在项目根目录跑 `~/.claude/skills/rn-metro/metro.sh port`，它分配（8090 起）并写入登记表；
   `scripts/init.sh` 只读校验登记表，不替你写。**8081 不分配给任何项目。**
2. 起 Metro 一律走 `/rn-metro`（`metro.sh start`）：端口被别的项目占着会报 `PORT_TAKEN`——查登记表，**不杀别人的 Metro**。
3. `package.json` 的 `--port`、本文件、skill 里的端口必须与登记表一致；禁止依赖 Expo CLI「端口占用自动 +1」。

**专用模拟器**（本项目自建、只给本项目用）：

| 名字 | 系统 | UDID |
|---|---|---|
| `__APP_NAME__ iOS<最新大版本>` | iOS 27.x | （`scripts/sim-setup.sh` 输出后填） |
| `__APP_NAME__ iOS<上一大版本>` | iOS 26.x | （同上） |

- 命名固定 `<App> iOS<N>`，`scripts/e2e-all.sh` 默认按这个名字找两台；不往别的项目的模拟器（或无主共享机）上装包。
- 只建不删：别的项目的模拟器一律不动、不 shutdown、不 delete。模拟器整组消失（别的会话误删）时按同名重建并更新本表。
- 新 iOS 大版本出来、装了 runtime 后重跑 `scripts/sim-setup.sh` 补建新的那台，并更新本表。
- 多台模拟器同时 Booted 时，maestro / simctl 一律显式带 UDID。

## 一·六、iOS 发布硬规则（所有 iOS 项目适用，反复踩过）

1. **Xcode 27 / iOS 27 SDK 打的包，没采用 UIScene 生命周期，iOS 27 上一启动就崩**
   （栈顶 `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`，EXC_BREAKPOINT，无业务代码）。
   - 判据：`PlistBuddy -c "Print DTSDKName" <App>.app/Info.plist` 是 `iphoneos27.x`（模拟器包为 `iphonesimulator27.x`），
     且 Info.plist 没有 `UIApplicationSceneManifest`。
   - 本模板已处理：`expo ≥ 57.0.23` + `app.json` 里 `expo-build-properties` 的 `ios.enableSceneSupport: true`（SDK 58 起模板自带）。
     **不要删这一项**；`scripts/build-sim-release.sh` 与 `/app-testflight` 归档核验都会拦。
2. **上传 TestFlight / 提审之前，必须在「最新 iOS 大版本」的模拟器上冷启动 Release 包并跑完 Maestro E2E**，
   不能只在旧系统模拟器上跑——旧系统全绿、新系统一开就崩的包真实上过 TestFlight。升级 Xcode 后的第一个包尤其如此。
   E2E 没跑或只跑了旧系统，就不许说「可以发布」。（`scripts/e2e-all.sh` 默认就是最新 + 上一大版本两台。）
3. **Apple Watch App 图标不能用黑色 / 近黑背景**：watchOS 把图标裁成圆形，黑底在表盘上看不出轮廓，
   App Review 按 Guideline 4 - Design 拒。带手表 target 的项目，手表图标单独出一张浅色或品牌色底的版本，
   不要直接复用深色的 iPhone 图标。

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
   `~/.claude/skills/rn-metro/metro.sh status` 查登记表与实际占用。
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
15. 【共性】Release 包内嵌 JS，改了 JS 不重新打包等于没改；Xcode 里 ⌘R 会把刚装的 Release 包覆盖成 Debug 包，
    之后 E2E 全挂（停在「选 Metro」页）。E2E 前重新 `scripts/build-sim-release.sh`，由 `e2e-all.sh` 卸载重装。
16. 【共性】Release 归档里必须是 release 版预编译 React：`Frameworks/React.framework/React` 约 12 MB（debug 约 68 MB），
    `ios/Pods/React-Core-prebuilt/.last_build_configuration` 为 `Release`；外网断时 pod install 会静默退回源码编译，
    归档绿、装上即崩。`/app-testflight` 的归档核验会拦。
17. 【共性】升级 Xcode 后随机 target 编不过：先清 ExpoModulesJSI 的旧预编译产物（tick-me 实测是
    `expo-modules-jsi/apple/Products`）再 prebuild，别先怀疑业务代码。
18. 【共性】altool「UPLOAD SUCCEEDED」≠ build 可用：要轮询 `buildUploads` 到 COMPLETE、再等 `processingState=VALID`；
    流水线进入上传步骤就当已传上，同一 build 号不能再传，想改只能递增 build 号。
19. 【共性】Maestro 上一条 flow 被杀后，紧接着的 flow 偶发 `driver did not start up` / `Broken pipe` 假失败：
    只对这两种报错补跑一次（`e2e-all.sh` 已内置），其余失败不许靠重跑洗绿。
20. 【共性】新建的模拟器首次启动明显慢（建缓存），先 `simctl bootstatus <udid> -b` 等真正就绪再装包，
    别在半启动状态里判「装不上 / 起不来」。
