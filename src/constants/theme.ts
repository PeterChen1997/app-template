/**
 * 设计 token 单一事实源。
 *
 * ── 方向契约（模板占位——每个新 App 在这里写下自己的设计方向） ──────────────
 * 这里应当能回答「这个 App 长什么样、为什么」：一句 THESIS（品牌隐喻 / 态度）、
 * 色彩纪律（什么颜色只出现在什么语义上）、字阶与圆角的取舍、动效的性格。
 * 设计审计（如 impeccable）以这段注释为准绳——写不出方向契约的 token 改动，
 * 多半是随手拍的 magic number。
 *
 * 模板自带的取值来自 chatme（中性灰双模式底色 + 单一 tint），它们是**能用的默认**，
 * 不是你的品牌：新 App 落地时整套替换 Colors，其余阶梯（TypeScale/Spacing/Radius/
 * Motion/Elevation）经过实机验证，通常可以直接沿用。
 * ──────────────────────────────────────────────────────────────────────────
 */

import { Platform, StyleSheet } from 'react-native';
import { Easing } from 'react-native-reanimated';

export const Colors = {
  light: {
    text: '#101828',
    textSecondary: '#667085',
    background: '#FFFFFF',
    backgroundElement: '#F7F8FA', // 卡片、列表行、输入底
    backgroundSelected: '#EEF1F5',
    border: '#E4E7EC',
    primary: '#3157E6', // 唯一 tint
    onPrimary: '#FFFFFF',
    success: '#0E9384', // 成功色的文本级深调（白底可读）
    danger: '#D92D20',
    overlay: 'rgba(16, 24, 40, 0.45)',
  },
  dark: {
    text: '#F7F8FA',
    textSecondary: '#98A2B3',
    background: '#08111F',
    backgroundElement: '#101828',
    backgroundSelected: '#1B2637',
    border: '#1D2939',
    primary: '#2F6BFF', // 暗底提亮的 tint
    onPrimary: '#FFFFFF',
    success: '#3DD6B5', // 成功色原色（暗底可读）
    danger: '#F97066',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

/**
 * 固定字号阶梯。组件优先用 ThemedText 的 type；
 * 裸 Text/StyleSheet 场景直接展开这里的对象，禁止再写 magic number。
 */
export const TypeScale = {
  caption: { fontSize: 11, lineHeight: 14 },
  footnote: { fontSize: 12, lineHeight: 16 },
  subhead: { fontSize: 13, lineHeight: 18 },
  callout: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 24 },
  title3: { fontSize: 17, lineHeight: 22 },
  title2: { fontSize: 22, lineHeight: 28 },
  title1: { fontSize: 28, lineHeight: 34 },
  largeTitle: { fontSize: 34, lineHeight: 41 },
} as const;

/** 间距阶梯。命名与数值对应（xs=4 起、4/8 栅格），不要发明与数值脱钩的名字。 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * 动效 token：时长、缓动曲线与弹簧参数，reanimated 调用统一从这里取。
 *
 * ── 曲线的选择依据 ────────────────────────────────────────────────────────
 * reanimated 的 withTiming 默认吃 `Easing.inOut(Easing.quad)`——**对称**缓动。
 * 对称曲线用在「往返」类动画（呼吸、跳动）上是对的，用在「出现 / 消失」上就是肉：
 * 元素起步慢、收尾也慢，用户等的是那个收尾。所以出现与消失必须各用各的曲线：
 *   * easeOut（快起慢收，末端几乎贴合）——进场、展开、跟手回弹之外的一切「到位」；
 *   * easeIn （慢起快走）——退场、收起，让消失显得果断而不是拖泥带水。
 * 位移 / 尺寸类优先用弹簧而不是 timing：iOS 26 整套系统动效都是弹簧的，
 * timing 混在原生转场旁边会显出「这段是 JS 画的」。
 *
 * ── 关于 Reduce Motion ────────────────────────────────────────────────────
 * 不需要在每个调用点写 `reduceMotion`：withTiming / withSpring / layout animation
 * 的该字段**默认就是 ReduceMotion.System**，系统开了「减弱动态效果」会自动直达终点。
 * 唯一要自己处理的是无限 withRepeat 与 Keyframe，它们在 reduce motion 下的行为
 * 不是「直达终点」而是「照跳」，用到时在调用点单独处理。
 */
export const Motion = {
  durationFast: 150,
  durationBase: 250,
  durationSlow: 350,
  /** 进场 / 展开：快起慢收 */
  easeOut: Easing.bezier(0.2, 0, 0, 1),
  /** 退场 / 收起：慢起快走 */
  easeIn: Easing.bezier(0.4, 0, 1, 1),
  /** 按压反馈（scale 0.97）：高刚度短行程，手指还没离开就该到位 */
  springPress: { damping: 18, stiffness: 320 },
  /** sheet / 大位移转场 */
  springSheet: { damping: 22, stiffness: 260 },
  /** 布局重排（列表增删、折叠展开）：比 sheet 软，避免小位移抖成弹簧床 */
  springLayout: { damping: 20, stiffness: 220 },
  pressScale: 0.97,
} as const;

/**
 * 浮层的 z 轴线索。
 *
 * 内容层默认无阴影（扁平语汇）；「浮在内容之上」的东西（sheet 面板、横幅）
 * 必须与身下的内容分开，而扁平语汇里 3% 的底色差等于没有边界，
 * 所以给且只给浮层一档极轻的浮起。
 *
 * 为什么分明暗两套而不是一套：深色底上的黑影几乎不可见，硬调浓只会糊成一团脏。
 * 深色下改由 hairline 描边承担边界，投影只留一点点做纵深。
 * 两套形状保持一致（都含 shadow* + border*），消费点直接展开进 style 数组即可。
 */
export const Elevation = {
  light: {
    raised: {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    overlay: {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 16,
      borderWidth: 0,
      borderColor: 'transparent',
    },
  },
  dark: {
    raised: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#1D2939',
    },
    overlay: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.5,
      shadowRadius: 24,
      elevation: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#1D2939',
    },
  },
} as const;
