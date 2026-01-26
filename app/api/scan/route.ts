// app/api/scan/route.ts
import { NextResponse } from "next/server";
import { getLastOrScan, scan } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sideQ = (url.searchParams.get("side") || "bull").toLowerCase();
    const force = url.searchParams.get("scan") === "1";

    const side = sideQ === "bear" ? "bear" : "bull";

    const data = force ? await scan(side) : await getLastOrScan(side);
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 200 } // NO 500: altijd JSON terug
    );
  }
}
