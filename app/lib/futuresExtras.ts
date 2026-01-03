import { fetchJsonCached } from "./fetchJson";

export async function getGlobalLongShortRatio(symbol: string): Promise<number | null> {
  // Binance futures: ratio < 1 = meer shorts, > 1 = meer longs
  const url =
    "https://fapi.binance.com/futures/data/globalLongShortAccountRatio" +
    "?symbol=" + encodeURIComponent(symbol) +
    "&period=1h&limit=2"

  try {
    const arr = await fetchJsonCached(url, { ttlMs: 60_000, retries: 1 }) as any[]
    const last = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null
    const r = Number(last?.longShortRatio)
    return isFinite(r) ? r : null
  } catch {
    return null
  }
}
