// Jest 配置：core 层是零 React Native 依赖的纯 TypeScript，单测只需要 node 环境。
//
// 为什么不用 `preset: 'jest-expo'`（或 'jest-expo/node'）：
// 1. 默认 `jest-expo` preset 是 ios/android/web 多 project 运行器，会把同一个纯 TS
//    测试跑 3 遍，并加载 react-native 的 setupFiles/mocks —— 对被测代码零收益。
// 2. `jest-expo/node` 单 project 版本在本仓库直接不可用：它的 getPlatformPreset()
//    把上游 transform 项整体替换成 ['babel-jest', { caller }]，丢掉了
//    resolveBabelOptions() 算出的 presets；本仓库又没有根 babel.config.js
//    （Expo SDK 57 不再要求），于是 babel 拿不到任何 preset，TS/ESM 完全不被转换，
//    测试直接报 "Cannot use import statement outside a module"（chatme 已实测）。
//    修法要么新建根 babel.config.js（额外维护面），要么在 config 里覆盖
//    transform —— 既然要覆盖，preset 就没有存在价值了。
//
// 因此：babel-jest + babel-preset-expo（经 `expo/internal/babel-preset` 入口引用，
// 这是 expo 包对外导出的 babel-preset-expo；`babel-preset-expo` 裸名在根目录未必
// 解析得到）+ testEnvironment: 'node'。保留 expo 的 babel preset 而非裸
// @babel/preset-typescript，是为了将来 tests/ 下出现 RN 组件测试时转换语义保持一致。

module.exports = {
  // rootDir 默认就是本配置文件所在目录（仓库根），无需显式写 __dirname。
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        // 不去读仓库根的 babelrc/babel.config.js（当前不存在），配置完全内联，
        // 避免 jest 的转换行为随将来新增的 babel 配置文件漂移。
        babelrc: false,
        configFile: false,
        presets: [require.resolve('expo/internal/babel-preset')],
        caller: { name: 'metro', bundler: 'metro', platform: 'ios' },
      },
    ],
  },
  // 与 tsconfig.json 的 paths 对齐
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  clearMocks: true,
};
