// api/forest.js
export const config = { runtime: "nodejs" };

function ema(values, len) {
  const k = 2 / (len + 1);
  let out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) prev = v;
    else prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function stdev(values, len) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < len - 1) continue;
    let sum = 0, sum2 = 0, n = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      sum += v; sum2 += v * v; n++;
    }
    if (n < Math.max(5, Math.floor(len * 0.8))) continue;
    const mean = sum / n;
    const varr = Math.max(0, sum2 / n - mean * mean);
    out[i] = Math.sqrt(varr);
  }
  return out;
}

function atr(high, low, close, len) {
  const tr = new Array(close.length).fill(null);
  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      tr[i] = high[i] - low[i];
    } else {
      const hl = high[i] - low[i];
      const hc = Math.abs(high[i] - close[i - 1]);
      const lc = Math.abs(low[i] - close[i - 1]);
      tr[i] = Math.max(hl, hc, lc);
    }
  }
  return ema(tr, len);
}

async function fetchKrakenOHLC(interval) {
  // interval in minutes: 15, 60, 240, 1440, 10080 (weekly)
  const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${interval}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const j = await r.json();
  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  if (j?.error?.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);
  const key = Object.keys(j.result).find(k => k !== "last");
  const rows = j.result[key] || [];

  // Kraken row: [time, open, high, low, close, vwap, volume, count]
  return rows.map(row => ({
    time: Number(row[0]), // seconds
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6])
  }));
}

export default async function handler(req, res) {
  try {
    const interval = (req.query.interval || "10080").toString(); // default weekly
    const intervalMin = Math.max(1, Number(interval) || 10080);

    const candles = await fetchKrakenOHLC(intervalMin);

    // --- Forest z-score (neutraal rond 0) ---
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows  = candles.map(c => c.low);

    const ema50 = ema(closes, 50);
    const diff = closes.map((c, i) => (ema50[i] == null ? null : (c - ema50[i])));

    // lookback: ~3 jaar in bars (weekly ≈ 156). Voor andere TF’s: schaal mee.
    const barsPerYear = Math.max(12, Math.round((365 * 24 * 60) / (intervalMin * 60) / 1)); // grof
    const lookback = Math.max(60, Math.min(400, barsPerYear * 3));

    const dev = stdev(diff, lookback);
    const rawZ = diff.map((d, i) => (d == null || dev[i] == null || dev[i] === 0 ? null : d / dev[i]));

    // smoothing (kan later adaptive)
    const forestZ = ema(rawZ.map(v => (v == null ? null : v)), 6);

    // turning points op z-score drempels (voor markers)
    const upThr = 0.35;
    const dnThr = -0.35;
    const turningPoints = [];
    for (let i = 1; i < forestZ.length; i++) {
      const a = forestZ[i - 1], b = forestZ[i];
      if (a == null || b == null) continue;
      if (a <= upThr && b > upThr) turningPoints.push({ time: candles[i].time, type: "up" });
      if (a >= dnThr && b < dnThr) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    // extra info voor client
    const atr14 = atr(highs, lows, closes, 14);

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      source: "kraken",
      interval: `${intervalMin}m`,
      candles,
      forestZ,
      atr14
    }));
  } catch (e) {
    res.status(503).json({ error: e?.message || "Service unavailable" });
  }
}