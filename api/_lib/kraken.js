// api/_lib/kraken.js
// Kraken OHLC helper (weekly + daily), zonder dependencies.

const KRAKEN_OHLC = "https://api.kraken.com/0/public/OHLC";

// Kraken pair codes: XBTUSD is de standaard BTC/USD
const PAIR = "XBTUSD";

function toCandle(row) {
  // row: [time, open, high, low, close, vwap, volume, count]
  return {
    time: Number(row[0]), // unix seconds
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6])
  };
}

async function fetchOhlc({ intervalMinutes }) {
  const url = `${KRAKEN_OHLC}?pair=${PAIR}&interval=${intervalMinutes}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Kraken OHLC failed: ${r.status}`);
  const j = await r.json();
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  // result key is not always "XBTUSD" (Kraken sometimes returns "XXBTZUSD")
  const result = j.result || {};
  const pairKey = Object.keys(result).find((k) => k !== "last");
  if (!pairKey) throw new Error("Kraken: no result pair key");

  const rows = result[pairKey] || [];
  const candles = rows.map(toCandle).sort((a, b) => a.time - b.time);

  return candles;
}

function splitTruthAndLive(candles, intervalSec) {
  if (!candles.length) return { candlesTruth: [], candlesWithLive: [], hasLive: false };

  const last = candles[candles.length - 1];
  const nowSec = Math.floor(Date.now() / 1000);

  // candle is live if its interval hasn't fully elapsed yet
  const isLive = nowSec < (last.time + intervalSec);

  const candlesTruth = isLive ? candles.slice(0, -1) : candles.slice();
  const candlesWithLive = candles.slice();

  return { candlesTruth, candlesWithLive, hasLive: isLive };
}

// ✅ Weekly (1w) candles
export async function getWeeklyBtcCandlesKraken() {
  // Kraken interval uses minutes. 1 week = 10080 minutes
  const intervalMinutes = 10080;
  const intervalSec = intervalMinutes * 60;

  const candles = await fetchOhlc({ intervalMinutes });
  return splitTruthAndLive(candles, intervalSec);
}

// ✅ Daily (1d) candles (BESTAAT NU, dus je error is weg)
export async function getDailyBtcCandlesKraken() {
  const intervalMinutes = 1440;
  const intervalSec = intervalMinutes * 60;

  const candles = await fetchOhlc({ intervalMinutes });
  return splitTruthAndLive(candles, intervalSec);
}