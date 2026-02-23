import { ema, stdev, atr, clamp } from "./indicators.js";

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive }){
  // ====== SETTINGS (jij kunt later tunen) ======
  const EMA_BASE = 50;          // weekly ~ 1 jaar
  const Z_LOOKBACK = 156;       // ~3 jaar weekly
  const SMOOTH = 6;             // smoothing op z
  const ATR_LEN = 14;           // weekly ATR
  const Z_CAP = 2.5;            // clamp tegen idiote uitschieters
  const MULT = 0.55;            // hoe “hard” hij op prijs ligt (lager = rustiger)
  const FWD_WEEKS = 8;          // vooruit tekenen max
  const FWD_SLOPE_CAP_ATR = 0.25; // max slope per week in ATR units (veilig)
  // ============================================

  function calc(candles){
    const closes = candles.map(c => c.close);
    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);

    const base = ema(closes, EMA_BASE);
    const diff = closes.map((c,i) => (c == null || base[i] == null) ? null : (c - base[i]));
    const dev  = stdev(diff, Z_LOOKBACK);

    const zRaw = diff.map((d,i) => (d == null || dev[i] == null || dev[i] === 0) ? null : (d / dev[i]));
    const zSm  = ema(zRaw, SMOOTH);

    const a = atr(highs, lows, closes, ATR_LEN);

    // overlay on price
    const overlay = candles.map((c,i) => {
      if (zSm[i] == null || a[i] == null) return null;
      const zz = clamp(zSm[i], -Z_CAP, Z_CAP);
      const val = c.close + (zz * a[i] * MULT);
      return { time: c.time, value: val };
    }).filter(Boolean);

    return { zSm, atrArr: a, overlay };
  }

  // Truth (alleen gesloten weken)
  const truth = calc(candlesTruth);

  // Live (truth + huidige week)
  const live = hasLive ? calc(candlesWithLive) : null;

  // ====== Forward line (op basis van LAST TRUTH) ======
  const fwd = [];
  if (truth.overlay.length >= 10){
    const lastIdx = candlesTruth.length - 1;

    // Pak laatste 4 z-punten om slope te schatten (rustig)
    const zs = truth.zSm;
    const a  = truth.atrArr;
    const cLast = candlesTruth[lastIdx];
    const zLast = zs[lastIdx];
    const atrLast = a[lastIdx];

    if (zLast != null && atrLast != null){
      // slope = (zLast - zPrev) / N
      let zPrev = null;
      for (let k = lastIdx - 1; k >= 0; k--){
        if (zs[k] != null) { zPrev = zs[k]; break; }
      }
      const rawSlope = (zPrev == null) ? 0 : (zLast - zPrev);

      // demping: hoe extremer z, hoe minder doortrekken
      const damp = 1 - Math.min(Math.abs(zLast) / 3, 1); // 0..1
      let slope = rawSlope * damp;

      // extra cap: slope mag niet “te hard”
      const maxSlope = (atrLast * FWD_SLOPE_CAP_ATR) / (atrLast * MULT); 
      // (delen door atr*mult zodat slope in z-units capped wordt)
      slope = clamp(slope, -Math.abs(maxSlope), Math.abs(maxSlope));

      // startpoint = laatste truth overlay value
      const lastOverlayPoint = truth.overlay[truth.overlay.length - 1];
      if (lastOverlayPoint){
        let zNow = zLast;
        let tNow = cLast.time;
        fwd.push({ time: tNow, value: lastOverlayPoint.value });

        for (let i = 1; i <= FWD_WEEKS; i++){
          tNow = tNow + 7*24*60*60;

          // z vooruit (maar capped)
          zNow = clamp(zNow + slope, -Z_CAP, Z_CAP);

          // projectie op prijs: we nemen als “basis” de laatste close (simpel, eerlijk)
          const v = cLast.close + (zNow * atrLast * MULT);
          fwd.push({ time: tNow, value: v });
        }
      }
    }
  }

  // ====== Regime label (simpel) ======
  let regimeLabel = "Forest: Neutral";
  const lastTruthZ = truth.zSm[candlesTruth.length - 1];
  if (lastTruthZ != null){
    if (lastTruthZ > 0.35) regimeLabel = `Forest: Bullish (${lastTruthZ.toFixed(2)})`;
    else if (lastTruthZ < -0.35) regimeLabel = `Forest: Bearish (${lastTruthZ.toFixed(2)})`;
    else regimeLabel = `Forest: Neutral (${lastTruthZ.toFixed(2)})`;
  }

  return {
    forestOverlayTruth: truth.overlay,
    forestOverlayLive: live ? live.overlay : [],
    forestOverlayForward: fwd,
    regimeLabel
  };
}