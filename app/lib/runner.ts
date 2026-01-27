// app/lib/runner.ts
// In Vercel/Next draaien geen "node-cron" jobs in je build.
// Scans doe je via API routes (zoals /api/scan) of Vercel Cron (vercel.json).
// Dit bestand bestaat alleen zodat imports niet breken.

export function startRunner() {
  // bewust leeg
  return;
}
