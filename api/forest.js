export const config = { runtime: "nodejs" };

const fetchFn = globalThis.fetch;

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let result = [];
  let prev = values[0];

  for (let i = 0; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function sma(values, period) {
  let result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

function rsi(closes, period = 14) {
  let gains = [];
  let losses = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  const avgGain = sma(gains, period);
  const avgLoss = sma(losses, period);

  let rsis = [null];

  for (let i = 0; i < avgGain.length; i++) {
    if (!avgGain[i] || !avgLoss[i]) {
      rsis.push(null);
    } else {
      const rs = avgGain[i] / avgLoss[i];
      rsis.push(100 - 100 / (1 + rs));
    }
  }

  return rsis;
}

export default async function handler(req, res) {
  try {
    const response = await fetchFn(
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=300"
    );

    const data = await response.json();

    const candles = data.map(d => ({
      time: Math.floor(d[0] / 1000),
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4])
    }));

    const closes = candles.map(c => c.close);

    const ma200 = sma(closes, 200);
    const rsiVals = rsi(closes, 14);

    let biasRaw = closes.map((price, i) => {
      if (!ma200[i] || !rsiVals[i]) return 0;

      let trend = price > ma200[i] ? 1 : -1;
      let momentum = rsiVals[i] > 50 ? 1 : -1;

      let distance = (price / ma200[i] - 1);
      let revert = -clamp(distance * 5, -1, 1);

      return trend * 0.5 + momentum * 0.3 + revert * 0.2;
    });

    const forest = ema(biasRaw, 5);

    let turningPoints = [];
    for (let i = 1; i < forest.length; i++) {
      if (forest[i - 1] < 0 && forest[i] > 0) {
        turningPoints.push({ time: candles[i].time, type: "up" });
      }
      if (forest[i - 1] > 0 && forest[i] < 0) {
        turningPoints.push({ time: candles[i].time, type: "down" });
      }
    }

    res.status(200).json({
      candles,
      forest,
      turningPoints
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}