// Donne son nom à la prochaine mise à jour : semaine.numéro (ex. 3.2 = 2e mise à jour de la semaine 3).
// Les semaines sont des périodes de 7 jours comptées depuis la création de Schémo : semaine 1 = du 29 oct. au 4 nov. 2026.
// package.json garde la forme à trois nombres que demande electron-builder (1.1 → 1.1.0).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREATED = Date.UTC(2026, 9, 29);
const now = new Date();
const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const week = Math.floor((today - CREATED) / (7 * 86400000)) + 1;

const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const write = (f, data) => fs.writeFileSync(path.join(root, f), JSON.stringify(data, null, 2) + '\n');

const pkg = read('package.json');
const [curWeek, curNum] = pkg.version.split('.').map(Number);
const version = `${week}.${curWeek === week ? curNum + 1 : 1}.0`;
pkg.version = version;
write('package.json', pkg);
const lock = read('package-lock.json');
lock.version = version;
lock.packages[''].version = version;
write('package-lock.json', lock);
console.log(`Mise à jour ${version.replace(/\.0$/, '')} : à décrire dans CHANGELOG.md.`);
