// api/_lib/kraken.js
export async function getOhlcKraken({ intervalMinutes }) {
  const pair = "XBTUSD";
  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${intervalMinutes}`;

  const r = await fetch(url, { headers: { accept: "application/json" } });
  const j = await r.json();

  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const key = Object.keys(j.result).find(k => k !== "last");
  const rows = j.result[key] || [];

  // Kraken row: [time, open, high, low, close, vwap, volume, count]
  const candles = rows.map(row => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6]),
  }));

  // Kraken geeft soms de laatste candle als "lopende" candle mee.
  // We maken een "truth" versie: laatste candle weg als hij nog niet volledig gesloten is.
  const now = Math.floor(Date.now() / 1000);
  const dur = intervalMinutes * 60;

  const last = candles[candles.length - 1];
  const lastCloseTime = last ? (last.time + dur) : 0;

  const hasLive = Boolean(last && lastCloseTime > now);

  const candlesTruth = hasLive ? candles.slice(0, -1) : candles.slice();
  const candlesWithLive = candles.slice();

  return { candlesTruth, candlesWithLive, hasLive, intervalMinutes };
}

export async function getWeeklyBtcCandlesKraken() {
  // 10080 = 1 week in minutes (Kraken ondersteunt dit)
  return getOhlcKraken({ intervalMinutes: 10080 });
}

export async function getDailyBtcCandlesKraken() {
  // 1440 = 1 day
  return getOhlcKraken({ intervalMinutes: 1440 });
}