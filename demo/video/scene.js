// Plays one Google sign-up with OpenPath guiding it, in real time, for the
// demo video recorder (demo/video/record.js). OpenPath's circle, answer box
// and pointer are the app's own modules; the words it says are the app's own
// guide lines (app/js/guides.js). The Google pages are a re-creation.
//
// window.VOICE = { key: seconds } is set by the recorder before start().
// window.__marks collects { key, t } (ms from start) so the recorder can lay
// each voice clip exactly where the scene said it.
import { state, loadSettings, setStatus } from "../../app/js/bus.js";
import { mountCircle } from "../../app/js/circle.js";
import { mountPointer } from "../../app/js/pointer.js";

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t0 = 0;
window.__marks = [];
const mark = (key) => window.__marks.push({ key, t: Math.round(performance.now() - t0) });

// ---------- OpenPath ----------
let circle, pointer;
async function mountOpenPath() {
  try { localStorage.setItem("openpath-pos", JSON.stringify({ x: 1786, y: 760 })); localStorage.setItem("openpath-card-side", "left"); } catch { /* ignore */ }
  await loadSettings();
  state.settings.boxHideSeconds = 0;              // keep the box up for the video
  const root = $("#op-root");
  pointer = mountPointer(root);
  circle = mountCircle(root, { onTap() {}, onMenu() {}, onText() {}, onRepeat() {}, onAddKey() {}, onClose() {} });
  circle.setStatus("idle");
}
function status(s) { setStatus(s); circle.setStatus(s); }
const boxOf = (el, text) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, text, space: "page" }; };

// Speaks one guide line: shows it in the box, marks it for the audio track,
// waits for the clip to finish.
async function say(key, text, { you } = {}) {
  if (you !== undefined) circle.setTranscript(you, false, { plain: true });
  circle.setReply(text, { src: "offline" });
  status("speaking");
  mark(key);
  await sleep(((window.VOICE || {})[key] || 3) * 1000 + 250);
  status("idle");
}
function point(el, label) { pointer.show(boxOf(el, label), circle.center()); circle.keepClear(boxOf(el, label)); }
function unpoint() { pointer.hide(); }

// ---------- The person's mouse and keyboard ----------
let mx = 1500, my = 760;
function placeMouse(x, y, ms = 700) {
  const m = $("#mouse");
  m.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4,.1,.2,1)` : "none";
  m.style.transform = `translate(${x}px, ${y}px)`;
  mx = x; my = y;
}
async function moveTo(el, { dx = 0, dy = 0, ms = 750, at = "center", tail = 120 } = {}) {
  const r = el.getBoundingClientRect();
  const x = (at === "left" ? r.x + 30 : r.x + r.width / 2) + dx, y = r.y + r.height / 2 + dy;
  placeMouse(x, y, ms);
  await sleep(ms + tail);
}
async function click() {
  const m = $("#mouse"), rp = $("#ripple");
  m.classList.add("down"); rp.style.left = mx + 3 + "px"; rp.style.top = my + 3 + "px";
  rp.classList.remove("go"); void rp.offsetWidth; rp.classList.add("go");
  await sleep(110); m.classList.remove("down"); await sleep(220);
}
function focusField(f) { document.querySelectorAll(".field.focus").forEach((x) => x.classList.remove("focus")); if (f) f.classList.add("focus"); }
async function typeInto(field, text, { per = 135 } = {}) {
  const input = field.querySelector("input");
  focusField(field);
  for (const ch of text) { input.value += ch; field.classList.add("filled"); await sleep(per + Math.random() * 70); }
  await sleep(300);
}
async function pick(field, menu, choice) {
  focusField(field);
  menu.classList.add("on");
  await sleep(500);
  const item = [...menu.children].find((d) => d.textContent === choice);
  await moveTo(item, { at: "left", ms: 600 });
  item.classList.add("hover");
  await sleep(250);
  await click();
  menu.classList.remove("on"); item.classList.remove("hover");
  field.querySelector(".value").textContent = choice; field.classList.add("filled");
  focusField(null);
  await sleep(350);
}

// ---------- Pages ----------
const URLS = {
  home: ["google.com", "Google"],
  signin: ["accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn", "Sign in - Google Accounts"],
  name: ["accounts.google.com/lifecycle/steps/signup/name", "Create your Google Account"],
  birthday: ["accounts.google.com/lifecycle/steps/signup/birthdaygender", "Create your Google Account"],
  username: ["accounts.google.com/lifecycle/steps/signup/username", "Create your Google Account"],
  password: ["accounts.google.com/lifecycle/steps/signup/password", "Create your Google Account"],
  review: ["accounts.google.com/lifecycle/steps/signup/review", "Create your Google Account"],
  terms: ["accounts.google.com/lifecycle/steps/signup/termsofservice", "Create your Google Account"],
  done: ["myaccount.google.com/?pli=1", "Google Account"],
};
async function go(id, { fast = false } = {}) {
  unpoint();
  const cur = document.querySelector(".page.on .card");
  if (cur) { cur.classList.add("loading"); await sleep(fast ? 280 : 650); cur.classList.remove("loading"); }
  else await sleep(fast ? 150 : 350);
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("on", p.dataset.page === id));
  $("#url").textContent = URLS[id][0]; $("#tabtitle").textContent = URLS[id][1];
  await sleep(fast ? 150 : 450);
}

// Starts a line and returns a promise for its end, so the person can act
// while OpenPath is still talking (used by the 30-second cut).
function sayAsync(key, text, opts) { return say(key, text, opts); }

// ---------- The sign-up ----------
// L = the guide's lines, passed in by the recorder from app/js/guides.js.
async function play(L) {
  t0 = performance.now();
  placeMouse(1500, 760, 0);
  await sleep(1200);

  // The person presses Ctrl+O and asks.
  $("#keycap").classList.add("on");
  await sleep(700);
  status("listening");
  circle.show();
  circle.setTranscript(""); circle.setReply("");
  mark("question");
  const q0 = performance.now(), qLen = ((window.VOICE || {}).question || 2.4) * 1000 + 900;
  while (performance.now() - q0 < qLen) {
    const k = (performance.now() - q0) / 1000;
    circle.setLevel(k > 0.35 && k < qLen / 1000 - 0.5 ? 0.25 + 0.6 * Math.abs(Math.sin(k * 9) * Math.sin(k * 3.7)) : 0.04);
    await sleep(60);
  }
  circle.setLevel(0);
  $("#keycap").classList.remove("on");
  status("thinking");
  await sleep(700);

  // google.com
  await say("google_home", L.google_home, { you: "You said: How do I make a Google account?" });
  point($("#home-signin"), "Sign in");
  await sleep(900);
  await moveTo($("#home-signin"));
  await click();
  await go("signin");

  // Sign in → Create account → For my personal use
  const create = $("#create-account");
  circle.setTranscript("");
  await say("signin", L.signin);
  point(create, "Create account");
  await sleep(600);
  await moveTo(create);
  await click();
  unpoint();
  $("#acct-menu").classList.add("on");
  await sleep(500);
  const personal = $("#acct-menu").children[0];
  point(personal, "For my personal use");
  await say("account_type", L.account_type);
  await moveTo(personal, { at: "left" });
  personal.classList.add("hover");
  await click();
  $("#acct-menu").classList.remove("on");
  await go("name");

  // Name, one box at a time
  const first = $("#f-first"), last = $("#f-last");
  point(first, "First name");
  await say("name", L.name);
  await moveTo(first, { at: "left" }); await click();
  await typeInto(first, "Margaret");
  await sleep(1300);
  unpoint(); circle.setTranscript("Got it ✓", false, { plain: true });
  point(last, "Last name (optional)");
  await say("name.1", L["name.1"]);
  await moveTo(last, { at: "left" }); await click();
  await typeInto(last, "Lee");
  await sleep(1300);
  unpoint(); focusField(null);
  point($("#name-next"), "Next");
  await say("next", L.next);
  await moveTo($("#name-next")); await click();
  await go("birthday");

  // Birthday: Month, Day, Year, Gender, Next
  const month = $("#f-month"), day = $("#f-day"), year = $("#f-year"), gender = $("#f-gender");
  circle.setTranscript("");
  point(month, "Month");
  await say("birthday", L.birthday);
  await moveTo(month, { at: "left" }); await click();
  unpoint();
  await pick(month, $("#month-menu"), "March");
  await sleep(900);
  circle.setTranscript("Got it ✓", false, { plain: true });
  point(day, "Day");
  await say("birthday.1", L["birthday.1"]);
  await moveTo(day, { at: "left" }); await click();
  await typeInto(day, "14");
  await sleep(1200);
  unpoint();
  point(year, "Year");
  await say("birthday.2", L["birthday.2"]);
  await moveTo(year, { at: "left" }); await click();
  await typeInto(year, "1948");
  await sleep(1200);
  unpoint(); focusField(null);
  point(gender, "Gender");
  await say("birthday.3", L["birthday.3"]);
  await moveTo(gender, { at: "left" }); await click();
  unpoint();
  await pick(gender, $("#gender-menu"), "Rather not say");
  await sleep(900);
  point($("#bday-next"), "Next");
  await say("next", L.next);
  await moveTo($("#bday-next")); await click();
  await go("username");

  // Gmail address
  const own = $("#r-own"), user = $("#f-user");
  circle.setTranscript("");
  point(own, "Create your own Gmail address");
  await say("username", L.username);
  await moveTo(own, { at: "left", dx: -14 }); await click();
  own.classList.add("on"); user.style.display = "flex"; $("#user-hint").style.display = "block";
  await sleep(700);
  unpoint(); circle.setTranscript("Got it ✓", false, { plain: true });
  point(user, "Username");
  await say("username.1", L["username.1"]);
  await moveTo(user, { at: "left" }); await click();
  await typeInto(user, "margaret.lee.1948", { per: 120 });
  await sleep(1300);
  unpoint(); focusField(null);
  point($("#user-next"), "Next");
  await say("username.2", L["username.2"]);
  await moveTo($("#user-next")); await click();
  await go("password");

  // Password
  const pass = $("#f-pass"), confirm = $("#f-confirm");
  circle.setTranscript("");
  point(pass, "Password");
  await say("password", L.password);
  await moveTo(pass, { at: "left" }); await click();
  await typeInto(pass, "Sunflower#1948", { per: 120 });
  await sleep(1000);
  unpoint();
  point(confirm, "Confirm");
  await say("password.1", L["password.1"]);
  await moveTo(confirm, { at: "left" }); await click();
  await typeInto(confirm, "Sunflower#1948", { per: 120 });
  await sleep(1000);
  unpoint(); focusField(null);
  point($("#pass-next"), "Next");
  await say("next", L.next);
  await moveTo($("#pass-next")); await click();
  await go("review");

  // Review
  circle.setTranscript("");
  point($("#review-next"), "Next");
  await say("review", L.review);
  await moveTo($("#review-next")); await click();
  await go("terms");

  // Terms
  point($("#agree"), "I agree");
  await say("terms", L.terms);
  await moveTo($(".terms"), { ms: 600 });
  $("#terms-inner").style.transform = "translateY(-150px)";
  await sleep(1800);
  await moveTo($("#agree")); await click();
  await go("done");

  // Done
  await say("done", L.done);
  await sleep(1500);
  mark("end");
}

// ---------- The 30-second cut ----------
async function playShort(L) {
  t0 = performance.now();
  const fast = { ms: 250, tail: 40 };
  placeMouse(1100, 760, 0);
  await sleep(500);
  $("#keycap").classList.add("on");
  await sleep(400);
  status("listening"); circle.show(); circle.setTranscript(""); circle.setReply("");
  mark("question");
  const q0 = performance.now(), qLen = ((window.VOICE || {}).question || 2.9) * 1000 + 650;
  while (performance.now() - q0 < qLen) {
    const k = (performance.now() - q0) / 1000;
    circle.setLevel(k > 0.4 && k < qLen / 1000 - 0.3 ? 0.25 + 0.6 * Math.abs(Math.sin(k * 9) * Math.sin(k * 3.7)) : 0.04);
    await sleep(60);
  }
  circle.setLevel(0); $("#keycap").classList.remove("on");
  status("thinking"); await sleep(350);

  // google.com
  let talk = sayAsync("s_home", L.s_home, { you: "You said: How do I make a Google account?" });
  point($("#home-signin"), "Sign in");
  await sleep(2100);
  await moveTo($("#home-signin"), fast); await fclick();
  await talk;
  await go("signin", { fast: true });

  // Sign in → Create account → For my personal use
  circle.setTranscript("");
  const create = $("#create-account");
  talk = sayAsync("s_signin", L.s_signin);
  point(create, "Create account");
  await sleep(500);
  await moveTo(create, fast); await fclick();
  unpoint(); $("#acct-menu").classList.add("on");
  const personal = $("#acct-menu").children[0];
  point(personal, "For my personal use");
  await sleep(700);
  await moveTo(personal, { ...fast, at: "left" }); personal.classList.add("hover"); await fclick();
  await talk;
  $("#acct-menu").classList.remove("on");
  await go("name", { fast: true });

  // Name
  const first = $("#f-first"), last = $("#f-last");
  talk = sayAsync("s_name", L.s_name);
  point(first, "First name");
  await sleep(300);
  await moveTo(first, { ...fast, at: "left" }); await fclick();
  await typeInto(first, "Margaret", { per: 35 });
  unpoint(); point(last, "Last name (optional)");
  await moveTo(last, { ...fast, at: "left" }); await fclick();
  await typeInto(last, "Lee", { per: 50 });
  unpoint(); focusField(null); point($("#name-next"), "Next");
  await moveTo($("#name-next"), fast); await fclick();
  await talk;
  await go("birthday", { fast: true });

  // Birthday
  const month = $("#f-month"), day = $("#f-day"), year = $("#f-year"), gender = $("#f-gender");
  circle.setTranscript("");
  talk = sayAsync("s_bday", L.s_bday);
  point(month, "Month");
  await moveTo(month, { ...fast, at: "left" }); await fclick();
  unpoint();
  await quickPick(month, $("#month-menu"), "March");
  point(day, "Day");
  await moveTo(day, { ...fast, at: "left" }); await fclick(); await typeInto(day, "14", { per: 60 });
  unpoint(); point(year, "Year");
  await moveTo(year, { ...fast, at: "left" }); await fclick(); await typeInto(year, "1948", { per: 55 });
  unpoint(); focusField(null); point(gender, "Gender");
  await moveTo(gender, { ...fast, at: "left" }); await fclick();
  unpoint();
  await quickPick(gender, $("#gender-menu"), "Rather not say");
  point($("#bday-next"), "Next");
  await moveTo($("#bday-next"), fast); await fclick();
  await talk;
  await go("username", { fast: true });

  // Gmail address
  const own = $("#r-own"), user = $("#f-user");
  circle.setTranscript("");
  talk = sayAsync("s_user", L.s_user);
  point(own, "Create your own Gmail address");
  await moveTo(own, { ...fast, at: "left", dx: -14 }); await fclick();
  own.classList.add("on"); user.style.display = "flex"; $("#user-hint").style.display = "block";
  unpoint(); point(user, "Username");
  await moveTo(user, { ...fast, at: "left" }); await fclick();
  await typeInto(user, "margaret.lee.1948", { per: 28 });
  unpoint(); focusField(null); point($("#user-next"), "Next");
  await moveTo($("#user-next"), fast); await fclick();
  await talk;
  await go("done", { fast: true });

  // Done
  await say("s_done", L.s_done);
  await sleep(300);
  mark("end");
}
async function fclick() {
  const m = $("#mouse"), rp = $("#ripple");
  m.classList.add("down"); rp.style.left = mx + 3 + "px"; rp.style.top = my + 3 + "px";
  rp.classList.remove("go"); void rp.offsetWidth; rp.classList.add("go");
  await sleep(70); m.classList.remove("down"); await sleep(90);
}
async function quickPick(field, menu, choice) {
  focusField(field); menu.classList.add("on");
  await sleep(180);
  const item = [...menu.children].find((d) => d.textContent === choice);
  await moveTo(item, { at: "left", ms: 240, tail: 40 }); item.classList.add("hover"); await fclick();
  menu.classList.remove("on"); item.classList.remove("hover");
  field.querySelector(".value").textContent = choice; field.classList.add("filled"); focusField(null);
  await sleep(120);
}

window.ready = (async () => {
  await document.fonts.ready;
  await mountOpenPath();
  placeMouse(1500, 760, 0);
  return true;
})();
window.start = (lines, short) => { (short ? playShort : play)(lines).catch((e) => { window.__error = String(e?.stack || e); }); return true; };
