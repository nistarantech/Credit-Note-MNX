// Desktop shell: a Chromium window (Electron) around the static Next.js export.
// Pages are served from out/ over a private app:// protocol, so there is no
// server, no port and no browser involved. Data lives in this window's
// localStorage, which Electron keeps in the app's user-data folder.
const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const OUT = path.join(__dirname, "..", "out");
const DEV_URL = process.env.ELECTRON_START_URL; // e.g. http://localhost:3210 while developing

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function fileFor(urlPath) {
  let file = path.normalize(path.join(OUT, decodeURIComponent(urlPath)));
  if (!file.startsWith(OUT)) return path.join(OUT, "404.html");
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  else if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
  return fs.existsSync(file) ? file : path.join(OUT, "404.html");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Credit Note",
    backgroundColor: "#1c1c1c",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Links to other sites open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(DEV_URL ?? "app://local/");
}

app.setName("Credit Note");

app.whenReady().then(() => {
  protocol.handle("app", (req) => net.fetch(pathToFileURL(fileFor(new URL(req.url).pathname)).toString()));

  ipcMain.handle("save-pdf", async (event, fileName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath("documents"), fileName),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return null;
    const pdf = await event.sender.printToPDF({ pageSize: "A4", printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return filePath;
  });

  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
