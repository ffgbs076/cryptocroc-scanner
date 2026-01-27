// app/lib/redis.ts
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function getRedis() {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // We gooien hier GEEN error, want store.ts kan fallback doen.
    // Alleen als iemand direct getRedis() gebruikt zonder env, dan faalt het.
    throw new Error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  }

  _redis = new Redis({ url, token });
  return _redis;
}