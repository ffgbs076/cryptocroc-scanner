import fs from "fs";
import path from "path";

let kv: any = null;

// KV is optioneel: alleen gebruiken als env bestaat
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("@vercel/kv");
  kv = mod.kv;
} catch {
  kv = null;
}

const HAS_KV =
  !!process.env.KV_REST_API_URL &&
  !!process.env.KV_REST_API_TOKEN;

function tmpFile() {
  return path.join("/tmp", "cryptocroc-store.json");
}

function readTmp(): any {
  const f = tmpFile();
  try {
    if (!fs.existsSync(f)) return {};
    return JSON.parse(fs.readFileSync(f, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeTmp(obj: any) {
  const f = tmpFile();
  fs.writeFileSync(f, JSON.stringify(obj ?? {}, null, 2), "utf8");
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  // 1) KV (als aanwezig)
  if (kv && HAS_KV) {
    try {
      const v = await kv.get(key);
      if (v == null) return fallback;
      return v as T;
    } catch {
      // ga door naar tmp
    }
  }

  // 2) /tmp fallback
  const obj = readTmp();
  return (obj[key] ?? fallback) as T;
}

export async function setJSON(key: string, value: any): Promise<void> {
  // 1) KV (als aanwezig)
  if (kv && HAS_KV) {
    try {
      await kv.set(key, value);
      return;
    } catch {
      // ga door naar tmp
    }
  }

  // 2) /tmp fallback
  const obj = readTmp();
  obj[key] = value;
  writeTmp(obj);
}