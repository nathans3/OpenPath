// Seeing the screen, on this computer.
//
//   locate(labels, near)  finds words such as "Insert" or "Share" on the real
//                         screen with macOS's built-in text recognition (Vision)
//                         and returns where they are, in overlay coordinates.
//                         Nothing leaves the computer and nothing is saved:
//                         the capture is written to a private temp file, read,
//                         and deleted straight away.
//   snapshotForClaude()   a downscaled JPEG of the screen for Claude, used only
//                         when the person has allowed screen pictures and the
//                         front window is not a bank, health or password page.
//
// The OpenPath overlay is excluded from captures (content protection), so the
// circle and reply card never appear in them.

const { desktopCapturer, screen } = require("electron");
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Pages where OpenPath never sends a picture of the screen.
const SENSITIVE = /(bank|credit union|chase|wells fargo|citi|capital one|paypal|venmo|zelle|mychart|patient|health|medicare|medicaid|pharmacy|insurance|password|passcode|1password|keychain|sign ?in|log ?in|login|tax|irs|social security)/i;

// macOS Vision text recognition, run through JavaScript for Automation so no
// compiled helper is needed. argv: image path, JSON array of labels.
const OCR_SCRIPT = `
ObjC.import("Vision"); ObjC.import("Foundation");
function run(argv) {
  const labels = JSON.parse(argv[1]).map(function (l) { return String(l); });
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}));
  const req = $.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel = argv[2] === "fast" ? 1 : 0;
  req.usesLanguageCorrection = false;
  try { req.automaticallyDetectsLanguage = true; } catch (e) {}
  handler.performRequestsError($([req]), null);
  const out = [];
  const results = req.results;
  for (let i = 0; i < results.count; i++) {
    const obs = results.objectAtIndex(i);
    const cand = obs.topCandidates(1).objectAtIndex(0);
    const text = cand.string.js;
    const lower = text.toLowerCase();
    const lb = obs.boundingBox;
    if (!labels.length) { out.push({ text: text, x: lb.origin.x, y: 1 - lb.origin.y - lb.size.height, w: lb.size.width, h: lb.size.height }); continue; }
    for (const label of labels) {
      const idx = lower.indexOf(label.toLowerCase());
      if (idx < 0) continue;
      let b = null;
      try { b = cand.boundingBoxForRangeError($.NSMakeRange(idx, label.length), null).boundingBox; } catch (e) {}
      if (!b || !b.size || !b.size.width) {
        const w = lb.size.width * (label.length / Math.max(1, text.length));
        b = { origin: { x: lb.origin.x + lb.size.width * (idx / Math.max(1, text.length)), y: lb.origin.y }, size: { width: w, height: lb.size.height } };
      }
      const before = idx === 0 ? " " : lower[idx - 1];
      const after = idx + label.length >= lower.length ? " " : lower[idx + label.length];
      out.push({
        label: label, text: text,
        exact: lower.trim() === label.toLowerCase(),
        word: !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after),
        x: b.origin.x, y: 1 - b.origin.y - b.size.height, w: b.size.width, h: b.size.height
      });
    }
  }
  return JSON.stringify(out);
}`;

let scriptFile = null;
function ocrScriptPath() {
  if (scriptFile && fs.existsSync(scriptFile)) return scriptFile;
  scriptFile = path.join(os.tmpdir(), `openpath-ocr-${process.pid}.js`);
  fs.writeFileSync(scriptFile, OCR_SCRIPT, { mode: 0o600 });
  return scriptFile;
}

// One capture at a time; a failed capture is retried; checks that come
// within 120 ms of each other share the same capture.
let captureChain = Promise.resolve();
const recent = new Map();   // scale → { at, result }

async function captureOnce(sf, d) {
  const width = Math.round(d.size.width * sf), height = Math.round(d.size.height * sf);
  for (let attempt = 0; attempt < 3; attempt++) {
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
    const src = sources.find((x) => x.display_id === String(d.id)) || sources[0];
    if (src && !src.thumbnail.isEmpty()) return { image: src.thumbnail, display: d };
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("capture_failed");
}

function captureDisplay({ scale } = {}) {
  const d = screen.getPrimaryDisplay();
  const sf = scale || d.scaleFactor;
  const hit = recent.get(sf);
  if (hit && Date.now() - hit.at < 120) return hit.result;
  const result = captureChain.then(() => captureOnce(sf, d));
  captureChain = result.catch(() => {});
  recent.set(sf, { at: Date.now(), result });
  return result;
}

// The fast path: a small helper (electron/native/ocr-helper.swift) that stays
// running, so a check does not pay to start a new process. Built with
// `npm run build-helper`; if it is missing, the osascript path below is used.
const { spawn } = require("child_process");
const HELPER = path.join(__dirname, "..", "native", "bin", "ocr-helper").replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);
let helper = null, helperBroken = false, helperQueue = Promise.resolve();

function startHelper() {
  if (helper) return helper;
  if (helperBroken || process.platform !== "darwin" || !fs.existsSync(HELPER)) return null;
  try {
    helper = spawn(HELPER, [], { stdio: ["pipe", "pipe", process.env.OPENPATH_DEBUG_VISION ? "inherit" : "ignore"] });
    helper.buf = ""; helper.waiters = [];
    helper.stdout.on("data", (chunk) => {
      helper.buf += chunk.toString("utf8");
      let i;
      while ((i = helper.buf.indexOf("\n")) >= 0) {
        const line = helper.buf.slice(0, i); helper.buf = helper.buf.slice(i + 1);
        const w = helper.waiters.shift(); if (w) w(line);
      }
    });
    helper.on("exit", (code, sig) => { if (process.env.OPENPATH_DEBUG_VISION) console.log("helper exit", code, sig); helper = null; });
    helper.on("error", () => { helper = null; helperBroken = true; });
  } catch { helper = null; helperBroken = true; }
  return helper;
}

function helperAsk(request) {
  const run = () => new Promise((resolve) => {
    const h = startHelper();
    if (!h) return resolve(null);
    const timer = setTimeout(() => { resolve(null); }, 8000);
    h.waiters.push((line) => { clearTimeout(timer); try { resolve(JSON.parse(line)); } catch { resolve(null); } });
    h.stdin.write(JSON.stringify(request) + "\n");
  });
  const result = helperQueue.then(run);
  helperQueue = result.catch(() => {});
  return result;
}

async function runOcr(file, labels, { fast = false } = {}) {
  const viaHelper = await helperAsk({ file, labels, fast });
  if (viaHelper?.ok) return { ok: true, matches: viaHelper.matches };
  return runOcrScript(file, labels, { fast });
}

// Capture + read inside the helper: no image file, and OpenPath's own windows
// are left out of the picture. Returns null when the helper is not available.
async function helperRead({ labels, fast = false, scale = 2, rect = null }) {
  if (helperBroken || !fs.existsSync(HELPER) || process.platform !== "darwin") return null;
  const res = await helperAsk({ labels, fast, scale, rect: rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : undefined });
  if (process.env.OPENPATH_DEBUG_VISION) console.log("helper", res ? (res.ok ? "ok " + res.matches.length : res.reason) : "no answer");
  return res?.ok ? res.matches : null;
}

function runOcrScript(file, labels, { fast = false } = {}) {
  return new Promise((resolve) => {
    execFile("osascript", ["-l", "JavaScript", ocrScriptPath(), file, JSON.stringify(labels), fast ? "fast" : "accurate"], { maxBuffer: 1 << 24, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, reason: "ocr_failed", detail: String(err.message || err).slice(0, 200) });
      try { resolve({ ok: true, matches: JSON.parse(stdout) }); } catch { resolve({ ok: false, reason: "ocr_failed" }); }
    });
  });
}

// `exclude` = rectangles (screen points) where OpenPath itself is drawn: its
// circle, answer box and pointer. Text found there is OpenPath's own words.
const insideAny = (x, y, rects) => (rects || []).some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

async function locate(labels, near, exclude) {
  if (process.platform !== "darwin") return { ok: false, reason: "unsupported" };
  const list = (labels || []).filter(Boolean).slice(0, 40);
  if (!list.length) return { ok: false, reason: "no_labels" };
  let file = null;
  try {
    const display = screen.getPrimaryDisplay();
    let matches = await helperRead({ labels: list, scale: 2 });
    let ownWindowsInPicture = false;
    if (!matches) {
      const cap = await captureDisplay();
      file = path.join(os.tmpdir(), `openpath-${crypto.randomBytes(6).toString("hex")}.png`);
      fs.writeFileSync(file, cap.image.toPNG(), { mode: 0o600 });
      const res = await runOcr(file, list);
      if (!res.ok) return res;
      matches = res.matches; ownWindowsInPicture = true;
    }
    if (!ownWindowsInPicture) exclude = [];                      // the helper already left OpenPath out
    const W = display.size.width, H = display.size.height;
    const scored = matches.map((m) => ({ x: m.x * W, y: m.y * H, w: m.w * W, h: m.h * H, m }))
      .filter((b) => !insideAny(b.x + b.w / 2, b.y + b.h / 2, exclude))
      .map(({ m }) => {
      const box = { x: m.x * W, y: m.y * H, w: m.w * W, h: m.h * H };
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      let score = 0;
      if (m.exact) score += 100; else if (m.word) score += 50;
      score -= list.indexOf(m.label) * 5;                           // earlier labels are the preferred wording
      if (cy < 28) score -= 40;                                     // the macOS menu bar, rarely the target
      if (near && typeof near.x === "number") score -= Math.hypot(cx - near.x, cy - near.y) / 8;
      return { score, box: { ...box, text: m.label } };
    }).sort((a, b) => b.score - a.score);
    if (!scored.length) return { ok: false, reason: "not_found" };
    return { ok: true, box: scored[0].box };
  } catch (err) {
    return { ok: false, reason: "capture_failed", detail: String(err?.message || err) };
  } finally {
    if (file) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
  }
}

// Every one of `labels` that is visible, each with its best box. Used to tell
// which page of a website is showing.
async function findAll(labels, exclude) {
  if (process.platform !== "darwin") return { ok: false, reason: "unsupported" };
  const list = (labels || []).filter(Boolean).slice(0, 60);
  let file = null;
  try {
    const display = screen.getPrimaryDisplay();
    let matches = await helperRead({ labels: list, scale: 1 });
    if (matches) exclude = [];
    else {
      const cap = await captureDisplay();
      file = path.join(os.tmpdir(), `openpath-${crypto.randomBytes(6).toString("hex")}.png`);
      fs.writeFileSync(file, cap.image.toPNG(), { mode: 0o600 });
      const res = await runOcr(file, list);
      if (!res.ok) return res;
      matches = res.matches;
    }
    const W = display.size.width, H = display.size.height, best = new Map();
    for (const m of matches) {
      const box = { x: m.x * W, y: m.y * H, w: m.w * W, h: m.h * H, text: m.label };
      if (insideAny(box.x + box.w / 2, box.y + box.h / 2, exclude)) continue;
      const score = m.exact ? 2 : m.word ? 1 : 0;
      if (score < 1) continue;                                  // whole words only for page detection
      const prev = best.get(m.label);
      if (!prev || score > prev.score) best.set(m.label, { score, box });
    }
    return { ok: true, found: [...best.entries()].map(([label, v]) => ({ label, box: v.box })) };
  } catch (err) {
    return { ok: false, reason: "capture_failed", detail: String(err?.message || err) };
  } finally {
    if (file) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
  }
}

// Where the front browser's Back button and address bar are (screen points).
// Uses the browser's accessibility information when OpenPath has the
// Accessibility permission; otherwise finds the web address text at the top
// of the browser window and estimates the Back button beside it.
async function browserParts() {
  if (process.platform !== "darwin") return { ok: false, reason: "unsupported" };
  const info = await helperAsk({ cmd: "browser" });
  if (!info?.ok || !info.isBrowser) return { ok: false, reason: "not_browser", app: info?.app };
  const out = { ok: true, app: info.app, back: info.back || null, address: info.address || null, estimated: false };
  if ((!out.back || !out.address) && info.window) {
    // Without the Accessibility permission: browsers put the tab strip on top
    // and the toolbar (Back, Forward, Reload, address bar) in the row below.
    // Safari has a single row. Read only the toolbar row, so tab titles that
    // look like web addresses are ignored.
    const win = info.window, safari = /safari/i.test(info.app);
    const row = safari ? { top: win.y + 4, bottom: win.y + 48 } : { top: win.y + 40, bottom: win.y + 86 };
    const strip = { x: win.x, y: row.top, w: win.w, h: row.bottom - row.top };
    const m = await helperRead({ labels: [], fast: false, scale: 2, rect: strip });
    const urlish = /^(https?:\/\/)?(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;
    const lines = (m || []).map((x) => ({ text: x.text.trim(), x: strip.x + x.x * strip.w, y: strip.y + x.y * strip.h, w: x.w * strip.w, h: x.h * strip.h }));
    const hit = lines.find((x) => urlish.test(x.text.replace(/\s/g, ""))) || lines.find((x) => /search|type a url|address/i.test(x.text));
    const rowY = hit ? hit.y + hit.h / 2 : (row.top + row.bottom) / 2;
    if (!out.address) out.address = hit
      ? { x: hit.x - 44, y: rowY - 15, w: Math.min(hit.w + 64, win.w * 0.55), h: 30 }
      : { x: win.x + (safari ? win.w * 0.3 : 268), y: rowY - 15, w: Math.min(560, win.w * 0.4), h: 30 };
    if (!out.back) { out.back = { x: win.x + (safari ? 76 : 8), y: rowY - 14, w: 28, h: 28 }; out.estimated = true; }
  }
  return out;
}

// Every line of text inside `region` (screen points). Used to notice that the
// screen changed after the person clicked (a menu opened, a tab appeared).
async function readRegion(region, exclude) {
  if (process.platform !== "darwin") return { ok: false, reason: "unsupported" };
  const d = screen.getPrimaryDisplay().bounds;
  const r = { x: Math.max(0, region.x), y: Math.max(0, region.y) };
  r.w = Math.min(region.w, d.width - r.x); r.h = Math.min(region.h, d.height - r.y);
  if (r.w >= 20 && r.h >= 20) {
    // Detailed reading at full resolution: small text (a menu, a typed name)
    // must not be missed.
    const m = await helperRead({ labels: [], fast: false, scale: 2, rect: r });
    if (m) return { ok: true, lines: m.map((x) => x.text.trim()).filter(Boolean) };
  }
  let file = null;
  try {
    const { image, display } = await captureDisplay({ scale: 1 });
    const sf = 1;
    const x = Math.max(0, Math.round(region.x * sf)), y = Math.max(0, Math.round(region.y * sf));
    const w = Math.min(Math.round(region.w * sf), image.getSize().width - x), h = Math.min(Math.round(region.h * sf), image.getSize().height - y);
    if (w < 20 || h < 20) return { ok: false, reason: "tiny" };
    const crop = image.crop({ x, y, width: w, height: h });
    file = path.join(os.tmpdir(), `openpath-${crypto.randomBytes(6).toString("hex")}.png`);
    fs.writeFileSync(file, crop.toPNG(), { mode: 0o600 });
    const res = await runOcr(file, [], { fast: true });
    if (!res.ok) return res;
    const lines = res.matches
      .filter((m) => !insideAny(region.x + (m.x + m.w / 2) * region.w, region.y + (m.y + m.h / 2) * region.h, exclude))
      .map((m) => m.text.trim()).filter(Boolean);
    return { ok: true, lines };
  } catch (err) {
    return { ok: false, reason: "capture_failed", detail: String(err?.message || err) };
  } finally {
    if (file) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
  }
}

// A JPEG no wider than 1280 pixels: enough for Claude to read menus, about
// 1,500 input tokens per picture.
async function snapshotForClaude() {
  const { image, display } = await captureDisplay();
  const targetW = Math.min(1280, display.size.width * display.scaleFactor);
  const resized = image.resize({ width: Math.round(targetW), quality: "good" });
  const { width, height } = resized.getSize();
  return {
    data: resized.toJPEG(72).toString("base64"),
    width, height,
    toOverlay: (x, y) => ({ x: (x / width) * display.size.width, y: (y / height) * display.size.height }),
  };
}

function isSensitive(title) { return SENSITIVE.test(title || ""); }

function cleanup() {
  if (scriptFile) { try { fs.unlinkSync(scriptFile); } catch { /* ignore */ } }
  if (helper) { try { helper.kill(); } catch { /* ignore */ } }
}

module.exports = { locate, findAll, browserParts, readRegion, snapshotForClaude, isSensitive, cleanup };
