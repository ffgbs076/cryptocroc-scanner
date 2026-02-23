export function clamp(x, lo, hi){
  return Math.max(lo, Math.min(hi, x));
}

export function ema(values, period){
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);

  let prev = null;
  for (let i = 0; i < values.length; i++){
    const v = values[i];
    if (v == null) { out[i] = null; continue; }

    if (prev == null){
      // start: simpele SMA seed
      let sum = 0, cnt = 0;
      for (let j = Math.max(0, i - period + 1); j <= i; j++){
        const vv = values[j];
        if (vv == null) continue;
        sum += vv; cnt++;
      }
      prev = cnt ? (sum / cnt) : v;
    } else {
      prev = (v * k) + (prev * (1 - k));
    }
    out[i] = prev;
  }
  return out;
}

export function stdev(values, period){
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++){
    const start = i - period + 1;
    if (start < 0) continue;
    let sum = 0, sum2 = 0, n = 0;
    for (let j = start; j <= i; j++){
      const v = values[j];
      if (v == null) continue;
      sum += v; sum2 += v*v; n++;
    }
    if (n < 2) continue;
    const mean = sum / n;
    const varr = (sum2 / n) - (mean * mean);
    out[i] = Math.sqrt(Math.max(0, varr));
  }
  return out;
}

export function atr(highs, lows, closes, period){
  const tr = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++){
    if (i === 0){
      tr[i] = highs[i] - lows[i];
    } else {
      const h = highs[i], l = lows[i], pc = closes[i-1];
      tr[i] = Math.max(
        h - l,
        Math.abs(h - pc),
        Math.abs(l - pc)
      );
    }
  }
  // ATR = EMA(TR, period)
  return ema(tr, period);
}