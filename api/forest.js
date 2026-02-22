export const config = { runtime: "nodejs" };

const fetchFn = globalThis.fetch;

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
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

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  const q = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      q.push(null);
    } else {
      q.push(v);
      sum += v;
    }

    if (q.length > period) {
      const old = q.shift();
      if (old != null) sum -= old;
    }

    if (q.length === period) {
      // alleen geldig als we echt period geldige punten hebben
      let count = 0;
      for (let j = 0; j < q.length; j++) if (q[j] != null) count++;
      out[i] = count === period ? sum / period : null;
    }
  }
  return out;
}

function rollingStd(values, period) {
  const out = new Array(values.length).fill(null);
  const q = [];

  for (let i = 0; i < values.length; i++) {
    q.push(values[i]);
    if (q.length > period) q.shift();

    if (q.length === period) {
      const data = q.filter(v => v != null);
      if (data.length < period) {
        out[i] = null;
        continue;
      }
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const varr =
        data.reduce((a, b) => a + (b - mean) * (b - mean), 0) / data.length;
      out[i] = Math.sqrt(Math.max(0, varr));
    }
  }
  return out;
}

function rollingPctlAbs(values, period, p = 0.9) {
  const out = new Array(values.length).fill(null);
  const q = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    q.push(v == null ? null : Math.abs(v));
    if (q.length > period) q.shift();

    if (q.length === period) {
      const data = q.filter(x => x != null);
      if (data.length < period) {
        out[i] = null;
        continue;
      }
      const sorted = [...data].sort((a, b) => a - b);
      const idx = Math.floor((sorted.length - 1) * p);
      out[i] = sorted[idx];
    }
  }
  return out;
}

function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;

  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;

    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;

    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function roc(closes, period) {
  const out = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    out[i] = closes[i - period] === 0 ? null : (closes[i] / closes[i - period]) - 1;
  }
  return out;
}

async function fetchKrakenWeeklyCandles() {
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";
  const r = await fetchFn(url, {
    headers: { accept: "application/json", "user-agent": "btc-forest-tv" }
  });
  if (!r.ok) throw new Error(`Kraken HTTP error: ${r.status}`);

  const j = await r.json();
  if (j.error && j.error.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const result = j.result || {};
  const key = Object.keys(result).find(k => k !== "last");
  if (!key) throw new Error("Kraken: missing OHLC result");

  const rows = result[key];
  return rows
    .map(row => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4])
    }))
    .sort((a, b) => a.time - b.time);
}

export default async function handler(req, res) {
  try {
    const candles = await fetchKrakenWeeklyCandles();
    const closes = candles.map(c => c.close);

    // ===== MA (lang) =====
    const maPeriod = closes.length >= 220 ? 200 : 100;
    const ma = sma(closes, maPeriod);

    // ===== RSI =====
    const rsi14 = rsi(closes, 14);

    // ===== Bollinger (20w, 2std) =====
    const bbMA = sma(closes, 20);
    const bbSTD = rollingStd(closes, 20);
    const upper = bbMA.map((m, i) => (m == null || bbSTD[i] == null) ? null : (m + 2 * bbSTD[i]));
    const lower = bbMA.map((m, i) => (m == null || bbSTD[i] == null) ? null : (m - 2 * bbSTD[i]));

    // ===== Trend dist + dynamische schaal (P90 abs over 156w) =====
    const dist = closes.map((c, i) => (ma[i] == null ? null : (c / ma[i] - 1)));
    const distScaleRaw = rollingPctlAbs(dist, 156, 0.9);
    const distScale = distScaleRaw.map(s => (s == null ? null : Math.max(0.05, s))); // min schaal = 5%

    // ===== Cycle = ROC8 - ROC16, schaal = 2*std over 156w =====
    const roc8 = roc(closes, 8);
    const roc16 = roc(closes, 16);
    const cycleRaw = closes.map((_, i) =>
      (roc8[i] == null || roc16[i] == null) ? null : (roc8[i] - roc16[i])
    );
    const cycleStd = rollingStd(cycleRaw, 156);
    const cycleScale = cycleStd.map(s => (s == null ? null : Math.max(0.02, 2 * s))); // min schaal

    // ===== Forest raw =====
    const forestRaw = closes.map((price, i) => {
      if (ma[i] == null || rsi14[i] == null || dist[i] == null || distScale[i] == null) return null;

      // trend continuous
      const trendScore = clamp(dist[i] / distScale[i], -1, 1);

      // momentum continuous
      const momentumScore = clamp((rsi14[i] - 50) / 50, -1, 1);

      // revert: buiten BBands volgens duidelijke formule
      let revertScore = 0;
      if (upper[i] != null && lower[i] != null && bbMA[i] != null) {
        if (price > upper[i]) {
          const denom = Math.max(1e-9, (upper[i] - bbMA[i]));
          revertScore = -clamp((price - upper[i]) / denom, 0, 1);
        } else if (price < lower[i]) {
          const denom = Math.max(1e-9, (bbMA[i] - lower[i]));
          revertScore = clamp((lower[i] - price) / denom, 0, 1);
        }
      }

      // cycle normalized
      let cycleScore = 0;
      if (cycleRaw[i] != null && cycleScale[i] != null) {
        cycleScore = clamp(cycleRaw[i] / cycleScale[i], -1, 1);
      }

      // weights (V2.2)
      const wTrend = 0.40;
      const wMom   = 0.25;
      const wRev   = 0.25;
      const wCyc   = 0.10;

      return (wTrend * trendScore) + (wMom * momentumScore) + (wRev * revertScore) + (wCyc * cycleScore);
    });

    // ===== Smooth forest =====
    const forest = ema(forestRaw, 6);

    // ===== Turning points: dynamische threshold op basis van forest-vol =====
    // We gebruiken 52w rolling std op forest (na smoothing)
    const forestStd52 = rollingStd(forest, 52);

    const turningPoints = [];
    for (let i = 1; i < forest.length; i++) {
      const prev = forest[i - 1];
      const curr = forest[i];
      const std = forestStd52[i];

      if (prev == null || curr == null || std == null) continue;

      // drempel: minimaal 0.12, anders 0.8 * std
      const TH = Math.max(0.12, 0.8 * std);

      if (prev < -TH && curr > +TH) turningPoints.push({ time: candles[i].time, type: "up" });
      if (prev > +TH && curr < -TH) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    res.status(200).json({
      source: "kraken",
      interval: "1w",
      maPeriod,
      candles,
      forest,          // bevat nulls in het begin (correct!)
      turningPoints
    });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}