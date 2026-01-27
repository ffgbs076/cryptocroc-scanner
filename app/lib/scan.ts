// app/lib/scan.ts
// Trechter (4 tabellen) + Runner (los)
// Data bron: CoinGecko coins/markets (praktijk small/mid caps)

export type Side = "bull" | "bear";

type Coin = {
  id: string;
  symbol: string;
  name: string;
  market_cap: number | null;
  total_volume: number | null;
  current_price: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  high_24h: number | null;
  low_24h: number | null;
};

type HistPoint = {
  ts: number;
  score: number;
  vol: number;
  mcap: number;
  ch24: number;
  range24: number; // %
};

type State = {
  level: 4 | 3 | 2 | 1; // radar,buildup,almost,entry
  confirmUp: number;
  confirmDown: number;
  hist: HistPoint[];
  runnerHits: number;
  lastSeen: number;
};

// ====== IN-MEMORY STATE (later eventueel KV) ======
const g = globalThis as any;
if (!g.__CC_STATE__) g.__CC_STATE__ = new Map<string, State>();
const STATE: Map<string, State> = g.__CC_STATE__;

// ====== SETTINGS (jouw praktijk band) ======
const MIN_MCAP_RADAR = 3_500_000;   // niveau 5->4 (jij noemt 3.5M)
const MIN_MCAP_BUILD = 4_500_000;   // niveau 4
const MIN_MCAP_ALMOST = 5_000_000;  // niveau 3 band start
const MAX_MCAP_ALMOST = 600_000_000;// niveau 3 band eind

const MIN_VOL_RADAR = 1_250_000;    // jij noemde 1.25M
const MIN_VOL_ENTRY = 3_000_000;    // niveau 2 strengere liquiditeit

// confirm thresholds (sequentieel, niet overslaan)
const UP_TO_BUILDUP = 2.5;  // radar -> buildup
const UP_TO_ALMOST = 3.0;  // buildup -> almost
const UP_TO_ENTRY  = 3.5;  // almost -> entry

const DOWN_TO_DEGRADE = 3.0; // 3 fails => degrade 1 level

// windows
const W_RADAR = 2;
const W_BUILD = 3;
const W_ALMOST = 5;
const W_ENTRY = 6;

// ====== Helper ======
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return (a / b) * 100;
}

function safeNum(x: any, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

// ====== Score100 (praktijk, zonder “futures/shorts/news” omdat CG dat niet geeft) ======
// Doel: stabiele score die wél echt met smallcaps werkt.
// Later kunnen we “shorts/news/orderbook” als extra lagen erbij zetten.
function scoreCoin(c: Coin, side: Side) {
  const mcap = safeNum(c.market_cap, 0);
  const vol = safeNum(c.total_volume, 0);
  const ch24 = safeNum(c.price_change_percentage_24h, 0);

  const hi = safeNum(c.high_24h, 0);
  const lo = safeNum(c.low_24h, 0);
  const price = safeNum(c.current_price, 0);

  const range24 = lo > 0 ? ((hi - lo) / lo) * 100 : 0;

  const vm = mcap > 0 ? vol / mcap : 0; // volume/marketcap ratio

  // 10 punten per “filter-blok” => max 100
  // 1) Liquiditeit (vol)
  const p1 = clamp(pct(vol, 2_000_000), 0, 10); // 2M = volle 10

  // 2) Mcap band (small/mid)
  const p2 =
    mcap >= 5_000_000 && mcap <= 600_000_000 ? 10 :
    mcap >= 3_500_000 && mcap < 5_000_000 ? 6 :
    mcap > 600_000_000 && mcap <= 1_200_000_000 ? 4 : 0;

  // 3) Volume/Mcap ratio (vm)
  // te laag = dood, te hoog = vaak pump/rotzooi
  let p3 = 0;
  if (vm >= 0.08 && vm <= 2.5) p3 = 10;
  else if (vm >= 0.05 && vm < 0.08) p3 = 6;
  else if (vm > 2.5 && vm <= 4.0) p3 = 5;
  else p3 = 0;

  // 4) 24h beweging (momentum voor bull, downside druk voor bear)
  const abs24 = Math.abs(ch24);
  const p4 = clamp(abs24 / 5, 0, 10); // 50% abs = 10, 25% = 5

  // 5) Range24 (volatility “aanwezig”)
  const p5 = clamp(range24 / 8, 0, 10); // 80% range = 10, 40%=5

  // 6) Price sanity (niet dood / geen null)
  const p6 = price > 0 && hi > 0 && lo > 0 ? 10 : 0;

  // 7) “Compress” proxy: range niet te ziek groot, maar ook niet dood
  // sweetspot: 6%–22% range24
  let p7 = 0;
  if (range24 >= 6 && range24 <= 22) p7 = 10;
  else if (range24 >= 4 && range24 < 6) p7 = 7;
  else if (range24 > 22 && range24 <= 35) p7 = 6;
  else p7 = 0;

  // 8) “Vol spike” proxy: vm hoger dan basis
  let p8 = 0;
  if (vm >= 0.18) p8 = 10;
  else if (vm >= 0.12) p8 = 7;
  else if (vm >= 0.08) p8 = 5;
  else p8 = 0;

  // 9) “Context” proxy: voor bull liever positief of draaiend, voor bear liever negatief
  let p9 = 0;
  if (side === "bull") {
    if (ch24 >= 8) p9 = 10;
    else if (ch24 >= 3) p9 = 7;
    else if (ch24 >= -2) p9 = 5;
    else p9 = 2;
  } else {
    if (ch24 <= -8) p9 = 10;
    else if (ch24 <= -3) p9 = 7;
    else if (ch24 <= 2) p9 = 5;
    else p9 = 2;
  }

  // 10) Supply “schaarste” proxy (max_supply bekend is beter)
  let p10 = 0;
  const maxS = safeNum(c.max_supply, 0);
  const circ = safeNum(c.circulating_supply, 0);
  if (maxS > 0 && circ > 0) {
    const used = circ / maxS; // hoe dichterbij max, hoe “schaarser”
    p10 = clamp(used * 10, 0, 10);
  } else {
    p10 = 4; // onbekend => midden
  }

  const score = Math.round(p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10);

  return {
    score,
    mcap,
    vol,
    ch24,
    range24,
    vm,
    parts: { p1,p2,p3,p4,p5,p6,p7,p8,p9,p10 }
  };
}

// ====== timing (0..4) ======
// Heel simpel: bull: +momentum + gezonde range + vm ok
// bear: -momentum + gezonde range + vm ok
function timingPoints(metrics: { ch24:number; range24:number; vm:number }, side: Side) {
  let t = 0;
  if (side === "bull") {
    if (metrics.ch24 >= 3) t++;
    if (metrics.ch24 >= 8) t++;
  } else {
    if (metrics.ch24 <= -3) t++;
    if (metrics.ch24 <= -8) t++;
  }
  if (metrics.range24 >= 6 && metrics.range24 <= 22) t++;
  if (metrics.vm >= 0.08) t++;
  return clamp(t, 0, 4);
}

// ====== consistency/performance ======
function calcConsistency(hist: HistPoint[], minScore: number) {
  if (hist.length === 0) return 0;
  const ok = hist.filter(h => h.score >= minScore).length;
  return (ok / hist.length) * 100;
}
function calcPerformance(hist: HistPoint[], side: Side) {
  // performance proxy: gemiddeld “richting” (bull: meer score + ch24 positief, bear: ch24 negatief)
  if (hist.length === 0) return 0;
  const dir = hist.reduce((s, h) => s + (side === "bull" ? h.ch24 : -h.ch24), 0) / hist.length;
  // schaal naar 0..100
  return clamp((dir + 20) * 2.5, 0, 100);
}

// ====== Runner detectie ======
// “uit het niets”: hoog volume/MCAP + grote 24h move + range groot
function isRunner(metrics: { vm:number; ch24:number; range24:number }, side: Side) {
  const abs24 = Math.abs(metrics.ch24);
  if (metrics.vm < 0.22) return false;
  if (abs24 < 12) return false;
  if (metrics.range24 < 18) return false;

  // richting: bull liever up, bear liever down
  if (side === "bull" && metrics.ch24 < 8) return false;
  if (side === "bear" && metrics.ch24 > -8) return false;

  return true;
}

// ====== main scan ======
export async function scan(side: Side) {
  // 1) haal coins
  const coins: Coin[] = [];
  for (let page = 1; page <= 4; page++) {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets" +
      `?vs_currency=usd&order=volume_desc&per_page=250&page=${page}` +
      `&price_change_percentage=24h`;

    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) continue;

    const data = await res.json();
    coins.push(...data);
  }

  // 2) basis filter (praktijk)
  const base = coins.filter(c => {
    const mcap = safeNum(c.market_cap, 0);
    const vol = safeNum(c.total_volume, 0);
    if (mcap < MIN_MCAP_RADAR) return false;
    if (vol < MIN_VOL_RADAR) return false;
    return true;
  });

  const now = Date.now();

  // 3) update state + level bepalen (sequentieel)
  const radar: any[] = [];
  const buildup: any[] = [];
  const almost: any[] = [];
  const entry: any[] = [];
  const runner: any[] = [];

  for (const c of base) {
    const m = scoreCoin(c, side);
    const t = timingPoints({ ch24:m.ch24, range24:m.range24, vm:m.vm }, side);

    const key = `${side}:${c.id}`;
    const st = STATE.get(key) || {
      level: 4,
      confirmUp: 0,
      confirmDown: 0,
      hist: [],
      runnerHits: 0,
      lastSeen: now
    };

    st.lastSeen = now;

    // push hist (max 14 punten = “14 scans” gevoel, niet dagen)
    st.hist.push({ ts: now, score: m.score, vol: m.vol, mcap: m.mcap, ch24: m.ch24, range24: m.range24 });
    if (st.hist.length > 14) st.hist.shift();

    // windows per level
    const needWindow =
      st.level === 4 ? W_BUILD :
      st.level === 3 ? W_ALMOST :
      st.level === 2 ? W_ENTRY :
      W_ENTRY;

    const histWindow = st.hist.slice(-needWindow);

    // level thresholds
    const minScore =
      st.level === 4 ? 68 : // radar
      st.level === 3 ? 76 : // buildup
      st.level === 2 ? 86 : // almost
      90;                   // entry

    const cons = calcConsistency(histWindow, minScore);
    const perf = calcPerformance(histWindow, side);

    // marketcap bands (jouw regels)
    const mcapOkRadar = m.mcap >= MIN_MCAP_RADAR;
    const mcapOkBuild = m.mcap >= MIN_MCAP_BUILD;
    const mcapOkAlmost = m.mcap >= MIN_MCAP_ALMOST && m.mcap <= MAX_MCAP_ALMOST;

    // volume bands
    const volOkRadar = m.vol >= MIN_VOL_RADAR;
    const volOkEntry = m.vol >= MIN_VOL_ENTRY;

    // promotie condities per stap (sequentieel)
    let passPromote = false;

    if (st.level === 4) {
      // RADAR -> BUILDUP
      // 2->3 scans + cons>=80 + perf>=80 + score>=76 + mcap >= 4.5M
      passPromote =
        mcapOkBuild &&
        volOkRadar &&
        histWindow.length >= 3 &&
        cons >= 80 &&
        perf >= 80 &&
        m.score >= 76;
      if (passPromote) st.confirmUp += 1; else st.confirmUp = Math.max(0, st.confirmUp - 0.5);
      if (st.confirmUp >= UP_TO_BUILDUP) { st.level = 3; st.confirmUp = 0; st.confirmDown = 0; }
    } else if (st.level === 3) {
      // BUILDUP -> ALMOST
      // window 5 + cons>=88 + perf>=88 + score>=86 + timing >=3 (of 2 bij “breakout”)
      const breakout = m.vm >= 0.18 && Math.abs(m.ch24) >= 8;
      const timingOk = breakout ? t >= 2 : t >= 3;

      passPromote =
        mcapOkAlmost &&
        histWindow.length >= 5 &&
        cons >= 88 &&
        perf >= 88 &&
        m.score >= 86 &&
        timingOk;

      if (passPromote) st.confirmUp += 1; else st.confirmUp = Math.max(0, st.confirmUp - 0.5);
      if (st.confirmUp >= UP_TO_ALMOST) { st.level = 2; st.confirmUp = 0; st.confirmDown = 0; }
    } else if (st.level === 2) {
      // ALMOST -> ENTRY
      // score>=90 + timing>=3 + volume acceleratie proxy(vm hoog) + vol>=3M
      const accel = m.vm >= 0.18;
      passPromote =
        histWindow.length >= 6 &&
        m.score >= 90 &&
        t >= 3 &&
        accel &&
        volOkEntry;

      if (passPromote) st.confirmUp += 1; else st.confirmUp = Math.max(0, st.confirmUp - 0.5);
      if (st.confirmUp >= UP_TO_ENTRY) { st.level = 1; st.confirmUp = 0; st.confirmDown = 0; }
    } else {
      // ENTRY blijft ENTRY, maar we doen degradatie checks
      passPromote = false;
    }

    // degradatie (3 confirms failing) – niet in één keer terug naar radar
    const failBasic =
      !mcapOkRadar || !volOkRadar || m.score < minScore;

    if (failBasic) st.confirmDown += 1; else st.confirmDown = Math.max(0, st.confirmDown - 0.5);

    if (st.confirmDown >= DOWN_TO_DEGRADE) {
      if (st.level === 1) st.level = 2;
      else if (st.level === 2) st.level = 3;
      else if (st.level === 3) st.level = 4;
      st.confirmDown = 0;
      st.confirmUp = 0;
    }

    // Runner (los van trechter)
    if (isRunner({ vm:m.vm, ch24:m.ch24, range24:m.range24 }, side)) {
      st.runnerHits += 1;
    } else {
      st.runnerHits = Math.max(0, st.runnerHits - 0.25);
    }

    STATE.set(key, st);

    const row = {
      id: c.id,
      sym: (c.symbol || "").toUpperCase(),
      name: c.name,
      score: m.score,
      timing: t,
      mcap: m.mcap,
      vol: m.vol,
      vm: Number(m.vm.toFixed(3)),
      ch24: Number(m.ch24.toFixed(2)),
      range24: Number(m.range24.toFixed(2)),
      cons: Number(cons.toFixed(1)),
      perf: Number(perf.toFixed(1)),
      level: st.level,
      runnerHits: Number(st.runnerHits.toFixed(2))
    };

    // plaats in juiste tabel
    if (st.level === 4) radar.push(row);
    else if (st.level === 3) buildup.push(row);
    else if (st.level === 2) almost.push(row);
    else entry.push(row);

    // runner los
    if (st.runnerHits >= 1.0) runner.push(row);
  }

  // sorteren: ENTRY hoogste score, dan ALMOST, BUILDUP, RADAR
  const byScore = (a:any, b:any) => b.score - a.score;
  entry.sort(byScore);
  almost.sort(byScore);
  buildup.sort(byScore);
  radar.sort(byScore);
  runner.sort((a:any,b:any) => (b.runnerHits - a.runnerHits) || (b.score - a.score));

  // top limits (houd site snel)
  const out = {
    ok: true,
    side,
    ts: now,
    tables: {
      entry: entry.slice(0, 30),
      almost: almost.slice(0, 60),
      buildup: buildup.slice(0, 120),
      radar: radar.slice(0, 200)
    },
    runner: runner.slice(0, 30),
    stats: {
      totalScanned: base.length,
      entry: entry.length,
      almost: almost.length,
      buildup: buildup.length,
      radar: radar.length,
      runner: runner.length
    }
  };

  return out;
}
