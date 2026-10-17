// Small helpers so nothing in OpenPath appears or disappears abruptly.
// Elements animate with the .op-enter / .op-leave classes defined in
// overlay.css; `hidden` is only set after the leave animation finishes.
const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function reveal(el) {
  if (!el) return;
  clearTimeout(el._opTimer);
  if (!el.hidden && !el.classList.contains("op-leave")) return;
  el.hidden = false;
  el.classList.remove("op-leave");
  el.classList.remove("op-enter");
  void el.offsetWidth;                       // restart the animation
  el.classList.add("op-enter");
}

export function conceal(el, after) {
  if (!el || el.hidden) { after && after(); return; }
  el.classList.remove("op-enter");
  el.classList.add("op-leave");
  clearTimeout(el._opTimer);
  el._opTimer = setTimeout(() => { el.hidden = true; el.classList.remove("op-leave"); after && after(); }, reduce() ? 0 : 200);
}

export function isShown(el) { return !!el && !el.hidden && !el.classList.contains("op-leave"); }

// The part of the overlay window that is really on screen. macOS can place
// the transparent window partly above the top of the display (we measured
// 28 points), so positions are converted with the window's real origin.
export function visibleArea() {
  const desktop = !!window.openpathNative && window.openpathNative.platform === "electron";
  if (!desktop) return { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  const top = Math.max(0, -window.screenY), left = Math.max(0, -window.screenX);
  return { top, left, bottom: Math.min(window.innerHeight, window.screen.height - window.screenY), right: Math.min(window.innerWidth, window.screen.width - window.screenX) };
}

// Converts a box in screen points (from the desktop's text reader or Claude)
// into this window's coordinates. Boxes from the web preview are already in
// page coordinates and carry space: "page".
export function toClient(box) {
  if (box.space === "page") return box;
  return { ...box, x: box.x - window.screenX, y: box.y - window.screenY };
}
