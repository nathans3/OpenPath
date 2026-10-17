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
  maxListenMs: 20000,
  sttProvider: "auto",          // auto | local | openai | typed
  ttsProvider: "auto",          // auto | elevenlabs | system
  anthropicKey: "",
  elevenLabsKey: "",
  elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
  openaiKey: "",
  model: "claude-haiku-5-5",
  screenPictures: "ask",        // ask | on | off — may Claude see a picture of the screen to point?
  ttsMonthlyCap: 60000,         // ElevenLabs characters per month (≈ $3); then the free voice
  caregiverName: "",
  caregiverPhone: "",
  caregiverWebhook: "",
  account: {
    plan: "trial",
    trialStartedAt: null,
    setupPaid: false,
    monthlyPrice: 15,
    setupPrice: 29,
  },
  usage: { llmCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, ttsChars: 0, ttsCacheHits: 0, sttSeconds: 0, cacheHitsLLM: 0, ttsMonth: "", ttsCharsMonth: 0 },
};

function readRaw() {
  try { return JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { return {}; }
}

function getAll() {
  const raw = readRaw();
  // Prices always come from the app, never from an older saved file.
  const account = { ...DEFAULTS.account, ...(raw.account || {}), monthlyPrice: DEFAULTS.account.monthlyPrice, setupPrice: DEFAULTS.account.setupPrice };
  const merged = { ...DEFAULTS, ...raw, account, usage: { ...DEFAULTS.usage, ...(raw.usage || {}) } };
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
