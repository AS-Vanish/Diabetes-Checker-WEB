export default {
  dir: "ltr", locale: "en-US", name: "English", switchTo: "فا",
  skip: "Skip to content",
  brand: "Diabetes Checker",
  banner: "Research & education tool — not a medical diagnosis and no substitute for lab tests or a physician's advice.",
  nav: { dashboard: "Dashboard", assess: "Risk assessment", compare: "Model comparison", history: "History", about: "About & limits" },
  features: {
    Pregnancies: { label: "Pregnancies", unit: "times", hint: "Number of pregnancies (whole number)" },
    Glucose: { label: "Glucose", unit: "mg/dL", hint: "Plasma glucose concentration; 0 means “unknown”" },
    BloodPressure: { label: "Diastolic blood pressure", unit: "mmHg", hint: "Lower blood-pressure value; 0 means “unknown”" },
    SkinThickness: { label: "Skin-fold thickness", unit: "mm", hint: "Triceps skin-fold thickness; 0 means “unknown”" },
    Insulin: { label: "Insulin", unit: "µU/mL", hint: "2-hour serum insulin; 0 means “unknown”" },
    BMI: { label: "Body-mass index (BMI)", unit: "kg/m²", hint: "Weight divided by height squared; 0 means “unknown”" },
    DiabetesPedigreeFunction: { label: "Diabetes pedigree function (DPF)", unit: "", hint: "Hereditary diabetes index (0 to 3)" },
    Age: { label: "Age", unit: "years", hint: "Age in years (whole number)" },
  },
  err: {
    required: "This field is required.",
    invalid: "Enter a valid number.",
    range: "Value must be between {min} and {max}.",
    integer: "Must be a whole number.",
    fixForm: "Please correct the highlighted fields.",
    ortMissing: "ONNX Runtime Web failed to load. Serve the project over a web server (not file://) with the complete vendor/ folder.",
    configLoad: "Could not load the model configuration ({file}).",
    modelFetch: "Downloading model “{name}” failed (HTTP {status}). Check models/{file}.",
    modelRun: "Running model “{name}” failed. Technical details are in the browser console.",
    wasm: "The WebAssembly engine failed to load. Update your browser and check vendor/onnxruntime/.",
    storage: "Browser local storage is unavailable; history will not be saved.",
    pdf: "PDF generation failed. Please try again.",
    chart: "The chart library failed to load; charts are not shown.",
  },
  status: { init: "Initialising…", ready: "Ready · {n} models found", error: "Initialisation failed", loading: "Loading…", idle: "Not loaded", ok: "Ready", fail: "Error" },
  dash: {
    title: "Multi-model diabetes risk assessment platform",
    lead: "Eleven machine-learning models run directly in your browser. No data is ever sent to a server.",
    cta: "Start assessment", preload: "Load all models",
    aucChart: "Model ROC-AUC (test set)", loadStatus: "Model loading status",
    s_models: "Models", s_loaded: "Models loaded", s_bestAuc: "Best AUC", s_bestRecall: "Best recall",
    s_bestAcc: "Best accuracy", s_history: "Saved assessments", s_runtime: "Runtime", s_privacy: "Privacy", s_privacyV: "100% local",
    size: "Size", loadTime: "Load time",
  },
  assess: {
    title: "Patient data", sub: "Enter the values. All computation happens on your device.",
    sample: "Sample data", reset: "Clear",
    mode: "Run mode", modeAll: "All 11 models", modeOne: "Single model",
    model: "Model", threshold: "Decision threshold", thTuned: "Per-model tuned threshold", th05: "Fixed 0.5 threshold",
    run: "Run assessment", running: "Running…",
    progressModel: "Loading & running {name} ({i}/{n})",
    guideTitle: "Guide",
    guide: [
      "Inputs are the eight Pima dataset features; model feature order and preprocessing are unchanged.",
      "For glucose, blood pressure, skin thickness, insulin and BMI a value of 0 means “unknown”; the model replaces it with the training median.",
      "The “tuned threshold” of each model comes from out-of-fold training predictions; a fixed 0.5 threshold is also available.",
      "A model score is not a calibrated clinical probability.",
    ],
    zeroMissing: "A value of 0 is treated as “unknown”.",
    intOnly: "whole number",
  },
  res: {
    title: "Assessment results", chart: "Model scores versus decision thresholds", pdf: "Download PDF report", save: "Save to history", saved: "Saved to local history.",
    disclaimer: "This value is not necessarily a calibrated clinical probability and must not be used for diagnosis or treatment decisions.",
    overall: "Overall model verdict", votes: "{p} of {n} models predicted the “diabetes” class", meanScore: "Mean model score",
    lvHigh: "Most models indicate higher risk", lvLow: "Most models indicate lower risk", lvMixed: "Models disagree",
    advice: "Consult a physician about any concern or clinical symptom; this is not a diagnosis.",
    pos: "Predicted class: diabetes", neg: "Predicted class: no diabetes", score: "Score", thr: "Threshold", time: "Run time", load: "Load",
    ms: "ms", failed: "Failed", threshold: "Threshold",
    inputs: "Recorded inputs", mode_tuned: "Tuned thresholds", mode_05: "0.5 threshold", restored: "Saved result restored from history (not re-run)",
  },
  xai: {
    title: "Explainable AI",
    sub: "Exact Shapley values relative to the training medians",
    base: "Baseline (all features = median)", pred: "This sample's score", up: "raises score", down: "lowers score",
    axis: "Change in model score (percentage points)",
    summary: "Largest effect: {top}. Contributions sum to the difference between this sample's score and the baseline ({base} → {full}).",
    method: "Method: exact Shapley over 256 feature coalitions; excluded features are replaced by the training median (taken from the Imputer inside each ONNX model). This describes model behaviour, not a medical causal relationship.",
    unsupported: "Explainability is not supported for this model.",
    computing: "Computing…", needRun: "Run an assessment first.",
    pushUp: "Green features raise the score, red features lower it.",
  },
  cmp: {
    title: "Comparison of the 11 models", sub: "Metrics are read from the project's test report (assets/models.json); precision and the confusion matrix are derived exactly from those metrics.",
    bench: "Measure run time", benchRunning: "Benchmarking {name} ({i}/{n})",
    cols: { model: "Model", accuracy: "Accuracy", precision: "Precision", recall: "Recall", f1: "F1-Score", auc: "ROC-AUC", time: "Prediction time (ms)", threshold: "Threshold" },
    timeNote: "Timings are measured on this device and browser (mean of 20 runs) and vary.",
    note: "Test set: {n} samples ({p} positive). Precision = TP/(TP+FP) from the derived confusion matrix; all other metrics are taken verbatim from the project's report.",
    chart: "Models ranked by a single metric", metric: "Metric", radar: "Overview (Accuracy · Precision · Recall · F1 · AUC)",
    cm: "Confusion matrix", cmNote: "Derived exactly from the published Accuracy, Recall and F1; all three metrics are reproduced for all 11 models.",
    cmTN: "True negative (TN)", cmFP: "False positive (FP)", cmFN: "False negative (FN)", cmTP: "True positive (TP)", actual: "Actual", predicted: "Predicted", posC: "Diabetes", negC: "No diabetes", specificity: "Specificity",
    roc: "ROC curve",
    rocUnsupported: "A ROC curve needs per-sample test-set scores, which are not shipped with the project, so it is not drawn and no invented curve is shown. Only the reported AUC is displayed. (See tools/export_evaluation.py)",
    rocReady: "ROC curves loaded from assets/roc.json.",
    sortHint: "Click a column header to sort.", best: "best",
  },
  hist: {
    title: "Assessment history", sub: "Stored only in this browser's local storage and never sent to any server.",
    warn: "Medical information is sensitive. If you use a shared computer, delete the history when finished. At most 50 entries are kept.",
    empty: "No saved assessments yet.", clear: "Delete all history", confirmClear: "Delete the entire history?", cleared: "History deleted.",
    view: "View", del: "Delete", pdf: "PDF", deleted: "Entry deleted.",
    mode_all: "11 models", mode_one: "single model", verdict: "{p} of {n} positive",
  },
  about: {
    medicalHtml: `<h2>Medical warning & scientific limits</h2>
<ul>
<li><b>Model outputs are not a definitive medical diagnosis.</b></li>
<li>The result must not replace laboratory tests or a physician's opinion.</li>
<li>A model score is not necessarily a calibrated clinical probability.</li>
<li>If you have symptoms or medical concerns, consult a healthcare professional.</li>
<li>The models were trained and evaluated on one small dataset (Pima Indians, 768 samples); generalisation to other populations, bias and calibration have not been assessed.</li>
<li>Metrics are reported on a fixed test set without confidence intervals; small differences between models are not necessarily meaningful.</li>
<li>Explainability describes model behaviour; it is not a causal medical relationship.</li>
</ul>`,
    techHtml: `<h2>Architecture & privacy</h2>
<ul>
<li>Fully in-browser execution with ONNX Runtime Web (WebAssembly); no backend and no private API.</li>
<li>Model files, WASM, chart library and fonts are all loaded from this repository (relative paths), so it works on GitHub Pages.</li>
<li>Models are loaded lazily and each model is built in memory only once.</li>
<li>Inputs and history stay in your browser's localStorage.</li>
<li>The PDF report is generated in the browser.</li>
</ul>`,
    modelsTitle: "The 11 models", fileCol: "File", thrCol: "Tuned threshold",
  },
  pdf: {
    title: "Diabetes Risk Assessment Report", subtitle: "Research & education tool — not a medical diagnosis", generated: "Assessment date & time", inputs: "Input data",
    results: "Model results", compare: "Model comparison (test set)", charts: "Charts", limits: "Notes & scientific limitations", page: "Page {i} of {n}",
    feature: "Feature", value: "Value", model: "Model", score: "Score", predClass: "Class", missing: "unknown (0)",
    limitsList: [
      "Model outputs are not a definitive medical diagnosis and do not replace lab tests or a physician's opinion.",
      "A model score is not necessarily a calibrated clinical probability.",
      "If you have symptoms or medical concerns, consult a healthcare professional.",
      "Models were trained on the limited Pima dataset and have not been validated for other populations.",
      "Comparison metrics come from the project's test report; precision is computed from the derived confusion matrix.",
      "Explainability (Shapley) describes model behaviour, not a medical causal relationship.",
    ],
    xaiTitle: "Feature effects — {model}",
  },
  footer: "Built for research & education · no data is ever sent to a server",
};
