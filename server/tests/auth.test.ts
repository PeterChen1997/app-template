// 认证：healthz、配对流程、错误密钥、错误 token 401、token 只存哈希不回明文、Bearer 全局强制。
// 运行：pnpm exec tsx tests/auth.test.ts

import { createHash } from 'node:crypto';
import { check, expectEq, field, makeApp, pairToken, summary, TEST_SECRET } from './helpers.js';
import { devices } from '../src/db.js';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

async function main(): Promise<void> {
  const FIXED_NOW = 1_700_000_000_000;
  const { app, db } = await makeApp({ now: () => FIXED_NOW });

  // healthz 免鉴权
  const health = await app.inject({ method: 'GET', url: '/healthz' });
  expectEq('healthz 200', health.statusCode, 200);
  expectEq('healthz body', health.json(), { ok: true });

  // 错误配对密钥 → 403
  const badSecret = await app.inject({
    method: 'POST',
    url: '/v1/auth/pair',
    payload: { pairingSecret: 'wrong-secret' },
  });
  expectEq('错误密钥 403', badSecret.statusCode, 403);
  expectEq('错误密钥错误码', field(badSecret.json(), 'error'), 'pairing-secret-mismatch');

  // 缺字段 → 400
  const noSecret = await app.inject({ method: 'POST', url: '/v1/auth/pair', payload: {} });
  expectEq('配对缺字段 400', noSecret.statusCode, 400);

  // 配对成功：拿到 deviceId + token
  const { deviceId, token } = await pairToken(app);
  check('token 前缀 at_', token.startsWith('at_'), token.slice(0, 8));
  check('deviceId 前缀 dev_', deviceId.startsWith('dev_'), deviceId);

  // 红线验证：库里只有 sha256，永远查不回明文
  const rows = await db.select().from(devices);
  expectEq('devices 一行', rows.length, 1);
  const row = rows.at(0);
  check('库里存的是 sha256(token)', row !== undefined && row.tokenSha256 === sha256Hex(token));
  check('库里没有 token 明文', row !== undefined && row.tokenSha256 !== token);
  check('时钟注入生效', row !== undefined && row.createdAt === FIXED_NOW);

  // whoami
  const who = await app.inject({
    method: 'GET',
    url: '/v1/auth/whoami',
    headers: { authorization: `Bearer ${token}` },
  });
  expectEq('whoami 200', who.statusCode, 200);
  expectEq('whoami deviceId', field(who.json(), 'deviceId'), deviceId);
  expectEq('whoami createdAt', field(who.json(), 'createdAt'), FIXED_NOW);

  // 错误 token → 401
  const badToken = await app.inject({
    method: 'GET',
    url: '/v1/auth/whoami',
    headers: { authorization: 'Bearer at_deadbeef' },
  });
  expectEq('错误 token 401', badToken.statusCode, 401);

  // Bearer 全局强制：无 token 访问受保护端点全部 401
  for (const probe of [
    { method: 'GET' as const, url: '/v1/auth/whoami' },
    { method: 'PUT' as const, url: '/v1/entities/e1' },
    { method: 'GET' as const, url: '/v1/entities/e1' },
  ]) {
    const res = await app.inject({ method: probe.method, url: probe.url, payload: {} });
    expectEq(`无 token ${probe.method} ${probe.url} 401`, res.statusCode, 401);
  }

  // 二次配对 = 新设备新 token（多设备场景）
  const second = await pairToken(app);
  check('第二个 token 是新的', second.token !== token);
  check('第二个 deviceId 是新的', second.deviceId !== deviceId);

  await app.close();
  summary('auth.test');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
