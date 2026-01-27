export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ex = (url.searchParams.get("ex") || "bitget").toLowerCase();
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();

  return Response.json({
    ok: true,
    note: "Dit endpoint wordt echt gemaakt zodra lib/orderbook.ts erin zit.",
    ex,
    symbol
  });
}