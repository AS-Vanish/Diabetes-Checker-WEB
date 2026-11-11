# Changelog

## 2.0.0 — Professional 2.0

### Preserved (unchanged)
- All 11 ONNX models in `models/`, `assets/models.json` (features, order, thresholds, metrics), ONNX Runtime Web 1.20.1 under `vendor/onnxruntime/`, the preprocessing contract (0 → missing for five columns, imputed inside each model) and the probability output logic.
- Static, backend-free deployment on GitHub Pages.

### Added
- New UI: dashboard, risk assessment, model comparison, history and about views; light/dark theme; responsive layout (mobile/tablet/desktop); subtle animations (respecting `prefers-reduced-motion`).
- Full Persian (RTL) and English (LTR) interface with instant switching, remembered in the browser; Persian/Arabic digits accepted in inputs.
- Strict input validation (required, numeric, range, integer fields) with per-field messages.
- Run all 11 models or a single model; consensus verdict; per-model score, threshold, run time.
- Lazy model loading with real byte progress, single load per model, readable per-model errors.
- Model comparison: Accuracy, Precision, Recall, F1, ROC-AUC, confusion matrix, charts, measured on-device latency. Precision and confusion matrices are *derived exactly* from the published metrics (`tools/derive_evaluation.py`, stored in `assets/evaluation.json`).
- Explainable AI: exact Shapley values (256 coalitions) relative to the training medians stored in each ONNX Imputer — works for all 11 models.
- Local history (localStorage only), view/delete/clear, privacy warning.
- PDF report (inputs, results, comparison, charts, explainability, limitations, date/time) generated in the browser.
- Self-hosted Chart.js, jsPDF, html2canvas and Vazirmatn font (no CDN at runtime).
- Tests: unit tests (Node) and browser end-to-end tests (Chromium) including golden-output comparison against native onnxruntime; GitHub Actions workflow.
- Documentation: bilingual README, CONTRIBUTING, this changelog.

### Changed
- `index.html`, `app.js`, `style.css` were rewritten (the original single-file logic is now split into `js/` modules). Raw JavaScript stack traces are no longer shown to users.
- Medical/scientific disclaimers added across the interface.

### Known limitations
- ROC *curves* cannot be drawn: per-sample test scores are not part of the repository. Only AUC is shown; `tools/export_evaluation.py` produces real curves if you supply the test split.
- Test-set size (231; 81 positives) is inferred by the unique integer solution consistent with all published metrics of all 11 models; it is not stored in the original repository.
- Metrics have no confidence intervals; models are not calibrated or clinically validated.
