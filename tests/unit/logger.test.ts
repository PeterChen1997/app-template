// §9 要求：秘钥脱敏是 CI 必过的测试，不是口头约定。
// 注入假 Key，断言 logger 的 ring buffer 与文本脱敏输出都不含它。

import { redactText } from '@/core/security/redact';
import { clearLogs, getRecentLogs, log, redactMeta } from '@/infrastructure/logger';

const FAKE_SK_KEY = 'sk-test-DEADBEEF0123456789abcdefghijklmnop';
const FAKE_BEARER = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';

describe('redactText（core/security/redact）', () => {
  it('sk- 前缀 Key 被抹掉', () => {
    expect(redactText(`Incorrect API key provided: ${FAKE_SK_KEY}.`)).not.toContain(FAKE_SK_KEY);
  });

  it('Bearer 凭证被抹掉但保留 scheme', () => {
    const out = redactText(`header was ${FAKE_BEARER}`);
    expect(out).toContain('Bearer ***');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('长 hex / 数字字母混排串被抹掉', () => {
    expect(redactText('id=0123456789abcdef0123456789abcdef')).not.toContain(
      '0123456789abcdef0123456789abcdef',
    );
    expect(redactText('token a1b2c3d4e5f6g7h8i9j0k1l2')).not.toContain('a1b2c3d4e5f6g7h8i9j0k1l2');
  });

  it('普通英文长单词不被误抹', () => {
    expect(redactText('internationalization considerations')).toBe(
      'internationalization considerations',
    );
  });
});

describe('redactMeta', () => {
  it('键名含 key/token/secret/authorization 时整值替换', () => {
    const out = redactMeta({
      apiKey: 'plain-value',
      Authorization: 'whatever',
      refreshToken: 'x',
      clientSecret: 'y',
      modelId: 'gpt-5-mini',
    });
    expect(out).toEqual({
      apiKey: '***',
      Authorization: '***',
      refreshToken: '***',
      clientSecret: '***',
      modelId: 'gpt-5-mini',
    });
  });

  it('嵌套对象与数组里的秘钥形态值同样被抹', () => {
    const out = redactMeta({ nested: { headers: [`x ${FAKE_SK_KEY}`] } });
    expect(JSON.stringify(out)).not.toContain(FAKE_SK_KEY);
  });
});

describe('log / ring buffer', () => {
  beforeEach(() => {
    clearLogs();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('message 与 meta 落入 ring buffer 前已脱敏（注入假 Key 断言全量 dump 不含它）', () => {
    log.info('llm.stream', `auth failed for ${FAKE_SK_KEY}`, { apiKey: FAKE_SK_KEY });
    log.error('llm.stream', 'header dump', { authorization: FAKE_BEARER });
    const dump = JSON.stringify(getRecentLogs());
    expect(dump).not.toContain(FAKE_SK_KEY);
    expect(dump).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(dump).toContain('auth failed for');
  });

  it('clearLogs 清空后 getRecentLogs 为空', () => {
    log.info('t', 'x');
    clearLogs();
    expect(getRecentLogs()).toHaveLength(0);
  });
});
