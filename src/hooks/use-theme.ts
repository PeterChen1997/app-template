// 全 App 的配色单一入口：useTheme() 给色板，useResolvedScheme() 给 light/dark 字面量。
//
// ── 为什么是「模块级 store + useSyncExternalStore」而不是 Context ──────────────
//
// 外观偏好存在 SQLite 里，读它是**异步**的；而 useTheme 被上百个组件同步消费。
// 用 Context 的话，Provider 必须挂在根布局上，根布局自己又要消费色板去算导航栏
// 主题——同一个组件不能既 provide 又 consume，只能再拆一层组件，把 _layout 的
// 结构翻一遍。改成模块级 store 之后：
//
//   * 根布局只需把 useColorScheme() 换成 useResolvedScheme()，一处改动；
//   * 偏好的读取在**模块求值时**就发起（见文件末尾），比任何组件的 useEffect
//     都早，是 JS 侧能做到的最早时刻；
//   * 系统深浅色变化由 Appearance 监听器直接推进 store，不再多一个 RN hook。
//
// ── 为什么不会「先按系统色渲染一帧再跳色」──────────────────────────────────
//
// 两道保险：
//   1. 冷启动时 AnimatedSplashOverlay 是一块不透明的品牌底色，铺满全屏、
//      至少活到「首次 layout + 600ms 淡出」为止。偏好读取（一次 KV 查询）
//      在这个窗口里早就回来了，用户看到的第一帧内容已经是最终配色。
//   2. 唯一可能慢过这个窗口的场景是**首次安装**（要跑完整套 migration），
//      而那时数据库里根本没有外观偏好，解析结果就是默认的「跟随系统」——
//      跳色的前提（存了一个和系统不同的档位）不成立。
//
// 因此没有必要把整棵路由树挡在偏好读取后面。挡住反而更危险：expo-router 的
// 根导航器必须尽早挂载，晚挂会让冷启动 deep link 落到「Attempted to navigate
// before mounting the Root Layout」。

import * as SystemUI from 'expo-system-ui';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import {
  loadAppSettings,
  setAppearanceMode,
  type AppearanceMode,
} from '@/application/app-settings';
import { Colors, Elevation } from '@/constants/theme';

/** 落到色板上的最终配色，只有两种；'system' 在这一层已经被解析掉了。 */
export type ResolvedScheme = 'light' | 'dark';

function normalizeSystemScheme(value: string | null | undefined): ResolvedScheme {
  return value === 'dark' ? 'dark' : 'light';
}

let mode: AppearanceMode = 'system';
let systemScheme: ResolvedScheme = normalizeSystemScheme(Appearance.getColorScheme());
let resolved: ResolvedScheme = systemScheme;

const listeners = new Set<() => void>();

/**
 * 重算最终配色并广播。
 *
 * 顺带把**原生根视图**的底色也刷一遍（expo-system-ui）：RN 的视图之下还有一层
 * 由系统按 OS 深浅色着色的窗口底。用户选了「始终深色」而系统是浅色时，转场、
 * 回弹、键盘收起的那几帧会从这层底色里透出白光——这是覆盖式外观最典型的漏光处。
 */
function recompute(): void {
  const next: ResolvedScheme = mode === 'system' ? systemScheme : mode;
  const changed = next !== resolved;
  resolved = next;
  // 无条件刷一次原生底色：首次预热时 next 常常等于初值，但那层底色还没被设过
  void SystemUI.setBackgroundColorAsync(Colors[next].background).catch(() => undefined);
  if (!changed) return;
  for (const listener of listeners) listener();
}

// 系统深浅色变化：模块级监听一次即可，不随组件挂载/卸载增删。
// 「跟随系统」档位靠它生效，被覆盖时它只更新 systemScheme、不改变呈现。
Appearance.addChangeListener(({ colorScheme }) => {
  systemScheme = normalizeSystemScheme(colorScheme);
  recompute();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getScheme(): ResolvedScheme {
  return resolved;
}

function getMode(): AppearanceMode {
  return mode;
}

/** 当前生效的 light / dark。导航栏色板等「需要字面量而不是色板」的地方用它。 */
export function useResolvedScheme(): ResolvedScheme {
  return useSyncExternalStore(subscribe, getScheme, getScheme);
}

/** 用户选的档位（含 'system'）。只有外观设置页需要区分「跟随系统」与恰好同色。 */
export function useAppearanceMode(): AppearanceMode {
  return useSyncExternalStore(subscribe, getMode, getMode);
}

export function useTheme() {
  return Colors[useResolvedScheme()];
}

/**
 * 浮层的 z 轴样式（sheet 面板 / 审批卡 / 横幅）。与 useTheme 分开而不是塞进色板：
 * 它返回的是一组 style 片段而不是颜色，混进色板会让 theme.xxx 的语义变成两种东西。
 * 浅色靠投影、深色靠描边，差异在 Elevation 里，消费点不需要知道当前是哪套。
 */
export function useElevation() {
  return Elevation[useResolvedScheme()];
}

/**
 * 切换外观档位：先改内存再落库。
 *
 * 顺序不能反——用户点下那一刻界面就该变色，等一次写盘回来（哪怕只有几毫秒）
 * 会让这个开关显得迟钝。写盘失败时内存与库不一致，下次冷启动自愈；
 * 调用方拿到 reject 后可以提示，但**不要**回滚界面：用户看到的就是他选的那个。
 */
export async function applyAppearanceMode(next: AppearanceMode): Promise<void> {
  mode = next;
  recompute();
  await setAppearanceMode(next);
}

/**
 * 启动预热：把持久化的外观偏好装进 store。
 *
 * 在模块求值时就发起（而不是等某个 useEffect），这是 JS 侧最早的时机。
 * loadAppSettings 同时预热了触感开关的同步缓存，所以这一次读库把两件事都办了。
 * 失败就保持默认「跟随系统」——读不出偏好不该让 App 起不来。
 */
void loadAppSettings().then(
  (settings) => {
    mode = settings.appearance;
    recompute();
  },
  () => undefined,
);
