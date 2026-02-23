import { ema, stdev } from "./indicators.js";

/**
 * Forest = z-score van (close - EMA50) over lookback,
 * daarna smoothing via EMA(6).
 *
 * Input bepaalt repaint:
 * - geef je alleen gesloten candles => non repaint
 * - geef je ook current week => preview mag bewegen
 */
export function calculateForest(candles) {
  const closes = candles.map(c => c.close);

  const ema50 = ema(closes, 50);
  const diff = closes.map((c, i) => (ema50[i] == null ? null : (c - ema50[i])));

  const lookback = 156; // ~3 jaar weekly
  const dev = stdev(diff.map(x => x ?? 0), lookback);

  const raw = diff.map((d, i) => {
    if (ema50[i] == null || dev[i] == null || dev[i] === 0) return null;
    return d / dev[i];
  });

  // smoothing EMA(6) op raw (zonder toekomst)
  const rawNoNull = raw.map(v => (v == null ? null : v));
  const smooth = new Array(raw.length).fill(null);

  const k = 2 / (6 + 1);
  let prev = null;
  for (let i = 0; i < rawNoNull.length; i++){
    const v = rawNoNull[i];
    if (v == null) continue;
    if (prev == null) { prev = v; smooth[i] = v; }
    else { prev = v*k + prev*(1-k); smooth[i] = prev; }
  }

  return smooth;
}