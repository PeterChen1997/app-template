// 数据库迁移：单向、只追加。
//
// 迁移纪律：
// 1. migration 一旦发布就不可修改，只能追加新版本；
// 2. 版本记录（PRAGMA user_version）只前进不后退；
// 3. 每个 migration 的全部语句在同一事务内执行，失败整体回滚。
//
// ── 版本记录为什么用 PRAGMA user_version 而不是一张 schema_migrations 表 ──────
//
// 这是模板的定版决策。表方案有一个自举怪圈：读版本之前必须先把版本表建出来
// （CREATE TABLE IF NOT EXISTS 幂等执行），也就是「迁移机制自己有一条不属于任何
// migration 的 DDL」。user_version 是 SQLite 文件头里自带的一个 32 位整数，
// 空库天然是 0，读它不需要任何前置建表；写入又是事务性的（随事务回滚），
// 正好满足「语句全部成功才推进版本」。代价是丢掉每个版本的 applied_at 时间戳——
// 模板认为这个审计信息不值一张表 + 一个自举例外。
//
// 注意：`PRAGMA journal_mode = WAL` / `PRAGMA foreign_keys = ON` 不放在 migration 里。
// journal_mode 属于连接级设置且**不能在事务内切换**（SQLite 会直接报错），
// foreign_keys 也是连接级开关、不随数据库文件持久化。
// 二者统一由 database.ts 在每次打开连接时设置。

import type { SQLiteBindParams, SQLiteRunResult } from 'expo-sqlite';

/**
 * 数据层真正用到的数据库句柄契约（expo-sqlite `SQLiteDatabase` 的子集）。
 *
 * 为什么不直接用 `SQLiteDatabase`：它是个几十个方法的原生对象，jest 的 node 环境
 * 既加载不了 expo-sqlite 也伪造不出完整形状。于是迁移测试只能退化成「断言
 * execAsync 被调用过」——那种测试发现不了 SQL 语法写错、外键删除顺序写反、
 * 索引建在不存在的列上。收窄成这五个方法后，测试可以塞进一个真的 SQLite
 * （见 tests/helpers/sqlite-test-db.ts），让 migration 的 SQL 真的被执行。
 * `SQLiteDatabase` 仍然满足这个契约，生产路径零变化。
 *
 * 契约放在 migrations.ts 而不是 database.ts：database.ts 依赖本文件，
 * 反向 import 会形成循环；database.ts 会把这个类型再导出一次，调用方从那里取。
 *
 * 查询结果一律是 `unknown` 而不是泛型 `T`：本仓库的行映射本来就要求每一列都过
 * guards 收窄，泛型只会给出「已经收窄过」的错觉。
 */
export type SqlDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SQLiteBindParams): Promise<SQLiteRunResult>;
  getFirstAsync(source: string, params: SQLiteBindParams): Promise<unknown>;
  getAllAsync(source: string, params: SQLiteBindParams): Promise<unknown[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export type Migration = {
  version: number;
  statements: string[];
};

// migration 001：App 级偏好的键值表。
//
// 为什么要一张表而不是 SecureStore / 文件：这些值（外观偏好、语言、触感开关）
// 既不是凭据也不值得各自一张表，而且它们应该「删 App 一起消失」。
// 一张两列表是最小够用的形状；有了它，以后加一个开关不用再动 schema。
//
// 取值一律存字符串：SQLite 无布尔类型，与其在每个调用点判断 0/1/'true'，
// 不如把序列化收敛到 application/app-settings.ts 一处。
const MIGRATION_001_STATEMENTS: string[] = [
  `CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`,
];

/** 全部迁移，按 version 升序。发布过的条目不许改，只许在后面追加。 */
export const MIGRATIONS: Migration[] = [{ version: 1, statements: MIGRATION_001_STATEMENTS }];

/** 当前代码认识的最高 schema 版本；用于识别「装了新版又降级回来」的库。 */
export const LATEST_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);

/**
 * 库比代码新时抛的错。
 *
 * 没有 down migration 是有意的取舍（移动端几乎不降级，写 down 的成本远大于收益），
 * 但「没有回滚路径」不等于「可以装作没发生」：降级安装时 pending 为空，迁移会
 * 静默跳过，然后旧代码去读一个多了若干列的库——SQLite 宽容，多半跑得起来，
 * 那是碰巧没事，不是设计上安全。宁可在这里明确失败。
 */
export class SchemaTooNewError extends Error {
  constructor(
    readonly applied: number,
    readonly supported: number,
  ) {
    super(`数据库 schema 版本 ${applied} 高于本版 App 支持的 ${supported}`);
    this.name = 'SchemaTooNewError';
  }
}

/** 读取 PRAGMA user_version；空库天然是 0，不需要任何前置建表 */
async function readAppliedVersion(db: SqlDatabase): Promise<number> {
  const row: unknown = await db.getFirstAsync('PRAGMA user_version', []);
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return 0;
  const v: unknown = 'user_version' in row ? row.user_version : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * 按序执行所有未应用的 migration。
 * 每个 migration 单独一个事务：语句全部成功才推进 user_version，否则整体回滚
 * （user_version 存在数据库文件头里，写入随事务一起回滚，这是选它的前提之一）。
 */
export async function runMigrations(db: SqlDatabase): Promise<void> {
  const applied = await readAppliedVersion(db);

  // 大声失败：库比代码新 = 用户降级安装了旧包。继续跑只是「碰巧没崩」。
  if (applied > LATEST_SCHEMA_VERSION) {
    throw new SchemaTooNewError(applied, LATEST_SCHEMA_VERSION);
  }

  const pending = MIGRATIONS.filter((m) => m.version > applied).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      // PRAGMA 不支持参数绑定；version 来自上面的常量表，不是外部输入
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
