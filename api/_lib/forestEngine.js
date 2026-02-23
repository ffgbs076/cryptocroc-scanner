// api/_lib/forestEngine.js
import { ema, rollingRobustZ } from "./indicators.js";

/**
 * Forest v2:
 * - base: detrend = close - EMA(50)
 * - z-score: robust rolling median/MAD over 208 weeks (4 jaar)
 * - regime: hysteresis + 2-week confirm (lock)
 */
export function calculateForestV2(candles, opts = {}) {
  const {
    emaLen = 50,
    zWindow = 208, // ~4 jaar weekly
    // hysteresis thresholds
    enter = 0.45,  // bull/bear enter
    exit = 0.25,   // back-to-neutral
    confirmWeeks = 2
  } = opts;

  const closes = candles.map((c) => c.close);

  const emaArr = ema(closes, emaLen);
  const detrend = closes.map((c, i) => {
    const e = emaArr[i];
    if (c == null || e == null) return null;
    return c - e;
  });

  const z = rollingRobustZ(detrend, zWindow);

  // Regime lock with hysteresis + confirmWeeks
  // regimes: "bull" | "bear" | "neutral"
  const regime = new Array(candles.length).fill("neutral");

  let cur = "neutral";
  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;

  for (let i = 0; i < z.length; i++) {
    const zi = z[i];

    // if not enough data yet -> stay neutral
    if (zi == null || !Number.isFinite(zi)) {
      regime[i] = cur;
      continue;
    }

    // Determine what this week is "pushing towards"
    const wantsBull = zi >= enter;
    const wantsBear = zi <= -enter;
    const wantsNeutral = Math.abs(zi) <= exit;

    if (wantsBull) {
      bullCount++;
      bearCount = 0;
      neutralCount = 0;
    } else if (wantsBear) {
      bearCount++;
      bullCount = 0;
      neutralCount = 0;
    } else if (wantsNeutral) {
      neutralCount++;
      bullCount = 0;
      bearCount = 0;
    } else {
      // between exit and enter: do not count as switching signal
      bullCount = 0;
      bearCount = 0;
      neutralCount = 0;
    }

    // Apply confirm
    if (bullCount >= confirmWeeks && cur !== "bull") cur = "bull";
    if (bearCount >= confirmWeeks && cur !== "bear") cur = "bear";

    // Only return to neutral if we are clearly in neutral zone for confirmWeeks
    if (neutralCount >= confirmWeeks && cur !== "neutral") cur = "neutral";

    regime[i] = cur;
  }

  return {
    ema50: emaArr,
    forestZ: z,
    regime
  };
}