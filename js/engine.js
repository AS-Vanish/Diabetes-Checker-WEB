import { positiveProbability, buildCoalitions, shapleyFromCoalitions, median } from "./core.js";

const MODEL_DIR = "./models/";

/**
 * Lazy ONNX Runtime Web session manager. Each model is fetched (with byte progress) and built at most
 * once: concurrent callers share the same promise, finished sessions are cached.
 */
export class Engine {
  constructor(config, onChange = () => {}) {
    this.config = config; this.onChange = onChange;
    this.sessions = new Map(); this.pending = new Map(); this.shapCache = new Map();
    this.info = new Map(config.models.map((m) => [m.id, { status: "idle", loaded: 0, total: 0, loadMs: null, error: null, runMs: null }]));
    ort.env.wasm.numThreads = 1;                                   // GitHub Pages is not cross-origin isolated
    ort.env.wasm.wasmPaths = new URL("./vendor/onnxruntime/", document.baseURI).href;
  }

  update(id, patch) { Object.assign(this.info.get(id), patch); this.onChange(id); }
  loadedCount() { return [...this.info.values()].filter((i) => i.status === "ready").length; }

  load(model) {
    if (this.sessions.has(model.id)) return Promise.resolve(this.sessions.get(model.id));
    if (this.pending.has(model.id)) return this.pending.get(model.id);
    const p = (async () => {
      const t0 = performance.now();
      this.update(model.id, { status: "loading", loaded: 0, error: null });
      try {
        const res = await fetch(MODEL_DIR + model.file);
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: "modelFetch", status: res.status });
        const total = Number(res.headers.get("content-length")) || 0;
        const chunks = []; let loaded = 0;
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); loaded += value.length;
            this.update(model.id, { loaded, total: total || loaded });
          }
        } else { chunks.push(new Uint8Array(await res.arrayBuffer())); loaded = chunks[0].length; }
        const buf = new Uint8Array(loaded); let o = 0;
        for (const c of chunks) { buf.set(c, o); o += c.length; }
        const session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
        this.sessions.set(model.id, session);
        this.update(model.id, { status: "ready", loaded, total: loaded, loadMs: performance.now() - t0 });
        return session;
      } catch (e) {
        console.error(`[engine] ${model.id}`, e);
        this.update(model.id, { status: "error", error: e });
        throw e;
      } finally { this.pending.delete(model.id); }
    })();
    this.pending.set(model.id, p);
    return p;
  }

  /** One sample -> {prob, ms}. Input is a length-8 vector (NaN = missing). */
  async predict(model, vector) {
    const session = await this.load(model);
    const tensor = new ort.Tensor("float32", Float32Array.from(vector), [1, vector.length]);
    const t0 = performance.now();
    const out = await session.run({ [session.inputNames[0]]: tensor });
    const ms = performance.now() - t0;
    const prob = positiveProbability(this.pickProbabilities(session, out));
    if (!Number.isFinite(prob)) throw new Error("Non-finite model output");
    this.update(model.id, { runMs: ms });
    return { prob, ms };
  }

  pickProbabilities(session, out) {
    const name = session.outputNames.find((n) => /prob/i.test(n)) || session.outputNames[session.outputNames.length - 1];
    return out[name];
  }

  /** Mean single-sample latency over `runs` back-to-back executions (after one warm-up).
   *  Timing the whole loop avoids the 0.1 ms timer clamping of non-isolated pages. */
  async benchmark(model, vector, runs = 20) {
    await this.predict(model, vector);
    const session = this.sessions.get(model.id);
    const tensor = new ort.Tensor("float32", Float32Array.from(vector), [1, vector.length]);
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) await session.run({ [session.inputNames[0]]: tensor });
    return (performance.now() - t0) / runs;
  }

  /** Exact Shapley values for one sample and one model (256 coalitions in a single batch). */
  async explain(model, vector) {
    const key = model.id + "|" + vector.map((v) => (Number.isNaN(v) ? "n" : v)).join(",");
    if (this.shapCache.has(key)) return this.shapCache.get(key);
    const session = await this.load(model);
    const n = vector.length, rows = 1 << n;
    const tensor = new ort.Tensor("float32", buildCoalitions(vector), [rows, n]);
    const out = await session.run({ [session.inputNames[0]]: tensor });
    const t = this.pickProbabilities(session, out);
    const probs = Array.from({ length: rows }, (_, r) => Number(t.data[r * 2 + 1]));
    const res = shapleyFromCoalitions(probs, n);
    this.shapCache.set(key, res);
    return res;
  }
}

export function describeError(e, t, model) {
  if (e && e.code === "modelFetch") return t("err.modelFetch", { name: model?.name ?? "", status: e.status, file: model?.file ?? "" });
  const msg = String(e && e.message || e);
  if (/wasm|WebAssembly|ort-wasm/i.test(msg)) return t("err.wasm");
  return t("err.modelRun", { name: model?.name ?? "" });
}
