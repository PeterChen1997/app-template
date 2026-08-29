// 简体中文文案目录（i18n 的**结构基准**）。
//
// 规则：
// 1. 组件里禁止写死用户可见字符串，一律从 hooks/use-locale 的 useStrings() 取；
//    非 React 的调用方走 core/strings.ts 的 getStrings()。
// 2. 需要变量的文案不要在调用方拼字符串，改为在本文件导出插值函数
//    （见下面 home.greeting 的示例）；模板用 `{name}` 占位符书写。
// 3. 只放 UI 文案；协议/错误码等机器可读常量留在 core/domain。
// 4. **本文件是所有语言目录的形状基准**：`core/i18n/index.ts` 里
//    `Record<Locale, Catalog>` 会强制 en.ts 与这里逐键对齐，少一个键 tsc 直接报错。
//    所以这里**不写 `as const`**——字面量类型会让别的语言永远无法赋值。
// 5. 新增文案：先加在这里，tsc 会立刻指着 en.ts 说缺了什么。

// ── 通用 ────────────────────────────────────────────────────────────────────

export const common = {
  ok: '好',
  cancel: '取消',
  /** 通用确认。破坏性动作用各自更具体的动词（删除 / 清空），不要用它 */
  confirm: '确定',
  delete: '删除',
};

// ── 设置 ────────────────────────────────────────────────────────────────────

export const settings = {
  language: '语言',
  appearance: '外观',
};

// ── 渲染兜底屏（app-error-boundary） ────────────────────────────────────────

export const errorBoundary = {
  title: '出了点问题',
  message: '这个页面渲染失败了。你的数据没有丢失，重试通常可以恢复。',
  retry: '重试',
};

// ── 占位首页 ────────────────────────────────────────────────────────────────

export const home = {
  title: '首页',
  /** 插值函数示例：占位符不在调用方拼，i18n-catalog.test 会验证实参真的进了输出 */
  greeting: (name: string) => `你好，${name}`,
};
