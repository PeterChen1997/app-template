// 结构化日志：内存 ring buffer（供调试页回看）+ console 输出。
//
// ⚠️ 硬规则（§9 脱敏要求）：
// 1. **禁止把 prompt / response 正文、消息内容、附件 base64 传入 logger**。
//    正文只允许留在 DB 与内存态，日志里最多记长度、条数、模型名等元信息。
// 2. 任何 message 与 meta 值在写入 ring buffer 与 console 之前一律先过 redact，
//    脱敏是最后一道防线而不是唯一一道 —— 调用方仍有责任不传敏感数据。
// 3. 本模块纯 TS，不依赖 expo/react-native，便于 jest 直接测试脱敏行为。

import { isRecord } from '@/core/domain/guards';
import { redactText } from '@/core/security/redact';

export { redactText };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogMeta = Record<string, unknown>;

export type LogEntry = {
  /** epoch ms */
  at: number;
  level: LogLevel;
  /** 模块标签，如 'llm.stream' / 'db.migrate' */
  tag: string;
  /** 已脱敏 */
  message: string;
  /** 已脱敏 */
  meta?: LogMeta;
};

/** ring buffer 容量：够看一次完整会话的时间线，又不至于长期驻留内存。 */
const RING_CAPACITY = 500;

/** meta 嵌套遍历深度上限，防御环状引用与超深对象。 */
const MAX_META_DEPTH = 4;

const ring: LogEntry[] = [];

// ── 脱敏 ────────────────────────────────────────────────────────────────────
// 文本级规则统一在 core/security/redact.ts（errors.ts 同用一份），此处只保留 meta 递归。

/** 键名命中即整值替换，不看值形态。 */
const SECRET_KEY_NAME = /key|token|secret|authorization/i;

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === null || value === undefined) return value;
  if (depth >= MAX_META_DEPTH) return '[depth-limit]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (isRecord(value)) return redactRecord(value, depth + 1);
  // function / symbol / bigint 等：不猜测其序列化形态，直接丢弃。
  return '[unloggable]';
}

function redactRecord(record: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    out[key] = SECRET_KEY_NAME.test(key) ? '***' : redactValue(record[key], depth);
  }
  return out;
}

/** 对 meta 做递归脱敏。导出以便测试。 */
export function redactMeta(meta: LogMeta): LogMeta {
  return redactRecord(meta, 0);
}

// ── 写入 ────────────────────────────────────────────────────────────────────

function pushToConsole(entry: LogEntry): void {
  const line = `[${entry.tag}] ${entry.message}`;
  if (entry.meta === undefined) {
    if (entry.level === 'debug') console.debug(line);
    else if (entry.level === 'info') console.info(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.error(line);
    return;
  }
  if (entry.level === 'debug') console.debug(line, entry.meta);
  else if (entry.level === 'info') console.info(line, entry.meta);
  else if (entry.level === 'warn') console.warn(line, entry.meta);
  else console.error(line, entry.meta);
}

function write(level: LogLevel, tag: string, message: string, meta?: LogMeta): void {
  const entry: LogEntry = {
    at: Date.now(),
    level,
    tag,
    message: redactText(message),
    meta: meta === undefined ? undefined : redactMeta(meta),
  };
  ring.push(entry);
  if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
  pushToConsole(entry);
}

export const log = {
  debug: (tag: string, message: string, meta?: LogMeta): void => write('debug', tag, message, meta),
  info: (tag: string, message: string, meta?: LogMeta): void => write('info', tag, message, meta),
  warn: (tag: string, message: string, meta?: LogMeta): void => write('warn', tag, message, meta),
  error: (tag: string, message: string, meta?: LogMeta): void => write('error', tag, message, meta),
};

/** 供调试页展示：返回最近的日志（副本，按时间升序）。 */
export function getRecentLogs(limit: number = RING_CAPACITY): readonly LogEntry[] {
  if (limit >= ring.length) return ring.slice();
  return ring.slice(ring.length - limit);
}

/** 清空 ring buffer（调试页「清空日志」按钮与测试用例复用）。 */
export function clearLogs(): void {
  ring.length = 0;
}
