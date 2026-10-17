// Overlay bootstrap: wires the circle, the engine, speech and the sidebar.
import { native, isDesktop } from "./bridge.js";
import { state, on, emit, setStatus, loadSettings, saveSettings, logEvent } from "./bus.js";
import { t } from "./i18n.js";
import { mountCircle } from "./circle.js";
import { mountSidebar } from "./sidebar.js";
import { mountPointer } from "./pointer.js";
import { reveal, conceal, visibleArea } from "./motion.js";
import { respond, resetWorkflow } from "./engine.js";
import { listen, speak, stopSpeaking, detectSttMode, persistUsage, warmKokoro, warmLocalWhisper } from "./speech.js";

export async function startOverlay(root) {
  await loadSettings();
  state.sttMode = await detectSttMode();

  // Get the natural local voice ready in the background wherever model
  // downloads are possible (desktop app, localhost, GitHub Pages).
  const host = location.hostname;
  if (isDesktop || host === "localhost" || host === "127.0.0.1" || host.endsWith("github.io")) {
    if ((state.settings.ttsProvider || "auto") !== "system") setTimeout(() => warmKokoro(), 1500);
  }
  // Load the on-device speech model at startup so the first tap is instant.
  if (state.sttMode === "local") setTimeout(() => warmLocalWhisper(), 500);

  const syncArea = () => { const v = visibleArea(); root.style.setProperty("--vis-top", v.top + "px"); root.style.setProperty("--vis-bottom-gap", Math.max(0, window.innerHeight - v.bottom) + "px"); };
  syncArea(); window.addEventListener("resize", syncArea);

  const lockBar = document.createElement("div");
  lockBar.id = "op-lock"; lockBar.hidden = true;
  root.append(lockBar);

  let stopRequested = false;
  let lastReply = null;
  let lastQuery = "";

  // Pointer layer first, so the circle and card sit above it.
  const pointer = mountPointer(root);

  const circle = mountCircle(root, {
    onTap: handleTap,
    onMenu: () => sidebar.toggle(),
    onText: (text) => handleQuery(text, "typed"),
    onRepeat: () => { if (lastReply) say(lastReply.text); },
    onAddKey: () => sidebar.open("keys"),
    onClose: () => { stopSpeaking(); pointer.hide(); if (state.status !== "locked") { setStatus("idle"); circle.setStatus("idle"); } },
  });
  const sidebar = mountSidebar(root);

  circle.setStatus("idle");

  // Screen context from the Test Lab
  native.onScreen((screen) => { state.screen = screen; resetWorkflow(); emit("screen", screen); });
  // "Say it for me" from the Test Lab: switch language if needed, then handle as speech.
  native.onLabSay(async (payload) => {
    const { text, lang } = typeof payload === "string" ? { text: payload } : payload;
    if (lang && lang !== state.settings.language) { await saveSettings({ language: lang }); }
    if (state.status === "locked") unlock();
    circle.show();
    setStatus("listening"); circle.setStatus("listening");
    circle.setTranscript("");
    // brief simulated waveform so the flow reads as speech, not a click
    const t0 = performance.now();
    await new Promise((r) => { const tick = () => { const e = performance.now() - t0; circle.setLevel(0.3 + 0.5 * Math.abs(Math.sin(e / 90))); if (e < 900) requestAnimationFrame(tick); else r(); }; tick(); });
    circle.setLevel(0);
    handleQuery(text, "lab");
  });
  if (native.onOpenLab) native.onOpenLab(() => document.getElementById("lab")?.scrollIntoView({ behavior: "smooth" }));

  async function handleTap() {
    if (state.status === "locked") { circle.show(); return; }
    if (state.status === "listening") { stopRequested = true; return; }
    if (state.status === "speaking") { stopSpeaking(); setIdle(); return; }
    if (state.status === "thinking") return;

    circle.show();
    circle.setReply("");
    circle.setTranscript("");
    pointer.hide();
    if (state.sttMode === "typed") { circle.showTyping(); return; }

    stopRequested = false;
    setStatus("listening"); circle.setStatus("listening");
    const result = await listen({
      onLevel: (v) => circle.setLevel(v),
      onPartial: (txt) => circle.setTranscript(txt, true),
      onStatus: (s) => {
        if (s.startsWith("loading")) circle.setReply(t(lang(), "gettingReady", { p: s.replace("loading model ", "") }));
        else if (s === "transcribing") { setStatus("thinking"); circle.setStatus("thinking"); circle.setReply(t(lang(), "transcribing")); }
      },
      shouldStop: () => stopRequested,
    });
    circle.setLevel(0);
    state.sttMode = result.mode;

    if (!result.text) {
      if (result.reason === "mic_denied") {
        logEvent({ type: "warn", title: "Microphone not available", detail: "Switched to keyboard. On desktop, allow the microphone in System Settings → Privacy." });
        circle.setReply(t(lang(), "noMic"));
        circle.showTyping();
        setIdle();
        return;
      }
      if (result.reason === "local_failed") {
        circle.setReply(t(lang(), "noMic"));
        circle.showTyping(); setIdle(); return;
      }
      circle.setReply(t(lang(), "didntCatch"));
      say(t(lang(), "didntCatch"));
      return;
    }
    handleQuery(result.text, result.mode);
  }

  // Points at the thing to click: Claude's spot from a screen picture, or the
  // built-in guide's word found on screen (on this computer).
  async function aim(out) {
    pointer.hide();
    const lang0 = lang();
    if (out.point) { pointer.show(out.point, circle.center()); state.lastPoint = centerOf(out.point); return; }
    const labels = out.step?.target;
    if (!labels || !native.locate) return;
    const found = await native.locate(labels, state.lastPoint || null);
    if (lang() !== lang0 || state.status === "listening") return;     // the person moved on
    if (found?.ok) { pointer.show(found.box, circle.center()); state.lastPoint = centerOf(found.box); }
  }
  const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  async function handleQuery(text, via) {
    lastQuery = text;
    pointer.hide();
    circle.show();
    circle.setTranscript(text);
    state.history.push({ role: "user", text, at: Date.now() });
    setStatus("thinking"); circle.setStatus("thinking");

    const out = await respond(text);
    lastReply = out;
    state.history.push({ role: "assistant", text: out.text, at: Date.now() });
    state.lastSource = out.source;

    if (out.lock) {
      lock(out.lock);
      circle.setReply(out.text, { src: null });
      await say(out.text, { keepLocked: true });
      return;
    }
    if (out.consent) {
      circle.setReply(out.text, { src: null });
      const retry = async (choice) => {
        await saveSettings({ screenPictures: choice });
        state.history.splice(-2);            // drop the question and the permission prompt
        handleQuery(lastQuery, "consent");
      };
      circle.setChoices([
        { label: t(lang(), "allowPictures"), primary: true, onClick: () => retry("on") },
        { label: t(lang(), "denyPictures"), onClick: () => retry("off") },
      ]);
      await say(out.text);
      return;
    }
    if (!out.step) state.lastPoint = null;   // a new question starts fresh
    circle.setReply(out.text, { stepInfo: out.step, src: out.source, needsKey: out.needsKey });
    aim(out);
    await say(out.text);
    persistUsage();
  }

  function lock(info) {
    state.lock = { ...info, at: Date.now() };
    setStatus("locked"); circle.setStatus("locked");
    const L = lang();
    const cg = state.settings.caregiverName;
    lockBar.innerHTML = `<span class="t">⚠ ${t(L, "lockTitle")}</span><span>${t(L, "lockBody")} ${cg ? t(L, "lockCaregiver", { name: cg }) : t(L, "lockCaregiverNone")}</span><button class="op-btn" type="button" id="op-unlock">${t(L, "unlock")}</button>`;
    lockBar.style.top = visibleArea().top + "px";
    reveal(lockBar);
    lockBar.querySelector("#op-unlock").addEventListener("click", unlock);
    if (isDesktop) { lockBar.addEventListener("pointerenter", () => native.setInteractive(true)); lockBar.addEventListener("pointerleave", () => native.setInteractive(false)); }
    sidebar.open("history");
    try { window.navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
  }

  function unlock() {
    state.lock = null; conceal(lockBar); stopSpeaking();
    setIdle();
    circle.setReply("");
    sidebar.close();
  }

  async function say(text, { keepLocked } = {}) {
    setStatus(keepLocked ? "locked" : "speaking"); circle.setStatus(keepLocked ? "locked" : "speaking");
    await speak(text, {});
    if (state.status !== "locked") setIdle();
  }

  function setIdle() { setStatus("idle"); circle.setStatus("idle"); }
  function lang() { return state.settings.language || "en"; }

  // Keyboard shortcut: space toggles listening when nothing has focus.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement === document.body) { e.preventDefault(); handleTap(); }
    if (e.key === "Escape") { if (state.status === "listening") stopRequested = true; else if (sidebar.isOpen()) sidebar.close(); }
  });

  on("settings", () => { detectSttMode().then((m) => { state.sttMode = m; }); });

  return { circle, sidebar, pointer, handleQuery, locate: (labels) => native.locate(labels, null) };
}
