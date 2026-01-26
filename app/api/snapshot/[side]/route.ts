import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getBaseUrl(req: Request) {
  // Werkt zowel lokaal als op Vercel
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function GET(req: Request, ctx: { params: { side: string } }) {
  try {
    const side = (ctx?.params?.side || "").toLowerCase();

    if (side !== "bull" && side !== "bear") {
      return NextResponse.json(
        { ok: false, error: "Invalid side (use bull or bear)" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const scan = url.searchParams.get("scan") === "1"; // ✅ scan-on-view

    // Dit is jouw echte scan endpoint in je app:
    // app/api/scan/route.ts  -> /api/scan
    const base = getBaseUrl(req);

    const scanUrl = new URL(`${base}/api/scan`);
    scanUrl.searchParams.set("side", side);
    if (scan) scanUrl.searchParams.set("scan", "1");

    const r = await fetch(scanUrl.toString(), { cache: "no-store" });
    const text = await r.text();

    // probeer JSON door te geven zoals het is
    try {
      const j = JSON.parse(text);
      return NextResponse.json(j, { status: r.status });
    } catch {
      // als /api/scan iets anders terugstuurt
      return new NextResponse(text, {
        status: r.status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Snapshot route failed" },
      { status: 500 }
    );
  }
}
