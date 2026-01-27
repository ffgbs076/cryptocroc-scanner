export const runtime = "nodejs";

import { runScan } from "@/lib/scan";

export async function GET() {
  const st = await runScan();
  return Response.json({ ok: true, updatedAt: st.updatedAt, btc24: st.btc24 });
}