// app/bull/page.tsx
"use client";

import { useEffect, useState } from "react";

type CoinRow = {
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
  volAccel: number;

  stage: string;
  stageSince: number;
  lastSeen: number;
};

type Snapshot = {
  side: "bull" | "bear";
  mode: "BULL" | "BEAR";
  btc24: number;
  updatedAt: number;
  radar: CoinRow[];
  buildup: CoinRow[];
  almost: CoinRow[];
  entry: CoinRow[];
  holdSell: CoinRow[];
};

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "-";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)}%`;
}

function fmtRatio(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

function dateNice(ms: number) {
  if (!ms || !Number.isFinite(ms) || ms < 1000) return "Nog geen scan uitgevoerd";
  return new Date(ms).toLocaleString();
}

function TableBlock({ title, rows }: { title: string; rows: CoinRow[] }) {
  return (
    <div style={{ marginTop: 18, padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,.12)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <div style={{ opacity: 0.8, fontSize: 12 }}>{rows.length} coins</div>
      </div>

      {rows.length === 0 ? (
        <div style={{ opacity: 0.75, padding: 12, borderRadius: 10, border: "1px dashed rgba(255,255,255,.18)" }}>
          Nog leeg (wacht op scans / filters streng)
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ opacity: 0.9, textAlign: "left" }}>
                <th style={{ padding: "10px 8px" }}>Coin</th>
                <th style={{ padding: "10px 8px" }}>Score</th>
                <th style={{ padding: "10px 8px" }}>Timing</th>
                <th style={{ padding: "10px 8px" }}>Setup</th>
                <th style={{ padding: "10px 8px" }}>24h</th>
                <th style={{ padding: "10px 8px" }}>14d</th>
                <th style={{ padding: "10px 8px" }}>MCap</th>
                <th style={{ padding: "10px 8px" }}>Vol</th>
                <th style={{ padding: "10px 8px" }}>VM</th>
                <th style={{ padding: "10px 8px" }}>OB(BG)</th>
                <th style={{ padding: "10px 8px" }}>OB(BN)</th>
                <th style={{ padding: "10px 8px" }}>Win</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{r.sym}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>{r.name}</div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{r.score100}</td>
                  <td style={{ padding: "10px 8px" }}>{r.timing}/4</td>
                  <td style={{ padding: "10px 8px" }}>{r.setup}</td>
                  <td style={{ padding: "10px 8px" }}>{fmtPct(r.ch24)}</td>
                  <td style={{ padding: "10px 8px" }}>{fmtPct(r.ch14)}</td>
                  <td style={{ padding: "10px 8px" }}>{fmtMoney(r.mcap)}</td>
                  <td style={{ padding: "10px 8px" }}>{fmtMoney(r.vol)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.vm.toFixed(3)}</td>
                  <td style={{ padding: "10px 8px" }}>{fmtRatio(r.obBitgetRatio)}</td>
                  <td style={{ padding: "10px 8px" }}>{fmtRatio(r.obBinanceRatio)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.windowN}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 40 && <div style={{ opacity: 0.7, marginTop: 8 }}>Toont 40 / {rows.length}</div>}
        </div>
      )}
    </div>
  );
}

export default function BullPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/snapshot?side=bull", { cache: "no-store" });
      if (!r.ok) throw new Error(`snapshot failed: ${r.status}`);
      const j = (await r.json()) as Snapshot;
      setSnap(j);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function forceScan() {
    try {
      await fetch("/api/scan", { cache: "no-store" });
    } catch {}
    await load();
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <h1 style={{ margin: 0, fontSize: 34 }}>🐊 CryptoCroc — BULL</h1>

      <div style={{ marginTop: 10, opacity: 0.85 }}>
        BTC 24h: <b>{snap ? fmtPct(snap.btc24) : "-"}</b> — Mode: <b>{snap ? snap.mode : "-"}</b>
      </div>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Last scan: <b>{snap ? dateNice(snap.updatedAt) : "..."}</b>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button
          onClick={forceScan}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.18)",
            background: "rgba(0,0,0,.25)",
            color: "white"
          }}
        >
          Force scan
        </button>

        <button
          onClick={load}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.18)",
            background: "rgba(0,0,0,.12)",
            color: "white"
          }}
        >
          Refresh
        </button>
      </div>

      {loading && <div style={{ marginTop: 16, opacity: 0.8 }}>Laden…</div>}
      {err && (
        <div style={{ marginTop: 16, color: "#ffd1d1" }}>
          Error: {err}
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Check ook: <code>/api/scan</code> en <code>/api/snapshot?side=bull</code>
          </div>
        </div>
      )}

      {/* Altijd 5 tabellen renderen */}
      <TableBlock title="RADAR" rows={snap?.radar || []} />
      <TableBlock title="BUILDUP" rows={snap?.buildup || []} />
      <TableBlock title="ALMOST READY" rows={snap?.almost || []} />
      <TableBlock title="ENTRY" rows={snap?.entry || []} />
      <TableBlock title="HOLD / SELL" rows={snap?.holdSell || []} />
    </main>
  );
}