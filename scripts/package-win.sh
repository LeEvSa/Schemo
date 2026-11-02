#!/usr/bin/env bash
# Fabrique dist/Schemo-Setup.exe (installateur, épinglable) et dist/Schemo.exe (portable, pour une clé USB) depuis Linux.
# Le travail d'electron-builder se fait hors du dossier synchronisé, seuls les .exe finaux sont copiés dans dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${SCHEMO_BUILD_DIR:-$HOME/.cache/schemo-build}"
export WINEPREFIX="${WINEPREFIX:-$HOME/.wine-schemo}"
export WINEDEBUG=-all
export WINEDLLOVERRIDES="mscoree,mshtml="
node scripts/build.mjs --prod
rm -rf "$OUT"
npx electron-builder --win nsis portable --x64 --publish never --config.directories.output="$OUT"
mkdir -p dist
rm -f dist/Installer-Schemo.cmd
cp "$OUT/Schemo-Setup.exe" "$OUT/Schemo.exe" "$OUT/Schemo-Setup.exe.blockmap" "$OUT/latest.yml" dist/  # latest.yml et blockmap : pour la mise à jour dans l'app
chmod 755 dist/Schemo-Setup.exe dist/Schemo.exe  # sans le bit x, un partage réseau Linux peut refuser de lancer l'exe
ls -lh dist/Schemo-Setup.exe dist/Schemo.exe
