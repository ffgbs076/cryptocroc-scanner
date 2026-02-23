const KRAKEN_OHLC =
  "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080"; // 10080 min = 1 week

function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }

export async function getWeeklyBtcCandlesKraken(){
  const r = await fetch(KRAKEN_OHLC, {
    headers: { "accept": "application/json" }
  });
  const j = await r.json();

  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  // Result key is dynamic (pair name). We pakken de eerste key behalve "last".
  const result = j.result || {};
  const pairKey = Object.keys(result).find(k => k !== "last");
  const rows = pairKey ? result[pairKey] : [];

  // Kraken row:
  // [time, open, high, low, close, vwap, volume, count]
  const candlesAll = rows
    .map(row => ({
      time: toNum(row[0]),
      open: toNum(row[1]),
      high: toNum(row[2]),
      low: toNum(row[3]),
      close: toNum(row[4]),
      volume: toNum(row[6])
    }))
    .filter(c => c.time && c.open != null && c.high != null && c.low != null && c.close != null)
    .sort((a,b) => a.time - b.time);

  const now = Math.floor(Date.now() / 1000);
  const WEEK = 7 * 24 * 60 * 60;

  // Closed candle = start + WEEK <= now
  const candlesTruth = candlesAll.filter(c => (c.time + WEEK) <= now);

  // Live candle = last candle that is not closed (if exists)
  const last = candlesAll[candlesAll.length - 1];
  const lastIsClosed = last ? ((last.time + WEEK) <= now) : true;
  const hasLive = !!last && !lastIsClosed;

  const candlesWithLive = hasLive ? candlesTruth.concat([last]) : candlesTruth;

  return { candlesTruth, candlesWithLive, hasLive };
}