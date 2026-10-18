// Makes the spoken lines for the demo video with Kokoro, the same voice
// OpenPath uses (af_heart at the app's speed). The words come straight from
// the app's guide (app/js/guides.js), so the video says what the app says.
// Output: demo/video/out/voice/<key>.wav, voices.json (seconds), lines.json.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { KokoroTTS } from "kokoro-js";
import { GUIDES } from "../../app/js/guides.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "out", "voice");
fs.mkdirSync(out, { recursive: true });

const g = GUIDES.google_signup;
const page = (id) => g.pages.find((p) => p.id === id);
const cue = (id, i) => page(id).target.steps[i].cue.en;
const L = {
  google_home: page("google_home").text.en,
  signin: page("signin").text.en,
  account_type: page("account_type").text.en,
  name: page("name").text.en,
  "name.1": cue("name", 1),
  next: "Good. Now click Next.",
  birthday: page("birthday").text.en,
  "birthday.1": cue("birthday", 1),
  "birthday.2": cue("birthday", 2),
  "birthday.3": cue("birthday", 3),
  username: page("username").text.en,
  "username.1": cue("username", 1),
  "username.2": cue("username", 2),
  password: page("password").text.en,
  "password.1": cue("password", 1),
  review: page("review").text.en,
  terms: page("terms").text.en,
  done: page("done").text.en,
};
const QUESTION = "How do I make a Google account?";
// The 30-second cut uses shortened versions of the same steps.
const SHORT = {
  s_home: "This is Google. Click the blue Sign in button at the top right.",
  s_signin: "Click Create account, then For my personal use.",
  s_name: "Click the First name box and type your name.",
  s_bday: "Now pick your birth month, then type the day and year.",
  s_user: "Now type the email name you want.",
  s_done: "Your Google account is ready.",
};
Object.assign(L, SHORT);

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
const secs = {};
for (const [key, text] of [...Object.entries(L), ["question", QUESTION]]) {
  const voice = key === "question" ? "af_sarah" : "af_heart";
  const audio = await tts.generate(text, { voice, speed: key === "question" ? 0.95 : key.startsWith("s_") ? 1.05 : 0.95 });
  await audio.save(path.join(out, `${key}.wav`));
  secs[key] = +(audio.audio.length / audio.sampling_rate).toFixed(2);
  console.log(key.padEnd(12), secs[key] + "s", text.slice(0, 60));
}
fs.writeFileSync(path.join(here, "out", "voices.json"), JSON.stringify(secs, null, 2));
fs.writeFileSync(path.join(here, "out", "lines.json"), JSON.stringify(L, null, 2));
