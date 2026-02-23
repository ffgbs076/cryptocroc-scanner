// api/_lib/forestEngine.js

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

function ema(values, len) {
  const out = new Array(values.length).fill(null);
  if (len <= 1) return out;

  const k = 2 / (len + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;

    if (prev == null) prev = v;
    else prev = v * k + prev * (1 - k);

    out[i] = prev;
  }
  return out;
}

function median(arr) {
  const a = arr.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function robustZ(values, window) {
  const out = new Array(values.length).fill(null);
  const SCALE = 1.4826;

  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) continue;

    const slice = values.slice(i - window + 1, i + 1).filter(Number.isFinite);
    if (slice.length < window * 0.8) continue;

    const med = median(slice);
    const devs = slice.map((x) => Math.abs(x - med));
    const mad = median(devs);

    if (!Number.isFinite(med) || !Number.isFinite(mad) || mad === 0) continue;

    const x = values[i];
    out[i] = (x - med) / (SCALE * mad);
  }

  return out;
}

function atr(candles, len = 14) {
  const tr = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    if (!c) continue;

    const hl = c.high - c.low;
    const hc = prev ? Math.abs(c.high - prev.close) : hl;
    const lc = prev ? Math.abs(c.low - prev.close) : hl;

    tr[i] = Math.max(hl, hc, lc);
  }

  const trEma = ema(tr.map((x) => (x == null ? NaN : x)), len);
  return trEma.map((x) => (Number.isFinite(x) ? x : null));
}

function makeRegimeLabel(zNow) {
  if (!Number.isFinite(zNow)) return "Forest: not enough data";
  if (zNow >= 2.2) return `Forest: EXTREME BULL (${zNow.toFixed(2)})`;
  if (zNow >= 1.5) return `Forest: STRONG BULL (${zNow.toFixed(2)})`;
  if (zNow >= 0.45) return `Forest: BULL (${zNow.toFixed(2)})`;
  if (zNow <= -2.2) return `Forest: EXTREME BEAR (${zNow.toFixed(2)})`;
  if (zNow <= -1.5) return `Forest: STRONG BEAR (${zNow.toFixed(2)})`;
  if (zNow <= -0.45) return `Forest: BEAR (${zNow.toFixed(2)})`;
  return `Forest: NEUTRAL (${zNow.toFixed(2)})`;
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive }) {
  // ====== instellingen (super belangrijk voor stabiliteit) ======
  const EMA_LEN = 50;
  const Z_WINDOW = 208;     // ~4 jaar weekly
  const Z_CAP = 2.5;        // clamp tegen extreme uitschieters
  const MULT = 0.55;        // hoe sterk overlay op prijs zit (lager = stabieler)
  const FORWARD_WEEKS = 10; // vooruit = hint, kort houden
  const WEEK_SEC = 7 * 24 * 60 * 60;

  // ====== Truth berekening ======
  const closesT = candlesTruth.map((c) => c.close);
  const emaT = ema(closesT, EMA_LEN);

  const detrendT = closesT.map((c, i) => {
    const e = emaT[i];
    if (!Number.isFinite(c) || !Number.isFinite(e)) return null;
    return c - e;
  });

  const zT = robustZ(detrendT, Z_WINDOW);
  const atrT = atr(candlesTruth, 14);

  // overlay = close + clamp(z)*ATR*MULT
  const forestOverlayTruth = candlesTruth.map((c, i) => {
    const z = zT[i];
    const a = atrT[i];
    if (!Number.isFinite(z) || !Number.isFinite(a)) return null;
    const zz = clamp(z, -Z_CAP, Z_CAP);
    return { time: c.time, value: c.close + zz * a * MULT };
  }).filter(Boolean);

  const zNowTruth = zT[zT.length - 1];
  const regimeLabel = makeRegimeLabel(zNowTruth);

  // ====== Live preview (alleen laatste punt extra) ======
  let forestOverlayLive = [];
  if (hasLive && candlesWithLive.length > candlesTruth.length) {
    const live = candlesWithLive[candlesWithLive.length - 1];

    // we doen live: EMA en detrend op basis van truth + live close
    const closesL = candlesWithLive.map((c) => c.close);
    const emaL = ema(closesL, EMA_LEN);

    const detrendL = closesL.map((c, i) => {
      const e = emaL[i];
      if (!Number.isFinite(c) || !Number.isFinite(e)) return null;
      return c - e;
    });

    const zL = robustZ(detrendL, Z_WINDOW);
    const atrL = atr(candlesWithLive, 14);

    const i = candlesWithLive.length - 1;
    const z = zL[i];
    const a = atrL[i];

    if (Number.isFinite(z) && Number.isFinite(a)) {
      const zz = clamp(z, -Z_CAP, Z_CAP);

      // Belangrijk: live lijn = truth lijn + 1 extra punt
      forestOverlayLive = forestOverlayTruth.concat([
        { time: live.time, value: live.close + zz * a * MULT }
      ]);
    }
  }

  // ====== Forward hint ======
  // We gebruiken de slope van de laatste 6 truth z-waarden (stabiel), maar:
  // - slope begrenzen
  // - dempen bij extreme |z|
  // - projectie op basis van laatste truth close + ATR
  let forestOverlayForward = [];
  {
    const last = candlesTruth[candlesTruth.length - 1];
    const lastClose = last?.close;
    const lastAtr = atrT[atrT.length - 1];
    const lastZ = zNowTruth;

    if (Number.isFinite(lastClose) && Number.isFinite(lastAtr) && Number.isFinite(lastZ)) {
      // slope van z (laatste 6 weken)
      const tail = zT.slice(-6).filter(Number.isFinite);
      let slope = 0;
      if (tail.length >= 2) {
        slope = (tail[tail.length - 1] - tail[0]) / (tail.length - 1);
      }

      // dempen als we al extreem zitten
      const damp = 1 - clamp(Math.abs(lastZ) / 3, 0, 1); // 0..1
      slope *= damp;

      // slope limiter: max per week
      slope = clamp(slope, -0.25, 0.25);

      const points = [];
      let zF = lastZ;

      for (let k = 1; k <= FORWARD_WEEKS; k++) {
        zF = clamp(zF + slope, -Z_CAP, Z_CAP);

        const t = last.time + k * WEEK_SEC;
        const v = lastClose + zF * lastAtr * MULT;

        points.push({ time: t, value: v });
      }

      forestOverlayForward = points;
    }
  }

  return {
    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,
    regimeLabel
  };
}