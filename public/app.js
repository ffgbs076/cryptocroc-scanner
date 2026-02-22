async function loadData() {
  const res = await fetch('/api/forest');
  return res.json();
}

function createChart(containerId) {
  return LightweightCharts.createChart(document.getElementById(containerId), {
    layout: {
      background: { color: '#0e1117' },
      textColor: '#DDD'
    },
    grid: {
      vertLines: { color: '#222' },
      horzLines: { color: '#222' }
    },
    timeScale: { borderColor: '#222' },
    rightPriceScale: { borderColor: '#222' }
  });
}

async function init() {
  const data = await loadData();

  // ====== Price chart ======
  const chart = createChart("chart");
  const candleSeries = chart.addCandlestickSeries();
  candleSeries.setData(data.candles);

  // markers (allemaal tegelijk zetten)
  const markers = (data.turningPoints || []).map(tp => ({
    time: tp.time,
    position: tp.type === "up" ? "belowBar" : "aboveBar",
    color: tp.type === "up" ? "green" : "red",
    shape: tp.type === "up" ? "arrowUp" : "arrowDown",
    text: tp.type === "up" ? "UP" : "DOWN"
  }));
  candleSeries.setMarkers(markers);

  // ====== Forest chart ======
  const forestChart = createChart("forest");
  const forestSeries = forestChart.addLineSeries({
    color: '#00ff88',
    lineWidth: 2
  });

  const forestData = data.candles.map((c, i) => ({
    time: c.time,
    value: data.forest[i] ?? 0
  }));
  forestSeries.setData(forestData);

  // sync time scales (nice TV-feel)
  chart.timeScale().subscribeVisibleTimeRangeChange(range => {
    forestChart.timeScale().setVisibleRange(range);
  });
}

init();