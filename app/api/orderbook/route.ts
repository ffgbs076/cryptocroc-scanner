// app/api/orderbook/route.ts
import { NextResponse } from "next/server";
import { analyzeDepth } from "@/lib/orderbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const bids = Array.isArray(body?.bids) ? body.bids : [];
  const asks = Array.isArray(body?.asks) ? body.asks : [];

  const result = analyzeDepth(bids, asks);
  return NextResponse.json({ ok: true, result });
}
