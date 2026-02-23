import { getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const includeLive =
      url.searchParams.get("includeLive") === "1" ||
      url.searchParams.get("includeLive") === "true";

    const { candlesTruth, candlesWithLive, hasLive } =
      await getWeeklyBtcCandlesKraken();

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive
    });

    const baseCandles = includeLive ? candlesWithLive : candlesTruth;

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(
      JSON.stringify(
        {
          source: "kraken",
          interval: "1w",
          truthCount: candlesTruth.length,
          hasLive,
          candles: baseCandles.map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
          })),

          // Overlay lijnen (op prijs chart)
          forestOverlayTruth: out.forestOverlayTruth,
          forestOverlayLive: out.forestOverlayLive,
          forestOverlayForward: out.forestOverlayForward,

          // Label
          regimeLabel: out.regimeLabel
        },
        null,
        2
      )
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}