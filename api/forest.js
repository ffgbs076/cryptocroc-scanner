// api/forest.js
// Return: candles + forest z-score (non-repaint: standaard alleen gesloten weken)

const { getWeeklyBtcCandlesKraken } = require("./_lib/kraken");
const { ema, atr, stdev, clamp } = require("./_lib/indicators");

let CACHE = {
  ts: 0,
  dataClosed: null,
  dataLive: null
};

function parseBool(v) {
  return v === "1" || v === "true" || v === "yes";
}

module.exports = async (req, res) => {
  try {
    const includeCurrentWeek = parseBool(req.query?.includeCurrentWeek);

    // Cache 15 min
    const now = Date.now();
    const cacheOk = now - CACHE.ts < 15 * 60 * 1000;

    let candles;
    if (cacheOk && includeCurrentWeek && CACHE.dataLive) {
      candles = CACHE.dataLive;
    } else if (cacheOk && !includeCurrentWeek && CACHE.dataClosed) {
      candles = CACHE.dataClosed;
    } else {
      candles = await getWeeklyBtcCandlesKraken({ includeCurrentWeek });

      CACHE.ts = now;
      if (includeCurrentWeek) CACHE.dataLive = candles;
      else CACHE.dataClosed = candles;
    }

    // ========== FOREST ENGINE ==========
    // Doel: oscillator rond 0 (z-score), minder “bias”.
    // Basis: (close - EMA50) / stdev(close-EMA50) over lange lookback, dan smoothing.
    const maPeriod = 50;
    const lookback = 52 * 3; // ~3 jaar weekly
    const smoothLen = 6;

    const closes = candles.map((c) => c.close);

    const ema50 = ema(closes, maPeriod);
    const diff = closes.map((v, i) => (ema50[i] == null ? null : (v - ema50[i])));

    const dev = stdev(diff.map((x) => x == null ? null : x), lookback);

    const forestRaw = diff.map((d, i) => {
      if (d == null || dev[i] == null || dev[i] === 0) return null;
      return d / dev[i]; // z-score-ish
    });

    // Smoothing: EMA over forestRaw (alleen op numbers)
    const forestRawFilled = forestRaw.map((v) => (v == null ? null : v));
    const forestSmooth = ema(
      forestRawFilled.map((v) => (v == null ? null : v)),
      smoothLen
    );

    // (optioneel) cap extreme waarden voor leesbaarheid
    const forest = forestSmooth.map((v) => (v == null ? null : clamp(v, -3, 3)));

    // turningPoints: simpel: crosses van -0.35 en +0.35 (alleen op gesloten candles)
    const turningPoints = [];
    const UP = 0.35;
    const DN = -0.35;

    for (let i = 1; i < forest.length; i++) {
      const a = forest[i - 1], b = forest[i];
      if (a == null || b == null) continue;

      if (a <= UP && b > UP) turningPoints.push({ time: candles[i].time, type: "up" });
      if (a >= DN && b < DN) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(
      JSON.stringify(
        {
          source: "kraken",
          interval: "1w",
          maPeriod,
          includeCurrentWeek,
          candles,
          forest,
          turningPoints
        },
        null,
        2
      )
    );
  } catch (e) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(500).send(JSON.stringify({ error: String(e?.message || e) }));
  }
};