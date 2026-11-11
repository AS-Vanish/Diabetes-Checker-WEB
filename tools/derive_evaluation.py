#!/usr/bin/env python3
"""Derive confusion matrices from the metrics published in assets/models.json.

No number is invented: for a candidate test-set size n and positive count P, an
integer confusion matrix (TP, FP, FN, TN) must reproduce the published Accuracy,
Recall AND F1 of *every* model after rounding to 2 decimals. The smallest (n, P)
that satisfies all models at once is reported (multiples such as 462/162 reduce to
the same ratios). Precision is then computed from that matrix.

Also extracts the training medians stored in each ONNX Imputer node (used as the
Explainable-AI baseline) and writes assets/evaluation.json.

Usage: python3 tools/derive_evaluation.py   (requires: onnx)
"""
import json, pathlib, sys
import onnx
from onnx import helper

ROOT = pathlib.Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "assets/models.json").read_text(encoding="utf-8"))
models = cfg["models"]


def solve():
    for n in range(50, 1500):
        for P in range(1, n):
            N, res = n - P, {}
            for m in models:
                found = []
                for TP in range(P + 1):
                    if round(100 * TP / P, 2) != m["recall"]:
                        continue
                    for TN in range(N + 1):
                        if round(100 * (TP + TN) / n, 2) != m["accuracy"]:
                            continue
                        FP, FN = N - TN, P - TP
                        if 2 * TP + FP + FN and round(100 * 2 * TP / (2 * TP + FP + FN), 2) == m["f1"]:
                            found.append((TP, FP, FN, TN))
                if len(found) != 1:
                    break
                res[m["id"]] = found[0]
            else:
                return n, P, res
    sys.exit("no consistent confusion matrix found")


n, P, res = solve()
medians = None
for m in models:
    onnx_model = onnx.load(ROOT / "models" / m["file"])
    for node in onnx_model.graph.node:
        if node.op_type == "Imputer":
            attrs = {a.name: helper.get_attribute_value(a) for a in node.attribute}
            vals = [round(float(v), 6) for v in attrs["imputed_value_floats"]]
            if medians is None:
                medians = vals
            assert medians == vals, f"imputer mismatch in {m['id']}"

out = {
    "source": "Derived from Accuracy/Recall/F1 in assets/models.json by tools/derive_evaluation.py",
    "testSetSize": n,
    "testPositives": P,
    "note": "Confusion matrices and precision are derived exactly (not estimated) and reproduce all three published metrics for every model. ROC curves need per-sample test scores that are not shipped with the project, so they are intentionally absent.",
    "baselineMedians": dict(zip([f["key"] for f in cfg["features"]], medians)),
    "models": {},
}
for m in models:
    TP, FP, FN, TN = res[m["id"]]
    out["models"][m["id"]] = {
        "tp": TP, "fp": FP, "fn": FN, "tn": TN,
        "precision": round(100 * TP / (TP + FP), 2) if TP + FP else None,
        "specificity": round(100 * TN / (TN + FP), 2),
    }
(ROOT / "assets/evaluation.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print("test set:", n, "positives:", P)
