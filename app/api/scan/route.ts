// app/api/scan/route.ts
export const runtime = "nodejs";

import { runScan } from "@/app/lib/scan";
import { storeSet } from "@/app/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const side = (url.searchParams.get("side") || "bull").toLowerCase();
  const force = url.searchParams.get("force") === "1";

  const data = await runScan({ side, force });

  // Bewaar laatste snapshot
  await storeSet(`snapshot:${side}`, data);

  return Response.json({ ok: true, side, ts: Date.now(), data });
}