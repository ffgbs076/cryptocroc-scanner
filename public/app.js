// public/app.js
function $(id){ return document.getElementById(id); }

function setStatus(text, kind){
  const el = $("status");
  el.textContent = text;
  el.style.color = kind === "good" ? "var(--good)"
               : kind === "bad"  ? "var(--bad)"
               : kind === "mid"  ? "var(--mid)"
               : "var(--text)";
}

async function loadData(){
  const res = await fetch("/api/forest", { headers: { "accept":"application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API /api/forest failed");
  return JSON.parse(text);
}

function makeChart(el){
  return LightweightCharts.createChart(el, {
    layout: { background: { color: "transparent" }, textColor: "#d6d6d6" },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.06)" },
      horzLines: { color: "rgba(255,255,255,0.06)" }
    },
    timeScale: { borderColor: "rgba(255,255,255,0.10)" },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
    crosshair: { mode: 1 }
  });
}

function toLineData(candles, arr){
  const out = [];
  for (let i = 0; i < candles.length; i++){
    const v = arr?.[i];
    if (v == null) continue;
    out.push({ time: candles[i].time, value: v });
  }
  return out;
}

function constLineData(candles, v){
  return candles.map(c => ({ time: c.time, value: v }));
}

function lastNonNull(arr){
  for (let i = arr.length - 1; i >= 0; i--){
    if (arr[i] != null) return { i, v: arr[i] };
  }
  return { i: -1, v: null };
}

async function init(){
  setStatus("Loading…", "mid");
  const data = await loadData();

  const candles = data.candles || [];
  const forest = data.forest || [];
  const cycle = data.cycle || [];
  const turningPoints = data.turningPoints || [];
  const thr = data.thresholds || { turn: 0.2, zone: 0.35 };

  $("metaText").textContent =
    `Source: ${data.source} • ${data.symbol} • TF: ${data.interval} • Lookback: ${data.lookbackWeeks}w • Strength: ${data.strength}`;

  $("thrText").textContent = `turn ±${thr.turn} • zone ±${thr.zone}`;

  $("debug").textContent = JSON.stringify({
    candles: candles.length,
    forestLen: forest.length,
    turningPoints: turningPoints.length,
    thresholds: thr,
    strength: data.strength
  }, null, 2);

  // PRICE CHART
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl);

  const candleSeries = priceChart.addCandlestickSeries({
    upColor: "#00c853",
    downColor: "#ff5252",
    borderVisible: false,
    wickUpColor: "#00c853",
    wickDownColor: "#ff5252"
  });

  candleSeries.setData(candles);

  // EMA overlays
  const ema20 = priceChart.addLineSeries({ lineWidth: 1, color: "rgba(255,255,255,0.45)" });
  const ema50 = priceChart.addLineSeries({ lineWidth: 1, color: "rgba(255,255,255,0.30)" });
  const ema200 = priceChart.addLineSeries({ lineWidth: 1, color: "rgba(255,255,255,0.18)" });

  ema20.setData(toLineData(candles, data.overlays?.ema20));
  ema50.setData(toLineData(candles, data.overlays?.ema50));
  ema200.setData(toLineData(candles, data.overlays?.ema200));

  // Markers on price
  const priceMarkers = turningPoints.map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "#00c853" : "#ff5252",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "BIAS UP" : "BIAS DOWN"
  }));
  candleSeries.setMarkers(priceMarkers);

  priceChart.timeScale().fitContent();

  // FOREST CHART
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl);

  const zero = forestChart.addLineSeries({ lineWidth: 1, color: "rgba(255,255,255,0.18)" });
  zero.setData(constLineData(candles, 0));

  const zoneUp = forestChart.addLineSeries({ lineWidth: 1, color: "rgba(0,200,83,0.35)" });
  const zoneDn = forestChart.addLineSeries({ lineWidth: 1, color: "rgba(255,82,82,0.35)" });
  zoneUp.setData(constLineData(candles, thr.zone));
  zoneDn.setData(constLineData(candles, -thr.zone));

  const forestLine = forestChart.addLineSeries({ lineWidth: 2, color: "#3aa0ff" });
  forestLine.setData(toLineData(candles, forest));

  const cycleLine = forestChart.addLineSeries({ lineWidth: 1, color: "rgba(170, 120, 255, 0.9)" });
  cycleLine.setData(toLineData(candles, cycle));

  // Markers on forest
  const forestMarkers = turningPoints.map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "#00c853" : "#ff5252",
    shape: "circle",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  forestLine.setMarkers(forestMarkers);

  forestChart.timeScale().fitContent();

  // Status label
  const last = lastNonNull(forest);
  if (last.v == null) {
    setStatus("Forest: not enough data yet", "mid");
  } else {
    const v = last.v;
    const s = data.strength || "unknown";
    if (v >= thr.turn) setStatus(`Forest: Bullish (${v.toFixed(2)}) • ${s}`, s === "strong" ? "good" : "mid");
    else if (v <= -thr.turn) setStatus(`Forest: Bearish (${v.toFixed(2)}) • ${s}`, s === "strong" ? "bad" : "mid");
    else setStatus(`Forest: Neutral (${v.toFixed(2)}) • ${s}`, "mid");
  }

  // Sync zoom/scroll
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });

  // Resize
  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  setStatus("Error (check debug)", "bad");
  $("debug").textContent = String(err?.message || err);
});