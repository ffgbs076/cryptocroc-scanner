// app/api/snapshot/route.ts

import { NextRequest, NextResponse } from "next/server";
import { storeGet, storeIncr } from "@/app/lib/store";
import type { Side, ScanResult } from "@/app/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  storeIncr("hits:api:snapshot", 1);

  const url = new URL(req.url);
  const side = (url.searchParams.get("side") || "bull").toLowerCase() as Side;

  if (side !== "bull" && side !== "bear") {
    return NextResponse.json({ ok: false, error: "side must be bull or bear" }, { status: 400 });
  }

  const snap = storeGet<ScanResult>(`snap:${side}`);
  return NextResponse.json({
    ok: true,
    side,
    ts: Date.now(),
    data: snap || null
  });
}
