// 仓储契约：core 只定义形状，实现放在 src/infrastructure/db/**，
// 由 src/application/db.ts 组装成单例（依赖方向：infrastructure → core）。
//
// 模板只带一张 app_settings KV 表的仓储；新 App 的每张业务表都照这个样子
// 先在这里定义契约、再去 infrastructure 写实现。

export type AppSettingsRepository = {
  get: (key: string) => Promise<string | undefined>;
  /** 全量读取，给「一次性拿齐所有偏好」的启动路径用 */
  getAll: () => Promise<Record<string, string>>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};
