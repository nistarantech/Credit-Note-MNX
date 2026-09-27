#!/bin/bash
# Double-click to open Credit Note as a desktop app (Electron / Chromium window).
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
[ -f out/index.html ] || npm run build
npx electron .
