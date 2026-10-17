// Platform bridge. In the desktop app `window.openpathNative` comes from the
// Electron preload. In a plain browser (the shareable web preview) we provide
// the same interface with browser-side implementations, so every other file
// is identical between the two.

const bus = new EventTarget();
const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
const on = (name, cb) => bus.addEventListener(name, (e) => cb(e.detail));

const WEB_DEFAULTS = {
  language: "en", voiceRate: 0.92, voiceStyle: "warm", autoSilenceMs: 2200, maxListenMs: 20000, boxHideSeconds: 15,
  sttProvider: "auto", ttsProvider: "auto",
  anthropicKey: "", openaiKey: "",
  qualityMode: "best", modelChoice: "", screenPictures: "ask",
  caregiverName: "", caregiverPhone: "", caregiverWebhook: "",
  account: { plan: "trial", trialStartedAt: null, setupPaid: false, monthlyPrice: 7.99, setupPrice: 29 },
  usage: { llmCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, sttSeconds: 0, cacheHitsLLM: 0 },
};

function lsGet(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } }

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const WEB_SYSTEM = `You are OpenPath, a patient voice guide for older adults using a computer.
Rules:
- Give exactly ONE next step. Never list several steps.
- Use plain words, short sentences, no jargon. Name what to look for on screen (color, position, label).
- Maximum 35 words. End with a short reassurance or "Tell me when you're ready."
- Never ask for passwords, Social Security numbers, card numbers or codes. If the user needs to enter one, tell them to type it themselves and that you will not read it.
- If the request involves paying someone unexpected, gift cards, wire transfers, remote access, "tech support" phone numbers, or urgent threats, refuse and say to call a family member.
- Reply in the language code given, using everyday words a grandparent would use.
- Often you only know the titles of the open windows. Then rely on what you know about that app's current layout (menu names, where buttons usually are) and say exactly where to look and what to click.
- If the question could mean two things (for example a browser tab or a tab inside Google Docs), answer the most likely one for the front window and mention the other in a few words.`;

let webWatch = null, webInput = null;

function webBridge() {
  let settings = { ...WEB_DEFAULTS, ...lsGet("openpath-settings", {}) };
  settings.account = { ...WEB_DEFAULTS.account, ...(settings.account || {}), monthlyPrice: WEB_DEFAULTS.account.monthlyPrice, setupPrice: WEB_DEFAULTS.account.setupPrice };
  settings.usage = { ...WEB_DEFAULTS.usage, ...(settings.usage || {}) };
  if (!settings.account.trialStartedAt) { settings.account.trialStartedAt = new Date().toISOString(); lsSet("openpath-settings", settings); }
  const answerCache = lsGet("openpath-answers", {});

  const bump = (delta) => {
    for (const k of Object.keys(delta)) settings.usage[k] = (settings.usage[k] || 0) + delta[k];
    lsSet("openpath-settings", settings);
  };

  return {
    platform: "web",
    setInteractive() {},
    async getSettings() { return structuredClone(settings); },
    async setSettings(patch) {
      settings = { ...settings, ...patch };
      if (patch.account) settings.account = { ...settings.account, ...patch.account };
      if (patch.usage) settings.usage = { ...settings.usage, ...patch.usage };
      lsSet("openpath-settings", settings);
      return structuredClone(settings);
    },

    async instruct({ query, language, screen, history }) {
      const apiKey = (settings.anthropicKey || "").trim();
      if (!apiKey) return { ok: false, reason: "no_key" };
      const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
      const model = settings.modelChoice || (settings.qualityMode === "low" ? "claude-haiku-5-5" : "claude-sonnet-5-5");
      const key = await sha256(JSON.stringify({ v: 3, model, language, normalized, screen: screen ? [screen.id, ...(screen.elements || [])] : null, recent: (history || []).slice(-2).map((h) => h.text) }));
      if (answerCache[key]) { bump({ cacheHitsLLM: 1 }); return { ok: true, text: answerCache[key], cached: true }; }
      const context = screen ? `Screen the user is looking at: ${screen.title}. Visible elements: ${screen.elements.join("; ")}.` : "Screen context unavailable.";
      const messages = (history || []).slice(-4).map((t) => ({ role: t.role, content: t.text }));
      while (messages.length && messages[0].role !== "user") messages.shift();
      messages.push({ role: "user", content: `Language: ${language}\n${context}\nUser said: "${query}"` });
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            ...(model === "claude-haiku-5-5" ? {} : { "anthropic-beta": "server-side-fallback-2026-07-01" }),
          },
          body: JSON.stringify({
            model,
            max_tokens: model === "claude-haiku-5-5" ? 160 : 4000,
            system: [{ type: "text", text: WEB_SYSTEM, cache_control: { type: "ephemeral" } }],
            messages,
            ...(model === "claude-haiku-5-5" ? {} : { output_config: { effort: "low" }, fallbacks: "default" }),
          }),
        });
        if (res.status === 401) return { ok: false, reason: "bad_key" };
        if (res.status === 429) return { ok: false, reason: "rate_limited" };
        if (!res.ok) return { ok: false, reason: "error", detail: `HTTP ${res.status}` };
        const data = await res.json();
        if (data.stop_reason === "refusal") return { ok: false, reason: "refusal" };
        const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
        if (!text) return { ok: false, reason: "empty" };
        bump({ llmCalls: 1, llmInputTokens: data.usage?.input_tokens || 0, llmOutputTokens: data.usage?.output_tokens || 0 });
        answerCache[key] = text; lsSet("openpath-answers", answerCache);
        return { ok: true, text, cached: false, usage: data.usage };
      } catch (e) {
        return { ok: false, reason: "offline", detail: String(e?.message || e) };
      }
    },

    async transcribe({ audioBase64, mime, language, durationSec }) {
      const apiKey = (settings.openaiKey || "").trim();
      if (!apiKey) return { ok: false, reason: "no_key" };
      try {
        const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: mime || "audio/webm" }), "speech.webm");
        form.append("model", "whisper-1");
        if (language && language !== "auto") form.append("language", language);
        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
        if (res.status === 401) return { ok: false, reason: "bad_key" };
        if (!res.ok) return { ok: false, reason: "error", detail: `Whisper ${res.status}` };
        const data = await res.json();
        bump({ sttSeconds: Math.round(durationSec || 0) });
        return { ok: true, text: (data.text || "").trim() };
      } catch (e) { return { ok: false, reason: "offline", detail: String(e?.message || e) }; }
    },

    // The web preview cannot see other windows, but it can point at the
    // practice screen on the same page by searching its text.
    async locate(labels, near) {
      const stage = document.getElementById("lab-stage");
      if (!stage) return { ok: false, reason: "no_stage" };
      const wanted = (labels || []).filter(Boolean).map((l) => l.toLowerCase());
      const hits = [];
      for (const el of stage.querySelectorAll("button, a, label, li, h2, h3, .n, td, span, b, input")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const own = (el.innerText || el.placeholder || "").trim().toLowerCase().split("\n")[0];
        for (const [i, w] of wanted.entries()) {
          if (!own.includes(w)) continue;
          let score = (own === w ? 100 : own.startsWith(w) ? 60 : 30) - i * 5 - el.querySelectorAll("*").length;
          if (el.matches("button, a, input, [role=button]")) score += 40;     // ring the whole control, not just its words
          if (near) score -= Math.hypot(r.x + r.width / 2 - near.x, r.y + r.height / 2 - near.y) / 8;
          hits.push({ score, box: { x: r.x, y: r.y, w: r.width, h: r.height, text: labels[i], space: "page" } });
        }
      }
      hits.sort((a, b) => b.score - a.score);
      return hits.length ? { ok: true, box: hits[0].box } : { ok: false, reason: "not_found" };
    },
    async point() { return { ok: false, reason: "web" }; },
    async findAll() { return { ok: false, reason: "web" }; },
    async browserParts() { return { ok: false, reason: "web" }; },
    // In the web preview the practice screen is on the same page, so a real
    // click inside the ring is easy to notice.
    async watchTarget({ id, box, clicks = true }) {
      if (webWatch) document.removeEventListener("click", webWatch, true);
      if (webInput) document.removeEventListener("input", webInput, true);
      webInput = null;
      if (!clicks) {
        // A typing step: move on once something has been typed and left for a moment.
        let timer = null;
        webInput = (e) => {
          if (!(e.target instanceof HTMLInputElement)) return;
          clearTimeout(timer);
          if (!e.target.value.trim()) return;
          timer = setTimeout(() => { document.removeEventListener("input", webInput, true); webInput = null; emit("follow:advance", { id, reason: "typed" }); }, 1400);
        };
        document.addEventListener("input", webInput, true);
        return { ok: true, clicks: false, screen: false };
      }
      webWatch = (e) => {
        const pad = 14;
        const inside = (x, y) => x >= box.x - pad && x <= box.x + box.w + pad && y >= box.y - pad && y <= box.y + box.h + pad;
        // The click's position, or (keyboard Enter, assistive tech) the center of the control that was pressed.
        const el = e.target instanceof Element ? e.target.closest("button, a, input, label, li, [role=button]") : null;
        const r = el ? el.getBoundingClientRect() : null;
        const hit = (e.clientX || e.clientY ? inside(e.clientX, e.clientY) : false) || (r ? inside(r.x + r.width / 2, r.y + r.height / 2) : false);
        if (hit) {
          document.removeEventListener("click", webWatch, true); webWatch = null;
          setTimeout(() => emit("follow:advance", { id, reason: "clicked" }), 500);
        }
      };
      document.addEventListener("click", webWatch, true);
      return { ok: true, clicks: true, screen: false };
    },
    async stopWatch() { if (webWatch) { document.removeEventListener("click", webWatch, true); webWatch = null; } if (webInput) { document.removeEventListener("input", webInput, true); webInput = null; } return true; },
    async followStatus() { return { clicks: true, platform: "web" }; },
    async requestClickPermission() { return true; },
    onFollow: (cb) => on("follow:advance", cb),
    async aiAvailable() { return !!(settings.anthropicKey || "").trim(); },

    async openLab() { emit("web:openLab"); return true; },
    publishScreen(state) { emit("lab:screen", state); },
    labSay(text) { emit("lab:say", text); },
    publishEvent(evt) { emit("overlay:event", evt); },
    async screenContext() { return { ok: false, reason: "web" }; },   // a browser page cannot see other windows
    async info() { return { platform: "web", version: "0.1.0", userData: "browser storage" }; },

    onScreen: (cb) => on("lab:screen", cb),
    onLabSay: (cb) => on("lab:say", cb),
    onEvent: (cb) => on("overlay:event", cb),
    onOpenLab: (cb) => on("web:openLab", cb),
  };
}

export const native = window.openpathNative || webBridge();
export const isDesktop = native.platform === "electron";
