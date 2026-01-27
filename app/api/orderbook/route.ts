// app/api/orderbook/route.ts
// Optioneel: proxy naar Binance depth

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase();

  if (!symbol) {
    return NextResponse.json(
      { ok: false, error: "missing symbol. Example: ?symbol=BTCUSDT" },
      { status: 400 }
    );
  }

  try {
    const r = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=100`,
      { cache: "no-store" }
    );
    const j = await r.json();
    return NextResponse.json({ ok: true, symbol, ts: Date.now(), data: j });
  } catch (e: any) {
    return NextResponse.json({ ok: false, symbol, error: String(e?.message || e) }, { status: 200 });
  }
}
