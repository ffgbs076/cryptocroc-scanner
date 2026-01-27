// app/lib/redis.ts
// Super simpele in-memory store (werkt op Vercel & lokaal)

type Store = Map<string, any>;
let store: Store | null = null;

function getStore(): Store {
  if (!store) store = new Map();
  return store;
}

export function redisGet<T = any>(key: string): T | null {
  return getStore().get(key) ?? null;
}

export function redisSet<T = any>(key: string, value: T): void {
  getStore().set(key, value);
}

export function redisDel(key: string): void {
  getStore().delete(key);
}
