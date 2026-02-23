// api/_lib/indicators.js

export function ema(values, length) {
  const out = new Array(values.length).fill(null);
  if (length <= 1) return values.map((v) => (Number.isFinite(v) ? v : null));

  const k = 2 / (length + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      out[i] = null;
      continue;
    }

    if (prev == null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function std(values, length) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;

    let n = 0;
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) continue;
      n++;
      sum += v;
    }
    if (n < Math.max(10, Math.floor(length * 0.7))) continue;

    const mean = sum / n;
    let s2 = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) continue;
      const d = v - mean;
      s2 += d * d;
    }
    out[i] = Math.sqrt(s2 / n);
  }
  return out;
}

export function atr(highs, lows, closes, length = 14) {
  const tr = new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    const h = highs[i], l = lows[i], c = closes[i];
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;

    if (i === 0 || !Number.isFinite(closes[i - 1])) {
      tr[i] = h - l;
    } else {
      const prevC = closes[i - 1];
      tr[i] = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    }
  }

  // Wilder EMA op TR
  const out = new Array(closes.length).fill(null);
  let prev = null;
  for (let i = 0; i < tr.length; i++) {
    const v = tr[i];
    if (!Number.isFinite(v)) continue;

    if (prev == null) prev = v;
    else prev = (prev * (length - 1) + v) / length;

    out[i] = prev;
  }
  return out;
}

export function percentile(sortedArr, p) {
  // sortedArr: ascending
  if (!sortedArr.length) return null;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const w = idx - lo;
  return sortedArr[lo] * (1 - w) + sortedArr[hi] * w;
}