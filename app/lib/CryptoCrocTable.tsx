"use client"

import { useMemo, useState } from "react"

export type Row = {
  symbol: string

  score: number
  tpPct?: number
  tpPrice?: number
  horizon?: string
  btcContext?: "BULL" | "BEAR" | "NEUTRAL"

  // nieuwe duidelijke signalen
  signal?: "INSTAP KLAAR" | "WACHTEN" | "NIET DOEN"

  // 10 filters (0–10)
  liq?: number
  mcap?: number
  supply?: number
  shorts?: number
  noRetail?: number
  news?: number
  compress?: number
  volSpike?: number
  context?: number
  ob?: number

  // marktdata
  markPrice?: number
  fundingRate?: number
  change24hPct?: number
  vol24hQuote?: number

  // history / momentum (client)
  top10Hits14d?: number
  top10Rate14d?: number
  momentumScore?: number
  historyWeight?: number
}

function fmt(n?: number, digits = 0) {
  if (n == null || !Number.isFinite(n)) return "—"
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}
function fmtPct(n?: number, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(digits)}%`
}
function fmtFunding(n?: number) {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${(n * 100).toFixed(4)}%`
}

function badge(sig?: string){
  if(sig === "INSTAP KLAAR") return "cc-badge confirm"
  if(sig === "NIET DOEN") return "cc-badge conflict"
  return "cc-badge lean" // WACHTEN
}

function ctxDot(ctx?: string){
  if(ctx === "BEAR") return "cc-dot bear"
  if(ctx === "NEUTRAL") return "cc-dot neutral"
  return "cc-dot bull"
}

export default function CryptoCrocTable(props:{
  title: string
  subtitle: string
  rows: Row[]
  onRefresh?: ()=>void
  refreshLabel?: string
}){
  const { title, subtitle, rows, onRefresh, refreshLabel = "Refresh" } = props
  const [q, setQ] = useState("")

  const filtered = useMemo(()=>{
    const s = q.trim().toUpperCase()
    if(!s) return rows
    return rows.filter(r => r.symbol.toUpperCase().includes(s))
  }, [q, rows])

  const btcCtx = rows?.[0]?.btcContext ?? "NEUTRAL"

  return (
    <div className="cc-page">
      <div className="cc-header">
        <div className="cc-brand">
          <div className="cc-croc">🐊</div>
          <div>
            <div className="cc-title">{title}</div>
            <div className="cc-sub">{subtitle}</div>
          </div>
        </div>

        <div className="cc-controls">
          <div className="cc-chip">
            <span className={ctxDot(btcCtx)} />
            <span>BTC: <b>{btcCtx}</b></span>
          </div>

          <input
            className="cc-input"
            placeholder="Zoek coin…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />

          <button className="cc-btn" onClick={onRefresh}>{refreshLabel}</button>

          <div className="cc-chip">
            <b>{filtered.length}</b>&nbsp;coins
          </div>
        </div>
      </div>

      <div className="cc-card">
        <table className="cc-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Coin</th>
              <th>Momentum</th>
              <th className="cc-mini">Live</th>
              <th>Top10 14d</th>

              <th>Mark</th>
              <th>24h%</th>
              <th>Vol 24h</th>
              <th>Funding</th>

              <th>TP%</th>
              <th>TP prijs</th>
              <th>Horizon</th>
              <th>Actie</th>

              <th>Liq</th><th>Mcap</th><th>Supply</th><th>Shorts</th><th>NoRetail</th>
              <th>News</th><th>Compress</th><th>Vol spike</th><th>Context</th><th>OB</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((r, i)=> {
              const mom = Math.round(r.momentumScore ?? r.score)
              const ch = r.change24hPct
              const chClass = ch == null ? "" : (ch >= 0 ? "cc-pos" : "cc-neg")

              return (
                <tr key={r.symbol}>
                  <td className="cc-rank">{i+1}</td>

                  <td>
                    <div className="cc-coin">{r.symbol}</div>
                    <div className="cc-mini">CryptoCroc scan</div>
                  </td>

                  <td>
                    <span className={"cc-score " + (mom >= 70 ? "hot" : mom >= 60 ? "good" : "mid")}>
                      {mom}
                    </span>
                  </td>

                  <td className="cc-mini">{Math.round(r.score)}</td>

                  <td>
                    {r.top10Hits14d != null
                      ? <span className="cc-pill"><b>{r.top10Hits14d}</b>&nbsp;<span className="cc-mini">({Math.round((r.top10Rate14d ?? 0)*100)}%)</span></span>
                      : "—"
                    }
                  </td>

                  <td>{fmt(r.markPrice, 6)}</td>
                  <td className={chClass}>{fmtPct(ch, 2)}</td>
                  <td>{r.vol24hQuote == null ? "—" : `$${fmt(r.vol24hQuote, 0)}`}</td>
                  <td>{fmtFunding(r.fundingRate)}</td>

                  <td>{r.tpPct != null ? `${Math.round(r.tpPct)}%` : "—"}</td>
                  <td>{r.tpPrice != null ? fmt(r.tpPrice, 8) : "—"}</td>
                  <td>{r.horizon ?? "—"}</td>
                  <td><span className={badge(r.signal)}>{r.signal ?? "WACHTEN"}</span></td>

                  <td>{r.liq ?? 0}</td>
                  <td>{r.mcap ?? 0}</td>
                  <td>{r.supply ?? 0}</td>
                  <td>{r.shorts ?? 0}</td>
                  <td>{r.noRetail ?? 0}</td>
                  <td>{r.news ?? 0}</td>
                  <td>{r.compress ?? 0}</td>
                  <td>{r.volSpike ?? 0}</td>
                  <td>{r.context ?? 0}</td>
                  <td>{r.ob ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
