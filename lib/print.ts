"use client";

import "./persist"; // declares window.desktop

/**
 * Print (browser) or save as PDF (desktop app). Paper is always printed with
 * the light theme, so a dark-mode screen still gives black-on-white.
 */
export async function printPage(fileName: string) {
  const html = document.documentElement;
  const dark = html.classList.contains("dark");
  if (dark) {
    html.classList.remove("dark");
    html.classList.add("light");
  }
  try {
    if (window.desktop) return await window.desktop.savePdf(fileName);
    window.print();
    return null;
  } finally {
    if (dark) {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  }
}
