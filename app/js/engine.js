// Instruction engine. Order of operations for every request:
//   1. redact sensitive data (never leaves the device un-redacted)
//   2. scam guardrail → lockdown + caregiver alert if triggered
//   3. "next" / "again" handling for the active workflow (free)
//   4. built-in workflow library (free, instant, works offline)
//   5. Claude (Haiku by default; answers cached by SHA-256; 160-token cap)
//   6. plain fallback prompt
import { native } from "./bridge.js";
import { state, logEvent } from "./bus.js";
import { redact, detectScam, refusalText, scoreText } from "./guardrails.js";
import { findWorkflow, workflowStep, fallbackText, isAdvance, isRepeat, hasOfflineLanguage } from "./knowledge.js";

let active = null;   // { found, index, lang, screenId }

export function resetWorkflow() { active = null; }

// Shortens a window title for speaking: drops the browser name and trims.
function friendlyTitle(t) {
  return t.replace(/\s[-–—|]\s(Google Chrome|Brave|Microsoft Edge|Mozilla Firefox|Firefox|Safari|Arc|Opera)$/i, "")
    .replace(/\s+/g, " ").trim().slice(0, 60);
}

// When no Test Lab practice screen is selected, OpenPath looks at the real
// screen: the titles of the windows that are open right now (desktop app only).
// Titles are redacted on this computer before they are used anywhere.
async function liveScreen() {
  if (!native.screenContext) return null;
  let ctx;
  try { ctx = await native.screenContext(); } catch { return null; }
  if (ctx?.reason === "web") return null;   // a browser page cannot see other windows
  if (!ctx?.ok) {
    if (ctx?.reason === "permission") logEvent({ type: "warn", title: "Can't see your windows yet", detail: "Allow OpenPath under System Settings → Privacy & Security → Screen Recording, then reopen OpenPath." });
    return { id: "live", live: true, title: "the person's real screen", elements: ["Window names are not available (permission not granted)"], windows: [] };
  }
  const windows = ctx.windows.map((w) => friendlyTitle(redact(w).text)).filter(Boolean);
  const risky = scoreText(windows.join(" \n "));
  const screen = {
    id: "live", live: true,
    title: "the person's real screen",
    elements: windows.length ? windows.map((w) => `Open window: ${w}`) : ["No other windows are open"],
    windows,
  };
  if (risky.score >= 5) {
    screen.risk = { scam: true, category: "suspicious_window", cues: risky.reasons.map((r) => `window title shows ${r}`) };
  }
  return screen;
}

export async function respond(rawQuery) {
  const lang = state.settings.language || "en";
  const screen = state.screen || (await liveScreen());

  const { text: query, redactions } = redact(rawQuery);
  if (redactions.length) {
    logEvent({ type: "redaction", title: "Sensitive data kept on device", detail: redactions.join(", ") });
  }

  // ---- 2. scam guardrail ----
  const verdict = detectScam({ query, screen });
  if (verdict.scam) {
    active = null;
    const text = refusalText(lang, verdict.category);
    const caregiver = state.settings.caregiverName || null;
    logEvent({ type: "lockdown", title: "Scam blocked", detail: verdict.reasons.join(" · "), category: verdict.category });
    logEvent({ type: "caregiver", title: caregiver ? `Alert sent to ${caregiver}` : "Caregiver alert (no caregiver set yet)", detail: `"${rawQuery.slice(0, 90)}"${screen ? ` while viewing: ${screen.title}` : ""}` });
    notifyCaregiver(verdict, rawQuery, screen);
    return { text, lock: { reasons: verdict.reasons, category: verdict.category }, source: "guardrail" };
  }

  // ---- 3. continue / repeat the active workflow ----
  if (active && active.lang === lang) {
    if (isRepeat(query, lang)) {
      const step = workflowStep(active.found, active.index, lang);
      return { text: step.text, source: "offline", step };
    }
    if (isAdvance(query, lang)) {
      const step = workflowStep(active.found, active.index + 1, lang);
      active.index = step.index;
      if (step.last) { const out = { text: step.text, source: "offline", step }; active = null; return out; }
      return { text: step.text, source: "offline", step };
    }
  }

  // ---- 4. built-in library ----
  if (hasOfflineLanguage(lang) || !(state.settings.anthropicKey || "").trim()) {
    const found = findWorkflow(query, lang, screen);
    if (found) {
      const step = workflowStep(found, 0, lang);
      active = step.last ? null : { found, index: 0, lang, screenId: screen?.id || null };
      let text = step.text;
      if (verdict.score > 0 && screen?.risk?.scam) {
        // Something suspicious is visible even though the request is benign.
        text += { en: " Also, I noticed a suspicious message on this screen. Don't open it, and ask me if you're unsure.", es: " Además, veo un mensaje sospechoso en esta pantalla. No lo abra, y pregúnteme si tiene dudas.", zh: " 另外，我注意到这个屏幕上有一条可疑的消息。不要打开它，不确定的话可以问我。", hi: " एक बात और, इस स्क्रीन पर मुझे एक संदिग्ध संदेश दिख रहा है। उसे मत खोलिए, और शक हो तो मुझसे पूछिए।" }[lang] || "";
      }
      return { text, source: "offline", step };
    }
  }

  // ---- 5. Claude ----
  const res = await native.instruct({ query, language: lang, screen, history: state.history.slice(-4) });
  if (res.ok) {
    active = null;
    logEvent({ type: "cost", title: res.cached ? "Answer served from cache" : "Claude answered", detail: res.cached ? "0 tokens" : `${res.usage?.input_tokens || 0} in / ${res.usage?.output_tokens || 0} out tokens` });
    return { text: res.text, source: res.cached ? "cache" : "claude" };
  }
  if (res.reason === "bad_key") logEvent({ type: "warn", title: "Anthropic key rejected", detail: "Check the key in Settings → Keys" });
  if (res.reason === "rate_limited") logEvent({ type: "warn", title: "Claude is busy", detail: "Using built-in answers for now" });
  if (res.reason === "offline") logEvent({ type: "warn", title: "No internet", detail: "Using built-in answers" });

  // ---- 6. fallback ----
  const found = findWorkflow(query, "en", screen);   // last try: English matching
  if (found) {
    const step = workflowStep(found, 0, lang);
    active = step.last ? null : { found, index: 0, lang, screenId: screen?.id || null };
    return { text: step.text, source: "offline", step };
  }
  return { text: fallbackText(lang, screen), source: "offline" };
}

async function notifyCaregiver(verdict, query, screen) {
  const url = (state.settings.caregiverWebhook || "").trim();
  if (!/^https:\/\//.test(url)) return;
  try {
    await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "openpath.scam_blocked", at: new Date().toISOString(),
        category: verdict.category, reasons: verdict.reasons,
        screen: screen?.title || null, said: redact(query).text,
      }),
    });
  } catch { /* alerts are best-effort; the lockdown itself does not depend on network */ }
}
