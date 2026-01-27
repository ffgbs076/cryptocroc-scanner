export const runtime = "nodejs";

import { kv } from "@vercel/kv";

const KEY = "cryptocroc:hits";

export async function GET() {
  let hits = 0;
  try {
    hits = (await kv.incr(KEY)) as number;
  } catch {
    hits = 0;
  }
  return Response.json({ ok: true, hits, ts: Date.now() });
}