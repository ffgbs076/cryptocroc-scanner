import https from "https";

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (r) => {
        let data = "";
        r.on("data", (c) => (data += c));
        r.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON from Kraken"));
          }
        });
      })
      .on("error", reject);
  });
}

// Kraken OHLC: interval in MINUTES. Weekly = 10080
export async function getWeeklyBtcCandlesKraken() {
  // XBTUSD is de “klassieke” Kraken pair
  const pair = "XBTUSD";
  const interval = 10080;

  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;
  const json = await httpsGetJson(url);

  if (!json || json.error?.length) {
    throw new Error(`Kraken error: ${json?.error?.join(", ") || "unknown"}`);
  }

  const resultKey = Object.keys(json.result).find((k) => k !== "last");
  if (!resultKey) throw new Error("Kraken: missing result key");

  const rows = json.result[resultKey];
  if (!Array.isArray(rows) || rows.length < 30) {
    throw new Error("Kraken: not enough OHLC data");
  }

  // Map naar candles
  const candles = rows
    .map((r) => ({
      time: Number(r[0]), // seconds
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      vwap: Number(r[5]),
      volume: Number(r[6]),
      count: Number(r[7])
    }))
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);

  // Live candle check: laatste candle is “open” als hij nog niet gesloten is
  const nowSec = Math.floor(Date.now() / 1000);
  const weekSec = 7 * 24 * 60 * 60;

  const last = candles[candles.length - 1];
  const hasLive = last.time + weekSec > nowSec;

  const candlesTruth = hasLive ? candles.slice(0, -1) : candles.slice();
  const candlesWithLive = candles.slice();

  return { candlesTruth, candlesWithLive, hasLive };
}