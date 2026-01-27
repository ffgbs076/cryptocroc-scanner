// lib/binance.ts
const BN = "https://api.binance.com";

const num = (x: any, d = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};

export type Orderbook = {
  bids: [number, number][];
  asks: [number, number][];
};

export async function fetchBinanceOrderbook(symbolUSDT: string, limit = 100): Promise<Orderbook> {
  const url = `${BN}/api/v3/depth?symbol=${encodeURIComponent(symbolUSDT)}&limit=${limit}`;
  const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Binance depth failed ${symbolUSDT}: ${r.status}`);

  const j = await r.json();

  const bids: [number, number][] = (j?.bids || [])
    .map((b: any[]) => [num(b[0]), num(b[1])] as [number, number])
    .filter(x => x[0] > 0 && x[1] > 0);

  const asks: [number, number][] = (j?.asks || [])
    .map((a: any[]) => [num(a[0]), num(a[1])] as [number, number])
    .filter(x => x[0] > 0 && x[1] > 0);

  return { bids, asks };
}

export function ratioWithinBand(ob: Orderbook, bandPct = 0.03): number | null {
  if (!ob.bids.length || !ob.asks.length) return null;

  const bestBid = ob.bids[0][0];
  const bestAsk = ob.asks[0][0];
  if (!(bestBid > 0 && bestAsk > 0)) return null;

  const mid = (bestBid + bestAsk) / 2;
  const bidMin = mid * (1 - bandPct);
  const askMax = mid * (1 + bandPct);

  let bidNotional = 0;
  for (const [p, q] of ob.bids) {
    if (p < bidMin) break;
    bidNotional += p * q;
  }

  let askNotional = 0;
  for (const [p, q] of ob.asks) {
    if (p > askMax) break;
    askNotional += p * q;
  }

  if (askNotional <= 0) return null;
  return bidNotional / askNotional;
}