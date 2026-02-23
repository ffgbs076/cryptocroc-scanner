// api/_lib/structure.js

// Pivot highs/lows (simple, maar stabiel)
export function findPivots(candles, left = 3, right = 3) {
  const pivots = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) pivots.push({ time: c.time, type: "high", price: c.high });
    if (isLow) pivots.push({ time: c.time, type: "low", price: c.low });
  }
  return pivots;
}

// "Hoe dicht zit ik bij belangrijke weekly support/resistance?"
export function structurePenalty(currentPrice, pivots, pctBand = 0.012, lookback = 104) {
  const recent = pivots.slice(-lookback);
  if (!recent.length) return 0;

  // we zoeken: zit je dicht bij meerdere pivots (cluster)? -> penalty omhoog
  let clusterScore = 0;

  for (const p of recent) {
    const distPct = Math.abs(currentPrice - p.price) / currentPrice;
    if (distPct <= pctBand) {
      // tel hoeveel pivots in dezelfde zone zitten
      const same = recent.filter(q => (Math.abs(q.price - p.price) / currentPrice) <= pctBand).length;
      clusterScore = Math.max(clusterScore, Math.min(5, same)); // cap
    }
  }

  // normaliseer 0..1
  return Math.min(clusterScore / 5, 1);
}