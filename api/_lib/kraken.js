// api/_lib/kraken.js
// ✅ Exports: getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken
// ✅ Uses Kraken OHLC (XBTUSD). Weekly interval = 10080 min, Daily = 1440 min.

const KRAKEN_BASE = "https://api.kraken.com/0/public/OHLC";
const PAIR = "XBTUSD";

const DAY_SEC = 24 * 60 * 60;
const WEEK_SEC = 7 * DAY_SEC;

// Simple in-memory cache (works per warm lambda)
const cache = new Map(); // key -> { at, ttlMs, value }

function cacheGet(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.at > v.ttlMs) return null;
  return v.value;
}
function cacheSet(key, value, ttlMs) {
  cache.set(key, { at: Date.now(), ttlMs, value });
}

async function fetchKrakenOHLC(intervalMinutes) {
  const key = `ohlc:${PAIR}:${intervalMinutes}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = `${KRAKEN_BASE}?pair=${encodeURIComponent(PAIR)}&interval=${intervalMinutes}`;
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Kraken HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json?.error?.length) {
    throw new Error(`Kraken error: ${json.error.join(", ")}`);
  }

  const result = json?.result || {};
  const pairKey = Object.keys(result).find(k => k !== "last");
  if (!pairKey) throw new Error("Kraken: pair key not found in result");

  const rows = result[pairKey];
  if (!Array.isArray(rows) || rows.length < 10) throw new Error("Kraken: not enough OHLC rows");

  // Kraken row:
  // [ time, open, high, low, close, vwap, volume, count ]
  const candles = rows.map(r => ({
    time: Number(r[0]), // seconds
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6]),
  }));

  // Sort & de-dup
  candles.sort((a, b) => a.time - b.time);
  const dedup = [];
  for (const c of candles) {
    if (!dedup.length || dedup[dedup.length - 1].time !== c.time) dedup.push(c);
  }

  // cache 10 minutes
  cacheSet(key, dedup, 10 * 60 * 1000);
  return dedup;
}

function splitTruthVsLive(all, tfSec) {
  if (!all.length) return { candlesTruth: [], candlesWithLive: [], hasLive: false };

  const now = Math.floor(Date.now() / 1000);
  const last = all[all.length - 1];
  const lastCloseTime = last.time + tfSec; // candle start + tfSec
  const hasLive = now < lastCloseTime;

  const candlesWithLive = all;
  const candlesTruth = hasLive ? all.slice(0, -1) : all;

  return { candlesTruth, candlesWithLive, hasLive };
}

export async function getWeeklyBtcCandlesKraken() {
  const all = await fetchKrakenOHLC(10080); // 1w in minutes
  return splitTruthVsLive(all, WEEK_SEC);
}

export async function getDailyBtcCandlesKraken() {
  const all = await fetchKrakenOHLC(1440); // 1d in minutes
  return splitTruthVsLive(all, DAY_SEC);
}