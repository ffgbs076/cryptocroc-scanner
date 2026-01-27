export default function Home() {
  return (
    <div className="container">
      <div className="topbar">
        <div style={{ fontWeight: 800 }}>CryptoCroc Scanner</div>
        <div className="badge">Bull / Bear</div>
      </div>

      <div className="grid">
        <div className="card">
          <h2><span>BULL</span><span className="small">Small caps die kunnen stijgen</span></h2>
          <div style={{ padding: 14, display: "flex", gap: 10 }}>
            <a className="btn" href="/bull">Open BULL</a>
          </div>
        </div>

        <div className="card">
          <h2><span>BEAR</span><span className="small">Small caps die kunnen zakken</span></h2>
          <div style={{ padding: 14, display: "flex", gap: 10 }}>
            <a className="btn" href="/bear">Open BEAR</a>
          </div>
        </div>
      </div>
    </div>
  );
}