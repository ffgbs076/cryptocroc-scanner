export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (!values.length || period <= 1) return out;

  const k = 2 / (period + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;

    if (prev == null) {
      prev = v;
      out[i] = v;
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function std(values, window) {
  const out = new Array(values.length).fill(null);
  if (window <= 1) return out;

  for (let i = 0; i < values.length; i++) {
    const start = i - window + 1;
    if (start < 0) continue;

    let n = 0;
    let sum = 0;
    for (let j = start; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      n++;
      sum += v;
    }
    if (n < Math.max(10, Math.floor(window * 0.6))) continue;

    const mean = sum / n;
    let ss = 0;
    for (let j = start; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      const d = v - mean;
      ss += d * d;
    }
    out[i] = Math.sqrt(ss / n);
  }
  return out;
}

export function atr(candles, period) {
  const out = new Array(candles.length).fill(null);
  if (period <= 1) return out;

  const tr = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    const a = c.high - c.low;
    const b = Math.abs(c.high - prevClose);
    const d = Math.abs(c.low - prevClose);
    tr[i] = Math.max(a, b, d);
  }

  // Wilder EMA
  let prev = null;
  for (let i = 0; i < tr.length; i++) {
    const v = tr[i];
    if (v == null) continue;

    if (prev == null) {
      // seed: simpele average van eerste `period` als het kan
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += tr[j];
      prev = sum / period;
      out[i] = prev;
    } else {
      prev = (prev * (period - 1) + v) / period;
      out[i] = prev;
    }
  }

  return out;
}

export function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}