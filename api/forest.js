export const config = { runtime: "nodejs" };

// helpers
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function sma(values, period){
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++){
    const v = values[i];
    sum += v;
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values, period){
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++){
    const v = values[i];
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

// Wilder RSI(14)
function rsi(closes, period = 14){
  const out = Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++){
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  gain /= period;
  loss /= period;

  let rs = loss === 0 ? 100 : gain / loss;
  out[period] = 100 - (100 / (1 + rs));

  for (let i = period + 1; i < closes.length; i++){
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;

    rs = loss === 0 ? 100 : gain / loss;
    out[i] = 100 - (100 / (1 + rs));
  }
  return out;
}

function std(values, period){
  const out = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++){
    if (i < period - 1) continue;
    let m = 0;
    for (let j = i - period + 1; j <= i; j++) m += values[j];
    m /= period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++){
      const d = values[j] - m;
      v += d * d;
    }
    v /= period;
    out[i] = Math.sqrt(v);
  }
  return out;
}

// ATR(14) op weekly candles
function atr(candles, period = 14){
  const out = Array(candles.length).fill(null);
  const tr = [];
  for (let i = 0; i < candles.length; i++){
    const c = candles[i];
    const prevClose = i === 0 ? c.close : candles[i - 1].close;
    const t = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    tr.push(t);
  }
  // Wilder smoothing
  if (tr.length < period) return out;
  let v = 0;
  for (let i = 0; i < period; i++) v += tr[i];
  v /= period;
  out[period - 1] = v;

  for (let i = period; i < tr.length; i++){
    v = (v * (period - 1) + tr[i]) / period;
    out[i] = v;
  }
  return out;
}

export default async function handler(req, res){
  try {
    // Kraken OHLC: interval=10080 is 1 week
    const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    const j = await r.json();

    if (!j || j.error?.length) {
      return res.status(502).json({ error: "Kraken error: " + (j?.error?.join(", ") || "unknown") });
    }

    const key = Object.keys(j.result).find(k => k !== "last");
    const rows = j.result[key] || [];

    // rows: [time, open, high, low, close, vwap, volume, count]
    const candles = rows.map(row => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4])
    }));

    const closes = candles.map(c => c.close);

    const maPeriod = 200;
    const ma = sma(closes, maPeriod);

    const rsi14 = rsi(closes, 14);

    const atr14 = atr(candles, 14);
    const atrp = atr14.map((a, i) => (a == null ? null : a / closes[i])); // ATR% (0.05 = 5%)

    // Bollinger (20,2)
    const bbPeriod = 20;
    const mid = sma(closes, bbPeriod);
    const sd = std(closes, bbPeriod);
    const upper = mid.map((m, i) => (m == null || sd[i] == null) ? null : m + 2 * sd[i]);
    const lower = mid.map((m, i) => (m == null || sd[i] == null) ? null : m - 2 * sd[i]);

    // cycle: ROC8 - ROC16, genormaliseerd met rolling std(156 weken ~ 3 jaar)
    const roc = (n) => closes.map((c, i) => (i < n ? null : (c / closes[i - n] - 1)));
    const roc8 = roc(8);
    const roc16 = roc(16);
    const cycleRaw = closes.map((_, i) => (roc8[i] == null || roc16[i] == null) ? null : (roc8[i] - roc16[i]));
    const cycleStd = std(cycleRaw.map(v => v ?? 0), 156); // veilig
    const cycleScore = cycleRaw.map((v, i) => {
      if (v == null || cycleStd[i] == null || cycleStd[i] === 0) return null;
      return clamp(v / (2 * cycleStd[i]), -1, 1);
    });

    // Trend score: dynamisch met ATR (geen vaste 0.30)
    // score = (close - MA) / (2*ATR) clamped [-1,1]
    const trendScore = closes.map((c, i) => {
      if (ma[i] == null || atr14[i] == null || atr14[i] === 0) return null;
      return clamp((c - ma[i]) / (2 * atr14[i]), -1, 1);
    });

    // Momentum score: (RSI-50)/50
    const momScore = rsi14.map(v => (v == null ? null : clamp((v - 50) / 50, -1, 1)));

    // Mean reversion score: buiten BB = trek terug naar binnen
    const revertScore = closes.map((c, i) => {
      const m = mid[i], u = upper[i], l = lower[i];
      if (m == null || u == null || l == null) return null;
      if (c > u) return clamp(- (c - u) / (u - m), -1, 0);
      if (c < l) return clamp((l - c) / (m - l), 0, 1);
      return 0;
    });

    // Combine (V2-ish): weights (MVP, later tunen)
    const wTrend = 0.45, wMom = 0.30, wRev = 0.15, wCyc = 0.10;

    const rawForest = closes.map((_, i) => {
      const a = trendScore[i], b = momScore[i], c = revertScore[i], d = cycleScore[i];
      if (a == null || b == null || c == null || d == null) return null;
      return clamp(wTrend*a + wMom*b + wRev*c + wCyc*d, -1, 1);
    });

    // Smoothing (EMA 6)
    const forest = ema(rawForest.map(v => v ?? 0), 6).map((v, i) => rawForest[i] == null ? null : v);

    // Turning points: cross over thresholds
    const TH = 0.20;
    const turningPoints = [];
    for (let i = 1; i < forest.length; i++){
      const p = forest[i - 1], v = forest[i];
      if (p == null || v == null) continue;
      if (p < -TH && v > TH) turningPoints.push({ time: candles[i].time, type: "up" });
      if (p > TH && v < -TH) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      version: "forest-v2",
      source: "kraken",
      interval: "1w",
      maPeriod,
      candles,
      forest,
      turningPoints
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}