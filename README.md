# OpenPath

A floating voice helper for older adults. One glowing circle sits on top of whatever is on the screen. Tap it, say what you are trying to do, and OpenPath answers out loud with one clear step at a time and points at what to click. It answers with Claude, listens and speaks on your computer, speaks English, Spanish, Chinese and Hindi, and refuses to help with scams.

Desktop app for macOS and Windows (Electron). The same interface also runs in a browser as a web preview.

## What it does best: signing up for a Google account

Ask out loud: **"How do I make a Google account?"** OpenPath walks you through Google's real sign-up, on your real screen:

- It recognizes each Google page as it appears: sign-in, "Create account", name, birthday, Gmail address, password, phone check, code, recovery email, review and terms. Google sometimes skips or adds pages, and OpenPath follows whichever one shows.
- It says one step at a time and points at the box or button with a glowing ring.
- After you type, the pointer moves to **Next**. When Google shows the next page, OpenPath gives the next step. If you end up on the wrong page, it tells you how to go back.
- It only tells and points. It never opens, clicks or types anything for you.
- It works in English, Spanish, Chinese and Hindi.

Other built-in guides: Google Docs (new document tab, new document, share), Gmail (write an email), browser tabs, undo, copy and paste, bigger text, volume. Scam protection locks the screen red on fake virus warnings, prize ads and gift-card requests.

## Install and run

**Mac app:** build it once, then double-click `release/mac-arm64/OpenPath.app`.

```bash
npm install
npx electron-builder --mac dir --arm64 --publish never
```

The first time, macOS asks for three permissions. Allow them in System Settings → Privacy & Security:

| Permission | Why |
|---|---|
| Microphone | Hears your question after you tap the circle |
| Screen & System Audio Recording | Reads the screen on this computer to know the page and where to point |
| Accessibility (optional) | Notices your clicks instantly; without it OpenPath watches the screen instead |

**From the code (developers):** `npm install` then `npm start`. `OPENPATH_LAB=1 npm start` also opens the old Test Lab practice screens.

## How it answers

OpenPath answers with Claude.

- Claude Haiku 5.5 answers first. OpenPath checks that the button it names is really on the screen. Claude Sonnet 5.5 answers only when that check fails, up to 300 times a month per user.
- The Google sign-up guide and the other built-in guides answer instantly without calling Claude.
- Add the Claude key once in Settings → Setup. Without a key, only the built-in guides answer.
- Listening (Whisper), the voice (Kokoro, or the computer's own voice for Chinese), reading the screen, pointing and scam protection run on this computer.
- To talk, tap the circle or press **Ctrl+O** from any app. Press it again to stop.

## Privacy and security

- **Where data goes:** only to Claude (api.anthropic.com), and only after passwords, card numbers, codes and other private details are removed, including from earlier questions in the conversation. The app blocks every other connection, both from its windows and from its main process.
- **The microphone** turns on only after a tap or Ctrl+O and stops on its own. Speech is turned into words on the computer and never saved or sent.
- **Screen pictures** go to Claude only with permission, never on bank, health or password pages, and are never saved.
- **What is stored:** settings in `openpath-settings.json`, with the Claude key encrypted by the operating system (Keychain on Mac, DPAPI on Windows), plus downloaded speech models. Conversations and answers stay in memory and disappear when OpenPath quits.
- **Delete all my data** in Settings → Setup removes everything personal from the computer.
- **App hardening:** windows run sandboxed with no Node access, may only use the microphone, cannot open pop-ups or leave the app's own pages, and never receive the Claude key.
- See `electron/services/privacy.js` for the guards.

## Speed

A small always-running helper (`electron/native/ocr-helper.swift`, built on `npm install`) captures and reads the screen with ScreenCaptureKit and Vision, leaving OpenPath's own windows out of the picture.

| Check | Time |
|---|---|
| Notice the page changed | about 0.06 s |
| Recognize which page is showing | about 0.33 s |
| Find the button to point at | about 0.35 s |

## How it is built

```
electron/
  main.js            transparent always-on-top overlay window, Test Lab window, tray, IPC
  preload.js         the only bridge between the UI and Node
  services/
    anthropic.js     Claude via @anthropic-ai/sdk, prompt caching, SHA-256 answer cache
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
    speech.js        listening (browser speech / local Whisper / cloud Whisper) with silence cutoff; speaking (Kokoro for English, Spanish and Hindi; the computer's voice for Chinese)
    circle.js        the floating widget and reply card
    sidebar.js       Voice · Family · Account · Keys · History · Costs
    lab.js           practice screens
    scenarios.js     what each practice screen "shows" to the engine
    i18n.js          languages and interface strings
```

### Guardrails that are always on

- **Screen awareness, titles only:** with no practice screen picked, each question reads the titles of open windows (redacted on the device). No screenshots, nothing in the background.
- **Consent:** the microphone only opens after a deliberate tap or Ctrl+O and closes by itself after a pause (adjustable 1.2–4.5 s) or 20 s. Nothing streams in the background.
- **Redaction before anything leaves the device:** passwords, Social Security numbers, card numbers (Luhn-checked), account numbers, one-time codes, dates of birth and emails are replaced with placeholders. Logged in History so a caregiver can see it happened.
- **Scam interception:** the user's words and the on-screen cues are scored for fake tech support, prizes, gift cards, wire transfers, remote access, government threats, urgency and secrecy. Above the threshold the circle and sidebar lock red, OpenPath refuses, and an alert is logged and optionally POSTed to a caregiver webhook (Zapier, IFTTT, your server).
- **Cost ceilings:** 160 output tokens per answer, SHA-256 caches for both answers and audio, offline workflows for the common tasks, Claude Haiku first, Sonnet only when needed. The Costs tab shows the running estimate.

### Business model (Account tab)

7-day free trial, then **$7.99/month** (OpenPath Family, one plan) plus a one-time **$29** setup. Checkout is simulated in the demo; production uses Stripe. Unit economics are shown in the tab.

## Pointing at what to click

When OpenPath gives a step, a bright ring and an arrow appear on the button to press.

- **Built-in guides** (Google Docs, Gmail, browser, practice screens) know the word to look for, such as "Insert". The Mac's own text recognition finds it on screen. Nothing leaves the computer, and it costs nothing.
- **Any other question** (with a Claude key): Claude looks at a picture of the screen and says where to click, after asking permission once. Pictures are never sent for bank, health or password pages and are never saved.
- Windows: Claude pointing works; the built-in text finder is macOS only for now.

## Cost per user

See the team's cost analysis document. In short, at $7.99 a month an average user costs about $1.04 (87% margin) and a heavy user about $2.23 (72% margin). Card fees are $0.59 of that; the rest is Claude. Voices are free: Kokoro for English, Spanish and Hindi on any computer, and the computer's own voice for Chinese.

Note for the team: the Spanish and Hindi pronunciation step uses espeak-ng, which is GPL-3.0 licensed. OpenPath downloads it at run time instead of bundling it. Check the license before selling a packaged version.

## Notes for the team

- Branch `openpath-demo` has the demo. Open a pull request into `main` when you are happy with it.
- No bundler. Plain ES modules, so you can edit a file and reload.
- Local Whisper uses `@huggingface/transformers` loaded from jsDelivr with the `whisper-tiny` model (about 40 MB, downloaded once). If the download is blocked, OpenPath falls back to typing.
- Browser speech recognition is Chrome/Edge only, which is why the desktop app defaults to local Whisper.
