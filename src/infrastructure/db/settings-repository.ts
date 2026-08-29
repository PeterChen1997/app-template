// AppSettingsRepository 的 SQLite 实现（migration 005 的 app_settings 表）。
//
// 刻意做得很薄：这里不认识任何具体的键，也不做类型转换——键名与默认值全部
// 收敛在 application/app-settings.ts，仓储换实现时上层零改动。

import type { AppSettingsRepository } from '@/core/domain/repositories';

import { getString, isRecord } from '@/core/domain/guards';

import type { SqlDatabase } from './database';

export function createAppSettingsRepository(db: SqlDatabase): AppSettingsRepository {
  return {
    async get(key) {
      const row: unknown = await db.getFirstAsync('SELECT value FROM app_settings WHERE key = ?', [
        key,
      ]);
      if (!isRecord(row)) return undefined;
      return getString(row, 'value');
    },

    async getAll() {
      const rows = await db.getAllAsync('SELECT key, value FROM app_settings', []);
      const result: Record<string, string> = {};
      for (const row of rows) {
        if (!isRecord(row)) continue;
        const key = getString(row, 'key');
        const value = getString(row, 'value');
        // 一行读坏不该让整份偏好读不出来——跳过它，其余照常返回
        if (key === undefined || value === undefined) continue;
        result[key] = value;
      }
      return result;
    },

    async set(key, value) {
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, Date.now()],
      );
    },

    async remove(key) {
      await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
    },
  };
}
