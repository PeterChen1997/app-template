// 数据层测试用的**真** SQLite。
//
// 为什么需要它：src/infrastructure/db/** 依赖 expo-sqlite，而 expo-sqlite 是原生模块，
// jest 的 node 环境既加载不了、也无法伪造出完整形状。用一个只记录调用的假 db 去测迁移
// 毫无价值——「execAsync 被调用了 17 次」发现不了 SQL 语法写错、外键删除顺序写反、
// 索引建在不存在的列上，而这几样正是数据完整性最容易翻车的地方。
//
// 于是这里用 node-sqlite3-wasm 实现 `SqlDatabase` 契约，让 migration 的 SQL 真的在一个
// 真 SQLite 上执行。选它而不是 better-sqlite3：
// - 纯 WASM，pnpm install 不需要 node-gyp 编译，CI / 换机器不会因为原生编译失败；
// - better-sqlite3 当前版本 engines 要求 node >= 22，开发机常见 node 20，实测直接段错误；
// - 它编译进了 FTS5 与 trigram 分词器——将来 migration 里出现中文全文检索
//   （CREATE VIRTUAL TABLE ... USING fts5(tokenize='trigram')）也照样测得动。
//
// 与真机的已知差异（别在这里假装测到了这些）：
// - `:memory:` 库不支持 WAL，journal_mode 会回落成 memory，WAL 相关行为不在这里验证；
// - expo-sqlite 的原生错误对象形状与本驱动不同，错误分类用构造出来的错误单独覆盖。

import type { SQLiteBindParams, SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';
import { Database } from 'node-sqlite3-wasm';

import type { SqlDatabase } from '@/infrastructure/db/database';

/** 底层驱动认得的绑定值；测试直接用 db.raw 写数据时也用它 */
export type BindValue = boolean | number | bigint | string | Uint8Array | null;

type WasmBindValue = BindValue;

function toWasmValue(value: SQLiteBindValue): WasmBindValue {
  // expo 的 blob 允许 ArrayBuffer，驱动只认 Uint8Array
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

function toWasmParams(params: SQLiteBindParams): WasmBindValue[] | Record<string, WasmBindValue> {
  if (Array.isArray(params)) return params.map(toWasmValue);
  const out: Record<string, WasmBindValue> = {};
  for (const key of Object.keys(params)) {
    // noUncheckedIndexedAccess：Object.keys 保证键存在，undefined 只是类型层面的幽灵
    const value = params[key];
    if (value !== undefined) out[key] = toWasmValue(value);
  }
  return out;
}

/**
 * 每个 await 都插一个真正的微任务边界。
 * 事务串行化的测试靠它才有意义：没有边界，两个"并发"事务其实是顺序跑完的，
 * 测试会永远绿而不管 withSerializedTransaction 还在不在。
 */
async function tick(): Promise<void> {
  await Promise.resolve();
}

export type TestDatabase = SqlDatabase & {
  closeAsync(): Promise<void>;
  /** 底层驱动。断言用同步查询，避免走被测代码自己的读路径来验证被测代码 */
  readonly raw: Database;
};

export function createTestDatabase(filename: string = ':memory:'): TestDatabase {
  const raw = new Database(filename);

  return {
    raw,

    async execAsync(source) {
      await tick();
      raw.exec(source);
    },

    async runAsync(source, params): Promise<SQLiteRunResult> {
      await tick();
      const result = raw.run(source, toWasmParams(params));
      // 驱动的 lastInsertRowid 可能是 bigint，expo 契约是 number
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },

    async getFirstAsync(source, params): Promise<unknown> {
      await tick();
      return raw.get(source, toWasmParams(params));
    },

    async getAllAsync(source, params): Promise<unknown[]> {
      await tick();
      return raw.all(source, toWasmParams(params));
    },

    async withTransactionAsync(task) {
      // 刻意复刻 expo-sqlite 的行为：BEGIN/COMMIT 直接打在同一条连接上，
      // 所以两个事务交叠时第二个 BEGIN 会真的抛
      // "cannot start a transaction within a transaction"——
      // withSerializedTransaction 要防的就是这个，这里必须让它可复现。
      await tick();
      raw.exec('BEGIN');
      try {
        await task();
      } catch (error: unknown) {
        // 某些错误 SQLite 已经自动回滚过，此时 ROLLBACK 会再抛
        // "no transaction is active"——不能让它盖掉真正的原因
        try {
          raw.exec('ROLLBACK');
        } catch {
          // 已经回滚过，忽略
        }
        throw error;
      }
      raw.exec('COMMIT');
    },

    async closeAsync() {
      await tick();
      raw.close();
    },
  };
}

/** sqlite_master 里存在的表名（含虚拟表） */
export function tableNames(db: TestDatabase): string[] {
  return objectNames(db, 'table');
}

export function indexNames(db: TestDatabase): string[] {
  return objectNames(db, 'index');
}

function objectNames(db: TestDatabase, type: string): string[] {
  const rows = db.raw.all('SELECT name FROM sqlite_master WHERE type = ?', [type]);
  const names: string[] = [];
  for (const row of rows) {
    const name = row.name;
    if (typeof name === 'string') names.push(name);
  }
  return names.sort();
}

/** PRAGMA table_info 的列名清单 */
export function columnNames(db: TestDatabase, table: string): string[] {
  const rows = db.raw.all(`PRAGMA table_info(${table})`);
  const names: string[] = [];
  for (const row of rows) {
    const name = row.name;
    if (typeof name === 'string') names.push(name);
  }
  return names.sort();
}

/** `SELECT <expr>` 只取一个数字，取不到就让测试炸掉而不是静默返回 0 */
export function scalarNumber(db: TestDatabase, sql: string): number {
  const row = db.raw.get(sql);
  if (row === null) throw new Error(`查询无结果：${sql}`);
  const values = Object.values(row);
  const value = values.at(0);
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  throw new Error(`查询结果不是数字：${sql}`);
}
