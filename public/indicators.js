export function clamp(x, a, b){
  return Math.max(a, Math.min(b, x));
}

export function ema(values, period){
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++){
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

export function atr(candles, period){
  const out = new Array(candles.length).fill(null);
  let trs = [];
  for (let i = 0; i < candles.length; i++){
    const c = candles[i];
    const prevClose = i > 0 ? candles[i-1].close : null;
    const tr = prevClose == null
      ? (c.high - c.low)
      : Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));

    trs.push(tr);
    if (trs.length > period) trs.shift();
    if (trs.length === period) {
      const avg = trs.reduce((a,b)=>a+b,0) / period;
      out[i] = avg;
    }
  }
  return out;
}

export function stdev(values, period){
  const out = new Array(values.length).fill(null);
  const win = [];
  for (let i = 0; i < values.length; i++){
    const v = values[i];
    win.push(v);
    if (win.length > period) win.shift();
    if (win.length === period){
      const mean = win.reduce((a,b)=>a+b,0) / period;
      const varr = win.reduce((a,b)=>a + (b-mean)*(b-mean), 0) / period;
      out[i] = Math.sqrt(varr);
    }
  }
  return out;
}