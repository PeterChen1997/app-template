// migrations.ts 的回归测试：SQL 真的在一条真 SQLite 上执行（见 tests/helpers/sqlite-test-db.ts）。
//
// 这里钉的是数据完整性的地基，每条用例对应一个「破了就会丢用户数据」的不变量，
// 而不是「函数被调用过」。版本记录用的是 PRAGMA user_version（模板定版决策，
// 见 migrations.ts 文件头），断言也直接读它。

import { CONNECTION_PRAGMAS } from '@/infrastructure/db/database';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  SchemaTooNewError,
  runMigrations,
} from '@/infrastructure/db/migrations';

import {
  columnNames,
  createTestDatabase,
  scalarNumber,
  tableNames,
  type TestDatabase,
} from '../helpers/sqlite-test-db';

// database.ts 只为了拿到生产用的 PRAGMA 常量；它 import 的原生模块在 node 里加载不了。
// 工厂 mock 不会真的去 require 这两个模块，本用例也不碰它们的任何导出。
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sqlite', () => ({}));

/** 与 openAppDatabase 一致：新连接先设连接级 PRAGMA，再迁移 */
function openBlank(): TestDatabase {
  const db = createTestDatabase();
  db.raw.exec(CONNECTION_PRAGMAS);
  return db;
}

describe('空库跑完全部迁移', () => {
  test('建出全部表，并把 user_version 推到 LATEST_SCHEMA_VERSION', async () => {
    const db = openBlank();
    // user_version 的起点是 0——这是「读版本不需要前置建表」的全部前提
    expect(scalarNumber(db, 'PRAGMA user_version')).toBe(0);

    await runMigrations(db);

    // 少一张表 = 某条业务读写在真机上必炸，这里必须逐个点名
    expect(tableNames(db)).toEqual(expect.arrayContaining(['app_settings']));
    expect(columnNames(db, 'app_settings')).toEqual(['key', 'updated_at', 'value']);
    expect(scalarNumber(db, 'PRAGMA user_version')).toBe(LATEST_SCHEMA_VERSION);
  });

  test('MIGRATIONS 按 version 严格递增（只追加纪律的形状检查）', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.at(0)).toBe(1);
  });
});

describe('幂等与增量', () => {
  test('连跑两次不报错、不重复应用（CREATE TABLE 没有 IF NOT EXISTS，重复应用必炸）', async () => {
    const db = openBlank();
    await runMigrations(db);
    db.raw.run('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'appearance.mode',
      'dark',
      0,
    ]);

    await expect(runMigrations(db)).resolves.toBeUndefined();

    // 再跑一遍不能动用户数据
    expect(scalarNumber(db, 'SELECT COUNT(*) FROM app_settings')).toBe(1);
    expect(scalarNumber(db, 'PRAGMA user_version')).toBe(LATEST_SCHEMA_VERSION);
  });
});

describe('单个 migration 的事务性', () => {
  test('语句失败 → 整体回滚，user_version 不推进（可恢复的前提）', async () => {
    const db = openBlank();
    // 先占掉表名，让 migration 001 的 CREATE TABLE 必然失败
    db.raw.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY)');

    await expect(runMigrations(db)).rejects.toThrow(/app_settings/);

    // 版本号没写 = 下次启动会重跑；user_version 的写入随事务回滚，这条断言钉住它
    expect(scalarNumber(db, 'PRAGMA user_version')).toBe(0);
  });
});

describe('降级安装的检测', () => {
  test('库版本高于代码 → 抛 SchemaTooNewError 而不是静默跳过', async () => {
    const db = openBlank();
    db.raw.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`);

    await expect(runMigrations(db)).rejects.toThrow(SchemaTooNewError);

    // 错误里要带得出两个版本号，UI 才说得清「升级 App」而不是「重建数据库」
    const error: unknown = await runMigrations(db).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaTooNewError);
    if (error instanceof SchemaTooNewError) {
      expect(error.applied).toBe(LATEST_SCHEMA_VERSION + 1);
      expect(error.supported).toBe(LATEST_SCHEMA_VERSION);
    }
  });

  test('库版本恰好等于代码支持的最高版本 → 正常放行', async () => {
    const db = openBlank();
    await runMigrations(db);

    await expect(runMigrations(db)).resolves.toBeUndefined();
  });
});
