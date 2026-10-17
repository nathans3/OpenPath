// ElevenLabs text-to-speech with a local SHA-256 audio cache.
// The same sentence in the same voice and language is only ever billed once.
// When no key is set we return {ok:false, reason:"no_key"} and the renderer
// falls back to the operating system's built-in voices.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const store = require("./store");

const CACHE_DIR = () => path.join(app.getPath("userData"), "cache", "tts");

function keyFor({ text, voiceId, language, style }) {
  return crypto.createHash("sha256").update(`${voiceId}|${language}|${style}|${text}`).digest("hex");
}

async function synthesize({ text, language, style }, settings) {
  const apiKey = (settings.elevenLabsKey || process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) return { ok: false, reason: "no_key" };
  const voiceId = settings.elevenLabsVoiceId || "EXAVITQu4vr4xnSDxMaL";

  const key = keyFor({ text, voiceId, language, style });
  const file = path.join(CACHE_DIR(), key + ".mp3");
  const month = new Date().toISOString().slice(0, 7);
  const used = settings.usage.ttsMonth === month ? settings.usage.ttsCharsMonth || 0 : 0;
  if (!fs.existsSync(file) && used + text.length > (settings.ttsMonthlyCap ?? 40000)) return { ok: false, reason: "cap" };
  if (fs.existsSync(file)) {
    store.bumpUsage({ ttsCacheHits: 1 });
    return { ok: true, cached: true, audio: fs.readFileSync(file).toString("base64"), mime: "audio/mpeg" };
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",   // cheapest multilingual model, low latency
        // Lower stability + a little style = more natural intonation; speaker boost adds presence.
        voice_settings: { stability: 0.42, similarity_boost: 0.8, style: style === "warm" ? 0.45 : 0.2, use_speaker_boost: true },
      }),
    });
    if (res.status === 401) return { ok: false, reason: "bad_key" };
    if (!res.ok) return { ok: false, reason: "error", detail: `ElevenLabs ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(CACHE_DIR(), { recursive: true });
    fs.writeFileSync(file, buf);
    store.bumpUsage({ ttsChars: text.length });
    const u = store.getAll().usage;
    store.patch({ usage: { ttsMonth: month, ttsCharsMonth: (u.ttsMonth === month ? u.ttsCharsMonth || 0 : 0) + text.length } });
    return { ok: true, cached: false, audio: buf.toString("base64"), mime: "audio/mpeg" };
  } catch (err) {
    return { ok: false, reason: "offline", detail: String(err?.message || err) };
  }
}

function cacheStats() {
  try {
    const files = fs.readdirSync(CACHE_DIR()).filter((f) => f.endsWith(".mp3"));
    const bytes = files.reduce((n, f) => n + fs.statSync(path.join(CACHE_DIR(), f)).size, 0);
    return { files: files.length, bytes };
  } catch { return { files: 0, bytes: 0 }; }
}

function clearCache() {
  try { fs.rmSync(CACHE_DIR(), { recursive: true, force: true }); } catch { /* ignore */ }
  return cacheStats();
}

module.exports = { synthesize, cacheStats, clearCache };
