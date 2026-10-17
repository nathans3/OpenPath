// Whisper speech-to-text through the OpenAI audio API.
// Audio only leaves the machine when the user has added an OpenAI key and
// picked the "Whisper (cloud)" option; by default OpenPath transcribes on
// the device with a local Whisper model inside the renderer.

const store = require("./store");

async function transcribe({ audioBase64, mime, language, durationSec }, settings) {
  if (settings.localOnly !== false) return { ok: false, reason: "local_only" };   // nothing leaves this computer
  const apiKey = (settings.openaiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return { ok: false, reason: "no_key" };

  try {
    const bytes = Buffer.from(audioBase64, "base64");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime || "audio/webm" }), "speech.webm");
    form.append("model", "whisper-1");
    if (language && language !== "auto") form.append("language", language);
    form.append("response_format", "json");
    form.append("temperature", "0");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (res.status === 401) return { ok: false, reason: "bad_key" };
    if (!res.ok) return { ok: false, reason: "error", detail: `Whisper ${res.status}` };
    const data = await res.json();
    store.bumpUsage({ sttSeconds: Math.round(durationSec || 0) });
    return { ok: true, text: (data.text || "").trim() };
  } catch (err) {
    return { ok: false, reason: "offline", detail: String(err?.message || err) };
  }
}

module.exports = { transcribe };
