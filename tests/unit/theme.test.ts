// 设计 token 的契约测试。
//
// WHY：token 是全 App 的视觉地基，坏法全是静默的——漏配一个键是运行时 undefined
// 颜色（RN 不报错，画出来是透明/黑）、写错一位 hex 是肉眼难辨的脏色、
// 字号阶梯乱序是排版隐性劣化。这些 tsc 都不管，只能在这里钉住。
// 新 App 替换 Colors 之后，把「冻结值」段落改成自己的品牌色再让它变绿。

import { Colors, Elevation, Motion, Radius, Spacing, TypeScale } from '@/constants/theme';

// theme.ts 只从这两个包取 Platform.select / StyleSheet.hairlineWidth / Easing.bezier，
// node 环境加载不了真模块，按用到的最小面 mock。
jest.mock('react-native', () => ({
  Platform: {
    select: (options: { ios?: unknown; android?: unknown; default?: unknown }) =>
      options.ios ?? options.default,
  },
  StyleSheet: { hairlineWidth: 0.5 },
}));
jest.mock('react-native-reanimated', () => ({
  Easing: { bezier: (...args: number[]) => ({ curve: 'bezier', args }) },
}));

const HEX = /^#[0-9A-Fa-f]{6}$/;
const RGBA = /^rgba\(\d+, \d+, \d+, 0?\.\d+\)$/;

describe('Colors', () => {
  test('亮暗两套键集合完全一致（漏配一个键 = 某个模式下运行时 undefined 颜色）', () => {
    expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
  });

  test('每个颜色值都是合法 hex 或 rgba（遮罩允许半透明）', () => {
    for (const [scheme, palette] of Object.entries(Colors)) {
      for (const [key, value] of Object.entries(palette)) {
        expect(`${scheme}.${key}:${HEX.test(value) || RGBA.test(value)}`).toBe(
          `${scheme}.${key}:true`,
        );
      }
    }
  });

  test('关键语义值冻结（改品牌色是显式决策，不是手滑）', () => {
    expect(Colors.light.background).toBe('#FFFFFF');
    expect(Colors.light.primary).toBe('#3157E6');
    expect(Colors.dark.background).toBe('#08111F');
    expect(Colors.dark.primary).toBe('#2F6BFF');
    // onPrimary 在两个模式下都要压得住 primary
    expect(Colors.light.onPrimary).toBe('#FFFFFF');
    expect(Colors.dark.onPrimary).toBe('#FFFFFF');
  });
});

describe('TypeScale', () => {
  const ORDER = [
    'caption',
    'footnote',
    'subhead',
    'callout',
    'body',
    'title3',
    'title2',
    'title1',
    'largeTitle',
  ];

  test('恰好这几档、fontSize 严格递增', () => {
    expect(Object.keys(TypeScale)).toEqual(ORDER);
    const sizes = ORDER.map((k) => Object.entries(TypeScale).find(([n]) => n === k)?.at(1));
    for (let i = 1; i < sizes.length; i += 1) {
      const prev = sizes.at(i - 1);
      const curr = sizes.at(i);
      expect(
        prev !== undefined &&
          curr !== undefined &&
          typeof prev !== 'string' &&
          typeof curr !== 'string' &&
          curr.fontSize > prev.fontSize,
      ).toBe(true);
    }
  });

  test('每档 lineHeight > fontSize（行高小于字号会裁字）', () => {
    for (const [name, spec] of Object.entries(TypeScale)) {
      expect(`${name}:${spec.lineHeight > spec.fontSize}`).toBe(`${name}:true`);
    }
  });
});

describe('Spacing / Radius', () => {
  test('间距全部落在 4 栅格上且严格升序', () => {
    const values = Object.values(Spacing);
    expect(values.every((v) => v > 0 && v % 4 === 0)).toBe(true);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  test('圆角冻结值', () => {
    expect(Radius).toEqual({ sm: 8, md: 12, lg: 16, xl: 20, pill: 999 });
  });
});

describe('Motion', () => {
  test('三档时长严格递增', () => {
    expect(Motion.durationFast).toBeLessThan(Motion.durationBase);
    expect(Motion.durationBase).toBeLessThan(Motion.durationSlow);
  });

  test('按压缩放在 (0.9, 1) 之间：肉眼可感、又不至于夸张', () => {
    expect(Motion.pressScale).toBeGreaterThan(0.9);
    expect(Motion.pressScale).toBeLessThan(1);
  });

  test('弹簧参数齐全（damping/stiffness 都是正数）', () => {
    for (const spring of [Motion.springPress, Motion.springSheet, Motion.springLayout]) {
      expect(spring.damping).toBeGreaterThan(0);
      expect(spring.stiffness).toBeGreaterThan(0);
    }
  });
});

describe('Elevation', () => {
  test('亮暗两套形状一致（都含 shadow* 与 border*，消费点直接展开进 style）', () => {
    expect(Object.keys(Elevation.light).sort()).toEqual(Object.keys(Elevation.dark).sort());
    for (const level of ['raised', 'overlay'] as const) {
      expect(Object.keys(Elevation.light[level]).sort()).toEqual(
        Object.keys(Elevation.dark[level]).sort(),
      );
    }
  });

  test('深色下由描边承担边界（hairline > 0），浅色下不描边', () => {
    expect(Elevation.dark.raised.borderWidth).toBeGreaterThan(0);
    expect(Elevation.dark.overlay.borderWidth).toBeGreaterThan(0);
    expect(Elevation.light.raised.borderWidth).toBe(0);
    expect(Elevation.light.overlay.borderWidth).toBe(0);
  });
});
