// app/api/hits/route.ts
export const runtime = "nodejs";

import { storeGet } from "@/app/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const side = (url.searchParams.get("side") || "bull").toLowerCase();

  const snap = await storeGet<any>(`snapshot:${side}`);

  const tables = snap?.tables || snap?.data?.tables || null;

  const counts = {
    entry: tables?.entry?.length ?? 0,
    almost: tables?.almost?.length ?? 0,
    buildup: tables?.buildup?.length ?? 0,
    radar: tables?.radar?.length ?? 0,
    runner: tables?.runner?.length ?? 0,
  };

  return Response.json({
    ok: true,
    side,
    ts: Date.now(),
    counts,
  });
}