// lib/coingecko.ts
export type CGMarket = {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  market_cap: number | null;
  total_volume: number | null;
  current_price: number | null;
};

const BASE = "https://api.coingecko.com/api/v3";

async function j<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`CoinGecko fetch failed ${r.status}: ${url}`);
  return (await r.json()) as T;
}

export async function getCoinGeckoMarketsTop(pages = 2): Promise<CGMarket[]> {
  // We halen top volume coins op (USD) in chunks van 250
  const out: CGMarket[] = [];
  for (let page = 1; page <= pages; page++) {
    const url =
      `${BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=250&page=${page}` +
      `&sparkline=false&price_change_percentage=24h`;
    const rows = await j<any[]>(url);

    for (const r of rows) {
      out.push({
        id: String(r.id),
        symbol: String(r.symbol || ""),
        name: String(r.name || ""),
        image: r.image ? String(r.image) : undefined,
        market_cap: r.market_cap ?? null,
        total_volume: r.total_volume ?? null,
        current_price: r.current_price ?? null,
      });
    }
  }
  return out;
}
