"use client";

import { useEffect, useState } from "react";

type ApiResult = {
  ok?: boolean;
  side?: string;
  scannedAt?: number;
  top10?: any[];
  error?: string;
};

export default function BearPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setErr(null);

      // ✅ scan-on-view: deze endpoint triggert scan en geeft resultaat terug
      const r = await fetch("/api/snapshot/bear?scan=1", { cache: "no-store" });

      const j = (await r.json()) as ApiResult;

      if (!r.ok || j?.ok === false) {
        throw new Error(j?.error || `API error (${r.status})`);
      }

      setData(j);
    } catch (e: any) {
      setErr(e?.message || "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      <h1>CryptoCroc — BEAR</h1>

      <div style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Laden..." : "Refresh (scan)"}
        </button>
      </div>

      {err && (
        <div style={{ padding: 12, background: "#ffe5e5", border: "1px solid #ffb3b3" }}>
          <b>Error:</b> {err}
        </div>
      )}

      {!err && loading && <div>Bezig met laden...</div>}

      {!err && !loading && (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, opacity: 0.8 }}>
            ok: {String(data?.ok)} | side: {data?.side} | scannedAt: {data?.scannedAt}
          </div>

          <h3>Raw JSON</h3>
          <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#eee", padding: 12 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
