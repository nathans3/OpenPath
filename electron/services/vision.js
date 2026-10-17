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
  req.recognitionLevel = 0;
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

async function captureDisplay() {
  const d = screen.getPrimaryDisplay();
  const width = Math.round(d.size.width * d.scaleFactor);
  const height = Math.round(d.size.height * d.scaleFactor);
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) throw new Error("capture_failed");
  return { image: src.thumbnail, display: d };
}

function runOcr(file, labels) {
  return new Promise((resolve) => {
    execFile("osascript", ["-l", "JavaScript", ocrScriptPath(), file, JSON.stringify(labels)], { maxBuffer: 1 << 24, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, reason: "ocr_failed", detail: String(err.message || err).slice(0, 200) });
      try { resolve({ ok: true, matches: JSON.parse(stdout) }); } catch { resolve({ ok: false, reason: "ocr_failed" }); }
    });
  });
}

// Finds the best on-screen match for any of `labels`. `near` (overlay
// coordinates) prefers matches close to where OpenPath pointed last, which is
// how "Tab" is found inside the Insert menu rather than in the menu bar.
async function locate(labels, near) {
  if (process.platform !== "darwin") return { ok: false, reason: "unsupported" };
  const list = (labels || []).filter(Boolean).slice(0, 6);
  if (!list.length) return { ok: false, reason: "no_labels" };
  let file = null;
  try {
    const { image, display } = await captureDisplay();
    file = path.join(os.tmpdir(), `openpath-${crypto.randomBytes(6).toString("hex")}.png`);
    fs.writeFileSync(file, image.toPNG(), { mode: 0o600 });
    const res = await runOcr(file, list);
    if (!res.ok) return res;
    const W = display.size.width, H = display.size.height;
    const scored = res.matches.map((m) => {
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

function cleanup() { if (scriptFile) { try { fs.unlinkSync(scriptFile); } catch { /* ignore */ } } }

module.exports = { locate, snapshotForClaude, isSensitive, cleanup };
