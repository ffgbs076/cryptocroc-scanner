export type OrderbookSignal = "CONFIRM" | "NEUTRAL" | "CONFLICT"

export type OrderbookResult = {
  symbol: string
  midPrice: number
  bidNotional: number
  askNotional: number
  imbalance: number
  thinUp: boolean
  signal: OrderbookSignal
  reason: string
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : fallback
}

/**
 * Binance depth response: { bids: [[price, qty], ...], asks: [[price, qty], ...] }
 * We compute notional = price * qty for top N levels.
 */
export function analyzeDepth(
  symbol: string,
  bids: Array<[string, string]>,
  asks: Array<[string, string]>,
  levels = 20
): OrderbookResult {
  const topBids = bids.slice(0, levels)
  const topAsks = asks.slice(0, levels)

  const bestBid = topBids.length ? safeNum(topBids[0][0]) : 0
  const bestAsk = topAsks.length ? safeNum(topAsks[0][0]) : 0
  const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : Math.max(bestBid, bestAsk)

  let bidNotional = 0
  let askNotional = 0

  for (const [p, q] of topBids) {
    const price = safeNum(p)
    const qty = safeNum(q)
    bidNotional += price * qty
  }
  for (const [p, q] of topAsks) {
    const price = safeNum(p)
    const qty = safeNum(q)
    askNotional += price * qty
  }

  const denom = bidNotional + askNotional
  const imbalance = denom > 0 ? (bidNotional - askNotional) / denom : 0 // -1..+1

  // Thin liquidity check: are first few asks very small compared to median ask size?
  // Simple proxy: if sum of top 5 ask notional is tiny, upside can move fast.
  let askTop5 = 0
  for (const [p, q] of topAsks.slice(0, 5)) {
    askTop5 += safeNum(p) * safeNum(q)
  }
  const thinUp = askTop5 > 0 ? askTop5 < (askNotional * 0.15) : false

  // Decision rules (simple & stable)
  // Bull confirm: imbalance >= +0.12 OR thinUp true
  // Bear confirm: imbalance <= -0.12
  // Neutral otherwise
  let signal: OrderbookSignal = "NEUTRAL"
  let reason = "Orderbook is mixed"

  if (imbalance >= 0.12 || thinUp) {
    signal = "CONFIRM"
    reason = thinUp ? "Upside liquidity looks thin (can run fast)" : "Bid side stronger than ask side"
  } else if (imbalance <= -0.12) {
    signal = "CONFLICT"
    reason = "Ask side stronger than bid side"
  }

  return {
    symbol,
    midPrice: mid,
    bidNotional,
    askNotional,
    imbalance,
    thinUp,
    signal,
    reason
  }
}
