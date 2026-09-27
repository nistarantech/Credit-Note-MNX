// The only bridge between the page and the desktop: save the current page as PDF.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  savePdf: (fileName) => ipcRenderer.invoke("save-pdf", fileName),
});

// Lets the CSS make room for the macOS window buttons in the top bar.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.desktop = process.platform;
});
