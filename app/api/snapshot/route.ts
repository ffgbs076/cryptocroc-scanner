import { NextResponse } from "next/server"
import { redis } from "@/app/lib/redis"

type Side = "bull" | "bear"
type Snap = { t: number; top10: string[] }

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000

function key(side: Side) {
  return `cc:snaps:${side}`
}

/**
 * Snapshot pakt de Top10 van jouw live scan.
 * We halen die uit jouw eigen endpoint /api/scan.
 */
async function getTop10(side: Side, baseUrl: string) {
  const r = await fetch(`${baseUrl}/api/scan?side=${side}&show=10`, { cache: "no-store" })
  const j = await r.json()
  if (!j?.ok) throw new Error(`scan failed: ${JSON.stringify(j)}`)
  const items = j.items ?? []
  return items.slice(0, 10).map((x: any) => String(x.symbol))
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const side = (searchParams.get("side") === "bear" ? "bear" : "bull") as Side

    // Base URL bepalen (werkt op Vercel + lokaal)
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"

    const now = Date.now()

    const top10 = await getTop10(side, baseUrl)

    const raw = (await redis.get<Snap[]>(key(side))) ?? []
    const pruned = raw.filter(s => now - s.t <= LOOKBACK_MS)
    pruned.push({ t: now, top10 })

    await redis.set(key(side), pruned)

    return NextResponse.json({ ok: true, side, saved: true, snapCount: pruned.length, top10 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
