// Overlay bootstrap: wires the circle, the engine, speech and the sidebar.
import { native, isDesktop } from "./bridge.js";
import { state, on, emit, setStatus, loadSettings, saveSettings, logEvent } from "./bus.js";
import { t } from "./i18n.js";
import { mountCircle } from "./circle.js";
import { mountSidebar } from "./sidebar.js";
import { mountPointer } from "./pointer.js";
import { detectWords, bestPage, stepsOf, say as sayIn } from "./guides.js";
import { reveal, conceal, visibleArea, overlayRects } from "./motion.js";
import { respond, resetWorkflow, nextStep } from "./engine.js";
import { redact } from "./guardrails.js";
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
    onClose: () => { stopSpeaking(); pointer.hide(); stopWatching(); guideRun = null; if (state.status !== "locked") { setStatus("idle"); circle.setStatus("idle"); } },
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
    // Plain timers, not animation frames: frames pause when the window is in
    // the background, which would leave the circle stuck on "listening".
    const t0 = performance.now();
    const wave = setInterval(() => circle.setLevel(0.3 + 0.5 * Math.abs(Math.sin((performance.now() - t0) / 90))), 60);
    await new Promise((r) => setTimeout(r, 900));
    clearInterval(wave);
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
    stopWatching();
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
        circle.setReply(t(lang(), "sttFailed"));
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
  // Points at the thing to click: Claude's spot from a screen picture, or the
  // built-in guide's word found on screen (on this computer). Then watches
  // for the click so the next step comes on its own.
  // Returns { found, missing } so the caller can swap in a "can't see it" line.
  let watchId = 0;
  async function aim(out) {
    pointer.hide();
    stopWatching();
    const lang0 = lang();
    if (out.point) {
      pointer.show(out.point, circle.center()); state.lastPoint = centerOf(out.point);
      startWatching(out.point, out);
      return { found: true };
    }
    const target = out.step?.target;
    if (!target || !native.locate) return { found: false };
    const labels = Array.isArray(target) ? target : target.labels;
    const found = await native.locate(labels, state.lastPoint || null, overlayRects());
    if (lang() !== lang0 || state.status === "listening") return { found: false };    // the person moved on
    if (!found?.ok) return { found: false, missing: out.step.missing || null };
    let box = found.box;
    if (target.plusRight) {
      // The button is a "+" to the right of the words (Google Docs' Document tabs).
      const anchorY = box.y + box.h / 2;
      const plus = await native.locate(["+"], { x: box.x + box.w + 160, y: anchorY }, overlayRects());
      const pb = plus?.ok ? plus.box : null;
      if (pb && Math.abs(pb.y + pb.h / 2 - anchorY) < 18 && pb.x > box.x + box.w - 4) box = { ...pb, text: "+" };
      else box = { ...box, tag: t(lang(), "plusTag") };
    }
    pointer.show(box, circle.center()); state.lastPoint = centerOf(box);
    startWatching(box, out, { clicks: target.waitFor !== "text" });
    return { found: true };
  }

  function startWatching(box, out, { clicks = true } = {}) {
    if (!native.watchTarget) return;
    const id = ++watchId;
    watching = { id, out };
    // Wait a moment for the pointer's label so it is part of what is ignored.
    setTimeout(() => { if (watching?.id === id) native.watchTarget({ id, clicks, exclude: overlayRects(), box: { x: box.x, y: box.y, w: box.w, h: box.h, space: box.space } }).catch(() => {}); }, 300);
  }
  function stopWatching() { watching = null; native.stopWatch && native.stopWatch(); }
  let watching = null;


  // ---------- Page-aware guides (Google sign-up) ----------
  // Reads the screen (on this computer) to find which page of the site is
  // showing, says that page's step, points at it, and moves on when the page
  // changes. It only tells and points: it never opens, clicks or types.
  let guideRun = null;
  const isRepeatAsk = (q) => /again|repeat|what did you say|otra vez|repita|再说|重复|फिर से|दोबारा/i.test(q);

  // Labels the browser's Back arrow and address bar (reading only).
  async function pointAtBrowser(run, { back }) {
    if (!native.browserParts) return;
    const parts = await native.browserParts();
    if (guideRun !== run || !parts?.ok) return;
    const L = lang();
    if (back && parts.back) {
      pointer.show({ ...parts.back, tag: t(L, "backArrow") }, circle.center());
      if (parts.address) pointer.showSecond(parts.address, t(L, "addressBar"));
    } else if (parts.address) {
      pointer.show({ ...parts.address, tag: t(L, "addressBar") }, circle.center());
    }
  }

  // true: the browser in front shows a page of the sign-up (Google's account
  // pages, Gmail, or the Google home page) · false: some other address, such
  // as a search results page · null: unknown (no browser in front, or the
  // address could not be read), which never counts as the wrong page.
  async function onGoogle(run) {
    if (!native.browserUrl) return null;
    const u = await native.browserUrl().catch(() => null);
    if (guideRun !== run || !u?.ok || !u.isBrowser || !u.url) return null;
    const a = u.url.toLowerCase().replace(/\s/g, "").replace(/^https?:\/\//, "");
    if (/^(accounts|myaccount|mail|support)\.google\./.test(a) || /^(www\.)?gmail\.com/.test(a)) return true;
    if (/^(www\.)?google\.[a-z.]+(\/(\?.*|webhp.*|#.*)?)?$/.test(a)) return true;     // the Google home page
    return false;
  }

  async function detectPage(run) {
    const res = await native.findAll(detectWords(run.guide), overlayRects());
    if (!res?.ok || !res.found.length) return null;
    const page = bestPage(run.guide, res.found.map((f) => f.label));
    if (!page) return null;
    const head = res.found.find((f) => page.detect.some((d) => d.toLowerCase() === f.label.toLowerCase()))?.box;
    return { page, head };
  }

  async function runGuide({ id, guide }) {
    const run = { id, guide, page: null, head: null, phase: 0, lastWrong: 0, since: Date.now() };
    guideRun = run;
    setStatus("thinking"); circle.setStatus("thinking");
    const hit = await detectPage(run);
    if (guideRun !== run) return;
    if (hit) return showGuidePage(run, hit);
    // Not on Google yet: say how to get there, then watch for the page.
    const text = sayIn(guide.start, lang());
    circle.setReply(text, { src: "offline" });
    state.history.push({ role: "assistant", text, at: Date.now() });
    say(text);
    pointAtBrowser(run, { back: false });
    waitForPage(run, null);
  }

  // Looks for a page of the guide every 0.3 s. If none shows up for a while
  // and the window in front is not Google, says how to go back.
  async function waitForPage(run, fromId) {
    const began = Date.now();
    while (guideRun === run && Date.now() - began < 10 * 60000) {
      const hit = await detectPage(run);
      if (guideRun !== run) return;
      if (hit && (hit.page.id !== fromId || Date.now() - began > 4000)) return showGuidePage(run, hit, { quiet: hit.page.id === fromId });
      if (!hit && Date.now() - began > 7000 && Date.now() - run.lastWrong > 30000 && Date.now() - (run.lastSeen || 0) > 15000) {
        // Only when the browser in front shows a web address that is not
        // Google. Google's sign-up tabs have titles like "Basic information",
        // so a window title says nothing; an unknown address says nothing too.
        if (await onGoogle(run) !== false) { await new Promise((r) => setTimeout(r, 300)); continue; }
        if (guideRun !== run) return;
        {
          run.lastWrong = Date.now();
          const text = sayIn(run.guide.wrongPage, lang());
          pointer.hide();
          circle.show(); circle.setReply(text, { src: "offline" });
          say(text);
          pointAtBrowser(run, { back: true });
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // A short line per guide event in the app's log (no screen text, nothing
  // typed), so a stuck step can be traced.
  const glog = (msg) => console.info("[guide] " + msg);

  async function showGuidePage(run, { page, head }, { quiet = false } = {}) {
    glog("show page " + page.id);
    run.page = page; run.head = head; run.phase = 0; run.lastSeen = Date.now();
    run.steps = stepsOf(page); run.stepIndex = 0; run.skipOne = false;
    clearTimeout(run.stepTimer);
    circle.show();
    pointer.hide();
    // One step at a time: find the first box, then say only that step (the
    // words can depend on which box Google is showing).
    const near = head ? { x: head.x + head.w / 2, y: head.y + head.h + 120 } : null;
    const first = run.steps.length ? await native.locate(run.steps[0].labels, near, overlayRects()) : null;
    if (guideRun !== run || run.page !== page) return;
    const variant = first?.ok && page.textIf ? page.textIf[first.box.text] : null;
    const text = sayIn(variant || page.text, lang());
    run.lastLine = text;
    if (!quiet) {
      circle.setTranscript("");
      circle.setReply(text, { src: "offline" });
      state.history.push({ role: "assistant", text, at: Date.now() });
      say(text);
    } else { setStatus("idle"); circle.setStatus("idle"); }
    if (page.done) { guideRun = null; return; }
    if (run.steps.length) await pointAtStep(run, page, near, first);
    guidePoll(run, page);
  }

  // Points at the current box of the page and watches for it to be filled in.
  async function pointAtStep(run, page, near, found) {
    const step = run.steps[run.stepIndex];
    const f = found || await native.locate(step.labels, near || state.lastPoint, overlayRects());
    if (guideRun !== run || run.page !== page) return;
    clearTimeout(run.stepTimer);
    if (f?.ok) { pointer.show(f.box, state.lastPoint || circle.center()); state.lastPoint = centerOf(f.box); circle.keepClear(f.box); }
    // Found the box the next step would point at (Google showed the Username
    // box straight away): skip that step instead of asking twice.
    run.skipOne = !!(f?.ok && step.skipNextIf && f.box.text === step.skipNextIf);
    glog(`page ${page.id} step ${run.stepIndex + 1}/${run.steps.length} ${step.labels[0]}: ${f?.ok ? "found " + f.box.text : "not found"}`);
    const more = run.stepIndex < run.steps.length - 1;
    if (!more) { stopWatching(); return; }                    // the last box (Next): the page change moves on
    if (step.after) {
      // Passwords show as dots, so: Enter, or a pause long enough to type it.
      run.stepTimer = setTimeout(() => { if (guideRun === run && run.page === page) advanceStep(run, page); }, step.after);
      if (f?.ok) watchGuide(run, f.box, "keys", null, { enter: true });
    }
    else if (f?.ok && native.readRegion && (step.field || (step.fieldIf && f.box.text === step.fieldIf))) {
      watchField(run, page, step, f.box);                                  // the box holds a value
      watchGuide(run, f.box, "keys", null, { enter: true });               // or Enter is pressed
    }
    else if (f?.ok && step.pick) {
      if (native.readRegion) watchField(run, page, step, f.box);           // the box shows a choice and its list is closed
      watchGuide(run, f.box, "value", step.pick, { pickClicks: true });   // or: a click on the box, then on a choice
    }
    else if (f?.ok) watchGuide(run, f.box, "text-or-page");
    else run.stepTimer = setTimeout(() => { if (guideRun === run && run.page === page) pointAtStep(run, page, near); }, 800);   // not on screen yet: look again
  }

  async function advanceStep(run, page) {
    if (guideRun !== run || run.page !== page || run.stepIndex >= run.steps.length - 1) return;
    stopWatching();
    pointer.hide();                                // the done box loses its ring at once
    run.stepIndex = Math.min(run.steps.length - 1, run.stepIndex + (run.skipOne ? 2 : 1));
    run.skipOne = false;
    const step = run.steps[run.stepIndex];
    const cue = step.cue === "next" ? t(lang(), "nowNext") : step.cue ? sayIn(step.cue, lang()) : null;
    circle.setTranscript(t(lang(), "youClicked"), false, { plain: true });
    if (cue) { run.lastLine = cue; circle.setReply(cue, { src: "offline" }); say(cue); }
    await pointAtStep(run, page, state.lastPoint);
  }

  // While a page is showing, look at the whole screen about once a second for
  // any page or menu of the guide. A menu opening (Google's "For my personal
  // use" list) or a new page gets its step within about a second.
  async function guidePoll(run, page) {
    const token = (run.pollToken = (run.pollToken || 0) + 1);
    let misses = 0;
    while (guideRun === run && run.page === page && run.pollToken === token) {
      await new Promise((r) => setTimeout(r, 450));
      if (guideRun !== run || run.page !== page || run.pollToken !== token) return;
      const hit = await detectPage(run);
      if (guideRun !== run || run.page !== page || run.pollToken !== token) return;
      if (hit && hit.page.id !== page.id) { stopWatching(); return showGuidePage(run, hit); }
      if (hit) { misses = 0; run.lastSeen = Date.now(); continue; }
      // Nothing of the guide is on screen for a while: the person may be lost.
      // A list, a pop-up or scrolling can hide the heading, so only leave the
      // page when the browser has also left Google.
      if (++misses >= 10) {
        if (await onGoogle(run) !== false) { misses = 0; continue; }
        if (guideRun !== run || run.page !== page || run.pollToken !== token) return;
        stopWatching(); pointer.hide(); return waitForPage(run, null);
      }
    }
  }

  // What a text box holds, read from the box itself: its lines minus its own
  // label (which floats above the text once something is typed). "" = empty.
  const normLine = (x) => x.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  const PICK_WORDS = {
    month: /^(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/,
    gender: /^(female|male|rather not say|custom|woman|man|mujer|hombre|prefiero no decirlo|personalizado)$/,
  };
  async function fieldValue(step, box) {
    const r = { x: box.x - 12, y: box.y - 8, w: Math.max(box.w + 120, 150), h: box.h + 36 };
    if (step.pick && PICK_WORDS[step.pick]) {
      // A list box: while its list is open, several choices show below it.
      const below = await native.readRegion({ x: box.x - 40, y: box.y - 8, w: Math.max(box.w + 260, 300), h: box.h + 320 }).catch(() => null);
      if (below?.ok && below.lines.map(normLine).filter((x) => PICK_WORDS[step.pick].test(x)).length >= 2) return "";
    }
    const res = await native.readRegion(r).catch(() => null);
    if (!res?.ok) return null;
    const labels = step.labels.map(normLine);
    return res.lines.map(normLine)
      .filter((x) => x && !/^gmail ?com$/.test(x) && !labels.some((l) => l.includes(x) || x.includes(l)))
      .join(" ");
  }

  // Moves on once the box holds something and it has stayed the same for 2 s
  // (the person finished typing, or the browser filled it in for them).
  async function watchField(run, page, step, box) {
    const idx = run.stepIndex, token = (run.fieldToken = (run.fieldToken || 0) + 1);
    let last = null, since = 0;
    while (guideRun === run && run.page === page && run.stepIndex === idx && run.fieldToken === token) {
      const v = await fieldValue(step, box);
      if (guideRun !== run || run.page !== page || run.stepIndex !== idx || run.fieldToken !== token) return;
      if (v) {
        if (v !== last) { last = v; since = Date.now(); }
        else if (Date.now() - since >= 1300) { glog("box filled: " + step.labels[0]); return advanceStep(run, page); }
      } else { last = null; }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  function watchGuide(run, box, mode, pick, { enter = false, pickClicks = false } = {}) {
    const id = ++watchId;
    watching = { id, out: { guide: true }, run };
    const area = run.head || box;
    setTimeout(() => {
      if (watching?.id !== id) return;
      native.watchTarget({ id, mode, pick, enter, pickClicks, clicks: false, exclude: overlayRects(),
        box: box ? { x: box.x, y: box.y, w: box.w, h: box.h } : { x: area.x, y: area.y, w: area.w, h: area.h },
        area: mode === "page" && run.head ? { x: run.head.x, y: run.head.y, w: run.head.w, h: run.head.h } : undefined,
      }).catch(() => {});
    }, 150);
  }

  async function guideFollow(run, evt) {
    if (guideRun !== run) return;
    // A box was filled in: move to the next one. Page changes and menus are
    // picked up by guidePoll.
    glog(`signal ${evt.reason} on page ${run.page?.id} step ${run.stepIndex + 1}`);
    if (evt.reason === "typed") return advanceStep(run, run.page);
    if (evt.reason === "enter") {
      // Enter in a Google box often works like Next. Give the page a moment:
      // if it changed, follow the new page; otherwise go to the next box.
      const page = run.page, idx = run.stepIndex;
      setTimeout(async () => {
        if (guideRun !== run || run.page !== page || run.stepIndex !== idx) return;
        const hit = await detectPage(run);
        if (guideRun !== run || run.page !== page || run.stepIndex !== idx) return;
        if (hit && hit.page.id !== page.id) { stopWatching(); return showGuidePage(run, hit); }
        advanceStep(run, page);
      }, 700);
      return;
    }
    // "page": most words around the box changed. A real new page is picked up
    // by guidePoll; if the page is still the same (a list opened over the
    // boxes, an error message), keep watching the same box.
    const page = run.page, idx = run.stepIndex;
    setTimeout(() => { if (guideRun === run && run.page === page && run.stepIndex === idx) pointAtStep(run, page, state.lastPoint); }, 800);
  }

  // The person pressed the button (or the screen changed around it): give the
  // next step without being asked.
  native.onFollow && native.onFollow(async (evt) => {
    if (!watching || evt.id !== watching.id || state.status === "locked") return;
    if (watching.run) { const run = watching.run; watching = null; return guideFollow(run, evt); }
    const prev = watching.out; watching = null;
    pointer.hide();
    // A Claude-guided step: ask Claude what comes next, with a fresh look.
    if (!prev.step) { if (prev.source === "claude") handleQuery(t(lang(), "clickedNext"), "follow"); return; }
    const next = nextStep();
    if (!next || next.done) return finish(t(lang(), "allDone"));
    {
      circle.show();
      circle.setTranscript(t(lang(), "youClicked"), false, { plain: true });
      state.history.push({ role: "assistant", text: next.text, at: Date.now() });
      lastReply = next;
      circle.setReply(next.text, { stepInfo: next.step, src: next.source });
      const aimed = await aim(next);
      if (!aimed.found && aimed.missing) { next.text = aimed.missing; circle.setReply(aimed.missing, { stepInfo: next.step, src: next.source }); }
      await say(next.text);
    }
  });

  async function finish(text) {
    circle.show(); circle.setTranscript(t(lang(), "youClicked"), false, { plain: true });
    circle.setReply(text, { src: "offline" });
    await say(text);
  }

  const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  async function handleQuery(text, via) {
    lastQuery = text;
    pointer.hide();
    stopWatching();
    if (guideRun && isRepeatAsk(text)) { const line = guideRun.lastLine || (guideRun.page && sayIn(guideRun.page.text, lang())); if (line) { circle.setTranscript(text); circle.setReply(line, { src: "offline" }); return say(line); } }
    guideRun = null;
    circle.show();
    circle.setTranscript(text);
    // Only the redacted words are remembered, so earlier questions sent to
    // Claude as context never carry a password, card number or code.
    state.history.push({ role: "user", text: redact(text).text, at: Date.now() });
    if (state.history.length > 40) state.history.splice(0, state.history.length - 40);
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
    if (out.guide) { state.history.pop(); return runGuide(out.guide); }
    if (!out.step) state.lastPoint = null;   // a new question starts fresh
    circle.setReply(out.text, { stepInfo: out.step, src: out.source, needsKey: out.needsKey });
    // Find the button first (about a second), so a guide whose button is not
    // on screen can say how to get there instead.
    const aimed = await aim(out);
    if (!aimed.found && aimed.missing) { out.text = aimed.missing; circle.setReply(aimed.missing, { stepInfo: out.step, src: out.source }); }
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

  // A newer line can interrupt one still being spoken. Only the newest line
  // returns OpenPath to idle, so the box's close timer starts after the last
  // instruction has finished, not when an interrupted one stops.
  let sayToken = 0;
  async function say(text, { keepLocked } = {}) {
    const mine = ++sayToken;
    setStatus(keepLocked ? "locked" : "speaking"); circle.setStatus(keepLocked ? "locked" : "speaking");
    await speak(text, {});
    if (mine !== sayToken) return;
    if (state.status !== "locked") setIdle();
  }

  function setIdle() { setStatus("idle"); circle.setStatus("idle"); }
  function lang() { return state.settings.language || "en"; }

  // Ctrl+O from any app (desktop) starts listening; press again to stop.
  if (native.onHotkey) native.onHotkey(() => handleTap());
  // Keyboard shortcuts inside OpenPath's own window: Ctrl+O (also the web
  // preview), or space when nothing has focus.
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); handleTap(); return; }
    if (e.code === "Space" && document.activeElement === document.body) { e.preventDefault(); handleTap(); }
    if (e.key === "Escape") { if (state.status === "listening") stopRequested = true; else if (sidebar.isOpen()) sidebar.close(); }
  });

  on("settings", () => { detectSttMode().then((m) => { state.sttMode = m; }); });

  return { circle, sidebar, pointer, handleQuery, locate: (labels) => native.locate(labels, null) };
}
