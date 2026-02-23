// api/forest.js
export const config = { runtime: "nodejs" };

const TF_MAP = {
  "15m": { cgDays: 30, interval: "15m", stepSec: 15 * 60 },
  "1D":  { cgDays: 365 * 2, interval: "daily", stepSec: 24 * 60 * 60 },
  "1W":  { cgDays: 365 * 8, interval: "daily", stepSec: 24 * 60 * 60 } // we resamplen naar week
};

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function ema(values, len){
  const k = 2 / (len + 1);
  let out = [];
  let prev = null;
  for (let i = 0; i < values.length; i++){
    const v = values[i];
    if (v == null) { out.push(null); continue; }
    if (prev == null) prev = v;
    else prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function atr(high, low, close, len){
  const tr = [];
  for (let i = 0; i < close.length; i++){
    if (i === 0) tr.push(high[i] - low[i]);
    else {
      const a = high[i] - low[i];
      const b = Math.abs(high[i] - close[i-1]);
      const c = Math.abs(low[i] - close[i-1]);
      tr.push(Math.max(a,b,c));
    }
  }
  return ema(tr, len);
}

function stdev(values, len){
  const out = [];
  for (let i = 0; i < values.length; i++){
    if (i < len - 1) { out.push(null); continue; }
    const win = values.slice(i-len+1, i+1).filter(v => v != null);
    if (!win.length) { out.push(null); continue; }
    const m = win.reduce((s,v)=>s+v,0) / win.length;
    const v = win.reduce((s,x)=>s+(x-m)*(x-m),0) / win.length;
    out.push(Math.sqrt(v));
  }
  return out;
}

function zscore(series, lookback){
  const out = [];
  for (let i = 0; i < series.length; i++){
    if (i < lookback - 1) { out.push(null); continue; }
    const win = series.slice(i-lookback+1, i+1).filter(v => v != null);
    if (!win.length) { out.push(null); continue; }
    const m = win.reduce((s,v)=>s+v,0) / win.length;
    const sd = Math.sqrt(win.reduce((s,x)=>s+(x-m)*(x-m),0) / win.length) || 1e-9;
    out.push((series[i] - m) / sd);
  }
  return out;
}

function resampleToWeekly(dailyCandles){
  // verwacht: [{time, open, high, low, close, volume}] time in seconds (UTC)
  // we maken weekbars op basis van ISO week-start (maandag 00:00 UTC)
  const byWeek = new Map();
  for (const c of dailyCandles){
    const d = new Date(c.time * 1000);
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const diffToMon = (day + 6) % 7;
    const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    mon.setUTCDate(mon.getUTCDate() - diffToMon);
    const key = Math.floor(mon.getTime()/1000);

    if (!byWeek.has(key)){
      byWeek.set(key, { time: key, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      const w = byWeek.get(key);
      w.high = Math.max(w.high, c.high);
      w.low  = Math.min(w.low, c.low);
      w.close = c.close;
      w.volume += (c.volume || 0);
    }
  }
  return Array.from(byWeek.values()).sort((a,b)=>a.time-b.time);
}

function linearForecast(lastTime, lastValue, slopePerBar, barsForward, stepSec){
  const out = [];
  for (let i = 1; i <= barsForward; i++){
    out.push({ time: lastTime + i * stepSec, value: lastValue + slopePerBar * i });
  }
  return out;
}

function linregSlope(values, lookback){
  // slope per bar op laatste lookback punten
  const n = lookback;
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(i);
  const xMean = (n - 1) / 2;

  const ys = values.slice(-n);
  if (ys.some(v => v == null)) return 0;

  const yMean = ys.reduce((s,v)=>s+v,0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++){
    num += (xs[i]-xMean) * (ys[i]-yMean);
    den += (xs[i]-xMean) * (xs[i]-xMean);
  }
  return den ? (num / den) : 0;
}

async function fetchBinanceKlines(symbol, interval, limit){
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.msg || "Binance error");
  return j.map(k => ({
    time: Math.floor(k[0]/1000),
    open: Number(k[1]),
    high: Number(k[2]),
    low:  Number(k[3]),
    close:Number(k[4]),
    volume:Number(k[5])
  }));
}

export default async function handler(req, res){
  try{
    const tf = (req.query.tf || "1W").toString();
    if (!TF_MAP[tf]) return res.status(400).json({ error: "tf must be one of: 15m, 1D, 1W" });

    // 15m: 1000 candles max op Binance per call → genoeg voor forest.
    // 1D/1W: pak daily en resample voor week.
    let candles;
    if (tf === "15m"){
      candles = await fetchBinanceKlines("BTCUSDT", "15m", 1000);
    } else {
      const daily = await fetchBinanceKlines("BTCUSDT", "1d", 2000);
      candles = (tf === "1W") ? resampleToWeekly(daily) : daily;
    }

    // betrouwbaarheid: laat laatste candle vallen (kan nog bezig zijn)
    if (candles.length > 10) candles = candles.slice(0, -1);

    const close = candles.map(c=>c.close);
    const high  = candles.map(c=>c.high);
    const low   = candles.map(c=>c.low);

    // Basis (over prijs) + Forest Z
    const ema20 = ema(close, 20);
    const ema50 = ema(close, 50);
    const a = atr(high, low, close, 14);

    // “forest raw” = afstand t.o.v. ema50 genormaliseerd
    const diff = close.map((c,i)=> (ema50[i]==null ? null : (c - ema50[i])));
    const lookback = tf === "15m" ? 400 : (tf === "1D" ? 252*2 : 156); // grof maar stabiel
    const forestZ = zscore(diff, clamp(lookback, 50, 800));
    const forestSmooth = ema(forestZ, 6);

    // Forest overlay in prijsruimte
    const mult = tf === "15m" ? 1.2 : 1.6; // visueel prettig; mag je later tunen
    const forestPrice = candles.map((c,i)=>{
      const base = ema20[i];
      const zz = forestSmooth[i];
      const atrv = a[i];
      if (base==null || zz==null || atrv==null) return null;
      return { time: c.time, value: base + (zz * atrv * mult) };
    }).filter(Boolean);

    // Forecast (stippel)
    const stepSec = TF_MAP[tf].stepSec;
    const last = forestPrice[forestPrice.length-1];
    const forestValues = forestPrice.map(p=>p.value);
    const slope = linregSlope(forestValues, clamp(tf==="15m"?60:20, 10, 80));
    const forward = tf === "15m" ? 80 : (tf === "1D" ? 30 : 20);
    const forecastLine = last ? linearForecast(last.time, last.value, slope, forward, stepSec) : [];

    // Turning points (simpel, geen lookahead)
    const turningPoints = [];
    for (let i = 2; i < forestSmooth.length; i++){
      const a0 = forestSmooth[i-2], a1 = forestSmooth[i-1], a2 = forestSmooth[i];
      if (a0==null||a1==null||a2==null) continue;
      if (a1 < a0 && a1 < a2) turningPoints.push({ time: candles[i-1].time, type: "up" });
      if (a1 > a0 && a1 > a2) turningPoints.push({ time: candles[i-1].time, type: "down" });
    }

    res.setHeader("content-type","application/json");
    return res.status(200).json({
      tf,
      candles,
      ema20: candles.map((c,i)=> (ema20[i]==null?null:{time:c.time,value:ema20[i]})).filter(Boolean),
      ema50: candles.map((c,i)=> (ema50[i]==null?null:{time:c.time,value:ema50[i]})).filter(Boolean),
      forestPriceLine: forestPrice,
      forecastLine,
      turningPoints
    });
  }catch(e){
    return res.status(500).json({ error: String(e?.message || e) });
  }
}