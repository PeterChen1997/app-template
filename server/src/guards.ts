// 运行时类型守卫 —— 规范：未知结构（req.body / req.params / JSON.parse）禁止 as 断言，一律窄化。

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function getString(v: unknown, key: string): string | null {
  if (!isRecord(v)) return null;
  const value = v[key];
  return typeof value === 'string' ? value : null;
}

export function getNumber(v: unknown, key: string): number | null {
  if (!isRecord(v)) return null;
  const value = v[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getRecord(v: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(v)) return null;
  const value = v[key];
  return isRecord(value) ? value : null;
}

// ---- 请求体守卫 ----

export type PairBody = { pairingSecret: string };

export function isPairBody(v: unknown): v is PairBody {
  return getString(v, 'pairingSecret') !== null;
}

// jsonb 透传：payload 允许对象/数组/标量，但拒绝顶层 null ——
// drizzle 会把 JS null 映射成 SQL NULL（而非 jsonb 'null'），撞 NOT NULL 约束变 500；
// 在守卫层拒掉，400 比 500 诚实。
export type EntityPutBody = { payload: unknown };

export function isEntityPutBody(v: unknown): v is EntityPutBody {
  return isRecord(v) && 'payload' in v && v['payload'] !== null && v['payload'] !== undefined;
}
