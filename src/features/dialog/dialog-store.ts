// 全 App 的弹窗出口。**替代 react-native 的 Alert / ActionSheetIOS。**
//
// ── 为什么不能再用系统 Alert ────────────────────────────────────────────────
//
// 系统 Alert 与 ActionSheetIOS 都**只能靠按钮关闭**：点遮罩、点别处、下滑，
// 统统没反应。用户误触弹出一个菜单后，唯一的出路是准确点到「取消」那一行——
// 这在一个到处是长按菜单的 App 里是持续的摩擦。本项目的 BottomSheet 原语本来
// 就支持点遮罩关闭与下滑关闭，弹窗没有理由是例外。
//
// 附带收益：系统 Alert 的按钮文案、字体、配色全部由系统决定，不跟 App 的
// 设计 token 走，也不跟「外观：始终深色」这类覆盖走。换成自绘之后全都对齐了。
//
// ── 为什么是命令式 API 而不是让每个调用点自己挂组件 ────────────────────────
//
// 全仓有 70 多处弹窗，且绝大多数发生在**回调里**（catch 到错误、菜单选完之后），
// 那些地方没有 render 可言。若要求每处都改成「加一个 useState + 在 JSX 里挂一个
// 弹层」，改动量会大到没人愿意审，而且每个页面都要自己处理「弹层还开着就被卸载」
// 这类边界。所以保留 `Alert.alert(...)` 那样的调用手感，把渲染集中到一个宿主。
//
// 返回 Promise 而不是回调，是为了让「等用户决定」这件事在调用点读起来是线性的：
//   if (!(await showConfirm({...}))) return;
//
// ── 排队 ────────────────────────────────────────────────────────────────────
//
// 同一时刻只显示一个。第二个请求进来时排队，而不是覆盖——覆盖会让前一个的
// Promise 永远悬着（调用方可能正 await 它），也会让用户看到弹窗莫名其妙地跳变。

import { create } from 'zustand';

import { newId } from '@/core/ids';

/** 一个可选项。id 是调用方自己定的语义标识，回来的就是它。 */
export type DialogAction = {
  id: string;
  label: string;
  /** destructive 走危险色；cancel 视觉上弱化并排在最后 */
  style?: 'default' | 'destructive' | 'cancel';
};

export type DialogRequest = {
  key: string;
  title: string;
  message?: string;
  actions: DialogAction[];
  /**
   * 点遮罩 / 下滑关闭时返回哪个 action id；undefined = 关闭即视为「什么都没选」。
   *
   * 破坏性确认一定要让它等于取消：用户随手点走弹窗，绝不能被理解成「确认删除」。
   */
  dismissActionId?: string;
  resolve: (actionId: string | undefined) => void;
};

type DialogState = {
  /** 队首即当前显示的那个；空数组 = 没有弹窗 */
  queue: DialogRequest[];
  /**
   * 已挂载的宿主栈，后进者在栈顶。**只有栈顶的宿主渲染。**
   *
   * WHY 需要这个栈（实测踩出来的）：iOS 的 modal 呈现是「一个 VC 同时只能呈现一个」。
   * 根布局的宿主挂在根 VC 上，而 pageSheet 弹层（版本历史）已经占用了根 VC 的呈现位——
   * 此时根宿主再想弹一个 Modal，iOS 会**静默丢弃**，弹窗不出现、Promise 永不 resolve，
   * 表现是「按钮点了完全没反应」，比原来的系统 Alert 还糟。
   *
   * 修法：弹层在自己的内容里也挂一个宿主。它渲染的 Modal 从**那个弹层的 VC** 呈现，
   * 不与根 VC 冲突。栈保证同一时刻只有最内层那个真的渲染，不会两个宿主同时画一份。
   */
  hosts: string[];
  registerHost: (id: string) => void;
  unregisterHost: (id: string) => void;
  /** 用户做出选择（或关闭）：resolve 掉队首并出队 */
  settle: (key: string, actionId: string | undefined) => void;
};

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  hosts: [],
  registerHost: (id) => {
    set({ hosts: [...get().hosts, id] });
  },
  unregisterHost: (id) => {
    set({ hosts: get().hosts.filter((item) => item !== id) });
  },
  settle: (key, actionId) => {
    const target = get().queue.find((item) => item.key === key);
    if (target === undefined) return;
    // 先出队再 resolve：resolve 可能同步再开一个弹窗，队列必须已经是新状态
    set({ queue: get().queue.filter((item) => item.key !== key) });
    target.resolve(actionId);
  },
}));

function enqueue(input: Omit<DialogRequest, 'key' | 'resolve'>): Promise<string | undefined> {
  return new Promise((resolve) => {
    const request: DialogRequest = { ...input, key: newId(), resolve };
    useDialogStore.setState((state) => ({ queue: [...state.queue, request] }));
  });
}

/** 单按钮提示。await 它就是「等用户收下这条消息」。 */
export function showAlert(
  title: string,
  message: string | undefined,
  okLabel: string,
): Promise<void> {
  return enqueue({
    title,
    message,
    actions: [{ id: 'ok', label: okLabel }],
  }).then(() => undefined);
}

/**
 * 二选一确认。返回 true 才代表用户确认过。
 *
 * 关闭（点遮罩 / 下滑）一律等于取消——这是 dismissActionId 留空的原因，
 * 也是本文件唯一一条不能被"优化"掉的规则。
 */
export function showConfirm(input: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return enqueue({
    title: input.title,
    message: input.message,
    actions: [
      {
        id: 'confirm',
        label: input.confirmLabel,
        style: input.destructive === true ? 'destructive' : 'default',
      },
      { id: 'cancel', label: input.cancelLabel, style: 'cancel' },
    ],
  }).then((picked) => picked === 'confirm');
}

/** 动作菜单。返回选中的 action id；取消或关闭返回 undefined。 */
export function showActionSheet(input: {
  title: string;
  message?: string;
  actions: DialogAction[];
  cancelLabel: string;
}): Promise<string | undefined> {
  return enqueue({
    title: input.title,
    message: input.message,
    actions: [...input.actions, { id: 'cancel', label: input.cancelLabel, style: 'cancel' }],
  }).then((picked) => (picked === 'cancel' ? undefined : picked));
}
