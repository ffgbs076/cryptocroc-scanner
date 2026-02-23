// /api/forest.js
// Forest BTC Weekly (Kraken) — closed weeks by default (non-repaint)
// Returns: candles[], forest[] (z-score smoothed), turningPoints[]
// No external dependencies.

export const config = { runtime: "nodejs" };

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (!values || values.length === 0) return out;

  const k = 2 / (period + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      out[i] = null;
      continue;
    }

    if (prev == null) {
      // seed: first non-null
      prev = v;
      out[i] = prev;
      continue;
    }

    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  const q = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    q.push(v);
    if (v != null) {
      sum += v;
      count++;
    }

    if (q.length > period) {
      const old = q.shift();
      if (old != null) {
        sum -= old;
        count--;
      }
    }

    if (q.length === period && count > 0) out[i] = sum / count;
    else out[i] = null;
  }
  return out;
}

function stdev(values, period) {
  // rolling stdev (population) ignoring nulls; requires full window with non-nulls
  const out = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;

    let sum = 0;
    let sum2 = 0;
    let n = 0;

    for (let j = i - (period - 1); j <= i; j++) {
      const v = values[j];
      if (v == null) {
        n = 0; // hard fail if window has nulls
        break;
      }
      sum += v;
      sum2 += v * v;
      n++;
    }

    if (n !== period) {
      out[i] = null;
      continue;
    }

    const mean = sum / n;
    const variance = sum2 / n - mean * mean;
    out[i] = Math.sqrt(Math.max(variance, 0));
  }

  return out;
}

function atr(candles, period) {
  // candles: {high,low,close}
  const out = new Array(candles.length).fill(null);
  const tr = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;

    if (i === 0) {
      tr[i] = c.high - c.low;
    } else {
      const prevClose = candles[i - 1].close;
      const a = c.high - c.low;
      const b = Math.abs(c.high - prevClose);
      const d = Math.abs(c.low - prevClose);
      tr[i] = Math.max(a, b, d);
    }
  }

  // ATR as EMA of TR
  const atrEma = ema(tr, period);
  for (let i = 0; i < atrEma.length; i++) out[i] = atrEma[i];
  return out;
}

function parseBool(v) {
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

async function fetchKrakenWeeklyXBTUSD() {
  // interval is in minutes. 10080 = 7*24*60 = 1 week
  // pair naming: Kraken often uses "XBTUSD"
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}: ${txt.slice(0, 200)}`);

  let j;
  try {
    j = JSON.parse(txt);
  } catch {
    throw new Error("Kraken returned non-JSON");
  }

  if (j.error && j.error.length) {
    throw new Error(`Kraken error: ${j.error.join(", ")}`);
  }

  const result = j.result || {};
  const key = Object.keys(result).find((k) => k !== "last");
  const rows = key ? result[key] : null;
  if (!rows || !Array.isArray(rows)) throw new Error("Kraken OHLC missing data");

  // row format: [time, open, high, low, close, vwap, volume, count]
  const candles = rows.map((row) => ({
    time: Number(row[0]), // seconds
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6]),
  }));

  // sort just in case
  candles.sort((a, b) => a.time - b.time);

  return candles;
}

function buildForest(candles) {
  const closes = candles.map((c) => c.close);

  const maPeriod = 50;
  const smoothLen = 6;
  const maxLookback = 52 * 3; // 3 years

  const ema50 = ema(closes, maPeriod);
  const diff = closes.map((c, i) => (ema50[i] == null ? null : c - ema50[i]));

  // ✅ Dynamisch: nooit grotere lookback eisen dan we hebben
  // We willen genoeg historie overhouden: neem max 3 jaar, maar niet meer dan helft van data.
  const lookback = Math.max(
    30,
    Math.min(maxLookback, Math.floor(closes.length / 2))
  );

  const dev = stdev(diff, lookback);

  const forestRaw = diff.map((d, i) => {
    if (i < maPeriod + lookback) return null;
    if (d == null || dev[i] == null || dev[i] === 0) return null;
    return d / dev[i];
  });

  const forest = ema(forestRaw, smoothLen);

  // turning points: cross thresholds
  const upTh = 0.35;
  const dnTh = -0.35;
  const turningPoints = [];

  for (let i = 1; i < forest.length; i++) {
    const prev = forest[i - 1];
    const cur = forest[i];
    if (prev == null || cur == null) continue;

    if (prev <= upTh && cur > upTh) {
      turningPoints.push({ time: candles[i].time, type: "up", level: upTh });
    }
    if (prev >= dnTh && cur < dnTh) {
      turningPoints.push({ time: candles[i].time, type: "down", level: dnTh });
    }
  }

  return {
    forest,
    turningPoints,
    meta: { maPeriod, smoothLen, lookback, upTh, dnTh },
  };
}

export default async function handler(req, res) {
  try {
    const includeCurrentWeek = parseBool(req.query?.includeCurrentWeek);

    let candles = await fetchKrakenWeeklyXBTUSD();

    // ✅ Non-repaint default: drop last candle (usually current/incomplete week)
    if (!includeCurrentWeek && candles.length > 0) {
      candles = candles.slice(0, -1);
    }

    if (candles.length < 120) {
      // Too little to do anything meaningful
      res.status(200).json({
        source: "kraken",
        interval: "1w",
        closedWeeks: !includeCurrentWeek,
        error: null,
        candles,
        forest: [],
        turningPoints: [],
        note: "Not enough candles returned from source yet.",
      });
      return;
    }

    const { forest, turningPoints, meta } = buildForest(candles);

    // Extra: ATR for overlay/forecast use later (not required now)
    const atr14 = atr(candles, 14);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // Small cache to reduce API hits
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

    res.status(200).json({
      source: "kraken",
      interval: "1w",
      closedWeeks: !includeCurrentWeek,
      maPeriod: meta.maPeriod,
      smoothLen: meta.smoothLen,
      lookback: meta.lookback,
      thresholds: { up: meta.upTh, down: meta.dnTh },
      candles,
      forest,
      atr14,
      turningPoints,
    });
  } catch (err) {
    res.status(500).json({
      error: String(err?.message || err),
    });
  }
}