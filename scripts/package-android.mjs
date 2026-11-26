// Fabrique dist/Schemo.apk (Android, signée) : interface de production → Capacitor → Gradle.
// Il faut : npm install, l'Android SDK (ANDROID_HOME), un JDK 21 HotSpot (JAVA_HOME ; OpenJ9 plante pendant la compilation),
// et la clé de signature hors du dépôt : ~/.schemo/keystore.properties (+ le .jks qu'il nomme). Sans clé, l'APK n'est pas signée.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
for (const v of ['ANDROID_HOME', 'JAVA_HOME']) if (!process.env[v]) throw new Error(`${v} n'est pas défini`);
if (!fs.existsSync(path.join(os.homedir(), '.schemo', 'keystore.properties'))) throw new Error('clé de signature absente : ~/.schemo/keystore.properties');

run('node scripts/build.mjs --prod');
run('npx cap sync android');
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(`${gradlew} assembleRelease --no-daemon -q`, path.join(root, 'android'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.copyFileSync(path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'), path.join(root, 'dist/Schemo.apk'));
console.log('dist/Schemo.apk prête.');
