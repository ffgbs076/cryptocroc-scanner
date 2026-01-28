type CGMarketRow = {
  symbol: string;
  price_change_percentage_24h: number | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return r.json() as Promise<T>;
}

// Bull als BTC 24h >= 0, anders Bear
export async function pickSideFromBTC(): Promise<"bull" | "bear"> {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin";
  const arr = await fetchJson<CGMarketRow[]>(url);
  const btc = arr?.[0];

  const ch24 = Number(btc?.price_change_percentage_24h ?? 0);
  return ch24 >= 0 ? "bull" : "bear";
}