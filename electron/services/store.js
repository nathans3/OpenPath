// Tiny JSON settings store in the app's userData folder. No native deps.
// The Claude key is encrypted with the operating system's own protection
// (macOS Keychain, Windows DPAPI) before it is written to disk.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = () => path.join(app.getPath("userData"), "openpath-settings.json");

const DEFAULTS = {
  language: "en",
  voiceRate: 0.92,
  voiceStyle: "warm",
  autoSilenceMs: 2200,
  boxHideSeconds: 15,           // the answer box fades after this many idle seconds; 0 = never
  maxListenMs: 20000,
  sttProvider: "auto",          // auto | local | openai | typed
  ttsProvider: "auto",          // auto (Kokoro for English, computer voices otherwise) | kokoro | system
  anthropicKey: "",
  qualityMode: "best",          // best | low
  modelChoice: "",              // "" = follow qualityMode; or a specific Claude model id
  bestMonthlyCap: 300,          // expert (Sonnet) answers per month; then Haiku's answer stands
  hideFromRecordings: false,    // true = OpenPath does not appear in screen recordings or screen sharing
  screenPictures: "ask",        // ask | on | off — may Claude see a picture of the screen to point?
  caregiverName: "",
  caregiverPhone: "",
  caregiverWebhook: "",
  account: {
    plan: "trial",
    trialStartedAt: null,
    setupPaid: false,
    monthlyPrice: 7.99,
    setupPrice: 29,
  },
  usage: { llmCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, sttSeconds: 0, cacheHitsLLM: 0, llmMonth: "", bestCallsMonth: 0 },
};

function canEncrypt() { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } }

function readRaw() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { return {}; }
  if (raw.anthropicKeyEnc) {
    try { raw.anthropicKey = safeStorage.decryptString(Buffer.from(raw.anthropicKeyEnc, "base64")); } catch { raw.anthropicKey = ""; }
  }
  delete raw.anthropicKeyEnc;
  return raw;
}

function getAll() {
  const raw = readRaw();
  // Prices always come from the app, never from an older saved file.
  const account = { ...DEFAULTS.account, ...(raw.account || {}), monthlyPrice: DEFAULTS.account.monthlyPrice, setupPrice: DEFAULTS.account.setupPrice };
  const merged = { ...DEFAULTS, ...raw, account, usage: { ...DEFAULTS.usage, ...(raw.usage || {}) } };
  delete merged.localOnly;                 // local-only mode was removed; OpenPath always answers with Claude
  delete merged.openaiKey;                 // cloud listening was removed; listening stays on this computer
  if (!merged.account.trialStartedAt) {
    merged.account.trialStartedAt = new Date().toISOString();
    write(merged);
  }
  return merged;
}

function write(obj) {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    const out = { ...obj };
    delete out.hasAnthropicKey;
    if (out.anthropicKey && canEncrypt()) {
      out.anthropicKeyEnc = safeStorage.encryptString(out.anthropicKey).toString("base64");
      delete out.anthropicKey;
    }
    fs.writeFileSync(FILE(), JSON.stringify(out, null, 2), { mode: 0o600 });
  } catch (e) { console.error("settings write failed", e); }
}

function patch(p) {
  const cur = getAll();
  const next = { ...cur, ...p };
  if (p.account) next.account = { ...cur.account, ...p.account };
  if (p.usage) next.usage = { ...cur.usage, ...p.usage };
  write(next);
  return next;
}

function bumpUsage(delta) {
  const cur = getAll();
  const usage = { ...cur.usage };
  for (const k of Object.keys(delta)) usage[k] = (usage[k] || 0) + delta[k];
  write({ ...cur, usage });
  return usage;
}

module.exports = { getAll, patch, bumpUsage, DEFAULTS };
