---
name: app-testflight
description: 发 TestFlight 全流程：自动递增 buildNumber（version 不动）→ changelog 检查 → prebuild → archive → 归档核验（DTSDKName / UIScene / Hermes bundle / release 版 React）→ export → altool 上传 → 轮询 buildUploads → 等 build VALID。要「传 TestFlight / 发内测 / 出新 build」时用它，不要手敲 xcodebuild 和 ASC 请求。发之前必须先过 /app-release 的闸门。
---

按顺序执行，任何一步失败立即停止并报告，不要跳步。脚本在本目录：`pipeline.sh`（主流程）、`asc.py`（ASC REST 小工具）。

## 0. 前置
- **`/app-release` 第 1–5 步已过**：`pnpm verify` 绿、Release 包在最新 iOS 大版本 + 上一大版本冷启动并跑完全套 E2E（`E2E_ALL_OK`）、
  风险已告诉用户。没过不许跑本流水线。
- **版本号默认不动，只升 build**：流水线第 0 步把 `app.json` 的 `expo.ios.buildNumber` +1 写回（输出 `BUMP 1.0.0(1) -> 1.0.0(2)`）。
  同一版本号下通常只有首个 build 排 TestFlight Beta 人审，后续 build 处理完很快放行；大 feature 或用户明确要求时才手改 `expo.version`。
  已手动递增 / 重跑同一 build 传 `TF_NO_BUMP=1`。**ASC 上已存在的 build 号脚本会拒传**（不能复用）。
- **先在 `docs/RELEASE_NOTES.md` 给即将递增到的 build 写条目**（标题 `## <version>(<build>)`，build = 当前 buildNumber + 1）。
  流水线递增后检查，缺了 `CHANGELOG_MISSING` 退出（此时 app.json 已升号，补完重跑传 `TF_NO_BUMP=1`）。
  项目有自己的变更记录格式时，用 `TF_CHANGELOG_CMD='<检查命令，可用 $BUILD $VERSION>'` 替换默认检查。
- 配置（环境变量或本目录 `config.env`，只放 ID，**私钥不进仓库、不打印**）：
  ```bash
  ASC_KEY_ID=<API Key ID>          # 私钥：~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8（altool 也从这里找）
  ASC_ISSUER_ID=<Issuer ID>
  ASC_APP_ID=<ASC 里 App 的数字 id>  # App 记录要先在 ASC 网页手建，API 建不了
  APPLE_TEAM_ID=<Team ID>          # 开发者 Team ID，不是证书 CN 里那串
  PY=<装了 PyJWT 的 python3>        # 默认 python3
  ```
- Xcode 已登录 Apple ID（有 distribution 证书；export 只带 `-allowProvisioningUpdates`）。
- 正式包**不许带 E2E 编译期开关**：环境里有白名单外的 `EXPO_PUBLIC_*` 直接 `DIRTY_ENV_FAILED`。
  确需带进正式包的（如渠道变量）列进 `TF_ALLOWED_PUBLIC_ENV="EXPO_PUBLIC_CHANNEL"`。
- 一次只允许一个会话跑流水线（多 worktree 会抢 build 号）：开始前 `git status` + `pgrep -fl pipeline.sh`。

## 1. 跑流水线（后台跑，10–20 分钟）
```bash
TF_WORK=<本会话 scratchpad>/tf bash .claude/skills/app-testflight/pipeline.sh
```
- `TF_WORK` 必须在 `ios/` 之外（prebuild 会清空 `ios/`；跑完后模拟器产物也没了，要再验模拟器得重新打包）。
- 判定只看标记：`BUMP → CHANGELOG_OK → PREBUILD_OK → ARCHIVE_OK → ARCHIVE_VERIFY_OK → EXPORT_OK → UPLOAD_OK → PROCESS_OK → VALID_OK → PIPELINE_OK`。
  任何 `*_FAILED` / `*_TIMEOUT` / `ARCHIVE_BROKEN` / `VERSION_MISMATCH` 都是真失败，去看 `$TF_WORK/{prebuild,archive,export,upload}.log`。
- 归档核验（`ARCHIVE_VERIFY_OK` 之前任何一条不过都不上传）：
  1. `DTSDKName` 为 `iphoneos27.x` 时 Info.plist 必须有 `UIApplicationSceneManifest`（否则 iOS 27 启动即崩）；
  2. `main.jsbundle` 是 Hermes 字节码的 Release bundle；
  3. `Frameworks/React.framework/React` 存在且 < 40 MB（debug 版约 68 MB）、`.last_build_configuration` 为 Release
     ——外网断时 pod install 会静默退回源码编译，归档绿、装上即崩。
- 已知处置：
  - `EXPORT_FAILED` 带 `No profiles found` / `Authentication failed` → Xcode 没登录 Apple ID 或证书缺失。
  - `UPLOAD_FAILED` 带 `Defaults.properties` → 脚本已自动清 transporter 缓存重传一次，仍失败看 upload.log。
  - `PROCESS_FAILED` 带 `errors[]` → Apple 处理阶段拒绝（如缺 purpose string），按错误码改 app.json 后**递增 build** 重跑。
  - **杀掉 altool ≠ 没传上**：进入上传步骤就当已传上，想加改动只能递增 build 号。

## 2. 核对（脚本跑完 ≠ 测试者拿到）
```bash
$PY .claude/skills/app-testflight/asc.py GET "/v1/builds?filter[app]=$ASC_APP_ID&filter[version]=<build>&include=buildBetaDetail"
```
`processingState` 为 VALID；内部测试组（hasAccessToAllBuilds）自动拿到所有 build，**外部组只拿手动加进去的 build**。

## 3. 外部测试组 / Beta 审核 / 测试内容（按项目配置，用 asc.py）
项目有外部测试组时，在 VALID 之后依次：
1. 把 build 加进外部组：`asc.py POST "/v1/betaGroups/<groupId>/relationships/builds" '{"data":[{"type":"builds","id":"<buildId>"}]}'`
2. 写测试内容：`betaBuildLocalizations`（zh-Hans / en-US 各一条 `whatsNew`，取自 `docs/RELEASE_NOTES.md` 该条目）
3. 提 Beta 审核：`asc.py POST /v1/betaAppReviewSubmissions '{"data":{"type":"betaAppReviewSubmissions","relationships":{"build":{"data":{"type":"builds","id":"<buildId>"}}}}}'`
   同一 train 只能有一个在审；被 `ANOTHER_BUILD_IN_REVIEW` 拒时等十几秒重试。不要动已 IN_BETA_TESTING 的旧 build（测试者装着）。
核对 included 里 `externalBuildState` 为 WAITING_FOR_BETA_REVIEW / IN_BETA_REVIEW / IN_BETA_TESTING 才算给到外测组。
项目固定下来后，把组 id 等常量写进本文件末尾的常量表，或抽成 `post_upload.py`。

## 4. 回写与提交
- `docs/HANDOFF.md` 记一行：build、状态、时间、发前验证了什么（只写实际跑过的）。
- 提交信息结尾带版本：`<type>: <改动> + 版本 <version>(<build>)`；只提交本次改动与 app.json / RELEASE_NOTES。
- 新踩的坑写进 CLAUDE.md 踩坑记录（条件 + 症状 + 处置，标【共性】/【本仓库】），【共性】的回流模板。

## 常量（项目填写）
| 项 | 值 |
|---|---|
| ASC App id | （填） |
| Team ID | （填） |
| 外部测试组 | （填 id / 名字；没有就写「无」） |
