/**
 * BottomSheet —— 全项目统一的底部弹层原语（替代 model-picker / edit-message /
 * prompt-variables 三处各写各的 RN Modal 底部 sheet）。
 *
 * 结构：RN Modal（transparent + statusBarTranslucent，动画交给 reanimated）
 *   → 遮罩（FadeIn/FadeOut，点击关闭）
 *   → 面板（SlideInDown 弹簧进 / SlideOutDown 定时出，底部圆角，Gesture.Pan 下滑关闭）。
 *
 * 关键取舍 0（进场弹簧、退场定时）：iOS 原生 sheet 是弹簧的，线性 timing 推上来的
 *   面板挨着系统转场会显出「这段是 JS 画的」，所以进场走 Motion.springSheet。
 *   退场**不能**跟着弹：卸载 Modal 靠的是一个 EXIT_MS 定时器（见取舍 2），而弹簧
 *   没有确定时长，两者对不齐就会在动画播完前把载体拆掉。退场保留 timing + easeIn
 *   （慢起快走）——消失本来就该果断，这不是将就。
 *
 * 关键取舍 1（iOS Modal 内手势）：iOS 上 RN Modal 会把内容渲染到独立的原生
 *   ViewController，外层 _layout 的 GestureHandlerRootView 不覆盖它——所以这里
 *   必须在 Modal 内容里再包一层 GestureHandlerRootView，否则 Pan 手势不响应。
 *
 * 关键取舍 2（exiting 延迟卸载）：reanimated 的 exiting 动画要求「先把内容从树里
 *   移除、再由动画收尾」，但如果 Modal 本身在 visible=false 的瞬间卸载，动画就没有
 *   载体、看不到关闭过场。这里用 mounted = visible || exiting 解耦：visible=true
 *   立即挂 Modal；visible=false 时 exiting 撑住挂载让内容播退场，延迟 EXIT_MS 后归零、
 *   真正卸载 Modal。用定时器而不是 exiting 回调，是因为遮罩与面板两段 exiting 无法
 *   共用一个回调，定时器最简且够稳。
 *
 * reactCompiler 纪律：translateY 这个 shared value 只在 worklet（onUpdate/onEnd/
 *   useAnimatedStyle）内读，读写一律 .get()/.set()，render 期从不读它的值。
 */
import { type ReactNode, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius } from '@/constants/theme';
import { useElevation, useTheme } from '@/hooks/use-theme';

/** 下滑关闭阈值：松手时位移超过它就判定为关闭意图。 */
const CLOSE_THRESHOLD = 120;
/** exiting 过场时长；卸载 Modal 的延迟与它对齐，给足动画收尾时间。 */
const EXIT_MS = Motion.durationBase;
/** 拖拽激活阈值：向下移动超过它 Pan 才接管，给内部 ScrollView 的滚动让路。 */
const PAN_ACTIVATE_OFFSET = 16;

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 面板最大高度占屏比，默认 0.8。 */
  maxHeightRatio?: number;
  /**
   * 点遮罩是否关闭，默认 true。表单类弹层（如变量填写）传 false 保护草稿，
   * 只能通过显式取消/确定按钮关闭——避免误触遮罩丢失已填内容。
   * 注意：下滑手势与 onRequestClose（安卓返回键）不受此开关影响。
   */
  dismissOnBackdrop?: boolean;
};

export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.8,
  dismissOnBackdrop = true,
}: BottomSheetProps) {
  const theme = useTheme();
  const elevation = useElevation();
  // 屏高必须每次 render 读，不能在模块求值时 Dimensions.get 一次抓死：那样旋转屏 /
  // iPad 分屏之后，「送出屏幕」的距离和 maxHeight 用的都还是上一个尺寸。
  const { height: screenHeight } = useWindowDimensions();
  // 见文件头「关键取舍 2」：挂载态比 visible 晚一步归零，好把 exiting 播完。
  // mounted 是推导值而不是渲染期 setState 同步的 state——后者（React 官方
  // 「根据 prop 变化调整 state」模式）会被 reactCompiler 编译坏：setMounted 生效
  // 前组件输出已被缓存，mounted 永远停在 false，弹层永远不渲染（实测于换模型入口）。
  const [exiting, setExiting] = useState(false);
  const mounted = visible || exiting;
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // 复用同一个组件实例时 translateY 会带着上次关闭的残值，开场先归零。
      translateY.set(0);
      // visible true→false 的瞬间由 cleanup 把 exiting 置起，保住 Modal 播退场动画。
      return () => setExiting(true);
    }
    const timer = setTimeout(() => setExiting(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [visible, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const pan = Gesture.Pan()
    .activeOffsetY(PAN_ACTIVATE_OFFSET)
    .onUpdate((event) => {
      // 只跟随向下拖拽，向上不拉伸
      if (event.translationY > 0) translateY.set(event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > CLOSE_THRESHOLD) {
        // 顺着手指把面板送出屏幕再关闭：与 SlideOutDown 同向（都往下），
        // 二者叠加不会有回弹方向的突兀感，取舍见文件头。
        translateY.set(
          withTiming(screenHeight, { duration: Motion.durationFast }, (finished) => {
            if (finished) runOnJS(onClose)();
          }),
        );
      } else {
        translateY.set(withSpring(0, Motion.springSheet));
      }
    });

  if (!mounted) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      {/* iOS Modal 内的独立原生层，必须自带一层 root 手势才响应，见文件头「关键取舍 1」 */}
      <GestureHandlerRootView style={styles.root}>
        {visible ? (
          <>
            <Animated.View
              entering={FadeIn.duration(EXIT_MS).easing(Motion.easeOut)}
              exiting={FadeOut.duration(EXIT_MS).easing(Motion.easeIn)}
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}>
              {dismissOnBackdrop ? <Pressable style={styles.fill} onPress={onClose} /> : null}
            </Animated.View>
            <KeyboardAvoidingView
              style={styles.avoider}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              pointerEvents="box-none">
              <GestureDetector gesture={pan}>
                <Animated.View
                  entering={SlideInDown.springify()
                    .damping(Motion.springSheet.damping)
                    .stiffness(Motion.springSheet.stiffness)}
                  exiting={SlideOutDown.duration(EXIT_MS).easing(Motion.easeIn)}
                  style={[
                    styles.panel,
                    elevation.overlay,
                    { backgroundColor: theme.background, maxHeight: screenHeight * maxHeightRatio },
                    sheetStyle,
                  ]}>
                  {children}
                </Animated.View>
              </GestureDetector>
            </KeyboardAvoidingView>
          </>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  // 键盘避让容器：面板锚在底部，键盘弹起时 padding 把它整体顶上去
  avoider: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
});
