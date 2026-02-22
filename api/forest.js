export const config = { runtime: "nodejs" };

const fetchFn = globalThis.fetch;

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) prev = v;
    else prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  const q = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    q.push(v);
    sum += v;
    if (q.length > period) sum -= q.shift();
    if (q.length === period) out[i] = sum / period;
  }
  return out;
}

// Wilder RSI (stabiel)
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;

  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;

    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;

    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// ==== CoinGecko daily closes -> build weekly OHLC ====
async function fetchDailyCloses(days = 2000) {
  const url =
    `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;

  const r = await fetchFn(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "btc-forest-tv"
    }
  });

  if (!r.ok) throw new Error(`CoinGecko error: ${r.status}`);

  const j = await r.json();
  if (!j?.prices || !Array.isArray(j.prices) || j.prices.length < 10) {
    throw new Error("CoinGecko returned no prices");
  }

  // prices: [ [ms, price], ... ]
  return j.prices.map(p => ({ ms: Number(p[0]), price: Number(p[1]) }));
}

// Week start = maandag 00:00 UTC (TradingView-achtig)
function weekStartUTC(ms) {
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = (day === 0 ? -6 : 1 - day); // naar maandag
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  mon.setUTCDate(mon.getUTCDate() + diffToMon);
  return mon.getTime();
}

function buildWeeklyCandlesFromDaily(daily) {
  // group by monday-start
  const map = new Map();

  for (const row of daily) {
    const ws = weekStartUTC(row.ms);
    if (!map.has(ws)) {
      map.set(ws, {
        ws,
        open: row.price,
        high: row.price,
        low: row.price,
        close: row.price
      });
    } else {
      const c = map.get(ws);
      c.high = Math.max(c.high, row.price);
      c.low = Math.min(c.low, row.price);
      c.close = row.price; // laatste dag in de week wordt close
    }
  }

  const weeks = Array.from(map.values()).sort((a, b) => a.ws - b.ws);

  // naar LightweightCharts format: time in seconds
  return weeks.map(w => ({
    time: Math.floor(w.ws / 1000),
    open: w.open,
    high: w.high,
    low: w.low,
    close: w.close
  }));
}

export default async function handler(req, res) {
  try {
    // 2000 dagen ≈ 285 weken (genoeg voor MA200w)
    const daily = await fetchDailyCloses(2000);
    const candles = buildWeeklyCandlesFromDaily(daily);

    if (candles.length < 220) {
      throw new Error(`Too few weekly candles: ${candles.length}`);
    }

    const closes = candles.map(c => c.close);

    const ma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);

    // Forest “bias” = stijgdruk/daldruk (geen prijs target)
    const biasRaw = closes.map((price, i) => {
      if (ma200[i] == null || rsi14[i] == null) return 0;

      const trend = price > ma200[i] ? 1 : -1;
      const momentum = rsi14[i] >= 50 ? 1 : -1;

      const distance = price / ma200[i] - 1;
      const revert = -clamp(distance * 4, -1, 1);

      return trend * 0.5 + momentum * 0.3 + revert * 0.2;
    });

    const forest = ema(biasRaw, 6).map(v => (v == null ? 0 : v));

    const turningPoints = [];
    for (let i = 1; i < forest.length; i++) {
      const a = forest[i - 1];
      const b = forest[i];
      if (a <= 0 && b > 0) turningPoints.push({ time: candles[i].time, type: "up" });
      if (a >= 0 && b < 0) turningPoints.push({ time: candles[i].time, type: "down" });
    }

    res.status(200).json({ candles, forest, turningPoints });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}