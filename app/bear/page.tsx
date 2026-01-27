// app/bear/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function BearPage() {
  const [txt, setTxt] = useState<string>("Laden…");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/scan?side=bear&force=1", { cache: "no-store" });
        const j = await r.json();
        setTxt(JSON.stringify(j, null, 2));
      } catch (e: any) {
        setTxt(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <div style={{ padding: 18, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>CryptoCroc — BEAR</h1>
        <a href="/bull" style={{ opacity: 0.8 }}>BULL →</a>
      </div>
      <pre style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,.08)", padding: 12, borderRadius: 12 }}>
        {txt}
      </pre>
      <div style={{ opacity: 0.7, marginTop: 10 }}>
        (BEAR logica bouwen we daarna netjes uit zoals BULL.)
      </div>
    </div>
  );
}
