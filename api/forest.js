// api/forest.js
export const config = { runtime: "nodejs" };

const KRAKEN_OHLC =
  "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080"; // 1w

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function ema(values, period) {
  const out = Array(values.length).fill(null);
  if (!values || values.length === 0) return out;
  const alpha = 2 / (period + 1);

  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) prev = v;
    else prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function sma(values, period) {
  const out = Array(values.length).fill(null);
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
      const removed = q.shift();
      if (removed != null) {
        sum -= removed;
        count--;
      }
    }
    out[i] = q.length === period && count === period ? sum / period : null;
  }
  return out;
}

function stdev(values, period) {
  const out = Array(values.length).fill(null);
  const q = [];
  for (let i = 0; i < values.length; i++) {
    q.push(values[i]);
    if (q.length > period) q.shift();

    if (q.length < period || q.some(v => v == null)) {
      out[i] = null;
      continue;
    }
    const mean = q.reduce((a, b) => a + b, 0) / period;
    const varSum = q.reduce((a, b) => a + (b - mean) ** 2, 0);
    out[i] = Math.sqrt(varSum / period);
  }
  return out;
}

function percentile(arr, p) {
  const xs = arr.filter(v => typeof v === "number" && Number.isFinite(v)).sort((a,b)=>a-b);
  if (xs.length === 0) return null;
  const idx = (xs.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return xs[lo];
  const w = idx - lo;
  return xs[lo] * (1 - w) + xs[hi] * w;
}

function trueRange(high, low, prevClose) {
  if (prevClose == null) return high - low;
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

function atr(highs, lows, closes, period) {
  const tr = Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    const prevClose = i > 0 ? closes[i - 1] : null;
    if (highs[i] == null || lows[i] == null || closes[i] == null) continue;
    tr[i] = trueRange(highs[i], lows[i], prevClose);
  }
  return ema(tr, period); // Wilder-ish via EMA is ok for web tool
}

function roc(values, n) {
  const out = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < n || values[i] == null || values[i - n] == null) continue;
    out[i] = (values[i] - values[i - n]) / values[i - n];
  }
  return out;
}

// variable-length EMA smoothing (alpha depends per bar)
function adaptiveEma(values, lens) {
  const out = Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const len = lens[i];
    if (v == null || len == null) continue;
    const alpha = 2 / (len + 1);
    if (prev == null) prev = v;
    else prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const r = await fetch(KRAKEN_OHLC, {
      headers: { "accept": "application/json" }
    });

    const j = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: "Kraken fetch failed" });
    }

    const result = j?.result || {};
    const pairKey = Object.keys(result).find(k => k !== "last");
    if (!pairKey) {
      return res.status(502).json({ error: "Kraken response missing pair data" });
    }

    // Kraken OHLC row:
    // [ time, open, high, low, close, vwap, volume, count ]
    const rows = result[pairKey] || [];
    const candles = rows.map(row => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6])
    }));

    // Basic arrays
    const close = candles.map(c => c.close);
    const high = candles.map(c => c.high);
    const low  = candles.map(c => c.low);
    const vol  = candles.map(c => c.volume);

    // Price context
    const ema20 = ema(close, 20);
    const ema50 = ema(close, 50);
    const ema200 = ema(close, 200);

    // Volatility
    const atr14 = atr(high, low, close, 14);
    const atrSma52 = sma(atr14, 52);
    const normAtr = atr14.map((v, i) => {
      const b = atrSma52[i];
      if (v == null || b == null || b === 0) return null;
      return v / b;
    });

    // Adaptive smooth length: high vol => longer smoothing, low vol => shorter
    const smoothLen = normAtr.map(v => {
      if (v == null) return null;
      // v around 1 = normal. if 2 => more vol => longer smoothing
      const raw = 6 * v;
      return clamp(Math.round(raw), 3, 10);
    });

    // Forest raw = z-score of (close - EMA50) over 3y (~156w)
    const lookback = 156;
    const diff = close.map((c, i) => (c != null && ema50[i] != null) ? (c - ema50[i]) : null);
    const dev = stdev(diff, lookback);

    const forestRaw = diff.map((d, i) => {
      const s = dev[i];
      if (d == null || s == null || s === 0) return null;
      return d / s;
    });

    // Smooth Forest
    const forest = adaptiveEma(forestRaw, smoothLen);

    // Cycle score: (ROC8 - ROC16) normalized by stdev (3y), small weight
    const roc8 = roc(close, 8);
    const roc16 = roc(close, 16);
    const cycleRaw = roc8.map((a, i) => (a != null && roc16[i] != null) ? (a - roc16[i]) : null);
    const cycleDev = stdev(cycleRaw, lookback);
    const cycleZ = cycleRaw.map((v, i) => {
      const s = cycleDev[i];
      if (v == null || s == null || s === 0) return null;
      return v / s;
    });
    const cycle = ema(cycleZ, 3).map(v => (v == null ? null : v * 0.15));

    // Volume confirm (log-volume zscore)
    const logVol = vol.map(v => (v != null && v > 0) ? Math.log(v) : null);
    const volMean = sma(logVol, lookback);
    const volStd = stdev(logVol, lookback);
    const volZ = logVol.map((v, i) => {
      const m = volMean[i], s = volStd[i];
      if (v == null || m == null || s == null || s === 0) return null;
      return (v - m) / s;
    });
    const volScore = volZ.map(v => (v == null ? null : clamp(v / 2, -1, 1)));

    // Dynamic thresholds from recent distribution
    const recentAbs = forest
      .slice(-lookback)
      .map(v => (v == null ? null : Math.abs(v)));

    const turnThreshold = percentile(recentAbs, 0.80) ?? 0.2;
    const zoneThreshold = percentile(recentAbs, 0.90) ?? 0.35;

    // Turning points: cross +turnThreshold / -turnThreshold
    const turningPoints = [];
    for (let i = 1; i < forest.length; i++) {
      const a = forest[i - 1];
      const b = forest[i];
      if (a == null || b == null) continue;

      if (a < turnThreshold && b >= turnThreshold) {
        turningPoints.push({ time: candles[i].time, type: "up" });
      }
      if (a > -turnThreshold && b <= -turnThreshold) {
        turningPoints.push({ time: candles[i].time, type: "down" });
      }
    }

    // Signal strength (simple, transparent)
    // strong if volume confirms and cycle agrees
    const lastIdx = forest.length - 1;
    const lastForest = forest[lastIdx];
    const lastVol = volScore[lastIdx];
    const lastCycle = cycle[lastIdx];

    let strength = "unknown";
    if (lastForest != null) {
      const side = lastForest >= 0 ? "bull" : "bear";
      const volOk = lastVol != null && (side === "bull" ? lastVol > 0.2 : lastVol < -0.2);
      const cycOk = lastCycle != null && (side === "bull" ? lastCycle > 0 : lastCycle < 0);
      strength = (volOk && cycOk) ? "strong" : (volOk || cycOk) ? "medium" : "weak";
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      source: "kraken",
      symbol: "BTCUSD",
      interval: "1w",
      maPeriod: 50,
      lookbackWeeks: lookback,
      thresholds: {
        turn: Number(turnThreshold.toFixed(3)),
        zone: Number(zoneThreshold.toFixed(3))
      },
      strength,
      candles,
      overlays: {
        ema20,
        ema50,
        ema200
      },
      forest,
      forestRaw,
      cycle,
      volScore,
      turningPoints
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}