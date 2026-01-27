"use client";

import { useEffect, useState } from "react";

type CoinRow = {
  id?: string;
  sym?: string;
  name?: string;

  // jouw scanner velden (maakt niet uit als sommige ontbreken)
  score?: number;
  timing?: number;
  cons?: number;
  perf?: number;

  mcap?: number;
  vol?: number;
  ch24?: number;
  volRatio?: number;

  level?: number;
  runnerHits?: number;

  // eventuele andere velden die jouw API terugstuurt
  [key: string]: any;
};

type ApiTables = {
  entry?: CoinRow[];
  almost?: CoinRow[];
  buildup?: CoinRow[];
  radar?: CoinRow[];
  runner?: CoinRow[];
};

type ApiStats = {
  totalScanned?: number;
  entry?: number;
  almost?: number;
  buildup?: number;
  radar?: number;
  runner?: number;
  [key: string]: any;
};

type ApiResponse = {
  ok?: boolean;
  side?: string;
  ts?: number;
  data?: {
    ts?: number;
    tables?: ApiTables;
    stats?: ApiStats;
  } | null;

  // sommige versies sturen direct tables/stats op root
  tables?: ApiTables;
  stats?: ApiStats;
};

const API_ENDPOINT = "/api/top10";

function safeNum(n: any) {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function fmtMoney(n: any) {
  const v = safeNum(n);
  if (v === null) return "-";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(0);
}

function fmtPct(n: any) {
  const v = safeNum(n);
  if (v === null) return "-";
  return v.toFixed(2) + "%";
}

function fmtPrice(n: any) {
  const v = safeNum(n);
  if (v === null) return "-";
  // simpele prijs formatting
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(6);
  return v.toPrecision(4);
}

function safeDate(ts: any) {
  const v = safeNum(ts);
  if (v === null) return "Nog niet gescand";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Nog niet gescand";
  return d.toLocaleString();
}

function normalizeTables(json: ApiResponse): Required<ApiTables> {
  const tables = json?.data?.tables ?? json?.tables ?? {};
  return {
    entry: Array.isArray(tables.entry) ? tables.entry : [],
    almost: Array.isArray(tables.almost) ? tables.almost : [],
    buildup: Array.isArray(tables.buildup) ? tables.buildup : [],
    radar: Array.isArray(tables.radar) ? tables.radar : [],
    runner: Array.isArray(tables.runner) ? tables.runner : [],
  };
}

function normalizeStats(json: ApiResponse): ApiStats {
  return json?.data?.stats ?? json?.stats ?? {};
}

async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await r.text();
    throw new Error(`API gaf geen JSON terug. Eerste stuk:\n${txt.slice(0, 250)}`);
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`API error ${r.status}: ${JSON.stringify(j).slice(0, 250)}`);
  }
  return (await r.json()) as ApiResponse;
}

function TableBlock({
  title,
  rows,
}: {
  title: string;
  rows: CoinRow[];
}) {
  return (
    <div style={styles.block}>
      <div style={styles.blockHeader}>
        <div style={styles.blockTitle}>{title}</div>
        <div style={styles.badge}>{rows.length}</div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Symbol</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Score</th>
              <th style={styles.th}>24h%</th>
              <th style={styles.th}>Mcap</th>
              <th style={styles.th}>Vol</th>
              <th style={styles.th}>VM</th>
              <th style={styles.th}>Price</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={9}>
                  Nog geen coins in deze tabel
                </td>
              </tr>
            ) : (
              rows.map((c, i) => (
                <tr key={(c.id || c.sym || c.name || "row") + "-" + i}>
                  <td style={styles.td}>{i + 1}</td>
                  <td style={styles.td}>{(c.sym || "-").toUpperCase()}</td>
                  <td style={styles.td}>{c.name || "-"}</td>
                  <td style={styles.td}>{safeNum(c.score) ?? "-"}</td>
                  <td style={styles.td}>{fmtPct(c.ch24)}</td>
                  <td style={styles.td}>{fmtMoney(c.mcap)}</td>
                  <td style={styles.td}>{fmtMoney(c.vol)}</td>
                  <td style={styles.td}>
                    {safeNum(c.volRatio) === null ? "-" : c.volRatio.toFixed(2)}
                  </td>
                  <td style={styles.td}>{fmtPrice(c.price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BullPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [raw, setRaw] = useState<ApiResponse | null>(null);

  const tables = raw ? normalizeTables(raw) : null;
  const stats = raw ? normalizeStats(raw) : null;

  const lastScan = raw?.ts ?? raw?.data?.ts;

  async function load(force = false) {
    setErr(null);
    setLoading(true);
    try {
      const url = force ? `${API_ENDPOINT}?force=1` : API_ENDPOINT;
      const j = await fetchJson(url);
      setRaw(j);
    } catch (e: any) {
      setErr(e?.message || "Onbekende fout");
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.h1}>🐊 CryptoCroc — BULL</div>
        <div style={styles.sub}>Last scan: {safeDate(lastScan)}</div>

        <div style={styles.actions}>
          <button
            style={styles.btn}
            onClick={() => load(true)}
            disabled={loading}
          >
            Force scan
          </button>

          <a style={styles.link} href="/bear">
            Naar BEAR →
          </a>
        </div>

        {stats && (
          <div style={styles.statsRow}>
            <div style={styles.statChip}>Total: {stats.totalScanned ?? 0}</div>
            <div style={styles.statChip}>Entry: {stats.entry ?? 0}</div>
            <div style={styles.statChip}>Almost: {stats.almost ?? 0}</div>
            <div style={styles.statChip}>Buildup: {stats.buildup ?? 0}</div>
            <div style={styles.statChip}>Radar: {stats.radar ?? 0}</div>
            <div style={styles.statChip}>Runner: {stats.runner ?? 0}</div>
          </div>
        )}
      </div>

      {err && <div style={styles.error}>❌ {err}</div>}

      {!tables ? (
        <div style={styles.block}>
          {loading ? "Laden..." : "Geen data (nog niet gescand of fout)."}
        </div>
      ) : (
        <>
          <TableBlock title="1) ENTRY READY" rows={tables.entry} />
          <TableBlock title="2) ALMOST READY" rows={tables.almost} />
          <TableBlock title="3) BUILDUP" rows={tables.buildup} />
          <TableBlock title="4) RADAR" rows={tables.radar} />
          <TableBlock title="5) RUNNER ALERT" rows={tables.runner} />
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 18,
    background: "radial-gradient(1200px 800px at 20% 10%, #0b3b2a 0%, #061f16 45%, #04150f 100%)",
    color: "rgba(255,255,255,.92)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  header: {
    maxWidth: 980,
    margin: "0 auto 14px auto",
  },
  h1: {
    fontSize: 34,
    fontWeight: 800,
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  sub: {
    opacity: 0.75,
    marginBottom: 12,
  },
  actions: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  btn: {
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.25)",
    color: "white",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
  },
  link: {
    color: "rgba(255,255,255,.9)",
    textDecoration: "none",
    opacity: 0.9,
  },
  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  statChip: {
    border: "1px solid rgba(255,255,255,.14)",
    background: "rgba(0,0,0,.22)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 13,
  },
  error: {
    maxWidth: 980,
    margin: "0 auto 12px auto",
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,0,0,.12)",
    border: "1px solid rgba(255,0,0,.25)",
  },
  block: {
    maxWidth: 980,
    margin: "0 auto 14px auto",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.14)",
    background: "rgba(0,0,0,.22)",
    padding: 12,
    overflow: "hidden",
  },
  blockHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: 800,
    opacity: 0.95,
  },
  badge: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.16)",
    background: "rgba(0,0,0,.22)",
  },
  tableWrap: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "10px 8px",
    borderBottom: "1px solid rgba(255,255,255,.12)",
    opacity: 0.85,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 8px",
    borderBottom: "1px solid rgba(255,255,255,.08)",
    whiteSpace: "nowrap",
    opacity: 0.95,
  },
};