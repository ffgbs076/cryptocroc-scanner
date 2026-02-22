export const config = { runtime: "nodejs" };

const fetchFn = globalThis.fetch;

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
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

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  const q = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    q.push(v);
    sum += v;
    if (q.length > period) sum -= q.shift();
    if (q.length === period) out[i] = sum / period;
  }
  return out;
}

function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;

  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;

    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;

    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

async function fetchKrakenWeeklyCandles() {
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";
  const r = await fetchFn(url, {
    headers: { accept: "application/json", "user-agent": "btc-forest-tv" }
  });
  if (!r.ok) throw new Error(`Kraken HTTP error: ${r.status}`);

  const j = await r.json();
  if (j.error && j.error.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const result = j.result || {};
  const key = Object.keys(result).find(k => k !== "last");
  if (!key) throw new Error("Kraken: missing OHLC result");

  const rows = result[key];
  const candles = rows
    .map(row => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4])
    }))
    .sort((a, b) => a.time - b.time);

  return candles;
}

export default async function handler(req, res) {
  try {
    const candles = await fetchKrakenWeeklyCandles();
    const closes = candles.map(c => c.close);

    // ✅ fallback: MA200 als het kan, anders MA100
    const maPeriod = closes.length >= 220 ? 200 : 100;
    const ma = sma(closes, maPeriod);
    const rsi14 = rsi(closes, 14);

    const biasRaw = closes.map((price, i) => {
      if (ma[i] == null || rsi14[i] == null) return 0;

      const trend = price > ma[i] ? 1 : -1;
      const momentum = rsi14[i] >= 50 ? 1 : -1;

      const distance = price / ma[i] - 1;
      const revert = -clamp(distance * 4, -1, 1);

      // bias tussen ongeveer -1 en +1
      return trend * 0.5 + momentum * 0.3 + revert * 0.2;
    });

    // smooth
    const forest = ema(biasRaw, 6).map(v => (v == null ? 0 : v));

    // turning points (kruist 0)
    const turningPoints = [];
    for (let i = 1; i < forest.length; i++) {
      const a = forest[i - 1];
      const b = forest[i];
      if (a <= 0 && b > 0) turningPoints.push({ time: candles[i].time, type: "up" });
      if (a >= 0 && b < 0) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    res.status(200).json({
      source: "kraken",
      interval: "1w",
      maPeriod,
      candles,
      forest,
      turningPoints
    });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}