// app/lib/orderbook.ts
export type DepthLevel = [string, string];

export function analyzeDepth(bids: DepthLevel[], asks: DepthLevel[]) {
  // Placeholder analyse zodat de API kan builden
  const bidCount = Array.isArray(bids) ? bids.length : 0;
  const askCount = Array.isArray(asks) ? asks.length : 0;

  return {
    ok: true,
    bidCount,
    askCount,
    imbalance: bidCount - askCount
  };
}
