export default function Home() {
  return (
    <main style={{ padding: 24, color: "white" }}>
      <h1 style={{ fontSize: 28 }}>🐊 CryptoCroc</h1>
      <p style={{ opacity: 0.8 }}>Kies een dashboard:</p>
      <ul>
        <li><a href="/bull" style={{ color: "white" }}>Bull Top10</a></li>
        <li><a href="/bear" style={{ color: "white" }}>Bear Top10</a></li>
      </ul>
    </main>
  );
}
