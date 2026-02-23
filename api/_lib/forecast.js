import { clamp } from "./indicators.js";

/**
 * Forecast vooruit op prijs-overlay:
 * - slope van laatste 2 punten (in projected-space)
 * - dempen bij extreme |z|
 * - max 10 candles vooruit
 */
export function makeForecastProjected(candles, forestZ, atr14, mult) {
  const n = candles.length;
  if (n < 3) return [];

  const i2 = n - 1;
  const i1 = n - 2;

  const z2 = forestZ[i2], z1 = forestZ[i1];
  const a2 = atr14[i2], a1 = atr14[i1];
  if (z2 == null || z1 == null || a2 == null || a1 == null) return [];

  const base2 = candles[i2].close + clamp(z2, -2.5, 2.5) * a2 * mult;
  const base1 = candles[i1].close + clamp(z1, -2.5, 2.5) * a1 * mult;

  let slope = base2 - base1;

  // demping: hoe extremer z, hoe minder “doortrekken”
  const damp = 1 - clamp(Math.abs(z2) / 3, 0, 1);
  slope *= damp;

  // slope max op ATR basis (geen gekke sprongen)
  const maxSlope = a2 * 0.5;
  slope = clamp(slope, -maxSlope, maxSlope);

  const horizon = 10;
  const stepSec = candles[i2].time - candles[i1].time || (7*24*3600);

  const out = [];
  for (let k = 1; k <= horizon; k++){
    out.push({
      time: candles[i2].time + stepSec * k,
      value: base2 + slope * k
    });
  }

  // begin punt erbij zodat lijn netjes aansluit
  return [{ time: candles[i2].time, value: base2 }, ...out];
}