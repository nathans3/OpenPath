// Puts your own recorded question into the demo video's listening gap.
//   npm run demo-add-voice -- ~/Desktop/my-question.m4a
// Writes demo/video/out/openpath-demo-30s-with-my-voice.mp4.
// Any audio file works (m4a, mp3, wav). Keep the question to about 3 seconds.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const FFMPEG = require("ffmpeg-static");

const rec = process.argv[2];
if (!rec || !fs.existsSync(rec)) { console.error("Give the path to your recording, for example: npm run demo-add-voice -- ~/Desktop/question.m4a"); process.exit(1); }
const OUT = path.join(__dirname, "out");
const base = path.join(OUT, "openpath-demo-30s-your-voice.mp4");
const note = fs.readFileSync(path.join(OUT, "openpath-demo-30s-question-starts-at.txt"), "utf8");
const at = Math.round(parseFloat(note.match(/at ([\d.]+) seconds/)[1]) * 1000);
const out = path.join(OUT, "openpath-demo-30s-with-my-voice.mp4");
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", base, "-i", rec, "-filter_complex",
  `[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5,adelay=${at}|${at}[q];[0:a][q]amix=inputs=2:normalize=0:dropout_transition=0[a]`,
  "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "29.9", out], { stdio: "inherit" });
console.log("Saved", out);
