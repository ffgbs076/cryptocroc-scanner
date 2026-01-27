// app/api/hits/route.ts
import { NextResponse } from "next/server";
import { redisGet, redisSet } from "@/app/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "cc:hits";

export async function GET() {
  const current = redisGet(KEY) ?? 0;

  const next = Number(current) + 1;
  redisSet(KEY, next);

  return NextResponse.json({
    ok: true,
    hits: next,
    ts: Date.now(),
  });
}
