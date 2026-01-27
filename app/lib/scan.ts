// app/lib/scan.ts
import { storeGet, storeSet } from "@/app/lib/store";

export type Side = "bull" | "bear";

export type ScanResult = {
  ok: true;
  side: Side;
  mode: "BULL" | "BEAR";
  now: number;
  refreshSeconds: number;
  entry: any[];
  almost: any[];
  buildup: any[];
  radar: any[];
  runner: any[];
  stats: {
    totalCoins: number;
  };
};

const KEY_LAST = (side: Side) => `cc:last:${side}`;

export async function forceScan(side: Side): Promise<ScanResult> {
  // Later hang je hier je echte scanner aan.
  // Nu: return altijd geldige JSON zodat build + UI werken.
  const res: ScanResult = {
    ok: true,
    side,
    mode: side === "bull" ? "BULL" : "BEAR",
    now: Date.now(),
    refreshSeconds: 600,
    entry: [],
    almost: [],
    buildup: [],
    radar: [],
    runner: [],
    stats: { totalCoins: 0 },
  };

  storeSet(KEY_LAST(side), res);
  return res;
}

export async function getLastOrScan(side: Side): Promise<ScanResult> {
  const last = storeGet<ScanResult>(KEY_LAST(side));
  if (last) return last;
  return forceScan(side);
}