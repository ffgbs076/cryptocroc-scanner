import { NextResponse } from "next/server"
import { redis } from "@/app/lib/redis"

type Side = "bull" | "bear"
type Snap = { t: number; top10: string[] }

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000

function key(side: Side) {
  return `cc:snaps:${side}`
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const side = (searchParams.get("side") === "bear" ? "bear" : "bull") as Side

    const now = Date.now()
    const raw = (await redis.get<Snap[]>(key(side))) ?? []
    const snaps = raw.filter(s => now - s.t <= LOOKBACK_MS)

    // prune terugschrijven (houd redis netjes)
    if (snaps.length !== raw.length) {
      await redis.set(key(side), snaps)
    }

    const hits: Record<string, number> = {}
    for (const s of snaps) {
      for (const sym of s.top10) {
        hits[sym] = (hits[sym] ?? 0) + 1
      }
    }

    return NextResponse.json({
      ok: true,
      side,
      snapCount: snaps.length,
      hits,
      lastTs: snaps.length ? snaps[snaps.length - 1].t : null
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
