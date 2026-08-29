// 测试基建：内存 PGLite + fastify.inject（不占端口、不落盘）。
// 运行风格：tsx 直跑、自写计数、失败非零退出码 —— 不引测试框架，骨架保持零额外依赖。

import { isDeepStrictEqual } from 'node:util';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDb, migrate, type Db } from '../src/db.js';

let pass = 0;
let fail = 0;

export function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`FAIL: ${name}${detail === undefined ? '' : ` — ${detail}`}`);
  }
}

export function expectEq(name: string, got: unknown, want: unknown): void {
  check(name, isDeepStrictEqual(got, want), `want=${JSON.stringify(want)} got=${JSON.stringify(got)}`);
}

export function summary(label: string): void {
  console.log(`${label}: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function field(obj: unknown, key: string): unknown {
  return isRecord(obj) ? obj[key] : undefined;
}

export const TEST_SECRET = 'test-pairing-secret';

export type TestApp = { app: FastifyInstance; db: Db };

export async function makeApp(opts?: { now?: () => number }): Promise<TestApp> {
  const db = createDb({ databaseUrl: null, pgliteDataDir: null });
  await migrate(db);
  const app = buildApp({ db, pairingSecret: TEST_SECRET, now: opts?.now });
  await app.ready();
  return { app, db };
}

export async function pairToken(app: FastifyInstance): Promise<{ deviceId: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/pair',
    payload: { pairingSecret: TEST_SECRET },
  });
  const body: unknown = res.json();
  const deviceId = field(body, 'deviceId');
  const token = field(body, 'token');
  if (typeof deviceId !== 'string' || typeof token !== 'string') {
    throw new Error(`pair 失败：${res.statusCode} ${res.body}`);
  }
  return { deviceId, token };
}
