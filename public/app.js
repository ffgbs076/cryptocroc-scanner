function $(id){ return document.getElementById(id); }

function setPill(text){
  $("statusPill").textContent = text;
}

async function loadData(){
  const res = await fetch("/api/forest?includeLive=1", { headers: { "accept":"application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "API failed");
  return JSON.parse(text);
}

function makeChart(el){
  return LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: { background: { color: "#0e1117" }, textColor: "#d6d6d6" },
    grid: { vertLines: { color: "#222" }, horzLines: { color: "#222" } },
    rightPriceScale: { borderColor: "#222" },
    timeScale: { borderColor: "#222", timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 }
  });
}

async function init(){
  setPill("Loading…");
  const data = await loadData();

  $("meta").textContent =
    `Source: ${data.source} • TF: ${data.interval} • Truth weeks: ${data.truthCount} • Live: ${data.hasLive ? "yes" : "no"}`;

  const el = $("priceChart");
  const chart = makeChart(el);

  const candleSeries = chart.addCandlestickSeries();
  candleSeries.setData(data.candles);

  // Forest overlay (TRUTH) — SOLID
  const forestTruth = chart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  forestTruth.setData(data.forestOverlayTruth);

  // Live preview — dashed
  const forestLive = chart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive && data.forestOverlayLive.length){
    forestLive.setData(data.forestOverlayLive);
  }

  // Forward hint — thinner dashed
  const forestFwd = chart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayForward && data.forestOverlayForward.length){
    forestFwd.setData(data.forestOverlayForward);
  }

  chart.timeScale().fitContent();
  setPill(data.regimeLabel);

  window.addEventListener("resize", () => {
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6666">${String(err?.message || err)}</pre>`;
});