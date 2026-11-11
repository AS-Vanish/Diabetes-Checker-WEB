import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateInputs, toModelVector, buildCoalitions, shapleyFromCoalitions, consensus, positiveProbability, metricsFromConfusion, normalizeNumberText, classify } from "../js/core.js";
import fa from "../i18n/fa.js";
import en from "../i18n/en.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "assets/models.json"), "utf8"));
const evaluation = JSON.parse(fs.readFileSync(path.join(root, "assets/evaluation.json"), "utf8"));
const MZ = cfg.notes.missing_zero_features;
const sample = { Pregnancies: "6", Glucose: "148", BloodPressure: "72", SkinThickness: "35", Insulin: "0", BMI: "33.6", DiabetesPedigreeFunction: "0.627", Age: "50" };

test("project invariants: 11 models, feature order unchanged, files present", () => {
  assert.equal(cfg.models.length, 11);
  assert.deepEqual(cfg.features.map((f) => f.key), ["Pregnancies", "Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI", "DiabetesPedigreeFunction", "Age"]);
  assert.deepEqual(MZ, ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]);
  for (const m of cfg.models) assert.ok(fs.existsSync(path.join(root, "models", m.file)), m.file);
  for (const f of ["ort.min.js", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) assert.ok(fs.existsSync(path.join(root, "vendor/onnxruntime", f)), f);
});

test("validation: valid sample, missing, range, integer, Persian digits", () => {
  const ok = validateInputs(sample, cfg.features, MZ);
  assert.ok(ok.ok); assert.equal(ok.warnings.Insulin, "zeroMissing");
  assert.equal(validateInputs({ ...sample, Glucose: "" }, cfg.features, MZ).errors.Glucose, "required");
  assert.equal(validateInputs({ ...sample, Glucose: "abc" }, cfg.features, MZ).errors.Glucose, "invalid");
  assert.equal(validateInputs({ ...sample, Glucose: "301" }, cfg.features, MZ).errors.Glucose, "range");
  assert.equal(validateInputs({ ...sample, Age: "0" }, cfg.features, MZ).errors.Age, "range");
  assert.equal(validateInputs({ ...sample, Age: "30.5" }, cfg.features, MZ).errors.Age, "integer");
  assert.equal(validateInputs({ ...sample, BMI: "-1" }, cfg.features, MZ).errors.BMI, "range");
  assert.equal(validateInputs({ ...sample, BMI: "Infinity" }, cfg.features, MZ).errors.BMI, "invalid");
  const fa = validateInputs({ ...sample, Glucose: "۱۴۸", BMI: "۳۳٫۶" }, cfg.features, MZ);
  assert.ok(fa.ok); assert.equal(fa.values.Glucose, 148); assert.equal(fa.values.BMI, 33.6);
  assert.equal(normalizeNumberText(" ١٢٣ "), "123");
});

test("model vector keeps feature order and maps 0 -> NaN only for missing-zero columns", () => {
  const v = toModelVector(validateInputs(sample, cfg.features, MZ).values, cfg.features, MZ);
  assert.equal(v.length, 8); assert.equal(v[0], 6); assert.equal(v[1], 148); assert.ok(Number.isNaN(v[4])); assert.equal(v[7], 50);
  const z = toModelVector({ ...validateInputs(sample, cfg.features, MZ).values, Pregnancies: 0 }, cfg.features, MZ);
  assert.equal(z[0], 0, "Pregnancies 0 is a real value");
});

test("coalitions: 256 rows, mask 0 all-NaN, full mask equals input", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8], c = buildCoalitions(x);
  assert.equal(c.length, 256 * 8);
  assert.ok([...c.slice(0, 8)].every(Number.isNaN));
  assert.deepEqual([...c.slice(255 * 8, 256 * 8)], x);
  assert.equal(c[(1 << 3) * 8 + 3], 4); assert.ok(Number.isNaN(c[(1 << 3) * 8 + 2]));
});

test("Shapley: exact for additive model, efficiency holds for interacting model", () => {
  const n = 8, w = [3, -1, 0.5, 2, 0, 4, -2, 1];
  const add = Array.from({ length: 256 }, (_, m) => w.reduce((s, wi, i) => s + ((m >> i) & 1 ? wi : 0), 0));
  const r = shapleyFromCoalitions(add, n);
  r.phi.forEach((p, i) => assert.ok(Math.abs(p - w[i]) < 1e-9));
  const inter = Array.from({ length: 256 }, (_, m) => ((m & 1) && (m & 2) ? 5 : 0) + (m & 4 ? 1 : 0) + ((m >> 7) & 1) * 0.3);
  const q = shapleyFromCoalitions(inter, n), sum = q.phi.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - (q.full - q.base)) < 1e-9);
  assert.ok(Math.abs(q.phi[0] - 2.5) < 1e-9 && Math.abs(q.phi[1] - 2.5) < 1e-9);
});

test("probability extraction, classification, consensus", () => {
  assert.equal(positiveProbability({ dims: [1, 2], data: Float32Array.from([0.25, 0.75]) }), 0.75);
  assert.equal(positiveProbability({ dims: [3, 2], data: [0.9, 0.1, 0.6, 0.4, 0.2, 0.8] }, 2), 0.8);
  assert.throws(() => positiveProbability({ dims: [1], data: [1] }));
  const m = { threshold: 0.3 };
  assert.deepEqual(classify(0.4, m, "tuned"), { threshold: 0.3, positive: true });
  assert.deepEqual(classify(0.4, m, "0.5"), { threshold: 0.5, positive: false });
  const c = consensus([{ prob: 0.9, positive: true }, { prob: 0.8, positive: true }, { prob: 0.1, positive: false }, { prob: NaN }]);
  assert.equal(c.total, 3); assert.equal(c.positives, 2); assert.equal(c.level, "high");
  assert.equal(consensus([]).level, "none");
});

test("derived confusion matrices reproduce every published metric for all 11 models", () => {
  const n = evaluation.testSetSize, P = evaluation.testPositives;
  for (const m of cfg.models) {
    const e = evaluation.models[m.id], r = metricsFromConfusion(e);
    assert.equal(e.tp + e.fp + e.fn + e.tn, n); assert.equal(e.tp + e.fn, P);
    assert.equal(r.accuracy, m.accuracy, m.id + " accuracy"); assert.equal(r.recall, m.recall, m.id + " recall"); assert.equal(r.f1, m.f1, m.id + " f1");
    assert.equal(Math.abs(r.precision - e.precision) < 0.006, true);
  }
});

test("i18n: fa and en have identical key sets and matching placeholders", () => {
  const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? flat(v, p + k + ".") : [[p + k, v]]));
  const a = new Map(flat(fa)), b = new Map(flat(en));
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  const ph = (s) => (typeof s === "string" ? (s.match(/\{\w+\}/g) || []).sort().join() : "");
  for (const [k, v] of a) { assert.equal(ph(v), ph(b.get(k)), k); if (Array.isArray(v)) assert.equal(v.length, b.get(k).length, k); }
  assert.equal(fa.dir, "rtl"); assert.equal(en.dir, "ltr");
  for (const f of cfg.features) assert.ok(fa.features[f.key] && en.features[f.key]);
});

test("every data-i18n key used in index.html exists", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) {
    const get = (d) => key.split(".").reduce((o, k) => o?.[k], d);
    assert.ok(typeof get(fa) === "string" && typeof get(en) === "string", key);
  }
});

test("index.html uses only relative asset paths (GitHub Pages safe)", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const [, u] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) if (!u.startsWith("data:")) assert.ok(u.startsWith("./") || u.startsWith("https://github.com"), u);
});
