// api/_lib/kraken.js
// Kraken OHLC weekly candles (BTC/USD)
// interval=10080 minutes = 1 week

const KRAKEN_OHLC_URL = "https://api.kraken.com/0/public/OHLC";

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

export async function getWeeklyBtcCandlesKraken() {
  const url = `${KRAKEN_OHLC_URL}?pair=XBTUSD&interval=10080`;

  const r = await fetch(url, {
    headers: { "accept": "application/json" },
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Kraken HTTP ${r.status}: ${t || "no body"}`);
  }

  const j = await r.json();
  if (j?.error?.length) {
    throw new Error(`Kraken error: ${j.error.join(", ")}`);
  }

  const key = j?.result && Object.keys(j.result).find((k) => k !== "last");
  if (!key || !Array.isArray(j.result[key])) {
    throw new Error("Kraken response parse error (no OHLC array)");
  }

  const raw = j.result[key];

  // Kraken format:
  // [ time, open, high, low, close, vwap, volume, count ]
  const candles = raw
    .map((row) => {
      const time = toNum(row[0]);
      const open = toNum(row[1]);
      const high = toNum(row[2]);
      const low = toNum(row[3]);
      const close = toNum(row[4]);
      const volume = toNum(row[6]);

      if (![time, open, high, low, close].every(Number.isFinite)) return null;

      return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  if (candles.length < 60) {
    // 60 weken minimum zodat EMA/std/ATR zin heeft
    return {
      candlesTruth: candles,
      candlesWithLive: candles,
      hasLive: false,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const WEEK = 7 * 24 * 60 * 60;

  const last = candles[candles.length - 1];
  const lastEnd = last.time + WEEK;

  const hasLive = lastEnd > now; // laatste candle is huidige week (nog niet gesloten)
  const candlesTruth = hasLive ? candles.slice(0, -1) : candles.slice();
  const candlesWithLive = candles.slice();

  return { candlesTruth, candlesWithLive, hasLive };
}