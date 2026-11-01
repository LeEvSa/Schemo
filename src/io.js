// Accès au système (fichiers, presse-papiers…) : Electron si présent, sinon navigateur (tests).
import { tr } from './i18n.js';
const api = typeof window !== 'undefined' ? window.schemo : null;
export const isDesktop = !!api;

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
  async save(path, content) {
    if (api) return api.save(path, content);
    download(path || 'diagramme.schemo', content, 'application/json');
    return path || 'diagramme.schemo';
  },
  async saveAs(content, name) {
    if (api) return api.saveAs(content, name);
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
  setDirty(d) { if (api) api.setDirty(d); },
  setTitle(t) { document.title = t; if (api) api.setTitle(t); },
  onRequestClose(cb) { if (api) api.onRequestClose(cb); },
  closeConfirmed() { if (api) api.closeConfirmed(); },
  onOpenFile(cb) { if (api && api.onOpenFile) api.onOpenFile(cb); },
  async startupFile() { return api ? api.startupFile() : null; },
  async clipboardWrite(text) {
    memClip = text;
    if (api) return api.clipboardWrite(text);
    try { await navigator.clipboard.writeText(text); } catch { /* interne seulement */ }
  },
  async clipboardRead() {
    if (api) return api.clipboardRead();
    try { return await navigator.clipboard.readText(); } catch { return memClip; }
  },
  async prefsGet() {
    if (api) return api.prefsGet();
    try { return JSON.parse(localStorage.getItem('schemo-prefs') || '{}'); } catch { return {}; }
  },
  async prefsSet(p) {
    if (api) return api.prefsSet(p);
    try { localStorage.setItem('schemo-prefs', JSON.stringify(p)); } catch { /* sans stockage */ }
  },
};
