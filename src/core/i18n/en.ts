// English catalog.
//
// 形状基准是 zh-Hans.ts：这里每个导出都显式标注 `typeof zh.X`，
// 少一个键 / 多一个键 / 签名对不上，tsc 当场报错——这是「翻译漏了」
// 唯一可靠的捕捉点，别把它换成 Partial 或 Record<string, string>。
//
// 中文原文里的注释（讲「为什么这么写」）不在这里重复，改文案时回去读 zh-Hans.ts。

import type * as zh from './zh-Hans';

export const common: typeof zh.common = {
  ok: 'OK',
  cancel: 'Cancel',
  confirm: 'Confirm',
  delete: 'Delete',
};

export const settings: typeof zh.settings = {
  language: 'Language',
  appearance: 'Appearance',
};

export const errorBoundary: typeof zh.errorBoundary = {
  title: 'Something went wrong',
  message: 'This screen failed to render. Your data is safe; retrying usually recovers it.',
  retry: 'Retry',
};

export const home: typeof zh.home = {
  title: 'Home',
  greeting: (name: string) => `Hello, ${name}`,
};
