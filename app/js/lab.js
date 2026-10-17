// Test Lab: realistic practice screens so anyone can try OpenPath against a
// medical portal, a bank, a fake virus pop-up, a prize ad, a scam email and a
// video call. Buttons on each screen either behave like the real thing or
// feed a phrase to the assistant exactly as if the person had said it.
import { native } from "./bridge.js";
import { SCENARIOS, scenarioById, screenState } from "./scenarios.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SCREENS = {
  desktop: () => `
    <div class="lab-desktop">
      <div class="lab-menubar"><span>Finder</span><span>File</span><span>Edit</span><span style="flex:1"></span><span id="lab-clock"></span></div>
      <div class="lab-dock">
        <button class="dock" data-say="open my email">✉️<span>Mail</span></button>
        <button class="dock" data-say="how do I open the internet">🧭<span>Safari</span></button>
        <button class="dock">🖼️<span>Photos</span></button>
        <button class="dock" data-say="I want to video call Maria">👥<span>FamilyCall</span></button>
      </div>
    </div>`,

  portal: () => `
    <div class="lab-browser"><div class="lab-url">🔒 myriverside.health/login</div>
      <div class="lab-page portal">
        <header class="portal-head"><span class="logo">✚ Riverside Health</span><span class="muted">Patient portal</span></header>
        <div class="portal-box">
          <h2>Sign in to MyRiverside</h2>
          <label>Username<input type="text" placeholder="" autocomplete="off"></label>
          <label>Password<span class="pw"><input type="password" placeholder="" autocomplete="off"><button type="button" class="eye" aria-label="Show password">👁</button></span></label>
          <button class="btn-blue" type="button" data-toast="Signed in (practice). The Test Results tab would open next.">Sign In</button>
          <a href="#" class="link" data-toast="Password reset email sent (practice).">Forgot username or password?</a>
          <a href="#" class="link">New user? Create account</a>
        </div>
        <footer class="muted">Questions? Call the clinic at (555) 010-4400</footer>
      </div></div>`,

  bank: () => `
    <div class="lab-browser"><div class="lab-url">🔒 harborcommunitybank.com/accounts</div>
      <div class="lab-page bank">
        <header class="bank-head"><span class="logo">⚓ Harbor Community Bank</span><span>Welcome, Dorothy</span><a href="#" class="signout" data-toast="Signed out (practice).">Sign out</a></header>
        <div class="bank-cards">
          <div class="acct"><div class="n">Everyday Checking ····4471</div><div class="bal">$2,318.40</div><div class="muted">Available balance</div></div>
          <div class="acct"><div class="n">Savings ····9082</div><div class="bal">$11,502.11</div><div class="muted">Available balance</div></div>
        </div>
        <div class="bank-actions">
          <button type="button" data-toast="Transfer screen (practice).">Transfer</button>
          <button type="button" data-toast="Pay bills: Shoprite, City Electric, Verizon (practice).">Pay bills</button>
          <button type="button" data-toast="Statements (practice).">Statements</button>
          <button type="button" data-toast="Deposit check (practice).">Deposit check</button>
        </div>
        <h3>Recent activity</h3>
        <table class="bank-table"><tr><td>Oct 15</td><td>Shoprite</td><td>−$64.22</td></tr><tr><td>Oct 14</td><td>Riverside Pharmacy</td><td>−$18.90</td></tr><tr><td>Oct 12</td><td>City Electric</td><td>−$112.00</td></tr><tr><td>Oct 1</td><td>Social Security deposit</td><td class="pos">+$1,904.00</td></tr></table>
      </div></div>`,

  "scam-popup": () => `
    <div class="lab-browser"><div class="lab-url">⚠ security-alert-0199.win-defender-support.co</div>
      <div class="lab-page recipe">
        <h2>Grandma's Sunday pot roast</h2><p>Preheat the oven to 325°F. Season the chuck roast generously…</p>
        <div class="scam-popup" role="alertdialog">
          <div class="sp-head">🛡 WINDOWS DEFENDER SECURITY ALERT <button class="x" type="button" data-toast="The × does nothing. That is part of the trick.">×</button></div>
          <div class="sp-body">
            <p class="big">Your computer is infected with <b>5 viruses</b>.</p>
            <p>Your bank passwords and photos are being stolen right now. <b>Do not shut down your computer.</b></p>
            <p class="phone">Call Microsoft Certified Support now<br><span>1-888-555-0199</span></p>
            <button class="blink" type="button" data-say="It says my computer has a virus and I should call Microsoft. What do I do?" data-say-es="Dice que mi computadora tiene virus y que llame a Microsoft. ¿Qué hago?" data-say-zh="它说我的电脑中毒了，要我打电话给微软，我该怎么办？">CALL NOW</button>
          </div>
        </div>
      </div></div>`,

  "scam-ad": () => `
    <div class="lab-browser"><div class="lab-url">🔒 dailyledger-news.com/weather</div>
      <div class="lab-page news">
        <h2>Mild week ahead, rain returns Thursday</h2><p>Forecasters expect highs in the low sixties through Wednesday…</p>
        <div class="prize-ad">
          <div class="pa-top">🎉 Congratulations, Dorothy!</div>
          <div class="pa-body">You have been selected for a <b>$1,000 Walmart gift card</b>. Claim within <span class="timer" id="lab-timer">5:00</span>. Pay only <b>$1.95 shipping</b> with your card.</div>
          <button class="pa-btn" type="button" data-say="I won a thousand dollar gift card! How do I claim it?" data-say-es="¡Gané una tarjeta de regalo de mil dólares! ¿Cómo la reclamo?" data-say-zh="我中了一千美元的礼品卡！怎么领取？">CLAIM MY REWARD</button>
        </div>
      </div></div>`,

  email: () => `
    <div class="lab-mail">
      <div class="mail-tools"><button type="button" data-toast="Reply (practice).">Reply</button><button type="button" data-toast="Forward (practice).">Forward</button><button type="button" data-toast="Deleted (practice).">Delete</button></div>
      <div class="mail-split">
        <ul class="mail-list">
          <li data-mail="pharmacy" class="sel"><b>Riverside Pharmacy</b><span>Your prescription is ready for pickup</span><small>9:12 AM</small></li>
          <li data-mail="tommy"><b>Tommy (new number)</b><span>Grandma please don't tell mom…</span><small>8:40 AM</small></li>
          <li data-mail="bank"><b>Harbor Community Bank</b><span>Your monthly statement is available</span><small>Yesterday</small></li>
        </ul>
        <div class="mail-body" id="lab-mail-body"></div>
      </div>
    </div>`,

  videocall: () => `
    <div class="lab-call">
      <div class="call-main">👩🏽 <span>Maria</span></div>
      <div class="call-self" id="lab-self">📷<span>Your video is off</span></div>
      <div class="call-bar">
        <button type="button" id="lab-mute">🎙<span>Mute</span></button>
        <button type="button" id="lab-video">📷̸<span>Start video</span></button>
        <button type="button" class="leave" data-toast="Call ended (practice).">📞<span>Leave</span></button>
      </div>
    </div>`,
};

const MAILS = {
  pharmacy: `<h3>Your prescription is ready for pickup</h3><p class="muted">From Riverside Pharmacy · 9:12 AM</p><p>Hello Dorothy, your prescription for Lisinopril 10 mg is ready at the Main Street pharmacy. Pickup hours are 9 AM to 7 PM.</p>`,
  tommy: `<h3>please help</h3><p class="muted">From Tommy (new number) · tommy.help.2211@mail-fast.ru · 8:40 AM</p><p>Grandma please don't tell mom, I'm in trouble and I need $400 in Google Play gift cards tonight or they won't let me go. Buy them at any store and send me the codes to this email. Please hurry, I love you.</p><p><a href="#" class="link" data-say="My grandson Tommy needs gift cards tonight, how do I buy them?" data-say-es="Mi nieto Tommy necesita tarjetas de regalo esta noche, ¿cómo las compro?" data-say-zh="我孙子汤米今晚需要礼品卡，我怎么买？">How do I buy gift cards?</a></p>`,
  bank: `<h3>Your monthly statement is available</h3><p class="muted">From Harbor Community Bank · Yesterday</p><p>Your September statement is ready. Sign in at harborcommunitybank.com to view it. We will never ask for your password by email.</p>`,
};

export function mountLab(root, { embedded = false } = {}) {
  root.classList.add("lab-root");
  root.innerHTML = `
    <aside class="lab-rail">
      <div class="lab-brand"><span class="orb"></span><div><b>OpenPath</b><small>Test Lab</small></div></div>
      <p class="lab-intro">Pick a practice screen. Then tap the glowing circle and speak, or press <b>Say it for me</b> to hear a typical request.</p>
      <nav class="lab-nav">${SCENARIOS.map((s) => `<button type="button" data-sc="${s.id}" class="${s.risk ? "risky" : ""}">${esc(s.short)}${s.risk ? `<small>scam test</small>` : ""}</button>`).join("")}</nav>
      <div class="lab-say">
        <div class="lbl">Say it for me</div>
        <div class="lab-say-btns" id="lab-say-btns"></div>
      </div>
      <div class="lab-feed"><div class="lbl">What the family sees</div><ul id="lab-feed"></ul></div>
    </aside>
    <main class="lab-stage" id="lab-stage"></main>
    <div class="lab-toast" id="lab-toast" hidden></div>`;

  const stage = root.querySelector("#lab-stage");
  const feed = root.querySelector("#lab-feed");
  const sayBtns = root.querySelector("#lab-say-btns");
  let current = null;

  function show(id) {
    const sc = scenarioById(id); if (!sc) return;
    current = sc;
    root.querySelectorAll("[data-sc]").forEach((b) => b.setAttribute("aria-current", b.dataset.sc === id));
    stage.innerHTML = SCREENS[sc.kind]();
    stage.className = "lab-stage kind-" + sc.kind;
    sayBtns.innerHTML = [["en", "English"], ["es", "Español"], ["zh", "中文"]].map(([l, n]) => `<button type="button" data-say-lang="${l}" title="${esc(sc.say[l])}"><b>${n}</b><span>${esc(sc.say[l])}</span></button>`).join("");
    native.publishScreen(screenState(sc));
    wireStage();
  }

  function say(text, lang) { native.labSay({ text, lang }); }

  function wireStage() {
    stage.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault();
      say(b.dataset.say, "en");
    }));
    stage.querySelectorAll("[data-toast]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); toast(b.dataset.toast); }));
    stage.querySelector(".eye")?.addEventListener("click", (e) => { const i = e.target.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; });
    const clock = stage.querySelector("#lab-clock");
    if (clock) { const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }; tick(); setInterval(tick, 10000); }
    const timer = stage.querySelector("#lab-timer");
    if (timer) { let s = 300; setInterval(() => { s = Math.max(0, s - 1); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 1000); }
    const body = stage.querySelector("#lab-mail-body");
    if (body) {
      const openMail = (k) => { body.innerHTML = MAILS[k]; stage.querySelectorAll(".mail-list li").forEach((li) => li.classList.toggle("sel", li.dataset.mail === k)); body.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); say(b.dataset.say, "en"); })); };
      stage.querySelectorAll(".mail-list li").forEach((li) => li.addEventListener("click", () => openMail(li.dataset.mail)));
      openMail("pharmacy");
    }
    const vid = stage.querySelector("#lab-video");
    if (vid) vid.addEventListener("click", () => { const self = stage.querySelector("#lab-self"); const on = self.classList.toggle("on"); self.innerHTML = on ? "👵🏼<span>You</span>" : "📷<span>Your video is off</span>"; vid.innerHTML = on ? "📷<span>Stop video</span>" : "📷̸<span>Start video</span>"; });
    const mute = stage.querySelector("#lab-mute");
    if (mute) mute.addEventListener("click", () => { const m = mute.classList.toggle("muted"); mute.innerHTML = m ? "🔇<span>Unmute</span>" : "🎙<span>Mute</span>"; });
  }

  root.querySelectorAll("[data-sc]").forEach((b) => b.addEventListener("click", () => show(b.dataset.sc)));
  sayBtns.addEventListener("click", (e) => { const b = e.target.closest("[data-say-lang]"); if (b && current) say(current.say[b.dataset.sayLang], b.dataset.sayLang); });

  native.onEvent((evt) => {
    if (!["lockdown", "caregiver", "redaction"].includes(evt.type)) return;
    const li = document.createElement("li");
    li.className = evt.type;
    li.innerHTML = `<b>${esc(evt.title)}</b><span>${esc(evt.detail || "")}</span>`;
    feed.prepend(li);
    while (feed.children.length > 8) feed.lastChild.remove();
  });

  let toastTimer = null;
  function toast(msg) { const el = root.querySelector("#lab-toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

  show(embedded ? "portal" : "desktop");
  return { show };
}
