export async function getWeeklyBtcCandlesKraken() {
  // Kraken OHLC: https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080";
  const r = await fetch(url, { headers: { "accept": "application/json" }});
  const j = await r.json();

  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  if (j.error && j.error.length) throw new Error(`Kraken error: ${j.error.join(", ")}`);

  const key = Object.keys(j.result).find(k => k !== "last");
  const rows = j.result[key];

  // Kraken: [time, open, high, low, close, vwap, volume, count]
  const candles = rows.map(row => ({
    time: Number(row[0]), // seconds
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6])
  }));

  // sort + dedupe
  candles.sort((a,b) => a.time - b.time);
  return candles;
}