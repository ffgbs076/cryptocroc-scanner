export const config = { runtime: "nodejs" };

const fetchFn = globalThis.fetch;

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let prev = values[0];
  return values.map(v => (prev = v * k + prev * (1 - k)));
}

function sma(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - j];
    }
    return sum / period;
  });
}

function rsi(closes, period = 14) {
  const out = Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }

  gain /= period;
  loss /= period;

  out[period] = 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;

    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;

    out[i] = 100 - 100 / (1 + gain / loss);
  }

  return out;
}

export default async function handler(req, res) {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=365";

    const r = await fetchFn(url, {
      headers: {
        "accept": "application/json"
      }
    });

    if (!r.ok) throw new Error(`CoinGecko error: ${r.status}`);

    const raw = await r.json();

    // raw = [ [timestamp, open, high, low, close], ... ]
    const candles = raw.map(d => ({
      time: Math.floor(d[0] / 1000),
      open: d[1],
      high: d[2],
      low: d[3],
      close: d[4]
    }));

    const closes = candles.map(c => c.close);

    const ma50 = sma(closes, 50);
    const rsi14 = rsi(closes, 14);

    const biasRaw = closes.map((price, i) => {
      if (!ma50[i] || !rsi14[i]) return 0;

      const trend = price > ma50[i] ? 1 : -1;
      const momentum = rsi14[i] > 50 ? 1 : -1;

      const distance = price / ma50[i] - 1;
      const revert = -clamp(distance * 4, -1, 1);

      return trend * 0.5 + momentum * 0.3 + revert * 0.2;
    });

    const forest = ema(biasRaw, 6);

    const turningPoints = [];
    for (let i = 1; i < forest.length; i++) {
      if (forest[i - 1] <= 0 && forest[i] > 0)
        turningPoints.push({ time: candles[i].time, type: "up" });
      if (forest[i - 1] >= 0 && forest[i] < 0)
        turningPoints.push({ time: candles[i].time, type: "down" });
    }

    res.status(200).json({ candles, forest, turningPoints });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}