// Device pairing 鉴权：
// - 配对：客户端携带 PAIRING_SECRET → 服务端 timingSafeEqual 比对 → 生成随机长期 token
// - 红线：token 明文只在配对响应里出现一次，库里只存 sha256
// - 之后所有请求 Authorization: Bearer <token>（/healthz 与 /v1/auth/pair 除外，见 app.ts）

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { devices, type Db } from './db.js';

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// 先各自 sha256 再 timingSafeEqual：两个摘要恒等长，
// 既避免 timingSafeEqual 对不等长输入抛错，也不因提前返回泄露长度信息。
function secretMatches(expected: string, presented: string): boolean {
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(presented).digest();
  return timingSafeEqual(a, b);
}

export type DeviceRow = typeof devices.$inferSelect;

export type PairResult =
  | { ok: true; deviceId: string; token: string }
  | { ok: false; code: 'pairing-secret-mismatch' };

export async function pairDevice(
  db: Db,
  expectedSecret: string,
  presentedSecret: string,
  now: number
): Promise<PairResult> {
  if (!secretMatches(expectedSecret, presentedSecret)) {
    return { ok: false, code: 'pairing-secret-mismatch' };
  }
  const deviceId = `dev_${randomBytes(8).toString('hex')}`;
  const token = `at_${randomBytes(32).toString('hex')}`;
  await db.insert(devices).values({
    id: deviceId,
    tokenSha256: sha256Hex(token),
    createdAt: now,
  });
  return { ok: true, deviceId, token };
}

// Bearer 校验：按 sha256(token) 查库（库里无明文，等价于恒定内容比对），未认证返回 null
export async function verifyBearer(
  db: Db,
  authorization: string | undefined
): Promise<DeviceRow | null> {
  if (authorization === undefined || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (token === '') return null;
  const rows = await db.select().from(devices).where(eq(devices.tokenSha256, sha256Hex(token)));
  return rows.at(0) ?? null;
}
