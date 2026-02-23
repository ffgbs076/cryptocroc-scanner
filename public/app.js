function $(id){ return document.getElementById(id); }

function setPill(text){ $("statusPill").textContent = text; }

async function loadData(){
  const r = await fetch("/api/forest?includeLive=1", { headers: { accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(text || "API failed");
  return JSON.parse(text);
}

function makeChart(el, { height }) {
  return LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height,
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

  // DEBUG onderin (handig)
  $("debug").textContent = JSON.stringify({
    bandsNow: data.bandsNow,
    freezeNow: data.freezeNow
  }, null, 2);

  // ---------------- PRICE CHART ----------------
  const priceEl = $("priceChart");
  const priceChart = makeChart(priceEl, { height: priceEl.clientHeight });

  const candles = priceChart.addCandlestickSeries();
  candles.setData(data.candles);

  // Truth overlay (solid)
  const forestTruth = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  forestTruth.setData(data.forestOverlayTruth || []);

  // Live overlay (dashed)
  const forestLive = priceChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayLive?.length) forestLive.setData(data.forestOverlayLive);

  // Forward (dashed thin)
  const forestFwd = priceChart.addLineSeries({
    lineWidth: 1,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestOverlayForward?.length) forestFwd.setData(data.forestOverlayForward);

  priceChart.timeScale().fitContent();

  // ---------------- FOREST Z CHART ----------------
  const forestEl = $("forestChart");
  const forestChart = makeChart(forestEl, { height: forestEl.clientHeight });

  // vaste schaal -3..+3
  forestChart.priceScale("right").applyOptions({
    autoScale: false,
    scaleMargins: { top: 0.2, bottom: 0.2 }
  });

  // z truth
  const zTruth = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false
  });
  zTruth.setData(data.forestZTruth || []);

  // z live preview
  const zLive = forestChart.addLineSeries({
    lineWidth: 2,
    priceLineVisible: false,
    lineStyle: LightweightCharts.LineStyle.Dashed
  });
  if (data.forestZLive?.length) zLive.setData(data.forestZLive);

  // “forward” z tekenen als simpele 4 punten uit overlay forward (we reconstrueren z niet; paneel is truth/live genoeg)
  forestChart.timeScale().fitContent();

  setPill(data.regimeLabel);

  // resize
  window.addEventListener("resize", () => {
    priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
    forestChart.applyOptions({ width: forestEl.clientWidth, height: forestEl.clientHeight });
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6666;padding:12px">${String(err?.message || err)}</pre>`;
});