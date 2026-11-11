import { consensus } from "./core.js";
import { toImage, barConfig, probsConfig, xaiConfig, palette } from "./charts.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src)); document.head.appendChild(s);
  }));
  return loaded.get(src);
}

/**
 * Build the A4 report pages (794x1123 CSS px each) inside #reportStage and render them into a PDF.
 * Text is rasterised by the browser itself, so Persian shaping and RTL layout are always correct.
 * entry: {ts, inputs, results[], mode, thresholdMode}; xai: {modelName, rows[{label,value}]} | null
 */
export async function buildPdf({ entry, xai, ctx }) {
  const { t, config, evaluation, nf, lang } = ctx;
  const stage = document.getElementById("reportStage");
  const c = palette.light, rtl = lang === "fa";
  const dateStr = new Intl.DateTimeFormat(ctx.locale, { dateStyle: "full", timeStyle: "medium" }).format(new Date(entry.ts));
  const cons = consensus(entry.results);
  const missingZero = config.notes.missing_zero_features;
  const results = entry.results.filter((r) => Number.isFinite(r.prob));

  const probImg = results.length > 1 ? toImage(() => probsConfig(results.map((r) => ({ label: r.name, ...r })), { c, ctx: { rtl }, scoreLabel: t("res.score"), thrLabel: t("res.thr"), animate: false }), 700, 400) : null;
  const aucImg = toImage(() => barConfig(config.models.map((m) => ({ label: m.name, value: m.auc })), { c, ctx: { rtl }, title: "ROC-AUC", animate: false }), 700, 300);
  const xaiImg = xai ? toImage(() => xaiConfig(xai.rows, { c, ctx: { rtl }, axisTitle: t("xai.axis"), animate: false }), 700, 300) : null;

  const th = (txt) => `<th>${esc(txt)}</th>`;
  const inputRows = config.features.map((f) => {
    const v = entry.inputs[f.key], miss = missingZero.includes(f.key) && v === 0;
    return `<tr><td>${esc(t(`features.${f.key}.label`))} <span class="en">${esc(f.key)}</span></td><td class="num">${miss ? esc(t("pdf.missing")) : esc(nf(v))} ${esc(t(`features.${f.key}.unit`))}</td></tr>`;
  }).join("");
  const resultRows = results.map((r) => `<tr><td class="en-cell">${esc(r.name)}</td><td class="num">${esc(nf(r.prob * 100, 2))}%</td><td class="num">${esc(nf(r.threshold, 4))}</td><td class="${r.positive ? "pos" : "neg"}">${esc(t(r.positive ? "res.pos" : "res.neg"))}</td></tr>`).join("");
  const best = (k) => Math.max(...config.models.map((m) => (k === "precision" ? evaluation.models[m.id].precision : m[k])));
  const cell = (k, v) => `<td class="num${v === best(k) ? " best" : ""}">${esc(nf(v, 2))}</td>`;
  const cmpRows = config.models.map((m) => `<tr><td class="en-cell">${esc(m.name)}</td>${cell("accuracy", m.accuracy)}${cell("precision", evaluation.models[m.id].precision)}${cell("recall", m.recall)}${cell("f1", m.f1)}${cell("auc", m.auc)}</tr>`).join("");

  const header = (title) => `<div class="rp-head"><div><div class="rp-title">${esc(title)}</div><div class="rp-sub">${esc(t("pdf.subtitle"))}</div></div><div class="rp-logo">DC</div></div>`;
  const pages = [];
  pages.push(`${header(t("pdf.title"))}
    <div class="rp-meta"><b>${esc(t("pdf.generated"))}:</b> ${esc(dateStr)}</div>
    ${cons.total > 1 ? `<div class="rp-verdict ${cons.level}"><b>${esc(t("res.overall"))}:</b> ${esc(t(cons.level === "high" ? "res.lvHigh" : cons.level === "low" ? "res.lvLow" : "res.lvMixed"))} — ${esc(t("res.votes", { p: nf(cons.positives), n: nf(cons.total) }))} · ${esc(t("res.meanScore"))}: ${esc(nf(cons.meanProb * 100, 1))}%</div>` : ""}
    <h3>${esc(t("pdf.inputs"))}</h3><table><thead><tr>${th(t("pdf.feature"))}${th(t("pdf.value"))}</tr></thead><tbody>${inputRows}</tbody></table>
    <h3>${esc(t("pdf.results"))} <span class="small">(${esc(t(entry.thresholdMode === "tuned" ? "res.mode_tuned" : "res.mode_05"))})</span></h3>
    <table><thead><tr>${th(t("pdf.model"))}${th(t("pdf.score"))}${th(t("res.thr"))}${th(t("pdf.predClass"))}</tr></thead><tbody>${resultRows}</tbody></table>`);
  pages.push(`${header(t("pdf.compare"))}
    <table><thead><tr>${th(t("pdf.model"))}${th("Accuracy")}${th("Precision")}${th("Recall")}${th("F1")}${th("ROC-AUC")}</tr></thead><tbody>${cmpRows}</tbody></table>
    <p class="small">${esc(t("cmp.note", { n: nf(evaluation.testSetSize), p: nf(evaluation.testPositives) }))}</p>
    ${probImg ? `<h3>${esc(t("res.chart"))}</h3><img src="${probImg}" class="chart" alt="">` : ""}`);
  pages.push(`${header(t("pdf.charts"))}
    <h3>ROC-AUC</h3><img src="${aucImg}" class="chart" alt="">
    ${xaiImg ? `<h3>${esc(t("pdf.xaiTitle", { model: xai.modelName }))}</h3><img src="${xaiImg}" class="chart" alt=""><p class="small">${esc(t("xai.method"))}</p>` : ""}
    <h3>${esc(t("pdf.limits"))}</h3><ul>${t("pdf.limitsList").map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);

  stage.innerHTML = pages.map((p, i) => `<section class="rp-page" dir="${rtl ? "rtl" : "ltr"}" lang="${lang}">${p}<div class="rp-foot"><span>${esc(t("banner"))}</span><span>${esc(t("pdf.page", { i: nf(i + 1), n: nf(pages.length) }))}</span></div></section>`).join("");

  await Promise.all([loadScript("./vendor/pdf/html2canvas.min.js"), loadScript("./vendor/pdf/jspdf.umd.min.js")]);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const els = [...stage.querySelectorAll(".rp-page")];
  for (let i = 0; i < els.length; i++) {
    const canvas = await html2canvas(els[i], { scale: 2, backgroundColor: "#ffffff", logging: false });
    if (i) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H, undefined, "FAST");
  }
  stage.innerHTML = "";
  const d = new Date(entry.ts), p2 = (n) => String(n).padStart(2, "0");
  const name = `diabetes-risk-report-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.pdf`;
  pdf.setProperties({ title: t("pdf.title"), subject: "Diabetes Checker WEB", creator: "Diabetes Checker Professional 2.0" });
  return { blob: pdf.output("blob"), name };
}
