// api/_lib/forestEngine.js
// BOUWT:
// - forestZTruth / forestZLive (z-score)
// - forestOverlayTruth / forestOverlayLive (prijs overlay)
// - forestOverlayForward (4 weken vooruit, gestreept hint)
// - regimeLabel + debug bands/freeze

import { ema, std, atr, percentileFromWindow, clamp } from "./indicators.js";

function computeForestZ(candles, { emaLen = 50, zWin = 208 } = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const emaArr = ema(closes, emaLen);
  const resid  = closes.map((c, i) => (emaArr[i] == null ? null : (c - emaArr[i])));
  const sdArr  = std(resid, zWin);
  const atrArr = atr(highs, lows, closes, 14);

  const z = resid.map((r, i) => {
    const sd = sdArr[i];
    if (r == null || sd == null || sd === 0) return null;
    return r / sd;
  });

  return { closes, emaArr, atrArr, z };
}

function computeBandsAndFreeze(zArr, atrArr, i, lookback = 208) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);
  const p20Z = percentileFromWindow(zWin, 20);
  const p80Z = percentileFromWindow(zWin, 80);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];

  const freeze = (p20ATR != null && atrNow != null) ? (atrNow < p20ATR) : false;

  return {
    bandsNow: { p35, p65, p20Z, p80Z, p20ATR },
    freezeNow: freeze
  };
}

function regimeFromZ(zNow, bandsNow) {
  const { p35, p65 } = bandsNow;

  if (zNow == null || p35 == null || p65 == null) return "NEUTRAL";

  if (zNow > p65) return "BULL";
  if (zNow < p35) return "BEAR";
  return "NEUTRAL";
}

function strengthLabel(zNow) {
  if (zNow == null) return "";
  const a = Math.abs(zNow);
  if (a >= 2.2) return "EXTREME ";
  if (a >= 1.5) return "STRONG ";
  return "";
}

function buildOverlayPoints(candles, emaArr, atrArr, zArr, { zCap = 2.5, mult = 1.0 } = {}) {
  // overlay = EMA50 + clamp(z)*ATR14*mult
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    const base = emaArr[i];
    const a = atrArr[i];
    const z = zArr[i];
    if (base == null || a == null || z == null) continue;
    const v = base + clamp(z, -zCap, zCap) * a * mult;
    out.push({ time: t, value: v });
  }
  return out;
}

function buildZSeries(candles, zArr) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const z = zArr[i];
    if (z == null) continue;
    out.push({ time: candles[i].time, value: z });
  }
  return out;
}

function buildForwardFromTruth(truthCandles, truthEma, truthAtr, truthZ, weeksForward = 4) {
  // Forward is a “hint”: we project Z a bit, then convert to overlay price.
  // Demping + ATR-rem: geen gekke uitschieters.

  const n = truthCandles.length;
  if (n < 10) return [];

  const lastIdx = n - 1;
  const lastTime = truthCandles[lastIdx].time;
  const lastZ = truthZ[lastIdx];
  const lastEma = truthEma[lastIdx];
  const lastAtr = truthAtr[lastIdx];

  if (lastZ == null || lastEma == null || lastAtr == null) return [];

  // slope op laatste 3 geldige Z punten
  const lastZs = [];
  for (let i = lastIdx; i >= 0 && lastZs.length < 3; i--) {
    if (truthZ[i] != null) lastZs.push(truthZ[i]);
  }
  if (lastZs.length < 3) return [];

  const slope = (lastZs[0] - lastZs[2]) / 2; // per week gemiddeld (ruw)
  const slopeCap = 0.6; // max z-stap per week
  const slopeCapped = clamp(slope, -slopeCap, slopeCap);

  // demping: hoe extremer |z|, hoe minder “doorduwen”
  const damp = 1 - Math.min(Math.abs(lastZ) / 3, 1); // bij |z|=3 => 0
  const step = slopeCapped * (0.35 + 0.65 * damp);   // altijd klein beetje, nooit 0

  const weekSec = 7 * 24 * 60 * 60;
  const out = [];

  // startpunt = laatste truth overlay punt (aansluiten)
  const startOverlay = lastEma + clamp(lastZ, -2.5, 2.5) * lastAtr;
  out.push({ time: lastTime, value: startOverlay });

  for (let k = 1; k <= weeksForward; k++) {
    const zF = clamp(lastZ + step * k, -2.5, 2.5);
    const overlay = lastEma + zF * lastAtr;
    out.push({ time: lastTime + weekSec * k, value: overlay });
  }

  return out;
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive }) {
  // TRUTH
  const t = computeForestZ(candlesTruth);
  const lastIdxT = candlesTruth.length - 1;

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBandsAndFreeze(t.z, t.atrArr, lastIdxT, 208)
    : { bandsNow: {}, freezeNow: false };

  const reg = regimeFromZ(t.z[lastIdxT], bandsNow);
  const label = `${strengthLabel(t.z[lastIdxT])}${reg} (${t.z[lastIdxT] != null ? t.z[lastIdxT].toFixed(2) : "n/a"})`;

  const forestOverlayTruth = buildOverlayPoints(candlesTruth, t.emaArr, t.atrArr, t.z);
  const forestZTruth = buildZSeries(candlesTruth, t.z);

  // LIVE (optioneel)
  let forestOverlayLive = [];
  let forestZLive = [];

  if (hasLive && candlesWithLive?.length) {
    const l = computeForestZ(candlesWithLive);
    forestOverlayLive = buildOverlayPoints(candlesWithLive, l.emaArr, l.atrArr, l.z);
    forestZLive = buildZSeries(candlesWithLive, l.z);
  }

  // FORWARD (4 weken vanaf truth)
  const forestOverlayForward = buildForwardFromTruth(candlesTruth, t.emaArr, t.atrArr, t.z, 4);

  return {
    regimeLabel: label,

    // overlay op prijs-chart
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,

    // z-score paneel
    forestZTruth,
    forestZLive,

    // debug/onder motorkap
    bandsNow,
    freezeNow
  };
}