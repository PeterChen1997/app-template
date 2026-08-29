// 触感反馈的唯一出口：全 App 不再直接 import expo-haptics。
//
// WHY 要有这一层：偏好里加了「触感反馈」开关，而触感调用点散在十几个组件里。
// 如果让每个调用点自己去问「开关开着吗」，就会有十几处各自决定要不要震——
// 漏一处，用户关了开关还在震，而且没人发现。收成三个动词后，开关只在这里判一次。
//
// WHY 放在 application 而不是 components/ 或 features/：它是「读偏好 + 调平台能力」
// 的用例，两头都在 UI 之外；components/ui 与各 feature 都要用它，放进任何一个
// feature 都会变成 feature 之间互相 import。core 则不行——core 禁止 expo。
//
// 三个动词就是全部词汇表，不再对外暴露 expo-haptics 的枚举：调用点应当描述
// 「这是什么性质的反馈」，而不是挑一个震动波形。

import * as Haptics from 'expo-haptics';

import { isHapticsEnabledSync } from './app-settings';

/**
 * 触感失败一律吞掉。
 *
 * 这是全项目极少数「静默失败是对的」的地方：expo-haptics 用
 * requireOptionalNativeModule 加载，模拟器 / 缺 Taptic Engine 的设备上必然 reject。
 * 一次震动没震到不影响任何业务结果，让它冒泡只会污染真正的错误链路
 * （例如「复制成功」被一次震动失败判成失败）。
 */
function fire(effect: () => Promise<void>): void {
  if (!isHapticsEnabledSync()) return;
  void effect().catch(() => undefined);
}

/** 轻/中两档轻击：确认性动作（发送、复制）用 light，长按唤起菜单用 medium。 */
export function hapticImpact(strength: 'light' | 'medium' = 'light'): void {
  const style =
    strength === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  fire(() => Haptics.impactAsync(style));
}

/** 选择变化（开关、分段控件）。 */
export function hapticSelection(): void {
  fire(() => Haptics.selectionAsync());
}

/** 破坏性动作的确认前警示（删除、清空）。 */
export function hapticWarning(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
