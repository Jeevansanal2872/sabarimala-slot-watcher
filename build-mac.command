#!/bin/bash
# Double-click this file in Finder to build Virtual Q Detector for macOS.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install the LTS version from https://nodejs.org and run this again."
  read -n 1 -s -r -p "Press any key to close"
  exit 1
fi

echo "[1/3] Installing dependencies (first time takes a few minutes)..."
npm install || { echo "npm install failed"; read -n 1 -s -r -p "Press any key"; exit 1; }

echo "[2/3] Building the app..."
npm run dist:mac || { echo "Build failed"; read -n 1 -s -r -p "Press any key"; exit 1; }

echo "[3/3] Done! Open the .dmg in the dist folder and drag Virtual Q Detector to Applications."
echo "First launch: right-click the app > Open (it is not notarized). If macOS says it is damaged, run:"
echo "  xattr -cr \"/Applications/Virtual Q Detector.app\""
open dist
