// 语言的类型与解析规则。纯 TS，零平台依赖——设备语言由 infrastructure 读出来
// 再传进这里的 resolveLocale，core 自己不碰任何原生 API。

/** App 真正能渲染出来的语言。加一门语言 = 这里加一项 + 加一个目录文件。 */
export type Locale = 'zh-Hans' | 'en';

/**
 * 用户在设置里选的档位。与外观三档同构：'system' 表示不覆盖、跟随设备。
 *
 * 为什么不直接存 Locale：存了就锁死了。用户在中文手机上选「跟随系统」，
 * 出国把系统改成英文，App 应该跟着变；把 'system' 解析成 'zh-Hans' 落库
 * 会让这个人永远看中文。
 */
export type LanguagePreference = 'system' | Locale;

/** 读不出设备语言、或设备语言不在支持列表里时的兜底。 */
export const FALLBACK_LOCALE: Locale = 'en';

/** 只认三个字面量；历史脏值 / 未来版本写入的新档位一律回落「跟随系统」。 */
export function parseLanguagePreference(raw: string | undefined): LanguagePreference {
  if (raw === 'system' || raw === 'zh-Hans' || raw === 'en') return raw;
  return 'system';
}

/**
 * BCP 47 语言标签 → 支持的 Locale。
 *
 * 只看主语言子标签，不做完整的 BCP 47 匹配：目前只有中英两门，
 * 「zh 一律给简体」是刻意的取舍——繁体用户看简体，比看英文近得多。
 * 真加了 zh-Hant 再来细分 script 子标签，那时这个函数才值得复杂化。
 */
export function localeFromLanguageTag(tag: string | undefined): Locale | undefined {
  if (tag === undefined) return undefined;
  const primary = tag.toLowerCase().split(/[-_]/).at(0);
  if (primary === 'zh') return 'zh-Hans';
  if (primary === 'en') return 'en';
  return undefined;
}

/**
 * 档位 + 设备语言 → 这一刻该渲染哪门语言。**唯一的裁决处**。
 *
 * 显式选择永远优先；'system' 才去看设备语言；设备语言读不出或不支持时回落
 * FALLBACK_LOCALE。注意回落到 en 而不是 zh-Hans：读不出设备语言的场景
 * （Intl 不可用）下，英文的可触达面更大。
 */
export function resolveLocale(
  preference: LanguagePreference,
  deviceLanguageTag: string | undefined,
): Locale {
  if (preference !== 'system') return preference;
  return localeFromLanguageTag(deviceLanguageTag) ?? FALLBACK_LOCALE;
}
