// api/_lib/structure.js

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

export function findConfirmedPivots(candles, left = 3, right = 3) {
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

    if (isHigh) pivots.push({ index: i, time: c.time, type: "high", price: c.high });
    if (isLow) pivots.push({ index: i, time: c.time, type: "low", price: c.low });
  }
  return pivots;
}

export function clusterLevels(pivots, tolPct = 0.008) {
  const levels = [];

  for (const p of pivots) {
    let matched = false;

    for (const lvl of levels) {
      const dist = Math.abs(p.price - lvl.price) / lvl.price;
      if (dist <= tolPct) {
        lvl.price = (lvl.price * lvl.strength + p.price) / (lvl.strength + 1);
        lvl.strength += 1;
        lvl.lastTime = Math.max(lvl.lastTime, p.time);
        matched = true;
        break;
      }
    }

    if (!matched) {
      levels.push({ price: p.price, strength: 1, lastTime: p.time });
    }
  }

  levels.sort((a, b) => b.strength - a.strength);
  return levels;
}

export function confluenceScores(currentPrice, levels, {
  maxDistPct = 0.02,
  maxStrength = 6
} = {}) {
  let support = 0;
  let resistance = 0;

  for (const lvl of levels) {
    const distPct = Math.abs(currentPrice - lvl.price) / currentPrice;
    if (distPct > maxDistPct) continue;

    const s = clamp(lvl.strength / maxStrength, 0, 1);
    const proximity = 1 - clamp(distPct / maxDistPct, 0, 1);
    const score = s * proximity;

    if (lvl.price <= currentPrice) support += score;
    else resistance += score;
  }

  support = clamp(support, 0, 1);
  resistance = clamp(resistance, 0, 1);

  return { supportScore: support, resistanceScore: resistance };
}