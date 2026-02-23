export function sma(values, len) {
  if (len <= 1) return values.slice();
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let q = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    sum += v;
    q++;
    if (i >= len) {
      const old = values[i - len];
      if (old != null) {
        sum -= old;
        q--;
      }
    }
    if (i >= len - 1 && q > 0) out[i] = sum / q;
  }
  return out;
}

export function ema(values, len) {
  const out = new Array(values.length).fill(null);
  if (len <= 1) return values.map((v) => (v == null ? null : v));
  const k = 2 / (len + 1);

  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    prev = prev == null ? v : prev + k * (v - prev);
    out[i] = prev;
  }
  return out;
}

export function std(values, len) {
  const out = new Array(values.length).fill(null);
  if (len <= 1) return out;
  for (let i = 0; i < values.length; i++) {
    if (i < len - 1) continue;
    let n = 0;
    let s = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      n++;
      s += v;
    }
    if (n < Math.max(10, Math.floor(len * 0.6))) continue;
    const mean = s / n;
    let ss = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      const d = v - mean;
      ss += d * d;
    }
    out[i] = Math.sqrt(ss / n);
  }
  return out;
}

export function atr(candles, len) {
  const out = new Array(candles.length).fill(null);
  let prevClose = null;
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const hl = c.high - c.low;
    const hc = Math.abs(c.high - prevClose);
    const lc = Math.abs(c.low - prevClose);
    return Math.max(hl, hc, lc);
  });

  // EMA ATR
  const trEma = ema(tr, len);
  for (let i = 0; i < trEma.length; i++) out[i] = trEma[i];
  for (let i = 0; i < candles.length; i++) prevClose = candles[i].close;

  return out;
}

export function percentile(values, len, p01) {
  // p01: 0..1
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < len - 1) continue;
    const window = [];
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      window.push(v);
    }
    if (window.length < Math.max(20, Math.floor(len * 0.6))) continue;
    window.sort((a, b) => a - b);
    const idx = Math.min(window.length - 1, Math.max(0, Math.floor(p01 * (window.length - 1))));
    out[i] = window[idx];
  }
  return out;
}

export function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}