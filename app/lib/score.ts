export type Side = "bull" | "bear"

export type FilterBreakdown = {
  liq: number
  mcap: number
  supply: number
  shorts: number
  noRetail: number
  news: number
  compress: number
  volSpike: number
  context: number
  ob: number
}

export type ScoredCoin = {
  symbol: string
  score: number
  tpPct: number
  tpPrice: number
  horizon: string
  breakdown: FilterBreakdown
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round = (v: number, d = 4) => {
  const p = Math.pow(10, d)
  return Math.round(v * p) / p
}

function stdev(values: number[]) {
  const n = values.length
  if (n < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / n
  const v = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)
  return Math.sqrt(v)
}

function bollWidth(closes: number[], len = 20, mult = 2) {
  if (closes.length < len + 5) return 0
  const slice = closes.slice(-len)
  const ma = slice.reduce((a, b) => a + b, 0) / len
  const sd = stdev(slice)
  const upper = ma + mult * sd
  const lower = ma - mult * sd
  return ma !== 0 ? (upper - lower) / ma : 0
}

// 0–10 mapping helpers
function scoreLowIsGood(x: number, lo: number, hi: number) {
  if (!isFinite(x)) return 5
  const t = clamp((hi - x) / (hi - lo), 0, 1)
  return Math.round(t * 10)
}
function scoreHighIsGood(x: number, lo: number, hi: number) {
  if (!isFinite(x)) return 5
  const t = clamp((x - lo) / (hi - lo), 0, 1)
  return Math.round(t * 10)
}

export function scoreCoin(input: {
  side: Side
  symbol: string
  markPrice: number

  // Binance
  quoteVolume24h: number
  trades24h: number
  fundingRate: number
  openInterestUsd: number
  obBidNotional: number
  obAskNotional: number
  thinUp: boolean

  // price action
  closes4h: number[]
  vol4h: number[]
  btcContextBull: boolean

  // CoinGecko (optioneel)
  marketCapUsd?: number
  circulatingSupply?: number
  maxSupply?: number
  cgTrendingScore?: number // 0..10
  cgPriceChange24hPct?: number // %
}): { breakdown: FilterBreakdown; total: number; tpPct: number; tpPrice: number; horizon: string } {
  const {
    side,
    markPrice,
    quoteVolume24h,
    trades24h,
    fundingRate,
    openInterestUsd,
    obBidNotional,
    obAskNotional,
    thinUp,
    closes4h,
    vol4h,
    btcContextBull,
    marketCapUsd,
    circulatingSupply,
    maxSupply,
    cgTrendingScore,
    cgPriceChange24hPct
  } = input

  // 1) Lage liquiditeit (low-mid volume beter)
  const liq = scoreLowIsGood(quoteVolume24h, 2_000_000, 400_000_000)

  // 2) Lage tot mid market cap (CoinGecko, anders neutraal)
  const mcap = marketCapUsd && marketCapUsd > 0
    ? scoreLowIsGood(marketCapUsd, 30_000_000, 20_000_000_000)
    : 5

  // 3) Schaarste / supply
  // - liever: maxSupply bestaat + relatief laag + nog niet volledig uitgegeven
  // - als maxSupply ontbreekt: gebruik circulatingSupply als ruwe proxy
  let supplyScore = 5
  if (circulatingSupply && circulatingSupply > 0) {
    // laag aantal coins => schaarser
    const scarcityByCirculating = scoreLowIsGood(circulatingSupply, 5_000_000, 5_000_000_000)

    let headroom = 5
    if (maxSupply && maxSupply > 0) {
      const ratio = circulatingSupply / maxSupply // 0..1
      // als ratio lager is (veel “headroom”): vaak narrative/expansie, maar ook dump-risico.
      // wij geven middenweg: beste rond 0.6–0.85
      const best = 1 - Math.abs(ratio - 0.75) / 0.75 // 1 bij 0.75, aflopend
      headroom = Math.round(clamp(best, 0, 1) * 10)
    }
    supplyScore = Math.round(clamp((scarcityByCirculating + headroom) / 2, 0, 10))
  }
  const supply = supplyScore

  // 4) Veel shorts / hoge leverage
  // bull: negatieve funding = shorts crowded
  // bear: positieve funding = longs crowded
  const fundingCrowd =
    side === "bull"
      ? scoreHighIsGood(-fundingRate, 0.0000, 0.0040)
      : scoreHighIsGood(fundingRate, 0.0000, 0.0040)

  const oiPressure = scoreHighIsGood(openInterestUsd / Math.max(1, quoteVolume24h), 0.02, 0.35)
  const shorts = Math.round(clamp((fundingCrowd + oiPressure) / 2, 0, 10))

  // 5) Geen retail-positie vooraf (proxy)
  // Veel kleine trades = retail druk (slechter). We willen: minder trades per volume + grotere avg trade size.
  const avgTradeUsd = quoteVolume24h > 0 && trades24h > 0 ? quoteVolume24h / trades24h : 0
  const retailCrowdBySmallTrades = scoreLowIsGood(avgTradeUsd, 80, 5000) // hoger avgTrade = minder retail => hoger score
  const retailCrowdByTooManyTrades = scoreLowIsGood(trades24h, 20_000, 600_000) // minder trades = beter
  const noRetail = Math.round(clamp((retailCrowdBySmallTrades + retailCrowdByTooManyTrades) / 2, 0, 10))

  // 6) Verrassing / nieuws / narratief
  // CoinGecko trending geeft bonus, plus “surprise” via grote 24h move (proxy)
  const trend = clamp(Math.round((cgTrendingScore ?? 0)), 0, 10)
  const absMove = Math.abs(cgPriceChange24hPct ?? 0)
  const surprise = scoreHighIsGood(absMove, 2, 20) // >20% = max
  const news = Math.round(clamp((trend + surprise) / 2, 0, 10))

  // 7) Volatility compressie
  const bw = bollWidth(closes4h, 20, 2)
  const compress = scoreLowIsGood(bw, 0.01, 0.12)

  // 8) Volume explosie (4h)
  const lastVol = vol4h.length ? vol4h[vol4h.length - 1] : 0
  const avgVol = vol4h.length ? vol4h.reduce((a, b) => a + b, 0) / vol4h.length : 0
  const spike = avgVol > 0 ? lastVol / avgVol : 1
  const volSpike = scoreHighIsGood(spike, 1.0, 4.0)

  // 9) Marktcontext (BTC trend)
  const context =
    side === "bull" ? (btcContextBull ? 10 : 3) : (!btcContextBull ? 10 : 3)

  // 10) Orderboek
  const totalOb = obBidNotional + obAskNotional
  const imbalance = totalOb > 0 ? (obBidNotional - obAskNotional) / totalOb : 0
  const obRaw = side === "bull" ? imbalance : -imbalance
  const obBase = scoreHighIsGood(obRaw, -0.10, 0.35)
  const ob = clamp(obBase + (thinUp ? 1 : 0), 0, 10)

  const breakdown: FilterBreakdown = {
    liq,
    mcap,
    supply,
    shorts,
    noRetail,
    news,
    compress,
    volSpike,
    context,
    ob
  }

  const totalScore =
    breakdown.liq +
    breakdown.mcap +
    breakdown.supply +
    breakdown.shorts +
    breakdown.noRetail +
    breakdown.news +
    breakdown.compress +
    breakdown.volSpike +
    breakdown.context +
    breakdown.ob

  // TP (week–maand) conservatief: liever eroverheen
  const tpPct =
    totalScore >= 80 ? 0.14 :
    totalScore >= 75 ? 0.12 :
    totalScore >= 70 ? 0.10 :
    totalScore >= 65 ? 0.08 :
    totalScore >= 60 ? 0.06 : 0.05

  const tpPrice = side === "bull" ? markPrice * (1 + tpPct) : markPrice * (1 - tpPct)
  const horizon = totalScore >= 75 ? "1–3 weken" : "2–6 weken"

  return {
    breakdown,
    total: totalScore,
    tpPct: Math.round(tpPct * 100),
    tpPrice: round(tpPrice, 8),
    horizon
  }
}
