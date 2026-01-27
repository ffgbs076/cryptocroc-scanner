// app/api/hits/route.ts

import { NextResponse } from "next/server";
import { storeGet, storeIncr } from "@/app/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  storeIncr("hits:api:hits", 1);

  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    hits: {
      scan: storeGet<number>("hits:api:scan") ?? 0,
      snapshot: storeGet<number>("hits:api:snapshot") ?? 0,
      hits: storeGet<number>("hits:api:hits") ?? 0
    }
  });
}
