// api/_lib/forestEngine.js
import { ema, std, atr, percentile } from "./indicators.js";

const WEEK = 7 * 24 * 60 * 60;

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

function lastFinite(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (Number.isFinite(v)) return { i, v };
  }
  return { i: -1, v: null };
}

function buildBands(zArr, tIndex, windowLen = 208) {
  // bands gebaseerd op HISTORIE (geen future): neem laatste windowLen waarden vóór tIndex
  const start = Math.max(0, tIndex - windowLen);
  const slice = [];
  for (let i = start; i < tIndex; i++) {
    const v = zArr[i];
    if (Number.isFinite(v)) slice.push(v);
  }
  slice.sort((a, b) => a - b);
  if (slice.length < 80) return null;

  return {
    p20: percentile(slice, 0.20),
    p35: percentile(slice, 0.35),
    p50: percentile(slice, 0.50),
    p65: percentile(slice, 0.65),
    p80: percentile(slice, 0.80),
  };
}

function computeForest(candles) {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows  = candles.map((c) => c.low);

  const ema50 = ema(closes, 50);
  const dev = closes.map((c, i) =>
    Number.isFinite(c) && Number.isFinite(ema50[i]) ? (c - ema50[i]) : null
  );

  // stabiele z-score: std over 208 weken
  const devStd = std(dev, 208);

  const z = dev.map((d, i) => {
    const s = devStd[i];
    if (!Number.isFinite(d) || !Number.isFinite(s) || s === 0) return null;
    return d / s;
  });

  // ATR(14) voor overlay mapping + forward
  const atr14 = atr(highs, lows, closes, 14);

  return { ema50, devStd, z, atr14 };
}

function makeOverlay(candles, ema50Arr, devStdArr, zArr, atrArr) {
  // Overlay op prijs-chart:
  // basis = EMA50, plus z * (ATR * 1.0) maar begrensd, zodat het nooit idioot wordt.
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    const ema50 = ema50Arr[i];
    const z = zArr[i];
    const a = atrArr[i];

    if (!Number.isFinite(t) || !Number.isFinite(ema50) || !Number.isFinite(z) || !Number.isFinite(a)) {
      continue;
    }

    const zCap = clamp(z, -2.5, 2.5);
    const v = ema50 + zCap * (a * 1.0);
    out.push({ time: t, value: v });
  }
  return out;
}

function labelFromZ(zLast) {
  if (!Number.isFinite(zLast)) return "Forest: not enough data";

  const abs = Math.abs(zLast);
  const base =
    zLast <= -0.35 ? "BEAR" :
    zLast >=  0.35 ? "BULL" :
    "NEUTRAL";

  const strength =
    abs >= 2.2 ? "EXTREME " :
    abs >= 1.5 ? "STRONG " :
    "";

  return `${strength}${base} (${zLast.toFixed(2)})`;
}

function forward4Weeks(candlesTruth, ema50Arr, zArr, atrArr) {
  // Forward is “hint”, nooit waarheid.
  // We projecteren z met demping + ATR rem, max 4 weken.
  const n = candlesTruth.length;
  if (n < 220) return [];

  const { i: lastIdx, v: zNow } = lastFinite(zArr);
  if (lastIdx < 10 || !Number.isFinite(zNow)) return [];

  const t0 = candlesTruth[lastIdx].time;

  // slope op basis van laatste 3 gesloten weken
  const z1 = zArr[lastIdx - 1];
  const z3 = zArr[lastIdx - 3];
  if (!Number.isFinite(z1) || !Number.isFinite(z3)) return [];

  let slope = (zNow - z3) / 3; // per week

  // demping: hoe extremer z, hoe minder we durven “doortrekken”
  const damp = 1 - clamp(Math.abs(zNow) / 3, 0, 1); // bij |z|>=3 -> 0
  slope *= damp;

  // extra rem: max 0.35 z per week
  slope = clamp(slope, -0.35, 0.35);

  const emaNow = ema50Arr[lastIdx];
  const atrNow = atrArr[lastIdx];
  if (!Number.isFinite(emaNow) || !Number.isFinite(atrNow)) return [];

  const out = [];
  for (let k = 1; k <= 4; k++) {
    const tf = t0 + k * WEEK;

    // projecteer z, maar cap altijd
    const zF = clamp(zNow + slope * k, -2.5, 2.5);

    // map naar prijs overlay
    const v = emaNow + zF * (atrNow * 1.0);
    out.push({ time: tf, value: v });
  }
  return out;
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive }) {
  // Truth
  const t = computeForest(candlesTruth);
  const forestOverlayTruth = makeOverlay(candlesTruth, t.ema50, t.devStd, t.z, t.atr14);

  // Live preview (optioneel)
  let forestOverlayLive = [];
  if (hasLive && candlesWithLive && candlesWithLive.length > candlesTruth.length) {
    const l = computeForest(candlesWithLive);
    // alleen het laatste stuk tekenen (we tekenen alles, maar dat is prima)
    forestOverlayLive = makeOverlay(candlesWithLive, l.ema50, l.devStd, l.z, l.atr14);
  }

  const forestOverlayForward = forward4Weeks(candlesTruth, t.ema50, t.z, t.atr14);

  const { v: zLast } = lastFinite(t.z);
  const regimeLabel = labelFromZ(zLast);

  return {
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,
    regimeLabel,
  };
}