// api/probability.js
// Minimal, stable endpoint (optional). Uses weekly truth only.
// Exists mainly to prevent "is not a function" build errors.

import { getDailyBtcCandlesKraken, getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    // Just proving daily function exists (so you never get that error again)
    // We don't have to use it, but we keep it for future.
    await getDailyBtcCandlesKraken();

    const { candlesTruth, candlesWithLive, hasLive } = await getWeeklyBtcCandlesKraken();
    const out = buildForestOverlay({ candlesTruth, candlesWithLive, hasLive });

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      ok: true,
      regimeLabel: out.regimeLabel,
      freezeNow: out.freezeNow,
      bandsNow: out.bandsNow
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}