async function loadData() {
  const res = await fetch("/api/forest");
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API /api/forest failed");
  return JSON.parse(text);
}

function makeChart(el) {
  return LightweightCharts.createChart(el, {
    layout: {
      background: { color: "#0e1117" },
      textColor: "#d6d6d6"
    },
    grid: {
      vertLines: { color: "#222" },
      horzLines: { color: "#222" }
    },
    timeScale: { borderColor: "#222" },
    rightPriceScale: { borderColor: "#222" },
    crosshair: { mode: 1 }
  });
}

async function init() {
  const data = await loadData();

  const priceChart = makeChart(document.getElementById("priceChart"));
  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  const markers = (data.turningPoints || []).map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "#00c853" : "#ff5252",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "BIAS UP" : "BIAS DOWN"
  }));
  candles.setMarkers(markers);

  const forestChart = makeChart(document.getElementById("forestChart"));

  const zeroLine = forestChart.addLineSeries({ lineWidth: 1 });
  zeroLine.setData(data.candles.map(c => ({ time: c.time, value: 0 })));

  const forestLine = forestChart.addLineSeries({
    color: "#00ff88",
    lineWidth: 2
  });

  forestLine.setData(
    data.candles.map((c, i) => ({ time: c.time, value: data.forest[i] ?? 0 }))
  );

  // Sync zoom/scroll
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6666;padding:16px;">${err}</pre>`;
});