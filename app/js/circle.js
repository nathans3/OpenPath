// The floating circle and the reply card that sits beside it.
import { native, isDesktop } from "./bridge.js";
import { state, on } from "./bus.js";
import { t } from "./i18n.js";
import { reveal, conceal, isShown, visibleArea } from "./motion.js";

const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

export function mountCircle(root, handlers) {
  const lang = () => state.settings?.language || "en";

  const circle = el("button", "op-circle");
  circle.type = "button";
  circle.setAttribute("aria-label", "OpenPath. Tap to talk.");
  circle.innerHTML = `<span class="op-level"></span><span class="op-orb"></span>`;
  const level = circle.querySelector(".op-level");

  const card = el("div", "op-card");
  card.hidden = true;
  card.innerHTML = `
    <div class="op-status"><span class="dot"></span><span class="txt"></span><span style="flex:1"></span>
      <button class="op-btn ghost menu" type="button" aria-label="Settings" title="Settings">☰</button>
      <button class="op-btn ghost close-card" type="button" aria-label="Close this box" title="Close">✕</button></div>
    <div class="op-you"></div>
    <div class="op-reply" aria-live="polite"></div>
    <div class="op-step"></div>
    <div class="op-actions">
      <button class="op-btn primary act-next" type="button"></button>
      <button class="op-btn act-repeat" type="button"></button>
      <button class="op-btn ghost act-type" type="button"></button>
      <button class="op-btn primary act-key" type="button" hidden></button>
    </div>
    <div class="op-choices"></div>
    <form class="op-type" hidden><input type="text" id="op-typed" autocomplete="off"><button class="op-btn primary" type="submit"></button></form>
    <div class="op-source"></div>`;

  // Quick actions that fade in under the circle on hover.
  const quick = el("div", "op-quick");
  quick.setAttribute("role", "toolbar");
  quick.innerHTML = `
    <button type="button" class="op-qbtn" data-q="type"><span class="i">⌨</span><span class="l"></span></button>
    <button type="button" class="op-qbtn" data-q="box"><span class="i">▭</span><span class="l"></span></button>
    <button type="button" class="op-qbtn" data-q="fade"><span class="i">◐</span><span class="l"></span></button>
    <button type="button" class="op-qbtn" data-q="settings"><span class="i">⚙</span><span class="l"></span></button>`;

  root.append(quick, circle, card);

  const q = (s) => card.querySelector(s);
  const statusTxt = q(".op-status .txt"), you = q(".op-you"), reply = q(".op-reply"), step = q(".op-step"), source = q(".op-source");
  const btnNext = q(".act-next"), btnRepeat = q(".act-repeat"), btnType = q(".act-type"), btnKey = q(".act-key"), form = q(".op-type"), input = q("#op-typed"), btnSend = form.querySelector("button");

  // ---- position & drag ----
  // `pos` is only set once the person drags the circle; until then it follows
  // a default spot on the right edge, recomputed on every resize.
  // Which side of the circle the box opens on: "auto", "left" or "right".
  let side = readPref("openpath-card-side", "auto");
  let faded = readPref("openpath-faded", "no") === "yes";
  function readPref(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
  function writePref(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  let pos = loadPos();
  place();
  function loadPos() { try { const p = JSON.parse(localStorage.getItem("openpath-pos")); if (p && p.x >= 0 && p.y >= 0) return p; } catch { /* ignore */ } return null; }
  function savePos() { try { localStorage.setItem("openpath-pos", JSON.stringify(pos)); } catch { /* ignore */ } }
  function current() {
    const v = visibleArea();
    const W = Math.max(v.right, 320), H = Math.max(v.bottom, 320), T = v.top, L = v.left;
    const p = pos || { x: W - 140, y: Math.round(T + (H - T) * 0.55) };
    return { x: Math.max(L + 8, Math.min(W - 92, p.x)), y: Math.max(T + 8, Math.min(H - 92, p.y)), W, H, T };
  }
  function place() {
    const { x, y, W, H, T } = current();
    circle.style.left = x + "px"; circle.style.top = y + "px";
    const cardW = Math.min(420, W - 32);
    const fitsRight = x + 100 + cardW < W, fitsLeft = x - cardW - 16 >= 8;
    const goLeft = side === "left" ? fitsLeft || !fitsRight : side === "right" ? !fitsRight && fitsLeft : !fitsRight;
    const left = goLeft ? x - cardW - 16 : x + 100;
    card.style.left = Math.max(8, Math.min(W - cardW - 8, left)) + "px";
    const h = card.offsetHeight || 220;
    card.style.top = Math.max(T + 8, Math.min(H - h - 8, y - 20)) + "px";
    // Quick menu: under the circle, or above it near the bottom edge.
    const qh = quick.offsetHeight || 210;
    const below = y + 92 + qh + 8 < H;
    quick.style.left = Math.max(8, Math.min(W - 150, x + 42 - 70)) + "px";
    quick.style.top = (below ? y + 92 : Math.max(T + 8, y - qh - 8)) + "px";
    quick.classList.toggle("above", !below);
  }
  window.addEventListener("resize", place);

  let drag = null;
  circle.addEventListener("pointerdown", (e) => { const c = current(); drag = { sx: e.clientX, sy: e.clientY, ox: c.x, oy: c.y, moved: false }; circle.setPointerCapture(e.pointerId); });
  circle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) { pos = { x: drag.ox + dx, y: drag.oy + dy }; place(); }
  });
  circle.addEventListener("pointerup", (e) => {
    const wasDrag = drag?.moved; drag = null;
    if (wasDrag) { savePos(); return; }
    handlers.onTap();
  });
  circle.addEventListener("pointercancel", () => { drag = null; });
  circle.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlers.onTap(); } });

  // ---- the answer box fades away when left alone ----
  // After 15 seconds (Settings → Voice) with no hover, typing, listening, thinking or speaking,
  // the box fades out. The circle stays; a tap brings the box back.
  const idleMs = () => { const v = state.settings?.boxHideSeconds; return v === 0 ? 0 : (v || 15) * 1000; };
  let idleTimer = null, overCard = false;
  function armIdle() {
    clearTimeout(idleTimer);
    if (!isShown(card) || overCard || document.activeElement === input) return;
    if (["listening", "thinking", "speaking", "locked"].includes(state.status)) return;
    if (!idleMs()) return;                                   // "Never" in Settings
    idleTimer = setTimeout(() => { if (!overCard && state.status === "idle" && document.activeElement !== input) { conceal(card); setTimeout(quickLabels, 220); } }, idleMs());
  }
  card.addEventListener("pointerenter", () => { overCard = true; clearTimeout(idleTimer); });
  card.addEventListener("pointerleave", () => { overCard = false; armIdle(); });
  card.addEventListener("pointermove", () => { if (!overCard) { overCard = true; clearTimeout(idleTimer); } });
  input.addEventListener("focus", () => clearTimeout(idleTimer));
  input.addEventListener("blur", armIdle);
  on("status", armIdle);

  // ---- quick menu on hover ----
  let quickTimer = null;
  const showQuick = () => { clearTimeout(quickTimer); if (drag?.moved) return; place(); quickLabels(); quick.classList.add("open"); circle.classList.add("is-hover"); };
  const hideQuick = () => { clearTimeout(quickTimer); quickTimer = setTimeout(() => { quick.classList.remove("open"); circle.classList.remove("is-hover"); }, 180); };
  for (const n of [circle, quick]) { n.addEventListener("pointerenter", showQuick); n.addEventListener("pointerleave", hideQuick); }
  circle.addEventListener("focus", showQuick);
  quick.addEventListener("focusin", showQuick);
  quick.addEventListener("focusout", hideQuick);

  function applyFade() { circle.classList.toggle("is-faded", faded); }
  applyFade();

  quick.addEventListener("click", (e) => {
    const b = e.target.closest("[data-q]"); if (!b) return;
    const what = b.dataset.q;
    if (what === "type") { reveal(card); reveal(form); place(); input.focus(); handlers.onTypeOpen && handlers.onTypeOpen(); }
    if (what === "box") {
      if (isShown(card)) conceal(card);
      else { reveal(card); if (!reply.textContent.trim()) { reveal(form); input.focus(); } place(); }
    }
    if (what === "fade") {
      faded = !faded; writePref("openpath-faded", faded ? "yes" : "no");
      // The circle dims at once (half-faded while the pointer is still on it,
      // fully faded once the pointer leaves).
      applyFade();
    }
    if (what === "settings") handlers.onMenu();
    setTimeout(quickLabels, 220);
  });

  function quickLabels() {
    const L = lang();
    const words = {
      en: { type: "Type a question", show: "Show text box", hide: "Hide text box", fade: "Fade circle", clear: "Show circle", settings: "Settings" },
      es: { type: "Escribir pregunta", show: "Mostrar cuadro de texto", hide: "Ocultar cuadro de texto", fade: "Atenuar círculo", clear: "Mostrar círculo", settings: "Ajustes" },
      zh: { type: "打字提问", show: "显示文字框", hide: "隐藏文字框", fade: "淡化圆圈", clear: "显示圆圈", settings: "设置" },
      hi: { type: "सवाल लिखें", show: "टेक्स्ट बॉक्स दिखाएँ", hide: "टेक्स्ट बॉक्स छिपाएँ", fade: "गोला धुंधला करें", clear: "गोला दिखाएँ", settings: "सेटिंग्स" },
    };
    const w = words[L] || words.en;
    quick.querySelector('[data-q="type"] .l').textContent = w.type;
    quick.querySelector('[data-q="box"] .l').textContent = isShown(card) ? w.hide : w.show;
    quick.querySelector('[data-q="fade"] .l').textContent = faded ? w.clear : w.fade;
    quick.querySelector('[data-q="settings"] .l').textContent = w.settings;
  }
  quickLabels();
  on("settings", quickLabels);

  // ---- Electron click-through management ----
  if (isDesktop) {
    for (const n of [circle, card, quick]) {
      n.addEventListener("pointerenter", () => native.setInteractive(true));
      n.addEventListener("pointerleave", () => { if (!drag) native.setInteractive(false); });
    }
  }

  // ---- actions ----
  q(".menu").addEventListener("click", handlers.onMenu);
  q(".close-card").addEventListener("click", () => { conceal(card); setTimeout(quickLabels, 220); handlers.onClose && handlers.onClose(); if (isDesktop) native.setInteractive(false); });
  btnNext.addEventListener("click", () => handlers.onText(t(lang(), "done")));
  btnRepeat.addEventListener("click", handlers.onRepeat);
  btnKey.addEventListener("click", () => handlers.onAddKey && handlers.onAddKey());
  btnType.addEventListener("click", () => { if (isShown(form)) conceal(form, place); else { reveal(form); input.focus(); } place(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; input.value = ""; handlers.onText(v); });

  function labels() {
    const L = lang();
    btnNext.textContent = t(L, "done");
    btnRepeat.textContent = t(L, "repeat");
    btnType.textContent = t(L, "typeInstead");
    btnKey.textContent = t(L, "addKey");
    btnSend.textContent = t(L, "send");
    input.placeholder = t(L, "typePlaceholder");
  }
  labels();
  on("settings", labels);

  // ---- rendering ----
  const api = {
    setLevel(v) { level.style.transform = `scale(${1 + v * 0.45})`; },
    setStatus(s) {
      const L = lang();
      for (const c of ["is-listening", "is-thinking", "is-speaking", "is-locked"]) { circle.classList.remove(c); card.classList.remove(c); }
      const map = { listening: "is-listening", thinking: "is-thinking", speaking: "is-speaking", locked: "is-locked" };
      if (map[s]) { circle.classList.add(map[s]); card.classList.add(map[s]); }
      statusTxt.textContent = { idle: t(L, "openPath"), listening: t(L, "listening"), thinking: t(L, "thinking"), speaking: t(L, "speaking"), locked: t(L, "locked") }[s] || t(L, "openPath");
      if (s !== "idle") api.show();
      place();
    },
    setTranscript(text, partial = false, { plain = false } = {}) {
      const L = lang();
      you.innerHTML = !text ? "" : plain ? `<b>${escapeHtml(text)}</b>` : `${t(L, "youSaid")}: <b>${escapeHtml(text)}</b>${partial ? " …" : ""}`;
      place();
    },
    setReply(text, { stepInfo, src, needsKey } = {}) {
      reply.textContent = text || "";
      // A new instruction shows the box (if it had faded) and restarts its
      // close-by-itself timer.
      if (text) { if (!isShown(card)) api.show(); else armIdle(); }
      btnKey.hidden = !needsKey;
      card.querySelector(".op-choices").innerHTML = "";
      step.textContent = stepInfo && stepInfo.total > 1 ? `${t(lang(), "nextStep")} ${stepInfo.index + 1} / ${stepInfo.total}` : "";
      btnNext.hidden = !(stepInfo && stepInfo.total > 1 && !stepInfo.last);
      btnRepeat.hidden = !text;
      const L = lang();
      source.textContent = src === "claude" ? t(L, "claudeNote") : src === "cache" ? t(L, "cachedNote") : src === "offline" ? t(L, "offlineNote") : "";
      place();
    },
    setChoices(list) {
      const box = card.querySelector(".op-choices");
      box.innerHTML = "";
      for (const c of list || []) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "op-btn" + (c.primary ? " primary" : "");
        b.textContent = c.label;
        b.addEventListener("click", () => { box.innerHTML = ""; c.onClick(); });
        box.append(b);
      }
      place();
    },
    center() { const r = circle.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
    // Moves the answer box to the other side of the circle if it would cover
    // the thing to click or the space just below it (where menus open).
    keepClear(screenBox) {
      const b = { x: screenBox.x - window.screenX - 20, y: screenBox.y - window.screenY - 20, w: screenBox.w + 40, h: screenBox.h + 300 };
      const hits = () => { const r = card.getBoundingClientRect(); return !card.hidden && r.x < b.x + b.w && r.x + r.width > b.x && r.y < b.y + b.h && r.y + r.height > b.y; };
      if (!hits()) return;
      const { x } = current();
      side = parseFloat(card.style.left || "0") < x ? "right" : "left";
      place();
      if (hits()) { side = side === "left" ? "right" : "left"; place(); conceal(card); }   // no room either side: fade it out
    },
    showTyping(hint) { reveal(form); input.placeholder = hint || t(lang(), "typePlaceholder"); input.focus(); place(); },
    show() { reveal(card); place(); quickLabels(); armIdle(); },
    hide() { conceal(card); setTimeout(quickLabels, 220); },
    toggle() { isShown(card) ? api.hide() : api.show(); },
    element: circle,
  };
  return api;
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
