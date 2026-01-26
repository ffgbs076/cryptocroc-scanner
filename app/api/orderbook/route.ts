import { NextResponse } from "next/server"
import { analyzeDepth } from "@/lib/orderbook"

type BinanceDepth = {
  bids: Array<[string, string]>
  asks: Array<[string, string]>
}

// simpele cache (scheelt rate-limit)
const cache = new Map<string, { t: number; data: any }>()
const TTL_MS = 5000

export async function GET(req: Request) {
  const url = new URL(req.url)
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim()

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 })
  }

  const key = symbol
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.t < TTL_MS) {
    return NextResponse.json(hit.data)
  }

  // Binance USD-M Futures depth endpoint
  const depthUrl = `https://fapi.binance.com/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=50`

  let depth: BinanceDepth
  try {
    const r = await fetch(depthUrl, { cache: "no-store" })
    if (!r.ok) {
      return NextResponse.json({ error: `Binance error: ${r.status}` }, { status: 502 })
    }
    depth = (await r.json()) as BinanceDepth
  } catch {
    return NextResponse.json({ error: "Failed to fetch depth" }, { status: 502 })
  }

  const result = analyzeDepth(symbol, depth.bids || [], depth.asks || [], 20)
  const payload = { ok: true, ...result }

  cache.set(key, { t: now, data: payload })
  return NextResponse.json(payload)
}
