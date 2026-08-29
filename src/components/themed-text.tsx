import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'caption'
    | 'footnote'
    | 'small'
    | 'smallBold'
    | 'title3'
    | 'title2'
    | 'title'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const isLink = type === 'link' || type === 'linkPrimary';

  return (
    <Text
      style={[
        { color: theme[themeColor ?? (isLink ? 'primary' : 'text')] },
        type === 'default' && styles.default,
        type === 'caption' && styles.caption,
        type === 'footnote' && styles.footnote,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'title3' && styles.title3,
        type === 'title2' && styles.title2,
        type === 'title' && styles.title,
        type === 'subtitle' && styles.subtitle,
        isLink && styles.link,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  caption: {
    ...TypeScale.caption,
    fontWeight: 400,
  },
  footnote: {
    ...TypeScale.footnote,
    fontWeight: 400,
  },
  small: {
    ...TypeScale.callout,
    fontWeight: 400,
  },
  smallBold: {
    ...TypeScale.callout,
    fontWeight: 600,
  },
  default: {
    ...TypeScale.body,
    fontWeight: 400,
  },
  title3: {
    ...TypeScale.title3,
    fontWeight: 600,
  },
  title2: {
    ...TypeScale.title2,
    fontWeight: 600,
  },
  // 三个 tab 大标题统一到 title1（28/34/700），替代此前 28–48 混用
  subtitle: {
    ...TypeScale.title1,
    fontWeight: 700,
  },
  title: {
    ...TypeScale.largeTitle,
    fontWeight: 700,
  },
  link: {
    ...TypeScale.callout,
    fontWeight: 500,
  },
  code: {
    ...TypeScale.footnote,
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
  },
});
