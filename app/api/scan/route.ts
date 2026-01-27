// app/api/scan/route.ts

import { NextRequest, NextResponse } from "next/server";
import { forceScan, getLastOrScan, type Side } from "@/app/lib/scan";
import { storeIncr } from "@/app/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  storeIncr("hits:api:scan", 1);

  const url = new URL(req.url);
  const side = (url.searchParams.get("side") || "bull").toLowerCase() as Side;
  const force = url.searchParams.get("force") === "1";

  if (side !== "bull" && side !== "bear") {
    return NextResponse.json({ ok: false, error: "side must be bull or bear" }, { status: 400 });
  }

  try {
    const data = force ? await forceScan(side) : await getLastOrScan(side);

    return NextResponse.json({
      ok: true,
      side,
      forced: force,
      ts: Date.now(),
      data
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, side, error: String(e?.message || e) },
      { status: 200 }
    );
  }
}
