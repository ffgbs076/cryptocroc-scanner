"use client";

import { useEffect, useState } from "react";

type Row = {
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
  consistency: number;
  performance: number;

  stage: string;
};

type Snapshot = {
  side: "bull" | "bear";
  mode: "BULL" | "BEAR";
  btc24: number;
  updatedAt: number;

  radar: Row[];
  buildup: Row[];
  almost: Row[];
  entry: Row[];
  holdSell: Row[];

  note?: string;
};

export default function BullPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/snapshot?side=bull", { cache: "no-store" });
      if (!r.ok) throw new Error("API error: " + r.status);
      setData(await r.json());
    } catch (e: any) {
      setErr(e?.message || "Unknown error");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const btc = data?.btc24 ?? 0;
  const btcBadge = data ? `BTC ${btc >= 0 ? "+" : ""}${btc.toFixed(2)}%` : "laden…";
  const badgeClass = !data ? "badge" : btc >= 0 ? "badge good" : "badge bad";

  return (
    <div className="container">
      <div className="topbar">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>CryptoCroc — BULL</div>
          <div className={badgeClass}>{btcBadge}</div>
          <div className="badge">{data?.updatedAt ? new Date(data.updatedAt).toLocaleString("nl-NL") : "…"}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a className="btn" href="/bear">Naar BEAR</a>
          <button className="btn" onClick={load}>Refresh</button>
          <a className="btn" href="/api/scan" target="_blank" rel="noreferrer">Run scan</a>
        </div>
      </div>

      {err && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Error</h2>
          <div style={{ padding: 14 }} className="small">{err}</div>
        </div>
      )}

      {data?.note && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Note</h2>
          <div style={{ padding: 14 }} className="small">{data.note}</div>
        </div>
      )}

      <div className="grid">
        <TableCard title="RADAR" rows={data?.radar || []} />
        <TableCard title="BUILDUP" rows={data?.buildup || []} />
        <TableCard title="ALMOST READY" rows={data?.almost || []} />
        <TableCard title="ENTRY" rows={data?.entry || []} />
        <TableCard title="HOLD / SELL" rows={data?.holdSell || []} />
      </div>
    </div>
  );
}

function TableCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="card">
      <h2>
        <span>{title}</span>
        <span className="small">{rows.length} coins</span>
      </h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Coin</th>
              <th>Price</th>
              <th>MCap</th>
              <th>Vol</th>
              <th>VM</th>
              <th>24h</th>
              <th>14d</th>
              <th>Score</th>
              <th>Timing</th>
              <th>Setup</th>
              <th>OB Bitget</th>
              <th>OB Binance</th>
              <th>Confirm</th>
              <th>WindowN</th>
              <th>Cons</th>
              <th>Perf</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 800 }}>{r.sym}</div>
                  <div className="small">{r.name}</div>
                </td>
                <td>${fmt(r.price)}</td>
                <td>${fmtBig(r.mcap)}</td>
                <td>${fmtBig(r.vol)}</td>
                <td>{(r.vm ?? 0).toFixed(2)}</td>
                <td>{pct(r.ch24)}</td>
                <td>{pct(r.ch14)}</td>
                <td><span className={scorePill(r.score100)}>{r.score100}</span></td>
                <td>{r.timing}/4</td>
                <td>{r.setup}</td>
                <td>{r.obBitgetRatio == null ? "—" : r.obBitgetRatio.toFixed(2) + "x"}</td>
                <td>{r.obBinanceRatio == null ? "—" : r.obBinanceRatio.toFixed(2) + "x"}</td>
                <td>{r.obConfirm ? <span className="pill good">YES</span> : <span className="pill">NO</span>}</td>
                <td>{r.windowN}</td>
                <td>{Math.round(r.consistency)}%</td>
                <td>{Math.round(r.performance)}%</td>
                <td>{r.stage}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={17} className="small" style={{ padding: 14 }}>Geen coins in deze tabel.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}
function fmtBig(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
}
function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  const s = v >= 0 ? "+" : "";
  return s + v.toFixed(2) + "%";
}
function scorePill(score: number) {
  if (score >= 90) return "pill good";
  if (score >= 80) return "pill warn";
  return "pill";
}