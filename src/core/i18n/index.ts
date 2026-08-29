// 语言目录注册表。
//
// **下面那句 `Record<Locale, Catalog>` 是整个 i18n 的形状守卫**：
// Catalog 取自 zh-Hans 的模块命名空间类型，任何一门语言少一个键、多一个键、
// 或者插值函数签名对不上，tsc 在这里当场报错。所以：
//   * zh-Hans.ts 里**不能写 `as const`**（字面量类型会让别的语言无法赋值）；
//   * 新增文案先加 zh-Hans，tsc 会立刻指着别的目录说缺了什么。

import * as en from './en';
import * as zhHans from './zh-Hans';

import type { Locale } from './locale';

/** 一门语言的全部 UI 文案。形状由 zh-Hans.ts 定义。 */
export type Catalog = typeof zhHans;

export const catalogs: Record<Locale, Catalog> = {
  'zh-Hans': zhHans,
  en,
};

export {
  FALLBACK_LOCALE,
  localeFromLanguageTag,
  parseLanguagePreference,
  resolveLocale,
  type LanguagePreference,
  type Locale,
} from './locale';
