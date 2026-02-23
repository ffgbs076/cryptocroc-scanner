import { getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const includeLive = String(req.query?.includeLive || "0") === "1";

    const { candlesTruth, candlesWithLive, hasLive } =
      await getWeeklyBtcCandlesKraken();

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive,
      forwardWeeks: 4, // jij wilde 4 weken vooruit
    });

    const baseCandles = includeLive ? candlesWithLive : candlesTruth;

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(
      JSON.stringify({
        source: "kraken",
        interval: "1w",
        truthCount: candlesTruth.length,
        hasLive,

        candles: baseCandles.map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),

        forestOverlayTruth: out.forestOverlayTruth,     // SOLID (truth)
        forestOverlayLive: out.forestOverlayLive,       // DASHED (live preview)
        forestOverlayForward: out.forestOverlayForward, // DASHED (4w hint)

        // extra info (handig)
        regimeLabel: out.regimeLabel,
        forestZNow: out.forestZNow,
      })
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}