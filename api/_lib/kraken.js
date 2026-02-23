// api/_lib/kraken.js
// Kraken OHLC helper voor BTC weekly candles (Vercel Node runtime)

export async function fetchKrakenOHLC({ pair = "XBTUSD", interval = 10080 } = {}) {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(
    pair
  )}&interval=${interval}`;

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 12000);

  let r;
  try {
    r = await fetch(url, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
  } catch (e) {
    clearTimeout(timeout);
    throw new Error("Kraken fetch failed: " + (e?.message || String(e)));
  }
  clearTimeout(timeout);

  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Kraken HTTP ${r.status}: ${text.slice(0, 200)}`);
  }

  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("Kraken returned non-JSON: " + text.slice(0, 200));
  }

  if (j?.error?.length) {
    throw new Error("Kraken API error: " + j.error.join(", "));
  }

  const result = j.result || {};
  const key = Object.keys(result).find((k) => Array.isArray(result[k]));
  if (!key) {
    throw new Error("Kraken OHLC missing result array");
  }

  const rows = result[key];

  // Kraken row format:
  // [time, open, high, low, close, vwap, volume, count]
  return rows.map((row) => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6]),
  }));
}

/**
 * ✅ Dit is de functie die jouw api/forest.js al probeert te gebruiken.
 * Daarom exporteren we hem exact met die naam.
 */
export async function getWeeklyBtcCandlesKraken() {
  return fetchKrakenOHLC({ pair: "XBTUSD", interval: 10080 }); // 10080 = 1 week
}