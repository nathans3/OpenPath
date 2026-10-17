// Shared in-page state and events for the overlay (circle + sidebar).
import { native } from "./bridge.js";

const target = new EventTarget();

export const state = {
  settings: null,
  status: "idle",          // idle | listening | thinking | speaking | locked
  transcript: "",
  reply: "",
  screen: null,            // current simulated screen from the Test Lab
  history: [],             // [{role:'user'|'assistant', text}]
  events: [],              // caregiver alerts, lockdowns, cost events
  lock: null,              // {reasons:[], at}
  sttMode: "detecting",    // local | webspeech | openai | typed
  ttsMode: "system",       // elevenlabs | system
  lastSource: "offline",   // offline | claude | cache
};

export function on(name, cb) { target.addEventListener(name, (e) => cb(e.detail)); }
export function emit(name, detail) { target.dispatchEvent(new CustomEvent(name, { detail })); }

export function setStatus(s) { state.status = s; emit("status", s); }

export async function loadSettings() {
  state.settings = await native.getSettings();
  emit("settings", state.settings);
  return state.settings;
}

export async function saveSettings(patch) {
  state.settings = await native.setSettings(patch);
  emit("settings", state.settings);
  return state.settings;
}

export function logEvent(evt) {
  const entry = { at: Date.now(), ...evt };
  state.events.unshift(entry);
  if (state.events.length > 60) state.events.pop();
  emit("event", entry);
  try { native.publishEvent(entry); } catch { /* ignore */ }
  return entry;
}
