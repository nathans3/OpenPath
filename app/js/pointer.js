// The pointer: a bright pulsing ring around the thing to click, an arrow
// cursor that glides there from the OpenPath circle, and a short label.
// It never takes clicks (pointer-events: none), so the person clicks the real
// button straight through it.
import { state } from "./bus.js";
import { t } from "./i18n.js";
import { toClient, visibleArea } from "./motion.js";

export function mountPointer(root) {
  const layer = document.createElement("div");
  layer.className = "op-pointer-layer";
  layer.hidden = true;
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    <div class="op-ring"></div>
    <svg class="op-cursor" viewBox="0 0 32 40" width="44" height="55">
      <path d="M3 2 L3 32 L11 25 L16.5 37 L22 34.5 L16.5 23 L27 23 Z" />
    </svg>
    <div class="op-tag"></div>`;
  root.append(layer);

  const ring = layer.querySelector(".op-ring");
  const cursor = layer.querySelector(".op-cursor");
  const tag = layer.querySelector(".op-tag");
  let hideTimer = null;

  function show(screenBox, from) {
    const box = toClient(screenBox);
    const v = visibleArea();
    const pad = 10;
    const w = Math.max(44, box.w + pad * 2), h = Math.max(36, box.h + pad * 2);
    // Keep the ring fully on screen even for targets at the very edge.
    const x = Math.max(v.left + 2, Math.min(v.right - w - 2, box.x + box.w / 2 - w / 2));
    const y = Math.max(v.top + 2, Math.min(v.bottom - h - 2, box.y + box.h / 2 - h / 2));
    ring.style.left = x + "px"; ring.style.top = y + "px";
    ring.style.width = w + "px"; ring.style.height = h + "px";

    const L = state.settings?.language || "en";
    const label = box.tag || (box.text ? `${t(L, "clickHere")}: ${box.text}` : t(L, "clickHere"));
    tag.textContent = label;
    // The label sits beside the ring (right, else left), never below it,
    // because menus and lists usually open below what was clicked.
    tag.style.left = "0px"; tag.style.top = "0px";
    const tw = Math.min(320, tag.offsetWidth || 220), th = tag.offsetHeight || 38;
    const right = x + w + 14 + tw < v.right;
    const tx = right ? x + w + 14 : Math.max(v.left + 8, x - tw - 14);
    tag.style.left = tx + "px";
    tag.style.top = Math.max(v.top + 4, Math.min(v.bottom - th - 4, y + h / 2 - th / 2)) + "px";

    // Arrow tip lands just below-right of the target's center.
    const tipX = box.x + box.w / 2, tipY = box.y + box.h / 2;
    const start = from || { x: v.right - 100, y: v.top + (v.bottom - v.top) * 0.6 };
    cursor.style.transition = "none";
    cursor.style.transform = `translate(${start.x}px, ${start.y}px)`;
    layer.hidden = false;
    layer.classList.remove("is-on", "is-off");
    void cursor.offsetWidth;   // restart the glide
    cursor.style.transition = "";
    cursor.style.transform = `translate(${tipX - 3}px, ${tipY - 2}px)`;
    layer.classList.add("is-on");

    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 45000);
  }

  function hide() {
    clearTimeout(hideTimer);
    if (layer.hidden) return;
    layer.classList.remove("is-on");
    layer.classList.add("is-off");             // fade out, then remove
    setTimeout(() => { if (!layer.classList.contains("is-on")) { layer.hidden = true; layer.classList.remove("is-off"); } }, 260);
  }

  return { show, hide, isShown: () => !layer.hidden };
}
