async function loadData() {
  const res = await fetch("/api/forest", { headers: { accept: "application/json" } });
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

function safeSetMarkers(series, markers) {
  try {
    // v4: series.setMarkers bestaat
    if (typeof series.setMarkers === "function") {
      series.setMarkers(markers);
      return true;
    }
    // v5: sommige builds hebben createSeriesMarkers
    if (typeof LightweightCharts.createSeriesMarkers === "function") {
      LightweightCharts.createSeriesMarkers(series, markers);
      return true;
    }
  } catch (e) {
    console.warn("Markers not supported:", e);
  }
  return false;
}

async function init() {
  const data = await loadData();

  const priceEl = document.getElementById("priceChart");
  const forestEl = document.getElementById("forestChart");
  if (!priceEl) throw new Error("Missing #priceChart");
  if (!forestEl) throw new Error("Missing #forestChart");

  // --------------------
  // PRICE (candles)
  // --------------------
  const priceChart = makeChart(priceEl);

  // ✅ v5: addSeries(CandlestickSeries)
  const candlesSeries = priceChart.addSeries(LightweightCharts.CandlestickSeries, {});
  candlesSeries.setData(data.candles);

  const markers = (data.turningPoints || [])
    .filter(tp => tp && tp.time && (tp.type === "up" || tp.type === "down"))
    .map(tp => ({
      time: tp.time,
      position: tp.type === "up" ? "belowBar" : "aboveBar",
      shape: tp.type === "up" ? "arrowUp" : "arrowDown",
      text: tp.type === "up" ? "BIAS UP" : "BIAS DOWN"
    }));

  if (markers.length) safeSetMarkers(candlesSeries, markers);

  // --------------------
  // FOREST (line)
  // --------------------
  const forestChart = makeChart(forestEl);

  // ✅ v5: addSeries(LineSeries)
  const zeroLine = forestChart.addSeries(LightweightCharts.LineSeries, { lineWidth: 1 });
  zeroLine.setData((data.candles || []).map(c => ({ time: c.time, value: 0 })));

  const forestLine = forestChart.addSeries(LightweightCharts.LineSeries, { lineWidth: 2 });
  const forestData = (data.candles || []).map((c, i) => {
    const v = (data.forest && data.forest[i] != null) ? Number(data.forest[i]) : null;
    return v == null ? null : ({ time: c.time, value: v });
  }).filter(Boolean);

  forestLine.setData(forestData);

  // Sync zoom/scroll
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });

  priceChart.timeScale().fitContent();
  forestChart.timeScale().fitContent();

  // Resize
  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6666;padding:16px;white-space:pre-wrap;">${String(err?.message || err)}</pre>`;
});