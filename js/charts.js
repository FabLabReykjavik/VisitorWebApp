/* global Chart, ChartDataLabels, Plotly */
const charts = (() => {
  Chart.register(ChartDataLabels);

  // Keep references so we can update instead of re-create
  const refs = {}; // keyed by element id

  // Distinct color palette (used for bars & pie)
  const BAR_PALETTE = [
    "#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f",
    "#edc948","#b07aa1","#ff9da7","#9c755f","#bab0ab"
  ];
  const colorize = (len) => Array.from({ length: len }, (_, i) => BAR_PALETTE[i % BAR_PALETTE.length]);

  // Theme-aware text color for labels
  const isDark = () => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const labelColor = () => (isDark() ? "#eaf0f6" : "#0b0c10");

  // Generic bar chart with title + per-bar colors (reuse instances)
  function bar(el, labels, data, chartTitle = "") {
    const ctx = document.getElementById(el);
    if (!ctx) return;

    if (!refs[el]) {
      refs[el] = new Chart(ctx, {
        type: "bar",
        data: {
          labels: [],
          datasets: [{ label: "Visitors", data: [], backgroundColor: [] }]
        },
        options: {
          responsive: true,
          animation: false,
          plugins: {
            title: { display: !!chartTitle, text: chartTitle },
            legend: { display: false },
            datalabels: { anchor: "end", align: "top", clamp: true, color: () => labelColor() }
          },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
    const c = refs[el];
    c.options.plugins.title.display = !!chartTitle;
    c.options.plugins.title.text = chartTitle;
    c.data.labels = labels;
    c.data.datasets[0].data = data;
    c.data.datasets[0].backgroundColor = colorize(data.length);
    c.update('none');
  }

  // Pie chart (Most Popular Machines) — now with explicit slice colors
  function pie(el, labels, data, title) {
    const ctx = document.getElementById(el);
    if (!ctx) return;

    const bg = colorize(labels.length);

    if (!refs[el]) {
      refs[el] = new Chart(ctx, {
        type: "pie",
        data: { labels: [], datasets: [{ data: [], label: title, backgroundColor: [] }] },
        options: {
          responsive: true,
          animation: false,
          plugins: {
            legend: { position: "right", labels: { color: () => labelColor() } },
            title: { display: !!title, text: title, color: () => labelColor() },
            datalabels: {
              color: () => labelColor(),
              formatter: (v, ctx) => {
                const total = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0) || 0;
                if (!total) return '';
                const pct = Math.round((v/total)*100);
                return pct >= 6 ? `${pct}%` : ''; // avoid clutter on tiny slices
              }
            }
          }
        }
      });
    }
    const c = refs[el];
    c.options.plugins.title.display = !!title;
    c.options.plugins.title.text = title || '';
    c.data.labels = labels;
    c.data.datasets[0].data = data;
    c.data.datasets[0].backgroundColor = bg; // <-- key fix
    c.update('none');
  }

  // Heatmap via Plotly with friendly hovers and Monday on top
  function heatmap(el, z, xLabels, yLabels) {
    const target = document.getElementById(el);
    if (!target) return;

    // Build 2D matrix
    const zData = yLabels.map(() => Array(xLabels.length).fill(0));
    for (const { x, y, value } of z) {
      const xi = xLabels.indexOf(x);
      const yi = yLabels.indexOf(y);
      if (xi >= 0 && yi >= 0) zData[yi][xi] = value;
    }

    const data = [{
      z: zData,
      x: xLabels.map(h => `${h}:00`),
      y: yLabels,
      type: "heatmap",
      text: yLabels.map((d, r) => xLabels.map((h, c) =>
        `${d} ${String(h).padStart(2,'0')}:00 — ${zData[r][c]} visits`
      )),
      hovertemplate: "%{text}<extra></extra>",
      zsmooth: false,
      showscale: true
    }];
    const layout = {
      margin: { t: 10, r: 10, b: 36, l: 48 },
      height: 320,
      xaxis: { title: "Hour (UTC)", tickangle: -45 },
      yaxis: { title: "Weekday", autorange: "reversed" } // Mon on top
    };
    const config = { displayModeBar: false, responsive: true };
    Plotly.react(target, data, layout, config);
  }

  return { bar, pie, heatmap };
})();
