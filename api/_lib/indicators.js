// api/_lib/indicators.js
export function sma(values, len) {
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out[i] = null; continue; }
    sum += v;
    if (i >= len) sum -= values[i - len] ?? 0;
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

export function ema(values, len) {
  const out = Array(values.length).fill(null);
  const k = 2 / (len + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out[i] = null; continue; }
    if (prev == null) prev = v;
    else prev = (v - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

export function stdev(values, len) {
  const out = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < len - 1) { out[i] = null; continue; }
    let n = 0, s = 0, ss = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      n++;
      s += v;
      ss += v * v;
    }
    if (n < Math.max(5, Math.floor(len * 0.8))) { out[i] = null; continue; }
    const mean = s / n;
    const varr = Math.max(0, ss / n - mean * mean);
    out[i] = Math.sqrt(varr);
  }
  return out;
}

export function atr(candles, len) {
  const tr = Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) { tr[i] = null; continue; }
    if (i === 0) {
      tr[i] = c.high - c.low;
    } else {
      const p = candles[i - 1];
      const a = c.high - c.low;
      const b = Math.abs(c.high - p.close);
      const d = Math.abs(c.low - p.close);
      tr[i] = Math.max(a, b, d);
    }
  }
  return ema(tr, len);
}

// ADX (klassiek, voor trendstrength filter)
export function adx(candles, len = 14) {
  const plusDM = Array(candles.length).fill(null);
  const minusDM = Array(candles.length).fill(null);
  const tr = Array(candles.length).fill(null);

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;

    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const a = c.high - c.low;
    const b = Math.abs(c.high - p.close);
    const d = Math.abs(c.low - p.close);
    tr[i] = Math.max(a, b, d);
  }

  const atrE = ema(tr, len);
  const plusE = ema(plusDM, len);
  const minusE = ema(minusDM, len);

  const plusDI = Array(candles.length).fill(null);
  const minusDI = Array(candles.length).fill(null);
  const dx = Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const a = atrE[i];
    if (!a || a === 0) continue;
    plusDI[i] = 100 * (plusE[i] / a);
    minusDI[i] = 100 * (minusE[i] / a);
    const sum = (plusDI[i] + minusDI[i]) || 0;
    if (sum === 0) continue;
    dx[i] = 100 * (Math.abs(plusDI[i] - minusDI[i]) / sum);
  }

  return ema(dx, len);
}