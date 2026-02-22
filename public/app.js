async function loadData() {
  const res = await fetch("/api/forest");
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API /api/forest failed");
  return JSON.parse(text);
}

function makeChart(el) {
  return LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height: el.clientHeight,
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

// Works on different builds/versions
function safeSetMarkers(series, markers) {
  try {
    if (typeof series.setMarkers === "function") {
      series.setMarkers(markers);
      return;
    }
    if (typeof LightweightCharts.createSeriesMarkers === "function") {
      LightweightCharts.createSeriesMarkers(series, markers);
      return;
    }
  } catch (e) {}
}

async function init() {
  const data = await loadData();

  const priceEl = document.getElementById("priceChart");
  const forestEl = document.getElementById("forestChart");

  const priceChart = makeChart(priceEl);

  // ✅ NEW API (v5): addSeries(CandlestickSeries, options)
  const candles = priceChart.addSeries(LightweightCharts.CandlestickSeries, {});
  candles.setData(data.candles);

  const markers = (data.turningPoints || []).map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "BIAS UP" : "BIAS DOWN"
  }));
  if (markers.length) safeSetMarkers(candles, markers);

  priceChart.timeScale().fitContent();

  const forestChart = makeChart(forestEl);

  // ✅ NEW API (v5): addSeries(LineSeries, options)
  const zeroLine = forestChart.addSeries(LightweightCharts.LineSeries, { lineWidth: 1 });
  zeroLine.setData((data.candles || []).map(c => ({ time: c.time, value: 0 })));

  const forestLine = forestChart.addSeries(LightweightCharts.LineSeries, { lineWidth: 2 });

  // nulls eruit (anders tekent hij gek)
  const forestData = (data.candles || [])
    .map((c, i) => {
      const v = data.forest?.[i];
      return v == null ? null : ({ time: c.time, value: Number(v) });
    })
    .filter(Boolean);

  forestLine.setData(forestData);
  forestChart.timeScale().fitContent();

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
  document.body.innerHTML =
    `<pre style="color:#ff6666;padding:16px;">${String(err?.message || err)}</pre>`;
});