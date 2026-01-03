export default function Home() {
  return (
    <div style={{ background: "black", color: "white", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>CryptoCroc Scanner</h1>
        <p style={{ color: "#b3b3b3", marginTop: 8 }}>
          Bull = beste kans op flinke stijging • Bear = meeste kans op crash
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          <a href="/bull" style={{ color: "white", textDecoration: "none", border: "1px solid #333", padding: "12px 16px", borderRadius: 10 }}>
            🟢 Bull
          </a>
          <a href="/bear" style={{ color: "white", textDecoration: "none", border: "1px solid #333", padding: "12px 16px", borderRadius: 10 }}>
            🔴 Bear
          </a>
        </div>

        <div style={{ marginTop: 18, color: "#777", fontSize: 12, lineHeight: 1.6 }}>
          <div><b>9 filters (kern):</b> Market cap • Liquiditeit • Supply • Futures (Funding+OI) • Retail crowding • Surprise • Compressie • Volume • BTC context</div>
          <div>Coins met Binance USDT Futures krijgen “echte” futures-score. Zonder futures gebruiken we een veilige proxy.</div>
        </div>
      </div>
    </div>
  );
}
