// Repository 单例组装：UI/feature 层从这里拿仓储，不直接触碰 infrastructure/db。
//
// 模板只有 app_settings 一张表；新 App 的每个仓储都在 Repositories 里加一项、
// 在 assembleRepositories 里接上实现即可。

import type { AppSettingsRepository } from '@/core/domain/repositories';
import {
  getAppDatabase,
  rebuildAppDatabase,
  type DatabaseRebuildResult,
} from '@/infrastructure/db/database';
import { createAppSettingsRepository } from '@/infrastructure/db/settings-repository';

type Repositories = {
  settings: AppSettingsRepository;
};

let cached: Promise<Repositories> | undefined;

function assembleRepositories(): Promise<Repositories> {
  const pending = (async () => {
    const db = await getAppDatabase();
    return {
      settings: createAppSettingsRepository(db),
    };
  })().catch((error: unknown) => {
    // 与 getAppDatabase 一样不缓存失败态：database.ts 特意留了重试的余地，
    // 这里若把被拒绝的 Promise 缓存下来，一次瞬时的 database is locked
    // 就会让整个进程再也拿不到任何仓储，等于把可恢复的错误变成不可恢复的。
    if (cached === pending) cached = undefined;
    throw error;
  });
  return pending;
}

export function getRepositories(): Promise<Repositories> {
  cached ??= assembleRepositories();
  return cached;
}

/**
 * 数据库损坏后的重建入口（UI 从这里调，不直接碰 infrastructure）。
 *
 * 仓储实例是绑在具体连接上的，重建换了连接就必须重新组装——先丢缓存再重建：
 * rebuild 的第一步就是关掉旧连接，即使后面失败，缓存里那套绑在已关闭句柄上的
 * 仓储也已经不能用了。
 */
export function rebuildDatabase(): Promise<DatabaseRebuildResult> {
  cached = undefined;
  return rebuildAppDatabase();
}
