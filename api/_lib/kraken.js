// api/_lib/kraken.js
// Haalt weekly BTC candles van Kraken.
// Geeft:
// - candlesTruth: alleen gesloten weken
// - candlesWithLive: inclusief huidige (lopende) week als Kraken die al teruggeeft
// - hasLive: true als laatste candle nog niet gesloten is

export async function getWeeklyBtcCandlesKraken() {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) throw new Error("fetch not available (Node runtime issue).");

  // Kraken OHLC: interval in minuten. 10080 = 1 week
  // Pair: XBTUSD (BTC/USD)
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";

  const r = await fetchFn(url, { headers: { "accept": "application/json" } });
  const j = await r.json();
  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const key = Object.keys(j.result).find(k => k !== "last");
  if (!key) throw new Error("Kraken: missing result key");
  const rows = j.result[key];

  const candles = rows.map(row => {
    // [time, open, high, low, close, vwap, volume, count]
    const t = Number(row[0]); // seconds
    return {
      time: t,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6]),
      closeTime: t + 7 * 24 * 60 * 60 // rough weekly closeTime
    };
  });

  // Kraken kan de lopende week al includen. We checken of die gesloten is.
  const nowSec = Math.floor(Date.now() / 1000);
  const last = candles[candles.length - 1];
  const hasLive = last && nowSec < last.closeTime;

  const candlesWithLive = candles;
  const candlesTruth = hasLive ? candles.slice(0, -1) : candles.slice();

  return { candlesTruth, candlesWithLive, hasLive };
}