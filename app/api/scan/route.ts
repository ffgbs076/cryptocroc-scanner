export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    side: "bull",
    tables: {
      radar: [],
      buildup: [],
      almost: [],
      entry: [],
      runner: []
    }
  });
}