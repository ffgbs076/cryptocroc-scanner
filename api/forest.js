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

  let gain = 0;
  let loss = 0;

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

async function fetchCoinbaseWeeklyCandles() {
  // Geen start/end -> Coinbase geeft “meest recente candles” terug (max ~300)
  const url =
    "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=604800";

  const r = await fetchFn(url, {
    headers: { "User-Agent": "btc-forest-tv" }
  });

  if (!r.ok) throw new Error(`Coinbase error: ${r.status}`);

  const arr = await r.json();

  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("Coinbase returned empty candles");
  }

  // Coinbase format: [ time, low, high, open, close, volume ] (DESC)
  const candles = arr
    .map(d => ({
      time: Number(d[0]), // seconds
      low: Number(d[1]),
      high: Number(d[2]),
      open: Number(d[3]),
      close: Number(d[4])
    }))
    .sort((a, b) => a.time - b.time);

  return candles;
}

export default async function handler(req, res) {
  try {
    const candles = await fetchCoinbaseWeeklyCandles();
    const closes = candles.map(c => c.close);

    // MA200 kan met ~300 candles, oké
    const ma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);

    // Forest “bias”: stijgdruk/daldruk (geen prijs-target)
    const biasRaw = closes.map((price, i) => {
      if (ma200[i] == null || rsi14[i] == null) return 0;

      const trend = price > ma200[i] ? 1 : -1;
      const momentum = rsi14[i] >= 50 ? 1 : -1;

      const distance = price / ma200[i] - 1;
      const revert = -clamp(distance * 4, -1, 1);

      return trend * 0.5 + momentum * 0.3 + revert * 0.2;
    });

    const forest = ema(biasRaw, 6).map(v => (v == null ? 0 : v));

    const turningPoints = [];
    for (let i = 1; i < forest.length; i++) {
      const a = forest[i - 1];
      const b = forest[i];
      if (a <= 0 && b > 0) turningPoints.push({ time: candles[i].time, type: "up" });
      if (a >= 0 && b < 0) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    res.status(200).json({ candles, forest, turningPoints });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}