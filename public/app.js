// public/app.js

function $(id) { return document.getElementById(id); }

function setPill(text, kind) {
  const pill = $("statusPill");
  pill.textContent = text;
  pill.style.color = "#d6d6d6";
  if (kind === "good") pill.style.color = "#00c853";
  if (kind === "bad") pill.style.color = "#ff5252";
  if (kind === "mid") pill.style.color = "#ffd166";
}

async function loadData() {
  const res = await fetch("/api/forest?includeCurrentWeek=false", {
    headers: { accept: "application/json" }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API /api/forest failed");
  return JSON.parse(text);
}

function makeChart(el) {
  return LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: { background: { color: "#0e1117" }, textColor: "#d6d6d6" },
    grid: { vertLines: { color: "#222" }, horzLines: { color: "#222" } },
    timeScale: { borderColor: "#222" },
    rightPriceScale: { borderColor: "#222" },
    crosshair: { mode: 1 }
  });
}

function lastNonNull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return { i, v: arr[i] };
  }
  return { i: -1, v: null };
}

async function init() {
  setPill("Loading…", "mid");

  if (!window.LightweightCharts || !LightweightCharts.createChart) {
    throw new Error("LightweightCharts not loaded. Check index.html (must pin v4).");
  }

  const data = await loadData();

  const candlesArr = data.candles || [];
  const forestArr = data.forest || [];
  const turningPoints = data.turningPoints || [];

  $("meta").textContent = `Source: ${data.source} • TF: ${data.interval} • closed weeks`;
  $("debug").textContent = JSON.stringify({
    candles: candlesArr.length,
    forestLen: forestArr.length,
    turningPoints: turningPoints.length
  }, null, 2);

  // PRICE CHART
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl);

  const candleSeries = priceChart.addCandlestickSeries();
  candleSeries.setData(candlesArr);

  const markers = turningPoints.map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "#00c853" : "#ff5252",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  if (markers.length) candleSeries.setMarkers(markers);

  priceChart.timeScale().fitContent();

  // FOREST CHART
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl);

  const zeroLine = forestChart.addLineSeries({ lineWidth: 1, color: "#666" });
  zeroLine.setData(candlesArr.map(c => ({ time: c.time, value: 0 })));

  const forestSeries = forestChart.addLineSeries({ lineWidth: 2, color: "#4aa3ff" });

  const forestLine = candlesArr
    .map((c, i) => {
      const v = forestArr[i];
      if (v == null) return null;
      return { time: c.time, value: v };
    })
    .filter(Boolean);

  forestSeries.setData(forestLine);
  forestChart.timeScale().fitContent();

  // Sync zoom/scroll
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });

  // Status op basis van laatste forest (z-score)
  const last = lastNonNull(forestArr);
  if (last.v == null) setPill("Forest: not enough data", "mid");
  else if (last.v > 0.35) setPill(`Forest: Bullish (${last.v.toFixed(2)})`, "good");
  else if (last.v < -0.35) setPill(`Forest: Bearish (${last.v.toFixed(2)})`, "bad");
  else setPill(`Forest: Neutral (${last.v.toFixed(2)})`, "mid");

  // Resize
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