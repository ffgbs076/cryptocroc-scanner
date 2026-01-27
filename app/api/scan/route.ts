// app/api/scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { forceScan, getLastOrScan, type Side } from "@/app/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSide(v: string | null): Side {
  return v === "bear" ? "bear" : "bull";
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const side = toSide(sp.get("side"));
    const doScan = sp.get("scan") === "1";

    const data = doScan ? await forceScan(side) : await getLastOrScan(side);

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 200 }
    );
  }
}