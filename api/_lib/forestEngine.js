// api/_lib/forestEngine.js
import { ema, stdev, atr, adx } from "./indicators.js";
import { findPivots, structurePenalty } from "./structure.js";

/**
 * Forest 3.0 (Optie B):
 * - ForestZ op WEEKLY (alleen closed candles voor truth)
 * - ConfidenceFactor ingebouwd:
 *   - TrendStrength via ADX (laag = chop = Forest afgevlakt)
 *   - StructurePenalty (dicht bij belangrijke pivots = voorzichtig = afgevlakt)
 *   - Daily EMA200 proximity (dicht erbij = “decision zone” = afgevlakt)
 *   - Capitulation volume (extreem volume + grote range = mogelijk turning = afgevlakt)
 *
 * Resultaat:
 *   FilteredZ = ForestZ * ConfidenceFactor
 * Dit maakt Forest veel “blind-volgbaar”.
 */

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function lastNonNull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return { i, v: arr[i] };
  return { i: -1, v: null };
}

function buildZscoreDeviation(closes, emaLen = 50, devWindow = 208) {
  const base = ema(closes, emaLen);
  const devSeries = closes.map((c, i) => (base[i] == null ? null : (c - base[i])));
  const dev = stdev(devSeries, devWindow);
  const z = devSeries.map((d, i) => {
    const sd = dev[i];
    if (d == null || sd == null || sd === 0) return null;
    return d / sd;
  });
  return { base, z };
}

// simpele capitulation detector op weekly
function capitulationFlag(candles, atr14, volZ, idx) {
  // “capitulation”: grote range + volume spike
  const c = candles[idx];
  const a = atr14[idx];
  const vz = volZ[idx];
  if (!c || !a || vz == null) return 0;

  const range = c.high - c.low;
  const bigRange = range > 1.6 * a;
  const bigVol = vz > 1.2;
  return (bigRange && bigVol) ? 1 : 0;
}

function volumeZscore(vols, win = 52) {
  // zscore(volume) over rolling window
  const mean = Array(vols.length).fill(null);
  const sd = Array(vols.length).fill(null);
  for (let i = 0; i < vols.length; i++) {
    if (i < win - 1) continue;
    let n = 0, s = 0, ss = 0;
    for (let j = i - win + 1; j <= i; j++) {
      const v = vols[j];
      if (v == null) continue;
      n++; s += v; ss += v * v;
    }
    if (n < Math.max(10, Math.floor(win * 0.8))) continue;
    const m = s / n;
    const varr = Math.max(0, ss / n - m * m);
    mean[i] = m;
    sd[i] = Math.sqrt(varr);
  }
  return vols.map((v, i) => {
    if (v == null || mean[i] == null || sd[i] == null || sd[i] === 0) return null;
    return (v - mean[i]) / sd[i];
  });
}

function confidenceFactor({
  weeklyCandles,
  weeklyClose,
  weeklyADX,
  pivots,
  dailyEma200Now,
  atr14,
  volZ,
  i
}) {
  // 1) TrendStrength via ADX: <20 = chop (laag), >25 = trend (hoog)
  const adxNow = weeklyADX[i];
  let fAdx = 0.65; // default midden
  if (adxNow != null) {
    fAdx = clamp((adxNow - 15) / (30 - 15), 0, 1); // 15..30 => 0..1
  }

  // 2) StructurePenalty: dicht bij pivot clusters => voorzichtig
  const sPen = structurePenalty(weeklyClose[i], pivots, 0.012, 104); // 1.2% band
  const fStructure = 1 - (0.55 * sPen); // penalty drukt factor

  // 3) Daily EMA200 proximity: dicht bij EMA200 = decision zone (vaak chop / fakeouts)
  // we gebruiken relatieve afstand
  let fDaily200 = 1;
  if (dailyEma200Now != null) {
    const dist = Math.abs(weeklyClose[i] - dailyEma200Now) / weeklyClose[i];
    // <1%: heel dicht (factor omlaag), >4%: ver weg (factor ~1)
    fDaily200 = clamp((dist - 0.01) / (0.04 - 0.01), 0, 1);
    // fDaily200: 0..1, maar we willen minimaal 0.5 (niet nul maken)
    fDaily200 = 0.5 + 0.5 * fDaily200;
  }

  // 4) Capitulation: extreem volume + range => vaak turning risk
  const cap = capitulationFlag(weeklyCandles, atr14, volZ, i);
  const fCap = cap ? 0.65 : 1;

  // Combine (0..1)
  const combined = clamp(fAdx * fStructure * fDaily200 * fCap, 0.25, 1);
  return {
    combined,
    parts: { fAdx, fStructure, fDaily200, fCap }
  };
}

function labelFromZ(z) {
  if (z == null) return "Forest: not enough data";
  if (z <= -2.2) return `EXTREME BEAR (${z.toFixed(2)})`;
  if (z <= -1.5) return `STRONG BEAR (${z.toFixed(2)})`;
  if (z <= -0.35) return `BEAR (${z.toFixed(2)})`;
  if (z >= 2.2) return `EXTREME BULL (${z.toFixed(2)})`;
  if (z >= 1.5) return `STRONG BULL (${z.toFixed(2)})`;
  if (z >= 0.35) return `BULL (${z.toFixed(2)})`;
  return `NEUTRAL (${z.toFixed(2)})`;
}

export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  dailyCandles // required for daily EMA200 proximity
}) {
  // ====== WEEKLY TRUTH ======
  const closesT = candlesTruth.map(c => c.close);
  const volsT = candlesTruth.map(c => c.volume);

  const { base: ema50T, z: zT } = buildZscoreDeviation(closesT, 50, 208);
  const atr14T = atr(candlesTruth, 14);
  const adx14T = adx(candlesTruth, 14);
  const volZT = volumeZscore(volsT, 52);

  const pivotsT = findPivots(candlesTruth, 3, 3);

  // Daily EMA200 (laatste waarde)
  const dailyCloses = dailyCandles.map(c => c.close);
  const dailyEma200 = ema(dailyCloses, 200);
  const dailyEma200Now = lastNonNull(dailyEma200).v;

  const filteredZT = zT.map((zv, i) => {
    if (zv == null) return null;

    const { combined } = confidenceFactor({
      weeklyCandles: candlesTruth,
      weeklyClose: closesT,
      weeklyADX: adx14T,
      pivots: pivotsT,
      dailyEma200Now,
      atr14: atr14T,
      volZ: volZT,
      i
    });

    // We cappen extreme z zodat 1 slechte candle nooit absurd wordt
    const capped = clamp(zv, -3, 3);
    return capped * combined;
  });

  // Overlay op prijs: EMA50 + filteredZ * (ATR*mult)
  const mult = 1.8;
  const forestOverlayTruth = candlesTruth.map((c, i) => {
    const b = ema50T[i];
    const a = atr14T[i];
    const fz = filteredZT[i];
    if (b == null || a == null || fz == null) return null;
    return { time: c.time, value: b + (fz * a * mult) };
  }).filter(Boolean);

  // label op basis van laatste filteredZ (truth)
  const lastFZT = lastNonNull(filteredZT).v;
  const regimeLabel = labelFromZ(lastFZT);

  // ====== WEEKLY LIVE PREVIEW (OPTIONEEL) ======
  let forestOverlayLive = [];
  if (hasLive && candlesWithLive?.length) {
    const closesL = candlesWithLive.map(c => c.close);
    const volsL = candlesWithLive.map(c => c.volume);
    const { base: ema50L, z: zL } = buildZscoreDeviation(closesL, 50, 208);
    const atr14L = atr(candlesWithLive, 14);
    const adx14L = adx(candlesWithLive, 14);
    const volZL = volumeZscore(volsL, 52);
    const pivotsL = findPivots(candlesWithLive, 3, 3);

    const filteredZL = zL.map((zv, i) => {
      if (zv == null) return null;
      const { combined } = confidenceFactor({
        weeklyCandles: candlesWithLive,
        weeklyClose: closesL,
        weeklyADX: adx14L,
        pivots: pivotsL,
        dailyEma200Now,
        atr14: atr14L,
        volZ: volZL,
        i
      });
      const capped = clamp(zv, -3, 3);
      return capped * combined;
    });

    forestOverlayLive = candlesWithLive.map((c, i) => {
      const b = ema50L[i];
      const a = atr14L[i];
      const fz = filteredZL[i];
      if (b == null || a == null || fz == null) return null;
      return { time: c.time, value: b + (fz * a * mult) };
    }).filter(Boolean);
  }

  // ====== FORWARD “HINT” (nooit waarheid) ======
  // projecteer vanaf laatste TRUTH overlay (max 10 weken, demping)
  const forestOverlayForward = (() => {
    if (forestOverlayTruth.length < 6) return [];
    const last = forestOverlayTruth[forestOverlayTruth.length - 1];
    const prev = forestOverlayTruth[forestOverlayTruth.length - 2];
    const slope = last.value - prev.value;

    const lastAtr = lastNonNull(atr14T).v ?? 0;
    const maxSlope = lastAtr * 0.45; // begrensd
    const s = clamp(slope, -maxSlope, maxSlope);

    const hz = 10;
    const out = [];
    const weekSec = 7 * 24 * 60 * 60;

    // demp als we al “extreem” zijn: dan wil je geen doortrekken
    const damp = 1 - clamp(Math.abs(lastFZT ?? 0) / 3, 0, 1); // 0..1
    const ds = s * (0.35 + 0.65 * damp);

    for (let k = 1; k <= hz; k++) {
      out.push({
        time: last.time + k * weekSec,
        value: last.value + ds * k
      });
    }
    return out;
  })();

  return {
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,
    regimeLabel
  };
}