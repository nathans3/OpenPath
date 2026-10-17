// Privacy and security guards for the whole app.
//
// What OpenPath may send, and where:
//   - Questions (with private details removed) and, with permission, a
//     picture of the screen go to Claude at api.anthropic.com. Nothing else
//     in the main process may reach the internet: see guardMainNetwork().
//   - OpenPath's windows may only download the app's own parts (speech models,
//     libraries, fonts) and send the caregiver alert: see services/offline.js.
//
// What OpenPath keeps on this computer:
//   - Settings (language, voice, caregiver contact, usage counts) in
//     openpath-settings.json. The Claude key in it is encrypted by the
//     operating system (macOS Keychain, Windows DPAPI): see services/store.js.
//   - Downloaded app parts in the "offline" folder. No personal data.
//   - Nothing else. Conversations live in memory and vanish when OpenPath
//     quits. Screen pictures are read in memory; the rare fallback that needs
//     a file writes it to a private folder, deletes it right after, and the
//     folder is emptied at every start and quit.

const { app, session } = require("electron");
const fs = require("fs");
const path = require("path");

const ALLOWED_MAIN_HOSTS = new Set(["api.anthropic.com"]);

function hostOf(input) {
  try { return new URL(typeof input === "string" ? input : input.url || String(input)).host; } catch { return ""; }
}

// The main process (where Claude is called) may only talk to Anthropic.
function guardMainNetwork() {
  const realFetch = globalThis.fetch;
  if (!realFetch || realFetch.__openpathGuarded) return;
  const guarded = (input, init) => {
    const host = hostOf(input);
    if (!ALLOWED_MAIN_HOSTS.has(host)) {
      console.warn(`OpenPath blocked a connection to ${host || "an unknown address"}`);
      return Promise.reject(new Error(`blocked: ${host}`));
    }
    return realFetch(input, init);
  };
  guarded.__openpathGuarded = true;
  globalThis.fetch = guarded;
}
const guardedFetch = (input, init) => globalThis.fetch(input, init);

// OpenPath's windows: microphone only, no pop-ups, no leaving the app's own
// pages, no live connections to other servers.
function lockDownWindows() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const audioOnly = permission === "media" && (details.mediaTypes || []).every((t) => t === "audio");
    callback(audioOnly);
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === "media");
  ses.webRequest.onBeforeRequest({ urls: ["ws://*/*", "wss://*/*"] }, (_d, cb) => cb({ cancel: true }));

  app.on("web-contents-created", (_e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) e.preventDefault(); });
    wc.on("will-attach-webview", (e) => e.preventDefault());
  });
}

// A private folder for the rare screen-reading fallback that needs a file.
function tempDir() {
  const dir = path.join(app.getPath("userData"), "tmp");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
function emptyTempDir() {
  try { fs.rmSync(path.join(app.getPath("userData"), "tmp"), { recursive: true, force: true }); } catch { /* nothing to remove */ }
}

// "Delete all my data": settings, the encrypted key, caregiver contact, usage
// counts, browser storage and temporary files. Downloaded speech models stay,
// because they hold no personal data and are large to download again.
async function deleteAllData() {
  const ud = app.getPath("userData");
  for (const name of ["openpath-settings.json", "tmp", "cache"]) {
    try { fs.rmSync(path.join(ud, name), { recursive: true, force: true }); } catch { /* already gone */ }
  }
  try {
    await session.defaultSession.clearStorageData({ storages: ["localstorage", "indexdb", "websql", "serviceworkers", "cookies"] });
  } catch { /* best effort */ }
  return true;
}

module.exports = { guardMainNetwork, guardedFetch, lockDownWindows, tempDir, emptyTempDir, deleteAllData, ALLOWED_MAIN_HOSTS };
