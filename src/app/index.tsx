// 占位首页：演示文案（useStrings）与 token 的取用方式。新 App 从这里开始替换。
//
// 根 View 的 testID 是 .maestro/smoke.yaml 的锚点，改名要连冒烟流程一起改。

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useStrings } from '@/hooks/use-locale';

export default function HomeScreen() {
  const { home } = useStrings();
  return (
    <ThemedView style={styles.container} testID="home-screen">
      <View style={styles.body}>
        <ThemedText type="title">{home.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{home.greeting('__APP_NAME__')}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg },
});
