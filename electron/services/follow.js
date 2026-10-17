// Following along: after OpenPath points at a button, it watches for the
// person to press it and then tells the overlay to give the next step.
//
// Two signals, whichever comes first:
//   1. A click inside the ring. Needs the macOS Accessibility permission
//      (the person grants it once); uses uiohook-napi for global mouse events.
//      Only the click position is checked; nothing is recorded or sent.
//   2. The screen around the button changes (new text appears, or most of the
//      old text disappears). Needs no extra permission: the area is re-read
//      with the computer's own text recognition about once a second.
//   3. In a guide: the Enter key in a text box, and for a list box (Month,
//      Gender) a click on the box followed by the next click (the choice).
//      Only "Enter was pressed" is noticed; no other key is looked at, kept
//      or sent, so what the person types is never recorded.
// Watching stops after the first signal, a new question, or three minutes.

const { screen, systemPreferences } = require("electron");
const vision = require("./vision");

let hook = null, hookStarted = false, hookError = null;
let current = null;

function trusted() {
  if (process.platform !== "darwin") return true;
  try { return systemPreferences.isTrustedAccessibilityClient(false); } catch { return false; }
}

function ensureHook() {
  if (hookStarted) return true;
  if (!trusted()) return false;
  try {
    const lib = require("uiohook-napi");
    hook = hook || lib.uIOhook;
    const ENTER = new Set([lib.UiohookKey.Enter, lib.UiohookKey.NumpadEnter]);
    hook.on("mousedown", () => {
      if (!current) return;
      const pt = screen.getCursorScreenPoint();
      const b = current.box, pad = 14;
      const inBox = pt.x >= b.x - pad && pt.x <= b.x + b.w + pad && pt.y >= b.y - pad && pt.y <= b.y + b.h + pad;
      if (current.pickClicks) {
        // A list box: the click that opens it, then the click on a choice.
        if (current.opened) current.choseAt = Date.now();
        else if (inBox) current.opened = true;
        return;
      }
      if (!current.clicks) return;                 // typing steps wait for the typed text instead
      if (inBox) {
        const id = current.id;
        setTimeout(() => fire(id, "clicked"), 650);    // let the app react before the next look
      }
    });
    // Only whether the key was Enter is checked; nothing else about any key.
    hook.on("keydown", (e) => {
      if (!current || !ENTER.has(e.keycode)) return;
      if (current.pickClicks && current.opened) { current.choseAt = Date.now(); return; }   // picked with the keyboard
      if (current.enter) { const id = current.id; setTimeout(() => fire(id, "enter"), 120); }
    });
    hook.start();
    hookStarted = true;
    return true;
  } catch (err) {
    hookError = String(err?.message || err);
    return false;
  }
}

const normalize = (t) => t.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
const isClock = (raw) => /\b\d{1,2}:\d{2}\b/.test(raw);              // "3:45 PM" changes on its own

// Text recognition reads the same pixels slightly differently from one look
// to the next ("Start video" / "Start vide"), so a line only counts as new
// when nothing similar was there before.
function similar(a, b) {
  if (a === b) return true;
  if (a.replace(/\D/g, "") !== b.replace(/\D/g, "")) return false;     // "Tab 3" is not "Tab 2"
  if (Math.abs(a.length - b.length) > Math.max(3, a.length * 0.3)) return false;
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n] / Math.max(m, n) <= 0.25;
}
const isNew = (line, set) => ![...set].some((b) => similar(line, b));
// Short lines are usually stray marks, except numbers: a typed day ("12") counts.
const clean = (lines) => new Set(lines.filter((raw) => !isClock(raw)).map(normalize).filter((t) => t.length >= 3 || /^\d+$/.test(t)));

// What a list box shows once something is picked (Google's Month and Gender).
const PICKS = {
  month: /^(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/,
  gender: /^(female|male|rather not say|custom|woman|man|mujer|hombre|prefiero no decirlo|personalizado)$/,
};

// mode: "any"  (default) a click in the ring, typing, or a page change
//       "text-or-page"   typing or a page change, reported separately
//       "page"           only a page change (most of the old words are gone)
//       "value"          a list box: done when exactly one choice shows (the
//                        list closed on a pick); an open list shows many
// area: where to look for changes (defaults to the box), e.g. a page heading.
async function watch(webContents, { id, box, area, clicks = true, mode = "any", exclude = [], pick = null, enter = false, pickClicks = false }) {
  stop();
  const d = screen.getPrimaryDisplay().bounds;
  const a = area || box;
  const region = {
    x: Math.max(d.x, a.x - 420), y: Math.max(d.y, a.y - 80),
    w: Math.min(d.width, a.w + 840), h: Math.min(d.height, a.h + 560),
  };
  const me = { id, box, region, clicks: clicks && mode === "any", mode, exclude, webContents, started: Date.now(), baseline: null, timer: null, pick: PICKS[pick] || null, enter, pickClicks, opened: false, choseAt: 0 };
  current = me;
  const usingHook = ensureHook();
  if (mode === "keys") return { ok: true, clicks: usingHook };      // Enter only, no screen reading
  // Two looks make the starting picture, so reading noise is not a "change".
  const first = await vision.readRegion(region, exclude);
  await new Promise((r) => setTimeout(r, 150));
  const second = await vision.readRegion(region, exclude);
  if (current !== me) return { ok: false, reason: "replaced" };
  if (first.ok && second.ok) {
    me.baseline = new Set([...clean(first.lines), ...clean(second.lines)]);
    me.pending = null;
    me.timer = setInterval(() => poll(me), 250);
  }
  return { ok: true, clicks: usingHook, screen: first.ok };
}

async function poll(me) {
  if (current !== me || me.busy) return;
  if (Date.now() - me.started > 180000) return stop();
  me.busy = true;
  const res = await vision.readRegion(me.region, me.exclude);
  me.busy = false;
  if (current !== me || !res.ok) return;
  const now = clean(res.lines);
  if (me.mode === "value" && me.pick) {
    const hits = [...now].filter((t) => me.pick.test(t));
    // A choice was clicked and the list has closed (at most one choice shows).
    if (me.choseAt && Date.now() - me.choseAt > 700 && hits.length <= 1) return fire(me.id, "typed");
    if (hits.length !== 1) { me.pending = null; return; }
    if (me.pending === "V" + hits[0]) return fire(me.id, "typed");   // same single choice on two looks
    me.pending = "V" + hits[0];
    return;
  }
  const added = [...now].filter((t) => isNew(t, me.baseline));
  const gone = [...me.baseline].filter((t) => isNew(t, now)).length;
  const page = gone >= Math.max(3, me.baseline.size * 0.5);
  // A dropdown list opening adds many lines at once (January … December):
  // that is not an answer yet, so wait until it closes on a choice.
  const typed = !page && added.length >= 1 && added.length <= 3;
  const changed = page || (typed && me.mode !== "page");
  // The change has to be there on two looks in a row.
  if (!changed) { me.pending = null; return; }
  // A whole new page (most words gone) needs no second look.
  if (page && gone >= me.baseline.size * 0.7 && me.baseline.size >= 4) return fire(me.id, "page");
  const sig = (page ? "P" : "T") + added.sort().join("|") + "#" + gone;
  if (me.pending && (me.pending === sig || (sig[0] === me.pending[0] && added.some((a) => me.pending.includes(a))) || (page && me.pending[0] === "P"))) fire(me.id, page ? "page" : "typed");
  else me.pending = sig;
}

function fire(id, reason) {
  if (!current || current.id !== id) return;
  const wc = current.webContents;
  stop();
  if (wc && !wc.isDestroyed()) wc.send("follow:advance", { id, reason });
}

function stop() {
  if (current?.timer) clearInterval(current.timer);
  current = null;
}

function status() {
  return { clicks: trusted(), hookStarted, hookError, platform: process.platform };
}

// Shows the macOS "allow Accessibility" prompt. The person decides there.
function requestPermission() {
  if (process.platform !== "darwin") return true;
  try { return systemPreferences.isTrustedAccessibilityClient(true); } catch { return false; }
}

function shutdown() { stop(); try { if (hookStarted) hook.stop(); } catch { /* ignore */ } }

module.exports = { watch, stop, status, requestPermission, shutdown };
