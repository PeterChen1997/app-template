# app-template

> iOS App 批量开发模板 · **template v0.2.0**（变更见 `CHANGELOG.md`）
>
> 从 `chatme` / `deeplisten` / `beatlock` / `tick-me` 四个项目的实测工程约定中提炼。
> 完整决策依据见 Notion 文档《iOS App 批量开发技术模板》与 `docs/实施技术方案.md`。

## 这是什么

一套「新 App 起手即用」的 Expo iOS 工程骨架：分层架构 + ESLint 硬边界 + 守卫式 TS 规范 +
SQLite migration + 双语 i18n + 主题 token + 脱敏 logger + jest 测试基建 + CI，
外加一个可选的 Fastify 后端骨架（`server/`）。目标是把「确认技术栈实现方式」的时间压到零。

## 技术栈基线

| 领域 | 选型 |
|---|---|
| 平台 | Expo SDK 57（expo ≥ 57.0.23，当前锁 57.0.30）+ RN 0.86.3 + React 19.2，New Arch + React Compiler；已开 UIScene（`enableSceneSupport`，iOS 27 必需） |
| 语言 | TypeScript strict + `noUncheckedIndexedAccess` |
| 包管理 | pnpm（`.npmrc` 已配 `node-linker=hoisted`，本地 Expo Module 的硬前提） |
| 路由 | expo-router + typedRoutes |
| 状态 | zustand 仅存 UI/运行态；持久态走 SQLite Repository |
| 持久层 | expo-sqlite（WAL），裸 SQL migration（`PRAGMA user_version`），无 ORM |
| 密钥 | expo-secure-store（Keychain），DB 只存 ref |
| 测试 | jest（客户端）+ tsx 向量测试（server）+ Maestro（E2E，Release 包 × 最新 / 上一 iOS 大版本两台专用模拟器） |
| 后端（可选） | Fastify 5 + Drizzle 语义的 PgSQL schema，pg / PGLite 双驱动 |

## 新项目启动

```bash
git clone <this-repo> my-app && cd my-app
rm -rf .git && git init -b master
~/.claude/skills/rn-metro/metro.sh port   # 先在 rn-metro 登记表分配本项目的 Metro 端口（不用 8081）
./scripts/init.sh   # 替换 __APP_NAME__ / __BUNDLE_ID__ / __SCHEME__ / __METRO_PORT__（只读校验端口登记）
./scripts/sim-setup.sh   # 建本项目专用模拟器「<App> iOS<N>」×2
pnpm install && pnpm verify
```

然后按 checklist 走（完整版见 `docs/实施技术方案.md` 附录）：

1. Metro 端口以 `~/.claude/skills/rn-metro/ports.tsv` 为准（起 Metro 走 `/rn-metro`）；专用模拟器 UDID 登记进 `CLAUDE.md`「本机多项目共存」。
2. 写下本 App 的「领域铁律」，落成 `eslint.config.js` 里的规则（有标注好的规则位）。
3. 补 `app.json`：privacyManifests 按实际用到的 API 调整、权限中文文案。
4. 定 schema v1（只建有读写方的表），跑通 `pnpm verify` + `scripts/build-sim-release.sh` + `scripts/e2e-all.sh`。
5. 需要后端 → 用 `server/` 骨架；需要原生能力 → `create-expo-module --local` 起手。
6. `CLAUDE.md` 只填本项目差异段；共性坑不复制，标注「基于 template v0.2.0」。
7. 本仓库的 `CHANGELOG.md` 是模板自己的版本记录，新项目可删掉；App 面向测试者的变更记录写 `docs/RELEASE_NOTES.md`。

## 常用命令

```bash
pnpm verify        # typecheck + lint + test，唯一的「绿了才算完」入口
~/.claude/skills/rn-metro/metro.sh start   # Metro（端口来自 rn-metro 登记表，每项目独占）
pnpm exec expo prebuild -p ios   # 改 app.json / plugins / modules / targets 后必跑
scripts/build-sim-release.sh     # Release 模拟器包 + 产物核验（DTSDKName / UIScene / Hermes bundle）
scripts/e2e-all.sh               # 两台专用模拟器：冷启动判活 + 截图 + 全套 Maestro
```

## 目录结构

```
src/app/**             expo-router 路由壳（薄）
src/features/**        业务组件 / hooks
src/application/**     用例（纯 TS）；唯一注入 port 实现的组装点
src/core/**            domain 类型与规则 —— 零平台依赖（ESLint 强制）
src/infrastructure/**  db / logger 等 —— 实现 core 契约，只被 application 依赖
src/components/ui/**   共享 UI 原语
tests/                 与 src 分离；真 SQLite（WASM）跑 migration
server/                可选后端骨架（独立 pnpm 工程）
```

## 文档指路

| 文档 | 内容 |
|---|---|
| `CLAUDE.md` | AI 协作规范：关键命令、架构不变量、共性踩坑合集 |
| `TESTING.md` | 测试通道分工、E2E 跑法与用例矩阵模板 |
| `.claude/skills/` | 通用 skill：`app-verify`（构建验证循环）、`app-release`（发布 SOP）、`app-testflight`（上传流水线） |
| `docs/RELEASE_NOTES.md` | App 每个 build 的变更记录（TestFlight 流水线检查它） |
| `docs/verification/` | 模板自身的验证截图（v0.2 iOS 27 冷启动） |
| `docs/HANDOFF.md` | 交接活文档模板 |
| `docs/实施技术方案.md` | 架构蓝图骨架 + 裁决记录表 |
| `server/README.md` | 后端骨架说明 |

## 共性坑回流机制

各项目 `CLAUDE.md` 踩坑记录里标了【共性】的条目，定期回流到本模板并升版本号；
各项目在自己的 `CLAUDE.md` 头部标注「基于 template vX.Y.Z」，升级时对照 diff。
