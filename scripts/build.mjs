// Assemble l'interface dans app/ (chargée par Electron).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'app');
const prod = process.argv.includes('--prod');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.mkdirSync(out, { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/app.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(out, 'renderer.js'),
  minify: prod,
  sourcemap: prod ? false : 'inline',
  target: 'chrome120',
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(version.replace(/\.0$/, '')) }, // 1.1.0 → 1.1 : voir CHANGELOG.md
  logLevel: 'warning',
});
for (const f of ['index.html', 'styles.css']) fs.copyFileSync(path.join(root, 'src', f), path.join(out, f));
fs.copyFileSync(path.join(root, 'assets', 'icon.png'), path.join(out, 'icon.png'));
console.log(`Interface prête dans app/ (${prod ? 'production' : 'développement'}).`);
