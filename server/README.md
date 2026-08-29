# server —— 模板可选后端骨架

Fastify + Drizzle 的最小后端骨架，供模板 App 需要「一个自己的服务端」时起步。
提供 device pairing 鉴权、双驱动 PG 存储、jsonb 透传示例端点、进程内测试与 curl 验收脚本。

## 边界

- **后端不参与任何端上调度**：提醒、定时、通知等一律由客户端本地完成，
  服务端只做存储与鉴权。不要把「服务端推着客户端干活」的逻辑加进来。
- 单用户/自部署定位：一个 `PAIRING_SECRET` 保护配对入口，配对产生的每个 token 即一台设备。
- 红线：token 明文只在配对响应里出现一次，库里只存 sha256；日志不打印请求/响应正文。

## 双驱动存储

schema 按 PgSQL 编写（`src/db.ts`），运行时驱动按环境切换：

| 环境变量 | 驱动 | 场景 |
|---|---|---|
| `DATABASE_URL` 已设 | node-postgres | 生产 / 真实 PG |
| `PGLITE_DATA_DIR` 已设 | PGLite（落盘） | 本地零依赖持久化 |
| 两者都没设 | PGLite（内存） | 测试 / 试跑（重启丢数据，启动时会警告） |

迁移是启动时顺序执行的幂等 `CREATE TABLE IF NOT EXISTS` DDL（`src/db.ts` 的 `DDL` 数组）；
表多了以后可换 drizzle-kit 增量迁移，`migrate()` 即替换点。

## 开发

```bash
cd server
pnpm install
cp .env.example .env      # 改 PAIRING_SECRET
pnpm dev                  # tsx watch，读 .env，默认 :8790
pnpm typecheck            # tsc --noEmit
pnpm test                 # tsx 串行跑 tests/*.test.ts（内存 PGLite + fastify.inject，不占端口）
```

curl 级验收（对着已启动的 dev server）：

```bash
PAIRING_SECRET=xxx bash scripts/accept.sh            # 默认 http://localhost:8790
PAIRING_SECRET=xxx bash scripts/accept.sh http://host:port
```

## 部署

单容器（`Dockerfile`，node:22-slim 多阶段，生产镜像只含 dist + 运行时依赖）：

```bash
docker build -t app-template-server server/
docker run -e PAIRING_SECRET=xxx -e DATABASE_URL=postgres://... -p 8790:8790 app-template-server
# 不接真实 PG 也可以：挂个卷给 PGLite
docker run -e PAIRING_SECRET=xxx -e PGLITE_DATA_DIR=/data -v app-data:/data -p 8790:8790 app-template-server
```

环境变量见 `.env.example`；缺 `PAIRING_SECRET` 进程直接退出（大声失败，不静默降级）。

## 端点

除 `GET /healthz` 与 `POST /v1/auth/pair` 外，所有端点强制 `Authorization: Bearer <token>`
（全局 preHandler 钩子，新增路由默认受保护）。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/healthz` | 无 | 健康检查 `{ ok: true }` |
| POST | `/v1/auth/pair` | 无（body 带 `pairingSecret`） | 配对：`{ pairingSecret }` → `{ deviceId, token }`；密钥错 403 |
| GET | `/v1/auth/whoami` | Bearer | 当前设备 `{ deviceId, createdAt }` |
| PUT | `/v1/entities/:id` | Bearer | 示例：jsonb 透传 upsert，body `{ payload }` |
| GET | `/v1/entities/:id` | Bearer | 示例：回读 `{ id, payload, updatedAt }`，不存在 404 |

`entities` 是占位的示例业务表（服务端不理解 payload 结构）；落地真实业务时替换或扩展它。

## 代码规范

- TypeScript ESM，strict + `noUncheckedIndexedAccess` + `noImplicitOverride`；相对 import 带 `.js` 后缀。
- 类型一律 `type`，禁 `interface`；禁一切 `as` 断言（唯一例外 `as const`）；
  未知结构（`req.body` / `req.params`）经 `src/guards.ts` 守卫收窄；数组取元素用 `.at(0)`。
- `buildApp()` 纯装配不 listen，db 与 `now()` 时钟可注入 —— 测试全部进程内跑。
