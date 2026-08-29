# app-template

> iOS App 批量开发模板 · **template v0.1.0**
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
| 平台 | Expo SDK 57 + RN 0.86 + React 19.2，New Arch + React Compiler |
| 语言 | TypeScript strict + `noUncheckedIndexedAccess` |
| 包管理 | pnpm（`.npmrc` 已配 `node-linker=hoisted`，本地 Expo Module 的硬前提） |
| 路由 | expo-router + typedRoutes |
| 状态 | zustand 仅存 UI/运行态；持久态走 SQLite Repository |
| 持久层 | expo-sqlite（WAL），裸 SQL migration（`PRAGMA user_version`），无 ORM |
| 密钥 | expo-secure-store（Keychain），DB 只存 ref |
| 测试 | jest（客户端）+ tsx 向量测试（server）+ Maestro（E2E） |
| 后端（可选） | Fastify 5 + Drizzle 语义的 PgSQL schema，pg / PGLite 双驱动 |

## 新项目启动

```bash
git clone <this-repo> my-app && cd my-app
rm -rf .git && git init -b master
./scripts/init.sh   # 替换 __APP_NAME__ / __BUNDLE_ID__ / __SCHEME__ / __METRO_PORT__
pnpm install && pnpm verify
```

然后按 checklist 走（完整版见 `docs/实施技术方案.md` 附录）：

1. 分配独占 Metro 端口与专用模拟器 UDID，登记进 `CLAUDE.md`（已占用：8081 tick-me / 8082 chatme / 8083 beatlock / 8084 deeplisten）。
2. 写下本 App 的「领域铁律」，落成 `eslint.config.js` 里的规则（有标注好的规则位）。
3. 补 `app.json`：privacyManifests 按实际用到的 API 调整、权限中文文案。
4. 定 schema v1（只建有读写方的表），跑通 `pnpm verify` + 一条 Maestro smoke。
5. 需要后端 → 用 `server/` 骨架；需要原生能力 → `create-expo-module --local` 起手。
6. `CLAUDE.md` 只填本项目差异段；共性坑不复制，标注「基于 template v0.1.0」。

## 常用命令

```bash
pnpm verify        # typecheck + lint + test，唯一的「绿了才算完」入口
pnpm start         # Metro（端口见 package.json，每项目独占）
pnpm exec expo prebuild -p ios   # 改 app.json / plugins / modules / targets 后必跑
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
| `TESTING.md` | 测试通道分工与用例矩阵模板 |
| `docs/HANDOFF.md` | 交接活文档模板 |
| `docs/实施技术方案.md` | 架构蓝图骨架 + 裁决记录表 |
| `server/README.md` | 后端骨架说明 |

## 共性坑回流机制

各项目 `CLAUDE.md` 踩坑记录里标了【共性】的条目，定期回流到本模板并升版本号；
各项目在自己的 `CLAUDE.md` 头部标注「基于 template vX.Y.Z」，升级时对照 diff。
