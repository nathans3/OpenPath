// Records the demo video: plays demo/video/scene.html in a hidden 1920x1080
// window, streams its frames into ffmpeg, then lays each voice clip where the
// scene spoke it. Run: npm run demo-video  (after node demo/video/build-voices.mjs)
//
// Writes demo/video/out/:
//   openpath-demo.mp4            with a voice asking "How do I make a Google account?"
//   openpath-demo-your-voice.mp4 the same, with silence where you add your own question
//   question-starts-at.txt       the second to drop your recording in
const { app, BrowserWindow } = require("electron");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const FFMPEG = require("ffmpeg-static");

const HERE = __dirname, OUT = path.join(HERE, "out"), FPS = 30;
const SHORT = process.env.SHORT === "1";              // the 30-second cut
const NAME = SHORT ? "openpath-demo-30s" : "openpath-demo";
const W = 1920, H = 1080;
const voices = JSON.parse(fs.readFileSync(path.join(OUT, "voices.json"), "utf8"));
const lines = JSON.parse(fs.readFileSync(path.join(OUT, "lines.json"), "utf8"));

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, contextIsolation: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(FPS);
  await win.loadFile(path.join(HERE, "scene.html"));
  await win.webContents.executeJavaScript(`window.VOICE = ${JSON.stringify(voices)}; window.ready`);

  const silent = path.join(OUT, "video-silent.mp4");
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });

  let latest = null;
  win.webContents.on("paint", (_e, _dirty, image) => {
    const s = image.getSize();
    latest = (s.width !== W ? image.resize({ width: W, height: H }) : image).toJPEG(90);
  });
  win.webContents.invalidate();
  while (!latest) await new Promise((r) => setTimeout(r, 20));

  const t0 = Date.now();
  let written = 0, ended = 0;
  const pump = setInterval(() => {
    const due = Math.floor((Date.now() - t0) / (1000 / FPS));
    while (written < due) { ff.stdin.write(latest); written++; }
  }, 1000 / FPS / 2);
  await win.webContents.executeJavaScript(`window.start(${JSON.stringify(lines)}, ${SHORT})`);

  // Wait for the scene's "end" mark, then a short tail.
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const st = await win.webContents.executeJavaScript(`({ marks: window.__marks, err: window.__error || null })`);
    if (st.err) { console.error("scene error:", st.err); break; }
    if (st.marks.some((m) => m.key === "end")) { if (!ended) ended = Date.now(); if (Date.now() - ended > 1200) break; }
  }
  clearInterval(pump);
  const marks = await win.webContents.executeJavaScript("window.__marks");
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
  console.log(`video: ${(written / FPS).toFixed(1)} s, ${marks.length} marks`);

  // Lay the voice clips where the scene spoke them.
  const mix = (withQuestion, file) => {
    const clips = marks.filter((m) => m.key !== "end" && (withQuestion || m.key !== "question"))
      .map((m) => ({ ...m, t: m.key === "question" ? m.t + 450 : m.t }));
    const args = ["-y", "-loglevel", "error", "-i", silent];
    for (const c of clips) args.push("-i", path.join(OUT, "voice", `${c.key}.wav`));
    const parts = clips.map((c, i) => `[${i + 1}:a]aresample=48000,adelay=${c.t}|${c.t}[a${i}]`);
    const filter = `${parts.join(";")};${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[aout]`;
    args.push("-filter_complex", filter, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2", file);
    execFileSync(FFMPEG, args, { stdio: "inherit" });
  };
  mix(true, path.join(OUT, `${NAME}.mp4`));
  mix(false, path.join(OUT, `${NAME}-your-voice.mp4`));
  const q = marks.find((m) => m.key === "question");
  fs.writeFileSync(path.join(OUT, `${NAME}-question-starts-at.txt`),
    `Your question goes at ${((q.t + 450) / 1000).toFixed(1)} seconds, while the circle shows "I'm listening".\nYou have about ${(voices.question + 0.6).toFixed(1)} seconds, the length of "How do I make a Google account?".\n`);
  console.log("done");
  app.exit(0);
});
