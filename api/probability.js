import { getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { calculateForest } from "./_lib/forestEngine.js";
import { ema } from "./_lib/indicators.js";
import { findConfirmedPivots, clusterLevels, confluenceScores } from "./_lib/structure.js";

export const config = { runtime: "nodejs" };

function sigmoid(x){ return 1 / (1 + Math.exp(-x)); }
function round(x, d=3){ return Math.round(x * 10**d) / 10**d; }

export default async function handler(req, res) {
  try {
    const includeCurrentWeek = String(req.query.includeCurrentWeek || "false") === "true";

    const candlesAll = await getWeeklyBtcCandlesKraken();
    const candles = includeCurrentWeek ? candlesAll : candlesAll.slice(0, -1);

    const closes = candles.map(c => c.close);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);

    const forestRaw = calculateForest(candles);
    const n = candles.length - 1;
    const zNow = forestRaw[n];
    const zPrev = forestRaw[n - 1];

    if (zNow == null || zPrev == null) {
      return res.status(200).json({
        direction: null,
        pDown: 0.5,
        confidence: "low",
        isTradeable: false,
        message: "Not enough data yet",
        structure: { supportScore: 0, resistanceScore: 0, relevantConfluence: 0, relevantFor: null }
      });
    }

    const slopeNow = zNow - zPrev;

    const belowEma20 = closes[n] < ema20[n] ? 1 : 0;
    const belowEma50 = closes[n] < ema50[n] ? 1 : 0;

    // Logit model (hand-tuned start, eerlijk: later pas kalibreren op jouw data)
    const bias = 0.0;
    const x =
      bias +
      (-1.25 * zNow) +
      (-2.00 * slopeNow) +
      (0.35 * belowEma20) +
      (0.25 * belowEma50);

    const pDown = sigmoid(x);

    // confidence (simpel maar bruikbaar)
    let confidence = "low";
    if (Math.abs(zNow) >= 0.35 && Math.abs(slopeNow) >= 0.05) confidence = "mid";
    if (Math.abs(zNow) >= 0.55 && Math.abs(slopeNow) >= 0.08) confidence = "high";

    // =======================
    // STRUCTURE (no lookahead)
    // =======================
    const pivots = findConfirmedPivots(candles, 3, 3);
    const pivotsRecent = pivots.filter(p => p.index >= Math.max(0, candles.length - 52));
    const levels = clusterLevels(pivotsRecent, 0.008);

    const closeNow = closes[n];
    const { supportScore, resistanceScore } = confluenceScores(closeNow, levels, {
      maxDistPct: 0.02,
      maxStrength: 6
    });

    const modelDirection = (pDown >= 0.5) ? "down" : "up";
    const relevantConfluence = modelDirection === "down" ? resistanceScore : supportScore;

    const direction = pDown >= 0.5 ? "down" : "up";

    // tradeable gate: streng
    const isTradeable =
      confidence === "high" &&
      (pDown >= 0.75 || pDown <= 0.25) &&
      relevantConfluence >= 0.60;

    const message =
      isTradeable
        ? `Tradeable ${direction} (high confidence + structure confluence)`
        : `No edge: Forest shown, but not tradeable`;

    res.status(200).json({
      direction,
      pDown,
      confidence,
      isTradeable,
      message,
      features: {
        forestZ: round(zNow, 4),
        forestSlope: round(slopeNow, 4),
        belowEma20,
        belowEma50
      },
      structure: {
        supportScore: round(supportScore, 3),
        resistanceScore: round(resistanceScore, 3),
        relevantConfluence: round(relevantConfluence, 3),
        relevantFor: modelDirection
      }
    });
  } catch (e) {
    res.status(503).json({ error: e?.message || String(e) });
  }
}