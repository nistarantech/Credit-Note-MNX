// Desktop shell: a Chromium window (Electron) around the static Next.js export.
// Pages are served from out/ over a private app:// protocol, so there is no
// server, no port and no browser involved. Data lives in a SQLite database in
// the user-data folder (see db.cjs); imported Excel files are kept next to it,
// filed by brand and month.
const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const database = require("./db.cjs");

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

const dataDir = () => path.join(app.getPath("userData"), "data");
let db;

const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "-").trim() || "untitled";

app.whenReady().then(() => {
  fs.mkdirSync(dataDir(), { recursive: true });
  db = database.open(path.join(dataDir(), "cn-claims.db"));

  ipcMain.handle("db:load", () => db.load());
  ipcMain.handle("db:apply", (_e, ops) => db.apply(ops));
  ipcMain.handle("db:info", () => ({ dir: dataDir(), file: path.join(dataDir(), "cn-claims.db") }));
  ipcMain.handle("db:open-folder", () => shell.openPath(dataDir()));

  // A copy of every imported Excel file: data/imports/<brand>/<YYYY-MM>/<file>
  ipcMain.handle("files:store-import", (_e, { brand, months, fileName, bytes }) => {
    const paths = {};
    for (const month of months) {
      const dir = path.join(dataDir(), "imports", safe(brand), month);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, safe(fileName));
      fs.writeFileSync(file, Buffer.from(bytes));
      paths[month] = file;
    }
    return paths;
  });
  ipcMain.handle("files:show", (_e, file) => shell.showItemInFolder(file));

  ipcMain.handle("db:backup", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath("documents"), `cn-claims-${stamp}.db`),
      filters: [{ name: "SQLite database", extensions: ["db"] }],
    });
    if (canceled || !filePath) return null;
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
    db.backup(filePath);
    return filePath;
  });

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

app.on("will-quit", () => db?.close());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
