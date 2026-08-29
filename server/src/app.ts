// Fastify 应用装配：buildApp 只装配、不 listen（测试用 fastify.inject 进程内跑）。
// 鉴权用全局 preHandler 钩子强制：除 PUBLIC_ROUTES 外一律 Bearer，
// 新增路由默认就是受保护的，避免「忘了加 requireAuth」这类静默漏洞。

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { pairDevice, verifyBearer, type DeviceRow } from './auth.js';
import { entities, type Db } from './db.js';
import { getString, isEntityPutBody, isPairBody } from './guards.js';

export type AppOptions = {
  db: Db;
  pairingSecret: string;
  // 时钟注入：测试可传固定时钟，生产缺省 Date.now
  now?: () => number;
  logger?: boolean;
};

const PUBLIC_ROUTES: ReadonlySet<string> = new Set(['/healthz', '/v1/auth/pair']);

export function buildApp(opts: AppOptions): FastifyInstance {
  const { db, pairingSecret } = opts;
  const now = opts.now ?? Date.now;

  const app = Fastify({ logger: opts.logger ?? false });

  // 认证结果挂在 WeakMap 而非 request 属性上：
  // 避免 declare-module（interface 合并）与类型断言，请求结束后自动可回收。
  const authedDevice = new WeakMap<FastifyRequest, DeviceRow>();

  app.addHook('preHandler', async (req, reply) => {
    const url = req.routeOptions.url;
    // 未命中任何路由 → 交给 fastify 的 404，不在这里拦
    if (url === undefined || PUBLIC_ROUTES.has(url)) return;
    const device = await verifyBearer(db, req.headers.authorization);
    if (device === null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    authedDevice.set(req, device);
  });

  app.get('/healthz', async () => ({ ok: true }));

  // ---- 认证 ----

  app.post('/v1/auth/pair', async (req, reply) => {
    const body: unknown = req.body;
    if (!isPairBody(body)) return reply.code(400).send({ error: 'bad-request' });
    const result = await pairDevice(db, pairingSecret, body.pairingSecret, now());
    if (!result.ok) return reply.code(403).send({ error: result.code });
    // token 明文只在此处返回一次；日志层（logger:true 时）不打印响应体
    return reply.send({ deviceId: result.deviceId, token: result.token });
  });

  app.get('/v1/auth/whoami', async (req, reply) => {
    const device = authedDevice.get(req);
    if (device === undefined) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send({ deviceId: device.id, createdAt: device.createdAt });
  });

  // ---- 示例受保护端点：entities jsonb 透传 ----

  app.put('/v1/entities/:id', async (req, reply) => {
    const id = getString(req.params, 'id');
    if (id === null || id === '') return reply.code(400).send({ error: 'bad-request' });
    const body: unknown = req.body;
    if (!isEntityPutBody(body)) return reply.code(400).send({ error: 'bad-request' });
    const updatedAt = now();
    await db
      .insert(entities)
      .values({ id, payload: body.payload, updatedAt })
      .onConflictDoUpdate({ target: entities.id, set: { payload: body.payload, updatedAt } });
    return reply.send({ id, updatedAt });
  });

  app.get('/v1/entities/:id', async (req, reply) => {
    const id = getString(req.params, 'id');
    if (id === null || id === '') return reply.code(400).send({ error: 'bad-request' });
    const rows = await db.select().from(entities).where(eq(entities.id, id));
    const row = rows.at(0);
    if (row === undefined) return reply.code(404).send({ error: 'not-found' });
    return reply.send({ id: row.id, payload: row.payload, updatedAt: row.updatedAt });
  });

  return app;
}
