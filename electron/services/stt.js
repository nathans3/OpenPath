// Listening always happens on this computer (Whisper inside OpenPath's
// window). There is no cloud speech-to-text, so the voice never leaves the
// computer. This stub stays so older settings that asked for cloud Whisper
// fall back to listening on the computer.

async function transcribe() {
  return { ok: false, reason: "local_only" };
}

module.exports = { transcribe };
