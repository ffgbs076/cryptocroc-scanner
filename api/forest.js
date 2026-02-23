// api/forest.js
import { getSnapshotCandles } from "./_lib/snapshot.js";
import { calculateForestV2 } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const includeCurrentWeek =
      url.searchParams.get("includeCurrentWeek") === "1" ||
      url.searchParams.get("includeCurrentWeek") === "true";

    const candles = await getSnapshotCandles({ includeCurrentWeek });

    // Forest v2 (robust + lock)
    const engine = calculateForestV2(candles, {
      emaLen: 50,
      zWindow: 208,
      enter: 0.45,
      exit: 0.25,
      confirmWeeks: 2
    });

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(
      JSON.stringify(
        {
          source: "kraken+snapshot",
          interval: "1w",
          includeCurrentWeek,
          candles,
          ema50: engine.ema50,
          forestZ: engine.forestZ,
          regime: engine.regime,
          last: {
            time: candles[candles.length - 1]?.time ?? null,
            close: candles[candles.length - 1]?.close ?? null,
            forestZ: engine.forestZ[engine.forestZ.length - 1] ?? null,
            regime: engine.regime[engine.regime.length - 1] ?? "neutral"
          }
        },
        null,
        2
      )
    );
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.status(500).send(JSON.stringify({ error: String(e?.message || e) }));
  }
}