# HANDOFF — __APP_NAME__

> 交接活文档。新会话从这里接手：先读本文件，再读 CLAUDE.md 与 docs/实施技术方案.md，然后动手。
> 按交付倒序追加；每条写「做了什么 / 验证了什么（**只写实际跑过的**）/ 还剩什么」。

## 环境要点

- Metro 端口：__METRO_PORT__（独占）；专用模拟器：（型号 + UDID）
- 构建：Development Build，不用 Expo Go；`ios/` 是 prebuild 产物且 gitignore
- 验证入口：`pnpm verify`（typecheck + lint + jest）
- 模板版本：template v0.1.0

## 当前状态

- （日期）从 app-template v0.1.0 初始化，`pnpm verify` 全绿。

## 下一步任务

1. （填写）

## 技术债

- （填写；每条注明来源与偿还条件）

---

## 交付记录（倒序）

### YYYY-MM-DD（示例格式）

- **做了什么**：
- **验证了什么**：（只写实际跑过的命令与结果数字）
- **还剩什么**：
