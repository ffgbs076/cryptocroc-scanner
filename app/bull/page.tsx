// app/bull/page.tsx
"use client";

import { useEffect, useState } from "react";

type CoinRow = {
  id: string; sym: string; name: string;
  score: number; timing: number; cons: number; perf: number;
  mcap: number; vol: number; ch24: number; volRatio: number;
  level: number; runnerHits: number;
};

type Tables = {
  radar: CoinRow[];
  buildup: CoinRow[];
  almost: CoinRow[];
  entry: CoinRow[];
  runner: CoinRow[];
};

export default function BullPage() {
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState<Tables | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fetchJson(url: string) {
    const r = await fetch(url, { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const txt = await r.text();
      throw new Error(`API gaf geen JSON terug. Eerste stuk: ${txt.slice(0, 80)}`);
    }
    return await r.json();
  }

  async function load(force = false) {
    setLoading(true);
    setErr(null);

    try {
      if (!force) {
        const snap = await fetchJson("/api/snapshot?side=bull");
        const snapData = snap?.data || null;

        if (!snapData?.tables) {
          return await load(true);
        }

        setTables(snapData.tables);
        return;
      }

      const scan = await fetchJson("/api/scan?side=bull&force=1");
      const scanData = scan?.data || null;

      if (!scanData?.tables) {
        setTables({ radar: [], buildup: [], almost: [], entry: [], runner: [] });
        return;
      }

      setTables(scanData.tables);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  function Table({ title, rows }: { title: string; rows: CoinRow[] }) {
    return (
      <div style={{ marginBottom: 18, padding: 14, border: "1px solid rgba(255,255,255,.12)", borderRadius: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{rows.length} coins</div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.8 }}>
                <th style={{ padding: "8px 6px" }}>Coin</th>
                <th style={{ padding: "8px 6px" }}>Score</th>
                <th style={{ padding: "8px 6px" }}>Timing</th>
                <th style={{ padding: "8px 6px" }}>Cons</th>
                <th style={{ padding: "8px 6px" }}>Perf</th>
                <th style={{ padding: "8px 6px" }}>24h%</th>
                <th style={{ padding: "8px 6px" }}>Vol/Mcap</th>
                <th style={{ padding: "8px 6px" }}>RunnerHits</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: "8px 6px" }}>
                    <b>{r.sym}</b> <span style={{ opacity: 0.7 }}>{r.name}</span>
                  </td>
                  <td style={{ padding: "8px 6px" }}>{r.score}</td>
                  <td style={{ padding: "8px 6px" }}>{r.timing}/4</td>
                  <td style={{ padding: "8px 6px" }}>{r.cons}%</td>
                  <td style={{ padding: "8px 6px" }}>{r.perf}%</td>
                  <td style={{ padding: "8px 6px" }}>{Number(r.ch24).toFixed(2)}</td>
                  <td style={{ padding: "8px 6px" }}>{Number(r.volRatio).toFixed(3)}</td>
                  <td style={{ padding: "8px 6px" }}>{r.runnerHits}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td style={{ padding: "10px 6px", opacity: 0.7 }} colSpan={8}>
                    Geen coins (nog). Laat de pinger 2-3 keer lopen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 18, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>CryptoCroc — BULL</h1>
        <button onClick={() => load(true)} disabled={loading} style={{ padding: "8px 10px" }}>
          Force scan
        </button>
        <a href="/bear" style={{ opacity: 0.8 }}>BEAR →</a>
      </div>

      {err && <div style={{ marginBottom: 12, color: "salmon" }}>{err}</div>}
      {loading && <div style={{ opacity: 0.7 }}>Laden…</div>}

      {!loading && tables && (
        <>
          <Table title="RADAR (Level 5)" rows={tables.radar} />
          <Table title="BUILDUP (Level 4)" rows={tables.buildup} />
          <Table title="ALMOST (Level 3)" rows={tables.almost} />
          <Table title="ENTRY (Level 2+1)" rows={tables.entry} />
          <Table title="RUNNER (los van trechter)" rows={tables.runner} />
        </>
      )}
    </div>
  );
}
