"use client";

import { useEffect, useState } from "react";

type Row = any;
type Snapshot = any;

export default function BearPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/snapshot?side=bear", { cache: "no-store" });
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
          <div style={{ fontWeight: 800 }}>CryptoCroc — BEAR</div>
          <div className={badgeClass}>{btcBadge}</div>
          <div className="badge">{data?.updatedAt ? new Date(data.updatedAt).toLocaleString("nl-NL") : "…"}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a className="btn" href="/bull">Naar BULL</a>
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

      <div className="grid">
        <pre className="card" style={{ padding: 14, overflow: "auto" }}>
          {data ? JSON.stringify(data, null, 2) : "laden…"}
        </pre>
      </div>
    </div>
  );
}