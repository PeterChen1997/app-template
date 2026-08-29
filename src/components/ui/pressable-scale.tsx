/**
 * PressableScale —— 按压缩放反馈的 Pressable 封装（reanimated 4）。
 *
 * 统一全项目「可按元素」的触感：按下轻微缩小、松开弹回，可选 Light 触觉。
 *
 * ── 为什么是 AnimatedPressable 单节点，而不是 Animated.View 包一层 ──────────
 * 此前这里是 `<Animated.View><Pressable {...rest}/></Animated.View>`，而 style
 * 只到得了里层的 Pressable。于是任何需要向父容器要空间的调用点——`flex: 1`、
 * `alignSelf: 'stretch'`、row 里等分——都会因为外层那个没有 flex 属性的 View 而塌掉。
 * 结果就是这个「统一按压语言」的原语全项目只有 onboarding 一处敢用，其余各处退回
 * `opacity: 0.7`。改成 createAnimatedComponent(Pressable) 之后只有一个节点，
 * 布局约束和动画作用在同一个视图上，塌陷的前提消失。
 *
 * 代价是 style **不再接受 `({ pressed }) => ...` 函数形式**（reanimated 无法把
 * animated style 合进函数返回值）。这不是损失而是收窄：按压反馈就该由本原语统一
 * 提供，调用点自己再画一层 pressed 高亮正是要消灭的东西。需要「按下换底色」语义的
 * 列表行不适用本原语，走 ListRow。
 *
 * React Compiler 提醒：本项目开启 reactCompiler，`scale.value = ...` 直接赋值会被
 * react-hooks/immutability 规则判为「修改不可变值」而报 error；故统一用 reanimated 4
 * 的 `.get()` / `.set()` 方法 API 读写 shared value，语义等价且 lint 干净。
 * shared value 也只在 useAnimatedStyle 的 worklet 内读取，绝不在 render 期读。
 */
import { hapticImpact } from '@/application/haptics';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** 静态样式。函数形式（({ pressed }) => …）不支持，理由见文件头。 */
  style?: StyleProp<ViewStyle>;
  /** 按下时缩放到的比例，默认 Motion.pressScale（0.97）。 */
  scaleTo?: number;
  /** 按下时是否触发 Light 触觉反馈，默认 false。 */
  haptic?: boolean;
};

export function PressableScale({
  scaleTo = Motion.pressScale,
  haptic = false,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const handlePressIn: PressableProps['onPressIn'] = (event) => {
    // disabled 时不加动效
    if (!disabled) {
      scale.set(withSpring(scaleTo, Motion.springPress));
      if (haptic) {
        hapticImpact('light');
      }
    }
    // 保留调用方自己传的回调，合并而非覆盖
    onPressIn?.(event);
  };

  const handlePressOut: PressableProps['onPressOut'] = (event) => {
    if (!disabled) {
      scale.set(withSpring(1, Motion.springPress));
    }
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    />
  );
}
