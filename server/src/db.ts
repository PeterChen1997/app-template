// DB 装配：schema 按 PgSQL 写；驱动按环境切换（同一 schema 双驱动）。
// - DATABASE_URL 存在 → node-postgres（生产/真实 PG）
// - 否则 → PGLite（本地零依赖；PGLITE_DATA_DIR 落盘，不设则内存，测试用）

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { bigint, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle as drizzleNode, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import pg from 'pg';

// ---- schema ----

// 配对设备。红线：token 明文不落库，只存 sha256（见 auth.ts）。
export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  tokenSha256: text('token_sha256').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

// 示例业务表：jsonb 透传（客户端整包读写，服务端不理解 payload 结构）。
// 模板落地成真实业务时，把它换成/扩展成自己的表。
export const entities = pgTable('entities', {
  id: text('id').primaryKey(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

const schema = { devices, entities };

export type Db = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>;

export type DbConfig = {
  databaseUrl: string | null;
  pgliteDataDir: string | null;
};

export function createDb(cfg: DbConfig): Db {
  if (cfg.databaseUrl !== null && cfg.databaseUrl !== '') {
    const pool = new pg.Pool({ connectionString: cfg.databaseUrl });
    return drizzleNode(pool, { schema });
  }
  const client =
    cfg.pgliteDataDir !== null && cfg.pgliteDataDir !== ''
      ? new PGlite(cfg.pgliteDataDir)
      : new PGlite();
  return drizzlePglite(client, { schema });
}

// 启动迁移：CREATE IF NOT EXISTS，幂等，PGLite 与真实 PG 通用。
// 为什么不上迁移工具：模板骨架期表结构极小，顺序执行幂等 DDL 足够；
// 日后表多了可换 drizzle-kit 增量迁移，本函数即替换点。
const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    token_sha256 TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS devices_token_sha256_idx ON devices (token_sha256)`,
  `CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
];

export async function migrate(db: Db): Promise<void> {
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }
}
