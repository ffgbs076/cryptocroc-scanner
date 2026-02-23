async function loadData() {
  const res = await fetch("/api/forest", { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API /api/forest failed");
  return JSON.parse(text);
}

function makeChart(el) {
  return LightweightCharts.createChart(el, {
    layout: { background: { color: "#0e1117" }, textColor: "#d6d6d6" },
    grid: { vertLines: { color: "#222" }, horzLines: { color: "#222" } },
    timeScale: { borderColor: "#222" },
    rightPriceScale: { borderColor: "#222", visible: true },
    leftPriceScale: { borderColor: "#222", visible: true, scaleMargins: { top: 0.15, bottom: 0.15 } },
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

function addWeeks(utcSeconds, weeks) {
  return utcSeconds + weeks * 7 * 24 * 60 * 60;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function lastNonNullLinePoints(line) {
  // line = [{time,value}, ...]
  for (let i = line.length - 1; i >= 0; i--) {
    if (line[i] && line[i].value != null) return i;
  }
  return -1;
}

function buildForestForecast(forestLine, horizonWeeks = 10) {
  // Forecast puur visueel:
  // - neemt slope van de laatste 4 stappen
  // - dempt als |z| groot is
  // - clamp naar [-3, +3]
  const idx = lastNonNullLinePoints(forestLine);
  if (idx < 5) return []; // te weinig data

  const last = forestLine[idx];
  const last2 = forestLine[idx - 1];
  const last3 = forestLine[idx - 2];
  const last4 = forestLine[idx - 3];
  const last5 = forestLine[idx - 4];

  // gemiddelde slope van laatste 4 weken
  const s1 = last.value - last2.value;
  const s2 = last2.value - last3.value;
  const s3 = last3.value - last4.value;
  const s4 = last4.value - last5.value;
  let slope = (s1 + s2 + s3 + s4) / 4;

  // demping: als forest al extreem is, minder hard doortrekken
  const damp = 1 - Math.min(Math.abs(last.value) / 3, 1); // 0..1
  slope = slope * damp;

  // max slope per week (anders schiet hij weer kapot)
  const maxSlope = 0.35; // z-score per week max (veilig)
  slope = clamp(slope, -maxSlope, maxSlope);

  const out = [];
  let v = last.value;

  for (let k = 1; k <= horizonWeeks; k++) {
    v = clamp(v + slope, -3, 3);
    out.push({ time: addWeeks(last.time, k), value: v });
  }

  // Belangrijk: forecast-lijn moet “aansluiten” op laatste echte punt
  // Dus we beginnen met het echte laatste punt en dan de toekomst.
  return [last, ...out];
}

async function init() {
  const data = await loadData();

  const priceEl = document.getElementById("priceChart");
  const forestEl = document.getElementById("forestChart");

  const priceChart = makeChart(priceEl);

  // ===== PRICE =====
  const candlesSeries = priceChart.addCandlestickSeries({ priceScaleId: "right" });
  candlesSeries.setData(data.candles);

  // turning points
  const markers = (data.turningPoints || []).map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "#00c853" : "#ff5252",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  if (markers.length) candlesSeries.setMarkers(markers);

  // ===== FOREST overlay (echte lijn) =====
  const forestOverlay = priceChart.addLineSeries({
    priceScaleId: "left",
    lineWidth: 2,
    color: "#2ea1ff"
  });

  const forestLine = asLineDataFromArray(data.candles, data.forest);
  forestOverlay.setData(forestLine);

  // ===== FOREST forecast (gestippeld vooruit) =====
  const forestForecastSeries = priceChart.addLineSeries({
    priceScaleId: "left",
    lineWidth: 2,
    color: "#2ea1ff",
    lineStyle: LightweightCharts.LineStyle.Dashed
  });

  const forecast = buildForestForecast(forestLine, 10);
  forestForecastSeries.setData(forecast);

  // lijnen 0 / thresholds
  const up = data?.thresholds?.up ?? 0.35;
  const down = data?.thresholds?.down ?? -0.35;

  forestOverlay.createPriceLine({
    price: 0,
    color: "#666",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "0"
  });

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

  // ===== Los forest paneel (blijft handig) =====
  const forestChart = makeChart(forestEl);

  const forestLineSeries = forestChart.addLineSeries({ lineWidth: 2, color: "#2ea1ff" });
  forestLineSeries.setData(forestLine);

  const forestForecastPane = forestChart.addLineSeries({
    lineWidth: 2,
    color: "#2ea1ff",
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  forestForecastPane.setData(forecast);

  forestLineSeries.createPriceLine({
    price: 0,
    color: "#666",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "0"
  });

  forestLineSeries.createPriceLine({
    price: up,
    color: "#2ea1ff",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `+${up}`
  });

  forestLineSeries.createPriceLine({
    price: down,
    color: "#2ea1ff",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `${down}`
  });

  forestChart.timeScale().fitContent();

  // sync scroll
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
  document.body.innerHTML = `<pre style="color:#ff6666;padding:16px;">${String(err?.message || err)}</pre>`;
});