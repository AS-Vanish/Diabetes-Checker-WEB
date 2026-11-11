// Pure logic (no DOM, no ONNX) — shared by the app and by the Node unit tests.

export const INTEGER_FEATURES = ["Pregnancies", "Age"];

/** Accept Persian/Arabic-Indic digits and separators typed by the user. */
export function normalizeNumberText(s) {
  return String(s ?? "").trim()
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u066B\u060C,]/g, ".").replace(/[\u066C\s]/g, "");
}

/**
 * Validate raw form strings against the feature definitions of assets/models.json.
 * Returns { ok, errors: {key: code}, warnings: {key: code}, values: {key: number} }.
 * Codes: required | invalid | range | integer ; warnings: zeroMissing
 * A literal 0 in a `missing_zero_features` column is accepted and treated as "missing"
 * (same training-time convention as the original project).
 */
export function validateInputs(raw, features, missingZeroKeys) {
  const errors = {}, warnings = {}, values = {};
  for (const f of features) {
    const text = normalizeNumberText(raw[f.key]);
    if (text === "") { errors[f.key] = "required"; continue; }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) { errors[f.key] = "invalid"; continue; }
    const v = Number(text);
    if (!Number.isFinite(v)) { errors[f.key] = "invalid"; continue; }
    if (v < f.min || v > f.max) { errors[f.key] = "range"; continue; }
    if (INTEGER_FEATURES.includes(f.key) && !Number.isInteger(v)) { errors[f.key] = "integer"; continue; }
    values[f.key] = v;
    if (v === 0 && missingZeroKeys.includes(f.key)) warnings[f.key] = "zeroMissing";
  }
  return { ok: Object.keys(errors).length === 0, errors, warnings, values };
}

/** Model input vector in the exact feature order of the config; 0 -> NaN for missing-zero columns. */
export function toModelVector(values, features, missingZeroKeys) {
  return features.map((f) => (missingZeroKeys.includes(f.key) && values[f.key] === 0 ? NaN : values[f.key]));
}

/**
 * All 2^n coalitions for exact baseline-Shapley values. In coalition `mask`, feature i keeps the
 * user's value if bit i is set and is replaced by NaN otherwise. Every ONNX pipeline starts with an
 * Imputer that turns NaN into the training median, so NaN == "baseline (training median)".
 */
export function buildCoalitions(vector) {
  const n = vector.length, rows = 1 << n, out = new Float32Array(rows * n);
  for (let mask = 0; mask < rows; mask++)
    for (let i = 0; i < n; i++) out[mask * n + i] = (mask >> i) & 1 ? vector[i] : NaN;
  return out;
}

/** Exact Shapley values from the model outputs of all coalitions (probs indexed by mask). */
export function shapleyFromCoalitions(probs, n) {
  const fact = [1]; for (let k = 1; k <= n; k++) fact[k] = fact[k - 1] * k;
  const phi = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let mask = 0; mask < 1 << n; mask++) {
      if ((mask >> i) & 1) continue;
      let size = 0; for (let m = mask; m; m &= m - 1) size++;
      const w = (fact[size] * fact[n - size - 1]) / fact[n];
      phi[i] += w * (probs[mask | (1 << i)] - probs[mask]);
    }
  }
  return { phi, base: probs[0], full: probs[(1 << n) - 1] };
}

/** Pick the positive-class probability for row `row` from an ONNX output tensor {data, dims}. */
export function positiveProbability(tensor, row = 0) {
  const dims = tensor.dims;
  if (dims.length === 2 && dims[1] === 2) return Number(tensor.data[row * 2 + 1]);
  throw new Error("Unexpected probability output shape: [" + dims.join(",") + "]");
}

export function classify(prob, model, thresholdMode) {
  const threshold = thresholdMode === "tuned" ? model.threshold : 0.5;
  return { threshold, positive: prob >= threshold };
}

/** Overall verdict of many model results: share of models predicting the positive class. */
export function consensus(results) {
  const ok = results.filter((r) => r && Number.isFinite(r.prob));
  const positives = ok.filter((r) => r.positive).length;
  const mean = ok.length ? ok.reduce((s, r) => s + r.prob, 0) / ok.length : NaN;
  const share = ok.length ? positives / ok.length : NaN;
  let level = "none";
  if (ok.length) level = share >= 2 / 3 ? "high" : share <= 1 / 3 ? "low" : "mixed";
  return { total: ok.length, positives, share, meanProb: mean, level };
}

export function median(arr) {
  const a = [...arr].sort((x, y) => x - y), m = a.length >> 1;
  return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : NaN;
}

/** F1-consistency check used in tests: derived confusion matrix must reproduce published metrics. */
export function metricsFromConfusion({ tp, fp, fn, tn }) {
  const n = tp + fp + fn + tn;
  return {
    accuracy: round2((100 * (tp + tn)) / n),
    recall: round2((100 * tp) / (tp + fn)),
    f1: round2((100 * 2 * tp) / (2 * tp + fp + fn)),
    precision: tp + fp ? round2((100 * tp) / (tp + fp)) : null,
  };
}
export const round2 = (x) => Math.round(x * 100) / 100;
