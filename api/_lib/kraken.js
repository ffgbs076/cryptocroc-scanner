// api/_lib/kraken.js
// Kraken OHLC helper (BTC/USD).
// Compat: zowel NAMED exports als DEFAULT export, zodat imports nooit "undefined" zijn.

const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

async function fetchKrakenOHLC(pair, intervalMinutes) {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) throw new Error("fetch not available (Node runtime issue).");

  const url =
    `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${intervalMinutes}`;

  const r = await fetchFn(url, { headers: { accept: "application/json" } });
  const j = await r.json();

  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const result = j.result || {};
  const key = Object.keys(result).find((k) => k !== "last");
  if (!key) throw new Error("Kraken: missing result key");

  const rows = result[key];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Kraken: empty OHLC");

  return rows;
}

function rowsToCandles(rows, closeTimeSeconds) {
  return rows.map((row) => {
    const t = Number(row[0]); // open time (seconds)
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

function splitTruthVsLive(candles) {
  const nowSec = Math.floor(Date.now() / 1000);
  const last = candles[candles.length - 1];
  const hasLive = !!(last && nowSec < last.closeTime);

  return {
    candlesTruth: hasLive ? candles.slice(0, -1) : candles.slice(),
    candlesWithLive: candles,
    hasLive
  };
}

// ---- WEEKLY (10080 min) ----
async function getWeeklyBtcCandlesKraken() {
  const rows = await fetchKrakenOHLC("XBTUSD", 10080);
  const candles = rowsToCandles(rows, WEEK);
  return splitTruthVsLive(candles);
}

// ---- DAILY (1440 min) ----
async function getDailyBtcCandlesKraken() {
  const rows = await fetchKrakenOHLC("XBTUSD", 1440);
  const candles = rowsToCandles(rows, DAY);
  return splitTruthVsLive(candles);
}

// ✅ Named exports (wat jij nu gebruikt)
export { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken };

// ✅ Default export (fallback, zodat bundlers nooit “leeg” krijgen)
export default {
  getWeeklyBtcCandlesKraken,
  getDailyBtcCandlesKraken
};