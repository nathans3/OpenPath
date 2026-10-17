// OpenPath — Electron main process.
// Creates a transparent, click-through overlay that covers the primary display
// (so the floating circle and sidebar sit above every other app), plus a
// normal "Test Lab" window that shows realistic practice screens.

const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, desktopCapturer, systemPreferences } = require("electron");
const path = require("path");

const store = require("./services/store");
const anthropic = require("./services/anthropic");
const tts = require("./services/tts");
const stt = require("./services/stt");

let overlay = null;
let lab = null;
let tray = null;

// ---------- Overlay window (circle + sidebar) ----------
function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  overlay = new BrowserWindow({
    x, y, width, height,
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
      sandbox: false,
    },
  });

  // Float above full-screen apps and follow the user across Spaces.
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Start click-through; the renderer tells us when the cursor is over
  // something interactive (the circle, the sidebar, a card) and we toggle.
  overlay.setIgnoreMouseEvents(true, { forward: true });

  overlay.loadFile(path.join(__dirname, "..", "app", "overlay.html"));
  overlay.on("closed", () => { overlay = null; });

  // Keep the overlay matched to the display if resolution or dock changes.
  screen.on("display-metrics-changed", () => {
    if (!overlay) return;
    const wa = screen.getPrimaryDisplay().workArea;
    overlay.setBounds(wa);
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
      sandbox: false,
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

ipcMain.handle("settings:get", () => store.getAll());
ipcMain.handle("settings:set", (_e, patch) => store.patch(patch));

ipcMain.handle("ai:instruct", (_e, payload) => anthropic.instruct(payload, store.getAll()));
ipcMain.handle("tts:speak", (_e, payload) => tts.synthesize(payload, store.getAll()));
ipcMain.handle("tts:cacheStats", () => tts.cacheStats());
ipcMain.handle("tts:clearCache", () => tts.clearCache());
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
ipcMain.handle("app:openExternal", (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
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
ipcMain.handle("screen:permission", () => {
  if (process.platform === "darwin") shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
  return true;
});
ipcMain.handle("app:info", () => ({
  platform: process.platform,
  version: app.getVersion(),
  userData: app.getPath("userData"),
}));

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.hide();
  createOverlay();
  createTray();
  createLab();
});

app.on("window-all-closed", () => {
  // Keep running in the tray like a background utility.
});

app.on("activate", () => {
  if (!overlay) createOverlay();
});
