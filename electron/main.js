// OpenPath — Electron main process.
// Creates a transparent, click-through overlay that covers the primary display
// (so the floating circle and sidebar sit above every other app), plus a
// normal "Test Lab" window that shows realistic practice screens.

const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, desktopCapturer, systemPreferences, globalShortcut } = require("electron");
const path = require("path");

// Teammates can put ANTHROPIC_API_KEY=... (and OPENAI_API_KEY)
// in a .env file next to package.json. It is git-ignored, never committed.
(function loadDotEnv() {
  try {
    const text = require("fs").readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env file */ }
})();

const store = require("./services/store");
const privacy = require("./services/privacy");
const anthropic = require("./services/anthropic");
const vision = require("./services/vision");
const follow = require("./services/follow");
const offline = require("./services/offline");
const stt = require("./services/stt");

let overlay = null;
let lab = null;
let tray = null;

// ---------- Overlay window (circle + sidebar) ----------
function createOverlay() {
  // The overlay covers the whole primary display (menu bar included) so the
  // pointer can reach anything, and stays click-through except over the
  // circle, card and sidebar.
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlay = new BrowserWindow({
    x, y, width, height,
    // A non-activating panel on macOS: clicking the circle or the card does
    // not take focus away from the app the person is using, so an open menu
    // in that app stays open while they press "I did it".
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    enableLargerThanScreen: true,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Float above full-screen apps and follow the user across Spaces.
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Visible in screen recordings and screen sharing by default (so a demo or a
  // family member helping over a video call can see it). OpenPath's own text
  // reader ignores the circle, box and pointer by their position instead.
  overlay.setContentProtection(store.getAll().hideFromRecordings === true);
  overlay.setBounds(display.bounds);

  // Start click-through; the renderer tells us when the cursor is over
  // something interactive (the circle, the sidebar, a card) and we toggle.
  overlay.setIgnoreMouseEvents(true, { forward: true });

  overlay.loadFile(path.join(__dirname, "..", "app", "overlay.html"));
  overlay.on("closed", () => { overlay = null; });

  // Keep the overlay matched to the display if resolution or dock changes.
  screen.on("display-metrics-changed", () => {
    if (!overlay) return;
    overlay.setBounds(screen.getPrimaryDisplay().bounds);
  });
}

// ---------- Test Lab window ----------
function createLab() {
  if (lab) { lab.focus(); return; }
  lab = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: "OpenPath Test Lab",
    backgroundColor: "#f3f4f6",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  lab.loadFile(path.join(__dirname, "..", "app", "lab.html"));
  lab.on("closed", () => {
    lab = null;
    if (overlay) overlay.webContents.send("lab:screen", null);
  });
}

// ---------- Tray ----------
function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVQ4T2NkoBAwUqifgYEBoYGBgeE/IyMjA4YBKAaQ5AJkQ0h2AbIBWF2ArIElLkAzgGSXoBlAoguQDYCFAbILkA3AFgYwQ8hyAaoBZLsA1QCKwoAcAwDnGgwRjTwVbQAAAABJRU5ErkJggg=="
  );
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("OpenPath");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Test Lab", click: createLab },
    { label: "Show / hide OpenPath", click: () => {
        if (!overlay) return;
        overlay.isVisible() ? overlay.hide() : overlay.show();
      } },
    { type: "separator" },
    { label: "Quit OpenPath", click: () => app.quit() },
  ]));
}

// ---------- IPC ----------
ipcMain.on("overlay:interactive", (_e, interactive) => {
  if (!overlay) return;
  if (interactive) overlay.setIgnoreMouseEvents(false);
  else overlay.setIgnoreMouseEvents(true, { forward: true });
});

// The Claude key never goes back to the windows: they only learn whether
// one is saved.
const forWindows = (s) => ({ ...s, anthropicKey: "", hasAnthropicKey: anthropic.available(s) });
ipcMain.handle("settings:get", () => forWindows(store.getAll()));
ipcMain.handle("settings:set", (_e, patch) => {
  patch = { ...(patch || {}) };
  if (patch.forgetKey) { patch.anthropicKey = ""; }
  else if (!patch.anthropicKey) delete patch.anthropicKey;     // an empty box keeps the saved key
  delete patch.forgetKey; delete patch.hasAnthropicKey;
  const next = store.patch(patch);
  if ("hideFromRecordings" in patch && overlay) overlay.setContentProtection(next.hideFromRecordings === true);
  return forWindows(next);
});
ipcMain.handle("privacy:deleteAll", async () => {
  await privacy.deleteAllData();
  app.relaunch(); app.exit(0);
  return true;
});

ipcMain.handle("ai:instruct", (_e, payload) => anthropic.instruct(payload, store.getAll()));
ipcMain.handle("ai:point", (_e, payload) => anthropic.point(payload, store.getAll()));
ipcMain.handle("ai:available", () => anthropic.available(store.getAll()));
ipcMain.handle("screen:locate", (_e, { labels, near, exclude }) => vision.locate(labels, near, exclude));
ipcMain.handle("screen:findAll", (_e, { labels, exclude }) => vision.findAll(labels, exclude));
ipcMain.handle("screen:browser", () => vision.browserParts());
ipcMain.handle("screen:url", () => vision.browserUrl());
ipcMain.handle("screen:read", (_e, rect, opts) => vision.readRegion(rect, [], opts || {}));
ipcMain.handle("follow:watch", (e, target) => follow.watch(e.sender, target));
ipcMain.handle("follow:stop", () => { follow.stop(); return true; });
ipcMain.handle("follow:status", () => follow.status());
ipcMain.handle("offline:stats", () => offline.stats());
ipcMain.handle("follow:permission", () => follow.requestPermission());
ipcMain.handle("stt:transcribe", (_e, payload) => stt.transcribe(payload, store.getAll()));

ipcMain.handle("lab:open", () => { createLab(); return true; });
ipcMain.on("lab:screen", (_e, screenState) => {
  if (overlay) overlay.webContents.send("lab:screen", screenState);
});
ipcMain.on("lab:say", (_e, text) => {
  if (overlay) overlay.webContents.send("lab:say", text);
});
ipcMain.on("overlay:event", (_e, evt) => {
  // Caregiver alerts and lockdowns are mirrored to the Lab so testers see them.
  if (lab) lab.webContents.send("overlay:event", evt);
});

// Real screen awareness: the titles of the windows that are open right now.
// Titles only. No screenshots are taken and nothing is captured in the
// background; this runs once per question, after the person taps the circle.
ipcMain.handle("screen:context", async () => {
  try {
    const status = process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "granted";
    // On macOS the first getSources call is what makes the OS offer the
    // Screen Recording permission, so we call it even when not yet granted.
    const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    const windows = sources.map((s) => (s.name || "").trim())
      .filter((n) => n && n !== "OpenPath" && n !== "OpenPath Test Lab" && !/^(Window Server|Dock|Menubar|Notification Center|Control Center|Spotlight|Wallpaper)$/i.test(n));
    if (status !== "granted" && windows.length === 0) return { ok: false, reason: "permission", status };
    return { ok: true, windows: [...new Set(windows)].slice(0, 12), status };
  } catch (err) {
    return { ok: false, reason: "error", detail: String(err?.message || err) };
  }
});
ipcMain.handle("app:info", () => ({
  platform: process.platform,
  version: app.getVersion(),
  userData: app.getPath("userData"),
}));

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  privacy.guardMainNetwork();
  privacy.lockDownWindows();
  privacy.emptyTempDir();
  if (process.platform === "darwin") app.dock?.hide();
  offline.install(() => store.getAll());
  createOverlay();
  createTray();
  console.info("[openpath] click and Enter tracking: " + (follow.status().clicks ? "on" : "needs the Accessibility permission"));
  // Ctrl+O from any app: start listening (press again to stop). This is the
  // only way OpenPath starts listening besides tapping the circle; the
  // microphone is never on in the background.
  const HOTKEY = "Control+O";
  if (!globalShortcut.register(HOTKEY, () => { if (overlay) overlay.webContents.send("hotkey:talk"); })) {
    console.warn(`OpenPath: ${HOTKEY} is already used by another app`);
  }
  // The Test Lab opens only when asked (tray menu, Settings, or OPENPATH_LAB=1).
  if (process.env.OPENPATH_LAB === "1") createLab();
});

app.on("will-quit", () => { globalShortcut.unregisterAll(); vision.cleanup(); follow.shutdown(); privacy.emptyTempDir(); });

app.on("window-all-closed", () => {
  // Keep running in the tray like a background utility.
});

app.on("activate", () => {
  if (!overlay) createOverlay();
});
