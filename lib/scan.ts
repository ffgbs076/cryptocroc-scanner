// lib/scan.ts
import fs from "fs/promises";
import path from "path";
import { getBinance24hTickers, getBinance14dPct, getBinanceUsdtSymbols } from "./binance";
import { getCoinGeckoMarketsTop } from "./coingecko";

export type Side = "bull" | "bear";

export type TopItem = {
  rank: number;
  symbol: string;         // bv "PEPEUSDT"
  base: string;           // bv "PEPE"
  price: number;          // binance lastPrice
  vol24hUsd: number;      // binance quoteVolume (USDT ≈ USD)
  mcUsd: number | null;   // coingecko market cap
  vmRatio: number | null; // vol24h / marketcap
  pct14d: number;         // 14d percent change
  score: number;          // onze totaalscore
};

export type ScanResponse = {
  ok: true;
  side: Side;
  scannedAt: number;
  top10: TopItem[];
  debug?: any;
};

const STABLES = new Set([
  "USDTUSDT","USDCUSDT","DAIUSDT","TUSDUSDT","FDUSDUSDT","BUSDUSDT","USDPUSDT","EURUSDT"
]);

// ---- instellingen (later tunen)
const MIN_VOL_24H_USD = 15_000_000;     // 15M
const MIN_MARKETCAP_USD = 80_000_000;   // 80M
const MIN_VM_RATIO = 0.08;              // 8%
const MIN_ABS_14D = 6;                  // minimaal 6% beweging in 14D
const UNIVERSE_TAKE = 200;              // we scoren top 200 volume

function safeNum(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function tmpFile(side: Side) {
  // Vercel: /tmp is ok. lokaal ook ok.
  return path.join("/tmp", `cryptocroc_${side}_top10.json`);
}

async function save(side: Side, data: ScanResponse) {
  try {
    await fs.writeFile(tmpFile(side), JSON.stringify(data), "utf8");
  } catch {}
}

async function load(side: Side): Promise<ScanResponse | null> {
  try {
    const raw = await fs.readFile(tmpFile(side), "utf8");
    return JSON.parse(raw) as ScanResponse;
  } catch {
    return null;
  }
}

export async function scan(side: Side): Promise<ScanResponse> {
  // 1) haal universe
  const [binanceSymbols, tickers, cgMarkets] = await Promise.all([
    getBinanceUsdtSymbols(),
    getBinance24hTickers(),
    getCoinGeckoMarketsTop(2),
  ]);

  // 2) maak CoinGecko map op symbol -> marketcap
  // (symbol collisions bestaan, dus: eerste die we zien pakken we, rest negeren)
  const cgBySymbol = new Map<string, { mc: number | null }>();
  for (const c of cgMarkets) {
    const sym = String(c.symbol || "").toUpperCase();
    if (!sym) continue;
    if (!cgBySymbol.has(sym)) cgBySymbol.set(sym, { mc: c.market_cap ?? null });
  }

  // 3) pak alleen USDT + sorteer op volume
  const usdtTickers = tickers
    .filter((t) => typeof t.symbol === "string" && t.symbol.endsWith("USDT"))
    .filter((t) => binanceSymbols.has(t.symbol));

  usdtTickers.sort((a, b) => safeNum(b.quoteVolume) - safeNum(a.quoteVolume));

  const universe = usdtTickers.slice(0, UNIVERSE_TAKE);

  // 4) score coins (met 14D)
  const out: TopItem[] = [];
  const seenBase = new Set<string>();

  for (const t of universe) {
    const symbol = t.symbol;       // "PEPEUSDT"
    if (STABLES.has(symbol)) continue;

    const base = symbol.replace(/USDT$/, "");
    if (!base) continue;
    if (seenBase.has(base)) continue; // filter 9
    seenBase.add(base);

    const price = safeNum(t.lastPrice, NaN);
    const vol24h = safeNum(t.quoteVolume, 0);
    if (!Number.isFinite(price)) continue; // filter 8
    if (vol24h < MIN_VOL_24H_USD) continue; // filter 3

    const mc = cgBySymbol.get(base)?.mc ?? null;
    if (mc !== null && mc < MIN_MARKETCAP_USD) continue; // filter 4

    const vmRatio = mc && mc > 0 ? vol24h / mc : null;
    if (vmRatio !== null && vmRatio < MIN_VM_RATIO) continue; // filter 5

    // 14D (Binance klines)
    const pct14d = await getBinance14dPct(symbol);
    if (pct14d === null) continue;

    // filter 6 + 7
    if (side === "bull") {
      if (pct14d <= 0) continue;
      if (Math.abs(pct14d) < MIN_ABS_14D) continue;
    } else {
      if (pct14d >= 0) continue;
      if (Math.abs(pct14d) < MIN_ABS_14D) continue;
    }

    // Score (filter 10: sorteren op score)
    // Simpel, maar stabiel:
    // - momentum zwaar
    // - volume/marketcap helpt (als aanwezig)
    const score =
      Math.abs(pct14d) * 10 +
      Math.log10(Math.max(vol24h, 1)) * 3 +
      (vmRatio ? Math.min(vmRatio, 1) * 30 : 0);

    out.push({
      rank: 0,
      symbol,
      base,
      price,
      vol24hUsd: vol24h,
      mcUsd: mc,
      vmRatio: vmRatio ? Number(vmRatio.toFixed(4)) : null,
      pct14d: Number(pct14d.toFixed(2)),
      score: Number(score.toFixed(2)),
    });
  }

  out.sort((a, b) => b.score - a.score);

  const top10 = out.slice(0, 10).map((x, i) => ({ ...x, rank: i + 1 }));

  const res: ScanResponse = {
    ok: true,
    side,
    scannedAt: Date.now(),
    top10,
  };

  await save(side, res);

  // ook in-memory cache
  (globalThis as any).__CC_LAST__ = (globalThis as any).__CC_LAST__ || {};
  (globalThis as any).__CC_LAST__[side] = res;

  return res;
}

export async function getLastOrScan(side: Side): Promise<ScanResponse> {
  const mem = (globalThis as any).__CC_LAST__?.[side] as ScanResponse | undefined;
  if (mem?.ok) return mem;

  const disk = await load(side);
  if (disk?.ok) return disk;

  return await scan(side);
}

