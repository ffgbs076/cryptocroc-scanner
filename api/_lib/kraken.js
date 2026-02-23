// api/_lib/kraken.js
// Weekly BTC candles from Kraken (XBT/USD) interval=10080 minutes

const URL =
  "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";

const WEEK_SEC = 7 * 24 * 60 * 60;

export async function getWeeklyBtcCandlesKraken() {
  const r = await fetch(URL, { headers: { accept: "application/json" } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Kraken OHLC failed: ${r.status} ${t}`);
  }
  const j = await r.json();
  if (j?.error?.length) throw new Error(`Kraken error: ${JSON.stringify(j.error)}`);

  const result = j.result || {};
  const pairKey = Object.keys(result).find((k) => k !== "last");
  if (!pairKey || !Array.isArray(result[pairKey])) {
    throw new Error("Kraken: unexpected response shape");
  }

  const now = Math.floor(Date.now() / 1000);

  const all = result[pairKey]
    .map((row) => {
      // [ time, open, high, low, close, vwap, volume, count ]
      const time = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[6]);

      if (![time, open, high, low, close].every(Number.isFinite)) return null;
      const closeTime = time + WEEK_SEC;

      return { time, open, high, low, close, volume, closeTime };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  // Truth = alleen gesloten weken
  const candlesTruth = all.filter((c) => c.closeTime <= now);

  // Live = truth + eventueel de huidige open week (als Kraken die al geeft)
  const lastTruthTime = candlesTruth.at(-1)?.time ?? 0;
  const liveExtras = all.filter((c) => c.time > lastTruthTime);
  const candlesWithLive = candlesTruth.concat(liveExtras);

  const hasLive = liveExtras.length > 0;

  return { candlesTruth, candlesWithLive, hasLive };
}