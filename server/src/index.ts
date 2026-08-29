// 入口：读环境变量 → 建库/迁移 → 起 Fastify。
// 环境变量清单见 README.md / .env.example。

import { buildApp } from './app.js';
import { createDb, migrate } from './db.js';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    console.error(`缺少环境变量 ${name}，拒绝启动（大声失败，不静默降级）`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const pairingSecret = requiredEnv('PAIRING_SECRET');
  const databaseUrl = process.env['DATABASE_URL'] ?? null;
  const pgliteDataDir = process.env['PGLITE_DATA_DIR'] ?? null;
  const port = Number(process.env['PORT'] ?? '8790');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`PORT 非法：${process.env['PORT']}`);
    process.exit(1);
  }

  if (databaseUrl === null && pgliteDataDir === null) {
    console.warn('未设置 DATABASE_URL / PGLITE_DATA_DIR，使用内存 PGLite（重启丢数据，仅限本地试跑）');
  }

  const db = createDb({ databaseUrl, pgliteDataDir });
  await migrate(db);

  const app = buildApp({ db, pairingSecret, logger: true });
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
