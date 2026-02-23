function $(id){ return document.getElementById(id); }

function setPill(text, kind){
  const pill = $("statusPill");
  pill.textContent = text;
  pill.style.color = "var(--fg)";
  if (kind === "good") pill.style.color = "var(--good)";
  if (kind === "bad") pill.style.color = "var(--bad)";
  if (kind === "mid") pill.style.color = "var(--mid)";
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

async function getJson(url){
  const r = await fetch(url, { headers:{ accept:"application/json" }});
  const t = await r.text();
  if (!r.ok) throw new Error(t || `HTTP ${r.status}`);
  return JSON.parse(t);
}

function lastNonNullIndex(arr){
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
  return -1;
}

async function main(){
  setPill("Loading…", "mid");

  // Truth = alleen gesloten week
  const forest = await getJson("/api/forest?includeCurrentWeek=false&forecast=1");
  // Preview = inclusief lopende week (mag verschillen)
  const forestLive = await getJson("/api/forest?includeCurrentWeek=true&forecast=1");
  // Kansmodel + structure gate (kan “no edge” geven)
  const prob = await getJson("/api/probability?includeCurrentWeek=false");

  $("meta").textContent = `Source: ${forest.source} • TF: ${forest.interval} • Forest: z-score`;
  $("probText").textContent =
    prob.isTradeable
      ? `TRADEABLE: ${prob.direction.toUpperCase()} • pDown=${prob.pDown.toFixed(2)} • conf=${prob.confidence} • confluence=${prob.structure.relevantConfluence}`
      : `NO EDGE • pDown=${prob.pDown.toFixed(2)} • conf=${prob.confidence} • confluence=${prob.structure.relevantConfluence}`;

  // PRICE CHART
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl);

  const candleSeries = priceChart.addCandlestickSeries();
  candleSeries.setData(forest.candles);

  // Forest overlay op prijs (altijd zichtbaar)
  const overlayTruth = priceChart.addLineSeries({ lineWidth: 2 });
  overlayTruth.setData(forest.overlayProjected || []);

  // Live preview overlay (gestippeld)
  const overlayLive = priceChart.addLineSeries({ lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted });
  overlayLive.setData(forestLive.overlayProjected || []);

  // Forecast (gestippeld vooruit, begrensd)
  const overlayForecast = priceChart.addLineSeries({ lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted });
  overlayForecast.setData(forest.forecastProjected || []);

  // Turning points markers op candles
  const markers = (forest.turningPoints || []).map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "#00c853" : "#ff5252",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  candleSeries.setMarkers(markers);

  priceChart.timeScale().fitContent();

  // FOREST CHART (oscillator)
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl);

  const zero = forestChart.addLineSeries({ lineWidth: 1 });
  zero.setData(forest.candles.map(c => ({ time: c.time, value: 0 })));

  const forestTruth = forestChart.addLineSeries({ lineWidth: 2 });
  forestTruth.setData(forest.forestLine || []);

  const forestPreview = forestChart.addLineSeries({ lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted });
  forestPreview.setData(forestLive.forestLine || []);

  // vaste schaal -3..+3
  forestChart.applyOptions({ rightPriceScale: { autoScale: false, scaleMargins: { top: 0.15, bottom: 0.15 } } });
  forestTruth.applyOptions({ priceFormat: { type: "price", precision: 2, minMove: 0.01 } });

  forestChart.timeScale().fitContent();

  // Status tekst op basis van laatste closed waarde
  const idx = lastNonNullIndex(forest.forestRaw || []);
  const z = idx >= 0 ? forest.forestRaw[idx] : null;

  if (z == null) setPill("Forest: not enough data", "mid");
  else if (z <= -0.35) setPill(`Forest: Bearish (${z.toFixed(2)})`, "bad");
  else if (z >= 0.35) setPill(`Forest: Bullish (${z.toFixed(2)})`, "good");
  else setPill(`Forest: Neutral (${z.toFixed(2)})`, "mid");

  $("debug").textContent = JSON.stringify({
    candles: forest.candles.length,
    forestLinePoints: forest.forestLine?.length,
    overlayTruth: forest.overlayProjected?.length,
    overlayLive: forestLive.overlayProjected?.length,
    forecast: forest.forecastProjected?.length,
    probability: prob
  }, null, 2);

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