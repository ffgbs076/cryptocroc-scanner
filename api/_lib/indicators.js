// api/_lib/indicators.js
// Kleine indicator helpers, puur JS.

export function sma(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return values.slice();
  let sum = 0;
  let n = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      out[i] = null;
      continue;
    }
    sum += v;
    n++;

    if (i >= length) {
      const old = values[i - length];
      if (old != null) {
        sum -= old;
        n--;
      }
    }

    out[i] = (i >= length - 1) ? (sum / length) : null;
  }
  return out;
}

export function ema(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return values.slice();

  const k = 2 / (length + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      out[i] = null;
      continue;
    }
    if (prev == null) prev = v;
    prev = (v * k) + (prev * (1 - k));
    out[i] = prev;
  }
  return out;
}

export function std(values, length) {
  const out = Array(values.length).fill(null);
  if (length <= 1) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const window = values.slice(i - length + 1, i + 1).filter((x) => x != null);
    if (window.length < length) continue;

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const varr = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
    out[i] = Math.sqrt(varr);
  }
  return out;
}

// alias (voor oudere code die stdev gebruikt)
export const stdev = std;

export function atr(highs, lows, closes, length = 14) {
  const tr = Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
      continue;
    }
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  // Wilder EMA
  const out = Array(closes.length).fill(null);
  let prev = null;
  for (let i = 0; i < tr.length; i++) {
    const v = tr[i];
    if (v == null) continue;
    if (prev == null) prev = v;
    prev = (prev * (length - 1) + v) / length;
    out[i] = prev;
  }
  return out;
}

export function percentileFromWindow(window, p) {
  const arr = window.filter((x) => x != null).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * (arr.length - 1))));
  return arr[idx];
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}