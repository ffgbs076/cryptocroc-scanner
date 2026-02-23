import { ema, std, atr, clamp } from "./indicators.js";

const WEEK_SEC = 7 * 24 * 60 * 60;

function toSeries(candles, values) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v == null) continue;
    out.push({ time: candles[i].time, value: v });
  }
  return out;
}

function buildZScore(candles) {
  const closes = candles.map((c) => c.close);
  const e50 = ema(closes, 50);

  // dev = close - ema50
  const dev = closes.map((c, i) => (e50[i] == null ? null : c - e50[i]));

  // 4 jaar window weekly ≈ 208
  const devStd = std(dev, 208);

  const z = dev.map((d, i) => {
    const s = devStd[i];
    if (d == null || s == null || s === 0) return null;
    return d / s;
  });

  return { closes, e50, devStd, z };
}

function regimeLabelFromZ(zLast) {
  if (zLast == null) return "Forest: n/a";
  if (zLast <= -2.2) return `EXTREME BEAR (${zLast.toFixed(2)})`;
  if (zLast <= -1.5) return `STRONG BEAR (${zLast.toFixed(2)})`;
  if (zLast < -0.35) return `BEAR (${zLast.toFixed(2)})`;
  if (zLast >= 2.2) return `EXTREME BULL (${zLast.toFixed(2)})`;
  if (zLast >= 1.5) return `STRONG BULL (${zLast.toFixed(2)})`;
  if (zLast > 0.35) return `BULL (${zLast.toFixed(2)})`;
  return `NEUTRAL (${zLast.toFixed(2)})`;
}

function computeOverlay(candles, z, e50, atr14) {
  // Overlay op prijs-chart: base = EMA50, plus z * ATR (begrensd)
  const overlay = new Array(candles.length).fill(null);
  const zCap = 2.5;
  const mult = 1.25; // hoe “wijd” de lijn loopt rond de EMA

  for (let i = 0; i < candles.length; i++) {
    if (z[i] == null || e50[i] == null || atr14[i] == null) continue;
    const zz = clamp(z[i], -zCap, zCap);
    overlay[i] = e50[i] + zz * atr14[i] * mult;
  }
  return overlay;
}

function computeForward(candlesTruth, overlayTruth, zTruth, atrTruth, forwardWeeks) {
  // Forward is ALTIJD hint: korte horizon, rem op slope, extra demping bij extreme z
  if (!forwardWeeks || forwardWeeks < 1) return [];

  const n = candlesTruth.length;
  if (n < 10) return [];

  const lastIdx = n - 1;
  const lastTime = candlesTruth[lastIdx].time;
  const lastOverlay = overlayTruth[lastIdx];
  const lastZ = zTruth[lastIdx];
  const lastAtr = atrTruth[lastIdx];

  if (lastOverlay == null || lastZ == null || lastAtr == null) return [];

  // slope op basis van laatste 3 punten (als beschikbaar)
  const i1 = lastIdx;
  const i0 = lastIdx - 3;
  let slope = 0;

  if (i0 >= 0 && overlayTruth[i0] != null) {
    slope = (lastOverlay - overlayTruth[i0]) / 3; // per week
  } else if (overlayTruth[lastIdx - 1] != null) {
    slope = lastOverlay - overlayTruth[lastIdx - 1];
  }

  // rem: max slope = 0.5 * ATR per week
  const maxSlope = lastAtr * 0.5;
  slope = clamp(slope, -maxSlope, maxSlope);

  // demping: hoe extremer z, hoe minder “doortrekken”
  const damp = 1 - clamp(Math.abs(lastZ) / 3, 0, 1); // z=3 => 0
  slope = slope * damp;

  const out = [];
  for (let k = 1; k <= forwardWeeks; k++) {
    const t = lastTime + WEEK_SEC * k;
    const v = lastOverlay + slope * k;
    out.push({ time: t, value: v });
  }
  // ook 1 punt op lastTime toevoegen zodat het netjes aansluit
  out.unshift({ time: lastTime, value: lastOverlay });
  return out;
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive, forwardWeeks = 4 }) {
  // TRUTH
  const truthCalc = buildZScore(candlesTruth);
  const atrTruth = atr(candlesTruth, 14);
  const overlayTruthArr = computeOverlay(candlesTruth, truthCalc.z, truthCalc.e50, atrTruth);

  const forestOverlayTruth = toSeries(candlesTruth, overlayTruthArr);
  const forestZTruth = toSeries(candlesTruth, truthCalc.z);

  const zLast = truthCalc.z[truthCalc.z.length - 1];
  const regimeLabel = regimeLabelFromZ(zLast);

  const bandsNow = {
    z: zLast,
    bull: 0.35,
    neutral: 0.0,
    bear: -0.35,
  };

  // LIVE PREVIEW (optioneel)
  let forestOverlayLive = [];
  if (hasLive && candlesWithLive?.length) {
    const liveCalc = buildZScore(candlesWithLive);
    const atrLive = atr(candlesWithLive, 14);
    const overlayLiveArr = computeOverlay(candlesWithLive, liveCalc.z, liveCalc.e50, atrLive);
    forestOverlayLive = toSeries(candlesWithLive, overlayLiveArr);
  }

  // FORWARD (op basis van TRUTH)
  const forestOverlayForward = computeForward(
    candlesTruth,
    overlayTruthArr,
    truthCalc.z,
    atrTruth,
    forwardWeeks
  );

  return {
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,
    forestZTruth,
    bandsNow,
    regimeLabel,
  };
}