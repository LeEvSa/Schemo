// Fabrique les icônes et les écrans de démarrage d'Android à partir de assets/icon.svg (dessinés dans Electron).
// Usage : node scripts/android-icons.mjs   (après npm install ; à refaire seulement si l'icône change)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android/app/src/main/res');
const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const BG_RECT = /<rect x="8" y="8" width="240" height="240" rx="56" fill="url\(#g\)"\/>/;
if (!BG_RECT.test(svg)) throw new Error('assets/icon.svg : fond introuvable, script à revoir');

// icône ronde : le même dessin dans un disque
const round = svg.replace(BG_RECT, '<circle cx="128" cy="128" r="124" fill="url(#g)"/>');
// premier plan de l'icône adaptative : le dessin seul, assez petit pour tenir dans le cercle de 66 dp sur 108
// (le dessin va de x 22 à 234, centré vers (128, 118) ; 212 unités → 60 dp)
const side = (212 * 108) / 60;
const fore = svg.replace(BG_RECT, '').replace('viewBox="0 0 256 256"', `viewBox="${128 - side / 2} ${118 - side / 2} ${side} ${side}"`);

const jobs = [];
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  jobs.push({ file: `mipmap-${d}/ic_launcher.png`, svg, w: 48 * k, h: 48 * k });
  jobs.push({ file: `mipmap-${d}/ic_launcher_round.png`, svg: round, w: 48 * k, h: 48 * k });
  jobs.push({ file: `mipmap-${d}/ic_launcher_foreground.png`, svg: fore, w: 108 * k, h: 108 * k });
}
// écrans de démarrage (Android 11 et avant) : l'icône au milieu, sur la couleur de la zone de dessin
for (const f of fs.readdirSync(res).filter((d) => d.startsWith('drawable'))) {
  const p = path.join(res, f, 'splash.png');
  if (!fs.existsSync(p)) continue;
  const b = fs.readFileSync(p);
  jobs.push({ file: `${f}/splash.png`, svg, w: b.readUInt32BE(16), h: b.readUInt32BE(20), splash: true });
}

const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'schemo-icons-'));
const app = await _electron.launch({ args: [root, '--no-sandbox'], env: { ...process.env, SCHEMO_USER_DATA: ud } });
const page = await app.firstWindow();
for (const j of jobs) {
  const b64 = await page.evaluate(async ({ svg, w, h, splash }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (splash) {
      x.fillStyle = '#f5f6f8';
      x.fillRect(0, 0, w, h);
      const s = Math.round(Math.min(w, h) * 0.3);
      x.drawImage(img, (w - s) / 2, (h - s) / 2, s, s);
    } else x.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }, j);
  fs.writeFileSync(path.join(res, j.file), Buffer.from(b64, 'base64'));
}
await app.close();
console.log(`${jobs.length} images faites dans android/app/src/main/res`);
