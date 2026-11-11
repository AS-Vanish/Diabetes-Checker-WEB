// Chart.js helpers (Chart.js is self-hosted in vendor/chartjs and exposed as window.Chart).
const instances = new Map();

export const palette = {
  light: { text: "#1b2a3a", muted: "#5b6b7c", grid: "#dbe3ea", accent: "#0f766e", accent2: "#2563eb", pos: "#c2410c", neg: "#15803d", bg: "#ffffff" },
  dark:  { text: "#e6edf5", muted: "#9db0c3", grid: "#2a3b4d", accent: "#2dd4bf", accent2: "#60a5fa", pos: "#fb923c", neg: "#4ade80", bg: "#111c28" },
};
export const themeName = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function base(c, ctx, opts = {}) {
  return {
    responsive: true, maintainAspectRatio: false, locale: ctx.locale,
    animation: opts.animate === false ? false : { duration: 600, easing: "easeOutQuart" },
    font: { family: "Vazirmatn, system-ui, sans-serif" },
    color: c.text,
    plugins: { legend: { display: false, labels: { color: c.text, font: { family: "Vazirmatn" } } }, tooltip: { rtl: ctx.rtl, textDirection: ctx.rtl ? "rtl" : "ltr", titleFont: { family: "Vazirmatn" }, bodyFont: { family: "Vazirmatn" } } },
  };
}
const axis = (c, extra = {}) => ({ ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid }, border: { color: c.grid }, ...extra });

export function draw(canvasOrId, config) {
  if (!window.Chart) return null;
  const canvas = typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
  if (!canvas) return null;
  instances.get(canvas)?.destroy();
  const ch = new Chart(canvas, config);
  instances.set(canvas, ch);
  return ch;
}
export function destroyAll() { instances.forEach((c) => c.destroy()); instances.clear(); }

/** Horizontal bars with a value label per model. `rows` = [{label, value, color?}] */
export function barConfig(rows, { c, ctx, title, max = 100, fmt = (v) => v.toFixed(2), animate }) {
  const o = base(c, ctx, { animate });
  o.indexAxis = "y";
  o.plugins.tooltip.callbacks = { label: (i) => ` ${title}: ${fmt(i.parsed.x)}` };
  o.scales = { x: { ...axis(c), min: 0, max, reverse: ctx.rtl }, y: { ...axis(c), grid: { display: false }, position: ctx.rtl ? "right" : "left" } };
  return { type: "bar", data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((r) => r.color || c.accent), borderRadius: 4, barThickness: 14 }] }, options: o,
    plugins: [valueLabels(c, fmt)] };
}
function valueLabels(c, fmt) {
  return { id: "valueLabels", afterDatasetsDraw(chart) {
    const { ctx } = chart, rtl = !!chart.scales.x.options.reverse;
    ctx.save(); ctx.fillStyle = c.text; ctx.font = "11px Vazirmatn, sans-serif"; ctx.textBaseline = "middle";
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      const v = chart.data.datasets[0].data[i];
      const dir = (v >= 0 ? 1 : -1) * (rtl ? -1 : 1);
      ctx.textAlign = dir > 0 ? "left" : "right";
      ctx.fillText(fmt(v), bar.x + dir * 6, bar.y);
    });
    ctx.restore();
  } };
}

/** Score-per-model chart with the decision threshold drawn as a marker. */
export function probsConfig(rows, { c, ctx, scoreLabel, thrLabel, animate }) {
  const o = base(c, ctx, { animate });
  o.indexAxis = "y"; o.plugins.legend.display = true;
  o.scales = { x: { ...axis(c), min: 0, max: 100, reverse: ctx.rtl, title: { display: false } }, y: { ...axis(c), grid: { display: false }, position: ctx.rtl ? "right" : "left" } };
  return { type: "bar", data: { labels: rows.map((r) => r.label), datasets: [
    { label: scoreLabel, data: rows.map((r) => r.prob * 100), backgroundColor: rows.map((r) => (r.positive ? c.pos : c.neg)), borderRadius: 4, barThickness: 14, order: 2 },
    { label: thrLabel, type: "scatter", data: rows.map((r, i) => ({ x: r.threshold * 100, y: i })), pointStyle: "rectRot", pointRadius: 5, backgroundColor: c.text, borderColor: c.bg, borderWidth: 1, order: 1 },
  ] }, options: o };
}

/** Diverging Shapley chart in percentage points. rows=[{label,value}] sorted by |value|. */
export function xaiConfig(rows, { c, ctx, axisTitle, animate, fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) }) {
  const o = base(c, ctx, { animate });
  o.indexAxis = "y";
  o.plugins.tooltip.callbacks = { label: (i) => ` ${(i.parsed.x >= 0 ? "+" : "") + i.parsed.x.toFixed(2)}` };
  o.scales = { x: { ...axis(c), grace: "20%", reverse: ctx.rtl, title: { display: true, text: axisTitle, color: c.muted, font: { family: "Vazirmatn" } } }, y: { ...axis(c), grid: { display: false }, position: ctx.rtl ? "right" : "left" } };
  return { type: "bar", data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((r) => (r.value >= 0 ? c.pos : c.neg)), borderRadius: 4, barThickness: 16 }] }, options: o,
    plugins: [valueLabels(c, fmt)] };
}

export function radarConfig(datasets, labels, { c, ctx, animate }) {
  const o = base(c, ctx, { animate });
  o.plugins.legend = { display: true, position: "bottom", labels: { color: c.text, boxWidth: 10, font: { family: "Vazirmatn", size: 10 } } };
  o.scales = { r: { min: 40, max: 100, angleLines: { color: c.grid }, grid: { color: c.grid }, pointLabels: { color: c.text, font: { family: "Vazirmatn" } }, ticks: { color: c.muted, backdropColor: "transparent", showLabelBackdrop: false } } };
  return { type: "radar", data: { labels, datasets }, options: o };
}

/** Offscreen render for the PDF: always light theme, no animation, returns PNG data URL. */
export function toImage(buildConfig, width, height) {
  const canvas = document.createElement("canvas"); canvas.width = width * 2; canvas.height = height * 2;
  canvas.style.width = width + "px"; canvas.style.height = height + "px";
  const holder = document.createElement("div"); holder.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;height:${height}px`;
  holder.appendChild(canvas); document.body.appendChild(holder);
  const cfg = buildConfig(); cfg.options.animation = false; cfg.options.responsive = false; cfg.options.devicePixelRatio = 2;
  const chart = new Chart(canvas, cfg);
  const url = canvas.toDataURL("image/png"); chart.destroy(); holder.remove();
  return url;
}
