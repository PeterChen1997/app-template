// core/domain/guards：所有 JSON.parse / 网络响应收窄的唯一入口。
// WHY：项目规范禁止 `as` 断言，这些守卫就是唯一的类型边界——它们放行错的东西，
// 错的东西就会以「已收窄」的身份流进 domain 层。

import {
  getArray,
  getBoolean,
  getNumber,
  getRecord,
  getString,
  isRecord,
  parseJson,
  safeParseJson,
} from '@/core/domain/guards';

describe('isRecord', () => {
  it('放行普通对象与无原型对象', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it('拒绝 null / 数组 / 原始值 / 函数', () => {
    // WHY：数组必须被拒——JSON 顶层是数组时若按 Record 处理，后续 getString 会静默返回
    // undefined，错误被推迟到很远的地方才暴露。
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(0)).toBe(false);
    expect(isRecord(false)).toBe(false);
    expect(isRecord(() => undefined)).toBe(false);
  });

  it('放行 Date / Error 等对象实例（typeof object 即可）', () => {
    expect(isRecord(new Date())).toBe(true);
    expect(isRecord(new Error('boom'))).toBe(true);
  });
});

describe('getString', () => {
  it('命中字符串（含空串）', () => {
    expect(getString({ a: 'v' }, 'a')).toBe('v');
    expect(getString({ a: '' }, 'a')).toBe('');
  });

  it('类型不符或缺键时返回 undefined', () => {
    expect(getString({ a: 1 }, 'a')).toBeUndefined();
    expect(getString({ a: null }, 'a')).toBeUndefined();
    expect(getString({}, 'a')).toBeUndefined();
  });

  it('能读到原型链上的属性', () => {
    // WHY：errors.ts 用 getString(e, 'name') 判断 AbortError，而 name 来自 Error.prototype。
    // 这里刻意走 isRecord 收窄（而不是 as 断言），顺带验证守卫组合可用。
    const err: unknown = new Error('boom');
    expect(isRecord(err) && getString(err, 'name')).toBe('Error');
    const aborted: unknown = new DOMException('aborted', 'AbortError');
    expect(isRecord(aborted) && getString(aborted, 'name')).toBe('AbortError');
  });
});

describe('getNumber', () => {
  it('命中有限数（含 0 与负数）', () => {
    expect(getNumber({ a: 0 }, 'a')).toBe(0);
    expect(getNumber({ a: -3.5 }, 'a')).toBe(-3.5);
  });

  it('拒绝 NaN / Infinity / 数字字符串', () => {
    // WHY：usage 的 token 数一旦是 NaN，会一路污染到计费统计且不会抛错。
    expect(getNumber({ a: Number.NaN }, 'a')).toBeUndefined();
    expect(getNumber({ a: Number.POSITIVE_INFINITY }, 'a')).toBeUndefined();
    expect(getNumber({ a: '12' }, 'a')).toBeUndefined();
    expect(getNumber({}, 'a')).toBeUndefined();
  });
});

describe('getBoolean', () => {
  it('只放行真正的布尔值', () => {
    expect(getBoolean({ a: true }, 'a')).toBe(true);
    expect(getBoolean({ a: false }, 'a')).toBe(false);
    expect(getBoolean({ a: 1 }, 'a')).toBeUndefined();
    expect(getBoolean({ a: 'true' }, 'a')).toBeUndefined();
    expect(getBoolean({}, 'a')).toBeUndefined();
  });
});

describe('getRecord', () => {
  it('命中嵌套对象', () => {
    expect(getRecord({ a: { b: 1 } }, 'a')).toEqual({ b: 1 });
  });

  it('拒绝数组 / null / 原始值', () => {
    expect(getRecord({ a: [] }, 'a')).toBeUndefined();
    expect(getRecord({ a: null }, 'a')).toBeUndefined();
    expect(getRecord({ a: 'x' }, 'a')).toBeUndefined();
    expect(getRecord({}, 'a')).toBeUndefined();
  });
});

describe('getArray', () => {
  it('命中数组（含空数组）', () => {
    expect(getArray({ a: [] }, 'a')).toEqual([]);
    expect(getArray({ a: [1, 'x'] }, 'a')).toEqual([1, 'x']);
  });

  it('拒绝对象 / null / 缺键', () => {
    expect(getArray({ a: {} }, 'a')).toBeUndefined();
    expect(getArray({ a: null }, 'a')).toBeUndefined();
    expect(getArray({}, 'a')).toBeUndefined();
  });
});

describe('parseJson / safeParseJson', () => {
  it('parseJson 对非法输入抛错', () => {
    expect(() => parseJson('{oops')).toThrow(SyntaxError);
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('safeParseJson 非法输入返回 undefined 而不抛', () => {
    expect(safeParseJson('{oops')).toBeUndefined();
    expect(safeParseJson('')).toBeUndefined();
    expect(safeParseJson('undefined')).toBeUndefined();
  });

  it('safeParseJson 对合法 JSON 原样返回，包括 null 与标量', () => {
    // WHY：null 与「解析失败」是两回事。调用方若用 `?? fallback` 兜底，
    // 合法的 JSON null 会被误当成失败——这个区别必须被锁住。
    expect(safeParseJson('null')).toBeNull();
    expect(safeParseJson('0')).toBe(0);
    expect(safeParseJson('false')).toBe(false);
    expect(safeParseJson('"s"')).toBe('s');
    expect(safeParseJson('[1,2]')).toEqual([1, 2]);
    expect(safeParseJson('{"a":{"b":"中文"}}')).toEqual({ a: { b: '中文' } });
  });
});
