// api/_lib/indicators.js
// Kleine indicator helpers zonder dependencies.

export function ema(values, length) {
  const out = new Array(values.length).fill(null);
  if (!length || length < 1) return out;

  const k = 2 / (length + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;

    if (prev == null) {
      // seed met SMA zodra genoeg data is
      if (i < length - 1) continue;
      let sum = 0;
      let ok = true;
      for (let j = i - (length - 1); j <= i; j++) {
        if (values[j] == null) { ok = false; break; }
        sum += values[j];
      }
      if (!ok) continue;
      prev = sum / length;
      out[i] = prev;
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function sma(values, length) {
  const out = new Array(values.length).fill(null);
  if (!length || length < 1) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    let sum = 0;
    let ok = true;
    for (let j = i - (length - 1); j <= i; j++) {
      const v = values[j];
      if (v == null) { ok = false; break; }
      sum += v;
    }
    if (!ok) continue;
    out[i] = sum / length;
  }
  return out;
}

export function stdev(sample) {
  // sample is array of numbers (no null)
  const n = sample.length;
  if (n < 2) return null;
  let mean = 0;
  for (const x of sample) mean += x;
  mean /= n;

  let v = 0;
  for (const x of sample) {
    const d = x - mean;
    v += d * d;
  }
  v /= (n - 1); // sample variance
  return Math.sqrt(v);
}

export function percentile(sample, p) {
  // p in [0..1], sample array numbers (no null)
  if (!sample.length) return null;
  const arr = sample.slice().sort((a, b) => a - b);
  const idx = (arr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const w = idx - lo;
  return arr[lo] * (1 - w) + arr[hi] * w;
}

export function trueRange(cPrev, cNow) {
  const h = cNow.high;
  const l = cNow.low;
  const pc = cPrev?.close;
  if (pc == null) return h - l;
  return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
}

export function atr(candles, length) {
  const out = new Array(candles.length).fill(null);
  if (!length || length < 1) return out;

  const tr = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr[i] = candles[i].high - candles[i].low;
    else tr[i] = trueRange(candles[i - 1], candles[i]);
  }

  // Wilder ATR (RMA)
  let prev = null;
  for (let i = 0; i < candles.length; i++) {
    if (tr[i] == null) continue;

    if (prev == null) {
      if (i < length) continue;
      let sum = 0;
      let ok = true;
      for (let j = i - length + 1; j <= i; j++) {
        if (tr[j] == null) { ok = false; break; }
        sum += tr[j];
      }
      if (!ok) continue;
      prev = sum / length;
      out[i] = prev;
    } else {
      prev = (prev * (length - 1) + tr[i]) / length;
      out[i] = prev;
    }
  }
  return out;
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}