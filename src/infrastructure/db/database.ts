// 应用数据库连接：打开 app.db、设置连接级 PRAGMA、执行迁移，
// 并把「打不开」分成两类错误交给上层决定出路（重试 / 重建）。
//
// 本文件属于 infrastructure 层：只负责分类与提供重建能力，不弹任何 UI。

import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { getString, isRecord } from '@/core/domain/guards';

import { SchemaTooNewError, runMigrations, type SqlDatabase } from './migrations';

export type { SqlDatabase } from './migrations';

export const DATABASE_NAME = 'app.db';

/**
 * 连接级 PRAGMA。
 * - journal_mode=WAL：读写并发，且**不能在事务内切换**，所以不放进 migration。
 * - foreign_keys=ON：SQLite 默认关闭且不随文件持久化，每条连接都要显式开。
 * - busy_timeout：WAL 下仍可能短暂锁表，给 5s 重试窗口而不是立刻抛 database is locked。
 */
export const CONNECTION_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

// ── 打开失败的分类 ──────────────────────────────────────────────────────────
//
// 分类的意义：库损坏时用户其实**有救**（Keychain 里的凭据、可重建的配置都还在），
// 但只有在我们分得清「重试还有戏」和「文件回不来了」的前提下，
// 才敢把「重建数据库」这条会清空本地数据的路摆到人面前。

/** 文件级损坏：重试没有意义，只能重建（见 rebuildAppDatabase）。 */
export class DatabaseCorruptError extends Error {
  constructor(readonly cause: unknown) {
    super('本地数据库文件已损坏，无法打开');
    this.name = 'DatabaseCorruptError';
  }
}

/** 其它打开失败（多为瞬时：锁、IO 抖动、磁盘暂时满）。重试通常有效。 */
export class DatabaseOpenError extends Error {
  constructor(readonly cause: unknown) {
    super('本地数据库暂时无法打开');
    this.name = 'DatabaseOpenError';
  }
}

/**
 * SQLite 判定「这个文件不是 / 不再是一个合法数据库」时的说法（sqlite3_errmsg 原文）。
 *
 * 只匹配文本、不匹配错误码：expo-sqlite 在 iOS / Android 上抛的是各自平台包装过的
 * 异常，`code` 字段的形状（数字 11 / 字符串 'SQLITE_CORRUPT' / 干脆没有）并不稳定，
 * 而 errmsg 英文原文一定会出现在 message 里。
 *
 * 认不出来的一律当瞬时错误（见 classifyOpenError）：误判成「损坏」的代价是把
 * 「重建 = 清空本地数据」推到用户面前，比让人多重试一次严重得多。
 */
const CORRUPTION_SIGNATURES = [
  'database disk image is malformed', // SQLITE_CORRUPT
  'file is not a database', // SQLITE_NOTADB
  'file is encrypted or is not a database', // SQLITE_NOTADB 的另一种措辞
  'malformed database schema',
  'sqlite_corrupt',
  'sqlite_notadb',
];

/** 把任意抛出物摊平成可搜索的小写文本（原生错误未必是 Error 实例） */
function errorText(error: unknown): string {
  if (typeof error === 'string') return error.toLowerCase();
  if (!isRecord(error)) return '';
  const parts: string[] = [];
  const message = getString(error, 'message');
  if (message !== undefined) parts.push(message);
  const code = getString(error, 'code');
  if (code !== undefined) parts.push(code);
  return parts.join(' ').toLowerCase();
}

/** 这个打开失败是不是「文件已经坏了」 */
export function isDatabaseCorruption(error: unknown): boolean {
  const text = errorText(error);
  return CORRUPTION_SIGNATURES.some((signature) => text.includes(signature));
}

function classifyOpenError(error: unknown): Error {
  // 库比代码新不是「坏了」，出路完全相反（去升级 App，绝不能重建）。原样上抛。
  if (error instanceof SchemaTooNewError) return error;
  if (error instanceof DatabaseCorruptError || error instanceof DatabaseOpenError) return error;
  return isDatabaseCorruption(error) ? new DatabaseCorruptError(error) : new DatabaseOpenError(error);
}

/**
 * 打开一个全新的连接并跑完迁移。测试可传入 `:memory:` 之类的库名。
 *
 * 整段都在 try 里：SQLite 打开是惰性的，`openDatabaseAsync` 常常成功返回，
 * 直到第一条真正读页的语句（这里是 PRAGMA / 迁移）才报 malformed。
 * 只包住 openDatabaseAsync 会把绝大多数真损坏漏成裸错误。
 */
export async function openAppDatabase(databaseName: string = DATABASE_NAME): Promise<SQLiteDatabase> {
  try {
    const db = await openDatabaseAsync(databaseName);
    await db.execAsync(CONNECTION_PRAGMAS);
    await runMigrations(db);
    return db;
  } catch (error: unknown) {
    throw classifyOpenError(error);
  }
}

// 单例：整个 App 共用一条连接（WAL 下够用，避免多连接互相 lock）。
// 用 Promise 缓存而不是实例缓存，保证并发调用只会真正打开一次。
let databasePromise: Promise<SQLiteDatabase> | undefined;

function cacheOpen(databaseName: string): Promise<SQLiteDatabase> {
  const pending = openAppDatabase(databaseName).catch((error: unknown) => {
    // 打开失败不缓存失败态，下次调用可重试。
    // 瞬时失败（database is locked）全靠这一句才有第二次机会，别弄丢它。
    if (databasePromise === pending) databasePromise = undefined;
    throw error;
  });
  databasePromise = pending;
  return pending;
}

/** 获取进程内唯一的数据库连接（首次调用会打开并迁移） */
export function getAppDatabase(): Promise<SQLiteDatabase> {
  return databasePromise ?? cacheOpen(DATABASE_NAME);
}

// ── 损坏后的重建 ────────────────────────────────────────────────────────────

/**
 * 把损坏的库文件挪走的副作用，做成可注入的契约。
 *
 * 一是因为文件操作是这一层唯一的平台耦合（expo-file-system 在 node 里加载不了），
 * 二是「挪哪些文件、挪成什么名字」这几个不变量本身就该被测到。
 *
 * @returns 隔离后的主文件名（不含目录），供上层告诉用户「东西还在，只是搬走了」
 */
export type DatabaseQuarantine = (databaseName: string) => Promise<string>;

/** expo-sqlite 的默认库目录：<documentDirectory>/SQLite */
const DATABASE_DIRECTORY_NAME = 'SQLite';

/**
 * WAL 模式下一个库是三个文件：app.db / app.db-wal / app.db-shm。
 * 只挪主文件会留下与新库不配套的 -wal，SQLite 下次打开时按它去回放，
 * 等于把新建的空库也一起带坏——附属文件必须跟着走。
 */
const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm'];

/** 默认实现：同目录改名保留，不删除 */
export async function quarantineDatabaseFiles(databaseName: string): Promise<string> {
  const directory = new Directory(Paths.document, DATABASE_DIRECTORY_NAME);
  // 冒号在文件名里不通用，时间戳里的 : . 一律换成 -
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinedName = `${databaseName}.corrupt-${stamp}`;

  // 走到重建这一步，说明刚刚打开过它、判定它坏了——主文件必然在。
  // 找不到只可能是我们在错的目录里找（比如将来 expo-sqlite 换了默认位置）。
  // 这时候必须大声失败：静默跳过会让下一步"新建空库"原地打开那个损坏文件，
  // 用户看到的是"重建成功"然后一切照旧地坏着。
  if (!new File(directory, databaseName).exists) {
    throw new Error(`[db] 找不到待隔离的数据库文件：${directory.uri}`);
  }

  for (const suffix of DATABASE_FILE_SUFFIXES) {
    const source = new File(directory, `${databaseName}${suffix}`);
    // -wal / -shm 在正常关闭后并不存在，缺了不是错误
    if (!source.exists) continue;
    // 移动而不是删除：我们判定它坏了，不代表专业工具救不回来
    // （sqlite3 .recover 往往还能捞出大部分行）。用户可能想找人抢救。
    await source.move(new File(directory, `${quarantinedName}${suffix}`));
  }
  return quarantinedName;
}

export type DatabaseRebuildResult = {
  /** 损坏文件被改成的名字（不含目录） */
  quarantinedAs: string;
};

/**
 * 重建路径：断开旧连接 → 把损坏文件挪到一边保留 → 新建空库并迁移。
 *
 * 重建后立刻把新连接装回单例：否则调用方拿到「重建成功」，
 * 下一次 getAppDatabase() 却还要再走一遍打开流程，中间态没有意义。
 */
export async function rebuildAppDatabase(
  options: { databaseName?: string; quarantine?: DatabaseQuarantine } = {},
): Promise<DatabaseRebuildResult> {
  const databaseName = options.databaseName ?? DATABASE_NAME;
  const quarantine = options.quarantine ?? quarantineDatabaseFiles;

  // 先断开单例：损坏的连接可能还开着，不关就改名会留下野句柄。
  // 关不掉恰恰是最需要重建的情形，所以关闭失败一律忽略。
  await discardAppDatabase();

  const quarantinedAs = await quarantine(databaseName);
  await cacheOpen(databaseName);
  return { quarantinedAs };
}

/** 丢弃单例连接并尽力关闭；关闭失败不算失败 */
async function discardAppDatabase(): Promise<void> {
  const pending = databasePromise;
  databasePromise = undefined;
  if (pending === undefined) return;
  await pending.then((db) => db.closeAsync()).catch(() => undefined);
}

// ── 事务串行化 ──────────────────────────────────────────────────────────────
//
// expo-sqlite 的 withTransactionAsync 在同一连接上**不支持并发**：两个写事务
// 交叠时第二个 BEGIN 直接抛 "cannot start a transaction within a transaction"
//（chatme 实测踩中：两个业务写事务并行，收尾失败、数据卡死在中间态）。
// 所有业务写事务必须经这里排队；链条对失败免疫（catch 接续），
// 否则一次失败会永久阻塞后续所有事务。

let transactionChain: Promise<void> = Promise.resolve();

export function withSerializedTransaction(
  db: SqlDatabase,
  fn: () => Promise<void>,
): Promise<void> {
  const run = transactionChain.then(() => db.withTransactionAsync(fn));
  transactionChain = run.catch(() => undefined);
  return run;
}

/** 关闭单例连接（主要给测试与登出清理用） */
export async function closeAppDatabase(): Promise<void> {
  const pending = databasePromise;
  if (pending === undefined) return;
  databasePromise = undefined;
  const db = await pending;
  await db.closeAsync();
}
