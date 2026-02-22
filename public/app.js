async function loadData() {
  const res = await fetch('/api/forest');
  return res.json();
}

function createChart(containerId) {
  return LightweightCharts.createChart(
    document.getElementById(containerId),
    {
      layout: {
        background: { color: '#0e1117' },
        textColor: '#DDD'
      },
      grid: {
        vertLines: { color: '#222' },
        horzLines: { color: '#222' }
      }
    }
  );
}

async function init() {
  const data = await loadData();

  const chart = createChart("chart");
  const candleSeries = chart.addCandlestickSeries();

  candleSeries.setData(data.candles);

  const forestChart = createChart("forest");

  const forestSeries = forestChart.addLineSeries({
    color: '#00ff88',
    lineWidth: 2
  });

  const forestData = data.candles.map((c, i) => ({
    time: c.time,
    value: data.forest[i]
  }));

  forestSeries.setData(forestData);

  data.turningPoints.forEach(tp => {
    candleSeries.setMarkers([
      {
        time: tp.time,
        position: tp.type === "up" ? "belowBar" : "aboveBar",
        color: tp.type === "up" ? "green" : "red",
        shape: tp.type === "up" ? "arrowUp" : "arrowDown",
        text: tp.type.toUpperCase()
      }
    ]);
  });
}

init();