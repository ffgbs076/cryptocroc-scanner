export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const side = (url.searchParams.get("side") || "bull") as "bull" | "bear";

  return Response.json({
    side,
    mode: side === "bull" ? "BULL" : "BEAR",
    btc24: 0,
    updatedAt: Date.now(),
    radar: [],
    buildup: [],
    almost: [],
    entry: [],
    holdSell: [],
    note: "Snapshot stub. Straks komt dit uit KV state."
  });
}