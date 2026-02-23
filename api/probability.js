// api/probability.js
// Minimal & bulletproof: geen daily import, geen daily call.
// Bestaat alleen zodat je deploy niet kan falen.

import { getWeeklyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const { candlesTruth, candlesWithLive, hasLive } = await getWeeklyBtcCandlesKraken();
    const out = buildForestOverlay({ candlesTruth, candlesWithLive, hasLive });

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      ok: true,
      source: "kraken",
      interval: "1w",
      truthCount: candlesTruth.length,
      hasLive,
      regimeLabel: out.regimeLabel,
      freezeNow: out.freezeNow,
      bandsNow: out.bandsNow
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}