// 弹窗宿主：把 dialog-store 的队首渲染出来。挂在根布局，全 App 只有这一个。
//
// 用 BottomSheet 承载而不是自绘 Modal，正是为了白拿它已经调好的三件事：
// 点遮罩关闭、下滑关闭、以及 exiting 延迟卸载带来的退场动画——这三件恰好就是
// 系统 Alert 缺的（见 dialog-store 文件头）。
//
// 关闭语义收敛在一处：无论点遮罩、下滑还是点「取消」，都走 settle(key, 关闭值)。
// 破坏性确认的关闭值恒为 undefined / cancel，随手点走绝不会被当成确认。

import { Fragment, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Radius, Spacing } from '@/constants/theme';
import { newId } from '@/core/ids';
import { useTheme } from '@/hooks/use-theme';

import { useDialogStore, type DialogAction } from './dialog-store';

/** 三种样式各自的文字色 token。cancel 走次要色，destructive 走危险色。 */
function labelColorOf(style: DialogAction['style']): 'text' | 'danger' | 'textSecondary' {
  if (style === 'destructive') return 'danger';
  if (style === 'cancel') return 'textSecondary';
  return 'text';
}

export function DialogHost() {
  const theme = useTheme();
  // 本宿主在栈里的身份。useRef 而不是 useState：它只是个标识，变了不需要重渲染。
  const idRef = useRef<string>(newId());
  // 只订阅队首：后面排队的变化不该引起重渲染
  const current = useDialogStore((state) => state.queue.at(0));
  const settle = useDialogStore((state) => state.settle);
  const registerHost = useDialogStore((state) => state.registerHost);
  const unregisterHost = useDialogStore((state) => state.unregisterHost);
  // 只有栈顶的宿主渲染，理由见 dialog-store 里 hosts 的注释（iOS 一个 VC 只能呈现一个 modal）
  const isTopHost = useDialogStore((state) => state.hosts.at(-1) === idRef.current);

  useEffect(() => {
    const id = idRef.current;
    registerHost(id);
    return () => unregisterHost(id);
  }, [registerHost, unregisterHost]);

  // 恒定挂载 BottomSheet、用 visible 切换，才有开场与退场动画
  // （条件挂载会让 exiting 撑不住，见 bottom-sheet 文件头的已知取舍）。
  const key = current?.key;

  // cancel 单独拎出来：iOS 的动作面板里它是**另一张卡**，与其它选项之间留一道间隙。
  // 这不只是好看——取消是「什么都不做」，和会真的执行点什么的选项分开，能显著降低误触。
  const choices = current?.actions.filter((action) => action.style !== 'cancel') ?? [];
  const cancelAction = current?.actions.find((action) => action.style === 'cancel');

  return (
    <BottomSheet
      visible={current !== undefined && isTopHost}
      onClose={() => {
        if (key !== undefined) settle(key, current?.dismissActionId);
      }}>
      {current === undefined ? null : (
        <View style={styles.body}>
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.centered}>
              {current.title}
            </ThemedText>
            {current.message === undefined ? null : (
              <ThemedText type="footnote" themeColor="textSecondary" style={styles.centered}>
                {current.message}
              </ThemedText>
            )}
          </View>

          <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
            {choices.map((action, index) => (
              <Fragment key={action.id}>
                {index === 0 ? null : (
                  <View style={[styles.separator, { backgroundColor: theme.border }]} />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => settle(current.key, action.id)}
                  style={({ pressed }) => [
                    styles.action,
                    pressed ? { backgroundColor: theme.backgroundSelected } : null,
                  ]}>
                  <ThemedText type="smallBold" themeColor={labelColorOf(action.style)}>
                    {action.label}
                  </ThemedText>
                </Pressable>
              </Fragment>
            ))}
          </View>

          {cancelAction === undefined ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelAction.label}
              onPress={() => settle(current.key, cancelAction.id)}
              style={({ pressed }) => [
                styles.action,
                styles.group,
                { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              <ThemedText type="smallBold">{cancelAction.label}</ThemedText>
            </Pressable>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // paddingHorizontal 是承重的：BottomSheet 的 panel 自己不带任何内边距（见它的样式表），
  // 每个消费者各自给。漏了就会像原来那样标题贴着屏幕左边缘、动作行铺满到边。
  // paddingBottom 用常量而不是 useSafeAreaInsets：iOS 的 RN Modal 渲染在独立的原生
  // ViewController 里，SafeAreaProvider 的 context 到不了那一层，读出来是 0。
  // model-picker 等既有弹层也是这么处理的，与它们保持一致。
  body: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  header: { gap: Spacing.xs, paddingBottom: Spacing.xs },
  centered: { textAlign: 'center' },
  // 一组选项 = 一张圆角卡；overflow hidden 让按压高亮不溢出圆角
  group: { borderRadius: Radius.lg, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth },
  // minHeight 52：动作行是这一屏唯一的触摸目标，给足面积；44 是下限不是目标值
  action: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
