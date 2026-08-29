// 语言目录的形状与内容护栏。
//
// ── 为什么需要运行时测试（tsc 不是已经管了吗）────────────────────────────────
//
// `core/i18n/index.ts` 的 `Record<Locale, Catalog>` 确实在**编译期**逼着每门语言
// 逐键对齐，少一个键 tsc 就报错。但它管不到两类事，而这两类正是翻译最常见的错法：
//   1. 值是空串——键在、类型对、渲染出来是一片空白；
//   2. 插值函数把占位符吞了——`{count} tools` 写成 `tools`，数字凭空消失。
// 这两条只能靠真的调一次、看输出。

import { catalogs } from '@/core/i18n';
import type { Locale } from '@/core/i18n';

const LOCALES: Locale[] = ['zh-Hans', 'en'];

/** 把目录压平成 `a.b.c` → 值，用于逐键比对。 */
function flatten(node: unknown, prefix: string, out: Map<string, unknown>): void {
  if (typeof node !== 'object' || node === null) {
    out.set(prefix, node);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    if (typeof v === 'function' || typeof v !== 'object' || v === null) {
      out.set(path, v);
      continue;
    }
    flatten(v, path, out);
  }
}

function flat(locale: Locale): Map<string, unknown> {
  const out = new Map<string, unknown>();
  flatten(catalogs[locale], '', out);
  return out;
}

describe('语言目录的形状', () => {
  test('每门语言的键集完全一致', () => {
    const base = [...flat('zh-Hans').keys()].sort();
    for (const locale of LOCALES) {
      expect([...flat(locale).keys()].sort()).toEqual(base);
    }
  });

  test('每个叶子要么是非空字符串，要么是函数', () => {
    for (const locale of LOCALES) {
      for (const [path, value] of flat(locale)) {
        if (typeof value === 'function') continue;
        expect(`${locale}:${path}:${typeof value}`).toBe(`${locale}:${path}:string`);
        expect(`${locale}:${path}:${String(value).length > 0}`).toBe(`${locale}:${path}:true`);
      }
    }
  });

  test('同名叶子在各语言里的类型一致（不会一边是字符串一边是函数）', () => {
    const base = flat('zh-Hans');
    for (const locale of LOCALES) {
      for (const [path, value] of flat(locale)) {
        expect(`${locale}:${path}:${typeof value}`).toBe(`${locale}:${path}:${typeof base.get(path)}`);
      }
    }
  });
});

describe('插值函数不吞占位符', () => {
  // WHY：翻译时最容易把 `{count} 个工具` 写成 `some tools` —— 键在、类型对、
  // tsc 全绿，但用户看到的数字没了。这里对每个插值函数喂一组**可识别**的实参，
  // 断言它们都出现在输出里。
  //
  // 实参类型不从签名读（运行时读不到 TS 类型），改成把几种形状都试一遍：
  // 只要有一种能跑通且标记全在输出里，就说明占位符没被吞。函数拒绝某种形状
  // （抛异常）不算失败——那只是喂错了类型。
  const MARK_N = 987654;
  const MARK_S = 'ZZMARKZZ';
  const SHAPES: unknown[] = [MARK_N, MARK_S, [MARK_S]];

  /** 一个实参在输出里应该长什么样。数组走 join(', ')/join('、')，只验元素本身。 */
  function needle(v: unknown): string {
    return Array.isArray(v) ? String(v.at(0)) : String(v);
  }

  test.each(LOCALES)('%s 的每个插值函数都把实参带进了输出', (locale) => {
    const cat = catalogs[locale];
    const offenders: string[] = [];

    // 目录是「命名空间 → 键 → 叶子」两层结构，插值函数在第二层
    for (const [ns, section] of Object.entries(cat)) {
      if (typeof section !== 'object' || section === null) continue;
      for (const [name, fn] of Object.entries(section)) {
        if (typeof fn !== 'function') continue;

        const ok = SHAPES.some((shape) => {
          const args = Array.from({ length: fn.length }, () => shape);
          let out: string;
          try {
            // Reflect.apply 而不是 fn(...args)：这里的 fn 在运行时只知道是 Function，
            // 展开调用要求元组类型，而实参形状本来就是这条测试要试出来的
            out = String(Reflect.apply(fn, undefined, args));
          } catch {
            return false; // 这个形状喂错了类型，换下一个
          }
          return args.every((a) => out.includes(needle(a)));
        });
        if (!ok) offenders.push(`${locale}.${ns}.${name}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('英文目录确实是英文', () => {
  // WHY：漏翻的表现不是报错，而是英文界面里冒出一句中文——tsc 与上面的形状测试
  // 都发现不了。这里扫 CJK 字符，只放行**刻意保留**的条目：典型如语言自称
  // （语言选择页上「简体中文」必须写成中文，否则看不懂英文的人切不回去）。
  const CJK = /[一-鿿]/;
  /** 刻意保留中文的 en 目录键（`a.b` 路径）。模板暂无；加语言选择页时把自称放进来。 */
  const INTENTIONAL = new Set<string>([]);

  test('豁免名单本身没有过期（每条都还真的含中文）', () => {
    // 名单是白名单，白名单最危险的失效方式是「条目已经不含中文了却还留着」——
    // 那它就从豁免变成了一个再也不检查的盲区。
    const flatEn = flat('en');
    for (const path of INTENTIONAL) {
      expect(`${path}:${flatEn.has(path)}`).toBe(`${path}:true`);
      expect(`${path}:${CJK.test(String(flatEn.get(path)))}`).toBe(`${path}:true`);
    }
  });

  test('除刻意保留的条目外，en 目录里没有中文', () => {
    const offenders: string[] = [];
    for (const [path, value] of flat('en')) {
      if (typeof value !== 'string' || INTENTIONAL.has(path)) continue;
      if (CJK.test(value)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});
