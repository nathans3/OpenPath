// The floating circle and the reply card that sits beside it.
import { native, isDesktop } from "./bridge.js";
import { state, on } from "./bus.js";
import { t } from "./i18n.js";

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
      <button class="op-btn ghost menu" type="button" aria-label="Settings" style="min-height:36px;padding:4px 10px;font-size:18px">☰</button></div>
    <div class="op-you"></div>
    <div class="op-reply" aria-live="polite"></div>
    <div class="op-step"></div>
    <div class="op-actions">
      <button class="op-btn primary act-next" type="button"></button>
      <button class="op-btn act-repeat" type="button"></button>
      <button class="op-btn ghost act-type" type="button"></button>
      <button class="op-btn primary act-key" type="button" hidden></button>
    </div>
    <form class="op-type" hidden><input type="text" id="op-typed" autocomplete="off"><button class="op-btn primary" type="submit"></button></form>
    <div class="op-source"></div>`;

  root.append(circle, card);

  const q = (s) => card.querySelector(s);
  const statusTxt = q(".op-status .txt"), you = q(".op-you"), reply = q(".op-reply"), step = q(".op-step"), source = q(".op-source");
  const btnNext = q(".act-next"), btnRepeat = q(".act-repeat"), btnType = q(".act-type"), btnKey = q(".act-key"), form = q(".op-type"), input = q("#op-typed"), btnSend = form.querySelector("button");

  // ---- position & drag ----
  // `pos` is only set once the person drags the circle; until then it follows
  // a default spot on the right edge, recomputed on every resize.
  let pos = loadPos();
  place();
  function loadPos() { try { const p = JSON.parse(localStorage.getItem("openpath-pos")); if (p && p.x >= 0 && p.y >= 0) return p; } catch { /* ignore */ } return null; }
  function savePos() { try { localStorage.setItem("openpath-pos", JSON.stringify(pos)); } catch { /* ignore */ } }
  function current() {
    const W = Math.max(window.innerWidth, 320), H = Math.max(window.innerHeight, 320);
    const p = pos || { x: W - 140, y: Math.round(H * 0.55) };
    return { x: Math.max(8, Math.min(W - 92, p.x)), y: Math.max(8, Math.min(H - 92, p.y)), W, H };
  }
  function place() {
    const { x, y, W, H } = current();
    circle.style.left = x + "px"; circle.style.top = y + "px";
    const cardW = Math.min(420, W - 32);
    const left = x + 100 + cardW < W ? x + 100 : x - cardW - 16;
    card.style.left = Math.max(8, left) + "px";
    const h = card.offsetHeight || 220;
    card.style.top = Math.max(8, Math.min(H - h - 8, y - 20)) + "px";
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

  // ---- Electron click-through management ----
  if (isDesktop) {
    for (const n of [circle, card]) {
      n.addEventListener("pointerenter", () => native.setInteractive(true));
      n.addEventListener("pointerleave", () => { if (!drag) native.setInteractive(false); });
    }
  }

  // ---- actions ----
  q(".menu").addEventListener("click", handlers.onMenu);
  btnNext.addEventListener("click", () => handlers.onText(t(lang(), "done")));
  btnRepeat.addEventListener("click", handlers.onRepeat);
  btnKey.addEventListener("click", () => handlers.onAddKey && handlers.onAddKey());
  btnType.addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) input.focus(); place(); });
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
    setTranscript(text, partial = false) {
      const L = lang();
      you.innerHTML = text ? `${t(L, "youSaid")}: <b>${escapeHtml(text)}</b>${partial ? " …" : ""}` : "";
      place();
    },
    setReply(text, { stepInfo, src, needsKey } = {}) {
      reply.textContent = text || "";
      btnKey.hidden = !needsKey;
      step.textContent = stepInfo && stepInfo.total > 1 ? `${t(lang(), "nextStep")} ${stepInfo.index + 1} / ${stepInfo.total}` : "";
      btnNext.hidden = !(stepInfo && stepInfo.total > 1 && !stepInfo.last);
      btnRepeat.hidden = !text;
      const L = lang();
      source.textContent = src === "claude" ? t(L, "claudeNote") : src === "cache" ? t(L, "cachedNote") : src === "offline" ? t(L, "offlineNote") : "";
      place();
    },
    showTyping(hint) { form.hidden = false; input.placeholder = hint || t(lang(), "typePlaceholder"); input.focus(); place(); },
    show() { card.hidden = false; place(); },
    hide() { card.hidden = true; },
    toggle() { card.hidden ? api.show() : api.hide(); },
    element: circle,
  };
  return api;
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
