// api/_lib/kraken.js
// Haalt BTC/USD weekly candles op bij Kraken en zet ze om naar numbers + unix seconds.

const KRAKEN_OHLC =
  "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080"; // 10080 = 1 week

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(`Kraken HTTP ${r.status}: ${JSON.stringify(j)}`);
  }
  if (!j || j.error?.length) {
    throw new Error(`Kraken error: ${JSON.stringify(j?.error || j)}`);
  }
  return j;
}

function normalizeKrakenOHLC(row) {
  // row: [time, open, high, low, close, vwap, volume, count]
  const time = Number(row[0]); // seconds
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);

  if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) return null;

  return { time, open, high, low, close };
}

// Simpele “is week candle gesloten?” check:
// Kraken levert soms een lopende week mee. Wij willen standaard alleen gesloten weken.
function filterClosedWeeks(candles) {
  if (!candles.length) return candles;

  const nowSec = Math.floor(Date.now() / 1000);
  const weekSec = 7 * 24 * 60 * 60;

  // Als laatste candle minder dan ~6 dagen oud is, is die waarschijnlijk nog lopend.
  const last = candles[candles.length - 1];
  if (nowSec - last.time < weekSec - 3600) {
    return candles.slice(0, -1);
  }
  return candles;
}

async function getWeeklyBtcCandlesKraken({ includeCurrentWeek = false } = {}) {
  const j = await fetchJson(KRAKEN_OHLC);

  // Kraken geeft key terug zoals "XXBTZUSD" of "XBTUSD" afhankelijk van pair mapping.
  const resultKey = Object.keys(j.result).find((k) => k !== "last");
  const rows = j.result[resultKey] || [];

  let candles = rows.map(normalizeKrakenOHLC).filter(Boolean);

  // Sorteren voor zekerheid
  candles.sort((a, b) => a.time - b.time);

  if (!includeCurrentWeek) candles = filterClosedWeeks(candles);

  return candles;
}

module.exports = { getWeeklyBtcCandlesKraken };