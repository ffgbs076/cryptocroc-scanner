// api/_lib/indicators.js
// ✅ Exports: ema, std, atr

export function ema(values, length) {
  const out = new Array(values.length).fill(null);
  if (length <= 1) {
    for (let i = 0; i < values.length; i++) out[i] = values[i];
    return out;
  }
  const k = 2 / (length + 1);

  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;

    if (prev == null) {
      prev = v;
      out[i] = prev;
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function std(values, length) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    let sum = 0, sum2 = 0, n = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      sum += v; sum2 += v * v; n++;
    }
    if (n < Math.max(10, Math.floor(length * 0.6))) continue;
    const mean = sum / n;
    const varr = Math.max(0, (sum2 / n) - mean * mean);
    out[i] = Math.sqrt(varr);
  }
  return out;
}

export function atr(candles, length) {
  const tr = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    const a = c.high - c.low;
    const b = Math.abs(c.high - prevClose);
    const d = Math.abs(c.low - prevClose);
    tr[i] = Math.max(a, b, d);
  }
  return ema(tr, length);
}