// api/forest.js
import { getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const includeLive =
      String(req.query?.includeLive || "0") === "1";

    const kraken = await getWeeklyBtcCandlesKraken();

    if (!kraken || !kraken.candlesTruth?.length) {
      throw new Error("No weekly candles returned from Kraken");
    }

    const { candlesTruth, candlesWithLive, hasLive } = kraken;
    const baseCandles = includeLive
      ? candlesWithLive
      : candlesTruth;

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive
    });

    res.status(200).json({
      ok: true,
      source: "kraken",
      interval: "1w",
      truthCount: candlesTruth.length,
      hasLive,
      candles: baseCandles,
      forestOverlayTruth: out.forestOverlayTruth || [],
      forestOverlayLive: out.forestOverlayLive || [],
      forestOverlayForward: out.forestOverlayForward || [],
      regimeLabel: out.regimeLabel || "unknown"
    });

  } catch (e) {
    console.error("FOREST API ERROR:", e);
    res.status(500).json({
      error: e?.message || "Unknown forest error"
    });
  }
}