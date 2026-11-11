# Contributing

Thanks for helping! This is a research/education project — please keep medical claims conservative.

## Ground rules
- Do **not** remove, replace or retrain models, or change the feature order / preprocessing, without first documenting the issue in an issue and getting maintainer approval.
- Never invent metrics. Anything shown must come from `assets/models.json` or be derived by a documented, tested script.
- Keep the app 100 % client-side: no backend, no private APIs, relative paths only (GitHub Pages).
- Every user-visible string goes through `i18n/fa.js` **and** `i18n/en.js` (a unit test enforces equal keys).

## Setup
```bash
npm install
npx playwright install chromium
python3 -m http.server 8000      # open http://localhost:8000
npm test                          # unit + browser e2e
```
Python tools (`pip install onnx onnxruntime numpy`): `tools/derive_evaluation.py`, `tools/make_golden.py`, `tools/export_evaluation.py`.

## Pull requests
1. Branch from `main`, keep changes focused, update `CHANGELOG.md`.
2. Add or update tests; `npm test` must pass.
3. Check both languages and both themes (and a phone-width viewport).
