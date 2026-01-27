export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    note: "Scan stub. Straks roept dit lib/scan.ts aan en update KV state.",
    ts: Date.now()
  });
}