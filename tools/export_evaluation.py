#!/usr/bin/env python3
"""Optional: produce REAL ROC curves from your own held-out test set.

The repository does not ship per-sample test scores, so ROC curves are not drawn by default.
If you have the original test split as a CSV (the 8 feature columns of assets/models.json plus a
binary `Outcome` column), run:

    python3 tools/export_evaluation.py path/to/test.csv

It scores every ONNX model with onnxruntime, writes assets/roc.json, prints measured metrics next to
the published ones (so you can confirm it is the same split), and you then enable the chart by adding
  "rocFile": "assets/roc.json"
to assets/evaluation.json. Requires: numpy, onnxruntime.
"""
import csv, json, pathlib, sys
import numpy as np, onnxruntime as ort

ROOT = pathlib.Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "assets/models.json").read_text(encoding="utf-8"))
keys = [f["key"] for f in cfg["features"]]
zero_missing = set(cfg["notes"]["missing_zero_features"])

rows = list(csv.DictReader(open(sys.argv[1], newline="")))
X = np.array([[np.nan if (k in zero_missing and float(r[k]) == 0) else float(r[k]) for k in keys] for r in rows], dtype=np.float32)
y = np.array([int(float(r["Outcome"])) for r in rows])


def roc(y, s):
    order = np.argsort(-s, kind="stable"); y = y[order]; s = s[order]
    tps = np.cumsum(y); fps = np.cumsum(1 - y)
    idx = np.r_[np.where(np.diff(s))[0], len(y) - 1]
    tpr = np.r_[0, tps[idx] / y.sum()]; fpr = np.r_[0, fps[idx] / (1 - y).sum()]
    return fpr, tpr


out = {"source": sys.argv[1], "n": int(len(y)), "models": {}}
for m in cfg["models"]:
    sess = ort.InferenceSession(str(ROOT / "models" / m["file"]), providers=["CPUExecutionProvider"])
    p = sess.run(None, {sess.get_inputs()[0].name: X})[1][:, 1]
    fpr, tpr = roc(y, p)
    auc = float(np.trapz(tpr, fpr))
    pred = p >= m["threshold"]
    print(f'{m["id"]:24s} AUC measured {100*auc:6.2f}  published {m["auc"]:6.2f} | acc {100*(pred==y).mean():6.2f} vs {m["accuracy"]:6.2f}')
    out["models"][m["id"]] = {"fpr": [round(float(v), 5) for v in fpr], "tpr": [round(float(v), 5) for v in tpr]}
(ROOT / "assets/roc.json").write_text(json.dumps(out) + "\n")
print("wrote assets/roc.json — now add \"rocFile\": \"assets/roc.json\" to assets/evaluation.json")
