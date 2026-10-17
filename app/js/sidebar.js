// Settings sidebar: Voice · Family · Account · Keys · History · Costs
import { native, isDesktop } from "./bridge.js";
import { state, on, saveSettings, logEvent } from "./bus.js";
import { LANGUAGES, t, hasFullUi } from "./i18n.js";
import { speak, warmLocalWhisper, warmKokoro, kokoroState } from "./speech.js";
import { hasOfflineLanguage } from "./knowledge.js";

const PRICE = { haikuIn: 0.10, haikuOut: 0.50, opusIn: 4, opusOut: 20, elevenPer1k: 0.03, whisperPerMin: 0.006 };

export function mountSidebar(root) {
  const side = document.createElement("aside");
  side.id = "op-sidebar";
  side.setAttribute("aria-label", "OpenPath settings");
  root.append(side);

  const TABS = ["voice", "family", "account", "keys", "history", "costs"];
  let tab = "voice";
  let open = false;

  function L() { return state.settings?.language || "en"; }
  function s() { return state.settings; }

  function render() {
    const lang = L();
    side.className = (open ? "open" : "") + (state.status === "locked" ? " locked" : "");
    side.innerHTML = `
      <div class="op-side-head"><h2>${t(lang, "settings")}</h2><button class="close" type="button" aria-label="Close">✕</button></div>
      <div class="op-tabs" role="tablist">${TABS.map((k) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${t(lang, "tab" + k[0].toUpperCase() + k.slice(1))}</button>`).join("")}</div>
      <div class="op-panel">${PANELS[tab](lang)}</div>`;
    wire();
  }

  const PANELS = {
    voice: (lang) => `
      <div class="op-status-line">
        <span class="op-chip ${state.sttMode === "typed" ? "warn" : "ok"}">🎙 ${sttLabel()}</span>
        <span class="op-chip ${state.ttsMode === "elevenlabs" || state.ttsMode === "kokoro" ? "ok" : ""}">🔊 ${{ elevenlabs: "ElevenLabs", kokoro: "Natural voice (local)", system: "System voice" }[state.ttsMode] || "System voice"}</span>
        <span class="op-chip">${isDesktop ? "Desktop" : "Web preview"}</span>
      </div>
      <div class="op-field"><span class="lbl">${t(lang, "language")}</span>
        <div class="op-langs">${LANGUAGES.map((l) => `<button type="button" data-lang="${l.code}" aria-pressed="${l.code === lang}"><span>${l.native}</span><small>${l.name}${hasOfflineLanguage(l.code) ? "" : " · needs Claude key for answers"}</small></button>`).join("")}</div>
        ${hasFullUi(lang) ? "" : `<p class="op-help">Buttons stay in English for this language; voice in and out use ${LANGUAGES.find((l) => l.code === lang).name}.</p>`}
      </div>
      <div class="op-field"><label for="op-rate">${t(lang, "speed")}</label>
        <input type="range" id="op-rate" min="0.7" max="1.15" step="0.05" value="${s().voiceRate}">
        <div class="op-range-labels"><span>${t(lang, "slower")}</span><span>${t(lang, "faster")}</span></div></div>
      <div class="op-field"><label for="op-pause">${t(lang, "pauseTolerance")}</label>
        <input type="range" id="op-pause" min="1200" max="4500" step="100" value="${s().autoSilenceMs}">
        <div class="op-range-labels"><span>${t(lang, "short")} (1.2s)</span><span>${(s().autoSilenceMs / 1000).toFixed(1)}s</span><span>${t(lang, "long")} (4.5s)</span></div>
        <p class="op-help">How long I wait after you stop talking before I answer. Longer is kinder when you pause to think. I always stop listening after ${Math.round(s().maxListenMs / 1000)} seconds.</p></div>
      <div class="op-field"><label for="op-stt">${t(lang, "micMode")}</label>
        <select id="op-stt">
          <option value="auto" ${s().sttProvider === "auto" ? "selected" : ""}>Automatic (best free option)</option>
          <option value="local" ${s().sttProvider === "local" ? "selected" : ""}>Whisper on this computer (private, free)</option>
          <option value="openai" ${s().sttProvider === "openai" ? "selected" : ""}>Whisper cloud (needs OpenAI key)</option>
          <option value="typed" ${s().sttProvider === "typed" ? "selected" : ""}>Keyboard only</option>
        </select>
        <p class="op-help">The microphone is only on after you tap the circle, never in the background. <button type="button" class="op-btn ghost" id="op-warm" style="min-height:36px;padding:4px 10px;font-size:14px">Download local Whisper now</button> <span id="op-warm-status" class="op-help"></span></p></div>
      <div class="op-field"><label for="op-tts">${t(lang, "voiceMode")}</label>
        <select id="op-tts">
          <option value="auto" ${s().ttsProvider === "auto" ? "selected" : ""}>Automatic (ElevenLabs if key → natural local voice → system)</option>
          <option value="elevenlabs" ${s().ttsProvider === "elevenlabs" ? "selected" : ""}>ElevenLabs (needs key)</option>
          <option value="kokoro" ${s().ttsProvider === "kokoro" ? "selected" : ""}>Natural voice on this computer (free, English)</option>
          <option value="system" ${s().ttsProvider === "system" ? "selected" : ""}>System voice (free, all languages)</option>
        </select>
        <p class="op-help">The natural voice is Kokoro, a small neural voice that runs on this computer after a one-time download (about 90 MB). <button type="button" class="op-btn ghost" id="op-warm-voice" style="min-height:36px;padding:4px 10px;font-size:14px">${kokoroState() === "ready" ? "Natural voice ready" : "Download natural voice"}</button> <span id="op-warm-voice-status" class="op-help"></span></p>
        <label for="op-style" style="font-weight:700;font-size:15px;color:var(--ink-2)">Voice character</label>
        <select id="op-style">
          <option value="warm" ${s().voiceStyle === "warm" ? "selected" : ""}>Warm (default)</option>
          <option value="calm" ${s().voiceStyle === "calm" ? "selected" : ""}>Calm</option>
          <option value="male" ${s().voiceStyle === "male" ? "selected" : ""}>Male</option>
        </select></div>
      ${isDesktop ? `<div class="op-field"><span class="lbl">Screen awareness</span>
        <p class="op-help">When no practice screen is picked, OpenPath reads the names of your open windows each time you ask, so it knows what you are looking at. No screenshots. On a Mac this needs the Screen Recording permission.</p>
        <button type="button" class="op-btn ghost" id="op-screen-perm" style="justify-self:start">Open Screen Recording settings</button></div>` : ""}
      <div class="op-row"><button class="op-btn primary" type="button" id="op-sample">▶ ${t(lang, "hearSample")}</button><button class="op-btn" type="button" id="op-lab">${t(lang, "testLab")}</button></div>`,

    family: (lang) => `
      <p class="op-help">When OpenPath blocks a scam it locks the screen and tells this person. Alerts are also listed under History.</p>
      <div class="op-field"><label for="op-cg-name">${t(lang, "caregiverName")}</label><input type="text" id="op-cg-name" value="${esc(s().caregiverName)}" placeholder="Maria"></div>
      <div class="op-field"><label for="op-cg-phone">${t(lang, "caregiverPhone")}</label><input type="tel" id="op-cg-phone" value="${esc(s().caregiverPhone)}" placeholder="(555) 010-2211"></div>
      <div class="op-field"><label for="op-cg-hook">Alert webhook (optional)</label><input type="url" id="op-cg-hook" value="${esc(s().caregiverWebhook)}" placeholder="https://hooks.zapier.com/…">
        <p class="op-help">Each blocked scam posts a small JSON message here, so a family member can get a text or email through Zapier, IFTTT, or your own server. Redacted before sending.</p></div>
      <button class="op-btn" type="button" id="op-cg-test">Send a test alert</button>
      <div class="op-field"><span class="lbl">Caregiver controls</span>
        <p class="op-help">Family members can lock the language, turn off cloud voices, and see every blocked attempt. Settings sync is planned for the family app; today they are stored on this computer only.</p></div>`,

    account: (lang) => {
      const a = s().account;
      const started = new Date(a.trialStartedAt);
      const daysLeft = Math.max(0, 7 - Math.floor((Date.now() - started.getTime()) / 86400000));
      const status = a.plan === "active" ? `<span class="op-chip ok">${t(lang, "active")}</span>` : daysLeft > 0 ? `<span class="op-chip warn">${t(lang, "trial")} · ${t(lang, "trialDays", { n: daysLeft })}</span>` : `<span class="op-chip danger">Trial ended</span>`;
      return `
      <div class="op-plan">
        <div class="op-row"><strong style="font-size:18px">${t(lang, "plan")}</strong>${status}</div>
        <div class="price">$${a.monthlyPrice}<small>${t(lang, "perMonth")}</small></div>
        <ul><li>Unlimited questions, one step at a time</li><li>Scam and false-ad protection with family alerts</li><li>Warm voice in ${LANGUAGES.length} languages</li><li>Works on this Mac or PC, floating over any app</li></ul>
        ${a.plan === "active" ? `<p class="op-help">Renews monthly. Cancel anytime from this screen.</p>` : `<button class="op-btn primary" type="button" id="op-sub">${t(lang, "startSub")}</button>`}
      </div>
      <div class="op-plan">
        <div class="op-row"><strong>${t(lang, "setupFee")}</strong>${a.setupPaid ? `<span class="op-chip ok">${t(lang, "setupPaid")}</span>` : `<span class="op-chip">${t(lang, "setupUnpaid")}</span>`}</div>
        <div class="price">$${a.setupPrice}</div>
        <p class="op-help" style="margin:0">A family member or our team installs OpenPath, sets the language and caregiver, and walks through the first call. Charged once.</p>
        ${a.setupPaid ? "" : `<button class="op-btn" type="button" id="op-setup">${t(lang, "paySetup")}</button>`}
      </div>
      <div class="op-plan"><strong>Unit economics</strong>
        <ul><li>Typical question: 0 tokens (built-in workflow) or about 450 in / 60 out tokens on Claude Haiku ≈ $0.00008</li><li>Typical spoken answer: 140 characters on ElevenLabs Flash ≈ $0.004, then free from cache</li><li>Heavy user (40 questions/day, 50% cached): under $2.50/month in API cost against $${a.monthlyPrice} revenue</li></ul></div>
      <p class="op-help">Payments in this demo are simulated. Production uses Stripe Checkout for the setup fee and a Stripe subscription for the monthly plan.</p>`;
    },

    keys: () => `
      <p class="op-help">OpenPath works with no keys at all, using built-in answers and your computer's own voices. Add keys to unlock Claude answers for any question, the warm ElevenLabs voice, or cloud Whisper. Keys stay on this computer${isDesktop ? " in the app's settings file" : " in this browser"}.</p>
      <div class="op-field"><label for="op-k-anthropic">Claude (Anthropic) API key</label><input type="password" id="op-k-anthropic" value="${esc(s().anthropicKey)}" placeholder="sk-ant-…" autocomplete="off">
        <p class="op-help">This is what lets OpenPath answer any question about any app. Create one at console.anthropic.com under API keys, paste it here, and press Save keys. <button type="button" class="op-btn ghost" id="op-get-key" style="min-height:36px;padding:4px 10px;font-size:14px">Open the key page</button></p></div>
      <div class="op-field"><label for="op-model">Claude model</label>
        <select id="op-model">
          <option value="claude-haiku-5-5" ${s().model === "claude-haiku-5-5" ? "selected" : ""}>Claude Haiku 5.5 — fast and lightweight (default)</option>
          <option value="claude-sonnet-5-5" ${s().model === "claude-sonnet-5-5" ? "selected" : ""}>Claude Sonnet 5.5</option>
          <option value="claude-opus-5-5" ${s().model === "claude-opus-5-5" ? "selected" : ""}>Claude Opus 5.5 — most capable</option>
        </select></div>
      <div class="op-field"><label for="op-k-eleven">ElevenLabs API key</label><input type="password" id="op-k-eleven" value="${esc(s().elevenLabsKey)}" placeholder="xi-…" autocomplete="off"></div>
      <div class="op-field"><label for="op-k-voice">ElevenLabs voice ID</label><input type="text" id="op-k-voice" value="${esc(s().elevenLabsVoiceId)}"></div>
      <div class="op-field"><label for="op-k-openai">OpenAI API key (cloud Whisper, optional)</label><input type="password" id="op-k-openai" value="${esc(s().openaiKey)}" placeholder="sk-…" autocomplete="off"></div>
      <button class="op-btn primary" type="button" id="op-save-keys">Save keys</button>
      <div class="op-field"><span class="lbl">Privacy and consent</span>
        <ul class="op-help" style="padding-left:18px">
          <li>Audio is captured only after a deliberate tap, and stops on its own.</li>
          <li>Passwords, Social Security numbers, card and account numbers, one-time codes, dates of birth and emails are removed on this computer before any text goes to Claude.</li>
          <li>With local Whisper (default on desktop) your voice never leaves this computer.</li>
          <li>No screenshots are taken. "Screen context" is the Test Lab's description of the practice screen.</li>
        </ul></div>
      ${isDesktop ? "" : `<p class="op-help">In the shared web preview, outside services are blocked by the page sandbox, so keys only take effect in the desktop app or when you run the web build yourself.</p>`}`,

    history: () => `
      <div class="op-list">
        ${state.history.length === 0 && state.events.length === 0 ? `<p class="op-help">Nothing yet. Tap the circle and ask something, or open the Test Lab.</p>` : ""}
        ${[...state.events.map((e) => ({ ...e, kind: "event" })), ...state.history.map((h) => ({ ...h, kind: "turn", at: h.at }))]
          .sort((a, b) => b.at - a.at).slice(0, 40)
          .map((x) => x.kind === "event"
            ? `<div class="op-item ${x.type}"><div class="h">${esc(x.title)}</div>${x.detail ? `<div class="d">${esc(x.detail)}</div>` : ""}<div class="w">${when(x.at)}</div></div>`
            : `<div class="op-item ${x.role}"><div class="h">${x.role === "user" ? "You" : "OpenPath"}</div><div class="d">${esc(x.text)}</div><div class="w">${when(x.at)}</div></div>`).join("")}
      </div>
      <button class="op-btn" type="button" id="op-clear-hist">Clear history</button>`,

    costs: () => {
      const u = s().usage;
      const isOpus = s().model === "claude-opus-5-5";
      const llm = (u.llmInputTokens / 1e6) * (isOpus ? PRICE.opusIn : PRICE.haikuIn) + (u.llmOutputTokens / 1e6) * (isOpus ? PRICE.opusOut : PRICE.haikuOut);
      const tts = (u.ttsChars / 1000) * PRICE.elevenPer1k;
      const stt = (u.sttSeconds / 60) * PRICE.whisperPerMin;
      const total = llm + tts + stt;
      return `
      <div class="op-stats">
        <div class="op-stat"><div class="n">$${total.toFixed(4)}</div><div class="l">Estimated API spend, all time</div></div>
        <div class="op-stat"><div class="n">${u.cacheHitsLLM + u.ttsCacheHits}</div><div class="l">Cache hits (free answers and audio)</div></div>
        <div class="op-stat"><div class="n">${u.llmCalls}</div><div class="l">Claude calls · ${u.llmInputTokens + u.llmOutputTokens} tokens</div></div>
        <div class="op-stat"><div class="n">${u.ttsChars}</div><div class="l">ElevenLabs characters billed</div></div>
        <div class="op-stat"><div class="n">${u.sttSeconds}s</div><div class="l">Audio transcribed</div></div>
        <div class="op-stat"><div class="n" id="op-cache-n">…</div><div class="l">Cached audio clips <span id="op-cache-b"></span></div></div>
      </div>
      <div class="op-field"><span class="lbl">How OpenPath keeps costs near zero</span>
        <ul class="op-help" style="padding-left:18px">
          <li><b>Common workflows answer offline.</b> Logging in, paying a bill, turning on the camera: scripted steps, no tokens.</li>
          <li><b>SHA-256 answer cache.</b> The same question on the same screen in the same language is never sent to Claude twice.</li>
          <li><b>SHA-256 audio cache.</b> Every spoken sentence is stored once; repeats are free. Cache key = voice + language + style + text.</li>
          <li><b>Hard caps.</b> 160 output tokens per answer, 20-second listening limit, no streaming audio in the background.</li>
          <li><b>Cheapest models.</b> Claude Haiku 5.5, ElevenLabs Flash v2.5 at 32 kbps, Whisper tiny on-device.</li>
        </ul></div>
      <button class="op-btn" type="button" id="op-clear-cache">Clear audio cache</button>`;
    },
  };

  function sttLabel() { return { webspeech: "Browser speech", local: "Whisper on device", openai: "Whisper cloud", typed: "Keyboard", detecting: "Detecting…" }[state.sttMode] || state.sttMode; }

  function wire() {
    side.querySelector(".close").addEventListener("click", () => api.close());
    side.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
    if (isDesktop) {
      side.addEventListener("pointerenter", () => native.setInteractive(true));
      side.addEventListener("pointerleave", () => native.setInteractive(false));
    }
    const $ = (sel) => side.querySelector(sel);

    $("[data-lang]") && side.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", async () => { await saveSettings({ language: b.dataset.lang }); render(); }));
    $("#op-rate")?.addEventListener("change", (e) => saveSettings({ voiceRate: +e.target.value }));
    $("#op-pause")?.addEventListener("input", (e) => { saveSettings({ autoSilenceMs: +e.target.value }); });
    $("#op-stt")?.addEventListener("change", (e) => saveSettings({ sttProvider: e.target.value }));
    $("#op-tts")?.addEventListener("change", (e) => saveSettings({ ttsProvider: e.target.value }));
    $("#op-style")?.addEventListener("change", (e) => saveSettings({ voiceStyle: e.target.value }));
    $("#op-warm-voice")?.addEventListener("click", async () => {
      const st = $("#op-warm-voice-status"); st.textContent = "Downloading…";
      const k = await warmKokoro((pct) => { st.textContent = `Downloading ${pct}%`; });
      st.textContent = k ? "Ready. Press ▶ to hear it." : "Could not load here (needs internet once; blocked inside the shared preview sandbox).";
      render();
    });
    $("#op-sample")?.addEventListener("click", () => speak(t(L(), "sample")));
    $("#op-lab")?.addEventListener("click", () => native.openLab());
    $("#op-get-key")?.addEventListener("click", () => native.openExternal("https://console.anthropic.com/settings/keys"));
    $("#op-screen-perm")?.addEventListener("click", () => native.requestScreenPermission && native.requestScreenPermission());
    $("#op-warm")?.addEventListener("click", async () => {
      const st = $("#op-warm-status"); st.textContent = "Downloading…";
      const p = await warmLocalWhisper((pct) => { st.textContent = `Downloading ${pct}%`; });
      st.textContent = p ? "Ready. Your voice stays on this computer." : "Could not load here (needs internet once, and a browser that allows it).";
    });

    $("#op-cg-name")?.addEventListener("change", (e) => saveSettings({ caregiverName: e.target.value.trim() }));
    $("#op-cg-phone")?.addEventListener("change", (e) => saveSettings({ caregiverPhone: e.target.value.trim() }));
    $("#op-cg-hook")?.addEventListener("change", (e) => saveSettings({ caregiverWebhook: e.target.value.trim() }));
    $("#op-cg-test")?.addEventListener("click", () => { logEvent({ type: "caregiver", title: `Test alert sent to ${s().caregiverName || "caregiver"}`, detail: "This is what a family member receives when a scam is blocked." }); tab = "history"; render(); });

    $("#op-sub")?.addEventListener("click", async () => { await saveSettings({ account: { plan: "active" } }); logEvent({ type: "cost", title: "Subscription started", detail: `$${s().account.monthlyPrice}/month (simulated checkout)` }); render(); });
    $("#op-setup")?.addEventListener("click", async () => { await saveSettings({ account: { setupPaid: true } }); logEvent({ type: "cost", title: "Setup fee paid", detail: `$${s().account.setupPrice} one-time (simulated checkout)` }); render(); });

    $("#op-save-keys")?.addEventListener("click", async () => {
      await saveSettings({ anthropicKey: $("#op-k-anthropic").value.trim(), elevenLabsKey: $("#op-k-eleven").value.trim(), elevenLabsVoiceId: $("#op-k-voice").value.trim(), openaiKey: $("#op-k-openai").value.trim(), model: $("#op-model").value });
      logEvent({ type: "cost", title: "Keys saved", detail: [s().anthropicKey && "Claude", s().elevenLabsKey && "ElevenLabs", s().openaiKey && "Whisper cloud"].filter(Boolean).join(", ") || "No keys: offline mode" });
      render();
    });
    $("#op-clear-hist")?.addEventListener("click", () => { state.history.length = 0; state.events.length = 0; render(); });
    $("#op-clear-cache")?.addEventListener("click", async () => { await native.ttsClearCache(); render(); });
    if (tab === "costs") native.ttsCacheStats().then((c) => { const n = $("#op-cache-n"), b = $("#op-cache-b"); if (n) n.textContent = c.files; if (b) b.textContent = c.bytes ? `· ${(c.bytes / 1024).toFixed(0)} KB` : ""; });
  }

  on("settings", () => { if (open) render(); });
  on("event", () => { if (open && tab === "history") render(); });
  on("status", () => { side.classList.toggle("locked", state.status === "locked"); });

  const api = {
    open(which) { open = true; if (which) tab = which; render(); if (isDesktop) native.setInteractive(true); },
    close() { open = false; side.classList.remove("open"); if (isDesktop) native.setInteractive(false); },
    toggle() { open ? api.close() : api.open(); },
    isOpen: () => open,
    refresh: render,
  };
  render();
  return api;
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function when(ts) { const d = new Date(ts); return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
