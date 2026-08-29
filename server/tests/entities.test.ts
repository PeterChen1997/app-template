// 示例受保护端点：entities jsonb 透传 —— 鉴权强制、upsert 幂等、payload 原样回读、404。
// 运行：pnpm exec tsx tests/entities.test.ts

import { check, expectEq, field, makeApp, pairToken, summary } from './helpers.js';

async function main(): Promise<void> {
  const { app } = await makeApp();
  const { token } = await pairToken(app);
  const auth = { authorization: `Bearer ${token}` };

  // 无 token → 401（受保护端点为什么重要：模板默认「新路由即受保护」）
  const anon = await app.inject({
    method: 'PUT',
    url: '/v1/entities/e1',
    payload: { payload: { title: 'x' } },
  });
  expectEq('无 token PUT 401', anon.statusCode, 401);

  // 写入
  const payload = { title: '示例', tags: ['a', 'b'], nested: { n: 1 } };
  const put = await app.inject({
    method: 'PUT',
    url: '/v1/entities/e1',
    headers: auth,
    payload: { payload },
  });
  expectEq('PUT 200', put.statusCode, 200);
  expectEq('PUT 回显 id', field(put.json(), 'id'), 'e1');

  // 原样回读（jsonb 透传：服务端不理解也不改写 payload）
  const get = await app.inject({ method: 'GET', url: '/v1/entities/e1', headers: auth });
  expectEq('GET 200', get.statusCode, 200);
  expectEq('payload 原样回读', field(get.json(), 'payload'), payload);

  // upsert：同 id 再写覆盖
  const put2 = await app.inject({
    method: 'PUT',
    url: '/v1/entities/e1',
    headers: auth,
    payload: { payload: { title: '改写' } },
  });
  expectEq('二次 PUT 200', put2.statusCode, 200);
  const get2 = await app.inject({ method: 'GET', url: '/v1/entities/e1', headers: auth });
  expectEq('覆盖后回读', field(get2.json(), 'payload'), { title: '改写' });

  // 顶层 null 被守卫拒绝（drizzle 会把 JS null 映成 SQL NULL 撞约束，守卫层 400 而非 500）
  const putNull = await app.inject({
    method: 'PUT',
    url: '/v1/entities/e2',
    headers: auth,
    payload: { payload: null },
  });
  expectEq('payload=null 400', putNull.statusCode, 400);
  const badBody = await app.inject({
    method: 'PUT',
    url: '/v1/entities/e3',
    headers: auth,
    payload: { nope: 1 },
  });
  expectEq('缺 payload 键 400', badBody.statusCode, 400);

  // 不存在的 id → 404
  const missing = await app.inject({ method: 'GET', url: '/v1/entities/nope', headers: auth });
  expectEq('不存在 404', missing.statusCode, 404);

  check('健全性：token 拿到了', token.length > 10);

  await app.close();
  summary('entities.test');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
