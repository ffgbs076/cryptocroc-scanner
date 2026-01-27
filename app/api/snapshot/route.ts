// app/api/snapshot/route.ts
export const runtime = "nodejs";

import { storeGet } from "@/app/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const side = (url.searchParams.get("side") || "bull").toLowerCase();

  const data = await storeGet<any>(`snapshot:${side}`);

  return Response.json({
    ok: true,
    side,
    ts: Date.now(),
    data: data ?? null,
  });
}