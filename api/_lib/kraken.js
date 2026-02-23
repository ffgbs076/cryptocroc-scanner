const KRAKEN_BASE = "https://api.kraken.com/0/public/OHLC";
const WEEK_INTERVAL_MIN = 10080; // 7 dagen

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeKrakenOhlc(row) {
  // row: [ time, open, high, low, close, vwap, volume, count ]
  const t = toNum(row[0]);
  const o = toNum(row[1]);
  const h = toNum(row[2]);
  const l = toNum(row[3]);
  const c = toNum(row[4]);
  if (t == null || o == null || h == null || l == null || c == null) return null;
  return { time: t, open: o, high: h, low: l, close: c };
}

export async function getWeeklyBtcCandlesKraken() {
  // Kraken pair naming: XBTUSD is meestal goed
  // (soms XXBTZUSD, maar XBTUSD werkt vaak in public endpoints)
  const url = `${KRAKEN_BASE}?pair=XBTUSD&interval=${WEEK_INTERVAL_MIN}`;

  const r = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Kraken OHLC failed: ${r.status} ${txt}`);
  }

  const json = await r.json();
  if (json?.error?.length) throw new Error(`Kraken error: ${json.error.join(", ")}`);

  const resultObj = json?.result || {};
  const pairKey = Object.keys(resultObj).find((k) => k !== "last");
  const rows = pairKey ? resultObj[pairKey] : null;
  if (!Array.isArray(rows) || rows.length < 50) {
    throw new Error("Kraken returned not enough weekly data");
  }

  const candlesAll = rows
    .map(normalizeKrakenOhlc)
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  // Live candle detectie: laatste week is niet gesloten als "nu" nog binnen die week valt
  const now = Math.floor(Date.now() / 1000);
  const weekSec = WEEK_INTERVAL_MIN * 60;

  const last = candlesAll[candlesAll.length - 1];
  const lastCloseTime = last.time + weekSec;
  const hasLive = lastCloseTime > now; // nog niet gesloten

  const candlesTruth = hasLive ? candlesAll.slice(0, -1) : candlesAll;
  const candlesWithLive = candlesAll;

  return { candlesTruth, candlesWithLive, hasLive };
}