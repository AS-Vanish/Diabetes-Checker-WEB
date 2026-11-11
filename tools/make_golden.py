#!/usr/bin/env python3
"""Generate tests/golden.json: reference probabilities from the native ONNX Runtime
(Python) for fixed inputs, used by the browser e2e test to verify the web runtime
reproduces the same outputs. Requires: onnxruntime numpy."""
import json, pathlib
import numpy as np, onnxruntime as ort
ROOT = pathlib.Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "assets/models.json").read_text(encoding="utf-8"))
nan = float("nan")
cases = {
  "sample_default": [6,148,72,35,nan,33.6,0.627,50],
  "low_risk":       [1,85,66,29,nan,26.6,0.351,31],
  "high_risk":      [8,183,64,nan,nan,23.3,0.672,32],
  "all_present":    [2,120,70,30,100,28.0,0.5,40],
}
out = {"models": [m["id"] for m in cfg["models"]], "cases": {}}
for name, vec in cases.items():
    x = np.array([vec], dtype=np.float32); out["cases"][name] = {"input": [None if v != v else v for v in vec], "prob": {}}
    for m in cfg["models"]:
        s = ort.InferenceSession(str(ROOT/"models"/m["file"]), providers=["CPUExecutionProvider"])
        out["cases"][name]["prob"][m["id"]] = float(s.run(None, {s.get_inputs()[0].name: x})[1][0][1])
(ROOT / "tests/golden.json").write_text(json.dumps(out, indent=1) + "\n")
