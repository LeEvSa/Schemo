#!/usr/bin/env bash
# Fabrique dist/Schemo.exe (Windows, portable, un seul fichier) depuis Linux.
# Le travail d'electron-builder se fait hors du dossier synchronisé, seul le .exe final est copié dans dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${SCHEMO_BUILD_DIR:-$HOME/.cache/schemo-build}"
export WINEPREFIX="${WINEPREFIX:-$HOME/.wine-schemo}"
export WINEDEBUG=-all
export WINEDLLOVERRIDES="mscoree,mshtml="
node scripts/build.mjs --prod
rm -rf "$OUT"
npx electron-builder --win portable --x64 --publish never --config.directories.output="$OUT"
mkdir -p dist
cp "$OUT/Schemo.exe" dist/Schemo.exe
cp scripts/Installer-Schemo.cmd dist/Installer-Schemo.cmd
chmod 755 dist/Schemo.exe dist/Installer-Schemo.cmd  # sans le bit x, un partage réseau Linux peut refuser de lancer l'exe
ls -lh dist/Schemo.exe
