// App 级偏好的读写用例（migration 001 的 app_settings 表）。
//
// 这里是键名、类型与默认值的**单一事实源**：仓储只认字符串，调用方只认这里
// 导出的函数，中间没有第三个地方需要知道 'appearance.mode' 长什么样。
//
// 默认值的选取原则：读不到 / 读坏了一律回落到「与老用户行为一致」的那个值。
// 例如 hapticsEnabled 默认 true——触感一直是开的，加开关不该改变既有手感。

import {
  parseLanguagePreference,
  type LanguagePreference,
} from '@/core/i18n';

import { getRepositories } from './db';

const KEYS = {
  hapticsEnabled: 'haptics.enabled',
  appearance: 'appearance.mode',
  language: 'language.preference',
} as const;

/** 外观三档。'system' 表示不覆盖，跟随 iOS 的深浅色。 */
export type AppearanceMode = 'system' | 'light' | 'dark';

export type { LanguagePreference };

/** UI 可读写的全部偏好；新增开关时同时扩这里与 DEFAULTS */
export type AppSettings = {
  hapticsEnabled: boolean;
  appearance: AppearanceMode;
  /** 界面语言档位。'system' = 跟随设备语言，解析在 core/i18n 的 resolveLocale */
  language: LanguagePreference;
};

const DEFAULTS: AppSettings = {
  hapticsEnabled: true,
  appearance: 'system',
  language: 'system',
};

/** 只认严格的 'true' / 'false'；其它一切（含历史脏值）回落默认，不抛错。 */
function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** 只认三个枚举字面量；历史脏值 / 未来版本写入的新档位一律回落「跟随系统」。 */
export function parseAppearanceMode(raw: string | undefined): AppearanceMode {
  if (raw === 'system' || raw === 'light' || raw === 'dark') return raw;
  return DEFAULTS.appearance;
}

/**
 * 触感开关的**同步**快照。
 *
 * WHY 必须同步：触感发生在手指按下的那一瞬（onPressIn），等一次 await 回来
 * 震动就已经晚于按压反馈、变成一次莫名其妙的迟到震动。所以开关值在进程内
 * 缓存一份，读它不碰数据库。
 *
 * 缓存的写入者只有两个：loadAppSettings（启动预热与设置页读取）与
 * setHapticsEnabled（用户当场切换）。缓存没预热到之前用默认值 true——
 * 与「没有这个开关时」的手感一致，最坏结果是关掉开关后极早期的一次按压仍会震。
 */
let hapticsEnabledCache = DEFAULTS.hapticsEnabled;

export function isHapticsEnabledSync(): boolean {
  return hapticsEnabledCache;
}

export async function loadAppSettings(): Promise<AppSettings> {
  const repos = await getRepositories();
  const raw = await repos.settings.getAll();
  const settings: AppSettings = {
    hapticsEnabled: parseBool(raw[KEYS.hapticsEnabled], DEFAULTS.hapticsEnabled),
    appearance: parseAppearanceMode(raw[KEYS.appearance]),
    language: parseLanguagePreference(raw[KEYS.language]),
  };
  // 顺手预热同步缓存：启动时读一次外观偏好，触感开关就一并到位，不必再读一遍库
  hapticsEnabledCache = settings.hapticsEnabled;
  return settings;
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  // 先更新同步缓存再落库：用户拨完开关的下一次按压就该按新设置走，
  // 不该等这次写盘回来。写盘失败时缓存与库不一致，但下次冷启动会自愈。
  hapticsEnabledCache = enabled;
  const repos = await getRepositories();
  await repos.settings.set(KEYS.hapticsEnabled, enabled ? 'true' : 'false');
}

export async function getAppearanceMode(): Promise<AppearanceMode> {
  const repos = await getRepositories();
  return parseAppearanceMode(await repos.settings.get(KEYS.appearance));
}

export async function setAppearanceMode(mode: AppearanceMode): Promise<void> {
  const repos = await getRepositories();
  await repos.settings.set(KEYS.appearance, mode);
}

/**
 * 界面语言档位。与外观同构：读失败回落 'system'。
 *
 * 单独一个函数而不是让调用方走 loadAppSettings：语言在**启动最早期**就要读到
 * （hooks/use-locale 在模块求值时发起），那时不该顺带把别的偏好也解析一遍。
 */
export async function getLanguagePreference(): Promise<LanguagePreference> {
  try {
    const repos = await getRepositories();
    return parseLanguagePreference(await repos.settings.get(KEYS.language));
  } catch {
    return DEFAULTS.language;
  }
}

export async function setLanguagePreference(preference: LanguagePreference): Promise<void> {
  const repos = await getRepositories();
  await repos.settings.set(KEYS.language, preference);
}
