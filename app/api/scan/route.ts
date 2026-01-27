// app/api/scan/route.ts
import { NextResponse } from "next/server";
import { scan } from "@/app/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sideParam = (url.searchParams.get("side") || "bull").toLowerCase();
  const side = sideParam === "bear" ? "bear" : "bull";

  const data = await scan(side);

  return NextResponse.json({
    ok: true,
    side,
    ts: Date.now(),
    data
  });
}
