import { getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export default async function handler(req, res) {
  try {
    const includeLive = String(req.query?.includeLive || "0") === "1";

    const { candlesTruth, candlesWithLive, hasLive } =
      await getWeeklyBtcCandlesKraken();

    const baseCandles = includeLive ? candlesWithLive : candlesTruth;

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive,
    });

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

        forestOverlayTruth: out.forestOverlayTruth,
        forestOverlayLive: out.forestOverlayLive,
        forestOverlayForward: out.forestOverlayForward,
        regimeLabel: out.regimeLabel,
      })
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}