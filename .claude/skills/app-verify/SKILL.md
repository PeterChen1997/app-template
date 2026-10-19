---
name: app-verify
description: 模拟器构建验证原子循环：prebuild 三查 → xcodebuild（防假绿判定）→ 安装 → 启动 → 截图读图确认。改任何原生相关的东西（app.json、plugins/、modules/、targets/、原生依赖）后都用它，不要手敲 xcodebuild。Release 变体是 E2E 与发布闸门的测试对象。
---

按顺序执行，任何一步失败立即停止并报告，不要跳步。每一步的判据都要贴输出——不贴判据等于没跑。

## 0. 环境与常量
```bash
export PATH="/opt/homebrew/bin:$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # pod install 非交互必须 UTF-8
APP=$(node -p "require('./app.json').expo.name" | tr -cd '[:alnum:]')       # Xcode 工程 / scheme 名
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")
SCHEME_URL=$(node -p "require('./app.json').expo.scheme")
PORT=$(~/.claude/skills/rn-metro/metro.sh port)                              # 本项目登记的 Metro 端口（不是 8081）
UDID=<CLAUDE.md「专用模拟器」里本项目的那台>                                  # 不用别的项目的模拟器
```

## 1. prebuild（改了 app.json / plugins / modules / targets / 原生依赖才需要）
```bash
pnpm exec expo prebuild -p ios > /tmp/$APP-prebuild.log 2>&1
grep -q "Installing CocoaPods" /tmp/$APP-prebuild.log && ! grep -qE "\[!\]|Something went wrong" /tmp/$APP-prebuild.log \
  && echo PREBUILD_OK || { tail -20 /tmp/$APP-prebuild.log; echo PREBUILD_FAILED; }
/usr/libexec/PlistBuddy -c "Print :UIApplicationSceneManifest" ios/$APP/Info.plist > /dev/null && echo SCENE_OK || echo SCENE_MISSING
```
三查：
- **exit 0 不可信**：看「Installing CocoaPods」之后没有 `[!]`；失败则 `cd ios && pod install` 手补。
- `SCENE_OK`：Xcode 27 打包必须有 UIScene 清单（`expo-build-properties.ios.enableSceneSupport: true`），否则 iOS 27 启动即崩。
- 自己写的 config plugin 产物都在（如 `ls ios/$APP/<插件生成的文件>`）。

只增删了 Swift 文件 → 不必全量 prebuild，`cd ios && pod install` 即可（CocoaPods 把文件列表快照进 pbxproj，
不跑的症状是 `cannot find 'X' in scope`）。

## 2. Debug 构建（输出落文件，禁止管道判定）
```bash
xcodebuild -workspace ios/$APP.xcworkspace -scheme $APP -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath ios/build \
  ENABLE_DEBUG_DYLIB=NO build > /tmp/$APP-build.log 2>&1
grep -q "BUILD SUCCEEDED" /tmp/$APP-build.log \
  || { grep " error:" /tmp/$APP-build.log | sort -u | head -10; echo "BUILD FAILED"; }
```
- 判定唯一标准是日志里的 `BUILD SUCCEEDED`；命令 exit code 和「没看到 error」都不算数。
- `ENABLE_DEBUG_DYLIB=NO` 不能省（否则 AppIntents / LiveActivityIntent 失效）。

## 3. 安装 + 启动 + 读图确认（构建成功 ≠ 装上了 ≠ 渲染对了）
```bash
~/.claude/skills/rn-metro/metro.sh start          # 起 Metro 只走 rn-metro；PORT_TAKEN 就停下查登记表，不杀别人的进程
xcrun simctl boot $UDID 2>/dev/null; xcrun simctl bootstatus $UDID -b
xcrun simctl install $UDID ios/build/Build/Products/Debug-iphonesimulator/$APP.app
xcrun simctl launch $UDID $BUNDLE_ID
xcrun simctl openurl $UDID "$SCHEME_URL://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$PORT"
sleep 10 && xcrun simctl io $UDID screenshot /tmp/$APP-verify.png
```
读截图确认 App 渲染了预期界面才算完成。卡 splash → 看 Metro 日志有没有新的「iOS Bundled」行；
加载到陌生原生模块报错 → 连到了别的项目的 Metro（端口不对）。

## Release 变体（E2E / 冷启动闸门的测试对象）
```bash
scripts/build-sim-release.sh          # 末行 SIM_RELEASE_OK；内含 bundle id / DTSDKName + UIScene / Hermes bundle 三项核验
scripts/e2e-all.sh "<App> iOS27"      # 冷启动判活 + 截图 + 全套 Maestro；末行 E2E_ALL_OK
```
- Release 包内嵌 bundle，**不需要 Metro**；改了 JS 必须重新打包（Release 包里的 JS 不会热更新）。
- E2E 需要的 `EXPO_PUBLIC_*` 编译期开关在打包前 `export`；这样的包只用于测试，绝不上传。
- 不要在 Xcode 里 ⌘R 覆盖掉刚装的 Release 包（会换成 Debug 包，E2E 全挂）。

## 清理
验证完 `~/.claude/skills/rn-metro/metro.sh stop`（只停本项目的）；本次自己 boot 的模拟器 `xcrun simctl shutdown $UDID`，
别人开着的模拟器不动、不删。
