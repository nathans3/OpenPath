// Renders brand SVG/HTML files to PNG with Electron (transparent where the art is).
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
const jobs = JSON.parse(process.argv[process.argv.length - 1]);   // [[input, output, width, height], ...]
app.whenReady().then(async () => {
  for (const [input, output, w, h] of jobs) {
    const win = new BrowserWindow({ width: w, height: h, show: false, transparent: true, frame: false, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
    const src = fs.readFileSync(input, "utf8");
    const html = input.endsWith(".svg")
      ? `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(src).toString("base64")}" style="width:${w}px;height:${h}px;display:block"></body></html>`
      : src;
    await win.loadURL("data:text/html;base64," + Buffer.from(html).toString("base64"));
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise(r => setTimeout(r, 400)))");
    const img = await win.webContents.capturePage();
    fs.writeFileSync(output, (img.getSize().width !== w ? img.resize({ width: w, height: h }) : img).toPNG());
    win.destroy();
  }
  app.exit(0);
});
