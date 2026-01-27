// app/api/scan/route.ts
import { NextResponse } from "next/server";
import { scan } from "@/app/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // bull/bear via query: ?side=bull of ?side=bear (default bull)
  const sideParam = (url.searchParams.get("side") || "bull").toLowerCase();
  const side = sideParam === "bear" ? "bear" : "bull";

  // force scan via ?force=1 (anders ook gewoon scannen)
  const force = url.searchParams.get("force") === "1";

  // Simpel: altijd scan uitvoeren (stabiel, geen type-gedoe)
  // Als jij later caching wil, bouwen we dat netjes terug.
  const data = await scan(side);

  return NextResponse.json({
    ok: true,
    side,
    forced: force,
    ts: Date.now(),
    data,
  });
}
