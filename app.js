// Diabetes Checker — Professional 2.0 (entry point). Everything runs client-side.
import fa from "./i18n/fa.js";
import en from "./i18n/en.js";
import { validateInputs, toModelVector, classify, consensus, INTEGER_FEATURES } from "./js/core.js";
import { Engine, describeError } from "./js/engine.js";
import { loadHistory, addEntry, removeEntry, clearHistory, storageAvailable, historyLimit } from "./js/store.js";
import * as charts from "./js/charts.js";
import { palette, themeName } from "./js/charts.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dict = { fa, en };
const SAMPLE = { Pregnancies: 6, Glucose: 148, BloodPressure: 72, SkinThickness: 35, Insulin: 0, BMI: 33.6, DiabetesPedigreeFunction: 0.627, Age: 50 };
const ROUTES = ["dashboard", "assess", "compare", "history", "about"];

const S = {
  lang: "fa", config: null, evaluation: null, roc: null, engine: null,
  formValues: {}, last: null, saved: false, bench: new Map(), sort: { key: "auc", dir: -1 },
  route: "dashboard", ready: false, xaiToken: 0, running: false,
};

/* ---------- i18n helpers ---------- */
function t(key, params) {
  const get = (d) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), d);
  let v = get(dict[S.lang]); if (v === undefined) v = get(dict.en); if (v === undefined) return key;
  return typeof v === "string" && params ? v.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? "")) : v;
}
const nf = (v, digits = 2) => new Intl.NumberFormat(dict[S.lang].locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
const nf2 = (v, d = 2) => new Intl.NumberFormat(dict[S.lang].locale, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const rtl = () => S.lang === "fa";
const cc = () => ({ c: palette[themeName()], ctx: { rtl: rtl(), locale: dict[S.lang].locale } });
const fLabel = (k) => t(`features.${k}.label`);

function applyI18n() {
  const d = dict[S.lang];
  document.documentElement.lang = S.lang; document.documentElement.dir = d.dir;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("langLabel").textContent = d.switchTo;
  $("langBtn").setAttribute("aria-label", S.lang === "fa" ? "Switch to English" : "تغییر به فارسی");
  $("themeBtn").setAttribute("aria-label", S.lang === "fa" ? "تغییر پوسته" : "Toggle theme");
  $("footText").textContent = t("footer");
  document.title = S.lang === "fa" ? "چکر دیابت · نسخه حرفه‌ای ۲٫۰" : "Diabetes Checker · Professional 2.0";
  $("guideList").innerHTML = t("assess.guide").map((x) => `<li>${esc(x)}</li>`).join("");
}
function toast(msg, kind = "") {
  const el = $("toast"); el.textContent = msg; el.className = "toast " + kind; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3600);
}

/* ---------- theme / language ---------- */
function setTheme(name) {
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem("dc.theme", name); } catch {}
  renderView(S.route);
}
function setLang(l) {
  readFormValues(); S.lang = l;
  try { localStorage.setItem("dc.lang", l); } catch {}
  applyI18n(); renderStatus(); renderView(S.route);
}

/* ---------- routing ---------- */
function route() {
  const r = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
  S.route = ROUTES.includes(r) ? r : "dashboard";
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== S.route));
  document.querySelectorAll("#tabs a").forEach((a) => { const on = a.dataset.route === S.route; a.classList.toggle("active", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
  renderView(S.route);
  window.scrollTo({ top: 0 });
}
function renderView(r) {
  if (!S.ready) return;
  charts.destroyAll();
  ({ dashboard: renderDashboard, assess: renderAssess, compare: renderCompare, history: renderHistory, about: renderAbout })[r]();
}

/* ---------- status ---------- */
function renderStatus() {
  const el = $("runtimeStatus");
  if (S.fatal) { el.textContent = t("status.error"); el.className = "status bad"; return; }
  if (!S.ready) { el.textContent = t("status.init"); el.className = "status"; return; }
  el.textContent = t("status.ready", { n: nf(S.config.models.length) }); el.className = "status ok";
}
function showFatal(message) {
  S.fatal = true; renderStatus();
  const box = document.createElement("div"); box.className = "alert err"; box.setAttribute("role", "alert"); box.textContent = message;
  $("main").prepend(box);
}

/* ---------- dashboard ---------- */
const bestOf = (k) => S.config.models.reduce((a, m) => (m[k] > a[k] ? m : a));
function renderDashboard() {
  const m = S.config.models, bAuc = bestOf("auc"), bRec = bestOf("recall"), bAcc = bestOf("accuracy");
  const card = (label, value, sub = "") => `<div class="stat"><div class="stat-l">${esc(label)}</div><div class="stat-v">${esc(value)}</div><div class="stat-s">${esc(sub)}</div></div>`;
  $("statCards").innerHTML = [
    card(t("dash.s_models"), nf(m.length), "ONNX"),
    card(t("dash.s_loaded"), `${nf(S.engine.loadedCount())} / ${nf(m.length)}`),
    card(t("dash.s_bestAuc"), nf2(bAuc.auc) + "%", bAuc.name),
    card(t("dash.s_bestRecall"), nf2(bRec.recall) + "%", bRec.name),
    card(t("dash.s_bestAcc"), nf2(bAcc.accuracy) + "%", bAcc.name),
    card(t("dash.s_history"), nf(loadHistory().length)),
    card(t("dash.s_runtime"), "ORT " + (window.ort?.env?.versions?.web || "1.20"), "WASM"),
    card(t("dash.s_privacy"), t("dash.s_privacyV"), "localStorage"),
  ].join("");
  renderModelStatus();
  const rows = [...m].sort((a, b) => b.auc - a.auc).map((x) => ({ label: x.name, value: x.auc }));
  charts.draw("chAucDash", charts.barConfig(rows, { ...cc(), fmt: (v) => nf2(v), title: "ROC-AUC", max: 100 }));
}
function renderModelStatus() {
  const g = $("modelStatusGrid"); if (!g) return;
  g.innerHTML = S.config.models.map((m) => {
    const i = S.engine.info.get(m.id), pct = i.total ? Math.round((i.loaded / i.total) * 100) : 0;
    const label = i.status === "ready" ? t("status.ok") : i.status === "loading" ? `${nf(pct)}%` : i.status === "error" ? t("status.fail") : t("status.idle");
    const meta = i.status === "ready" ? `<bdi>${nf(i.total / 1024, 0)} KB</bdi> · <bdi>${nf(i.loadMs, 0)} ${esc(t("res.ms"))}</bdi>` : "";
    return `<div class="mrow ${i.status}"><span class="dot"></span><div class="mname" dir="ltr">${esc(m.name)}</div><div class="mmeta">${meta}</div><span class="chip ${i.status}">${esc(label)}</span>${i.status === "loading" ? `<div class="bar thin"><i style="width:${pct}%"></i></div>` : ""}</div>`;
  }).join("");
  const loaded = document.querySelector("#statCards .stat:nth-child(2) .stat-v");
  if (loaded) loaded.textContent = `${nf(S.engine.loadedCount())} / ${nf(S.config.models.length)}`;
}
async function preloadAll() {
  const btn = $("preloadBtn"); btn.disabled = true;
  try { for (const m of S.config.models) { try { await S.engine.load(m); } catch (e) { toast(describeError(e, t, m), "err"); } } }
  finally { btn.disabled = false; }
}

/* ---------- form ---------- */
function readFormValues() { S.config?.features.forEach((f) => { const el = $("f_" + f.key); if (el) S.formValues[f.key] = el.value; }); }
function renderForm() {
  $("fields").innerHTML = S.config.features.map((f) => {
    const isInt = INTEGER_FEATURES.includes(f.key), unit = t(`features.${f.key}.unit`);
    return `<div class="field" id="w_${f.key}">
      <label for="f_${f.key}"><span class="fl">${esc(fLabel(f.key))}</span></label>
      <input id="f_${f.key}" name="${f.key}" type="text" inputmode="${isInt ? "numeric" : "decimal"}" autocomplete="off" dir="ltr" value="${esc(S.formValues[f.key] ?? "")}" aria-describedby="h_${f.key}" placeholder="${f.min}–${f.max}">
      <div class="hint" id="h_${f.key}">${esc(t(`features.${f.key}.hint`))}<span class="fk" dir="ltr">${esc(f.key)}${unit ? " · " + esc(unit) : ""}</span></div>
      <div class="ferr" id="e_${f.key}" role="alert"></div></div>`;
  }).join("");
  S.config.features.forEach((f) => $("f_" + f.key).addEventListener("input", () => { S.formValues[f.key] = $("f_" + f.key).value; if ($("w_" + f.key).classList.contains("invalid")) validateForm(false, f.key); }));
  $("modelSelect").innerHTML = S.config.models.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  if (S.formValues.__model) $("modelSelect").value = S.formValues.__model;
}
function validateForm(showAll = true, only = null) {
  const raw = Object.fromEntries(S.config.features.map((f) => [f.key, $("f_" + f.key).value]));
  const v = validateInputs(raw, S.config.features, S.config.notes.missing_zero_features);
  for (const f of S.config.features) {
    if (only && f.key !== only) continue;
    const w = $("w_" + f.key), e = $("e_" + f.key), inp = $("f_" + f.key), code = v.errors[f.key];
    w.classList.toggle("invalid", !!code); inp.setAttribute("aria-invalid", code ? "true" : "false");
    e.textContent = code ? t("err." + code, { min: nf(f.min), max: nf(f.max) }) : v.warnings[f.key] ? t("assess.zeroMissing") : "";
    e.classList.toggle("warn", !code && !!v.warnings[f.key]);
  }
  return v;
}
function fillForm(values) {
  S.config.features.forEach((f) => { S.formValues[f.key] = String(values[f.key] ?? ""); $("f_" + f.key).value = S.formValues[f.key]; });
  validateForm(); $("formError").hidden = true;
}

/* ---------- running ---------- */
function setProgress(text, pct) {
  $("progress").hidden = text === null;
  if (text !== null) { $("progressText").textContent = text; $("progressBar").style.width = pct + "%"; }
}
async function runAssessment(ev) {
  ev.preventDefault(); if (S.running) return;
  const v = validateForm(true), err = $("formError");
  if (!v.ok) { err.textContent = t("err.fixForm"); err.hidden = false; const first = S.config.features.find((f) => v.errors[f.key]); $("f_" + first.key).focus(); return; }
  err.hidden = true;
  const mode = document.querySelector('input[name="mode"]:checked').value, thresholdMode = $("thresholdMode").value;
  const models = mode === "all" ? S.config.models : [S.config.models.find((m) => m.id === $("modelSelect").value)];
  const vector = toModelVector(v.values, S.config.features, S.config.notes.missing_zero_features);
  S.running = true; $("runBtn").disabled = true; $("runBtn").textContent = t("assess.running");
  const results = [];
  try {
    for (let i = 0; i < models.length; i++) {
      const m = models[i];
      setProgress(t("assess.progressModel", { name: m.name, i: nf(i + 1), n: nf(models.length) }), (i / models.length) * 100);
      try {
        const { prob, ms } = await S.engine.predict(m, vector);
        results.push({ id: m.id, name: m.name, prob, ms, loadMs: S.engine.info.get(m.id).loadMs, ...classify(prob, m, thresholdMode) });
      } catch (e) { results.push({ id: m.id, name: m.name, prob: NaN, error: describeError(e, t, m) }); }
    }
    setProgress(t("assess.progressModel", { name: "", i: nf(models.length), n: nf(models.length) }), 100);
    S.last = { ts: new Date().toISOString(), inputs: v.values, results, mode, thresholdMode, restored: false }; S.saved = false;
    renderResults();
    $("resultArea").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  } finally { S.running = false; $("runBtn").disabled = false; $("runBtn").textContent = t("assess.run"); setTimeout(() => setProgress(null), 600); }
}

/* ---------- results ---------- */
function renderAssess() {
  renderForm(); applyI18n();
  const mode = document.querySelector('input[name="mode"]:checked').value;
  $("modelWrap").hidden = mode !== "one";
  if (Object.keys(S.formValues).filter((k) => !k.startsWith("__")).length) validateForm();
  renderResults();
}
function renderResults() {
  const L = S.last; $("resultArea").hidden = !L; if (!L) return;
  const ok = L.results.filter((r) => Number.isFinite(r.prob)), cons = consensus(L.results);
  $("pdfBtn").disabled = !ok.length; $("saveBtn").disabled = S.saved || L.restored || !ok.length;
  let overall = "";
  if (L.restored) overall += `<div class="alert info">${esc(t("res.restored"))} · ${esc(new Intl.DateTimeFormat(dict[S.lang].locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(L.ts)))}</div>`;
  if (cons.total > 1) {
    const lv = { high: "lvHigh", low: "lvLow", mixed: "lvMixed" }[cons.level];
    overall += `<div class="verdict ${cons.level}"><div><div class="v-title">${esc(t("res.overall"))}</div><div class="v-main">${esc(t("res." + lv))}</div>
      <div class="muted">${esc(t("res.votes", { p: nf(cons.positives), n: nf(cons.total) }))} · ${esc(t("res.meanScore"))}: <b>${nf(cons.meanProb * 100, 1)}%</b></div></div>
      <div class="dots" role="img" aria-label="${esc(t("res.votes", { p: nf(cons.positives), n: nf(cons.total) }))}">${ok.map((r) => `<i class="${r.positive ? "p" : "n"}" title="${esc(r.name)}"></i>`).join("")}</div></div>`;
  }
  overall += `<p class="muted small">${esc(t(L.thresholdMode === "tuned" ? "res.mode_tuned" : "res.mode_05"))} · ${esc(t("res.advice"))}</p>`;
  $("overall").innerHTML = overall;
  $("resultGrid").innerHTML = L.results.map((r) => {
    if (!Number.isFinite(r.prob)) return `<div class="rcard failed"><div class="rname" dir="ltr">${esc(r.name)}</div><div class="alert err">${esc(r.error || t("res.failed"))}</div></div>`;
    return `<div class="rcard ${r.positive ? "pos" : "neg"}"><div class="rtop"><div class="rname" dir="ltr">${esc(r.name)}</div><span class="tag ${r.positive ? "pos" : "neg"}">${r.positive ? "▲" : "●"} ${esc(t(r.positive ? "res.pos" : "res.neg"))}</span></div>
      <div class="rscore" dir="ltr">${nf2(r.prob * 100)}<small>%</small></div>
      <div class="meter" dir="ltr"><i style="width:${(r.prob * 100).toFixed(1)}%"></i><b style="left:${(r.threshold * 100).toFixed(1)}%" title="${esc(t("res.thr"))}"></b></div>
      <div class="rmeta"><span>${esc(t("res.thr"))}: ${nf(r.threshold, 4)}</span>${r.ms != null ? `<span>${esc(t("res.time"))}: ${nf(r.ms, 1)} ${esc(t("res.ms"))}</span>` : ""}</div></div>`;
  }).join("");
  const rows = ok.map((r) => ({ label: r.name, ...r }));
  if (rows.length) charts.draw("chProbs", charts.probsConfig(rows, { ...cc(), scoreLabel: t("res.score"), thrLabel: t("res.thr") }));
  $("xaiModel").innerHTML = ok.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
  renderXai();
}
async function renderXai() {
  const L = S.last; if (!L) return;
  const text = $("xaiText"), id = $("xaiModel").value, model = S.config.models.find((m) => m.id === id);
  if (!model) { text.textContent = t("xai.needRun"); return; }
  const token = ++S.xaiToken; text.textContent = t("xai.computing");
  try {
    const vector = toModelVector(L.inputs, S.config.features, S.config.notes.missing_zero_features);
    const { phi, base, full } = await S.engine.explain(model, vector);
    if (token !== S.xaiToken) return;
    const rows = S.config.features.map((f, i) => {
      const miss = S.config.notes.missing_zero_features.includes(f.key) && L.inputs[f.key] === 0;
      return { key: f.key, label: `${fLabel(f.key)} = ${miss ? "?" : nf(L.inputs[f.key], 3)}`, value: phi[i] * 100 };
    }).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    S.xai = { modelName: model.name, rows: rows.map(({ label, value }) => ({ label, value })) };
    charts.draw("chXai", charts.xaiConfig(S.xai.rows, { ...cc(), fmt: (v) => (v >= 0 ? "+" : "") + nf(v, 1), axisTitle: t("xai.axis") }));
    const top = rows.slice(0, 3).map((r) => `${fLabel(r.key)} (${r.value >= 0 ? "+" : ""}${nf(r.value, 1)})`).join(S.lang === "fa" ? "، " : ", ");
    text.innerHTML = `<p>${esc(t("xai.summary", { top, base: nf(base * 100, 1) + "%", full: nf(full * 100, 1) + "%" }))}</p><p class="muted small">${esc(t("xai.pushUp"))}</p><p class="muted small">${esc(t("xai.method"))}</p>`;
  } catch (e) { console.error(e); if (token === S.xaiToken) { S.xai = null; text.textContent = t("xai.unsupported"); } }
}

async function exportPdf(entry) {
  const btns = [$("pdfBtn")]; btns.forEach((b) => (b.disabled = true));
  try {
    const { buildPdf } = await import("./js/report.js");
    let xai = null;
    if (entry === S.last && S.xai) xai = S.xai;
    const out = await buildPdf({ entry, xai, ctx: { t, config: S.config, evaluation: S.evaluation, nf: (v, d = 2) => nf(v, d), lang: S.lang, locale: dict[S.lang].locale } });
    const a = document.createElement("a"); a.href = URL.createObjectURL(out.blob); a.download = out.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { console.error(e); toast(t("err.pdf"), "err"); }
  finally { btns.forEach((b) => (b.disabled = false)); }
}
function saveCurrent() {
  if (!S.last || S.saved) return;
  if (!storageAvailable()) return toast(t("err.storage"), "err");
  const { inputs, results, mode, thresholdMode } = S.last;
  const e = addEntry({ inputs, mode, thresholdMode, results: results.filter((r) => Number.isFinite(r.prob)).map(({ id, name, prob, threshold, positive, ms }) => ({ id, name, prob, threshold, positive, ms })) });
  if (!e) return toast(t("err.storage"), "err");
  S.saved = true; $("saveBtn").disabled = true; toast(t("res.saved"), "ok");
}

/* ---------- compare ---------- */
const METRICS = ["accuracy", "precision", "recall", "f1", "auc"];
const metricVal = (m, k) => (k === "precision" ? S.evaluation.models[m.id].precision : k === "time" ? S.bench.get(m.id) ?? null : k === "name" ? m.name : m[k]);
function renderCompare() {
  const cols = t("cmp.cols"), keys = ["name", ...METRICS, "time", "threshold"];
  const sorted = [...S.config.models].sort((a, b) => {
    const x = S.sort.key === "threshold" ? a.threshold : metricVal(a, S.sort.key), y = S.sort.key === "threshold" ? b.threshold : metricVal(b, S.sort.key);
    if (x == null) return 1; if (y == null) return -1;
    return S.sort.key === "name" ? S.sort.dir * x.localeCompare(y) : S.sort.dir * (x - y);
  });
  const best = Object.fromEntries(METRICS.map((k) => [k, Math.max(...S.config.models.map((m) => metricVal(m, k)))]));
  const bestTime = S.bench.size ? Math.min(...S.bench.values()) : null;
  const head = keys.map((k) => `<th scope="col" data-k="${k}" aria-sort="${S.sort.key === k ? (S.sort.dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${k}">${esc(cols[k === "name" ? "model" : k])}<span class="arr">${S.sort.key === k ? (S.sort.dir > 0 ? "▲" : "▼") : ""}</span></button></th>`).join("");
  const body = sorted.map((m) => `<tr><th scope="row" dir="ltr">${esc(m.name)}</th>${METRICS.map((k) => { const v = metricVal(m, k); return `<td class="${v === best[k] ? "best" : ""}">${nf2(v)}%</td>`; }).join("")}
    <td class="${S.bench.get(m.id) === bestTime && bestTime != null ? "best" : ""}">${S.bench.has(m.id) ? nf(S.bench.get(m.id), 3) : "—"}</td><td>${nf(m.threshold, 4)}</td></tr>`).join("");
  $("cmpTable").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  $("cmpNote").textContent = `${t("cmp.note", { n: nf(S.evaluation.testSetSize), p: nf(S.evaluation.testPositives) })} ${t("cmp.timeNote")} ${t("cmp.sortHint")}`;
  const ms = $("metricSelect"), cur = ms.value || "auc";
  ms.innerHTML = METRICS.map((k) => `<option value="${k}">${esc(t("cmp.cols." + k))}</option>`).join(""); ms.value = cur;
  const cm = $("cmModel"), curM = cm.value || S.config.models[0].id;
  cm.innerHTML = S.config.models.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join(""); cm.value = curM;
  renderMetricChart(); renderRadar(); renderCm(); renderRoc();
}
function renderMetricChart() {
  const k = $("metricSelect").value;
  const rows = S.config.models.map((m) => ({ label: m.name, value: metricVal(m, k) })).sort((a, b) => b.value - a.value);
  charts.draw("chMetric", charts.barConfig(rows, { ...cc(), fmt: (v) => nf2(v), title: t("cmp.cols." + k), max: 100 }));
}
function renderRadar() {
  const labels = ["Accuracy", "Precision", "Recall", "F1", "AUC"];
  const ds = S.config.models.map((m, i) => { const h = Math.round((i * 360) / S.config.models.length), col = `hsl(${h} 70% ${themeName() === "dark" ? 62 : 42}%)`;
    return { label: m.name, data: METRICS.map((k) => metricVal(m, k)), borderColor: col, backgroundColor: "transparent", pointRadius: 2, borderWidth: 1.5, hidden: i > 3 }; });
  charts.draw("chRadar", charts.radarConfig(ds, labels, cc()));
}
function renderCm() {
  const m = S.config.models.find((x) => x.id === $("cmModel").value), e = S.evaluation.models[m.id], P = S.evaluation.testPositives, N = S.evaluation.testSetSize - P;
  const cell = (cls, label, v, tot) => `<div class="cm-cell ${cls}" style="--a:${(v / tot).toFixed(2)}"><div class="cm-n">${nf(v)}</div><div class="cm-p">${nf((100 * v) / tot, 1)}%</div><div class="cm-l">${esc(label)}</div></div>`;
  $("cmBox").innerHTML = `<div class="cm" dir="ltr"><div class="cm-corner">${esc(t("cmp.actual"))} ↓ / ${esc(t("cmp.predicted"))} →</div><div class="cm-h">${esc(t("cmp.negC"))}</div><div class="cm-h">${esc(t("cmp.posC"))}</div>
    <div class="cm-h side">${esc(t("cmp.negC"))}</div>${cell("good", t("cmp.cmTN"), e.tn, N)}${cell("bad", t("cmp.cmFP"), e.fp, N)}
    <div class="cm-h side">${esc(t("cmp.posC"))}</div>${cell("bad", t("cmp.cmFN"), e.fn, P)}${cell("good", t("cmp.cmTP"), e.tp, P)}</div>
    <p class="muted small">${esc(t("cmp.cols.precision"))}: <b>${nf2(e.precision)}%</b> · ${esc(t("cmp.specificity"))}: <b>${nf2(e.specificity)}%</b> · ${esc(t("cmp.cols.recall"))}: <b>${nf2(m.recall)}%</b></p>`;
}
function renderRoc() {
  const box = $("rocBox"), id = $("cmModel").value;
  if (S.roc?.models?.[id]) {
    box.textContent = t("cmp.rocReady"); box.className = "alert info";
    const { c } = cc(), r = S.roc.models[id];
    charts.draw("chAuc", { type: "line", data: { datasets: [{ label: S.config.models.find((m) => m.id === id).name, data: r.fpr.map((x, i) => ({ x, y: r.tpr[i] })), borderColor: c.accent, pointRadius: 0, borderWidth: 2, tension: 0 }, { label: "chance", data: [{ x: 0, y: 0 }, { x: 1, y: 1 }], borderColor: c.muted, borderDash: [5, 4], pointRadius: 0, borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: "linear", min: 0, max: 1, title: { display: true, text: "FPR", color: c.muted }, ticks: { color: c.muted }, grid: { color: c.grid } }, y: { min: 0, max: 1, title: { display: true, text: "TPR", color: c.muted }, ticks: { color: c.muted }, grid: { color: c.grid } } }, plugins: { legend: { labels: { color: c.text } } } } });
  } else {
    box.textContent = t("cmp.rocUnsupported"); box.className = "alert warn";
    const rows = [...S.config.models].sort((a, b) => b.auc - a.auc).map((m) => ({ label: m.name, value: m.auc, color: m.id === id ? palette[themeName()].accent2 : undefined }));
    charts.draw("chAuc", charts.barConfig(rows, { ...cc(), fmt: (v) => nf2(v), title: "ROC-AUC", max: 100 }));
  }
}
async function runBench() {
  const btn = $("benchBtn"); btn.disabled = true; $("benchProgress").hidden = false;
  const vec = toModelVector(SAMPLE, S.config.features, S.config.notes.missing_zero_features), n = S.config.models.length;
  try {
    for (let i = 0; i < n; i++) {
      const m = S.config.models[i];
      $("benchText").textContent = t("cmp.benchRunning", { name: m.name, i: nf(i + 1), n: nf(n) }); $("benchBar").style.width = (i / n) * 100 + "%";
      try { S.bench.set(m.id, await S.engine.benchmark(m, vec, 20)); } catch (e) { toast(describeError(e, t, m), "err"); }
      await new Promise((r) => setTimeout(r));
    }
    $("benchBar").style.width = "100%";
  } finally { btn.disabled = false; setTimeout(() => ($("benchProgress").hidden = true), 600); if (S.route === "compare") renderCompare(); }
}

/* ---------- history ---------- */
function renderHistory() {
  const list = loadHistory(), box = $("histList"), fmt = new Intl.DateTimeFormat(dict[S.lang].locale, { dateStyle: "medium", timeStyle: "short" });
  $("clearHist").disabled = !list.length;
  if (!list.length) { box.innerHTML = `<div class="empty">${esc(t("hist.empty"))}</div>`; return; }
  box.innerHTML = list.map((e) => {
    const c = consensus(e.results), key = ["Glucose", "BMI", "Age"].map((k) => `${esc(fLabel(k))}: ${esc(nf(e.inputs[k], 2))}`).join(" · ");
    const v = e.results.length > 1 ? t("hist.verdict", { p: nf(c.positives), n: nf(c.total) }) : e.results[0] ? `${e.results[0].name}: ${nf(e.results[0].prob * 100, 1)}%` : "";
    return `<div class="hitem" data-id="${e.id}"><div class="hmain"><div class="hdate">${esc(fmt.format(new Date(e.ts)))} <span class="chip">${esc(t(e.mode === "all" ? "hist.mode_all" : "hist.mode_one"))}</span></div>
      <div class="hmeta">${key}</div></div><div class="hverdict ${c.level}">${esc(v)}</div>
      <div class="row-btns"><button class="btn sm" data-act="view">${esc(t("hist.view"))}</button><button class="btn sm" data-act="pdf">${esc(t("hist.pdf"))}</button><button class="btn sm danger ghost" data-act="del">${esc(t("hist.del"))}</button></div></div>`;
  }).join("");
}
function histClick(ev) {
  const b = ev.target.closest("button[data-act]"); if (!b) return;
  const id = b.closest(".hitem").dataset.id, e = loadHistory().find((x) => x.id === id); if (!e) return;
  if (b.dataset.act === "del") { removeEntry(id); renderHistory(); toast(t("hist.deleted")); }
  if (b.dataset.act === "view") {
    S.last = { ts: e.ts, inputs: e.inputs, results: e.results, mode: e.mode, thresholdMode: e.thresholdMode, restored: true }; S.saved = true; S.xai = null;
    S.config.features.forEach((f) => (S.formValues[f.key] = String(e.inputs[f.key])));
    location.hash = "#/assess";
  }
  if (b.dataset.act === "pdf") exportPdf({ ts: e.ts, inputs: e.inputs, results: e.results, mode: e.mode, thresholdMode: e.thresholdMode });
}

/* ---------- about ---------- */
function renderAbout() {
  $("aboutMedical").innerHTML = t("about.medicalHtml"); $("aboutTech").innerHTML = t("about.techHtml");
  $("aboutModels").innerHTML = `<h2>${esc(t("about.modelsTitle"))}</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>${esc(t("cmp.cols.model"))}</th><th>${esc(t("about.fileCol"))}</th><th>${esc(t("about.thrCol"))}</th></tr></thead><tbody>
    ${S.config.models.map((m, i) => `<tr><td>${nf(i + 1)}</td><th scope="row" dir="ltr">${esc(m.name)}</th><td dir="ltr"><code>models/${esc(m.file)}</code></td><td>${nf(m.threshold, 4)}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ---------- init ---------- */
async function fetchJson(path, optional = false) {
  const r = await fetch(path);
  if (!r.ok) { if (optional) return null; throw Object.assign(new Error(path + " HTTP " + r.status), { code: "config", file: path }); }
  return r.json();
}
function bind() {
  $("langBtn").addEventListener("click", () => setLang(S.lang === "fa" ? "en" : "fa"));
  $("themeBtn").addEventListener("click", () => setTheme(themeName() === "dark" ? "light" : "dark"));
  $("form").addEventListener("submit", runAssessment);
  $("sampleBtn").addEventListener("click", () => fillForm(SAMPLE));
  $("resetBtn").addEventListener("click", () => { S.config.features.forEach((f) => ($("f_" + f.key).value = "")); S.formValues = {}; S.config.features.forEach((f) => { $("w_" + f.key).classList.remove("invalid"); $("e_" + f.key).textContent = ""; }); $("formError").hidden = true; });
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => ($("modelWrap").hidden = document.querySelector('input[name="mode"]:checked').value !== "one")));
  $("modelSelect").addEventListener("change", () => (S.formValues.__model = $("modelSelect").value));
  $("xaiModel").addEventListener("change", renderXai);
  $("pdfBtn").addEventListener("click", () => S.last && exportPdf(S.last));
  $("saveBtn").addEventListener("click", saveCurrent);
  $("preloadBtn").addEventListener("click", preloadAll);
  $("benchBtn").addEventListener("click", runBench);
  $("metricSelect").addEventListener("change", renderMetricChart);
  $("cmModel").addEventListener("change", () => { renderCm(); renderRoc(); });
  $("cmpTable").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-sort]"); if (!b) return; const k = b.dataset.sort; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : k === "name" ? 1 : -1 }; renderCompare(); });
  $("histList").addEventListener("click", histClick);
  $("clearHist").addEventListener("click", () => { if (confirm(t("hist.confirmClear"))) { clearHistory(); renderHistory(); toast(t("hist.cleared")); } });
  window.addEventListener("hashchange", route);
}

(async function init() {
  try { S.lang = localStorage.getItem("dc.lang") || ((navigator.language || "fa").toLowerCase().startsWith("fa") ? "fa" : "en"); } catch {}
  applyI18n(); renderStatus(); bind();
  try {
    if (!window.ort) throw new Error(t("err.ortMissing"));
    if (!window.Chart) toast(t("err.chart"), "err");
    [S.config, S.evaluation] = await Promise.all([fetchJson("./assets/models.json"), fetchJson("./assets/evaluation.json")]);
    // Optional real ROC points: set "rocFile": "assets/roc.json" in evaluation.json (see tools/export_evaluation.py).
    if (S.evaluation.rocFile) S.roc = await fetchJson("./" + S.evaluation.rocFile, true).catch(() => null);
    S.engine = new Engine(S.config, () => { if (S.route === "dashboard") renderModelStatus(); });
    S.ready = true; window.__dc = { S, t }; // exposed for automated tests
    route(); renderStatus();
  } catch (e) {
    console.error(e);
    showFatal(e.code === "config" ? t("err.configLoad", { file: e.file }) : e.message);
  }
})();
