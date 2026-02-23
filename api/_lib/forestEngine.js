import { ema, std, atr, percentile, clamp } from "./indicators.js";

/**
 * Doel:
 * - forestZ = z-score van (close - ema50) t.o.v. rolling std (208w)
 * - regimes + freeze + hysterese (repaint-vrij omdat truth = gesloten weken)
 * - overlay op prijs: close + (forestZ * ATR * k) met clamp
 * - 4w forward: gedempt, ATR-begrensd
 */
export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  forwardWeeks = 4
}) {
  const truth = candlesTruth || [];
  const live = candlesWithLive || [];
  if (truth.length < 120) {
    return {
      forestOverlayTruth: [],
      forestOverlayLive: [],
      forestOverlayForward: [],
      forestZTruth: [],
      forestZLive: [],
      bandsNow: null,
      freezeNow: false,
      regimeLabel: "Forest: not enough data"
    };
  }

  // ---------- TRUTH CALC ----------
  const closesT = truth.map((c) => c.close);
  const ema50T = ema(closesT, 50);
  const devT = closesT.map((v, i) => (ema50T[i] == null ? null : v - ema50T[i]));

  const winZ = 208; // ~4 jaar weekly
  const devStdT = std(devT, winZ);
  const zT = devT.map((d, i) => {
    const s = devStdT[i];
    if (d == null || s == null || s === 0) return null;
    return d / s;
  });

  const atr14T = atr(truth, 14);

  // Adaptieve drempels op basis van z verdeling (rolling 4y)
  const p20T = percentile(zT, winZ, 0.20);
  const p35T = percentile(zT, winZ, 0.35);
  const p65T = percentile(zT, winZ, 0.65);
  const p80T = percentile(zT, winZ, 0.80);

  // Freeze op ATR compressie: ATR onder P20 (rolling 4y)
  const atrP20T = percentile(atr14T, winZ, 0.20);

  // Fractals (pivot) - repaint-vrij: pivot pas bevestigd na right weken
  const piv = findConfirmedPivots(truth, 3, 3);

  // Regime met hysterese + freeze
  const regimeArr = buildRegimeSeries({
    candles: truth,
    z: zT,
    p20: p20T,
    p35: p35T,
    p65: p65T,
    p80: p80T,
    atr14: atr14T,
    atrP20: atrP20T,
    pivots: piv
  });

  const lastIdx = truth.length - 1;
  const zNow = zT[lastIdx];
  const bandsNow = {
    p20: p20T[lastIdx],
    p35: p35T[lastIdx],
    p65: p65T[lastIdx],
    p80: p80T[lastIdx]
  };
  const freezeNow = atr14T[lastIdx] != null && atrP20T[lastIdx] != null
    ? atr14T[lastIdx] < atrP20T[lastIdx]
    : false;

  const regimeNow = regimeArr[lastIdx] || "NEUTRAL";

  const label = makeLabel(regimeNow, zNow);

  // Overlay prijs-lijn (truth)
  const k = 0.85;                // schaal: z * ATR * k
  const zCap = 2.5;              // clamp z voor overlay stabiliteit

  const forestOverlayTruth = truth.map((c, i) => {
    const z = zT[i];
    const a = atr14T[i];
    if (z == null || a == null) return null;
    const zz = clamp(z, -zCap, zCap);
    const val = c.close + (zz * a * k);
    return { time: c.time, value: val };
  }).filter(Boolean);

  // ---------- LIVE OVERLAY (optioneel / hint) ----------
  // Live gebruikt candlesWithLive, maar truth blijft de “harde” lijn.
  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && live.length === truth.length + 1) {
    const closesL = live.map((c) => c.close);
    const ema50L = ema(closesL, 50);
    const devL = closesL.map((v, i) => (ema50L[i] == null ? null : v - ema50L[i]));
    const devStdL = std(devL, winZ);
    const zL = devL.map((d, i) => {
      const s = devStdL[i];
      if (d == null || s == null || s === 0) return null;
      return d / s;
    });
    const atr14L = atr(live, 14);

    forestOverlayLive = live.map((c, i) => {
      const z = zL[i];
      const a = atr14L[i];
      if (z == null || a == null) return null;
      const zz = clamp(z, -zCap, zCap);
      const val = c.close + (zz * a * k);
      return { time: c.time, value: val };
    }).filter(Boolean);

    forestZLive = zL.map((z, i) => (z == null ? null : { time: live[i].time, value: z })).filter(Boolean);
  }

  const forestZTruth = zT.map((z, i) => (z == null ? null : { time: truth[i].time, value: z })).filter(Boolean);

  // ---------- FORWARD (4 weken) ----------
  const forestOverlayForward = computeForwardOverlay({
    lastTime: truth[lastIdx].time,
    lastOverlay: forestOverlayTruth[forestOverlayTruth.length - 1]?.value,
    zSeries: zT,
    atrSeries: atr14T,
    forwardWeeks,
    k,
    zCap
  });

  return {
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,
    forestZTruth,
    forestZLive,
    bandsNow,
    freezeNow,
    regimeLabel: label
  };
}

/* ---------------- helpers ---------------- */

function computeForwardOverlay({ lastTime, lastOverlay, zSeries, atrSeries, forwardWeeks, k, zCap }) {
  const out = [];
  const n = zSeries.length;
  if (n < 3) return out;

  const z1 = zSeries[n - 1];
  const z2 = zSeries[n - 2];
  const a1 = atrSeries[n - 1];

  if (z1 == null || z2 == null || a1 == null || lastOverlay == null) return out;

  // slope per week op z
  const slope = z1 - z2;

  // demping: hoe extremer z, hoe minder “doortrekken”
  const dampBase = 0.65;
  const dampZ = 1 - Math.min(Math.abs(z1) / 3, 1); // bij |z|>=3 -> 0
  const slopeAdj = slope * dampZ;

  // max delta per week op overlay in prijs-termen (ATR rem)
  const maxStep = a1 * 0.60; // max 0.6 ATR per week

  let prev = lastOverlay;
  let totalMove = 0;
  const maxTotal = a1 * k * zCap; // totale clamp (zelfde schaal als overlay cap)

  for (let i = 1; i <= forwardWeeks; i++) {
    const damp = Math.pow(dampBase, i - 1);
    let step = slopeAdj * a1 * k * damp;
    step = clamp(step, -maxStep, maxStep);

    totalMove += step;
    totalMove = clamp(totalMove, -maxTotal, maxTotal);

    const next = lastOverlay + totalMove;
    const t = lastTime + i * 7 * 24 * 60 * 60;

    out.push({ time: t, value: next });
    prev = next;
  }

  return out;
}

function findConfirmedPivots(candles, left = 3, right = 3) {
  const pivots = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) pivots.push({ idx: i, time: c.time, type: "high", price: c.high });
    if (isLow) pivots.push({ idx: i, time: c.time, type: "low", price: c.low });
  }
  return pivots;
}

function buildRegimeSeries({ candles, z, p20, p35, p65, p80, atr14, atrP20, pivots }) {
  const n = candles.length;
  const regime = new Array(n).fill("NEUTRAL");

  // laatst bevestigde pivots (tot en met i)
  let lastHigh = null;
  let lastLow = null;

  // “pending switch”
  let pending = null; // { to: 'BULL'|'BEAR', need: 2|1, got:0 }

  const pivotByIdx = new Map();
  for (const p of pivots) pivotByIdx.set(p.idx, p);

  for (let i = 0; i < n; i++) {
    // pivots updaten
    const pv = pivotByIdx.get(i);
    if (pv?.type === "high") lastHigh = pv;
    if (pv?.type === "low") lastLow = pv;

    const zi = z[i];
    const close = candles[i].close;

    const freeze =
      atr14[i] != null && atrP20[i] != null ? atr14[i] < atrP20[i] : false;

    const cur = i === 0 ? "NEUTRAL" : regime[i - 1];

    // als freeze: geen switches, regime blijft
    if (freeze || zi == null || p35[i] == null || p65[i] == null || p20[i] == null || p80[i] == null) {
      regime[i] = cur;
      pending = null;
      continue;
    }

    // thresholds
    const thBear = p35[i];
    const thBull = p65[i];
    const thBearX = p20[i];
    const thBullX = p80[i];

    // structuurfilter: bull alleen als boven lastHigh, bear alleen als onder lastLow
    const structureBullOk = lastHigh ? close > lastHigh.price : true;
    const structureBearOk = lastLow ? close < lastLow.price : true;

    // signaal kandidaat
    let want = null;
    let need = 2;

    // EXTREME = sneller (1 week bevestiging)
    if (zi <= thBearX && structureBearOk) {
      want = "BEAR";
      need = 1;
    } else if (zi >= thBullX && structureBullOk) {
      want = "BULL";
      need = 1;
    } else if (zi <= thBear && structureBearOk) {
      want = "BEAR";
      need = 2;
    } else if (zi >= thBull && structureBullOk) {
      want = "BULL";
      need = 2;
    } else {
      want = null;
    }

    // geen kandidaat: reset pending, behoud regime
    if (!want) {
      pending = null;
      regime[i] = cur;
      continue;
    }

    // kandidaat = zelfde als current -> clear pending
    if (want === cur) {
      pending = null;
      regime[i] = cur;
      continue;
    }

    // pending opbouwen
    if (!pending || pending.to !== want) {
      pending = { to: want, need, got: 1 };
      regime[i] = cur;
      continue;
    } else {
      pending.got += 1;
      if (pending.got >= pending.need) {
        regime[i] = pending.to;
        pending = null;
      } else {
        regime[i] = cur;
      }
    }
  }

  return regime;
}

function makeLabel(regime, zNow) {
  const z = zNow == null ? null : Number(zNow.toFixed(2));
  if (regime === "BULL") {
    if (z != null && z >= 1.5) return `STRONG BULL (${z})`;
    return `BULL (${z ?? "…"})`;
  }
  if (regime === "BEAR") {
    if (z != null && z <= -1.5) return `STRONG BEAR (${z})`;
    return `BEAR (${z ?? "…"})`;
  }
  return `NEUTRAL (${z ?? "…"})`;
}