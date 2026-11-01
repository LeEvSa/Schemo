// Pont sécurisé entre l'interface et le système.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('schemo', {
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  save: (p, content) => ipcRenderer.invoke('file:save', p, content),
  saveAs: (content, name) => ipcRenderer.invoke('file:saveAs', content, name),
  exportFile: (opts) => ipcRenderer.invoke('export:file', opts),
  exportPDF: (opts) => ipcRenderer.invoke('export:pdf', opts),
  recentList: () => ipcRenderer.invoke('recent:list'),
  recoverySave: (c) => ipcRenderer.invoke('recovery:save', c),
  recoveryLoad: () => ipcRenderer.invoke('recovery:load'),
  recoveryClear: () => ipcRenderer.invoke('recovery:clear'),
  prefsGet: () => ipcRenderer.invoke('prefs:get'),
  prefsSet: (p) => ipcRenderer.invoke('prefs:set', p),
  clipboardWrite: (t) => ipcRenderer.invoke('clip:write', t),
  clipboardRead: () => ipcRenderer.invoke('clip:read'),
  startupFile: () => ipcRenderer.invoke('app:startupFile'),
  setDirty: (d) => ipcRenderer.send('app:dirty', d),
  setTitle: (t) => ipcRenderer.send('app:title', t),
  closeConfirmed: () => ipcRenderer.send('app:close-confirmed'),
  onRequestClose: (cb) => ipcRenderer.on('app:request-close', () => cb()),
  onOpenFile: (cb) => ipcRenderer.on('app:open-file', (e, p) => cb(p)),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f) || null; } catch { return null; } },
  platform: process.platform,
});
