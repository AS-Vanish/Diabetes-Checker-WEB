// Browser end-to-end tests (real Chromium + real ONNX Runtime Web + real models).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(fs.readFileSync(path.join(root, "tests/golden.json"), "utf8"));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".woff2": "font/woff2" };
let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/$/, "/index.html"));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, locale: opts.locale || "en-US", ...opts.ctx });
  const page = await ctx.newPage(), problems = [], bad = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/willReadFrequently/.test(m.text())) problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror " + e.message));
  page.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); });
  await page.goto(base + (opts.hash || "#/dashboard"));
  await page.waitForFunction(() => window.__dc);
  return { ctx, page, problems, bad };
}

test("all 11 ONNX models reproduce native onnxruntime outputs (golden) in the browser", async () => {
  const { ctx, page, problems, bad } = await open();
  const out = await page.evaluate(async (g) => {
    const { S } = window.__dc, res = {};
    for (const [name, c] of Object.entries(g.cases)) {
      res[name] = {};
      for (const m of S.config.models) res[name][m.id] = (await S.engine.predict(m, c.input.map((v) => (v === null ? NaN : v)))).prob;
    }
    return res;
  }, golden);
  for (const [name, c] of Object.entries(golden.cases)) for (const id of golden.models) {
    assert.ok(Math.abs(out[name][id] - c.prob[id]) < 1e-4, `${name}/${id}: web ${out[name][id]} vs native ${c.prob[id]}`);
  }
  assert.deepEqual(bad, []); assert.deepEqual(problems, []); await ctx.close();
});

test("Shapley efficiency holds on real models (sum of effects = f(x) - f(baseline))", async () => {
  const { ctx, page } = await open();
  const r = await page.evaluate(async () => {
    const { S } = window.__dc, v = [6, 148, 72, 35, NaN, 33.6, 0.627, 50], out = [];
    for (const m of S.config.models) { const { phi, base, full } = await S.engine.explain(m, v); out.push([m.id, phi.reduce((a, b) => a + b, 0) - (full - base)]); }
    return out;
  });
  for (const [id, d] of r) assert.ok(Math.abs(d) < 1e-6, id + " " + d);
  await ctx.close();
});

test("assessment flow, validation, thresholds, no JS errors, no broken paths", async () => {
  const { ctx, page, problems, bad } = await open({ hash: "#/assess" });
  await page.click("#runBtn");
  assert.ok(await page.isVisible("#formError")); assert.equal(await page.locator(".field.invalid").count(), 8);
  await page.fill("#f_Glucose", "999"); await page.click("#runBtn");
  assert.match(await page.innerText("#e_Glucose"), /between/);
  await page.click("#sampleBtn"); await page.click("#runBtn");
  await page.waitForFunction(() => document.querySelectorAll("#resultGrid .rcard.pos, #resultGrid .rcard.neg").length === 11, null, { timeout: 90000 });
  assert.match(await page.innerText("#overall"), /11 of 11/);
  await page.click('label:has(input[value="one"])'); await page.selectOption("#modelSelect", "logistic_regression"); await page.selectOption("#thresholdMode", "0.5"); await page.click("#runBtn");
  await page.waitForFunction(() => document.querySelectorAll("#resultGrid .rcard").length === 1);
  assert.match(await page.innerText("#resultGrid"), /0\.5/);
  await page.waitForFunction(() => document.querySelector("#xaiText p"));
  assert.deepEqual(bad, []); assert.deepEqual(problems, []); await ctx.close();
});

test("language switch (RTL/LTR, no reload) and dark/light theme persist", async () => {
  const { ctx, page, problems } = await open({ hash: "#/assess" });
  await page.evaluate(() => (window.__marker = 1));
  assert.equal(await page.getAttribute("html", "dir"), "ltr");
  await page.click("#langBtn");
  assert.equal(await page.getAttribute("html", "dir"), "rtl"); assert.equal(await page.getAttribute("html", "lang"), "fa");
  assert.equal(await page.evaluate(() => window.__marker), 1, "no full reload");
  assert.match(await page.innerText(".tabs"), /ارزیابی ریسک/);
  await page.click("#themeBtn");
  assert.equal(await page.getAttribute("html", "data-theme"), "dark");
  await page.reload(); await page.waitForFunction(() => window.__dc);
  assert.equal(await page.getAttribute("html", "dir"), "rtl"); assert.equal(await page.getAttribute("html", "data-theme"), "dark");
  assert.deepEqual(problems, []); await ctx.close();
});

test("compare view renders metrics, confusion matrix, honest ROC notice, benchmark", async () => {
  const { ctx, page, problems } = await open({ hash: "#/compare" });
  assert.equal(await page.locator("#cmpTable tbody tr").count(), 11);
  assert.match(await page.innerText("#cmBox"), /True positive/);
  assert.match(await page.innerText("#rocBox"), /not drawn/);
  await page.click('#cmpTable button[data-sort="recall"]');
  await page.click("#benchBtn"); await page.waitForFunction(() => window.__dc.S.bench.size === 11, null, { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector("#cmpTable tbody td:nth-child(7)").textContent.includes("—"));
  assert.deepEqual(problems, []); await ctx.close();
});

test("history: save, view, delete, clear; PDF export is a valid PDF", async () => {
  const { ctx, page, problems } = await open({ hash: "#/assess" });
  await page.click("#sampleBtn"); await page.click('label:has(input[value="one"])'); await page.selectOption("#modelSelect", "knn"); await page.click("#runBtn");
  await page.waitForSelector("#resultGrid .rcard.pos, #resultGrid .rcard.neg"); await page.click("#saveBtn");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.click("#pdfBtn")]);
  const file = await dl.path(); assert.equal(fs.readFileSync(file).subarray(0, 5).toString(), "%PDF-"); assert.match(dl.suggestedFilename(), /^diabetes-risk-report-.*\.pdf$/);
  await page.goto(base + "#/history"); assert.equal(await page.locator(".hitem").count(), 1);
  await page.click('[data-act="view"]'); await page.waitForSelector("#resultGrid .rcard");
  assert.equal(await page.inputValue("#f_Glucose"), "148"); assert.match(await page.innerText("#overall"), /restored/i);
  await page.goto(base + "#/history"); page.once("dialog", (d) => d.accept()); await page.click("#clearHist");
  assert.equal(await page.locator(".hitem").count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("dc.history.v2")), null);
  assert.deepEqual(problems, []); await ctx.close();
});

test("mobile layout: no horizontal overflow on any view, both languages", async () => {
  for (const lang of ["fa", "en"]) {
    const { ctx, page } = await open({ ctx: { viewport: { width: 375, height: 800 }, isMobile: true } });
    if ((await page.getAttribute("html", "lang")) !== lang) await page.click("#langBtn");
    for (const v of ["dashboard", "assess", "compare", "history", "about"]) {
      await page.goto(base + "#/" + v); await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `${lang}/${v} overflows by ${over}px`);
    }
    await ctx.close();
  }
});
