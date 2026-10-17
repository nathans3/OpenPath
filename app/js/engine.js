// Instruction engine. Order of operations for every request:
//   1. redact sensitive data (never leaves the device un-redacted)
//   2. scam guardrail → lockdown + caregiver alert if triggered
//   3. "next" / "again" handling for the active workflow (free)
//   4. built-in workflow library (free, instant, works offline)
//   5. Claude (Haiku by default; answers cached by SHA-256; 160-token cap)
//   6. plain fallback prompt
import { native } from "./bridge.js";
import { state, logEvent } from "./bus.js";
import { redact, detectScam, refusalText, scoreText, isSensitiveTitle } from "./guardrails.js";
import { t } from "./i18n.js";
import { findGuide } from "./guides.js";
import { findWorkflow, workflowStep, fallbackText, isAdvance, isRepeat, hasOfflineLanguage } from "./knowledge.js";

let active = null;   // { found, index, lang, screenId }

export function resetWorkflow() { active = null; }
export function hasActiveGuide() { return !!active; }

// Moves the active built-in guide to its next step (after OpenPath notices
// the person clicked). Returns null when there is no guide or it has ended.
export function nextStep() {
  if (!active) return null;
  const lang = state.settings.language || "en";
  if (active.lang !== lang) { active = null; return null; }
  if (active.index + 1 >= active.total) { active = null; return { done: true }; }
  const step = workflowStep(active.found, active.index + 1, lang);
  active.index = step.index;
  if (step.last) active = null;
  return { text: step.text, source: "offline", step };
}

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
  // Windows arrive front to back, so windows[0] is what the person is using.
  const windows = ctx.windows.map((w) => friendlyTitle(redact(w).text)).filter(Boolean);
  const risky = scoreText(windows.join(" \n "));
  const screen = {
    id: "live", live: true,
    title: "the person's real screen",
    elements: windows.length
      ? windows.map((w, i) => (i === 0 ? `Front window (what they are using now): ${w}` : `Also open: ${w}`))
      : ["No other windows are open"],
    windows,
  };
  if (risky.score >= 5) {
    const has = (w) => risky.reasons.some((r) => r.includes(w));
    const category = has("tech support") || has("virus") ? "fake_tech_support" : has("prize") || has("fee") ? "fake_prize" : has("relative") || has("gift") ? "family_emergency" : "suspicious_window";
    screen.risk = { scam: true, category, cues: risky.reasons.map((r) => `window title shows ${r}`) };
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

  // ---- 3b. page-aware guides for real websites (Google sign-up) ----
  const guide = findGuide(query, lang);
  if (guide) { active = null; return { guide, text: "", source: "offline" }; }

  // ---- 4. built-in library ----
  if (hasOfflineLanguage(lang) || !(state.settings.hasAnthropicKey || (state.settings.anthropicKey || "").trim())) {
    const found = findWorkflow(query, lang, screen);
    if (found) {
      const step = workflowStep(found, 0, lang);
      active = step.last ? null : { found, index: 0, total: step.total, lang, screenId: screen?.id || null };
      let text = step.text;
      if (verdict.score > 0 && screen?.risk?.scam) {
        // Something suspicious is visible even though the request is benign.
        text += { en: " Also, I noticed a suspicious message on this screen. Don't open it, and ask me if you're unsure.", es: " Además, veo un mensaje sospechoso en esta pantalla. No lo abra, y pregúnteme si tiene dudas.", zh: " 另外，我注意到这个屏幕上有一条可疑的消息。不要打开它，不确定的话可以问我。", hi: " एक बात और, इस स्क्रीन पर मुझे एक संदिग्ध संदेश दिख रहा है। उसे मत खोलिए, और शक हो तो मुझसे पूछिए।" }[lang] || "";
      }
      return { text, source: "offline", step };
    }
  }

  // ---- 5. Claude ----
  // History sent to Claude: earlier turns only (the current question is sent
  // separately), with the visible window titles as screen context.
  const history = state.history.slice(-5, -1).map((h) => ({ ...h, text: redact(h.text).text }));

  // 5a. On the real screen, Claude can look at a picture of it and point.
  // Only with the person's permission, never on bank/health/password pages.
  if (screen?.live && screen.windows?.length) {
    const pictures = state.settings.screenPictures || "ask";
    const front = screen.windows[0];
    if (pictures !== "off" && !isSensitiveTitle(front) && native.aiAvailable && (await native.aiAvailable())) {
      if (pictures === "ask") return { text: t(lang, "consentPictures"), consent: true, source: "offline" };
      const pr = await native.point({ query, language: lang, history, frontTitle: front });
      if (pr.ok) {
        active = null;
        logEvent({ type: "cost", title: pr.escalated ? "Expert AI answered (Sonnet)" : "Quick AI answered (Haiku)", detail: `${pr.usage?.input_tokens || 0} in / ${pr.usage?.output_tokens || 0} out tokens. The picture was not saved.` });
        return { text: pr.text, source: "claude", point: pr.target || null };
      }
      if (pr.reason && !["no_key", "sensitive"].includes(pr.reason)) logEvent({ type: "warn", title: "Couldn't use a screen picture", detail: `${pr.reason}. Answering from window names instead.` });
    }
  }

  // 5b. Text only: window titles as context.
  const res = await native.instruct({ query, language: lang, screen, history });
  if (res.ok) {
    active = null;
    logEvent({ type: "cost", title: res.cached ? "Answer served from cache" : "Claude answered", detail: res.cached ? "0 tokens" : `${res.usage?.input_tokens || 0} in / ${res.usage?.output_tokens || 0} out tokens` });
    return { text: res.text, source: res.cached ? "cache" : "claude" };
  }
  if (res.reason === "no_key") logEvent({ type: "warn", title: "Full answers not set up yet", detail: "Built-in guides only. Add an Anthropic API key in Settings → Setup to answer any question." });
  if (res.reason === "bad_key") logEvent({ type: "warn", title: "AI key not accepted", detail: "Check the key in Settings → Setup" });
  if (res.reason === "rate_limited") logEvent({ type: "warn", title: "Claude is busy", detail: "Using built-in answers for now" });
  if (res.reason === "offline") logEvent({ type: "warn", title: "No internet", detail: "Using built-in answers" });
  if (res.reason === "error") logEvent({ type: "warn", title: "Claude request failed", detail: res.detail || "Unknown error" });

  // ---- 6. fallback ----
  const found = findWorkflow(query, "en", screen);   // last try: English matching
  if (found) {
    const step = workflowStep(found, 0, lang);
    active = step.last ? null : { found, index: 0, total: step.total, lang, screenId: screen?.id || null };
    return { text: step.text, source: "offline", step };
  }
  const reason = res.reason === "offline" ? "offline" : res.reason === "local_only" ? "local_only" : res.reason === "no_key" || res.reason === "bad_key" ? "no_key" : null;
  return { text: fallbackText(lang, screen, { reason, query }), source: "offline" };
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
        screen: screen?.title ? redact(screen.title).text : null, said: redact(query).text,
      }),
    });
  } catch { /* alerts are best-effort; the lockdown itself does not depend on network */ }
}
