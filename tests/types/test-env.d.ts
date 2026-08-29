// 测试环境的全局声明。
//
// jest 全局（describe/it/expect）：TS 的 @types 自动引入在部分 pnpm 布局下不生效，
// 这里显式 reference 一次，tests/** 里就不再需要逐文件 import。

/// <reference types="jest" />
