async function loadData() {
  // closed weeks (non-repaint) = default in jouw /api/forest.js
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

    // ✅ prijs rechts
    rightPriceScale: { borderColor: "#222", visible: true },

    // ✅ forest links (eigen schaal)
    leftPriceScale: {
      borderColor: "#222",
      visible: true,
      // beetje ruimte zodat forest niet exact over candles heen zit
      scaleMargins: { top: 0.15, bottom: 0.15 }
    },

    crosshair: { mode: 1 }
  });
}

function asLineDataFromArray(candles, arr) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const v = arr[i];
    if (v == null) continue;
    out.push({ time: candles[i].time, value: v });
  }
  return out;
}

async function init() {
  const data = await loadData();

  const priceEl = document.getElementById("priceChart");
  const forestEl = document.getElementById("forestChart");

  const priceChart = makeChart(priceEl);

  // ============ PRICE (candles) ============
  const candlesSeries = priceChart.addCandlestickSeries({
    // prijs gebruikt default (rechts)
    priceScaleId: "right",
  });

  candlesSeries.setData(data.candles);

  // Turning points markers (optioneel)
  const markers = (data.turningPoints || []).map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "#00c853" : "#ff5252",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  if (markers.length) candlesSeries.setMarkers(markers);

  // ============ EMA overlays (optioneel) ============
  // Als jouw API nog geen ema arrays terugstuurt: laat dit blok staan maar doet niets.
  // (Later kunnen we ema20/ema50 server-side toevoegen en hier tekenen.)
  // --------

  // ============ FOREST overlay (op dezelfde chart, links) ============
  const forestOverlay = priceChart.addLineSeries({
    priceScaleId: "left",
    lineWidth: 2,
    // geen kleur hardcoden? je had blauw; hier hou ik TradingView-achtig:
    color: "#2ea1ff"
  });

  forestOverlay.setData(asLineDataFromArray(data.candles, data.forest));

  // ✅ vaste referentielijnen op de Forest-schaal (links)
  // 0-lijn
  forestOverlay.createPriceLine({
    price: 0,
    color: "#666",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "0"
  });

  // drempels (zoals je API nu gebruikt)
  const up = data?.thresholds?.up ?? 0.35;
  const down = data?.thresholds?.down ?? -0.35;

  forestOverlay.createPriceLine({
    price: up,
    color: "#2ea1ff",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `+${up}`
  });

  forestOverlay.createPriceLine({
    price: down,
    color: "#2ea1ff",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `${down}`
  });

  // extra “extreme” zones voor jouw gevoel (optioneel)
  forestOverlay.createPriceLine({
    price: 1,
    color: "#444",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "+1"
  });

  forestOverlay.createPriceLine({
    price: -1,
    color: "#444",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "-1"
  });

  priceChart.timeScale().fitContent();

  // ============ LOS FOREST paneel (zoals je al had) ============
  // Jij wilde “altijd forest zien” — dit laat ik bestaan.
  // Wil je alleen overlay en géén los paneel, dan kan forestChart weg.
  const forestChart = makeChart(forestEl);

  const forestLine = forestChart.addLineSeries({ lineWidth: 2, color: "#2ea1ff" });
  forestLine.setData(asLineDataFromArray(data.candles, data.forest));

  forestLine.createPriceLine({
    price: 0,
    color: "#666",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "0"
  });

  forestLine.createPriceLine({
    price: up,
    color: "#2ea1ff",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `+${up}`
  });

  forestLine.createPriceLine({
    price: down,
    color: "#2ea1ff",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `${down}`
  });

  forestChart.timeScale().fitContent();

  // Sync zoom/scroll (handig)
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });

  // Resize support
  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6666;padding:16px;">${String(err?.message || err)}</pre>`;
});