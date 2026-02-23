// api/_lib/forestEngine.js
// Behoudt:
// - percentiel drempels (adaptief)
// - regime lock / hysterese (normaal 2 weken, extreme 1 week)
// - ATR freeze (geen switches bij compressie)
// - fractal structuurfilter (confirmed pivots)
// - forestZTruth/forestZLive + overlay truth/live
// Voegt toe:
// - forestOverlayForward: 4 weken vooruit (gestreept), "what-if" hint

import { ema, atr, stdev, percentile, clamp } from "./indicators.js";

const WEEK = 7 * 24 * 60 * 60;

function pt(time, value) {
  return { time, value };
}

/**
 * Hoofdfunctie die jouw API gebruikt.
 * Output keys die je frontend verwacht:
 * forestOverlayTruth, forestOverlayLive, forestOverlayForward,
 * forestZTruth, forestZLive,
 * bandsNow, freezeNow, regimeLabel
 */
export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive }) {
  const CFG = {
    emaLen: 50,
    zWin: 208,         // ~4 jaar weekly
    atrLen: 14,

    // Percentielen voor regimes
    pBear: 0.35,       // P35
    pBull: 0.65,       // P65
    pBearX: 0.20,      // P20 (extreme)
    pBullX: 0.80,      // P80 (extreme)

    // ATR freeze: onder P20 => geen switches
    atrFreezeP: 0.20,

    // Hysterese confirm
    confirmNormal: 2,
    confirmExtreme: 1,

    // Structuur fractals
    pivotLeft: 3,
    pivotRight: 3,

    // Overlay vertaling
    zClamp: 2.5,
    overlayMult: 0.55,

    // Forward
    fwdWeeks: 4,
    slopeW: 3,
    maxSlopeAtr: 0.35 // per week max 0.35 ATR in overlay-ruimte
  };

  const truth = computeAll(candlesTruth, CFG);

  let live = null;
  if (hasLive) live = computeAll(candlesWithLive, CFG);

  // Forward alleen op basis van TRUTH (no repaint)
  const forestOverlayForward = computeForwardFromTruth(candlesTruth, truth, CFG);

  return {
    forestOverlayTruth: truth.forestOverlay,
    forestOverlayLive: hasLive ? live.forestOverlay : [],
    forestOverlayForward,

    forestZTruth: truth.forestZSeries,
    forestZLive: hasLive ? live.forestZSeries : [],

    bandsNow: truth.bandsNow,
    freezeNow: truth.freezeNow,
    regimeLabel: truth.regimeLabel
  };
}

function computeAll(candles, cfg) {
  const closes = candles.map(c => c.close);

  const emaArr = ema(closes, cfg.emaLen);
  const atrArr = atr(candles, cfg.atrLen);

  // diff = close - ema
  const diff = closes.map((c, i) => (emaArr[i] == null ? null : (c - emaArr[i])));

  // forestZ per index (z-score van diff over rolling window)
  const forestZ = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (i < Math.max(cfg.emaLen, cfg.zWin)) continue;

    const window = diff.slice(i - cfg.zWin + 1, i + 1).filter(v => v != null);
    if (window.length < cfg.zWin * 0.9) continue;

    const sd = stdev(window);
    if (!sd || sd === 0) continue;

    forestZ[i] = diff[i] / sd;
  }

  // bandsNow: drempels op basis van laatste cfg.zWin z-values (alleen verleden)
  const bandsNow = computeBandsNow(forestZ, candles.length - 1, cfg);

  // ATR freeze nu
  const freezeNow = computeFreezeNow(atrArr, candles.length - 1, cfg);

  // confirmed pivots (fractal) en laatste confirmed high/low
  const pivots = findConfirmedPivots(candles, cfg.pivotLeft, cfg.pivotRight);
  const lastPivot = lastConfirmedPivotBeforeIndex(pivots, candles.length - 1);

  // regime state reeks + label nu
  const regime = computeRegimeSeries({
    candles,
    forestZ,
    atrArr,
    pivots,
    cfg
  });

  const regimeNow = regime[regime.length - 1] || "neutral";
  const zNow = lastNonNullValue(forestZ);
  const label = labelFromRegime(regimeNow, zNow, freezeNow, bandsNow, lastPivot);

  // forestZ series voor chart (oscillator paneel)
  const forestZSeries = candles
    .map((c, i) => (forestZ[i] == null ? null : pt(c.time, forestZ[i])))
    .filter(Boolean);

  // forest overlay op prijs-chart (EMA + z*ATR*mult, geclamped)
  const forestOverlay = [];
  for (let i = 0; i < candles.length; i++) {
    if (emaArr[i] == null || atrArr[i] == null || forestZ[i] == null) continue;
    const zc = clamp(forestZ[i], -cfg.zClamp, cfg.zClamp);
    const v = emaArr[i] + (zc * atrArr[i] * cfg.overlayMult);
    forestOverlay.push(pt(candles[i].time, v));
  }

  return {
    forestZ,
    forestZSeries,
    forestOverlay,
    emaArr,
    atrArr,
    bandsNow,
    freezeNow,
    pivots,
    regimeLabel: label,
    regimeSeries: regime
  };
}

function computeBandsNow(forestZ, idx, cfg) {
  // Neem alleen Z tot idx (no future)
  const start = Math.max(0, idx - cfg.zWin + 1);
  const window = forestZ.slice(start, idx + 1).filter(v => v != null);
  if (window.length < Math.max(40, cfg.zWin * 0.5)) {
    // fallback: vaste veilige defaults
    return {
      bear: -0.35,
      bull: 0.35,
      bearX: -1.5,
      bullX: 1.5
    };
  }

  const p35 = percentile(window, cfg.pBear);
  const p65 = percentile(window, cfg.pBull);
  const p20 = percentile(window, cfg.pBearX);
  const p80 = percentile(window, cfg.pBullX);

  // bandjes moeten rond 0 liggen; we forceren symmetrie niet, maar labelen wel netjes
  return {
    bear: p35,
    bull: p65,
    bearX: p20,
    bullX: p80
  };
}

function computeFreezeNow(atrArr, idx, cfg) {
  const start = Math.max(0, idx - cfg.zWin + 1);
  const window = atrArr.slice(start, idx + 1).filter(v => v != null);
  if (window.length < 40) return false;

  const pFreeze = percentile(window, cfg.atrFreezeP);
  const now = atrArr[idx];
  if (now == null || pFreeze == null) return false;
  return now < pFreeze;
}

function computeRegimeSeries({ candles, forestZ, atrArr, pivots, cfg }) {
  const regimes = new Array(candles.length).fill(null);

  // regime state
  let state = "neutral";

  // confirm counters
  let bullConf = 0;
  let bearConf = 0;

  for (let i = 0; i < candles.length; i++) {
    const z = forestZ[i];
    const bands = computeBandsNow(forestZ, i, cfg);
    const freeze = computeFreezeNow(atrArr, i, cfg);

    // structuur: laatste confirmed pivot vóór i
    const lp = lastConfirmedPivotBeforeIndex(pivots, i);

    // Als geen z => state blijft wat het was
    if (z == null) {
      regimes[i] = state;
      continue;
    }

    // thresholds
    const bearTh = bands.bear;
    const bullTh = bands.bull;
    const bearX = bands.bearX;
    const bullX = bands.bullX;

    const isBear = z < bearTh;
    const isBull = z > bullTh;
    const isBearExtreme = z < bearX;
    const isBullExtreme = z > bullX;

    // structuurfilter: bull switch alleen als close boven laatste confirmed pivot high (als die bestaat)
    // bear switch alleen als close onder laatste confirmed pivot low
    const close = candles[i].close;

    const structOkBull = lp?.high == null ? true : close > lp.high;
    const structOkBear = lp?.low == null ? true : close < lp.low;

    // freeze blokkeert alleen SWITCHES, niet het aanhouden van state
    const allowSwitch = !freeze;

    // confirm logic met 2 snelheden
    const needBull = isBullExtreme ? cfg.confirmExtreme : cfg.confirmNormal;
    const needBear = isBearExtreme ? cfg.confirmExtreme : cfg.confirmNormal;

    if (isBull && structOkBull) bullConf++; else bullConf = 0;
    if (isBear && structOkBear) bearConf++; else bearConf = 0;

    if (allowSwitch) {
      if (bullConf >= needBull) {
        state = "bull";
        bearConf = 0;
      } else if (bearConf >= needBear) {
        state = "bear";
        bullConf = 0;
      } else {
        // Geen switch: als middenzone, kan neutral worden, maar alleen als we NIET net in bull/bear zitten
        // (conservatief: we laten state staan tenzij duidelijke switch)
        // Wil je harder neutraliseren? Dan kan, maar dat verlaagt betrouwbaarheid.
      }
    }

    // Als je in bull zit maar z volledig neutraal wordt lang, kun je terug naar neutral.
    // Hier: heel conservatief: pas neutraliseren als z tussen thresholds en 4 weken geen bull/bear confirm.
    if (state !== "neutral") {
      const inMid = z >= bearTh && z <= bullTh;
      if (inMid && bullConf === 0 && bearConf === 0) {
        // optioneel: na 4 weken mid -> neutral (betrouwbaarder voor blind volgen)
        // We doen dit heel mild: pas na 4 opeenvolgende mid-weken.
        const mid4 = checkMidRun(forestZ, i, bands, 4);
        if (mid4) state = "neutral";
      }
    }

    regimes[i] = state;
  }

  return regimes;
}

function checkMidRun(forestZ, idx, bands, n) {
  if (idx < n - 1) return false;
  for (let k = idx - (n - 1); k <= idx; k++) {
    const z = forestZ[k];
    if (z == null) return false;
    if (!(z >= bands.bear && z <= bands.bull)) return false;
  }
  return true;
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
      if (!isHigh && !isLow) break;
    }

    if (isHigh) pivots.push({ idx: i, time: c.time, type: "high", price: c.high });
    if (isLow) pivots.push({ idx: i, time: c.time, type: "low", price: c.low });
  }

  // Alleen pivots die “confirmed” zijn (door right bars) zitten er al in (want i < len-right).
  return pivots;
}

function lastConfirmedPivotBeforeIndex(pivots, idx) {
  // We willen laatste confirmed high en low afzonderlijk
  let lastHigh = null;
  let lastLow = null;

  for (const p of pivots) {
    if (p.idx > idx) break;
    if (p.type === "high") lastHigh = p.price;
    if (p.type === "low") lastLow = p.price;
  }

  if (lastHigh == null && lastLow == null) return null;
  return { high: lastHigh, low: lastLow };
}

function lastNonNullValue(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

function labelFromRegime(regime, zNow, freezeNow, bandsNow, lastPivot) {
  const z = zNow;
  let strength = "";
  if (z != null && bandsNow) {
    if (z >= bandsNow.bullX) strength = "EXTREME ";
    else if (z >= bandsNow.bull) strength = "BULL ";
    else if (z <= bandsNow.bearX) strength = "EXTREME ";
    else if (z <= bandsNow.bear) strength = "BEAR ";
    else strength = "NEUTRAL ";
  }

  const base =
    regime === "bull" ? "BULL" :
    regime === "bear" ? "BEAR" :
    "NEUTRAL";

  const frz = freezeNow ? " • FREEZE(ATR low)" : "";
  const piv =
    lastPivot
      ? ` • pivots: H=${lastPivot.high ?? "-"} L=${lastPivot.low ?? "-"}`
      : "";

  const ztxt = (z == null) ? "" : ` • z=${z.toFixed(2)}`;

  return `Forest: ${strength}${base}${ztxt}${frz}${piv}`;
}

/**
 * Forward 4 weken (gestreept):
 * - alleen op TRUTH laatste week
 * - slope dempen bij extreme z
 * - max stap per week op basis van ATR (rem)
 * - nooit bedoeld als “waarheid”, alleen kijklijn
 */
function computeForwardFromTruth(candlesTruth, truth, cfg) {
  const i = lastValidIndex(truth);
  if (i < 0) return [];

  const baseTime = candlesTruth[i].time;
  const baseEma = truth.emaArr[i];
  const baseAtr = truth.atrArr[i];
  const zNow = truth.forestZ[i];

  if (baseEma == null || baseAtr == null || zNow == null) return [];

  // z-slope over slopeW
  const j = Math.max(0, i - cfg.slopeW);
  const zPrev = truth.forestZ[j] ?? truth.forestZ[i - 1] ?? zNow;
  const rawSlope = (zNow - zPrev) / Math.max(1, i - j);

  // demping: |z|=0 => 1.0, |z|>=3 => 0
  const damp = 1 - clamp(Math.abs(zNow) / 3, 0, 1);
  const slope = rawSlope * damp;

  // overlay startwaarde (zelfde als overlay)
  const zc = clamp(zNow, -cfg.zClamp, cfg.zClamp);
  const start = baseEma + (zc * baseAtr * cfg.overlayMult);

  // voorgestelde stap in prijsruimte
  const proposedStep = slope * baseAtr * cfg.overlayMult;

  // max stap (ATR rem)
  const maxStep = baseAtr * cfg.maxSlopeAtr;
  const step = clamp(proposedStep, -maxStep, maxStep);

  const out = [];
  let v = start;
  for (let k = 1; k <= cfg.fwdWeeks; k++) {
    v += step;
    out.push(pt(baseTime + WEEK * k, v));
  }
  return out;
}

function lastValidIndex(truth) {
  for (let i = truth.forestZ.length - 1; i >= 0; i--) {
    if (truth.forestZ[i] != null && truth.emaArr[i] != null && truth.atrArr[i] != null) return i;
  }
  return -1;
}