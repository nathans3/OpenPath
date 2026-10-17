// What OpenPath's windows may download.
//
// OpenPath's renderer windows reach the internet for exactly three kinds of
// files, all parts of the app itself: the on-device speech models and voice
// (huggingface.co), the libraries that run them (cdn.jsdelivr.net) and the
// interface fonts (Google Fonts). Each file is downloaded once, saved in this
// computer's OpenPath folder and served from disk from then on. No personal
// data is sent in those requests.
//
// The only other request the windows may make is the caregiver alert, to the
// address the family set up. Everything else is blocked. Questions go to
// Claude from the main process (services/anthropic.js), not from the windows.

const { protocol, net, app } = require("electron");
const { Readable } = require("stream");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APP_PARTS = new Set(["cdn.jsdelivr.net", "huggingface.co", "fonts.googleapis.com", "fonts.gstatic.com"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".bin": "application/octet-stream", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain" };

const root = () => path.join(app.getPath("userData"), "offline");

function fileFor(href) {
  const u = new URL(href);
  let p = decodeURIComponent(u.pathname).replace(/\.\.+/g, ".");
  if (p.endsWith("/")) p += "index";
  if (u.search) p += "__" + crypto.createHash("sha1").update(u.search).digest("hex").slice(0, 12) + (path.extname(p) || (u.host.startsWith("fonts.googleapis") ? ".css" : ""));
  return path.join(root(), u.host, p);
}

function serveFile(file) {
  const type = MIME[path.extname(file)] || "application/octet-stream";
  const stream = Readable.toWeb(fs.createReadStream(file));
  return new Response(stream, { headers: { "content-type": type, "content-length": String(fs.statSync(file).size), "access-control-allow-origin": "*" } });
}

const blocked = (why) => new Response(why, { status: 403, headers: { "content-type": "text/plain", "access-control-allow-origin": "*" } });

function install(getSettings) {
  const handler = async (req) => {
    const u = new URL(req.url);
    if (LOCAL_HOSTS.has(u.hostname)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    if (APP_PARTS.has(u.host) && req.method === "GET") {
      const file = fileFor(req.url);
      if (fs.existsSync(file)) return serveFile(file);
      // First use: save this part of the app on this computer.
      const res = await net.fetch(req.url, { bypassCustomProtocolHandlers: true });
      if (!res.ok) return res;                         // optional files that do not exist
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + ".part", buf);
      fs.renameSync(file + ".part", file);
      return serveFile(file);
    }
    const hook = (getSettings().caregiverWebhook || "").trim();
    if (hook && /^https:\/\//.test(hook) && req.url === hook) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    return blocked("OpenPath windows only download their own parts.");
  };
  protocol.handle("https", handler);
  protocol.handle("http", handler);
}

// How much is saved, for Settings.
function stats() {
  let files = 0, bytes = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (!e.name.endsWith(".part")) { files++; bytes += fs.statSync(f).size; } } };
  try { walk(root()); } catch { /* nothing saved yet */ }
  return { files, bytes };
}

module.exports = { install, stats };
