// 设备语言的读取。core 拿不到平台 API，所以这一层把它读成一个 BCP 47 标签，
// 交给 core/i18n/locale.ts 的 localeFromLanguageTag 去解析。
//
// ── 为什么用 Intl 而不是 expo-localization ──────────────────────────────────
//
// expo-localization 是「正确」的做法，但它是一个原生模块：装上就要 prebuild +
// 重建 dev client，而这件事对「切个语言」来说代价过高。Hermes 在 iOS 上带
// ICU 支持的 Intl，`resolvedOptions().locale` 返回的就是设备语言标签，够用。
//
// 读不出来时返回 undefined，由 resolveLocale 回落到 FALLBACK_LOCALE——
// 这不是静默降级：用户在设置里显式选过语言的话，压根不会走到设备语言这条路。
// 真要换成 expo-localization，改动被关在这一个函数里。

export function readDeviceLanguageTag(): string | undefined {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    return typeof tag === 'string' && tag !== '' ? tag : undefined;
  } catch {
    return undefined;
  }
}
