// lib/scan.ts
import fs from "fs";
import path from "path";
import { kv } from "@vercel/kv";

import { fetchBTC24h, fetchMarkets4PagesUSD, type CGRow } from "./coingecko";
import { fetchBitgetOrderbook, ratioWithinBand as ratioBitget } from "./orderbook";
import { fetchBinanceOrderbook, ratioWithinBand as ratioBinance } from "./binance";

export type Side = "bull" | "bear";
export type Stage = "RADAR" | "BUILDUP" | "ALMOST" | "ENTRY" | "HOLD" | "SELL";

export type CoinState = {
  id: string;
  sym: string;
  name: string;

  price: number;
  mcap: number;
  vol: number;
  ch24: number;
  ch14: number;
  vm: number;

  score100: number;
  timing: number;
  setup: string;

  obBitgetRatio: number | null;
  obBinanceRatio: number | null;
  obConfirm: boolean;

  windowN: number;
  scoreHist: number[];
  timingHist: number[];
  volHist: number[];
  consistency: number;
  performance: number;
  volAccel: number;

  stage: Stage;
  stageSince: number;
  lastSeen: number;
};

export type GlobalState = {
  updatedAt: number;
  btc24: number;
  bull: Record<string, CoinState>;
  bear: Record<string, CoinState>;
};

const STATE_KEY = "cryptocroc:state:v1";

// ---------- utils ----------
const num = (x: any, d = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function keep(arr: number[], v: number, max = 12) {
  arr.push(v);
  while (arr.length > max) arr.shift();
}
function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function dataFilePath() {
  return path.join(process.cwd(), "data", "scanHistory.json");
}

async function loadState(): Promise<GlobalState> {
  try {
    const s = await kv.get<GlobalState>(STATE_KEY);
    if (s) return s;
  } catch {}

  // fallback file
  try {
    const p = dataFilePath();
    const txt = fs.readFileSync(p, "utf8");
    const j = JSON.parse(txt);
    return {
      updatedAt: num(j.updatedAt, 0),
      btc24: num(j.btc24, 0),
      bull: j.bull || {},
      bear: j.bear || {}
    };
  } catch {
    return { updatedAt: 0, btc24: 0, bull: {}, bear: {} };
  }
}

async function saveState(s: GlobalState): Promise<void> {
  s.updatedAt = Date.now();

  try {
    await kv.set(STATE_KEY, s);
    return;
  } catch {}

  // fallback file
  try {
    const p = dataFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
  } catch {}
}

// ---------- filters ----------
const STABLE_WORDS = ["usd", "usdt", "usdc", "dai", "tusd", "busd", "eur", "gbp"];
const JUNK_WORDS = ["wrapped", "bridge", "bridged", "synthetic", "staked", "liquid"];

function baseFilter(x: CGRow) {
  const mcap = x.market_cap;
  const vol = x.total_volume;
  const ch24 = x.price_change_percentage_24h ?? 0;
  const ch14 = x.price_change_percentage_14d_in_currency ?? 0;

  if (mcap < 5_000_000 || mcap > 600_000_000) return null;
  if (vol < 1_250_000) return null;

  const vm = vol / Math.max(1, mcap);
  if (vm < 0.28) return null;

  if (ch24 < -18 || ch24 > 18) return null;
  if (ch14 < -85 || ch14 > 85) return null;

  const name = (x.name || "").toLowerCase();
  const sym = (x.symbol || "").toLowerCase();

  if (STABLE_WORDS.some(w => name.includes(w) || sym === w)) return null;
  if (JUNK_WORDS.some(w => name.includes(w))) return null;

  return {
    id: String(x.id),
    sym: String(x.symbol).toUpperCase(),
    name: String(x.name),
    price: num(x.current_price, 0),
    mcap: num(mcap, 0),
    vol: num(vol, 0),
    ch24: num(ch24, 0),
    ch14: num(ch14, 0),
    vm
  };
}

function sideRadarBandOk(side: Side, c: any) {
  if (side === "bull") return c.ch24 >= 0;
  return c.ch24 <= 5;
}

// ---------- scoring (placeholder maar werkend) ----------
function setupDetect(side: Side, c: any, volAccel: number) {
  if (side === "bull") {
    if (c.ch24 > 2 && c.vm > 0.35) return "BREAKOUT";
    return "ACCUM";
  } else {
    if (c.ch24 < -2 && c.vm > 0.35) return "BREAKDOWN";
    return "DISTRIBUTION";
  }
}

function timingScore(side: Side, c: any, volAccel: number) {
  let t = 0;
  if (side === "bull") {
    if (c.ch24 >= 0) t++;
    if (c.vm >= 0.30) t++;
    if (c.vm >= 0.35) t++;
    if (volAccel >= 1.2) t++;
  } else {
    if (c.ch24 <= 2) t++;
    if (c.vm >= 0.35) t++;
    if (c.vm >= 0.40) t++;
    if (volAccel >= 1.2) t++;
  }
  return clamp(t, 0, 4);
}

function score100(side: Side, c: any, consistency: number, performance: number) {
  let s = 50;
  s += clamp((c.vm - 0.28) * 120, 0, 30);

  if (side === "bull") {
    if (c.ch24 >= -1.2 && c.ch24 <= 9.5) s += 12;
    if (c.ch14 >= -28 && c.ch14 <= 55) s += 10;
  } else {
    if (c.ch24 >= -5 && c.ch24 <= 5) s += 12;
    if (c.ch14 >= -40 && c.ch14 <= 40) s += 10;
  }

  s += clamp((consistency - 70) * 0.25, 0, 10);
  s += clamp((performance - 70) * 0.25, 0, 10);

  return clamp(Math.round(s), 0, 100);
}

// table thresholds (jij gaat dit later 1-op-1 fine-tunen)
function passTable(side: Side, table: "RADAR"|"BUILDUP"|"ALMOST"|"ENTRY", c: any, st: CoinState, btc24: number) {
  const ob = st.obBitgetRatio;

  const obOkRadar = side === "bull" ? (ob != null && ob >= 1.0) : (ob != null && ob <= 1/1.5);
  const obOkBuil  = side === "bull" ? (ob != null && ob >= 1.5) : (ob != null && ob <= 1/2.0);
  const obOkAlm   = side === "bull" ? (ob != null && ob >= 2.0) : (ob != null && ob <= 1/2.5);
  const obOkEntry = side === "bull" ? (ob != null && ob >= 2.5) : (ob != null && ob <= 1/3.0);

  if (table === "ALMOST" && side === "bull" && btc24 < -2.2) return false;
  if (table === "ENTRY"  && side === "bull" && btc24 < -1.5) return false;

  if (table === "ALMOST" && side === "bear" && btc24 >= -0.5) return false;
  if (table === "ENTRY"  && side === "bear" && btc24 >= -1.0) return false;

  if (table === "RADAR") {
    const minScore = side === "bull" ? 68 : 72;
    if (st.score100 < minScore) return false;
    if (st.timing < 2) return false;
    if (!obOkRadar) return false;
    return true;
  }

  if (table === "BUILDUP") {
    const minScore = side === "bull" ? 76 : 80;
    const minVol   = side === "bull" ? 2_000_000 : 2_500_000;
    const minVm    = side === "bull" ? 0.30 : 0.35;
    const minWin   = side === "bull" ? 3 : 4;
    const minCons  = side === "bull" ? 80 : 85;
    const minPerf  = side === "bull" ? 80 : 85;

    if (st.score100 < minScore) return false;
    if (c.vol < minVol) return false;
    if (c.vm < minVm) return false;
    if (st.windowN < minWin) return false;
    if (st.consistency < minCons) return false;
    if (st.performance < minPerf) return false;
    if (st.timing < 2) return false;
    if (!obOkBuil) return false;
    return true;
  }

  if (table === "ALMOST") {
    const minScore = side === "bull" ? 86 : 90;
    const minVol   = side === "bull" ? 3_000_000 : 4_000_000;
    const minVm    = side === "bull" ? 0.32 : 0.38;
    const minWin   = side === "bull" ? 5 : 6;
    const minCons  = side === "bull" ? 88 : 90;
    const minPerf  = side === "bull" ? 88 : 90;

    if (st.score100 < minScore) return false;
    if (c.vol < minVol) return false;
    if (c.vm < minVm) return false;
    if (st.windowN < minWin) return false;
    if (st.consistency < minCons) return false;
    if (st.performance < minPerf) return false;
    if (st.timing < 3) return false;
    if (!obOkAlm) return false;
    if (st.volAccel < 1.2) return false;
    return true;
  }

  // ENTRY
  {
    const minScore = side === "bull" ? 90 : 92;
    const minVol   = side === "bull" ? 3_500_000 : 5_000_000;
    const minVm    = side === "bull" ? 0.35 : 0.40;
    const minWin   = side === "bull" ? 6 : 7;
    const minCons  = side === "bull" ? 90 : 92;
    const minPerf  = side === "bull" ? 90 : 92;

    if (st.score100 < minScore) return false;
    if (c.vol < minVol) return false;
    if (c.vm < minVm) return false;
    if (st.windowN < minWin) return false;
    if (st.consistency < minCons) return false;
    if (st.performance < minPerf) return false;
    if (st.timing < 3) return false;
    if (!obOkEntry) return false;
    if (st.volAccel < (side === "bull" ? 1.3 : 1.4)) return false;
    return true;
  }
}

function updateHistory(existing: CoinState | undefined, base: any, btc24: number, side: Side) {
  const t = Date.now();
  const c: CoinState = existing
    ? existing
    : {
        id: base.id,
        sym: base.sym,
        name: base.name,
        price: base.price,
        mcap: base.mcap,
        vol: base.vol,
        ch24: base.ch24,
        ch14: base.ch14,
        vm: base.vm,
        score100: 0,
        timing: 0,
        setup: "—",
        obBitgetRatio: null,
        obBinanceRatio: null,
        obConfirm: false,
        windowN: 0,
        scoreHist: [],
        timingHist: [],
        volHist: [],
        consistency: 0,
        performance: 0,
        volAccel: 1,
        stage: "RADAR",
        stageSince: t,
        lastSeen: t
      };

  // always update last snapshot
  c.sym = base.sym;
  c.name = base.name;
  c.price = base.price;
  c.mcap = base.mcap;
  c.vol = base.vol;
  c.ch24 = base.ch24;
  c.ch14 = base.ch14;
  c.vm = base.vm;
  c.lastSeen = t;

  // hist placeholders will be pushed after score/timing set
  return c;
}

function pushStats(c: CoinState) {
  keep(c.scoreHist, c.score100);
  keep(c.timingHist, c.timing);
  keep(c.volHist, c.vol);

  c.windowN = c.scoreHist.length;

  const good = c.scoreHist.filter(x => x >= 76).length;
  c.consistency = c.windowN ? (good / c.windowN) * 100 : 0;

  c.performance = clamp((avg(c.timingHist) / 4) * 100, 0, 100);

  const prev = c.volHist.slice(0, -1);
  const vAvg = avg(prev);
  const vLast = c.volHist[c.volHist.length - 1] ?? 0;
  c.volAccel = vAvg > 0 ? clamp(vLast / vAvg, 0, 9) : 1;
}

// ---------- public API ----------
export async function runScan(): Promise<GlobalState> {
  const st = await loadState();

  const btc24 = await fetchBTC24h();
  st.btc24 = btc24;

  const markets = await fetchMarkets4PagesUSD();
  const base = markets.map(baseFilter).filter(Boolean) as any[];

  await scanSide(st, "bull", btc24, base);
  await scanSide(st, "bear", btc24, base);

  // cleanup old
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  for (const side of ["bull", "bear"] as Side[]) {
    const bag = side === "bull" ? st.bull : st.bear;
    for (const id of Object.keys(bag)) {
      if (bag[id].lastSeen < cutoff) delete bag[id];
    }
  }

  await saveState(st);
  return st;
}

async function scanSide(st: GlobalState, side: Side, btc24: number, base: any[]) {
  const bag = side === "bull" ? st.bull : st.bear;

  const candidates = base.filter(c => sideRadarBandOk(side, c));
  candidates.sort((a, b) => b.vol - a.vol);
  const shortlist = candidates.slice(0, 140);

  for (const baseCoin of shortlist) {
    const symbol = baseCoin.sym + "USDT";

    // Bitget: must exist, otherwise skip
    let obBg: number | null = null;
    try {
      const ob = await fetchBitgetOrderbook(symbol, 100);
      obBg = ratioBitget(ob, 0.03);
      if (obBg == null) continue;
    } catch {
      continue;
    }

    // Binance: optional
    let obBn: number | null = null;
    let confirm = false;
    try {
      const ob2 = await fetchBinanceOrderbook(symbol, 100);
      obBn = ratioBinance(ob2, 0.03);
      if (side === "bull" && obBn != null && obBn >= 1.0) confirm = true;
      if (side === "bear" && obBn != null && obBn <= 1 / 1.5) confirm = true;
    } catch {
      // ignore (not listed)
    }

    const existing = bag[baseCoin.id];
    const c = updateHistory(existing, baseCoin, btc24, side);

    c.obBitgetRatio = obBg;
    c.obBinanceRatio = obBn;
    c.obConfirm = confirm;

    // first push old score/timing? -> we compute first using last accel from existing
    const accel = existing?.volAccel ?? 1;
    c.setup = setupDetect(side, baseCoin, accel);
    c.timing = timingScore(side, baseCoin, accel);

    // score uses existing consistency/perf first
    const cons = existing?.consistency ?? 0;
    const perf = existing?.performance ?? 0;
    c.score100 = score100(side, baseCoin, cons, perf);

    pushStats(c);

    // stage decision
    const inRadar = passTable(side, "RADAR", baseCoin, c, btc24);
    if (!inRadar) continue;

    const inBuil = passTable(side, "BUILDUP", baseCoin, c, btc24);
    const inAlm  = passTable(side, "ALMOST", baseCoin, c, btc24);
    const inEnt  = passTable(side, "ENTRY", baseCoin, c, btc24);

    let newStage: Stage = "RADAR";
    if (inEnt) newStage = "ENTRY";
    else if (inAlm) newStage = "ALMOST";
    else if (inBuil) newStage = "BUILDUP";
    else newStage = "RADAR";

    // ENTRY phases (simple)
    const oldStage = c.stage;
    if (oldStage === "ENTRY" && c.score100 >= 90 && c.timing >= 3) newStage = "HOLD";
    if (oldStage === "HOLD" && (c.score100 < 86 || c.timing < 2)) newStage = "SELL";
    if (oldStage === "SELL") {
      const age = Date.now() - c.stageSince;
      if (age < 3 * 60 * 60 * 1000) newStage = "SELL";
      else newStage = "RADAR";
    }

    if (newStage !== oldStage) {
      c.stage = newStage;
      c.stageSince = Date.now();
    }

    bag[baseCoin.id] = c;
  }
}

export async function getSnapshot(side: Side): Promise<any> {
  const st = await loadState();
  const bag = side === "bull" ? st.bull : st.bear;

  const rows = Object.values(bag).sort((a, b) => b.stageSince - a.stageSince);

  const radar = rows.filter(r => r.stage === "RADAR");
  const buildup = rows.filter(r => r.stage === "BUILDUP");
  const almost = rows.filter(r => r.stage === "ALMOST");
  const entry = rows.filter(r => r.stage === "ENTRY");
  const holdSell = rows.filter(r => r.stage === "HOLD" || r.stage === "SELL");

  const mode = st.btc24 > 0.5 ? "BULL" : st.btc24 < -0.5 ? "BEAR" : "BULL";

  return {
    side,
    mode,
    btc24: st.btc24,
    updatedAt: st.updatedAt,
    radar,
    buildup,
    almost,
    entry,
    holdSell,
    note: "Tip: open /api/scan om handmatig te scannen. Cron doet dit straks automatisch."
  };
}