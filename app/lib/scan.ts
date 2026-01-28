export type Side = "bull" | "bear";

export type CoinRow = {
  id: string;
  sym: string;
  name: string;

  // scores (dummy nu, echte berekening later)
  score: number;
  timing: number;
  cons: number;
  perf: number;

  mcap: number;
  vol: number;
  ch24: number;
  volRatio: number;

  level: number;
  runnerHits: number;

  // later vullen we deze pas als hij radar is
  ob?: {
    src: "binance" | "bybit";
    bidAskImbalance: number;
  };
};

export type Tables = {
  radar: CoinRow[];
  buildup: CoinRow[];
  almost: CoinRow[];
  entry: CoinRow[];
  runner: CoinRow[];
  stats: {
    totalscanned: number;
    radar: number;
    buildup: number;
    almost: number;
    entry: number;
    runner: number;
  };
};

// CoinGecko market row minimal
type CGRow = {
  id: string;
  symbol: string;
  name: string;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return r.json() as Promise<T>;
}

function safeNum(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

// 11 filters (placeholder: jij gaat straks de echte regels invullen)
function passesBaseFilters(row: CGRow, side: Side) {
  const mcap = safeNum(row.market_cap);
  const vol = safeNum(row.total_volume);
  const ch24 = safeNum(row.price_change_percentage_24h);

  const volRatio = mcap > 0 ? vol / mcap : 0;

  // Voor nu: simpele “niet 0” checks + voorbeeldcaps
  // (Hier vervangen we straks door jouw 11 echte filters)
  if (mcap <= 0) return false;
  if (vol <= 0) return false;
  if (volRatio < 0.02) return false;

  // side verschil voorbeeld
  if (side === "bull" && ch24 < -30) return false;
  if (side === "bear" && ch24 > 30) return false;

  return true;
}

// trechter indeling (placeholder)
function funnelBucket(score: number): keyof Omit<Tables, "stats"> {
  if (score >= 80) return "entry";
  if (score >= 60) return "almost";
  if (score >= 40) return "buildup";
  return "radar";
}

export async function scanMarket(opts: { side: Side }): Promise<Tables> {
  const side = opts.side;

  // 1) haal coins op (klein beginnen, later uitbreiden)
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false";
  const rows = await fetchJson<CGRow[]>(url);

  const tables: Omit<Tables, "stats"> = {
    radar: [],
    buildup: [],
    almost: [],
    entry: [],
    runner: []
  };

  let scanned = 0;

  for (const r of rows) {
    scanned++;

    if (!passesBaseFilters(r, side)) continue;

    const mcap = safeNum(r.market_cap);
    const vol = safeNum(r.total_volume);
    const ch24 = safeNum(r.price_change_percentage_24h);
    const volRatio = mcap > 0 ? vol / mcap : 0;

    // Score (dummy nu)
    const score = Math.max(0, Math.min(100, Math.round(volRatio * 200)));

    const row: CoinRow = {
      id: r.id,
      sym: String(r.symbol || "").toUpperCase(),
      name: String(r.name || ""),
      score,
      timing: 0,
      cons: 0,
      perf: 0,
      mcap,
      vol,
      ch24,
      volRatio,
      level: 0,
      runnerHits: 0
    };

    const bucket = funnelBucket(score);
    tables[bucket].push(row);

    // runner aparte lijst (voorbeeld)
    if (score >= 90) tables.runner.push(row);
  }

  // 2) LET OP: orderbook pas later, en alleen voor radar coins
  // Hier komt straks:
  // for (const c of tables.radar) c.ob = await fetchOrderbook(c.sym)

  const out: Tables = {
    ...tables,
    stats: {
      totalscanned: scanned,
      radar: tables.radar.length,
      buildup: tables.buildup.length,
      almost: tables.almost.length,
      entry: tables.entry.length,
      runner: tables.runner.length
    }
  };

  // 3) garandeer 5 tabellen bestaan (ook leeg)
  return out;
}