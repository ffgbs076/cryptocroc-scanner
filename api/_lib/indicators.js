// api/_lib/indicators.js
// Kleine indicator-lib (pure functions) — werkt in Vercel Node

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (!period || period < 1) return out;

  let sum = 0;
  let n = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out[i] = null;
      continue;
    }

    sum += v;
    n++;

    // remove value that falls out of the window
    const j = i - period;
    if (j >= 0) {
      const old = values[j];
      if (old != null && Number.isFinite(old)) {
        sum -= old;
        n--;
      }
    }

    out[i] = (i >= period - 1 && n > 0) ? (sum / n) : null;
  }

  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (!period || period < 1) return out;

  const k = 2 / (period + 1);

  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out[i] = null;
      continue;
    }
    if (prev == null) {
      prev = v; // seed
      out[i] = null; // pas “stabiel” na genoeg data
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
    if (i < period - 1) out[i] = null;
  }

  return out;
}

export function stdev(values, period) {
  const out = new Array(values.length).fill(null);
  if (!period || period < 2) return out;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out[i] = null;
      continue;
    }
    let sum = 0;
    let sum2 = 0;
    let n = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) continue;
      sum += v;
      sum2 += v * v;
      n++;
    }
    if (n < 2) {
      out[i] = null;
      continue;
    }
    const mean = sum / n;
    const varr = Math.max(0, sum2 / n - mean * mean);
    out[i] = Math.sqrt(varr);
  }

  return out;
}

/**
 * ATR (Wilder) op candles.
 * candles: [{high, low, close}]
 * return: array ATR waarden, zelfde lengte, eerst nulls
 */
export function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  if (!period || period < 1) return out;
  if (!candles?.length) return out;

  const tr = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;

    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);

    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      tr[i] = null;
      continue;
    }

    if (i === 0) {
      tr[i] = high - low;
    } else {
      const prevClose = Number(candles[i - 1]?.close);
      if (!Number.isFinite(prevClose)) {
        tr[i] = high - low;
      } else {
        const a = high - low;
        const b = Math.abs(high - prevClose);
        const d = Math.abs(low - prevClose);
        tr[i] = Math.max(a, b, d);
      }
    }
  }

  // Wilder smoothing: ATR[i] = (ATR[i-1]*(p-1) + TR[i]) / p
  let atrPrev = null;

  for (let i = 0; i < tr.length; i++) {
    const v = tr[i];
    if (v == null) {
      out[i] = null;
      continue;
    }

    if (i === period - 1) {
      // seed = simpele gemiddelde van eerste p TR’s
      let sum = 0;
      let n = 0;
      for (let j = 0; j < period; j++) {
        const t = tr[j];
        if (t == null) continue;
        sum += t;
        n++;
      }
      if (n < period) {
        out[i] = null;
        continue;
      }
      atrPrev = sum / period;
      out[i] = atrPrev;
      continue;
    }

    if (i < period - 1) {
      out[i] = null;
      continue;
    }

    atrPrev = ((atrPrev * (period - 1)) + v) / period;
    out[i] = atrPrev;
  }

  return out;
}