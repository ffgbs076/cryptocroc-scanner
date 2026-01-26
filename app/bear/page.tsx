k"use client";

import { useEffect, useState } from "react";

type TopItem = {
  rank: number;
  symbol: string;
  price: number;
  vol24hUsd: number;
  mcUsd: number | null;
  vmRatio: number | null;
  pct14d: number;
  score: number;
};

type ScanResp = {
  ok: true;
  side: "bull" | "bear";
  scannedAt: number;
  top10: TopItem[];
};

function fmt(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function BearPage() {
  const [data, setData] = useState<ScanResp | null>(null);
  const [err, setErr] = useState<string>("");

  async function load() {
    setErr("");
    try {
      const r = await fetch("/api/scan?side=bear", { cache: "no-store" });
      const j = (await r.json()) as any;
      if (!j?.ok) throw new Error(j?.error || "unknown");
      setData(j as ScanResp);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const items = data?.top10 || [];

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "white" }}>
      <h1 style={{ fontSize: 26, marginBottom: 10 }}>🐊 CryptoCroc — BEAR Top10 (14D)</h1>

      <div style={{ opacity: 0.8, marginBottom: 12 }}>
        {err ? `Error: ${err}` : data ? `Last scan: ${new Date(data.scannedAt).toLocaleString()}` : "Loading..."}
      </div>

      <button
        onClick={() => fetch("/api/scan?side=bear&scan=1", { cache: "no-store" }).then(load)}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.2)",
          background: "rgba(0,0,0,.25)",
          color: "white",
          cursor: "pointer",
          marginBottom: 14,
        }}
      >
        Force scan
      </button>

      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "rgba(255,255,255,.06)" }}>
              <th style={{ padding: 10 }}>#</th>
              <th style={{ padding: 10 }}>Symbol</th>
              <th style={{ padding: 10 }}>14D%</th>
              <th style={{ padding: 10 }}>Price</th>
              <th style={{ padding: 10 }}>24h Vol (USD)</th>
              <th style={{ padding: 10 }}>MarketCap</th>
              <th style={{ padding: 10 }}>VM Ratio</th>
              <th style={{ padding: 10 }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.symbol} style={{ borderTop: "1px solid rgba(255,255,255,.10)" }}>
                <td style={{ padding: 10 }}>{it.rank}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{it.symbol}</td>
                <td style={{ padding: 10 }}>{fmt(it.pct14d)}%</td>
                <td style={{ padding: 10 }}>${fmt(it.price)}</td>
                <td style={{ padding: 10 }}>${fmt(it.vol24hUsd)}</td>
                <td style={{ padding: 10 }}>{it.mcUsd ? `$${fmt(it.mcUsd)}` : "-"}</td>
                <td style={{ padding: 10 }}>{it.vmRatio ?? "-"}</td>
                <td style={{ padding: 10 }}>{fmt(it.score)}</td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={8} style={{ padding: 14, opacity: 0.8 }}>
                  Nog geen top10 (filters zijn streng of data ontbreekt). Klik “Force scan”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

