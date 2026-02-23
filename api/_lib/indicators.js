// api/_lib/indicators.js
// Klein en “saai” (goed): EMA, ATR, STDEV, z-score helpers.

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (!values.length || period <= 1) return out;

  const k = 2 / (period + 1);

  // Start met SMA van eerste period
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;

    sum += v;
    count++;

    if (i === period - 1) {
      const start = sum / period;
      out[i] = start;

      let prev = start;
      for (let j = i + 1; j < values.length; j++) {
        const x = values[j];
        if (x == null) {
          out[j] = prev;
          continue;
        }
        prev = x * k + prev * (1 - k);
        out[j] = prev;
      }
      break;
    }
  }
  return out;
}

function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  if (!candles.length) return out;

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

  // Wilder’s ATR = EMA met alpha = 1/period (maar we doen gewone EMA-ish, is prima voor weekly)
  // Simpel: SMA start, daarna Wilder smoothing
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (tr[i] == null) continue;

    if (i < period) {
      sum += tr[i];
      if (i === period - 1) {
        out[i] = sum / period;
      }
    } else {
      out[i] = ((out[i - 1] * (period - 1)) + tr[i]) / period;
    }
  }

  return out;
}

function stdev(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    const window = values.slice(i - period + 1, i + 1).filter((v) => v != null);
    if (window.length < period) continue;

    const mean = window.reduce((a, b) => a + b, 0) / period;
    const varr =
      window.reduce((a, b) => a + (b - mean) * (b - mean), 0) / period;
    out[i] = Math.sqrt(varr);
  }
  return out;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

module.exports = { ema, atr, stdev, clamp };