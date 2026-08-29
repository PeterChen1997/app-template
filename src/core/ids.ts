// 本地 ID 生成（ULID）。
//
// Hermes 没有内置 crypto.getRandomValues，ulid 的自动 PRNG 探测在真机上直接抛
// PRNG_DETECT。本地数据的主键只需要唯一性、不需要密码学强度，因此显式注入
// Math.random 作为 PRNG（monotonicFactory 保证同毫秒内单调递增，单设备无碰撞）。
// ⚠️ 任何安全相关的随机值（token、密钥）都不许用本模块。

import { monotonicFactory } from 'ulid';

export const newId: () => string = monotonicFactory(() => Math.random());
