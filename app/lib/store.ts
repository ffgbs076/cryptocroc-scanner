// app/lib/store.ts
// Simpele store wrapper: gebruikt Redis/KV als die bestaat, anders memory fallback.
// Doel: build laten slagen + routes hebben altijd iets om mee te werken.

type Json = any;

let mem = new Map<string, Json>();

async function getRedis() {
  // jouw project heeft app/lib/redis.ts
  // als die faalt (geen env), dan vallen we terug op memory
  try {
    const mod = await import("./redis");
    // verwacht dat redis.ts iets export zoals `redis` of `getRedis`
    // we proberen beide netjes:
    // @ts-ignore
    return mod.redis ?? (mod.getRedis ? await mod.getRedis() : null);
  } catch {
    return null;
  }
}

export async function storeGet<T = Json>(key: string): Promise<T | null> {
  const r = await getRedis();
  if (r?.get) {
    const v = await r.get(key);
    return (v ?? null) as T | null;
  }
  return (mem.get(key) ?? null) as T | null;
}

export async function storeSet(key: string, value: Json, ttlSeconds?: number) {
  const r = await getRedis();
  if (r?.set) {
    if (ttlSeconds) {
      // @ts-ignore
      await r.set(key, value, { ex: ttlSeconds });
    } else {
      await r.set(key, value);
    }
    return;
  }
  mem.set(key, value);
}

export async function storeDel(key: string) {
  const r = await getRedis();
  if (r?.del) {
    await r.del(key);
    return;
  }
  mem.delete(key);
}