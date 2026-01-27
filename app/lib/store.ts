// app/lib/store.ts
// 1 centrale opslaglaag.
// Werkt met Redis (Upstash) als die env vars bestaan.
// Anders fallback naar lokale db.ts (sqlite file) als jij die hebt.

import { getRedis } from "@/app/lib/redis";
import * as db from "@/app/lib/db";

type AnyJson = any;

function hasRedisEnv() {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

export async function storeGet<T = AnyJson>(key: string): Promise<T | null> {
  // 1) Redis eerst (production)
  if (hasRedisEnv()) {
    const redis = getRedis();
    const v = await redis.get<T>(key);
    return (v ?? null) as T | null;
  }

  // 2) Fallback naar db.ts (local / old setup)
  // db.ts moet dan functies hebben: kvGet/kvSet of get/set
  // We proberen beide varianten netjes.
  const anyDb: any = db as any;

  if (typeof anyDb.kvGet === "function") return (await anyDb.kvGet(key)) ?? null;
  if (typeof anyDb.get === "function") return (await anyDb.get(key)) ?? null;

  return null;
}

export async function storeSet(key: string, value: AnyJson): Promise<void> {
  if (hasRedisEnv()) {
    const redis = getRedis();
    await redis.set(key, value);
    return;
  }

  const anyDb: any = db as any;

  if (typeof anyDb.kvSet === "function") {
    await anyDb.kvSet(key, value);
    return;
  }
  if (typeof anyDb.set === "function") {
    await anyDb.set(key, value);
    return;
  }

  // Als db.ts geen set heeft, dan doen we niks (maar build crasht niet)
}