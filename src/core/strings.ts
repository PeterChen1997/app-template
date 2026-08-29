// 当前语言的文案访问器。**非 React 调用方的唯一入口**。
//
// ── 为什么是可变的模块级状态 ────────────────────────────────────────────────
//
// 文案要在运行时随语言切换而变，而 application 层（providers.ts / tools.ts）
// 拿文案的地方是普通函数，没有 hook 可用。所以这里存一份「当前目录」，
// 读的时候现取——不是启动时快照一份，否则切完语言这些错误提示还是旧语言。
//
// React 组件**不要**用 getStrings()：它不会触发重渲染。组件走
// hooks/use-strings 的 useStrings()，那一层用 useSyncExternalStore 订阅同一份状态。
//
// 写入者只有一个：hooks/use-locale 的 applyLanguagePreference / 启动预热。
// core 不知道设备语言、也不知道数据库，它只负责「现在是哪本目录」。

import { catalogs, type Catalog, type Locale } from './i18n';

let currentLocale: Locale = 'zh-Hans';
let current: Catalog = catalogs[currentLocale];

/** 当前生效的语言。 */
export function getLocale(): Locale {
  return currentLocale;
}

/** 当前语言的全部文案。**每次调用都现取**，不要把返回值缓存到模块级常量里。 */
export function getStrings(): Catalog {
  return current;
}

/**
 * 切换目录。返回是否真的变了，调用方据此决定要不要广播。
 *
 * 幂等：切到同一门语言不算变化，避免无谓的全 App 重渲染。
 */
export function setLocale(locale: Locale): boolean {
  if (locale === currentLocale) return false;
  currentLocale = locale;
  current = catalogs[locale];
  return true;
}

export type { Catalog, Locale };
