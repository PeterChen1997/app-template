// 文本密钥脱敏（§9）。放在 core 是因为 errors.ts（core）与 logger（infrastructure）
// 都需要同一套规则 —— 两份实现会漂移，这里是唯一出处。

/** `Bearer xxx` —— 保留 scheme 便于排查，只抹掉凭证本身。 */
const BEARER_PATTERN = /\bbearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

/** OpenAI 家族 `sk-` / `sk-ant-` / `sk-or-` 前缀 Key。 */
const SK_PREFIX_PATTERN = /\bsk-[A-Za-z0-9._-]{8,}/gi;

/** 长度 ≥ 20 的连续 base64 / base64url / hex 串候选。 */
const LONG_TOKEN_PATTERN = /[A-Za-z0-9+/_-]{20,}={0,2}/g;

/**
 * 判断一个长串是否像密钥而不是普通英文长单词。
 * 命中任一即视为密钥：含 base64 专有符号 / 数字字母混排 / 纯 hex。
 * 宁可多抹（可读性下降）也不能漏抹（密钥泄露）。
 */
function looksLikeSecretToken(run: string): boolean {
  if (/[+/=]/.test(run)) return true;
  if (/^[0-9a-fA-F]+$/.test(run)) return true;
  return /[0-9]/.test(run) && /[A-Za-z]/.test(run);
}

/** 对任意文本做密钥脱敏。 */
export function redactText(text: string): string {
  return text
    .replace(BEARER_PATTERN, 'Bearer ***')
    .replace(SK_PREFIX_PATTERN, '***')
    .replace(LONG_TOKEN_PATTERN, (run) => (looksLikeSecretToken(run) ? '***' : run));
}
