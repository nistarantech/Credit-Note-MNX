import type { NextConfig } from "next";

// Fully client-side, so it exports to static files (out/) that the Electron
// shell serves over its own app:// protocol — no server at runtime.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
