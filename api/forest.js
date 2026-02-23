// api/forest.js  (KRACKEN data, geen Binance geo-blok)
// Works on Vercel Node runtime.

export const config = { runtime: "nodejs" };

const TF_CFG = {
  "15m": { intervalMin: 15, bars: 900 },   // ~9.4 dagen
  "1D":  { intervalMin: 1440, bars: 1200 },// ~3.3 jaar
  "1W":  { intervalMin: 10080, bars: 700 } // ~13 jaar (meestal minder beschikbaar)
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

function linregSlope(values, lookback){
  const n = lookback;
  const ys = values.slice(-n);
  if (ys.length < n) return 0;
  if (ys.some(v => v == null)) return 0;

  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((s,v)=>s+v,0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++){
    const x = i - xMean;
    num += x * (ys[i] - yMean);
    den += x * x;
  }
  return den ? (num / den) : 0;
}

function linearForecast(lastTime, lastValue, slopePerBar, barsForward, stepSec){
  const out = [];
  for (let i = 1; i <= barsForward; i++){
    out.push({ time: lastTime + i * stepSec, value: lastValue + slopePerBar * i });
  }
  return out;
}

async function fetchKrakenOHLC(pair, intervalMin, wantBars){
  // Kraken returns: result[pair] = [[time, open, high, low, close, vwap, volume, count], ...]
  // and result.last = last timestamp
  const bars = [];
  let since = 0; // earliest
  let guard = 0;

  while (bars.length < wantBars && guard < 8) {
    guard++;
    const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${intervalMin}&since=${since}`;
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.[0] || "Kraken HTTP error");
    if (j?.error?.length) throw new Error(j.error.join(", "));

    const result = j.result || {};
    const key = Object.keys(result).find(k => k !== "last");
    const rows = key ? result[key] : null;
    const last = result.last;

    if (!Array.isArray(rows) || !rows.length) break;

    for (const row of rows){
      bars.push({
        time: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low:  Number(row[3]),
        close:Number(row[4]),
        volume:Number(row[6])
      });
    }

    // next page
    since = Number(last || since);

    // safety: if no progress
    if (!since) break;
  }

  // dedupe + sort
  const map = new Map();
  for (const c of bars) map.set(c.time, c);
  const out = Array.from(map.values()).sort((a,b)=>a.time-b.time);

  // keep last wantBars
  return out.length > wantBars ? out.slice(out.length - wantBars) : out;
}

export default async function handler(req, res){
  try{
    const tf = (req.query.tf || "1W").toString();
    if (!TF_CFG[tf]) return res.status(400).json({ error: "tf must be one of: 15m, 1D, 1W" });

    const { intervalMin, bars } = TF_CFG[tf];

    // Pair keuze: XBTUSD is Kraken's BTC/USD
    // (Als je liever USDT wil: Kraken heeft vaak XBTUSDT, maar XBTUSD is het meest standaard)
    let candles = await fetchKrakenOHLC("XBTUSD", intervalMin, bars);

    // betrouwbaarheid: laat laatste candle vallen (kan nog bezig zijn)
    if (candles.length > 10) candles = candles.slice(0, -1);

    const close = candles.map(c=>c.close);
    const high  = candles.map(c=>c.high);
    const low   = candles.map(c=>c.low);

    const ema20 = ema(close, 20);
    const ema50 = ema(close, 50);
    const a = atr(high, low, close, 14);

    const diff = close.map((c,i)=> (ema50[i]==null ? null : (c - ema50[i])));
    const lookback = tf === "15m" ? 400 : (tf === "1D" ? 520 : 156);
    const forestZ = zscore(diff, clamp(lookback, 50, 800));
    const forestSmooth = ema(forestZ, 6);

    // Forest op prijs-chart (EMA20 + z * ATR * mult)
    const mult = tf === "15m" ? 1.2 : 1.6;
    const forestPriceLine = candles.map((c,i)=>{
      const base = ema20[i];
      const zz = forestSmooth[i];
      const atrv = a[i];
      if (base==null || zz==null || atrv==null) return null;
      return { time: c.time, value: base + (zz * atrv * mult) };
    }).filter(Boolean);

    // Forecast (stippel)
    const stepSec = intervalMin * 60;
    const last = forestPriceLine[forestPriceLine.length - 1];
    const forestVals = forestPriceLine.map(p=>p.value);
    const slope = linregSlope(forestVals, clamp(tf==="15m"?60:20, 10, 80));
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
      source: "kraken",
      pair: "XBTUSD",
      candles,
      ema20: candles.map((c,i)=> (ema20[i]==null?null:{time:c.time,value:ema20[i]})).filter(Boolean),
      ema50: candles.map((c,i)=> (ema50[i]==null?null:{time:c.time,value:ema50[i]})).filter(Boolean),
      forestPriceLine,
      forecastLine,
      turningPoints
    });
  }catch(e){
    return res.status(500).json({ error: String(e?.message || e) });
  }
}