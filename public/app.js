async function loadData(tf) {
  const res = await fetch(`/api/forest?tf=${encodeURIComponent(tf)}`);
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API failed");
  return JSON.parse(text);
}

function makeChart(el) {
  return LightweightCharts.createChart(el, {
    layout: { background: { color: "transparent" }, textColor: "#d6d6d6" },
    grid: { vertLines: { color: "#222" }, horzLines: { color: "#222" } },
    timeScale: { borderColor: "#222" },
    rightPriceScale: { borderColor: "#222" },
    crosshair: { mode: 1 }
  });
}

let priceChart, forestChart;

function clearEl(el){ while (el.firstChild) el.removeChild(el.firstChild); }

async function render(tf){
  const data = await loadData(tf);

  // reset
  const priceEl = document.getElementById("priceChart");
  const forestEl = document.getElementById("forestChart");
  clearEl(priceEl); clearEl(forestEl);

  priceChart = makeChart(priceEl);
  forestChart = makeChart(forestEl);

  // Candles
  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  // EMA’s
  const ema20 = priceChart.addLineSeries({ lineWidth: 1 });
  ema20.setData(data.ema20 || []);

  const ema50 = priceChart.addLineSeries({ lineWidth: 1 });
  ema50.setData(data.ema50 || []);

  // Forest overlay (op prijs chart)
  const forestOverlay = priceChart.addLineSeries({ lineWidth: 2 });
  forestOverlay.setData(data.forestPriceLine || []);

  // Forecast overlay (stippel)
  // Lightweight Charts heeft lineStyle: 2 = dashed
  const forecastOverlay = priceChart.addLineSeries({ lineWidth: 2, lineStyle: 2 });
  forecastOverlay.setData(data.forecastLine || []);

  // Markers
  const markers = (data.turningPoints || []).map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  candles.setMarkers(markers);

  priceChart.timeScale().fitContent();

  // Onderste paneel: puur voor “Forest Z gevoel” (optioneel)
  // Hier tekenen we alleen de overlay-waarde minus EMA20 (zodat je beweging ziet).
  const forestLine = forestChart.addLineSeries({ lineWidth: 2 });
  const fl = (data.forestPriceLine || []).map((p, i) => {
    const e = (data.ema20 || [])[i];
    if (!p || !e) return null;
    return { time: p.time, value: p.value - e.value };
  }).filter(Boolean);
  forestLine.setData(fl);

  const zero = forestChart.addLineSeries({ lineWidth: 1, lineStyle: 2 });
  zero.setData(fl.map(x => ({ time: x.time, value: 0 })));

  forestChart.timeScale().fitContent();

  // sync scroll/zoom
  priceChart.timeScale().subscribeVisibleTimeRangeChange(range => {
    if (range) forestChart.timeScale().setVisibleRange(range);
  });

  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  }, { once: true });

  const meta = document.getElementById("meta");
  if (meta) meta.textContent = `TF: ${data.tf} • candles: ${data.candles?.length || 0}`;
}

function wireButtons(){
  const w = document.getElementById("tfW");
  const d = document.getElementById("tfD");
  const m = document.getElementById("tf15");

  const go = (tf) => render(tf).catch(err => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#ff6666;padding:16px;">${err}</pre>`;
  });

  if (w) w.onclick = () => go("1W");
  if (d) d.onclick = () => go("1D");
  if (m) m.onclick = () => go("15m");

  go("1W"); // default
}

wireButtons();