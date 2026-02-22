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

async function main(){
  setPill("Loading…", "mid");

  const r = await fetch("/api/forest", { headers: { "accept": "application/json" } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || "API error");

  const candles = j.candles || [];
  const forest = j.forest || [];
  const turningPoints = j.turningPoints || [];

  $("meta").textContent = `Source: ${j.source} • TF: ${j.interval} • MA: ${j.maPeriod}`;
  $("debug").textContent = JSON.stringify({
    candles: candles.length,
    forestLen: forest.length,
    turningPoints: turningPoints.length
  }, null, 2);

  // PRICE CHART
  const priceEl = $("priceChart");
  const priceChart = LightweightCharts.createChart(priceEl, {
    width: priceEl.clientWidth,
    height: priceEl.clientHeight,
    layout: { background: { color: "transparent" }, textColor: "#e7eefc" },
    grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
    timeScale: { borderColor: "rgba(255,255,255,0.10)" }
  });

  const candleSeries = priceChart.addSeries(LightweightCharts.CandlestickSeries, {});
  candleSeries.setData(candles);

  const markers = turningPoints.map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  if (markers.length) LightweightCharts.createSeriesMarkers(candleSeries, markers);

  priceChart.timeScale().fitContent();

  // FOREST CHART (losse chart onder)
  const forestEl = $("forestChart");
  const forestChart = LightweightCharts.createChart(forestEl, {
    width: forestEl.clientWidth,
    height: forestEl.clientHeight,
    layout: { background: { color: "transparent" }, textColor: "#e7eefc" },
    grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
    timeScale: { borderColor: "rgba(255,255,255,0.10)" }
  });

  const forestSeries = forestChart.addSeries(LightweightCharts.LineSeries, { lineWidth: 2 });

  const forestLine = candles.map((c, i) => {
    const v = forest[i];
    return v == null ? null : ({ time: c.time, value: v });
  }).filter(Boolean);

  forestSeries.setData(forestLine);
  forestChart.timeScale().fitContent();

  const last = lastNonNull(forest);
  if (last.v == null) setPill("Forest: not enough data yet", "mid");
  else if (last.v > 0.12) setPill(`Forest: Bullish (${last.v.toFixed(2)})`, "good");
  else if (last.v < -0.12) setPill(`Forest: Bearish (${last.v.toFixed(2)})`, "bad");
  else setPill(`Forest: Neutral (${last.v.toFixed(2)})`, "mid");

  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

main().catch(err => {
  console.error(err);
  setPill("Error (check debug)", "bad");
  $("debug").textContent = String(err?.message || err);
});