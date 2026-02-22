function $(id){ return document.getElementById(id); }

function setPill(text, kind){
  const pill = $("statusPill");
  pill.textContent = text;
  pill.style.color = "var(--text)";
  if (kind === "good") pill.style.color = "var(--good)";
  if (kind === "bad") pill.style.color = "var(--bad)";
  if (kind === "mid") pill.style.color = "var(--mid)";
}

function lastNonNull(arr){
  for (let i = arr.length - 1; i >= 0; i--){
    if (arr[i] != null) return { i, v: arr[i] };
  }
  return { i: -1, v: null };
}

async function loadData(){
  const res = await fetch("/api/forest", { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API /api/forest failed");
  return JSON.parse(text);
}

// markers helper (faalt netjes als build het niet ondersteunt)
function trySetMarkers(series, markers){
  try {
    if (typeof series.setMarkers === "function") {
      series.setMarkers(markers);
      return true;
    }
    if (typeof LightweightCharts.createSeriesMarkers === "function") {
      LightweightCharts.createSeriesMarkers(series, markers);
      return true;
    }
  } catch (e) {}
  return false;
}

function makeChart(el){
  return LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: { background: { color: "transparent" }, textColor: "#d6d6d6" },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.08)" },
      horzLines: { color: "rgba(255,255,255,0.08)" }
    },
    timeScale: { borderColor: "rgba(255,255,255,0.12)" },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
    crosshair: { mode: 1 }
  });
}

async function init(){
  setPill("Loading…", "mid");

  if (!window.LightweightCharts) {
    throw new Error("LightweightCharts not loaded. Check the script tag in index.html.");
  }

  const data = await loadData();

  const candles = data.candles || [];
  const forest = data.forest || [];
  const turningPoints = data.turningPoints || [];

  $("meta").textContent = `Source: ${data.source} • TF: ${data.interval} • MA: ${data.maPeriod}`;

  $("debug").textContent = JSON.stringify({
    candles: candles.length,
    forestLen: forest.length,
    turningPoints: turningPoints.length,
    version: data.version || "unknown"
  }, null, 2);

  // PRICE
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl);

  const candleSeries = priceChart.addSeries(LightweightCharts.CandlestickSeries, {});
  candleSeries.setData(candles);

  const markers = turningPoints.map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "BIAS UP" : "BIAS DOWN"
  }));
  if (markers.length) trySetMarkers(candleSeries, markers);

  priceChart.timeScale().fitContent();

  // FOREST
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl);

  const zeroLine = forestChart.addSeries(LightweightCharts.LineSeries, { lineWidth: 1 });
  zeroLine.setData(candles.map(c => ({ time: c.time, value: 0 })));

  const forestSeries = forestChart.addSeries(LightweightCharts.LineSeries, { lineWidth: 2 });
  const forestLine = candles
    .map((c, i) => {
      const v = forest[i];
      return v == null ? null : ({ time: c.time, value: Number(v) });
    })
    .filter(Boolean);

  forestSeries.setData(forestLine);
  forestChart.timeScale().fitContent();

  // status
  const last = lastNonNull(forest);
  if (last.v == null) setPill("Forest: not enough data yet", "mid");
  else if (last.v > 0.12) setPill(`Forest: Bullish (${last.v.toFixed(2)})`, "good");
  else if (last.v < -0.12) setPill(`Forest: Bearish (${last.v.toFixed(2)})`, "bad");
  else setPill(`Forest: Neutral (${last.v.toFixed(2)})`, "mid");

  // sync zoom
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });

  // resize
  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  setPill("Error (check debug)", "bad");
  $("debug").textContent = String(err?.message || err);
});