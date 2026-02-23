import { ema, std, atr, percentileFromWindow, clamp } from "./indicators.js";

export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  forwardWeeks = 4,
}) {
  // ====== instellingen (bewust simpel & stabiel) ======
  const EMA_LEN = 50;       // weekly ~ 1 jaar
  const Z_WIN = 208;        // ~ 4 jaar
  const ATR_LEN = 14;
  const Z_CLAMP = 2.5;      // overlay begrenzen
  const OVERLAY_MULT = 0.9; // hoeveel ATR we meenemen

  // Percentiel drempels (adaptief, geen nattevinger 0.35)
  const P_BULL = 0.65;
  const P_BEAR = 0.35;
  const P_EXT_BULL = 0.80;
  const P_EXT_BEAR = 0.20;
  const P_ATR_FREEZE = 0.20;

  // Hysterese: normaal 2 weken bevestigen, bij extreme 1 week
  const CONFIRM_NORMAL = 2;
  const CONFIRM_EXTREME = 1;

  function computeAll(candles) {
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows  = candles.map((c) => c.low);

    const ema50 = ema(closes, EMA_LEN);
    const dev = closes.map((c, i) => (ema50[i] == null ? null : c - ema50[i]));
    const sd = std(dev, Z_WIN);
    const atr14 = atr(highs, lows, closes, ATR_LEN);

    const z = dev.map((d, i) => {
      const s = sd[i];
      if (d == null || s == null || s === 0) return null;
      return d / s;
    });

    return { closes, ema50, atr14, z };
  }

  const truth = computeAll(candlesTruth);
  const live = computeAll(candlesWithLive);

  // ====== regime bepalen (alleen TRUTH leidend) ======
  let regime = "NEUTRAL"; // BULL / BEAR / NEUTRAL
  let pending = null;     // { target: "BULL"|"BEAR", need: number, seen: number }

  // we bouwen label op laatste truth candle
  const lastTruthIndex = candlesTruth.length - 1;

  for (let i = 0; i < candlesTruth.length; i++) {
    const zNow = truth.z[i];
    const atrNow = truth.atr14[i];

    // drempels op basis van verleden t/m i
    const pBull = percentileFromWindow(truth.z, i, Z_WIN, P_BULL);
    const pBear = percentileFromWindow(truth.z, i, Z_WIN, P_BEAR);
    const pExtBull = percentileFromWindow(truth.z, i, Z_WIN, P_EXT_BULL);
    const pExtBear = percentileFromWindow(truth.z, i, Z_WIN, P_EXT_BEAR);

    const atrP20 = percentileFromWindow(truth.atr14, i, Z_WIN, P_ATR_FREEZE);
    const freeze = atrNow != null && atrP20 != null && atrNow < atrP20;

    if (zNow == null || pBull == null || pBear == null) continue;

    // als freeze: geen switches starten/afronden
    if (freeze) {
      pending = null;
      continue;
    }

    // extreme? -> sneller confirm
    let need = CONFIRM_NORMAL;
    if (pExtBull != null && zNow > pExtBull) need = CONFIRM_EXTREME;
    if (pExtBear != null && zNow < pExtBear) need = CONFIRM_EXTREME;

    const wantBull = zNow > pBull;
    const wantBear = zNow < pBear;

    const target =
      wantBull ? "BULL" :
      wantBear ? "BEAR" :
      null;

    if (!target) {
      pending = null;
      // NEUTRAL laten we zo: pas als hij echt bull/bear bevestigd is switchen we.
      continue;
    }

    if (pending && pending.target === target) {
      pending.seen++;
    } else {
      pending = { target, need, seen: 1 };
    }

    if (pending.seen >= pending.need) {
      regime = pending.target;
      pending = null;
    }
  }

  // ====== overlay prijs-lijn maken ======
  function makeOverlay(candles, calc) {
    const out = [];
    for (let i = 0; i < candles.length; i++) {
      const t = candles[i].time;
      const emaBase = calc.ema50[i];
      const zNow = calc.z[i];
      const atrNow = calc.atr14[i];
      if (emaBase == null || zNow == null || atrNow == null) continue;

      const zC = clamp(zNow, -Z_CLAMP, Z_CLAMP);
      const value = emaBase + zC * atrNow * OVERLAY_MULT;
      out.push({ time: t, value });
    }
    return out;
  }

  const forestOverlayTruth = makeOverlay(candlesTruth, truth);
  const forestOverlayAll   = makeOverlay(candlesWithLive, live);

  // Live overlay: alleen tonen als er live candle is
  const forestOverlayLive = hasLive ? forestOverlayAll : [];

  // ====== Forward (4 weken) op basis van TRUTH ======
  const forestOverlayForward = [];
  if (forestOverlayTruth.length >= 2 && forwardWeeks > 0) {
    const WEEK = 7 * 24 * 60 * 60;

    const last = forestOverlayTruth[forestOverlayTruth.length - 1];
    const prev = forestOverlayTruth[forestOverlayTruth.length - 2];

    const slopeRaw = last.value - prev.value;

    // remmen: max 0.5 * ATR per week, en dempen bij extreme z
    const zLast = truth.z[lastTruthIndex] ?? 0;
    const atrLast = truth.atr14[lastTruthIndex] ?? 0;

    const maxSlope = atrLast * 0.5;
    const slopeCapped = clamp(slopeRaw, -maxSlope, maxSlope);

    const damping = 1 - Math.min(Math.abs(zLast) / 3, 1); // |z|=3 -> 0
    const slope = slopeCapped * damping;

    let t = last.time;
    let v = last.value;

    for (let k = 1; k <= forwardWeeks; k++) {
      t = t + WEEK;
      v = v + slope;
      forestOverlayForward.push({ time: t, value: v });
    }
  }

  // label
  const zNow = truth.z[lastTruthIndex];
  const zText = zNow == null ? "n/a" : zNow.toFixed(2);

  let regimeLabel = "NEUTRAL";
  if (regime === "BULL") regimeLabel = `BULL (${zText})`;
  if (regime === "BEAR") regimeLabel = `BEAR (${zText})`;

  // “strong” label puur op z (niet op live)
  if (zNow != null && zNow <= -1.5) regimeLabel = `STRONG BEAR (${zText})`;
  if (zNow != null && zNow >=  1.5) regimeLabel = `STRONG BULL (${zText})`;

  return {
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,
    regimeLabel,
    forestZNow: zNow,
  };
}