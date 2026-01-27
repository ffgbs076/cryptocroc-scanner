// lib/coingecko.ts
export type CGRow = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number | null;
  price_change_percentage_14d_in_currency: number | null;
};

const CG = "https://api.coingecko.com/api/v3";

const num = (x: any, d = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};

export async function fetchBTC24h(): Promise<number> {
  const url = `${CG}/coins/markets?vs_currency=usd&ids=bitcoin&per_page=1&page=1&sparkline=false`;
  const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`CoinGecko BTC failed: ${r.status}`);
  const j = (await r.json()) as any[];
  return num(j?.[0]?.price_change_percentage_24h, 0);
}

export async function fetchMarkets4PagesUSD(): Promise<CGRow[]> {
  const out: CGRow[] = [];

  for (let page = 1; page <= 4; page++) {
    const url =
      `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}` +
      `&sparkline=false&price_change_percentage=14d`;

    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error(`CoinGecko markets failed page ${page}: ${r.status}`);

    const arr = (await r.json()) as any[];

    for (const x of arr) {
      out.push({
        id: String(x.id),
        symbol: String(x.symbol),
        name: String(x.name),
        current_price: num(x.current_price, 0),
        market_cap: num(x.market_cap, 0),
        total_volume: num(x.total_volume, 0),
        price_change_percentage_24h: x.price_change_percentage_24h == null ? null : num(x.price_change_percentage_24h, 0),
        price_change_percentage_14d_in_currency:
          x.price_change_percentage_14d_in_currency == null ? null : num(x.price_change_percentage_14d_in_currency, 0)
      });
    }
  }

  return out;
}