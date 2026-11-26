// Accès au système (fichiers, presse-papiers…) : Electron, Android (src/android.js) ou navigateur (tests).
import { tr } from './i18n.js';
import { androidApi, isAndroid } from './android.js';
const electron = typeof window !== 'undefined' ? window.schemo || null : null;
const api = electron || androidApi(); // même interface des deux côtés
export const isDesktop = !!electron; // plusieurs fenêtres, menus propres à Windows
export { isAndroid };
export const hasFiles = !!api; // fichiers ouverts / enregistrés à leur place (pas de téléchargement)

let memClip = '';

function download(name, data, mime, base64) {
  const bytes = base64 ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : data;
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const io = {
  async openDialog() {
    if (api) return api.openDialog();
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.schemo,application/json';
      inp.onchange = async () => {
        const f = inp.files[0];
        resolve(f ? { path: null, name: f.name, content: await f.text() } : null);
      };
      inp.click();
    });
  },
  async readFile(path) { return api ? api.readFile(path) : null; },
  // plusieurs fenêtres (application seulement)
  setFile(path) { if (electron) electron.setFile(path || null); },
  async newWindow() { if (electron) return electron.newWindow(); },
  async focusFile(path) { return electron && path ? electron.focusFile(path) : false; },
  async openInNewWindow() { if (electron) return electron.openInNewWindow(); },
  // nom à montrer pour un chemin (Android : adresse content://)
  displayName(p) { return api && api.displayName ? api.displayName(p) : String(p).split(/[\\/]/).pop(); },
  onBack(cb) { if (api && api.onBack) api.onBack(cb); },
  onPause(cb) { if (api && api.onPause) api.onPause(cb); },
  async save(path, content) {
    if (api) return api.save(path, content);
    download(path || 'diagramme.schemo', content, 'application/json');
    return path || 'diagramme.schemo';
  },
  async saveAs(content, name, current) {
    if (api) return api.saveAs(content, name, current);
    download(name || 'diagramme.schemo', content, 'application/json');
    return name || 'diagramme.schemo';
  },
  async exportFile({ data, base64, ext, name }) {
    if (api) return api.exportFile({ data, base64, ext, name });
    download(name + '.' + ext, data, ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'application/octet-stream', base64);
    return name + '.' + ext;
  },
  async exportPDF(opts) {
    if (api) return api.exportPDF(opts);
    throw new Error(tr('L’export PDF n’est disponible que dans l’application.'));
  },
  async recentList() { return api ? api.recentList() : []; },
  async recoverySave(content) {
    if (api) return api.recoverySave(content);
    try { localStorage.setItem('schemo-recovery', content); } catch { /* sans stockage */ }
  },
  async recoveryLoad() {
    if (api) return api.recoveryLoad();
    try { return localStorage.getItem('schemo-recovery'); } catch { return null; }
  },
  async recoveryClear() {
    if (api) return api.recoveryClear();
    try { localStorage.removeItem('schemo-recovery'); } catch { /* sans stockage */ }
  },
  setDirty(d) { if (electron) electron.setDirty(d); },
  setTitle(t) { document.title = t; if (electron) electron.setTitle(t); },
  onRequestClose(cb) { if (electron) electron.onRequestClose(cb); },
  closeConfirmed() { if (api) api.closeConfirmed(); },
  onOpenFile(cb) { if (api && api.onOpenFile) api.onOpenFile(cb); },
  async startupFile() { return api ? api.startupFile() : null; },
  async clipboardWrite(text) {
    memClip = text;
    try { return api ? await api.clipboardWrite(text) : await navigator.clipboard.writeText(text); } catch { /* interne seulement */ }
  },
  async clipboardRead() {
    try { return api ? await api.clipboardRead() : await navigator.clipboard.readText(); } catch { return memClip; }
  },
  async updateSupported() { return api ? api.updateSupported() : false; },
  async updateCheck(auto) { return api ? api.updateCheck(auto) : null; },
  async updateDownload() { if (api) return api.updateDownload(); },
  async updateInstall() { if (api) return api.updateInstall(); },
  onUpdateProgress(cb) { if (api) api.onUpdateProgress(cb); },
  async prefsGet() {
    if (api) return api.prefsGet();
    try { return JSON.parse(localStorage.getItem('schemo-prefs') || '{}'); } catch { return {}; }
  },
  async prefsSet(p) {
    if (api) return api.prefsSet(p);
    try { localStorage.setItem('schemo-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('schemo-prefs') || '{}'), ...p })); } catch { /* sans stockage */ }
  },
};
