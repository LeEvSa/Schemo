// Schémo — processus principal Electron (fenêtre, fichiers, export PDF).
const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const TEST_DIR = process.env.SCHEMO_TEST_DIR || null; // tests automatiques : pas de boîtes de dialogue
if (process.env.SCHEMO_USER_DATA) app.setPath('userData', process.env.SCHEMO_USER_DATA);
app.setAppUserModelId('ca.leevsa.schemo'); // Windows : la fenêtre se range sous le raccourci épinglé (même valeur que appId)
let win = null;
let dirty = false;
let forceClose = false;
let pendingFile = null;

function userFile(name) { return path.join(app.getPath('userData'), name); }

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(userFile(name), 'utf8')); } catch { return fallback; }
}
function writeJSON(name, data) {
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(userFile(name), JSON.stringify(data, null, 1)); } catch { /* ignoré */ }
}

// Langue des menus et boîtes de dialogue du système : celle choisie dans l'interface (prefs.json).
const EN = {
  'Ajouter au dictionnaire': 'Add to dictionary', 'Couper': 'Cut', 'Copier': 'Copy', 'Coller': 'Paste',
  'Tout sélectionner': 'Select all', 'Diagramme Schémo': 'Schémo diagram', 'Ouvrir un diagramme': 'Open a diagram',
  'Enregistrer le diagramme': 'Save diagram', 'Diagramme': 'Diagram', 'Image PNG': 'PNG image', 'Image SVG': 'SVG image',
  'Document PDF': 'PDF document', 'Exporter': 'Export',
  'le fichier est ouvert dans un autre programme ou protégé en écriture': 'the file is open in another program or write-protected',
};
function lang() {
  const l = readJSON('prefs.json', {}).lang;
  return l === 'en' || l === 'fr' ? l : (/^fr/i.test(app.getLocale()) ? 'fr' : 'en');
}
function tr(fr) { return lang() === 'en' && EN[fr] ? EN[fr] : fr; }

function fileFromArgv(argv) {
  const f = argv.slice(1).find((a) => /\.schemo$/i.test(a) && fs.existsSync(a));
  return f ? path.resolve(f) : null;
}

function addRecent(p) {
  const list = readJSON('recents.json', []).filter((x) => x !== p);
  list.unshift(p);
  writeJSON('recents.json', list.slice(0, 10));
  if (process.platform === 'win32') app.addRecentDocument(p);
}

function createWindow() {
  const state = readJSON('window.json', { width: 1440, height: 900, maximized: false });
  // position mémorisée seulement si elle tombe sur un écran encore branché
  const onScreen = Number.isFinite(state.x) && Number.isFinite(state.y) && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return state.x + 100 < a.x + a.width && state.x + (state.width || 800) - 100 > a.x && state.y >= a.y - 10 && state.y + 40 < a.y + a.height;
  });
  if (!onScreen) { delete state.x; delete state.y; }
  win = new BrowserWindow({
    width: state.width || 1440,
    height: state.height || 900,
    x: state.x, y: state.y,
    minWidth: 820,
    minHeight: 520,
    title: 'Schémo',
    icon: path.join(__dirname, '..', 'app', 'icon.png'),
    backgroundColor: '#f3f4f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (state.maximized) win.maximize();
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.session.setSpellCheckerLanguages(['fr', 'fr-CA', 'en-US'].filter((l) => win.webContents.session.availableSpellCheckerLanguages.includes(l)));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('context-menu', (e, params) => {
    if (!params.isEditable) return;
    const items = [];
    for (const s of params.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    if (params.misspelledWord) items.push({ label: tr('Ajouter au dictionnaire'), click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' });
    items.push({ label: tr('Couper'), role: 'cut' }, { label: tr('Copier'), role: 'copy' }, { label: tr('Coller'), role: 'paste' }, { type: 'separator' }, { label: tr('Tout sélectionner'), role: 'selectAll' });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  const saveState = () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getNormalBounds();
    writeJSON('window.json', { ...b, maximized: win.isMaximized() });
  };
  win.on('close', (e) => {
    saveState();
    if (dirty && !forceClose) {
      e.preventDefault();
      win.webContents.send('app:request-close');
    }
  });
  win.on('closed', () => { win = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    const f = fileFromArgv(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) win.webContents.send('app:open-file', f);
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    pendingFile = fileFromArgv(process.argv);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

// ---------- échanges avec l'interface ----------
const filters = () => [{ name: tr('Diagramme Schémo'), extensions: ['schemo'] }];

ipcMain.handle('file:openDialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: tr('Ouvrir un diagramme'), filters: filters(), properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const content = fs.readFileSync(p, 'utf8');
  addRecent(p);
  return { path: p, name: path.basename(p), content };
});

ipcMain.handle('file:read', async (e, p) => {
  const content = fs.readFileSync(p, 'utf8');
  addRecent(p);
  return content;
});

// Écrit dans un fichier temporaire puis le renomme (un plantage ne laisse jamais un fichier à moitié écrit).
// Sous Windows, le renommage échoue si le fichier est ouvert ailleurs (PDF dans Acrobat, OneDrive, antivirus) :
// on réessaie, puis on écrit directement.
function writeSafely(p, data, encoding) {
  const tmp = p + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, data, encoding);
    for (let i = 0; i < 4; i++) {
      try { fs.renameSync(tmp, p); return; } catch (err) {
        if (i === 3 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
        const until = Date.now() + 120 * (i + 1);
        while (Date.now() < until) { /* courte attente */ }
      }
    }
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    try { fs.writeFileSync(p, data, encoding); } catch (err2) {
      if (['EBUSY', 'EPERM', 'EACCES'].includes(err2.code)) throw new Error(tr('le fichier est ouvert dans un autre programme ou protégé en écriture'));
      throw err2;
    }
  }
}

ipcMain.handle('file:save', async (e, p, content) => {
  writeSafely(p, content, 'utf8');
  addRecent(p);
  return p;
});

ipcMain.handle('file:saveAs', async (e, content, name) => {
  const r = TEST_DIR ? { filePath: path.join(TEST_DIR, name || tr('Diagramme') + '.schemo') } : await dialog.showSaveDialog(win, { title: tr('Enregistrer le diagramme'), defaultPath: name || tr('Diagramme') + '.schemo', filters: filters() });
  if (r.canceled || !r.filePath) return null;
  let p = r.filePath;
  if (!/\.schemo$/i.test(p)) p += '.schemo';
  writeSafely(p, content, 'utf8');
  addRecent(p);
  return p;
});

const EXPORT_FILTERS = { png: 'Image PNG', svg: 'Image SVG', pdf: 'Document PDF' };

async function askExportPath(ext, name) {
  if (TEST_DIR) return path.join(TEST_DIR, `${name}.${ext}`);
  const last = readJSON('prefs.json', {}).exportDir;
  const r = await dialog.showSaveDialog(win, {
    title: tr('Exporter'),
    defaultPath: path.join(last && fs.existsSync(last) ? last : app.getPath('documents'), `${name}.${ext}`),
    filters: [{ name: tr(EXPORT_FILTERS[ext]), extensions: [ext] }],
  });
  if (r.canceled || !r.filePath) return null;
  let p = r.filePath;
  if (!p.toLowerCase().endsWith('.' + ext)) p += '.' + ext;
  const prefs = readJSON('prefs.json', {});
  prefs.exportDir = path.dirname(p);
  writeJSON('prefs.json', prefs);
  return p;
}

ipcMain.handle('export:file', async (e, { data, base64, ext, name }) => {
  const p = await askExportPath(ext, name);
  if (!p) return null;
  writeSafely(p, base64 ? Buffer.from(data, 'base64') : data, base64 ? undefined : 'utf8');
  return p;
});

const PAGE_INCHES = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17] };

ipcMain.handle('export:pdf', async (e, { pages, pageSize, name }) => {
  const p = await askExportPath('pdf', name);
  if (!p) return null;
  let pw, ph;
  const fit = !PAGE_INCHES[pageSize];
  if (fit) {
    pw = Math.max(...pages.map((x) => x.w)) / 96;
    ph = Math.max(...pages.map((x) => x.h)) / 96;
  } else {
    const landscape = pages.reduce((s, x) => s + (x.w >= x.h ? 1 : -1), 0) >= 0;
    [pw, ph] = landscape ? [PAGE_INCHES[pageSize][1], PAGE_INCHES[pageSize][0]] : PAGE_INCHES[pageSize];
  }
  pw = Math.min(200, Math.max(1, pw));
  ph = Math.min(200, Math.max(1, ph));
  const margin = fit ? 0 : 0.4;
  const body = pages.map((pg) => {
    const svg = pg.svg.replace(/^<\?xml[^>]*>\s*/, '').replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ');
    return `<div class="page">${svg}</div>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${pw}in ${ph}in; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { width: ${pw}in; height: ${ph}in; box-sizing: border-box; padding: ${margin}in; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; overflow: hidden; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .page svg { max-width: 100%; max-height: 100%; width: 100%; height: 100%; }
  </style></head><body>${body}</body></html>`;
  const tmpHtml = path.join(app.getPath('temp'), `schemo-pdf-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await pdfWin.loadFile(tmpHtml);
    const buf = await pdfWin.webContents.printToPDF({
      pageSize: { width: pw, height: ph },
      margins: { marginType: 'none' },
      printBackground: true,
      preferCSSPageSize: true,
    });
    writeSafely(p, buf);
  } finally {
    pdfWin.destroy();
    fs.rmSync(tmpHtml, { force: true });
  }
  return p;
});

ipcMain.handle('recent:list', async () => readJSON('recents.json', []).filter((p) => fs.existsSync(p)));
ipcMain.handle('recovery:save', async (e, content) => { try { fs.writeFileSync(userFile('recuperation.json'), content, 'utf8'); } catch { /* ignoré */ } });
ipcMain.handle('recovery:load', async () => { try { return fs.readFileSync(userFile('recuperation.json'), 'utf8'); } catch { return null; } });
ipcMain.handle('recovery:clear', async () => { fs.rmSync(userFile('recuperation.json'), { force: true }); });
ipcMain.handle('prefs:get', async () => readJSON('prefs.json', {}));
ipcMain.handle('prefs:set', async (e, p) => { writeJSON('prefs.json', { ...readJSON('prefs.json', {}), ...p }); });
ipcMain.handle('clip:write', async (e, text) => { clipboard.writeText(String(text)); });
ipcMain.handle('clip:read', async () => clipboard.readText());
ipcMain.handle('app:startupFile', async () => { const f = pendingFile; pendingFile = null; return f; });
ipcMain.on('app:dirty', (e, d) => { dirty = !!d; if (win) win.setDocumentEdited(!!d); });
ipcMain.on('app:title', (e, t) => { if (win) win.setTitle(String(t)); });
ipcMain.on('app:close-confirmed', () => { forceClose = true; if (win) win.close(); });

// ---------- mises à jour (depuis les Releases GitHub) ----------
// Version installée seulement : le portable ne peut pas se remplacer lui-même. SCHEMO_UPDATE_TEST : tests, jamais d'installation.
const canUpdate = (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE) || !!process.env.SCHEMO_UPDATE_TEST;
let updater = null;
function getUpdater() {
  if (updater) return updater;
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = app.isPackaged;
  updater.forceDevUpdateConfig = !app.isPackaged;
  updater.on('error', (err) => console.error(err)); // sans écouteur, l'erreur ferait planter l'application
  updater.on('download-progress', (p) => { if (win) win.webContents.send('update:progress', Math.round(p.percent)); });
  return updater;
}

ipcMain.handle('update:supported', async () => canUpdate);
// Rend le numéro de la mise à jour disponible, ou null.
ipcMain.handle('update:check', async () => {
  if (!canUpdate) return null;
  const r = await getUpdater().checkForUpdates();
  return r && r.isUpdateAvailable ? r.updateInfo.version.replace(/\.0$/, '') : null;
});
ipcMain.handle('update:download', async () => { await getUpdater().downloadUpdate(); });
ipcMain.handle('update:install', async () => {
  if (!app.isPackaged) return;
  forceClose = true;
  getUpdater().quitAndInstall(true, true); // sans écrans (même dossier, mêmes raccourcis), puis Schémo se rouvre
});
