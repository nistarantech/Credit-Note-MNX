// The bridge between the page and the desktop: the SQLite database, stored
// import files, and saving the current page as PDF.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  savePdf: (fileName) => ipcRenderer.invoke("save-pdf", fileName),
  db: {
    load: () => ipcRenderer.invoke("db:load"),
    apply: (ops) => ipcRenderer.invoke("db:apply", ops),
    info: () => ipcRenderer.invoke("db:info"),
    openFolder: () => ipcRenderer.invoke("db:open-folder"),
    backup: () => ipcRenderer.invoke("db:backup"),
  },
  files: {
    storeImport: (args) => ipcRenderer.invoke("files:store-import", args),
    show: (file) => ipcRenderer.invoke("files:show", file),
  },
});

// Lets the CSS make room for the macOS window buttons in the top bar.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.desktop = process.platform;
});
