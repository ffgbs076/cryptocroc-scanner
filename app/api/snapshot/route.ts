export const runtime = "nodejs";

import { getSnapshot } from "@/lib/scan";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const side = (url.searchParams.get("side") || "bull") as "bull" | "bear";
  const snap = await getSnapshot(side);
  return Response.json(snap);
}