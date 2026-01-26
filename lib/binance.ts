// lib/binance.ts
export type Binance24hTicker = {
  symbol: string;
  lastPrice: string;
  quoteVolume: string;
  priceChangePercent: string;
};

const BASE = "https://api.binance.com";

async function j<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Binance fetch failed ${r.status}: ${url}`);
  return (await r.json()) as T;
}

export async function getBinanceUsdtSymbols(): Promise<Set<string>> {
  const data = await j<{ symbols: { symbol: string; status: string; quoteAsset: string }[] }>(
    `${BASE}/api/v3/exchangeInfo`
  );
  const set = new Set<string>();
  for (const s of data.symbols) {
    if (s.status !== "TRADING") continue;
    if (s.quoteAsset !== "USDT") continue;
    set.add(s.symbol);
  }
  return set;
}

export async function getBinance24hTickers(): Promise<Binance24hTicker[]> {
  const all = await j<any[]>(`${BASE}/api/v3/ticker/24hr`);
  // we pakken alleen wat we nodig hebben
  return all.map((t) => ({
    symbol: String(t.symbol),
    lastPrice: String(t.lastPrice),
    quoteVolume: String(t.quoteVolume),
    priceChangePercent: String(t.priceChangePercent),
  }));
}

// 14 dagen % change via daily candles
export async function getBinance14dPct(symbol: string): Promise<number | null> {
  // 15 candles => 14 dagen verschil
  const url = `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=15`;
  const klines = await j<any[]>(url);

  if (!Array.isArray(klines) || klines.length < 2) return null;

  // kline: [ openTime, open, high, low, close, volume, ...]
  const firstClose = Number(klines[0]?.[4]);
  const lastClose = Number(klines[klines.length - 1]?.[4]);
  if (!Number.isFinite(firstClose) || !Number.isFinite(lastClose) || firstClose <= 0) return null;

  return ((lastClose - firstClose) / firstClose) * 100;
}

