// Exposes a small, explicit bridge to the renderer. The renderer never gets
// Node access; every privileged action goes through one of these calls.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openpathNative", {
  platform: "electron",

  setInteractive: (on) => ipcRenderer.send("overlay:interactive", !!on),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),

  instruct: (payload) => ipcRenderer.invoke("ai:instruct", payload),
  point: (payload) => ipcRenderer.invoke("ai:point", payload),
  aiAvailable: () => ipcRenderer.invoke("ai:available"),
  locate: (labels, near, exclude) => ipcRenderer.invoke("screen:locate", { labels, near, exclude }),
  findAll: (labels, exclude) => ipcRenderer.invoke("screen:findAll", { labels, exclude }),
  watchTarget: (target) => ipcRenderer.invoke("follow:watch", target),
  stopWatch: () => ipcRenderer.invoke("follow:stop"),
  followStatus: () => ipcRenderer.invoke("follow:status"),
  offlineStats: () => ipcRenderer.invoke("offline:stats"),
  requestClickPermission: () => ipcRenderer.invoke("follow:permission"),
  onFollow: (cb) => ipcRenderer.on("follow:advance", (_e, evt) => cb(evt)),
  speak: (payload) => ipcRenderer.invoke("tts:speak", payload),
  ttsCacheStats: () => ipcRenderer.invoke("tts:cacheStats"),
  ttsClearCache: () => ipcRenderer.invoke("tts:clearCache"),
  transcribe: (payload) => ipcRenderer.invoke("stt:transcribe", payload),

  openLab: () => ipcRenderer.invoke("lab:open"),
  publishScreen: (state) => ipcRenderer.send("lab:screen", state),
  labSay: (text) => ipcRenderer.send("lab:say", text),
  publishEvent: (evt) => ipcRenderer.send("overlay:event", evt),
  screenContext: () => ipcRenderer.invoke("screen:context"),
  info: () => ipcRenderer.invoke("app:info"),

  onScreen: (cb) => ipcRenderer.on("lab:screen", (_e, s) => cb(s)),
  onLabSay: (cb) => ipcRenderer.on("lab:say", (_e, t) => cb(t)),
  onEvent: (cb) => ipcRenderer.on("overlay:event", (_e, evt) => cb(evt)),
});
