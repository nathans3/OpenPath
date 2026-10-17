// Tiny JSON settings store in the app's userData folder. No native deps.
const { app } = require("electron");
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
  openaiKey: "",
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

function readRaw() {
  try { return JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { return {}; }
}

function getAll() {
  const raw = readRaw();
  // Prices always come from the app, never from an older saved file.
  const account = { ...DEFAULTS.account, ...(raw.account || {}), monthlyPrice: DEFAULTS.account.monthlyPrice, setupPrice: DEFAULTS.account.setupPrice };
  const merged = { ...DEFAULTS, ...raw, account, usage: { ...DEFAULTS.usage, ...(raw.usage || {}) } };
  delete merged.localOnly;                 // local-only mode was removed; OpenPath always answers with Claude
  if (!merged.account.trialStartedAt) {
    merged.account.trialStartedAt = new Date().toISOString();
    write(merged);
  }
  return merged;
}

function write(obj) {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(obj, null, 2));
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
