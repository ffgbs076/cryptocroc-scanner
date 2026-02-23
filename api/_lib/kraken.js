// api/_lib/kraken.js
// Fetch weekly BTC candles from Kraken (XBT/USD), interval = 10080 minutes (1 week)

const KRAKEN_OHLC =
  "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";

export async function getWeeklyBtcCandlesKraken({ includeCurrentWeek = false } = {}) {
  const res = await fetch(KRAKEN_OHLC, {
    headers: { accept: "application/json" }
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Kraken OHLC failed: ${res.status} ${t}`);
  }

  const json = await res.json();
  if (!json || json.error?.length) {
    throw new Error(`Kraken OHLC error: ${JSON.stringify(json?.error || [])}`);
  }

  // Kraken returns { result: { XBTUSD: [...], last: ... } }
  const result = json.result || {};
  const pairKey = Object.keys(result).find((k) => k !== "last");
  if (!pairKey || !Array.isArray(result[pairKey])) {
    throw new Error("Kraken OHLC: unexpected response shape");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const weekSec = 7 * 24 * 60 * 60;

  const candles = result[pairKey]
    .map((row) => {
      // [ time, open, high, low, close, vwap, volume, count ]
      const time = Number(row[0]); // seconds
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[6]);
      const closeTime = time + weekSec;

      if (!Number.isFinite(time) || !Number.isFinite(close)) return null;
      if (!(high >= low)) return null;
      if (!(high >= open && high >= close && high >= low)) return null;
      if (!(low <= open && low <= close && low <= high)) return null;

      return { time, open, high, low, close, volume, closeTime };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  if (includeCurrentWeek) return candles;
  return candles.filter((c) => c.closeTime <= nowSec);
}