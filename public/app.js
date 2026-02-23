// public/app.js
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function emaSeries(candles, len) {
  const k = 2 / (len + 1);
  let prev = null;
  return candles.map(c => {
    const v = c.close;
    if (prev == null) prev = v;
    else prev = v * k + prev * (1 - k);
    return { time: c.time, value: prev };
  });
}

function makeChart(el) {
  return LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: { background: { color: "transparent" }, textColor: "#d6d6d6" },
    grid: { vertLines: { color: "rgba(255,255,255,0.08)" }, horzLines: { color: "rgba(255,255,255,0.08)" } },
    timeScale: { borderColor: "rgba(255,255,255,0.12)" },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
    crosshair: { mode: 1 }
  });
}

// Compat: werkt met v4 (addCandlestickSeries) en v5 (addSeries)
function addCandles(chart) {
  if (typeof chart.addCandlestickSeries === "function") return chart.addCandlestickSeries();
  return chart.addSeries(LightweightCharts.CandlestickSeries, {});
}
function addLine(chart, opts) {
  if (typeof chart.addLineSeries === "function") return chart.addLineSeries(opts || {});
  return chart.addSeries(LightweightCharts.LineSeries, opts || {});
}

async function loadData() {
  const res = await fetch("/api/forest?interval=10080", { headers: { accept: "application/json" } }); // weekly
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API /api/forest failed");
  return JSON.parse(text);
}

function linRegSlope(values) {
  // values: [{x,y}] -> slope
  const n = values.length;
  if (n < 2) return 0;
  let sx=0, sy=0, sxx=0, sxy=0;
  for (const p of values) { sx += p.x; sy += p.y; sxx += p.x*p.x; sxy += p.x*p.y; }
  const denom = n*sxx - sx*sx;
  if (denom === 0) return 0;
  return (n*sxy - sx*sy) / denom;
}

async function init() {
  const data = await loadData();

  const candles = data.candles || [];
  const forestZ = data.forestZ || [];
  const atr14 = data.atr14 || [];

  document.getElementById("debug").textContent = JSON.stringify({
    source: data.source,
    interval: data.interval,
    candles: candles.length,
    forestZ: forestZ.filter(v => v != null).length
  }, null, 2);

  const priceEl = document.getElementById("priceChart");
  const forestEl = document.getElementById("forestChart");

  const priceChart = makeChart(priceEl);
  const forestChart = makeChart(forestEl);

  // --- PRICE CHART ---
  const candleSeries = addCandles(priceChart);
  candleSeries.setData(candles);

  // EMA overlays
  const ema20 = emaSeries(candles, 20);
  const ema50 = emaSeries(candles, 50);

  const ema20Series = addLine(priceChart, { lineWidth: 2 });
  ema20Series.setData(ema20);

  const ema50Series = addLine(priceChart, { lineWidth: 2 });
  ema50Series.setData(ema50);

  // Forest -> price projection (begrensd)
  const MULT = 1.2;      // jouw smaak: 1.0–1.6
  const ZCAP = 2.5;      // hard cap op z-score

  const proj = [];
  for (let i = 0; i < candles.length; i++) {
    const z = forestZ[i];
    const a = atr14[i];
    if (z == null || a == null) continue;
    const base = ema20[i].value; // anker op EMA20
    const cappedZ = clamp(z, -ZCAP, ZCAP);
    const y = base + cappedZ * a * MULT;
    proj.push({ time: candles[i].time, value: y });
  }

  const projSeries = addLine(priceChart, { lineWidth: 2 });
  projSeries.setData(proj);

  // --- Forecast (visueel) ---
  // basis: laatste 6 punten van proj, lineaire slope, maar:
  // - slope cap = ATR*0.5
  // - demping bij extreme z
  // - max 10 bars vooruit
  const H = 10;
  const N = 6;

  const lastIdx = candles.length - 1;
  const dt = (candles.length >= 2) ? (candles[lastIdx].time - candles[lastIdx - 1].time) : 7 * 24 * 3600;

  const recent = proj.slice(-N);
  if (recent.length >= 2) {
    const pts = recent.map((p, k) => ({ x: k, y: p.value }));
    let slope = linRegSlope(pts); // per bar

    const lastAtr = atr14[lastIdx] ?? atr14[lastIdx - 1];
    const lastZ = forestZ[lastIdx] ?? forestZ[lastIdx - 1];

    if (lastAtr != null) {
      const maxSlope = lastAtr * 0.5;
      slope = clamp(slope, -maxSlope, maxSlope);
    }

    // demping: hoe extremer |z|, hoe minder extrapolatie
    if (lastZ != null) {
      const damp = 1 - clamp(Math.abs(lastZ) / 3, 0, 1); // |z|>=3 => 0
      slope = slope * damp;
    }

    const start = recent[recent.length - 1];
    const forecast = [];
    for (let h = 1; h <= H; h++) {
      forecast.push({
        time: start.time + dt * h,
        value: start.value + slope * h
      });
    }

    const forecastSeries = addLine(priceChart, { lineWidth: 2, lineStyle: 2 }); // dotted
    forecastSeries.setData([start, ...forecast]);
  }

  priceChart.timeScale().fitContent();

  // --- FOREST CHART (PURE Z-SCORE) ---
  const zero = addLine(forestChart, { lineWidth: 1, lineStyle: 2 });
  zero.setData(candles.map(c => ({ time: c.time, value: 0 })));

  const fSeries = addLine(forestChart, { lineWidth: 2 });
  const forestLine = [];
  for (let i = 0; i < candles.length; i++) {
    const z = forestZ[i];
    if (z == null) continue;
    forestLine.push({ time: candles[i].time, value: z });
  }
  fSeries.setData(forestLine);

  // vaste schaal voor z-score (stabiel + eerlijk)
  forestChart.priceScale("right").applyOptions({
    autoScale: false,
    scaleMargins: { top: 0.15, bottom: 0.15 }
  });
  // “fake fixed range” door invisible boundaries:
  const capTop = addLine(forestChart, { lineWidth: 1, lineStyle: 3 });
  const capBot = addLine(forestChart, { lineWidth: 1, lineStyle: 3 });
  capTop.setData(candles.map(c => ({ time: c.time, value: 3 })));
  capBot.setData(candles.map(c => ({ time: c.time, value: -3 })));

  forestChart.timeScale().fitContent();

  // Sync scroll/zoom
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });

  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6666;padding:16px;white-space:pre-wrap;">${String(err?.message || err)}</pre>`;
});