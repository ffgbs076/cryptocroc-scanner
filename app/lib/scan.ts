// app/lib/scan.ts
// Simpele scan-engine + snapshot in memory (via redis.ts)

import { redisGet, redisSet } from "@/app/lib/redis";

export type Side = "bull" | "bear";

export type ScanResult = {
  ok: boolean;
  side: Side;
  ts: number;
  top10: string[];
};

const KEY_LAST_SCAN = "cc:lastScan";
const KEY_SNAPSHOT_BULL = "cc:snapshot:bull";
const KEY_SNAPSHOT_BEAR = "cc:snapshot:bear";

export function getLastOrScan(): ScanResult | null {
  return redisGet<ScanResult>(KEY_LAST_SCAN);
}

export function getSnapshot(side: Side): ScanResult | null {
  return redisGet<ScanResult>(side === "bull" ? KEY_SNAPSHOT_BULL : KEY_SNAPSHOT_BEAR);
}

export async function scan(side: Side): Promise<ScanResult> {
  // TODO: hier later jouw echte scanner logic in
  // Voor nu: altijd geldig resultaat zodat build + routes werken
  const res: ScanResult = {
    ok: true,
    side,
    ts: Date.now(),
    top10: [],
  };

  redisSet(KEY_LAST_SCAN, res);
  redisSet(side === "bull" ? KEY_SNAPSHOT_BULL : KEY_SNAPSHOT_BEAR, res);

  return res;
}
