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
    if (v == null) {
      out[i] = null;
      continue;
    }
    if (prev == null) prev = v;
    else prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function std(values, length) {
  const out = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;

    let sum = 0;
    let sum2 = 0;
    let n = 0;

    for (let j = i - length + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      n++;
      sum += v;
      sum2 += v * v;
    }
    if (n < Math.max(10, Math.floor(length * 0.6))) continue;

    const mean = sum / n;
    const varr = sum2 / n - mean * mean;
    out[i] = Math.sqrt(Math.max(0, varr));
  }

  return out;
}

export function atr(highs, lows, closes, length = 14) {
  const tr = new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
      continue;
    }
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }

  // ATR = EMA(TR, length)
  const atrArr = ema(tr, length);
  return atrArr;
}

export function percentileFromWindow(values, endIndex, windowLen, p) {
  // p: 0..1
  const start = Math.max(0, endIndex - windowLen + 1);
  const arr = [];
  for (let i = start; i <= endIndex; i++) {
    const v = values[i];
    if (v == null) continue;
    arr.push(v);
  }
  if (arr.length < Math.max(30, Math.floor(windowLen * 0.5))) return null;
  arr.sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))));
  return arr[idx];
}

export function clamp(x, a, b) {
  return Math.min(b, Math.max(a, x));
}