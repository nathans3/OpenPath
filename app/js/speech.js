// Hearing and speaking.
//
// Listening (only ever starts from a tap on the circle):
//   webspeech — browser speech recognition when the platform ships it (Chrome,
//               Edge). Free, instant, multilingual.
//   local     — Whisper running on this computer via transformers.js. Audio
//               never leaves the machine. Downloads a ~40 MB model once.
//   openai    — Whisper API, only when the person added an OpenAI key and
//               chose it. Audio is sent to OpenAI.
//   typed     — keyboard, always available.
// Every microphone path has an energy-based silence detector so a person who
// pauses to think is not cut off, and one who forgets to stop is.
//
// Speaking (free, on this computer):
//   kokoro — natural English voice that runs inside OpenPath on any computer.
//   system — the computer's own voices, for Spanish, Chinese and Hindi.

import { native, isDesktop } from "./bridge.js";
import { state, saveSettings, logEvent } from "./bus.js";
import { langInfo } from "./i18n.js";

// ---------------- Listening ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let localPipeline = null;
let localLoading = null;

export async function detectSttMode() {
  const pref = state.settings.sttProvider || "auto";
  if (pref === "typed") return "typed";
  if (pref === "openai") return "local";       // cloud listening was removed
  if (pref === "local") return "local";
  // auto: cheapest reliable path per platform
  if (!isDesktop && SR) return "webspeech";
  return "local";
}

// Best quality: Whisper "small", clearly more accurate on older voices and
// accents (a one-time download of a few hundred MB). Lowest cost mode keeps
// the lighter "base" model. Both run on this computer, so both are free.
// With WebGPU (most Macs and recent PCs) they are fast; otherwise a quantized
// build runs on the CPU.
const whisperModel = () => (state.settings?.qualityMode === "low" ? "onnx-community/whisper-base" : "onnx-community/whisper-small");
let localModelId = null;
// Set after the graphics-chip version fails once (for example after the GPU
// resets in a long session); from then on Whisper runs on the main processor.
let whisperCpuOnly = false;

async function loadLocalWhisper(onProgress) {
  const WHISPER_MODEL = whisperModel();
  if (localPipeline && localModelId === WHISPER_MODEL) return localPipeline;
  if (localPipeline) { try { localPipeline.dispose?.(); } catch { /* already gone */ } localPipeline = null; }
  if (localLoading) return localLoading;
  localLoading = (async () => {
    const mod = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js");
    const { pipeline, env } = mod;
    env.allowLocalModels = false;
    const progress_callback = (ev) => { if (ev.status === "progress" && onProgress) onProgress(Math.round(ev.progress || 0)); };
    let p = null;
    if (navigator.gpu && !whisperCpuOnly) {
      try {
        p = await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
          device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback,
        });
        state.sttEngine = `Whisper ${WHISPER_MODEL.split("-").pop()} (GPU)`;
      } catch { p = null; }
    }
    if (!p) {
      p = await pipeline("automatic-speech-recognition", WHISPER_MODEL, { dtype: "q8", progress_callback });
      state.sttEngine = `Whisper ${WHISPER_MODEL.split("-").pop()} (CPU)`;
    }
    localPipeline = p; localModelId = WHISPER_MODEL;
    return p;
  })();
  try { return await localLoading; } finally { localLoading = null; }
}

// Cleans a recording before Whisper hears it: cuts the silence at both ends
// (Whisper invents words in silence) and raises quiet voices to a steady level.
function prepareAudio(pcm, sampleRate) {
  const frame = Math.round(sampleRate * 0.02);
  const energies = [];
  let loud = 0;
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let sum = 0; for (let j = i; j < i + frame; j++) sum += pcm[j] * pcm[j];
    const e = Math.sqrt(sum / frame); energies.push(e); if (e > loud) loud = e;
  }
  const threshold = Math.max(0.006, loud * 0.12);
  let first = energies.findIndex((e) => e > threshold);
  let last = energies.length - 1 - [...energies].reverse().findIndex((e) => e > threshold);
  if (first < 0) return { pcm: new Float32Array(0), seconds: 0 };
  const padFrames = 15;                                   // keep 0.3 s around the speech
  first = Math.max(0, first - padFrames); last = Math.min(energies.length - 1, last + padFrames);
  const out = pcm.slice(first * frame, (last + 1) * frame);
  let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? Math.min(8, 0.9 / peak) : 1;
  if (gain > 1.05) for (let i = 0; i < out.length; i++) out[i] *= gain;
  return { pcm: out, seconds: out.length / sampleRate };
}

// Phrases Whisper is known to "hear" in near-silence or noise.
const HALLUCINATIONS = /^(\s*[\[(].*[\])]\s*|thank you\.?|thanks for watching!?|thank you for watching\.?|you\.?|bye\.?|okay\.?|\.+|subtitles by .*|music|♪+.*)$/i;
function cleanTranscript(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t || HALLUCINATIONS.test(t)) return "";
  return t;
}

export function warmLocalWhisper(onProgress) {
  return loadLocalWhisper(onProgress).catch((e) => { logEvent({ type: "warn", title: "Local Whisper unavailable", detail: String(e?.message || e) }); return null; });
}

// Records from the mic with a silence cutoff and returns {blob, pcm, durationSec}.
function recordWithSilenceCutoff({ silenceMs, maxMs, onLevel, onStart, shouldStop }) {
  return new Promise(async (resolve, reject) => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return reject(Object.assign(new Error("mic_denied"), { cause: e })); }

    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(processor);
    processor.connect(ctx.destination);

    const started = performance.now();
    let spokeAt = 0, lastVoice = 0, noiseFloor = 0.004;
    const buf = new Float32Array(analyser.fftSize);
    onStart && onStart();

    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (rms < noiseFloor * 1.5) noiseFloor = noiseFloor * 0.98 + rms * 0.02;   // adapt to room noise
      const voiced = rms > Math.max(0.012, noiseFloor * 3.5);
      onLevel && onLevel(Math.min(1, rms * 12));
      if (voiced) { if (!spokeAt) spokeAt = now; lastVoice = now; }

      const elapsed = now - started;
      const silentFor = spokeAt ? now - lastVoice : elapsed;
      const stop =
        (shouldStop && shouldStop()) ||
        (spokeAt && silentFor > silenceMs) ||          // finished talking (pause tolerance)
        (!spokeAt && elapsed > 7000) ||                // never spoke
        elapsed > maxMs;                               // forgot to stop
      if (stop) finish(); else requestAnimationFrame(tick);
    };

    const finish = () => {
      processor.disconnect(); src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      const len = chunks.reduce((n, c) => n + c.length, 0);
      const pcm = new Float32Array(len);
      let off = 0; for (const c of chunks) { pcm.set(c, off); off += c.length; }
      resolve({ pcm, sampleRate: 16000, durationSec: len / 16000, spoke: !!spokeAt });
    };
    requestAnimationFrame(tick);
  });
}

function pcmToWavBase64(pcm, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  const bytes = new Uint8Array(buffer);
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Main entry. Resolves {text, mode} or {text:"", mode, reason}.
export async function listen({ onLevel, onStart, onPartial, onStatus, shouldStop }) {
  const lang = langInfo(state.settings.language || "en");
  const silenceMs = state.settings.autoSilenceMs || 2200;
  const maxMs = state.settings.maxListenMs || 20000;
  const mode = await detectSttMode();
  state.sttMode = mode;

  if (mode === "typed") return { text: "", mode, reason: "typed" };

  if (mode === "webspeech") {
    return new Promise((resolve) => {
      const rec = new SR();
      rec.lang = lang.bcp; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 3;
      let finalText = "", timer = null, spoke = false, done = false;
      const stopTimer = () => { if (timer) clearTimeout(timer); };
      const bump = () => { stopTimer(); timer = setTimeout(() => rec.stop(), spoke ? silenceMs : 7000); };
      const hardStop = setTimeout(() => rec.stop(), maxMs);
      const poll = setInterval(() => { if (shouldStop && shouldStop()) rec.stop(); }, 150);
      rec.onstart = () => { onStart && onStart(); bump(); };
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + " "; else interim += r[0].transcript;
        }
        spoke = true; bump();
        onLevel && onLevel(0.6 + Math.random() * 0.4);
        onPartial && onPartial((finalText + interim).trim());
      };
      rec.onerror = (e) => {
        if (done) return; done = true; stopTimer(); clearTimeout(hardStop); clearInterval(poll);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") resolve({ text: "", mode, reason: "mic_denied" });
        else resolve({ text: finalText.trim(), mode, reason: e.error });
      };
      rec.onend = () => { if (done) return; done = true; stopTimer(); clearTimeout(hardStop); clearInterval(poll); const text = cleanTranscript(finalText); resolve({ text, mode, reason: text ? null : "silence" }); };
      try { rec.start(); } catch { done = true; resolve({ text: "", mode, reason: "mic_denied" }); }
    });
  }

  // local or openai: capture PCM first
  let rec;
  try { rec = await recordWithSilenceCutoff({ silenceMs, maxMs, onLevel, onStart, shouldStop }); }
  catch (e) { return { text: "", mode, reason: e.message === "mic_denied" ? "mic_denied" : "error" }; }
  if (!rec.spoke || rec.durationSec < 0.4) return { text: "", mode, reason: "silence" };

  if (mode === "openai") {
    onStatus && onStatus("transcribing");
    const clean = prepareAudio(rec.pcm, rec.sampleRate);
    if (clean.seconds < 0.35) return { text: "", mode, reason: "silence" };
    const res = await native.transcribe({ audioBase64: pcmToWavBase64(clean.pcm, rec.sampleRate), mime: "audio/wav", language: lang.code, durationSec: clean.seconds });
    if (res.ok) { const text = cleanTranscript(res.text); return { text, mode, reason: text ? null : "silence" }; }
    logEvent({ type: "warn", title: "Whisper (cloud) failed", detail: res.reason });
    return { text: "", mode, reason: res.reason };
  }

  // local Whisper
  return transcribeLocal(rec.pcm, rec.sampleRate, lang.code, onStatus);
}

// Turns a recording into words with Whisper on this computer. If the
// graphics-chip version fails (most often the GPU dropped the model in a long
// session), Whisper restarts on the main processor and tries the same
// recording once more.
export async function transcribeLocal(pcm, sampleRate, langCode, onStatus) {
  const mode = "local";
  onStatus && onStatus("transcribing");
  try {
    const p = await loadLocalWhisper((pct) => onStatus && onStatus(`loading model ${pct}%`));
    onStatus && onStatus("transcribing");
    const clean = prepareAudio(pcm, sampleRate);
    if (clean.seconds < 0.35) return { text: "", mode, reason: "silence" };
    const opts = { language: whisperLang(langCode), task: "transcribe", chunk_length_s: 30, stride_length_s: 5 };
    let out;
    try { out = await p(clean.pcm, opts); }
    catch (first) {
      console.error("OpenPath: Whisper failed, retrying on the CPU", first);
      logEvent({ type: "warn", title: "Speech model restarted", detail: String(first?.message || first).slice(0, 160) });
      whisperCpuOnly = true;
      if (localPipeline) { try { localPipeline.dispose?.(); } catch { /* already gone */ } }
      localPipeline = null; localModelId = null;
      const cpu = await loadLocalWhisper((pct) => onStatus && onStatus(`loading model ${pct}%`));
      onStatus && onStatus("transcribing");
      out = await cpu(clean.pcm, opts);
    }
    const text = cleanTranscript(out?.text);
    if (state.settings.usage) state.settings.usage.sttSeconds += Math.round(clean.seconds);
    return { text, mode, reason: text ? null : "silence" };
  } catch (e) {
    console.error("OpenPath: Whisper failed", e);
    logEvent({ type: "warn", title: "Local Whisper failed", detail: String(e?.message || e) });
    return { text: "", mode, reason: "local_failed" };
  }
}

function whisperLang(code) {
  return { en: "english", es: "spanish", zh: "chinese", vi: "vietnamese", ko: "korean", tl: "tagalog", hi: "hindi", ru: "russian" }[code] || "english";
}

// ---------------- Speaking ----------------
// Kokoro neural voice on this computer (free, ~90 MB downloaded once) for
// English, Spanish and Hindi → the operating system's best voice.
let currentAudio = null;
let currentUtterance = null;

let kokoro = null, kokoroLoading = null, kokoroFailed = false;
const kokoroCache = new Map();           // sha256 → object URL, so repeats are instant
const KOKORO_VOICE = { warm: "af_heart", calm: "af_bella", male: "am_michael" };
// Spanish and Hindi use Kokoro's own Spanish and Hindi voices. Kokoro's built-in
// pronunciation guide only knows English, so espeak-ng (free, ~18 MB, runs on
// this computer) turns the words into sounds first. Chinese stays on the
// computer's voice: Kokoro needs a separate Chinese reader for that.
const KOKORO_LANG = {
  es: { espeak: "es-419", voices: { warm: "ef_dora", calm: "ef_dora", male: "em_alex" } },
  hi: { espeak: "hi", voices: { warm: "hf_alpha", calm: "hf_beta", male: "hm_omega" } },
};
let espeakModule = null;
function loadEspeak() {
  if (!espeakModule) {
    espeakModule = import("https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.js")
      .then((m) => m.default)
      .catch((e) => { espeakModule = null; throw e; });
  }
  return espeakModule;
}

async function espeakSounds(sentence, voice) {
  const ESpeakNg = await loadEspeak();
  const e = await ESpeakNg({
    arguments: ["--phonout", "out", '--sep=""', "-q", "-b", "1", "--ipa=3", "-v", voice, "-f", "in.txt"],
    preRun: [(m) => m.FS.writeFile("in.txt", new TextEncoder().encode(sentence))],
    print: () => {}, printErr: () => {},
  });
  return e.FS.readFile("out", { encoding: "utf8" })
    .replace(/\([^)]*\)/g, "")          // drop language-switch marks like (en) (hi)
    .replace(/\u200d/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

// Sentence by sentence, keeping the punctuation so Kokoro pauses naturally.
async function kokoroSounds(text, espeakVoice) {
  const sentences = text.replace(/[।॥]/g, ".").split(/(?<=[.!?…])\s+/).filter((x) => x.trim());
  const out = [];
  for (const raw of sentences) {
    const end = (raw.match(/[.!?…]+$/) || ["."])[0];
    const sounds = await espeakSounds(raw.replace(/[¿¡]/g, ""), espeakVoice);
    if (sounds) out.push(sounds + end);
  }
  return out.join(" ");
}

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Used by checks: build the audio for a sentence without playing it.
export async function kokoroTest(text, langCode) {
  await warmKokoro();
  const other = KOKORO_LANG[langCode];
  const sounds = other ? await kokoroSounds(text, other.espeak) : text;
  const t0 = performance.now();
  const audio = other
    ? await kokoro.generate_from_ids(kokoro.tokenizer(sounds, { truncation: true }).input_ids, { voice: other.voices.warm, speed: 0.95 })
    : await kokoro.generate(text, { voice: KOKORO_VOICE.warm, speed: 0.95 });
  return { sounds, seconds: audio.audio.length / audio.sampling_rate, ms: Math.round(performance.now() - t0) };
}

export function kokoroReady() { return !!kokoro; }
export function kokoroState() { return kokoro ? "ready" : kokoroLoading ? "loading" : kokoroFailed ? "failed" : "idle"; }

export function warmKokoro(onProgress) {
  if (kokoro) return Promise.resolve(kokoro);
  if (kokoroLoading) return kokoroLoading;
  kokoroLoading = (async () => {
    try {
      const { KokoroTTS } = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js");
      const device = navigator.gpu ? "webgpu" : "wasm";
      kokoro = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: device === "webgpu" ? "fp32" : "q8",
        device,
        progress_callback: (ev) => { if (ev.status === "progress" && onProgress) onProgress(Math.round(ev.progress || 0)); },
      });
      state.ttsMode = "kokoro";
      if (KOKORO_LANG[state.settings.language]) loadEspeak().catch(() => {});
      logEvent({ type: "cost", title: "Natural voice ready", detail: `Kokoro runs on this computer (${device}). Spoken answers in English, Spanish and Hindi cost nothing.` });
      return kokoro;
    } catch (e) {
      kokoroFailed = true;
      logEvent({ type: "warn", title: "Natural voice unavailable here", detail: String(e?.message || e).slice(0, 140) });
      return null;
    } finally { kokoroLoading = null; }
  })();
  return kokoroLoading;
}

async function speakKokoro(text, { onStart, onEnd }, langCode = "en") {
  const other = KOKORO_LANG[langCode];
  const style = state.settings.voiceStyle;
  const voice = other ? (other.voices[style] || other.voices.warm) : (KOKORO_VOICE[style] || KOKORO_VOICE.warm);
  const speed = Math.max(0.75, Math.min(1.15, (state.settings.voiceRate || 0.92) + 0.03));
  const key = await sha256(`kokoro|${voice}|${speed.toFixed(2)}|${text}`);
  let url = kokoroCache.get(key);
  if (!url) {
    let audio;
    if (other) {
      const sounds = await kokoroSounds(text, other.espeak);
      if (!sounds) throw new Error("no sounds");
      const { input_ids } = kokoro.tokenizer(sounds, { truncation: true });
      audio = await kokoro.generate_from_ids(input_ids, { voice, speed });
    } else {
      audio = await kokoro.generate(text, { voice, speed });
    }
    url = URL.createObjectURL(audio.toBlob());
    kokoroCache.set(key, url);
  }
  return new Promise((resolve) => {
    const a = new Audio(url);
    currentAudio = a;
    a.onplay = () => onStart && onStart();
    a.onended = () => { currentAudio = null; onEnd && onEnd(); resolve(true); };
    a.onerror = () => { currentAudio = null; onEnd && onEnd(); resolve(false); };
    a.play().catch(() => { onEnd && onEnd(); resolve(false); });
  });
}

export function stopSpeaking() {
  if (currentAudio) { try { currentAudio.pause(); } catch { /* ignore */ } currentAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  currentUtterance = null;
}

// Voice order, all free and on this computer (Mac or Windows):
//   English, Spanish, Hindi: Kokoro, a natural neural voice that runs inside OpenPath.
//   Chinese (or while Kokoro downloads, or if it fails): the computer's best
//   built-in voice (Enhanced / Natural voices preferred).
export async function speak(text, { onStart, onEnd } = {}) {
  stopSpeaking();
  const lang = langInfo(state.settings.language || "en");
  const pref = state.settings.ttsProvider || "auto";
  if ((pref === "auto" || pref === "kokoro") && (lang.code === "en" || KOKORO_LANG[lang.code])) {
    if (!kokoro && !kokoroFailed && !kokoroLoading) warmKokoro();           // start the download for next time
    if (KOKORO_LANG[lang.code]) loadEspeak().catch(() => {});
    if (kokoro) {
      try { state.ttsMode = "kokoro"; return await speakKokoro(text, { onStart, onEnd }, lang.code); }
      catch (e) { logEvent({ type: "warn", title: "Natural voice failed", detail: String(e?.message || e).slice(0, 120) }); }
    }
  }
  state.ttsMode = "system";
  return speakSystem(text, lang, { onStart, onEnd });
}

// Pick the most natural installed voice: premium/enhanced/neural builds first,
// then the warm named voices Apple, Microsoft and Google ship per language,
// never the robotic compact ones.
function pickVoice(bcp) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const base = bcp.split("-")[0];
  const warm = ["Samantha", "Ava", "Allison", "Zoe", "Karen", "Moira", "Serena", "Aria", "Jenny", "Mónica", "Paulina", "Marisol", "Elvira", "Dalia", "Tingting", "Ting-Ting", "Meijia", "Xiaoxiao", "Linh", "HoaiMy", "Yuna", "SunHi", "Lekha", "Swara", "Milena", "Svetlana", "Rosa", "Blessica"];
  const robotic = ["Fred", "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Deranged", "Good News", "Hysterical", "Jester", "Organ", "Trinoids", "Whisper", "Wobble", "Zarvox", "Junior", "Ralph", "Kathy", "Compact", "Eddy", "Flo", "Grandma", "Grandpa", "Reed", "Rocko", "Sandy", "Shelley"];
  const same = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base) && !robotic.some((r) => v.name.includes(r)));
  if (!same.length) return null;
  same.sort((a, b) => score(b) - score(a));
  return same[0];
  function score(v) {
    let s = 0;
    const n = v.name;
    if (/premium/i.test(n)) s += 8;
    if (/enhanced|neural|natural|online/i.test(n)) s += 6;
    if (/siri/i.test(n)) s += 5;
    if (warm.some((p) => n.includes(p))) s += 4;
    if (/google/i.test(n)) s += 3;
    if (v.lang.toLowerCase().replace("_", "-") === bcp.toLowerCase()) s += 2;
    if (v.localService) s += 1;
    return s;
  }
}

// Speak sentence by sentence with a short breath between them; it reads far
// more like a person than one long utterance, and lets "stop" interrupt cleanly.
function splitSentences(text) {
  return text.replace(/\s+/g, " ").match(/[^.!?。！？]+[.!?。！？]+["”’]?|[^.!?。！？]+$/g)?.map((s) => s.trim()).filter(Boolean) || [text];
}

function speakSystem(text, lang, { onStart, onEnd }) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { onEnd && onEnd(); return resolve(false); }
    const voice = pickVoice(lang.bcp);
    const parts = splitSentences(text);
    let i = 0, started = false, cancelled = false;
    const token = {}; currentUtterance = token;
    // Some systems never report the end of speech; finish anyway after a
    // generous estimate so OpenPath is never stuck "speaking".
    const watchdog = setTimeout(() => { if (currentUtterance === token) { cancelled = true; window.speechSynthesis.cancel(); currentUtterance = null; onEnd && onEnd(); resolve(false); } }, 4000 + text.length * 110);
    const next = () => {
      if (currentUtterance !== token) { cancelled = true; }
      if (cancelled || i >= parts.length) { clearTimeout(watchdog); if (currentUtterance === token) currentUtterance = null; onEnd && onEnd(); return resolve(!cancelled); }
      const u = new SpeechSynthesisUtterance(parts[i++]);
      u.lang = lang.bcp;
      u.rate = state.settings.voiceRate || 0.92;
      u.pitch = 1.02;
      u.volume = 1;
      if (voice) u.voice = voice;
      u.onstart = () => { if (!started) { started = true; onStart && onStart(); } };
      u.onend = () => setTimeout(next, i < parts.length ? 260 : 0);     // a natural breath between sentences
      u.onerror = (e) => { if (e.error === "interrupted" || e.error === "canceled") { cancelled = true; } next(); };
      window.speechSynthesis.speak(u);
    };
    next();
  });
}

// Safari/Chrome populate voices asynchronously.
if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }

export async function persistUsage() { try { await saveSettings({ usage: state.settings.usage }); } catch { /* ignore */ } }
