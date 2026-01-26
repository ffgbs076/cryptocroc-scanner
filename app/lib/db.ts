import Database from "better-sqlite3"
import path from "path"

const dbPath = path.join(process.cwd(), "cryptocroc.db")
export const db = new Database(dbPath)

db.exec(`
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  side TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshotId INTEGER NOT NULL,
  side TEXT NOT NULL,
  symbol TEXT NOT NULL,
  rank INTEGER NOT NULL,
  liveScore INTEGER NOT NULL,
  momentum INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_side_createdAt ON snapshots(side, createdAt);
CREATE INDEX IF NOT EXISTS idx_items_symbol_createdAt ON snapshot_items(symbol, createdAt);
`)

export function insertSnapshot(side: "bull" | "bear", items: { symbol: string; liveScore: number; momentum: number }[]) {
  const now = Date.now()
  const insSnap = db.prepare(INSERT INTO snapshots(side, createdAt) VALUES(?, ?))
  const insItem = db.prepare(`
    INSERT INTO snapshot_items(snapshotId, side, symbol, rank, liveScore, momentum, createdAt)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `)

  const snapId = insSnap.run(side, now).lastInsertRowid as number
  const top10 = items.slice(0, 10)

  top10.forEach((it, idx) => {
    insItem.run(snapId, side, it.symbol, idx + 1, it.liveScore, it.momentum, now)
  })

  return snapId
}

export function getTop10Counts14d(side: "bull" | "bear") {
  const since = Date.now() - 14 * 24 * 60 * 60 * 1000
  const rows = db
    .prepare(
      `
      SELECT symbol, COUNT(*) as hits
      FROM snapshot_items
      WHERE side = ? AND createdAt >= ?
      GROUP BY symbol
      ORDER BY hits DESC
    `
    )
    .all(side, since) as { symbol: string; hits: number }[]

  const map = new Map<string, number>()
  for (const r of rows) map.set(r.symbol, r.hits)
  return map
}

export function shouldSnapshot(side: "bull" | "bear", refreshMins = 30) {
  const row = db
    .prepare(SELECT createdAt FROM snapshots WHERE side = ? ORDER BY createdAt DESC LIMIT 1)
    .get(side) as { createdAt?: number } | undefined

  if (!row?.createdAt) return true
  return Date.now() - row.createdAt >= refreshMins * 60_000
}
