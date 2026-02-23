// api/_lib/kraken.js
// Kraken OHLC helper.
// Exporteert zowel weekly als daily, zodat je project niet crasht als ergens "daily" wordt gebruikt.

const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

async function fetchKrakenOHLC({ pair = "XBTUSD", intervalMinutes }) {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) throw new Error("fetch not available (Node runtime issue).");

  const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${intervalMinutes}`;

  const r = await fetchFn(url, { headers: { accept: "application/json" } });
  const j = await r.json();

  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const key = Object.keys(j.result || {}).find((k) => k !== "last");
  if (!key) throw new Error("Kraken: missing result key");

  const rows = j.result[key];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Kraken: empty OHLC");

  return rows;
}

function rowsToCandles(rows, closeTimeSeconds) {
  // rows: [time, open, high, low, close, vwap, volume, count]
  return rows.map((row) => {
    const t = Number(row[0]); // seconds
    return {
      time: t,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6]),
      closeTime: t + closeTimeSeconds
    };
  });
}

function splitTruthVsLive(candles, closeTimeSeconds) {
  const nowSec = Math.floor(Date.now() / 1000);
  const last = candles[candles.length - 1];

  // “Live” betekent: candle is nog niet gesloten.
  const hasLive = !!(last && nowSec < last.closeTime);

  const candlesWithLive = candles;
  const candlesTruth = hasLive ? candles.slice(0, -1) : candles.slice();

  return { candlesTruth, candlesWithLive, hasLive };
}

// -------------------- WEEKLY --------------------
export async function getWeeklyBtcCandlesKraken() {
  // 10080 minutes = 1 week
  const rows = await fetchKrakenOHLC({ pair: "XBTUSD", intervalMinutes: 10080 });
  const candles = rowsToCandles(rows, WEEK);
  return splitTruthVsLive(candles, WEEK);
}

// -------------------- DAILY --------------------
export async function getDailyBtcCandlesKraken() {
  // 1440 minutes = 1 day
  const rows = await fetchKrakenOHLC({ pair: "XBTUSD", intervalMinutes: 1440 });
  const candles = rowsToCandles(rows, DAY);
  return splitTruthVsLive(candles, DAY);
}