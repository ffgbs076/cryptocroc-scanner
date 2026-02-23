// api/_lib/forestEngine.js
// ✅ buildForestOverlay() returns everything your frontend needs
// ✅ Truth = closed weeks only (no repaint). Live preview is separate (dashed).
// ✅ Forward line = 4 weeks (dashed), bounded + damped.

import { ema, std, atr } from "./indicators.js";

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function percentileFromWindow(sortedVals, p) {
  // p: 0..1
  if (!sortedVals.length) return null;
  const idx = Math.max(0, Math.min(sortedVals.length - 1, Math.round(p * (sortedVals.length - 1))));
  return sortedVals[idx];
}

function rollingPercentile(series, length, p) {
  const out = new Array(series.length).fill(null);
  for (let i = 0; i < series.length; i++) {
    if (i < length - 1) continue;
    const window = [];
    for (let j = i - length + 1; j <= i; j++) {
      const v = series[j];
      if (v == null || !Number.isFinite(v)) continue;
      window.push(v);
    }
    if (window.length < Math.max(30, Math.floor(length * 0.6))) continue;
    window.sort((a, b) => a - b);
    out[i] = percentileFromWindow(window, p);
  }
  return out;
}

// Fractal pivots (non-repaint): pivot at i is only "known" at i+right
function buildFractalPivots(candles, left = 3, right = 3) {
  const pivotsHigh = new Array(candles.length).fill(null);
  const pivotsLow = new Array(candles.length).fill(null);

  for (let i = left; i < candles.length - right; i++) {
    const hi = candles[i].high;
    const lo = candles[i].low;

    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= hi) isHigh = false;
      if (candles[j].low <= lo) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivotsHigh[i + right] = hi; // becomes known at i+right
    if (isLow) pivotsLow[i + right] = lo;
  }

  // Carry-forward last known pivot levels
  const lastHigh = new Array(candles.length).fill(null);
  const lastLow = new Array(candles.length).fill(null);
  let h = null, l = null;
  for (let i = 0; i < candles.length; i++) {
    if (pivotsHigh[i] != null) h = pivotsHigh[i];
    if (pivotsLow[i] != null) l = pivotsLow[i];
    lastHigh[i] = h;
    lastLow[i] = l;
  }

  return { lastPivotHigh: lastHigh, lastPivotLow: lastLow };
}

function computeForestZ(candles, emaLen = 50, stdWin = 208) {
  const closes = candles.map(c => c.close);
  const e = ema(closes, emaLen);
  const dev = closes.map((v, i) => (e[i] == null ? null : (v - e[i])));
  const s = std(dev, stdWin);
  const z = dev.map((v, i) => {
    const sd = s[i];
    if (v == null || sd == null || sd === 0) return null;
    return v / sd;
  });

  // light smoothing on z for readability (still no repaint for truth)
  const zSmooth = ema(z, 8);

  return { closes, emaBase: e, dev, stdDev: s, forestZ: zSmooth };
}

function regimeFromRules({ candles, forestZ, atr14, p65, p35, p80, p20, atrP20, lastPivotHigh, lastPivotLow }) {
  // Regime with hysteresis + ATR freeze + structure filter
  // States: "BULL" | "BEAR" | "NEUTRAL"
  let state = "NEUTRAL";
  let pending = null; // { targetState, need, got }

  const regime = new Array(candles.length).fill("NEUTRAL");
  const freeze = new Array(candles.length).fill(false);

  for (let i = 0; i < candles.length; i++) {
    const z = forestZ[i];
    const close = candles[i].close;

    const atrNow = atr14[i];
    const atrFreeze = (atrNow != null && atrP20[i] != null && atrNow < atrP20[i]);
    freeze[i] = !!atrFreeze;

    // If freeze: do not allow switching this bar
    const canSwitch = !atrFreeze;

    const tBull = p65[i];
    const tBear = p35[i];
    const tBullFast = p80[i];  // extreme upper
    const tBearFast = p20[i];  // extreme lower

    const structureOkBull = (lastPivotHigh[i] == null) ? true : (close > lastPivotHigh[i]);
    const structureOkBear = (lastPivotLow[i] == null) ? true : (close < lastPivotLow[i]);

    let want = null;
    let need = 0;

    if (z != null && tBull != null && tBear != null) {
      // Fast switch if extreme
      if (tBullFast != null && z > tBullFast && structureOkBull) { want = "BULL"; need = 1; }
      if (tBearFast != null && z < tBearFast && structureOkBear) { want = "BEAR"; need = 1; }

      // Normal switch if not extreme
      if (!want) {
        if (z > tBull && structureOkBull) { want = "BULL"; need = 2; }
        else if (z < tBear && structureOkBear) { want = "BEAR"; need = 2; }
        else { want = "NEUTRAL"; need = 2; } // require 2 confirmations to leave strong regimes
      }
    }

    if (!canSwitch || want == null) {
      regime[i] = state;
      continue;
    }

    // Hysteresis/pending logic
    if (want === state) {
      pending = null;
      regime[i] = state;
      continue;
    }

    if (!pending || pending.targetState !== want) {
      pending = { targetState: want, need, got: 1 };
    } else {
      pending.got += 1;
    }

    if (pending.got >= pending.need) {
      state = pending.targetState;
      pending = null;
    }

    regime[i] = state;
  }

  return { regime, freeze };
}

function buildOverlay(candles, emaBase, atr14, forestZ, multiplier = 2.0) {
  // Overlay on price chart: base EMA + z * ATR * multiplier (clamped)
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    const base = emaBase[i];
    const a = atr14[i];
    const z = forestZ[i];
    if (base == null || a == null || z == null) continue;

    const zc = clamp(z, -3, 3);
    const value = base + (zc * a * multiplier);
    out.push({ time: t, value });
  }
  return out;
}

function buildForward4Weeks({ lastTruthTime, lastBase, lastAtr, lastZ, zSlopePerWeek, multiplier = 2.0 }) {
  // 4 future points (1..4 weeks). Bounded & damped.
  const out = [];
  if (![lastTruthTime, lastBase, lastAtr, lastZ].every(v => v != null)) return out;

  const maxSlope = 0.35; // max z-change per week
  const slope = clamp(zSlopePerWeek ?? 0, -maxSlope, maxSlope);

  for (let k = 1; k <= 4; k++) {
    // Damping: if |z| is already extreme, reduce continuation
    const damp = 1 - clamp(Math.abs(lastZ) / 3, 0, 1); // z=3 => damp=0
    const zNext = clamp(lastZ + slope * k * damp, -3, 3);

    // Extra ATR-bounds: do not allow overlay to jump too much in price space
    const value = lastBase + (zNext * lastAtr * multiplier);

    out.push({ time: lastTruthTime + k * 7 * 24 * 60 * 60, value });
  }
  return out;
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive }) {
  // ===== TRUTH (closed weeks) =====
  const truth = computeForestZ(candlesTruth, 50, 208);
  const atrTruth = atr(candlesTruth, 14);

  const p65 = rollingPercentile(truth.forestZ, 208, 0.65);
  const p35 = rollingPercentile(truth.forestZ, 208, 0.35);
  const p80 = rollingPercentile(truth.forestZ, 208, 0.80);
  const p20 = rollingPercentile(truth.forestZ, 208, 0.20);
  const atrP20 = rollingPercentile(atrTruth, 208, 0.20);

  const pivTruth = buildFractalPivots(candlesTruth, 3, 3);

  const { regime, freeze } = regimeFromRules({
    candles: candlesTruth,
    forestZ: truth.forestZ,
    atr14: atrTruth,
    p65, p35, p80, p20,
    atrP20,
    lastPivotHigh: pivTruth.lastPivotHigh,
    lastPivotLow: pivTruth.lastPivotLow
  });

  const forestOverlayTruth = buildOverlay(candlesTruth, truth.emaBase, atrTruth, truth.forestZ, 2.0);

  // last truth slope (for forward)
  const zArr = truth.forestZ.filter(v => v != null);
  let zSlope = 0;
  if (truth.forestZ.length >= 4) {
    const i = truth.forestZ.length - 1;
    const z0 = truth.forestZ[i];
    const z1 = truth.forestZ[i - 1];
    const z2 = truth.forestZ[i - 2];
    const z3 = truth.forestZ[i - 3];
    if ([z0, z1, z2, z3].every(v => v != null)) {
      // slope from last 3 diffs (avg)
      zSlope = ((z0 - z1) + (z1 - z2) + (z2 - z3)) / 3;
    }
  }

  // Forward = based on last truth point only
  const lastIdxT = candlesTruth.length - 1;
  const forestOverlayForward = buildForward4Weeks({
    lastTruthTime: candlesTruth[lastIdxT]?.time,
    lastBase: truth.emaBase[lastIdxT],
    lastAtr: atrTruth[lastIdxT],
    lastZ: truth.forestZ[lastIdxT],
    zSlopePerWeek: zSlope,
    multiplier: 2.0
  });

  // Regime label from last truth
  const lastReg = regime[lastIdxT] || "NEUTRAL";
  const lastZ = truth.forestZ[lastIdxT];
  let regimeLabel = "NEUTRAL";
  if (lastReg === "BULL") regimeLabel = `BULL (${lastZ?.toFixed(2) ?? "n/a"})`;
  if (lastReg === "BEAR") regimeLabel = `BEAR (${lastZ?.toFixed(2) ?? "n/a"})`;
  if (lastReg === "NEUTRAL") regimeLabel = `NEUTRAL (${lastZ?.toFixed(2) ?? "n/a"})`;
  if (lastZ != null && Math.abs(lastZ) >= 1.5) {
    if (lastReg === "BULL") regimeLabel = `STRONG BULL (${lastZ.toFixed(2)})`;
    if (lastReg === "BEAR") regimeLabel = `STRONG BEAR (${lastZ.toFixed(2)})`;
  }

  // ===== LIVE (optional) =====
  // Live preview is allowed to update (dashed). Truth never repaints.
  let forestOverlayLive = [];
  if (hasLive && candlesWithLive?.length) {
    const live = computeForestZ(candlesWithLive, 50, 208);
    const atrLive = atr(candlesWithLive, 14);
    forestOverlayLive = buildOverlay(candlesWithLive, live.emaBase, atrLive, live.forestZ, 2.0);
  }

  // Also return forestZ arrays if you later want a separate panel (optional)
  const forestZTruth = candlesTruth.map((c, i) => {
    const v = truth.forestZ[i];
    return v == null ? null : ({ time: c.time, value: v });
  }).filter(Boolean);

  const forestZLive = (hasLive && candlesWithLive?.length)
    ? (candlesWithLive.map((c, i) => {
        const live = computeForestZ(candlesWithLive, 50, 208);
        const v = live.forestZ[i];
        return v == null ? null : ({ time: c.time, value: v });
      }).filter(Boolean))
    : [];

  return {
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,

    forestZTruth,
    forestZLive,

    bandsNow: {
      p35: p35[lastIdxT],
      p65: p65[lastIdxT],
      p20: p20[lastIdxT],
      p80: p80[lastIdxT],
      atrP20: atrP20[lastIdxT],
    },

    freezeNow: !!freeze[lastIdxT],
    regimeLabel
  };
}