// Accès au système sur Android (Capacitor, dossier android/) : même interface que window.schemo d'Electron (electron/preload.cjs).
// Les fichiers passent par le sélecteur de documents d'Android (adresses content://) ; préférences et sauvegarde de secours
// restent dans le stockage de la page (localStorage), propre à l'app.
import { pdfFromPages } from './render/pdf.js';

const C = typeof window !== 'undefined' ? window.Capacitor : null;
export const isAndroid = !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android');

const REPO = 'LeEvSa/Schemo';
const APK = 'Schemo.apk';
const MIME = { png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf', schemo: 'application/octet-stream' };

// « 3.11 » < « 4.2 » : comparaison nombre par nombre
export function newer(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sans stockage */ } },
};

export function androidApi() {
  if (!isAndroid) return null;
  // greffons natifs déclarés par le pont de Capacitor (pas besoin de @capacitor/core dans le paquet)
  const S = C.Plugins.Schemo;
  const App = C.Plugins.App;
  const names = new Map(); // adresse content:// → nom affiché
  const keep = (r) => { if (r && r.uri) names.set(r.uri, r.name || 'diagramme.schemo'); return r && r.uri ? r : null; };
  // choisir l'endroit (sélecteur d'Android), puis écrire : le contenu ne passe pas par le sélecteur (limite d'~1 Mo)
  const create = async (name, mime, data, base64) => {
    const r = keep(await S.create({ name, mime }));
    if (r) await S.write({ uri: r.uri, data, base64: !!base64 });
    return r;
  };
  let update = null; // { version, url }

  return {
    android: true,
    displayName: (p) => names.get(p) || decodeURIComponent(String(p).split(/[\\/]/).pop()).split(/[\\/:]/).pop(),
    async openDialog() {
      const r = keep(await S.open());
      return r ? { path: r.uri, name: r.name, content: r.content } : null;
    },
    async readFile(p) { const r = keep(await S.read({ uri: p })); return r.content; },
    async save(p, content) {
      if (/^content:/.test(p)) return keep(await S.write({ uri: p, data: content })).uri;
      const r = await create(p, MIME.schemo, content);
      return r ? r.uri : null;
    },
    async saveAs(content, name) { const r = await create(name, MIME.schemo, content); return r ? r.uri : null; },
    async exportFile({ data, base64, ext, name }) { const r = await create(name + '.' + ext, MIME[ext] || 'application/octet-stream', data, base64); return r ? r.name : null; },
    async exportPDF(opts) {
      const b64 = await pdfFromPages(opts);
      const r = await create(opts.name + '.pdf', MIME.pdf, b64, true);
      return r ? r.name : null;
    },
    async startupFile() { const r = await S.startupFile(); return r && r.uri ? r.uri : null; },
    onOpenFile(cb) { S.addListener('openFile', (ev) => cb(ev.uri)); },
    onBack(cb) { App.addListener('backButton', () => cb()); },
    onPause(cb) { App.addListener('pause', () => cb()); },
    closeConfirmed() { S.exit(); },
    async recentList() { return []; },
    async recoverySave(content) { store.set('schemo-recovery', content); },
    async recoveryLoad() { return store.get('schemo-recovery'); },
    async recoveryClear() { store.del('schemo-recovery'); },
    async prefsGet() { try { return JSON.parse(store.get('schemo-prefs') || '{}'); } catch { return {}; } },
    async prefsSet(p) { let cur = {}; try { cur = JSON.parse(store.get('schemo-prefs') || '{}'); } catch { /* vide */ } store.set('schemo-prefs', JSON.stringify({ ...cur, ...p })); },
    async clipboardWrite(text) { await navigator.clipboard.writeText(text); },
    async clipboardRead() { return navigator.clipboard.readText(); },
    // mises à jour : la dernière release GitHub, si elle contient Schemo.apk
    async updateSupported() { return true; },
    async updateCheck() {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rel = await res.json();
      const asset = (rel.assets || []).find((a) => a.name === APK);
      const version = String(rel.tag_name || '').replace(/^v/, '');
      update = asset && newer(version, __VERSION__) ? { version, url: asset.browser_download_url } : null;
      return update ? update.version : null;
    },
    async updateDownload() { if (!update) throw new Error('aucune mise à jour'); await S.downloadUpdate({ url: update.url }); },
    async updateInstall() { await S.installUpdate(); },
    onUpdateProgress(cb) { S.addListener('updateProgress', (ev) => cb(ev.percent)); },
  };
}
