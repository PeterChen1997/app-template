import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { Colors } from '@/constants/theme';
import { DialogHost } from '@/features/dialog/dialog-host';
import { useStrings } from '@/hooks/use-locale';
import { useResolvedScheme } from '@/hooks/use-theme';

/**
 * expo-router 的约定导出：根布局导出 ErrorBoundary，整棵路由树的渲染异常
 * 都落到它这里，而不是白屏。生产包没有 LogBox，这是唯一的兜底。
 */
export { AppErrorBoundary as ErrorBoundary };

// 导航栏色板与 App 色板并轨：把 token 注入 expo-router 的 Theme，
// 消除「导航用 Dark/DefaultTheme、内容用 Colors」两套互不相干色系的割裂。
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
    },
  };
}

export default function RootLayout() {
  const { home } = useStrings();
  // 不直接读系统配色：外观偏好（跟随系统 / 始终浅色 / 始终深色）已经在
  // useResolvedScheme 里解析完，导航栏色板必须和内容色板走同一个结论。
  const scheme = useResolvedScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme(scheme)}>
          {/*
            全 App 唯一的弹窗宿主。挂在这里而不是各页面自己挂：弹窗多半发生在回调里
            （catch 到错误、菜单选完之后），那些地方没有 render 可言。
            它取代了 react-native 的 Alert / ActionSheetIOS——后者只能靠按钮关闭，
            点遮罩、点别处一概没反应，见 features/dialog/dialog-store 的文件头。
          */}
          <DialogHost />
          <Stack
            screenOptions={{
              // 去掉原生导航栏底部那条分隔线/阴影，与扁平调性一致。
              headerShadowVisible: false,
            }}>
            <Stack.Screen name="index" options={{ title: home.title }} />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
