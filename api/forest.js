import { getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { calculateForest } from "./_lib/forestEngine.js";
import { clamp, ema, atr, stdev } from "./_lib/indicators.js";
import { makeForecastProjected } from "./_lib/forecast.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const includeCurrentWeek = String(req.query.includeCurrentWeek || "false") === "true";
    const wantForecast = String(req.query.forecast || "0") === "1";

    const candlesAll = await getWeeklyBtcCandlesKraken();
    const candles = includeCurrentWeek ? candlesAll : candlesAll.slice(0, -1);

    const closes = candles.map(c => c.close);
    const atr14 = atr(candles, 14);
    const forestRaw = calculateForest(candles); // z-score-ish, non repaint (op basis van input)

    // Forest line (oscillator pane)
    const forestLine = candles
      .map((c, i) => (forestRaw[i] == null ? null : ({ time: c.time, value: forestRaw[i] })))
      .filter(Boolean);

    // Overlay op prijs: close + cappedZ * ATR * multiplier
    const mult = 0.6;
    const overlayProjected = candles.map((c, i) => {
      const z = forestRaw[i];
      const a = atr14[i];
      if (z == null || a == null) return null;
      const cappedZ = clamp(z, -2.5, 2.5);
      return { time: c.time, value: c.close + cappedZ * a * mult };
    }).filter(Boolean);

    // Turning points: cross thresholds (confirmed op closed candles)
    const turningPoints = [];
    for (let i = 1; i < candles.length; i++) {
      const prev = forestRaw[i - 1];
      const cur = forestRaw[i];
      if (prev == null || cur == null) continue;

      if (prev < -0.2 && cur >= -0.2) turningPoints.push({ time: candles[i].time, type: "up" });
      if (prev > 0.2 && cur <= 0.2) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    const forecastProjected = wantForecast
      ? makeForecastProjected(candles, forestRaw, atr14, mult)
      : [];

    res.status(200).json({
      source: "kraken",
      interval: "1w",
      candles,
      forestRaw,
      forestLine,
      overlayProjected,
      forecastProjected,
      turningPoints
    });
  } catch (e) {
    res.status(503).json({ error: e?.message || String(e) });
  }
}