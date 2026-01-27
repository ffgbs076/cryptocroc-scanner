// app/lib/store.ts
// Simpele in-memory store (werkt op Vercel zolang instance leeft).

type AnyVal = any;

declare global {
  // eslint-disable-next-line no-var
  var __CC_STORE__: Map<string, AnyVal> | undefined;
}

function getStore(): Map<string, AnyVal> {
  if (!globalThis.__CC_STORE__) globalThis.__CC_STORE__ = new Map<string, AnyVal>();
  return globalThis.__CC_STORE__;
}

export function storeGet<T = AnyVal>(key: string): T | null {
  const s = getStore();
  return s.has(key) ? (s.get(key) as T) : null;
}

export function storeSet<T = AnyVal>(key: string, value: T): void {
  const s = getStore();
  s.set(key, value);
}

export function storeDel(key: string): void {
  const s = getStore();
  s.delete(key);
}

export function storeIncr(key: string, by = 1): number {
  const cur = storeGet<number>(key) ?? 0;
  const next = cur + by;
  storeSet(key, next);
  return next;
}
