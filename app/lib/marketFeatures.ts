import { fetchJsonCached } from "./fetchJson";

export type CandleFeatures = {
  hasCandles: boolean
  bbWidth: number | null
  atr: number | null
  volSpike: number | null
  breakoutUp: boolean
  breakdownDown: boolean
  trendUp: boolean
  trendDown: boolean
}

type Kline = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  string, // closeTime
  string, // quoteAssetVolume
  number, // trades
  string, // takerBuyBase
  string, // takerBuyQuote
  string  // ignore
];

function sma(arr: number[], len: number): number | null {
  if (arr.length < len) return null
  let s = 0
  for (let i = arr.length - len; i < arr.length; i++) s += arr[i]
  return s / len
}

function stdev(arr: number[], len: number): number | null {
  const m = sma(arr, len)
  if (m === null) return null
  let v = 0
  for (let i = arr.length - len; i < arr.length; i++) {
    const d = arr[i] - m
    v += d * d
  }
  return Math.sqrt(v / len)
}

function ema(arr: number[], len: number): number | null {
  if (arr.length < len) return null
  const k = 2 / (len + 1)
  let e = arr[arr.length - len]
  for (let i = arr.length - len + 1; i < arr.length; i++) {
    e = arr[i] * k + e * (1 - k)
  }
  return e
}

function trueRange(h: number, l: number, prevClose: number): number {
  const a = h - l
  const b = Math.abs(h - prevClose)
  const c = Math.abs(l - prevClose)
  return Math.max(a, b, c)
}

function atr(high: number[], low: number[], close: number[], len: number): number | null {
  if (close.length < len + 1) return null
  const trs: number[] = []
  for (let i = 1; i < close.length; i++) {
    trs.push(trueRange(high[i], low[i], close[i - 1]))
  }
  return sma(trs, len)
}

function highest(arr: number[], len: number): number | null {
  if (arr.length < len) return null
  let m = -Infinity
  for (let i = arr.length - len; i < arr.length; i++) m = Math.max(m, arr[i])
  return m
}

function lowest(arr: number[], len: number): number | null {
  if (arr.length < len) return null
  let m = Infinity
  for (let i = arr.length - len; i < arr.length; i++) m = Math.min(m, arr[i])
  return m
}

export async function getCandleFeatures(symbolUpper: string): Promise<CandleFeatures> {
  // Binance spot pair: SYMBOLUSDT
  const pair = symbolUpper + "USDT"
  const url = "https://api.binance.com/api/v3/klines?symbol=" + encodeURIComponent(pair) + "&interval=1h&limit=168"

  try {
    const data = await fetchJsonCached(url, { ttlMs: 60_000, retries: 1 }) as Kline[]
    if (!Array.isArray(data) || data.length < 60) {
      return { hasCandles: false, bbWidth: null, atr: null, volSpike: null, breakoutUp: false, breakdownDown: false, trendUp: false, trendDown: false }
    }

    const close = data.map(k => Number(k[4])).filter(n => isFinite(n))
    const high = data.map(k => Number(k[2])).filter(n => isFinite(n))
    const low  = data.map(k => Number(k[3])).filter(n => isFinite(n))
    const vol  = data.map(k => Number(k[5])).filter(n => isFinite(n))

    const bbLen = 20
    const mid = sma(close, bbLen)
    const sd = stdev(close, bbLen)
    const bbWidth = (mid !== null && sd !== null && mid > 0) ? ((2 * sd) / mid) : null

    const a = atr(high, low, close, 14)
    const volMA = sma(vol, 20)
    const volSpike = (volMA !== null && volMA > 0) ? (vol[vol.length - 1] / volMA) : null

    const emaFast = ema(close, 20)
    const emaSlow = ema(close, 50)

    const trendUp = emaFast !== null && emaSlow !== null ? emaFast > emaSlow : false
    const trendDown = emaFast !== null && emaSlow !== null ? emaFast < emaSlow : false

    const hh = highest(high, 50)
    const ll = lowest(low, 50)
    const lastClose = close[close.length - 1]

    const breakoutUp = hh !== null ? lastClose > hh : false
    const breakdownDown = ll !== null ? lastClose < ll : false

    return {
      hasCandles: true,
      bbWidth,
      atr: a,
      volSpike,
      breakoutUp,
      breakdownDown,
      trendUp,
      trendDown,
    }
  } catch {
    return { hasCandles: false, bbWidth: null, atr: null, volSpike: null, breakoutUp: false, breakdownDown: false, trendUp: false, trendDown: false }
  }
}
