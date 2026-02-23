const KRAKEN_OHLC = "https://api.kraken.com/0/public/OHLC";

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function fetchOhlc(pair, intervalMinutes) {
  const url = `${KRAKEN_OHLC}?pair=${encodeURIComponent(pair)}&interval=${intervalMinutes}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Kraken OHLC failed: HTTP ${r.status}`);

  const j = await r.json();
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const key = Object.keys(j.result || {}).find((k) => k !== "last");
  if (!key) throw new Error("Kraken payload missing result pair key");

  const rows = j.result[key];
  if (!Array.isArray(rows) || rows.length < 10)
    throw new Error("Kraken returned not enough rows");

  // row: [time, open, high, low, close, vwap, volume, count]
  const candles = rows
    .map((row) => {
      const t = toNum(row[0]);
      const o = toNum(row[1]);
      const h = toNum(row[2]);
      const l = toNum(row[3]);
      const c = toNum(row[4]);
      const v = toNum(row[6]);
      if ([t, o, h, l, c].some((x) => x == null)) return null;
      return { time: t, open: o, high: h, low: l, close: c, volume: v ?? 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  return candles;
}

/**
 * Weekly (1w) candles, met truth + live (lopende week)
 */
export async function getWeeklyBtcCandlesKraken() {
  // Weekly = 10080 minutes
  const candles = await fetchOhlc("XBTUSD", 10080);

  const now = Math.floor(Date.now() / 1000);
  const WEEK = 7 * 24 * 60 * 60;

  const last = candles[candles.length - 1];
  const lastEnd = last.time + WEEK;
  const hasLive = now < lastEnd;

  const candlesTruth = hasLive ? candles.slice(0, -1) : candles.slice();
  const candlesWithLive = candles.slice();

  return { candlesTruth, candlesWithLive, hasLive };
}

/**
 * Daily (1d) candles (soms nodig door andere code). Geen truth/live split nodig.
 */
export async function getDailyBtcCandlesKraken() {
  // Daily = 1440 minutes
  const candles = await fetchOhlc("XBTUSD", 1440);
  return candles;
}