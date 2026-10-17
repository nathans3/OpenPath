# OpenPath

A floating voice helper for older adults. One glowing circle sits on top of whatever is on the screen. Tap it, say what you are trying to do, and OpenPath answers out loud with one clear step at a time. It speaks English, Spanish, Chinese and Hindi, knows which windows you have open, refuses to help with scams, and tells a family member when it blocks one.

Desktop app for macOS and Windows (Electron). The same interface also runs in a browser as a web preview.

## Try it in 2 minutes

**Web preview (nothing to install):** open the GitHub Pages link in the repo's About box, or run it yourself:

```bash
npm install
npm run web      # then open http://localhost:5173
```

**Desktop app (the real thing, floats over every app):**

```bash
npm install
npm start
```

The circle appears on the right side of your screen and a **Test Lab** window opens. It starts on **Your real screen**: OpenPath reads the names of the windows you have open each time you ask. Pick a practice screen in the Lab to try a scenario. On macOS, allow the microphone the first time you tap the circle, and allow **Screen Recording** so OpenPath can read window names (no screenshots are taken).

**Installer:** `npm run dist:mac` or `npm run dist:win` writes a .dmg / .exe into `release/`.

## Demo walk-through

1. In the Test Lab, click **Medical portal**. Tap the circle and say *"How do I log in?"* (or press **Say it for me**). OpenPath points at the Username field, waits for you, and continues step by step when you say *"done"*.
2. Click **Bank**. Ask *"How much money do I have in checking?"* It reads the balance off the screen.
3. Click **Fake virus pop-up**, then press **CALL NOW** or say *"It says I should call Microsoft."* The circle and sidebar lock red, OpenPath refuses, and a caregiver alert appears in the sidebar and in the Lab's family feed.
4. Click **Gift card prize ad** and **Email inbox** for the other two scam patterns (fake prize with a "shipping fee", grandchild-in-trouble asking for gift card codes).
5. Press the **Español**, **中文** or **हिन्दी** "Say it for me" button on any screen. OpenPath switches language, listens, and answers in that language. All four languages have full built-in guides and scam warnings.
6. Open the sidebar (☰ on the reply card) to change voice speed, pause tolerance, the caregiver, keys, and to see history and costs.

Everything above works with **no API keys and no internet**: built-in workflows answer, and the operating system's voices speak.

## Add keys for the full experience

Sidebar → **Keys**:

| Key | What it unlocks | Without it |
|---|---|---|
| Anthropic | Claude Haiku 5.5 answers any question using the screen context | Built-in workflows only (login, bills, camera, text size, etc.) |
| ElevenLabs | Warm multilingual voice (Flash v2.5) | System voices |
| OpenAI (optional) | Whisper cloud transcription | Whisper runs on the device (desktop) or browser speech (web) |

Keys are stored on this computer only (Electron userData folder, or browser storage in the web build).

## How it is built

```
electron/
  main.js            transparent always-on-top overlay window, Test Lab window, tray, IPC
  preload.js         the only bridge between the UI and Node
  services/
    anthropic.js     Claude via @anthropic-ai/sdk, prompt caching, SHA-256 answer cache
    tts.js           ElevenLabs with SHA-256 audio cache on disk
    stt.js           Whisper cloud (opt-in)
    store.js         settings JSON
app/
  overlay.html       circle + sidebar (desktop)
  lab.html           Test Lab (desktop)
  index.html         web preview: Lab as the "desktop", overlay on top
  js/
    bridge.js        same API in Electron and in the browser
    engine.js        request pipeline: redact → scam guardrail → workflow library → Claude → fallback
    guardrails.js    redaction (passwords, SSN, cards, accounts, codes) and scam scoring
    knowledge.js     built-in step-by-step workflows in English, Spanish, Chinese, Hindi
    speech.js        listening (browser speech / local Whisper / cloud Whisper) with silence cutoff; speaking (ElevenLabs / system)
    circle.js        the floating widget and reply card
    sidebar.js       Voice · Family · Account · Keys · History · Costs
    lab.js           practice screens
    scenarios.js     what each practice screen "shows" to the engine
    i18n.js          languages and interface strings
```

### Guardrails that are always on

- **Screen awareness, titles only:** with no practice screen picked, each question reads the titles of open windows (redacted on the device). No screenshots, nothing in the background.
- **Consent:** the microphone only opens after a deliberate tap and closes by itself after a pause (adjustable 1.2–4.5 s) or 20 s. Nothing streams in the background.
- **Redaction before anything leaves the device:** passwords, Social Security numbers, card numbers (Luhn-checked), account numbers, one-time codes, dates of birth and emails are replaced with placeholders. Logged in History so a caregiver can see it happened.
- **Scam interception:** the user's words and the on-screen cues are scored for fake tech support, prizes, gift cards, wire transfers, remote access, government threats, urgency and secrecy. Above the threshold the circle and sidebar lock red, OpenPath refuses, and an alert is logged and optionally POSTed to a caregiver webhook (Zapier, IFTTT, your server).
- **Cost ceilings:** 160 output tokens per answer, SHA-256 caches for both answers and audio, offline workflows for the common tasks, Haiku and ElevenLabs Flash by default. The Costs tab shows the running estimate.

### Business model (Account tab)

7-day free trial, then **$15/month** (OpenPath Family) plus a one-time **$29** setup. Checkout is simulated in the demo; production uses Stripe. Unit economics are shown in the tab.

## Pointing at what to click

When OpenPath gives a step, a bright ring and an arrow appear on the button to press.

- **Built-in guides** (Google Docs, Gmail, browser, practice screens) know the word to look for, such as "Insert". The Mac's own text recognition finds it on screen. Nothing leaves the computer, and it costs nothing.
- **Any other question** (with a Claude key): Claude looks at a picture of the screen and says where to click, after asking permission once. Pictures are never sent for bank, health or password pages and are never saved.
- Windows: Claude pointing works; the built-in text finder is macOS only for now.

## Cost per user

See the team's cost analysis document. In short: about $0.90 a month for an English speaker and about $3.30 for other languages on an average month, against $15. ElevenLabs is the only large cost, so it comes after the free English voice and the pre-recorded guide voice, and it has a monthly cap.

```bash
ELEVENLABS_API_KEY=... npm run voice-pack   # records every built-in sentence once (~$1.13)
```

## Notes for the team

- Branch `openpath-demo` has the demo. Open a pull request into `main` when you are happy with it.
- No bundler. Plain ES modules, so you can edit a file and reload.
- Local Whisper uses `@huggingface/transformers` loaded from jsDelivr with the `whisper-tiny` model (about 40 MB, downloaded once). If the download is blocked, OpenPath falls back to typing.
- Browser speech recognition is Chrome/Edge only, which is why the desktop app defaults to local Whisper.
