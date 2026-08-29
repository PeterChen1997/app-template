/**
 * AppErrorBoundary —— 渲染期异常的兜底屏。
 *
 * 为什么必须有：生产包里没有 LogBox，任何一次未捕获的渲染异常都会让整个
 * App 变成白屏，用户唯一的出路是杀进程重开——而数据其实完好无损。
 * 接进 expo-router 的 `ErrorBoundary` 约定（从 _layout 导出同名组件），
 * retry 由路由层提供：它会重挂当前 segment，不需要重启 App。
 *
 * 错误详情**必须过脱敏**再展示：异常消息可能来自任意一层，包括带着
 * Authorization 头的 fetch 失败——这是全 App 唯一一处把原始异常给用户看的地方。
 */
import type { ErrorBoundaryProps } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { redactText } from '@/core/security/redact';
import { useStrings } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

/** 展示上限：栈可以很长，兜底屏不该变成一面日志墙 */
const MAX_DETAIL_CHARS = 1500;

function describe(error: Error): string {
  const stack = typeof error.stack === 'string' ? error.stack : '';
  const raw = stack.length > 0 ? stack : `${error.name}: ${error.message}`;
  return redactText(raw).slice(0, MAX_DETAIL_CHARS);
}

export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { errorBoundary: strings } = useStrings();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.body}>
          <ThemedText type="title">{strings.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{strings.message}</ThemedText>

          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={strings.retry}
            onPress={() => void retry()}
            style={[styles.retry, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
              {strings.retry}
            </ThemedText>
          </PressableScale>

          <ScrollView
            style={[
              styles.details,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
            contentContainerStyle={styles.detailsContent}>
            <ThemedText type="code" themeColor="textSecondary">
              {describe(error)}
            </ThemedText>
          </ScrollView>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  retry: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  details: {
    maxHeight: 260,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  detailsContent: { padding: Spacing.md },
});
