// Settings sidebar: Voice · Family · Account · Keys · History · Costs
import { native, isDesktop } from "./bridge.js";
import { state, on, saveSettings, logEvent } from "./bus.js";
import { LANGUAGES, t, hasFullUi } from "./i18n.js";
import { speak, warmLocalWhisper, warmKokoro, kokoroState } from "./speech.js";
import { hasOfflineLanguage } from "./knowledge.js";

const PRICE = { haikuIn: 0.10, haikuOut: 0.50, sonnetIn: 2, sonnetOut: 10, opusIn: 4, opusOut: 20, whisperPerMin: 0.006 };

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
      <div class="op-panel op-enter">${PANELS[tab](lang)}</div>`;
    wire();
  }

  const PANELS = {
    voice: (lang) => `
      <p class="op-help">OpenPath answers with Claude: Haiku 5.5 first, and Sonnet 5.5 when a question is hard. It needs a Claude key, added once in the Setup tab. The Google sign-up guide is built in and answers instantly.</p>
      <p class="op-help"><b>To talk:</b> tap the circle or press <b>Ctrl+O</b> from any app. Press it again to stop.</p>
      <div class="op-status-line">
        <span class="op-chip ${state.sttMode === "typed" ? "warn" : "ok"}">🎙 ${sttLabel()}</span>
        <span class="op-chip ${state.ttsMode === "kokoro" ? "ok" : ""}">🔊 ${state.ttsMode === "kokoro" ? "Natural voice (on this computer)" : "Computer voice"}</span>
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
      <div class="op-field"><label for="op-hide">Hide the answer box when I leave it alone for</label>
        <select id="op-hide">${[[10, "10 seconds"], [15, "15 seconds"], [30, "30 seconds"], [60, "1 minute"], [0, "Never"]].map(([v, l]) => `<option value="${v}" ${(s().boxHideSeconds ?? 15) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="op-field"><label for="op-stt">${t(lang, "micMode")}</label>
        <select id="op-stt">
          <option value="auto" ${s().sttProvider === "auto" ? "selected" : ""}>Automatic (best free option)</option>
          <option value="local" ${s().sttProvider === "local" ? "selected" : ""}>Whisper on this computer (private, free)</option>
          <option value="typed" ${s().sttProvider === "typed" ? "selected" : ""}>Keyboard only</option>
        </select>
        <p class="op-help">The microphone is only on after you tap the circle, never in the background. <button type="button" class="op-btn ghost" id="op-warm" style="min-height:36px;padding:4px 10px;font-size:14px">Download local Whisper now</button> <span id="op-warm-status" class="op-help"></span></p></div>
      <div class="op-field"><label for="op-tts">${t(lang, "voiceMode")}</label>
        <select id="op-tts">
          <option value="auto" ${s().ttsProvider === "auto" ? "selected" : ""}>Automatic: natural voice for English, Spanish and Hindi; the computer's voice for Chinese</option>
          <option value="kokoro" ${s().ttsProvider === "kokoro" ? "selected" : ""}>Natural voice on this computer (free; English, Spanish, Hindi)</option>
          <option value="system" ${s().ttsProvider === "system" ? "selected" : ""}>System voice (free, all languages)</option>
        </select>
        <p class="op-help">The natural voice is Kokoro, a small neural voice that runs on this computer after a one-time download (about 90 MB, plus about 18 MB for Spanish and Hindi pronunciation). <button type="button" class="op-btn ghost" id="op-warm-voice" style="min-height:36px;padding:4px 10px;font-size:14px">${kokoroState() === "ready" ? "Natural voice ready" : "Download natural voice"}</button> <span id="op-warm-voice-status" class="op-help"></span></p>
        <label for="op-style" style="font-weight:700;font-size:15px;color:var(--ink-2)">Voice character</label>
        <select id="op-style">
          <option value="warm" ${s().voiceStyle === "warm" ? "selected" : ""}>Warm (default)</option>
          <option value="calm" ${s().voiceStyle === "calm" ? "selected" : ""}>Calm</option>
          <option value="male" ${s().voiceStyle === "male" ? "selected" : ""}>Male</option>
        </select></div>
      ${isDesktop ? `<div class="op-field"><span class="lbl">Following your clicks</span>
        <p class="op-help">After OpenPath points at a button, it notices when you press it and gives the next step. It already watches the screen around the button. To react the instant you click, allow OpenPath under Accessibility once. It only checks where you clicked; nothing is recorded.</p>
        <div class="op-row"><span class="op-chip" id="op-follow-chip">Checking…</span><button type="button" class="op-btn ghost" id="op-follow-perm">Allow click detection</button></div></div>` : ""}
      ${isDesktop ? `<div class="op-field"><span class="lbl">Screen awareness</span>
        <p class="op-help">OpenPath reads your screen on this computer to know which page you are on and where to point. Nothing is saved or sent. On a Mac, allow it once: System Settings → Privacy &amp; Security → Screen Recording → turn on OpenPath.</p></div>` : ""}
      <div class="op-row"><button class="op-btn primary" type="button" id="op-sample">▶ ${t(lang, "hearSample")}</button></div>`,

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
        <ul><li>Average month (8 questions a day): about $1.04 per user (Haiku first, Sonnet only for hard questions)</li><li>A monthly allowance of 300 Sonnet answers keeps heavy users around $2.23</li><li>Card processing (2.9% + $0.30, plus billing) is about $0.59 of each $${a.monthlyPrice} payment</li><li>Voices and listening run on the computer and cost nothing</li></ul></div>
      <p class="op-help">Payments in this demo are simulated. Production uses Stripe Checkout for the setup fee and a Stripe subscription for the monthly plan.</p>`;
    },

    keys: () => `
      <p class="op-help"><b>For the family member or helper who installs OpenPath.</b> OpenPath answers questions with Claude, so it needs a Claude key. Only the built-in guides work without one. Keys stay on this computer${isDesktop ? ", encrypted by the operating system, and are never shown again after saving" : " in this browser"}.</p>
      <div class="op-field"><label for="op-k-anthropic">Claude (Anthropic) API key</label><input type="password" id="op-k-anthropic" value="" placeholder="${s().hasAnthropicKey || s().anthropicKey ? "Saved and encrypted on this computer" : "sk-ant-…"}" autocomplete="off">
        <p class="op-help">This is what lets OpenPath answer any question about any app. Create one at console.anthropic.com under API keys, paste it here, and press Save keys.</p></div>
      <div class="op-field"><label for="op-model">Claude model</label>
        <select id="op-model">
          ${[["", "Automatic: Haiku 5.5 first, Sonnet 5.5 for hard questions"], ["claude-opus-5-5", "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-5-5", "Claude Haiku 5.5"]].map(([v, l]) => `<option value="${v}" ${(s().modelChoice || "") === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></div>
      <div class="op-field"><label for="op-pics">Pointing with screen pictures</label>
        <select id="op-pics">
          <option value="ask" ${(s().screenPictures || "ask") === "ask" ? "selected" : ""}>Ask me the first time</option>
          <option value="on" ${s().screenPictures === "on" ? "selected" : ""}>Allowed (never on bank, health or password pages)</option>
          <option value="off" ${s().screenPictures === "off" ? "selected" : ""}>Never send pictures</option>
        </select>
        <p class="op-help">For questions the built-in guides do not cover, Claude can look at a picture of your screen to point at the right button. Built-in guides point using your computer's own text reader, which never leaves this computer.</p></div>
      <div class="op-row" style="gap:8px;flex-wrap:wrap"><button class="op-btn primary" type="button" id="op-save-keys">Save keys</button>${s().hasAnthropicKey || s().anthropicKey ? `<button class="op-btn" type="button" id="op-forget-key">Forget key</button>` : ""}</div>
      <div class="op-field"><span class="lbl">Privacy and consent</span>
        <ul class="op-help" style="padding-left:18px">
          <li>The microphone turns on only when you tap the circle or press Ctrl+O, and stops on its own. It never listens in the background.</li>
          <li>Your voice is turned into words on this computer. Recordings are never saved or sent anywhere.</li>
          <li>Passwords, Social Security numbers, card and account numbers, one-time codes, dates of birth and emails are removed on this computer before any text goes to Claude.</li>
          <li>Only Claude (Anthropic) receives your words, and only after private details are removed. OpenPath blocks every other connection.</li>
          <li>Conversations live in memory and disappear when OpenPath quits. The Claude key is encrypted on this computer.</li>
          <li>Window names are read only after you tap. Screen pictures for Claude need your permission, are skipped on bank, health and password pages, and are never saved. Built-in pointing reads the screen with your computer's own text reader and nothing leaves the computer.</li>
        </ul></div>
      <div class="op-field"><span class="lbl">Delete all my data</span>
        <p class="op-help">Removes settings, the Claude key, caregiver details and usage counts from this computer, then restarts OpenPath. Downloaded speech models stay; they hold nothing personal.</p>
        <button class="op-btn" type="button" id="op-delete-all">Delete all my data</button> <span id="op-delete-status" class="op-help"></span></div>
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
      const m = s().modelChoice || ((s().qualityMode || "best") === "low" ? "claude-haiku-5-5" : "claude-sonnet-5-5");
      const [pin, pout] = m.includes("haiku") ? [PRICE.haikuIn, PRICE.haikuOut] : m.includes("sonnet") ? [PRICE.sonnetIn, PRICE.sonnetOut] : [PRICE.opusIn, PRICE.opusOut];
      const llm = (u.llmInputTokens / 1e6) * pin + (u.llmOutputTokens / 1e6) * pout;
      const stt = (s().sttProvider === "openai" ? u.sttSeconds / 60 : 0) * PRICE.whisperPerMin;
      const total = llm + stt;
      return `
      <div class="op-stats">
        <div class="op-stat"><div class="n">$${total.toFixed(4)}</div><div class="l">Claude spend, all time</div></div>
        <div class="op-stat"><div class="n">${u.llmCalls}</div><div class="l">Claude calls · ${u.llmInputTokens + u.llmOutputTokens} tokens</div></div>
        <div class="op-stat"><div class="n">${u.cacheHitsLLM}</div><div class="l">Answers reused from cache (free)</div></div>
        <div class="op-stat"><div class="n">${u.sttSeconds}s</div><div class="l">Speech heard (free on this computer)</div></div>
      </div>
      <div class="op-field"><span class="lbl">How OpenPath keeps costs low</span>
        <ul class="op-help" style="padding-left:18px">
          <li><b>Free voices.</b> English, Spanish and Hindi use Kokoro, a natural voice that runs inside OpenPath on any computer. Chinese uses the computer's own voice.</li>
          <li><b>Free listening.</b> Whisper runs on this computer; your voice never leaves it.</li>
          <li><b>Common tasks need no AI.</b> Google sign-up, Google Docs, Gmail, browser tabs: built-in steps.</li>
          <li><b>Cheapest model first.</b> Claude Haiku answers first; Sonnet only when Haiku's answer cannot be checked on screen, up to 300 times a month.</li>
        </ul></div>`;
    },
  };

  function sttLabel() { return { webspeech: "Browser speech", local: state.sttEngine || "Whisper on device", openai: "Whisper cloud", typed: "Keyboard", detecting: "Detecting…" }[state.sttMode] || state.sttMode; }

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
    $("#op-pause")?.addEventListener("change", (e) => { saveSettings({ autoSilenceMs: +e.target.value }); });
    $("#op-hide")?.addEventListener("change", (e) => saveSettings({ boxHideSeconds: +e.target.value }));
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
    $("#op-pics")?.addEventListener("change", (e) => saveSettings({ screenPictures: e.target.value }));
    $("#op-follow-perm")?.addEventListener("click", async () => { await native.requestClickPermission(); setTimeout(render, 1500); });
    if ($("#op-follow-chip") && native.followStatus) native.followStatus().then((st) => { const c = $("#op-follow-chip"); if (!c) return; c.textContent = st.clicks ? "Clicks: on" : "Clicks: watching the screen"; c.className = "op-chip " + (st.clicks ? "ok" : ""); if (st.clicks) { const b = $("#op-follow-perm"); if (b) b.hidden = true; } });
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
      const typed = $("#op-k-anthropic").value.trim();
      await saveSettings({ ...(typed ? { anthropicKey: typed } : {}), modelChoice: $("#op-model").value });
      logEvent({ type: "cost", title: "Keys saved", detail: s().hasAnthropicKey || s().anthropicKey ? "Claude key saved" : "No Claude key: only built-in guides will answer" });
      render();
    });
    $("#op-forget-key")?.addEventListener("click", async () => { await saveSettings({ forgetKey: true, anthropicKey: "" }); logEvent({ type: "cost", title: "Claude key removed" }); render(); });
    $("#op-delete-all")?.addEventListener("click", async () => {
      const st = $("#op-delete-status");
      if (st.dataset.armed !== "1") { st.dataset.armed = "1"; st.textContent = "Press again to delete everything."; return; }
      st.textContent = "Deleting…";
      await native.deleteAllData();
    });
    $("#op-clear-hist")?.addEventListener("click", () => { state.history.length = 0; state.events.length = 0; render(); });
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
