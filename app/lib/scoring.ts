export type Coin = {
  id: string
  symbol: string
  name: string
  image: string
  market_cap: number | null
  total_volume: number | null
  circulating_supply: number | null
  total_supply: number | null
  max_supply: number | null
  price_change_percentage_24h: number | null
}

export type BtcContext = { btc24: number; btc7d: number }

export type FuturesMeta = {
  hasFutures: boolean
  futuresSymbol: string | null
  fundingRate: number | null        // raw (0.0001 etc)
  oiUsd: number | null
  oiToMcap: number | null
  longShortRatio: number | null     // <1 shorts >1 longs
}

export type CandleMeta = {
  hasCandles: boolean
  bbWidth: number | null
  atr: number | null
  volSpike: number | null
  breakoutUp: boolean
  breakdownDown: boolean
  trendUp: boolean
  trendDown: boolean
}

export function usd(x: number | null | undefined) {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  const v = Math.round(x)
  return "$" + v.toLocaleString("en-US")
}

export function pct(x: number, digits = 2) {
  if (!isFinite(x)) return "—"
  return x.toFixed(digits) + "%"
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function scoreFrom01(x: number) {
  return Math.round(clamp01(x) * 100)
}

function safeNum(x: any, d = 0) {
  const n = Number(x)
  return isFinite(n) ? n : d
}

// 9 filters -> we bouwen een “verwachtings-score”
// Bull: squeeze + volSpike + shorts + leverage + thin liquidity + context
export function scoreBull(coin: Coin, fut: FuturesMeta, btc: BtcContext, candles?: CandleMeta) {
  const reasons: string[] = []

  const mcap = safeNum(coin.market_cap, 0)
  const vol = safeNum(coin.total_volume, 0)
  const ch24 = safeNum(coin.price_change_percentage_24h, 0)

  // 1) lage liquiditeit (maar niet dood): volume/mcap laag is “thin”
  const vm = mcap > 0 ? vol / mcap : 0
  const thin = clamp01((0.15 - vm) / 0.15) // vm 0.00 ->1, vm 0.15->0
  if (thin > 0.6) reasons.push("THIN_LIQ")

  // 2) low/mid mcap
  const mcapScore = clamp01((500_000_000 - mcap) / 500_000_000) // <500m beter
  if (mcapScore > 0.6) reasons.push("LOW_MCAP")

  // 3) schaarste (max_supply bekend + circulating dicht bij max)
  let scarcity = 0
  if (coin.max_supply && coin.circulating_supply) {
    const ratio = coin.circulating_supply / coin.max_supply
    scarcity = clamp01((ratio - 0.6) / 0.4) // >0.6 richting 1
    if (scarcity > 0.6) reasons.push("SCARCE_SUPPLY")
  }

  // 4) shorts / leverage: funding neg + longShortRatio < 1 + hoge oi/mcap
  const funding = fut.fundingRate
  const fundingNeg = funding !== null ? clamp01((-funding) / 0.01) : 0 // -0.01 (=-1%) is max
  if (funding !== null && funding < 0) reasons.push("SHORTS_CROWDED")

  const lsr = fut.longShortRatio
  const shortsCrowded = lsr !== null ? clamp01((1 - lsr) / 0.5) : 0 // lsr 0.5 => 1
  if (lsr !== null && lsr < 1) reasons.push("LSR_SHORT_HEAVY")

  const oiToMcap = fut.oiToMcap
  const oiPressure = oiToMcap !== null ? clamp01((oiToMcap - 0.05) / 0.15) : 0 // 5%->0, 20%->1
  if (oiToMcap !== null && oiToMcap > 0.12) reasons.push("HIGH_OI")

  // 5) “geen retail vooraf” proxy: niet al mega gestegen in 24h
  const notPumped = clamp01((8 - Math.max(0, ch24)) / 8) // >8% = 0
  if (notPumped > 0.6) reasons.push("NOT_PUMPED")

  // 6) “surprise” proxy: breakout + volSpike samen
  let surprise = 0
  // 7) compressie: bbWidth laag
  let compress = 0
  // 8) volume explosie
  let ignition = 0
  // trend filter
  let trend = 0

  if (candles?.hasCandles) {
    const bbw = candles.bbWidth ?? 1
    compress = clamp01((0.06 - bbw) / 0.06) // bbwidth < 0.06 is strak
    if (compress > 0.6) reasons.push("VOL_COMPRESS")

    const vs = candles.volSpike ?? 1
    ignition = clamp01((vs - 1.5) / 2.5) // 1.5x->0, 4x->1
    if (ignition > 0.6) reasons.push("VOLUME_SPIKE")

    const bo = candles.breakoutUp ? 1 : 0
    surprise = clamp01(0.5 * bo + 0.5 * ignition)
    if (candles.breakoutUp) reasons.push("BREAKOUT_UP")

    trend = candles.trendUp ? 1 : 0
    if (candles.trendUp) reasons.push("TREND_UP")
  }

  // 9) marktcontext
  const ctx = clamp01((btc.btc24 + btc.btc7d * 0.5 + 2) / 6) // grof, -2..+4 => 0..1
  if (ctx > 0.6) reasons.push("BTC_RISK_ON")

  // gewicht (samen 1.00)
  const total01 =
    0.12 * thin +
    0.14 * mcapScore +
    0.06 * scarcity +
    0.14 * fundingNeg +
    0.10 * shortsCrowded +
    0.10 * oiPressure +
    0.10 * notPumped +
    0.12 * compress +
    0.12 * ignition +
    0.10 * ctx

  const score = scoreFrom01(total01)
  return { score, reasons }
}

// Bear: opposite: longs crowded + breakdown + volSpike + risk-off
export function scoreBear(coin: Coin, fut: FuturesMeta, btc: BtcContext, candles?: CandleMeta) {
  const reasons: string[] = []

  const mcap = safeNum(coin.market_cap, 0)
  const vol = safeNum(coin.total_volume, 0)
  const ch24 = safeNum(coin.price_change_percentage_24h, 0)

  const vm = mcap > 0 ? vol / mcap : 0
  const thin = clamp01((0.15 - vm) / 0.15)
  if (thin > 0.6) reasons.push("THIN_LIQ")

  const mcapScore = clamp01((500_000_000 - mcap) / 500_000_000)
  if (mcapScore > 0.6) reasons.push("LOW_MCAP")

  const funding = fut.fundingRate
  const fundingPos = funding !== null ? clamp01((funding) / 0.01) : 0
  if (funding !== null && funding > 0) reasons.push("LONGS_CROWDED")

  const lsr = fut.longShortRatio
  const longsCrowded = lsr !== null ? clamp01((lsr - 1) / 0.5) : 0
  if (lsr !== null && lsr > 1) reasons.push("LSR_LONG_HEAVY")

  const oiToMcap = fut.oiToMcap
  const oiPressure = oiToMcap !== null ? clamp01((oiToMcap - 0.05) / 0.15) : 0
  if (oiToMcap !== null && oiToMcap > 0.12) reasons.push("HIGH_OI")

  const alreadyRed = clamp01((Math.abs(Math.min(0, ch24)) - 2) / 10) // -2%..-12%
  if (ch24 < 0) reasons.push("DOWN_24H")

  let compress = 0
  let ignition = 0
  let surprise = 0
  let trend = 0

  if (candles?.hasCandles) {
    const bbw = candles.bbWidth ?? 1
    compress = clamp01((0.06 - bbw) / 0.06)
    if (compress > 0.6) reasons.push("VOL_COMPRESS")

    const vs = candles.volSpike ?? 1
    ignition = clamp01((vs - 1.5) / 2.5)
    if (ignition > 0.6) reasons.push("VOLUME_SPIKE")

    const bd = candles.breakdownDown ? 1 : 0
    surprise = clamp01(0.6 * bd + 0.4 * ignition)
    if (candles.breakdownDown) reasons.push("BREAKDOWN_DOWN")

    trend = candles.trendDown ? 1 : 0
    if (candles.trendDown) reasons.push("TREND_DOWN")
  }

  const ctx = clamp01(((-btc.btc24) + (-btc.btc7d) * 0.5 + 2) / 6)
  if (ctx > 0.6) reasons.push("BTC_RISK_OFF")

  const total01 =
    0.12 * thin +
    0.12 * mcapScore +
    0.16 * fundingPos +
    0.10 * longsCrowded +
    0.10 * oiPressure +
    0.10 * alreadyRed +
    0.12 * compress +
    0.12 * ignition +
    0.06 * surprise +
    0.10 * ctx

  const score = scoreFrom01(total01)
  return { score, reasons }
}
