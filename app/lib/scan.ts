// app/lib/store.ts
export const runtime = "nodejs";

type JsonValue = any;

const URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  "";

const TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  "";

async function redis(cmd: string, ...args: string[]) {
  if (!URL || !TOKEN) return null;

  const safe = (s: string) => encodeURIComponent(s);
  const endpoint = `${URL}/${cmd}/${args.map(safe).join("/")}`;

  const r = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: "no-store",
  });

  if (!r.ok) return null;
  return r.json();
}

export async function storeGet<T = JsonValue>(key: string): Promise<T | null> {
  const res = await redis("get", key);
  if (!res || !("result" in res)) return null;

  const v = res.result;
  if (v == null) return null;

  try {
    return JSON.parse(v) as T;
  } catch {
    return v as T;
  }
}

export async function storeSet(key: string, value: JsonValue): Promise<boolean> {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const res = await redis("set", key, raw);
  return !!res;
}

export async function storeIncr(key: string, by = 1): Promise<number> {
  const res = await redis("incrby", key, String(by));
  if (!res || !("result" in res)) return 0;
  return Number(res.result) || 0;
}