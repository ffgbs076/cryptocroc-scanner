import { Coin, FuturesMeta, BtcContext, CandleMeta, usd, pct, scoreBear } from "../lib/scoring";
import { fetchJsonCached } from "../lib/fetchJson";
import { getCandleFeatures } from "../lib/marketFeatures";
import { getGlobalLongShortRatio } from "../lib/futuresExtras";

export const dynamic = "force-dynamic";

type FuturesMarkRow = { symbol: string; markPrice: string; lastFundingRate: string };
type ExchangeInfo = { symbols: Array<{ symbol: string; status: string; contractType: string; quoteAsset: string }> };

async function getCoins(): Promise<Coin[]> {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd&order=volume_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h";
  return fetchJsonCached(url, { ttlMs: 90_000, retries: 2 });
}

async function getBTCContext(): Promise<BtcContext> {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h,7d";
  try {
    const arr: any[] = await fetchJsonCached(url, { ttlMs: 90_000, retries: 2 });
    const b = arr?.[0];
    return { btc24: Number(b?.price_change_percentage_24h ?? 0), btc7d: Number(b?.price_change_percentage_7d_in_currency ?? 0) };
  } catch {
    return { btc24: 0, btc7d: 0 };
  }
}

async function getFuturesSymbolsSet(): Promise<Set<string>> {
  const url = "https://fapi.binance.com/fapi/v1/exchangeInfo";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return new Set();
  const data = (await res.json()) as ExchangeInfo;

  const out = new Set<string>();
  for (const s of data.symbols) {
    if (s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT") out.add(s.symbol);
  }
  return out;
}

async function getPremiumIndexMap(): Promise<Map<string, { mark: number; funding: number }>> {
  const url = "https://fapi.binance.com/fapi/v1/premiumIndex";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return new Map();
  const arr = (await res.json()) as FuturesMarkRow[];
  const map = new Map<string, { mark: number; funding: number }>();
  for (const r of arr) {
    const mark = Number(r.markPrice);
    const funding = Number(r.lastFundingRate);
    if (isFinite(mark) && isFinite(funding)) map.set(r.symbol, { mark, funding });
  }
  return map;
}

async function getOpenInterest(symbol: string): Promise<number | null> {
  const url = "https://fapi.binance.com/fapi/v1/openInterest?symbol=" + encodeURIComponent(symbol);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  const oi = Number(data?.openInterest);
  return isFinite(oi) ? oi : null;
}

function guessFuturesSymbol(coinSymbol: string) {
  return coinSymbol.toUpperCase() + "USDT";
}

export default async function BearPage() {
  let coins: Coin[] = [];
  let btc: BtcContext = { btc24: 0, btc7d: 0 };

  try {
    coins = await getCoins();
    btc = await getBTCContext();
  } catch {
    coins = [];
  }

  const [futSet, premMap] = await Promise.all([getFuturesSymbolsSet(), getPremiumIndexMap()]);

  const MIN_MCAP = 10_000_000;
  const MIN_VOL = 2_000_000;

  const pre = coins
    .filter(c => (c.market_cap ?? 0) >= MIN_MCAP)
    .filter(c => (c.total_volume ?? 0) >= MIN_VOL)
    .map(c => {
      const futSym = guessFuturesSymbol(c.symbol);
      const hasFut = futSet.has(futSym);
      const prem = hasFut ? premMap.get(futSym) : undefined;

      const fut: FuturesMeta = {
        hasFutures: hasFut,
        futuresSymbol: hasFut ? futSym : null,
        fundingRate: prem ? prem.funding : null,
        oiUsd: null,
        oiToMcap: null,
        longShortRatio: null,
      };

      const scored = scoreBear(c, fut, btc);
      return { coin: c, baseScore: scored.score, fut };
    })
    .sort((a, b) => b.baseScore - a.baseScore);

  const ENRICH = 30;
  const shortlist = pre.slice(0, ENRICH);

  const rows: any[] = [];

  for (const item of shortlist) {
    const c: Coin = item.coin;
    const mcap = c.market_cap ?? 0;

    let fut = item.fut as FuturesMeta;
    let candles: CandleMeta | undefined = undefined;

    candles = await getCandleFeatures(c.symbol.toUpperCase());

    if (fut.hasFutures && fut.futuresSymbol) {
      const sym = fut.futuresSymbol;
      const prem = premMap.get(sym);
      const oi = await getOpenInterest(sym);
      const lsr = await getGlobalLongShortRatio(sym);

      if (prem && oi !== null) {
        const oiUsd = oi * prem.mark;
        fut = {
          ...fut,
          fundingRate: prem.funding,
          oiUsd,
          oiToMcap: mcap > 0 ? oiUsd / mcap : null,
          longShortRatio: lsr,
        };
      } else {
        fut = { ...fut, longShortRatio: lsr };
      }
    }

    const scored = scoreBear(c, fut, btc, candles);

    rows.push({
      coin: c,
      score: scored.score,
      reasons: scored.reasons,
      futuresSymbol: fut.futuresSymbol,
      fundingPct: fut.fundingRate === null ? null : fut.fundingRate * 100,
      oiUsd: fut.oiUsd,
      lsr: fut.longShortRatio,
      bbWidth: candles?.bbWidth ?? null,
      volSpike: candles?.volSpike ?? null,
      btc24: btc.btc24,
      btc7d: btc.btc7d,
    });
  }

  rows.sort((a, b) => b.score - a.score);

  return (
    <div style={{ background: "black", color: "white", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>BEAR</h1>
            <p style={{ marginTop: 8, color: "#b3b3b3" }}>
              Verwachting-score (candles + futures) • BTC 24h {pct(btc.btc24)} • 7d {pct(btc.btc7d)}
            </p>
            {coins.length === 0 && (
              <p style={{ marginTop: 8, color: "#f59e0b" }}>
                CoinGecko is tijdelijk druk (429). Wacht 1 minuut en refresh.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/" style={{ color: "white", textDecoration: "none", border: "1px solid #333", padding: "10px 14px", borderRadius: 8 }}>← Home</a>
            <a href="/bull" style={{ color: "white", textDecoration: "none", border: "1px solid #333", padding: "10px 14px", borderRadius: 8 }}>Bull →</a>
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #222", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ background: "#0f0f0f", padding: 12, fontWeight: 800 }}>
            Top {rows.length} (diep geanalyseerd)
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0b0b0b", color: "#cfcfcf", textAlign: "left" }}>
                  <th style={{ padding: 12 }}>Coin</th>
                  <th style={{ padding: 12 }}>Score</th>
                  <th style={{ padding: 12 }}>MCAP</th>
                  <th style={{ padding: 12 }}>Vol 24h</th>
                  <th style={{ padding: 12 }}>Funding</th>
                  <th style={{ padding: 12 }}>LSR</th>
                  <th style={{ padding: 12 }}>OI (USD)</th>
                  <th style={{ padding: 12 }}>BB width</th>
                  <th style={{ padding: 12 }}>Vol spike</th>
                  <th style={{ padding: 12 }}>Filters</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r: any) => {
                  const c: Coin = r.coin;
                  const scoreColor = r.score >= 80 ? "#ef4444" : "white";
                  const fundingColor = r.fundingPct !== null && r.fundingPct > 0 ? "#ef4444" : "#b3b3b3";
                  const lsrColor = r.lsr !== null && r.lsr > 1 ? "#ef4444" : "#b3b3b3";

                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid #222" }}>
                      <td style={{ padding: 12 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <img src={c.image} width={20} height={20} style={{ borderRadius: 999 }} alt="" />
                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {c.symbol.toUpperCase()} <span style={{ color: "#9a9a9a", fontWeight: 600 }}>• {c.name}</span>
                            </div>
                            <div style={{ color: "#777", fontSize: 12 }}>
                              Futures: {r.futuresSymbol ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: 12, fontWeight: 900, color: scoreColor }}>{r.score}</td>
                      <td style={{ padding: 12 }}>{usd(c.market_cap)}</td>
                      <td style={{ padding: 12 }}>{usd(c.total_volume)}</td>
                      <td style={{ padding: 12, color: fundingColor }}>{r.fundingPct === null ? "—" : r.fundingPct.toFixed(4) + "%"}</td>
                      <td style={{ padding: 12, color: lsrColor }}>{r.lsr === null ? "—" : r.lsr.toFixed(2)}</td>
                      <td style={{ padding: 12 }}>{r.oiUsd === null ? "—" : usd(r.oiUsd)}</td>
                      <td style={{ padding: 12 }}>{r.bbWidth === null ? "—" : r.bbWidth.toFixed(4)}</td>
                      <td style={{ padding: 12 }}>{r.volSpike === null ? "—" : r.volSpike.toFixed(2) + "x"}</td>
                      <td style={{ padding: 12, color: "#ef4444", fontSize: 12 }}>{r.reasons.join(" • ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ marginTop: 14, color: "#777", fontSize: 12 }}>
          Tip: Top 30 is expres — anders te veel API calls.
        </p>
      </div>
    </div>
  );
}
