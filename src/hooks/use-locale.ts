// 界面语言的单一入口，结构与 hooks/use-theme 逐条对应——两者解决的是同一个
// 形状的问题：一个存在 SQLite 里（读取是异步的）、却被上百个组件同步消费的偏好。
//
// ── 为什么是「模块级 store + useSyncExternalStore」而不是 Context ──────────────
//
// 与外观同理，外加一条语言特有的：文案还要给**非 React 的调用方**用
// （application/providers.ts 的错误提示、tools.ts 的拒绝理由）。Context 到不了
// 那里。所以真相存在 core/strings.ts 的模块级状态里，这一层只负责
//   1) 把持久化的档位装进去，2) 把变化广播给 React。
//
// ── 冷启动会不会先闪一下中文再跳英文 ────────────────────────────────────────
//
// 预热在**模块求值时**就发起（见文件末尾），与 use-theme 共享同一个窗口：
// AnimatedSplashOverlay 是一块不透明的品牌底色，活到「首次 layout + 600ms」，
// 一次 KV 查询在这个窗口里早就回来了。首次安装时库里没有语言偏好，解析结果
// 就是「跟随设备」，也没有跳变的前提。
//
// 但初值与 use-theme 有一处**关键差异**：外观的初值可以是 'system'，因为
// Appearance.getColorScheme() 是同步的；设备语言我们也读得到（Intl 是同步的），
// 所以这里在模块求值时就把 'system' 解析掉，初值直接是设备语言。
// 换句话说：**只有「用户显式选过一门与设备不同的语言」才可能有一帧差异**，
// 而那一帧被 splash 盖着。

import { useSyncExternalStore } from 'react';

import { getLanguagePreference, setLanguagePreference } from '@/application/app-settings';
import { resolveLocale, type LanguagePreference, type Locale } from '@/core/i18n';
import { getStrings, setLocale, type Catalog } from '@/core/strings';
import { readDeviceLanguageTag } from '@/infrastructure/locale/device-language';

// 设备语言在进程内只读一次：它在 App 运行期间不会变（改系统语言会重启 App）。
const deviceLanguageTag = readDeviceLanguageTag();

let preference: LanguagePreference = 'system';

const listeners = new Set<() => void>();

/** 按当前档位重算生效语言并广播。语言没真变就不广播——避免无谓的全 App 重渲染。 */
function recompute(): void {
  if (!setLocale(resolveLocale(preference, deviceLanguageTag))) return;
  for (const listener of listeners) listener();
}

// 模块求值时先把「跟随设备」解析掉，让第一帧就是正确的语言
recompute();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getPreference(): LanguagePreference {
  return preference;
}

/**
 * 当前语言的全部文案。**组件里取文案的唯一方式。**
 *
 * getStrings 返回的是模块级的目录对象引用，切换语言时引用会变，
 * useSyncExternalStore 据此触发重渲染；没切换时引用恒定，不会造成多余渲染。
 */
export function useStrings(): Catalog {
  return useSyncExternalStore(subscribe, getStrings, getStrings);
}

/** 当前生效的语言字面量。只有需要区分「跟随系统」与恰好同语言的地方才用得上。 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocaleSnapshot, getLocaleSnapshot);
}

function getLocaleSnapshot(): Locale {
  return resolveLocale(preference, deviceLanguageTag);
}

/** 用户选的档位（含 'system'）。语言设置页用它画选中态。 */
export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(subscribe, getPreference, getPreference);
}

/**
 * 切换语言档位：先改内存再落库。
 *
 * 顺序不能反，与 applyAppearanceMode 同一个理由：用户点下那一刻界面就该换语言。
 * 写盘失败时内存与库不一致，下次冷启动自愈；调用方拿到 reject 后可以提示，
 * 但**不要**回滚界面——用户看到的就该是他刚选的那门语言。
 */
export async function applyLanguagePreference(next: LanguagePreference): Promise<void> {
  preference = next;
  recompute();
  await setLanguagePreference(next);
}

/**
 * 启动预热：把持久化的语言档位装进 store。
 *
 * 与 use-theme 一样在模块求值时发起。失败就保持「跟随设备」——
 * 读不出偏好不该让 App 起不来，也不该把人锁在某一门语言上。
 */
void getLanguagePreference().then(
  (stored) => {
    preference = stored;
    recompute();
  },
  () => undefined,
);
