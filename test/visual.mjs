// Captures d'écran de Schémo lancé dans Electron (sous xvfb), pour vérifier le rendu.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { _electron } = require('playwright-core');
const outDir = process.argv[2] || 'test/shots';
const only = process.argv[3] || 'examples';
fs.mkdirSync(outDir, { recursive: true });
const app = await _electron.launch({
  executablePath: require('electron'),
  args: [path.resolve('.'), '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1', SCHEMO_USER_DATA: fs.mkdtempSync('/tmp/schemo-test-') },
});
const page = await app.firstWindow();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.setViewportSize({ width: 1440, height: 860 }).catch(() => {});
await page.waitForTimeout(1200);
globalThis.page = page;
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
await shot('00-vide');
if (only === 'examples') {
  await page.evaluate(() => window.__schemo.openExample());
  await page.waitForTimeout(1000);
  const n = await page.evaluate(() => window.__schemo.doc.tabs.length);
  for (let i = 0; i < n; i++) {
    await page.evaluate((i) => window.__schemo.switchTab(window.__schemo.doc.tabs[i].id), i);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__schemo.renderer.fit(false));
    await page.waitForTimeout(300);
    await shot(String(i + 1).padStart(2, '0'));
  }
} else {
  const mod = await import(path.resolve(only));
  await mod.default(page, shot);
}
console.log(errors.length ? errors.join('\n') : 'aucune erreur console');
await page.evaluate(() => window.__schemo && window.__schemo.setDirty(false)).catch(() => {});
await app.close();
