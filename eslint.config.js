// ESLint 9 flat config
// 两条分层硬规则（core 零平台依赖、UI 不直连 infrastructure）+ 工程规范由此强制。
// 注意：eslint-config-expo/flat 已经为 **/*.{ts,tsx} 注册了 @typescript-eslint 插件与 parser，
// 这里只追加规则，不重复注册插件（flat config 重复注册同名不同实例的插件会直接报错）。
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

const NO_AS_MESSAGE =
  '禁止使用 `as` 类型断言（唯一例外是 `as const`）。运行时未知结构请用 src/core/domain/guards.ts 中的类型守卫函数（v is T）配合 typeof / in 收窄。';

/** core 是纯 TS 层：零平台依赖，且不能反向依赖 infrastructure 实现。 */
const CORE_FORBIDDEN_IMPORTS = [
  {
    group: ['react', 'react/**', 'react-native*', 'react-native*/**', 'expo*', 'expo*/**'],
    message:
      'src/core/** 必须是零平台依赖的纯 TS：不允许 import react / react-native / expo。平台能力请在 core 中定义契约，由 src/infrastructure/** 实现。',
  },
  {
    group: ['@/infrastructure/*', '@/infrastructure/**', '**/infrastructure/*', '**/infrastructure/**'],
    message:
      'src/core/** 不能依赖 infrastructure 实现，只能定义契约（依赖方向：infrastructure → core）。',
  },
];

// 模块访问器是 `requireNativeModule` 的包：原生模块缺席时 **import 即抛**。
// 新增依赖时怎么判断：在该包的 build 目录里 grep 两个函数名——
//   grep -rn "requireNativeModule" node_modules/<pkg>/build
// 命中 requireNativeModule 的进这张表；命中 requireOptionalNativeModule 的不用进
// （那个缺模块返回 null，不抛）。
// 为什么值得防：JS 随时热更、原生包只在 prebuild + 构建后才更新，两者天然会漂移。
// 静态引一次就让整个 App 红屏，而报错文案只说「Cannot find native module 'X'」，
// 完全不提示真正的动作是「重建原生包」。命中的包只能动态 import（type-only 静态引可以）。
// 模板基线依赖里暂无命中的包；新 App 加依赖时按上面的方法自查并补进来。
const THROW_ON_IMPORT_NATIVE_MODULES = [];

/**
 * 【领域铁律规则位——每个新 App 替换成自己的铁律】
 *
 * 下面这条是模板自带的示例：触感必须经 application/haptics 的三个动词，
 * 不许直连 expo-haptics。
 *
 * 为什么值得一条 lint 规则：偏好里有「触感反馈」开关，而开关的判定只在
 * application/haptics 里做一次。任何一处绕过封装直接 impactAsync，用户关掉开关
 * 之后那一处照震——而这种漏网**没有任何测试能发现**（触感在 CI 里本来就不发生），
 * 只能靠真机手感，也就是基本发现不了。让它在 lint 阶段就红。
 *
 * 你的 App 里那些「绕过唯一出口就会静默出错、且测试测不到」的领域规则，
 * 都应该照这个样子钉成 lint error。
 */
const HAPTICS_FORBIDDEN_IMPORTS = [
  {
    group: ['expo-haptics'],
    message:
      '不要直接 import expo-haptics：触感开关的判定只在 @/application/haptics 里做一次，绕过它会让用户关掉开关后仍然震动。请用 hapticImpact / hapticSelection / hapticWarning。',
  },
];

/** UI 层（app / features）不能直连基础设施，必须经由 application 层用例。 */
const UI_FORBIDDEN_IMPORTS = [
  {
    group: ['@/infrastructure/*', '@/infrastructure/**', '**/infrastructure/*', '**/infrastructure/**'],
    message:
      'UI 层（src/app/**、src/features/**）禁止直接 import infrastructure，请通过 application 层用例访问 db / secure-store / network / logger。',
  },
  ...HAPTICS_FORBIDDEN_IMPORTS,
];

module.exports = defineConfig([
  ...expoConfig,

  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'android/**', 'ios/**', 'expo-env.d.ts'],
  },

  // ── 通用规范 ────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // 统一用 type，不用 interface
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

      // 禁止一切 as 断言，唯一例外 `as const`
      'no-restricted-syntax': [
        'error',
        {
          // `as const` 的 typeAnnotation 是 typeName 为 const 的 TSTypeReference，用 :not 排除
          selector: 'TSAsExpression:not([typeAnnotation.typeName.name="const"])',
          message: NO_AS_MESSAGE,
        },
        {
          // 尖括号断言 <Foo>value，没有 as const 这种例外
          selector: 'TSTypeAssertion',
          message: NO_AS_MESSAGE,
        },
      ],

      // eslint-config-expo 默认开启该规则，会把 <T>v 提示成 "改用 as T"，与上面的禁 as 冲突。
      // 我们的规则更严，关掉 expo 的这条以免给出互相矛盾的提示。
      '@typescript-eslint/consistent-type-assertions': 'off',

      // 日志统一走 infrastructure/logger（内置脱敏）
      'no-console': 'warn',

      /**
       * 「import 即抛」的原生模块只能动态 import（type-only 静态引可以）。
       *
       * 用 @typescript-eslint 版而非基础版：只有它支持 allowTypeImports，
       * 而我们确实需要 type-only 引用（编译期会被抹掉，不触发模块求值）。
       * 名单为空时规则是 no-op，保留规则位让新增依赖时只需要往名单里加一行。
       */
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: THROW_ON_IMPORT_NATIVE_MODULES.map((name) => ({
            name,
            allowTypeImports: true,
            message: `${name} 的原生模块缺席时 import 即抛，静态引会让整个 App 红屏。请在用到的地方 await import('${name}') 并 try/catch 降级。类型可以用 import type 静态引。`,
          })),
        },
      ],
    },
  },

  // ── 分层依赖硬规则 ──────────────────────────────────────────────────────
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: CORE_FORBIDDEN_IMPORTS }],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: UI_FORBIDDEN_IMPORTS }],
    },
  },

  // ── 共享 UI 原语同样不许直连 expo-haptics（它们被全 App 消费，漏一处影响最大）──
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: HAPTICS_FORBIDDEN_IMPORTS }],
    },
  },

  // ── logger 自身是唯一允许直出 console 的地方 ──────────────────────────
  {
    files: ['src/infrastructure/logger/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
]);
