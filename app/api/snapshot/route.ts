// app/api/snapshot/route.ts
import { NextResponse } from "next/server";
import { redisGet } from "@/app/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Side = "bull" | "bear";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const side = searchParams.get("side") as Side | null;

  if (side !== "bull" && side !== "bear") {
    return NextResponse.json(
      { ok: false, error: "side must be bull or bear" },
      { status: 400 }
    );
  }

  const key = side === "bull"
    ? "cc:snapshot:bull"
    : "cc:snapshot:bear";

  const data = redisGet(key);

  return NextResponse.json({
    ok: true,
    side,
    data: data ?? null,
    ts: Date.now(),
  });
}
