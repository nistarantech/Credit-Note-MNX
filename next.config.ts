import type { NextConfig } from "next";

// Fully client-side, so it exports to static files (out/) that the Electron
// shell serves over its own app:// protocol — no server at runtime.
const nextConfig: NextConfig = {
  output: "export",
  // A second dev server (npm run dev:alt) builds into its own folder so it can run beside the first.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
