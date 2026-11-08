// Schémo — contrôleur principal de l'application.
import { tr, getLang, setLang, systemLang, LANGS } from './i18n.js';
import {
  createDoc, createTab, createNode, createEdge, createGroup, deleteItems, orderBeside, isInsideGroup,
  normalizeDoc, serializeDoc, snapshotDoc, restoreSnapshot, uid, LAYOUT_SHAPES, canLink,
} from './model.js';
import { computeLayout, positionsOf } from './layout/engine.js';
import { makeMeasurer } from './layout/sizing.js';
import { markdownPlain } from './layout/markdown.js';
import { Renderer } from './render/renderer.js';
import { buildSVG, svgToPngBase64 } from './render/export.js';
import { THEMES, SWATCHES } from './render/themes.js';
import { handleActions, frameHandles } from './ui/handles.js';
import { h, icon } from './ui/dom.js';
import { showModal, toast, stickyToast, showMenu } from './ui/dialogs.js';
import { Panel, SHAPE_LABELS, LAYOUT_LABELS, MARKDOWN_HELP } from './ui/panel.js';
import { TabBar } from './ui/tabs.js';
import { Minimap } from './ui/minimap.js';
import { Interact } from './ui/interact.js';
import { Editor } from './ui/editor.js';
import { exampleDoc } from './examples.js';
import { io, isDesktop } from './io.js';

const VERSION = __VERSION__; // fourni par scripts/build.mjs

const SIDE_VEC = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

class App {
  constructor() {
    this.doc = createDoc();
    this.filePath = null;
    this.fileName = tr('Sans titre');
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesce = null;
    this.sel = new Set();
    this.layouts = new Map();
    this.layoutSeq = 0;
    this.layoutTimer = null;
    this.pendingEdit = null;
    this.prefs = { mode: 'system' };
    this.measure = makeMeasurer();
    this.$ = {
      stage: document.getElementById('stage'),
      svg: document.getElementById('canvas'),
      toolbar: document.getElementById('toolbar'),
      empty: document.getElementById('empty-hint'),
    };
    this.renderer = new Renderer(this.$.svg, {
      getTab: () => this.tab,
      getMode: () => this.mode,
      measure: this.measure,
      onFrame: () => { this.editor?.position(); this.minimap?.draw(); },
      onCamera: () => { this.updateZoomLabel(); this.minimap?.invalidate(); },
      handleActions: (id) => this.handleActionsFor(id),
      isDragging: () => !!(this.interact && this.interact.state && this.interact.state.kind === 'drag'),
    });
    this.renderer.sel = this.sel;
    this.panel = new Panel(this, document.getElementById('panel'));
    this.tabs = new TabBar(this, document.getElementById('tabbar'));
    this.minimap = new Minimap(this, document.getElementById('minimap'));
    this.editor = new Editor(this, this.$.stage);
    this.interact = new Interact(this);
    this.buildToolbar();
    this.buildEmptyHint();
    new ResizeObserver(() => { this.renderer.requestFrame(); this.minimap.invalidate(); }).observe(this.$.stage);
    io.onRequestClose(async () => { if (await this.confirmDiscard()) { await io.recoveryClear(); io.closeConfirmed(); } });
    io.onOpenFile((p) => this.openPath(p));
    io.onUpdateProgress((p) => { if (this.updateToast) this.updateToast.set(tr('Téléchargement de la mise à jour : {n} %', { n: p })); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyMode());
    window.addEventListener('beforeunload', (e) => { if (!isDesktop && this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    setInterval(() => this.autosave(), 20000);
    window.__schemo = this; // accès pour les tests
  }

  async start() {
    try { this.prefs = { mode: 'system', ...(await io.prefsGet()) }; } catch { /* défauts */ }
    setLang(this.prefs.lang || systemLang());
    this.doc = createDoc(); // document vide refait dans la bonne langue (« Diagramme 1 » / « Diagram 1 »)
    this.fileName = tr('Sans titre');
    this.applyLang();
    this.applyMode();
    this.updateTitle();
    this.tabs.render();
    this.panel.render();
    await this.relayout({ animate: false });
    this.restoreView();
    this.canUpdate = await io.updateSupported();
    setTimeout(() => this.checkUpdate(), 5000);
    const startup = await io.startupFile();
    const rec = await io.recoveryLoad();
    if (rec) {
      let data = null;
      try { data = JSON.parse(rec); } catch { data = null; }
      if (data && data.doc) {
        const ok = await showModal({
          title: tr('Récupérer ton travail ?'),
          body: tr('Schémo s’est fermé sans enregistrer « {name} ». Veux-tu reprendre là où tu étais ?', { name: data.fileName || tr('Sans titre') }),
          buttons: [{ label: tr('Ne pas récupérer'), value: false }, { label: tr('Récupérer'), value: true, kind: 'primary' }],
        });
        if (ok) {
          await this.loadDoc(data.doc, data.filePath || null, data.fileName || tr('Sans titre'));
          this.setDirty(true);
          return;
        }
        await io.recoveryClear();
      }
    }
    if (startup) await this.openPath(startup);
  }

  // ---------- accès ----------
  get tab() { return this.doc.tabs.find((t) => t.id === this.doc.active) || this.doc.tabs[0]; }
  get L() { return this.layouts.get(this.tab.id) || null; }
  get mode() {
    if (this.prefs.mode === 'dark' || this.prefs.mode === 'light') return this.prefs.mode;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  applyMode() {
    document.documentElement.dataset.theme = this.mode;
    this.renderer.sync();
    this.renderer.requestFrame();
    this.minimap.invalidate();
    const b = document.getElementById('btn-mode');
    if (b) { b.replaceChildren(icon(this.mode === 'dark' ? 'sun' : 'moon')); b.title = this.mode === 'dark' ? tr('Mode clair') : tr('Mode sombre'); }
  }

  // Remet tous les textes de l'interface dans la langue choisie.
  applyLang() {
    const lang = getLang();
    document.documentElement.lang = lang;
    this.$.svg.setAttribute('aria-label', tr('Diagramme'));
    document.getElementById('minimap').title = tr('Vue d’ensemble — clique pour t’y rendre');
    document.getElementById('panel').setAttribute('aria-label', tr('Propriétés'));
    if (this.isUntitledName()) this.fileName = tr('Sans titre');
    if (this.editor.active) this.editor.commit();
    this.buildToolbar();
    this.buildEmptyHint();
    this.panel.lastKey = '';
    this.panel.render();
    this.tabs.render();
    this.applyMode();
    this.updateZoomLabel();
    this.updateTitle();
    this.renderer.refreshText();
  }

  setLanguage(lang) {
    if (lang === getLang()) return;
    setLang(lang);
    this.prefs.lang = getLang();
    io.prefsSet({ lang: this.prefs.lang });
    this.applyLang();
    toast(tr('Interface en français'));
  }

  languageMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu([{ heading: 'Langue · Language' }, ...LANGS.map(([l, label]) => ({ label, checked: getLang() === l, action: () => this.setLanguage(l) }))], r.left, r.bottom + 4);
  }

  isUntitledName() { return ['Sans titre', 'Untitled'].includes(this.fileName); }

  toggleMode() {
    this.prefs.mode = this.mode === 'dark' ? 'light' : 'dark';
    io.prefsSet({ mode: this.prefs.mode });
    this.applyMode();
  }

  // ---------- modifications et historique ----------
  change(fn, opts = {}) {
    const coalesce = typeof opts === 'object' ? opts.coalesce : null;
    if (!(coalesce && this.lastCoalesce === coalesce)) {
      this.undoStack.push(snapshotDoc(this.doc));
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastCoalesce = coalesce || null;
    fn(this.tab, this.doc);
    const o = typeof opts === 'function' ? opts() : opts;
    this.setDirty(true);
    this.cleanSelection();
    this.panel.render();
    this.tabs.render();
    if (o.noLayout) return;
    if (o.debounce) {
      clearTimeout(this.layoutTimer);
      this.layoutTimer = setTimeout(() => this.relayout(o), o.debounce);
    } else this.relayout(o);
  }

  endCoalesce() { this.lastCoalesce = null; }

  undo() {
    if (this.editor.active) this.editor.commit();
    if (!this.undoStack.length) { toast(tr('Rien à annuler')); return; }
    this.redoStack.push(snapshotDoc(this.doc));
    this.applySnapshot(this.undoStack.pop());
  }

  redo() {
    if (this.editor.active) this.editor.commit();
    if (!this.redoStack.length) { toast(tr('Rien à rétablir')); return; }
    this.undoStack.push(snapshotDoc(this.doc));
    this.applySnapshot(this.redoStack.pop());
  }

  applySnapshot(snap) {
    const active = this.doc.active;
    const cur = this.doc.tabs.find((t) => t.id === active);
    if (cur) cur.view = { ...this.renderer.cam };
    this.doc = restoreSnapshot(this.doc, snap);
    if (!this.doc.tabs.some((t) => t.id === this.doc.active)) {
      this.doc.active = this.doc.tabs.some((t) => t.id === active) ? active : this.doc.tabs[0].id;
    }
    const same = this.doc.active === active;
    this.lastCoalesce = null;
    clearTimeout(this.layoutTimer);
    this.layouts.clear();
    if (!same) this.sel.clear();
    this.setDirty(true);
    this.cleanSelection();
    this.panel.render();
    this.tabs.render();
    this.relayout({ animate: same }).then(() => { if (!same) this.restoreView(); });
  }

  setDirty(d) {
    if (this.dirty === d) return;
    this.dirty = d;
    io.setDirty(d);
    this.updateTitle();
  }

  updateTitle() { io.setTitle(`${this.dirty ? '• ' : ''}${this.fileName} — Schémo`); }

  async autosave() {
    if (!this.dirty) return;
    try { await io.recoverySave(JSON.stringify({ filePath: this.filePath, fileName: this.fileName, doc: JSON.parse(serializeDoc(this.doc)) })); } catch { /* ignoré */ }
  }

  // ---------- disposition ----------
  async relayout(opts = {}) {
    const tab = this.tab;
    const seq = ++this.layoutSeq;
    let L;
    try {
      L = await computeLayout(tab, this.measure, { focus: opts.focus, hints: opts.hints });
    } catch (err) {
      console.error(err);
      toast(tr('Erreur de disposition : ') + err.message, 'error');
      return;
    }
    if (tab !== this.tab) { if (seq === this.layoutSeq) this.layouts.delete(tab.id); return; }
    if (seq !== this.layoutSeq) return;
    const prev = this.L;
    const wasVisible = prev && prev.tabId === tab.id && prev.nodes.size && this.bboxVisible(prev.bbox);
    tab.positions = positionsOf(L);
    this.layouts.set(tab.id, L);
    this.renderer.setLayout(L, { animate: opts.animate !== false, hints: opts.hints });
    // le diagramme était entièrement visible et il déborde maintenant : la vue recule doucement
    if (opts.animate !== false && wasVisible && !this.bboxVisible(L.bbox) && !this.interact?.state) {
      const cam = this.renderer.cameraFor(L.bbox, this.renderer.cam.z);
      if (cam.z >= 0.45) { this.renderer.setCamera(cam, true); opts = { ...opts, reveal: null }; }
    }
    this.cleanSelection();
    this.minimap.invalidate();
    this.updateEmptyHint();
    this.panel.renderStats();
    if (opts.reveal) {
      const n = L.nodes.get(opts.reveal) || L.groups.get(opts.reveal);
      if (n) this.renderer.reveal(n.kind ? { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h } : n);
    }
    if (this.pendingEdit) {
      const id = this.pendingEdit;
      this.pendingEdit = null;
      if (L.nodes.has(id)) { this.select([id]); this.editor.editNode(id); }
    }
  }

  bboxVisible(bb) {
    const v = this.renderer.viewSize();
    const c = this.renderer.cam;
    const x0 = bb.x * c.z + c.x, y0 = bb.y * c.z + c.y;
    const x1 = (bb.x + bb.w) * c.z + c.x, y1 = (bb.y + bb.h) * c.z + c.y;
    return x0 >= 4 && y0 >= 4 && x1 <= v.w - 4 && y1 <= v.h - 4;
  }

  restoreView() {
    const t = this.tab;
    if (t.view) this.renderer.setCamera(t.view, false);
    else if (this.L && this.L.nodes.size) this.renderer.setCamera(this.renderer.cameraFor(this.L.bbox), false);
    else { const v = this.renderer.viewSize(); this.renderer.setCamera({ x: v.w / 2, y: v.h / 2, z: 1 }, false); }
  }

  // ---------- sélection ----------
  select(ids, add = false) {
    if (!add) this.sel.clear();
    for (const id of ids) this.sel.add(id);
    this.selectionChanged();
  }

  toggleSelect(id) {
    if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id);
    this.selectionChanged();
  }

  clearSelection() { if (!this.sel.size) return; this.sel.clear(); this.selectionChanged(); }

  selectionChanged() {
    this.panel.render();
    this.renderer.handlesFor = this.sel.size === 1 && 'ng'.includes([...this.sel][0][0]) ? [...this.sel][0] : this.renderer.handlesFor;
    this.renderer.requestFrame();
  }

  cleanSelection() {
    const t = this.tab;
    let changed = false;
    for (const id of [...this.sel]) if (!t.nodes[id] && !t.edges[id] && !t.groups[id]) { this.sel.delete(id); changed = true; }
    if (changed) this.panel.render();
  }

  selectedOf(prefix) { return [...this.sel].filter((id) => id[0] === prefix); }

  // ---------- portée (cadre) d'un point ----------
  groupAt(p, exclude = new Set()) {
    const L = this.L;
    if (!L) return null;
    let best = null, bestDepth = -1;
    for (const g of L.groups.values()) {
      if (exclude.has(g.id)) continue;
      let skip = false;
      for (const ex of exclude) if (this.tab.groups[ex] && isInsideGroup(this.tab, g.id, ex)) skip = true;
      if (skip) continue;
      if (p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h && g.depth > bestDepth) { best = g.id; bestDepth = g.depth; }
    }
    return best;
  }

  scopeShapeOf(id) {
    const t = this.tab;
    let cur = (t.nodes[id] || t.groups[id] || {}).group || null;
    const seen = new Set();
    while (cur && t.groups[cur] && !seen.has(cur)) {
      seen.add(cur);
      if (t.groups[cur].shape && t.groups[cur].shape !== 'inherit') return t.groups[cur].shape;
      cur = t.groups[cur].group;
    }
    return t.settings.shape;
  }

  handleActionsFor(id) {
    const L = this.L;
    if (L && this.tab.groups[id] && (L.groups.has(id) || L.nodes.has(id))) return frameHandles();
    if (!L || !this.tab.nodes[id]) return null;
    return handleActions(L.nodes.get(id), L, this.tab, this.scopeShapeOf(id));
  }

  // ---------- actions sur le diagramme ----------
  addNodeAt(p, group = undefined) {
    if (this.editor.active) this.editor.commit();
    let scope = group === undefined ? this.groupAt(p) : group;
    if (scope && !(this.L && this.L.groups.has(scope))) scope = null; // cadre replié ou caché
    let id;
    // dans un cadre, c'est le cadre qui reste immobile ; au premier niveau, la case naît sous la souris
    this.change((t) => { id = createNode(t, { group: scope }).id; }, () => ({ hints: { [id]: p }, focus: scope || id }));
    this.pendingEdit = id;
  }

  addNodeCenter() {
    const v = this.renderer.viewSize();
    const p = this.renderer.toWorld(v.left + v.w / 2, v.top + v.h / 2);
    const g = this.selectedOf('g')[0];
    this.addNodeAt(p, g || null);
  }

  // Retire de la liste les éléments dont un cadre parent est aussi dans la liste.
  topLevelOf(ids) {
    const t = this.tab;
    const set = new Set(ids);
    return ids.filter((id) => {
      let cur = (t.nodes[id] || t.groups[id] || {}).group || null;
      const seen = new Set();
      while (cur && !seen.has(cur)) {
        if (set.has(cur)) return false;
        seen.add(cur);
        cur = t.groups[cur] ? t.groups[cur].group : null;
      }
      return true;
    });
  }

  handleAction(nodeId, side) {
    if (this.editor.active) this.editor.commit();
    const L = this.L;
    const fr = L && L.groups.get(nodeId);
    const n = L && (L.nodes.get(nodeId) || (fr && { x: fr.x + fr.w / 2, y: fr.y + fr.h / 2, w: fr.w, h: fr.h }));
    const acts = this.handleActionsFor(nodeId);
    const act = acts && acts[side];
    if (!n || !act) return;
    const d = SIDE_VEC[side];
    const hint = { x: n.x + d[0] * (n.w / 2 + 70), y: n.y + d[1] * (n.h / 2 + 50) };
    let newId = null;
    this.change((t) => {
      const mk = (dir) => createNode(t, { ...this.siblingProps(t, nodeId), order: orderBeside(t, nodeId, dir) });
      const outs = Object.values(t.edges).filter((e) => e.from === nodeId && e.to !== nodeId);
      const ins = Object.values(t.edges).filter((e) => e.to === nodeId && e.from !== nodeId);
      switch (act.kind) {
        case 'after':
        case 'branch': { const N = mk(1); createEdge(t, nodeId, N.id); newId = N.id; break; }
        case 'before': { const N = mk(-1); createEdge(t, N.id, nodeId); newId = N.id; break; }
        case 'insert-after': {
          const N = mk(1); newId = N.id;
          let succ = null;
          if (n.ctx.role === 'cycle' && n.ctx.cycle) { const m = n.ctx.cycle; succ = m[(m.indexOf(nodeId) + 1) % m.length]; }
          else if (outs.length === 1) succ = outs[0].to;
          const e = succ && outs.find((x) => x.to === succ);
          if (e) { e.to = N.id; createEdge(t, N.id, succ); } else createEdge(t, nodeId, N.id);
          break;
        }
        case 'insert-before': {
          const N = mk(-1); newId = N.id;
          let pred = null;
          if (n.ctx.role === 'cycle' && n.ctx.cycle) { const m = n.ctx.cycle; pred = m[(m.indexOf(nodeId) - 1 + m.length) % m.length]; }
          else if (ins.length === 1) pred = ins[0].from;
          const e = pred && ins.find((x) => x.from === pred);
          if (e) { e.to = N.id; createEdge(t, N.id, nodeId); } else createEdge(t, N.id, nodeId);
          break;
        }
        case 'sibling-after':
        case 'sibling-before': {
          const N = mk(act.kind === 'sibling-after' ? 1 : -1); newId = N.id;
          for (const e of ins) createEdge(t, e.from, N.id);
          break;
        }
        case 'seq-after': { newId = mk(1).id; break; }
        case 'seq-before': { newId = mk(-1).id; break; }
        default: break;
      }
    }, () => ({ focus: nodeId, hints: newId ? { [newId]: hint } : {}, reveal: newId }));
    if (newId) this.pendingEdit = newId;
  }

  // Une nouvelle case reliée à une case ou un cadre : à côté de lui, et de la même forme si c'est une case.
  siblingProps(t, id) {
    const it = t.nodes[id] || t.groups[id];
    return t.nodes[id] ? { group: it.group, shape: it.shape } : { group: it.group };
  }

  // Clic sur la date d'une chronologie : on va l'écrire dans le panneau.
  focusDate(id) {
    this.select([id]);
    const inp = document.getElementById('node-date');
    if (inp) { inp.focus(); inp.select(); }
  }

  linkNodes(a, b) {
    const t = this.tab;
    if (!canLink(t, a, b)) return;
    const ex = Object.values(t.edges).find((e) => e.from === a && e.to === b);
    if (ex) { this.select([ex.id]); toast(tr('Ces deux cases sont déjà reliées dans ce sens.')); return; }
    let eid;
    this.change((tt) => { eid = createEdge(tt, a, b).id; }, { focus: a });
    this.select([eid]);
  }

  addLinkedNodeAt(from, p) {
    const t = this.tab;
    if (!t.nodes[from] && !t.groups[from]) return;
    let id;
    this.change((tt) => {
      const N = createNode(tt, { ...this.siblingProps(tt, from), order: orderBeside(tt, from, 1) });
      id = N.id;
      createEdge(tt, from, N.id);
    }, () => ({ focus: from, hints: { [id]: p } }));
    this.pendingEdit = id;
  }

  deleteSelection() {
    if (!this.sel.size) return;
    const ids = [...this.sel];
    this.change((t) => deleteItems(t, ids, false));
    this.sel.clear();
    this.selectionChanged();
  }

  deleteGroupWithContent(gid) {
    this.change((t) => deleteItems(t, [gid], true));
    this.sel.clear();
    this.selectionChanged();
  }

  setNodeProps(ids, props, coalesce) {
    this.change((t) => { for (const id of ids) if (t.nodes[id]) Object.assign(t.nodes[id], props); }, { coalesce, focus: ids[0] });
  }

  setEdgeProps(ids, props, coalesce) {
    this.change((t) => { for (const id of ids) if (t.edges[id]) Object.assign(t.edges[id], props); }, { coalesce });
  }

  setGroupProps(ids, props, coalesce) {
    this.change((t) => { for (const id of ids) if (t.groups[id]) Object.assign(t.groups[id], props); }, { coalesce, focus: ids[0] });
  }

  setTabSettings(props) {
    this.change((t) => Object.assign(t.settings, props), {});
  }

  // Les couleurs ne changent pas la disposition : on redessine seulement (assez rapide pour suivre le sélecteur de couleur).
  recolor() {
    this.renderer.sync();
    this.renderer.requestFrame();
    this.minimap.invalidate();
  }

  setTabColors(props, opts = {}) {
    this.change((t) => {
      t.settings.colors = { ...t.settings.colors, ...props };
      if (opts.theme) t.settings.theme = opts.theme;
    }, { coalesce: opts.coalesce, noLayout: true });
    this.recolor();
  }

  setNodeColors(ids, props, coalesce) {
    this.change((t) => { for (const id of ids) if (t.nodes[id]) Object.assign(t.nodes[id], props); }, { coalesce, noLayout: true });
    this.recolor();
  }

  clearAllNodeColors() {
    this.setNodeColors(Object.keys(this.tab.nodes), { color: null, color2: null, textColor: null, borderColor: null });
  }

  reverseEdges(ids) {
    this.change((t) => { for (const id of ids) { const e = t.edges[id]; if (e) [e.from, e.to] = [e.to, e.from]; } });
  }

  unpin(ids) {
    this.change((t) => { for (const id of ids) { const it = t.nodes[id] || t.groups[id]; if (it) it.pin = null; } }, { focus: null });
  }

  releaseAllPins() {
    this.change((t) => { for (const it of [...Object.values(t.nodes), ...Object.values(t.groups)]) it.pin = null; });
    toast(tr('Toutes les punaises sont relâchées : Schémo range tout.'));
  }

  pinHere(ids) {
    const L = this.L;
    const hints = {};
    let focus = null;
    this.change((t) => {
      for (const id of ids) {
        const it = t.nodes[id] || t.groups[id];
        const n = L.nodes.get(id) || L.groups.get(id);
        if (!it || !n) continue;
        const c = n.kind ? { x: n.x, y: n.y } : { x: n.x + n.w / 2, y: n.y + n.h / 2 };
        const o = L.origins.get(it.group || null) || { x: 0, y: 0 };
        it.pin = { x: c.x - o.x, y: c.y - o.y };
        if (it.group && !focus) { focus = id; hints[id] = c; }
      }
    }, () => ({ focus, hints }));
  }

  // Fin d'un glisser-déposer de cases / cadres.
  dropItems(allIds, positions, pointer) {
    const t = this.tab, L = this.L;
    const ids = this.topLevelOf(allIds);
    const exclude = new Set(ids);
    const target = this.groupAt(pointer, exclude);
    const hints = {};
    let focus = null;
    let moved = false;
    this.change((tt) => {
      for (const id of ids) {
        const it = tt.nodes[id] || tt.groups[id];
        const p = positions.get(id);
        if (!it || !p) continue;
        if (tt.groups[id] && target && isInsideGroup(tt, target, id)) continue;
        const cur = it.group || null;
        if (target === cur) {
          const o = L.origins.get(cur) || { x: 0, y: 0 };
          it.pin = { x: p.x - o.x, y: p.y - o.y };
          // dans un cadre, on garde la case exactement sous la souris
          if (cur && !focus) { focus = id; hints[id] = p; }
        } else {
          it.group = target;
          it.pin = null;
          hints[id] = p;
          moved = 'reparent';
        }
        if (!moved) moved = true;
      }
    }, () => ({ hints, focus }));
    if (moved === 'reparent') toast(target ? tr('Ajouté au cadre « {name} »', { name: t.groups[target] ? t.groups[target].title : '' }) : tr('Sorti du cadre'));
  }

  groupSelection() {
    const t = this.tab;
    const items = this.topLevelOf([...this.sel].filter((id) => t.nodes[id] || t.groups[id]));
    if (!items.length) { toast(tr('Sélectionne d’abord des cases (Ctrl+clic ou Maj+glisser).')); return; }
    const parents = new Set(items.map((id) => (t.nodes[id] || t.groups[id]).group || null));
    const parent = parents.size === 1 ? [...parents][0] : null;
    let gid;
    this.change((tt) => {
      const minOrder = Math.min(...items.map((id) => (tt.nodes[id] || tt.groups[id]).order));
      const g = createGroup(tt, { title: tr('Cadre'), group: parent, order: minOrder - 0.5 });
      gid = g.id;
      for (const id of items) {
        const it = tt.nodes[id] || tt.groups[id];
        if (tt.groups[id] && isInsideGroup(tt, gid, id)) continue;
        it.group = gid;
        it.pin = null;
      }
    }, () => ({ focus: items[0] }));
    this.select([gid]);
    setTimeout(() => this.editor.editGroup(gid), 420);
  }

  ungroup(gid) {
    this.change((t) => deleteItems(t, [gid], false));
    this.sel.delete(gid);
    this.selectionChanged();
  }

  removeFromGroup(ids) {
    this.change((t) => {
      for (const id of ids) {
        const it = t.nodes[id] || t.groups[id];
        if (!it || !it.group) continue;
        it.group = t.groups[it.group] ? t.groups[it.group].group : null;
        it.pin = null;
      }
    });
  }

  toggleCollapse(gid) {
    const g = this.tab.groups[gid];
    if (!g) return;
    this.change((t) => { t.groups[gid].collapsed = !t.groups[gid].collapsed; }, { focus: gid });
  }

  connectInOrder(scope) {
    const t = this.tab;
    const L = this.L;
    const items = Object.values(t.nodes).filter((n) => (n.group || null) === scope && L.nodes.has(n.id));
    if (items.length < 2) return;
    const shape = scope ? this.scopeShapeOf(items[0].id) : t.settings.shape;
    // ordre affiché : suit l'ordre de lecture calculé (seq), sinon l'ordre de création
    items.sort((a, b) => {
      const ca = L.nodes.get(a.id).ctx, cb = L.nodes.get(b.id).ctx;
      return (ca.seq - cb.seq) || (a.order - b.order);
    });
    this.change((tt) => {
      const has = (a, b) => Object.values(tt.edges).some((e) => e.from === a && e.to === b);
      for (let i = 0; i + 1 < items.length; i++) if (!has(items[i].id, items[i + 1].id)) createEdge(tt, items[i].id, items[i + 1].id);
      if (shape === 'cycle' && items.length > 2 && !has(items[items.length - 1].id, items[0].id)) createEdge(tt, items[items.length - 1].id, items[0].id);
    });
  }

  // ---------- presse-papiers ----------
  buildClip() {
    const t = this.tab;
    const ids = new Set([...this.sel].filter((id) => t.nodes[id] || t.groups[id]));
    if (!ids.size) return null;
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of Object.values(t.nodes)) if (n.group && ids.has(n.group) && !ids.has(n.id)) { ids.add(n.id); grew = true; }
      for (const g of Object.values(t.groups)) if (g.group && ids.has(g.group) && !ids.has(g.id)) { ids.add(g.id); grew = true; }
    }
    const clip = {
      schemoClip: 1,
      nodes: Object.values(t.nodes).filter((n) => ids.has(n.id)),
      groups: Object.values(t.groups).filter((g) => ids.has(g.id)),
      edges: Object.values(t.edges).filter((e) => ids.has(e.from) && ids.has(e.to)),
    };
    return { clip, ids };
  }

  copySelection(cut = false) {
    const r = this.buildClip();
    if (!r) return false;
    const { clip, ids } = r;
    io.clipboardWrite(JSON.stringify(clip));
    if (cut) {
      this.change((t) => deleteItems(t, [...ids], true));
      this.sel.clear();
      this.selectionChanged();
    } else toast(tr(clip.nodes.length > 1 ? '{n} cases copiées' : '{n} case copiée', { n: clip.nodes.length }));
    return true;
  }

  async paste() {
    let clip;
    try { clip = JSON.parse(await io.clipboardRead()); } catch { clip = null; }
    if (clip && clip.schemoClip === 1) { this.pasteClip(clip); return; }
    if (!clip || clip.schemoClip !== 1) {
      const text = await io.clipboardRead().catch(() => '');
      if (text && text.trim() && text.length < 2000 && !text.trim().startsWith('{')) {
        // texte ordinaire : une case par ligne
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
        const v = this.renderer.viewSize();
        const p = this.renderer.toWorld(v.left + v.w / 2, v.top + v.h / 2);
        const created = [];
        this.change((t) => { for (const l of lines) created.push(createNode(t, { title: l }).id); }, () => ({ hints: Object.fromEntries(created.map((id) => [id, p])) }));
        this.select(created);
      }
      return;
    }
  }

  pasteClip(clip) {
    const v = this.renderer.viewSize();
    const p = this.renderer.toWorld(v.left + v.w / 2, v.top + v.h / 2);
    const map = new Map();
    const created = [];
    const L = this.L;
    const copied = new Set(clip.groups.map((g) => g.id));
    const visible = (gid) => gid && this.tab.groups[gid] && L && L.groups.has(gid);
    // un cadre sélectionné reçoit le collage, sauf s'il fait partie de la copie ; sinon on garde le cadre d'origine
    let target = this.selectedOf('g').find((g) => !copied.has(g) && visible(g)) || null;
    const parentFor = (gid) => map.get(gid) || target || (visible(gid) && !copied.has(gid) ? gid : null);
    this.change((t) => {
      const base = t.seq;
      for (const g of clip.groups) map.set(g.id, uid('g'));
      for (const n of clip.nodes) map.set(n.id, uid('n'));
      for (const g of clip.groups) {
        t.groups[map.get(g.id)] = { ...g, id: map.get(g.id), group: parentFor(g.group), pin: null, order: base + (g.order || 0) / 1e6 };
      }
      for (const n of clip.nodes) {
        const id = map.get(n.id);
        t.nodes[id] = { ...n, id, group: parentFor(n.group), pin: null, order: base + (n.order || 0) / 1e6 };
        created.push(id);
      }
      for (const e of clip.edges) {
        const id = uid('e');
        t.edges[id] = { ...e, id, from: map.get(e.from), to: map.get(e.to), order: base + (e.order || 0) / 1e6 };
      }
      t.seq = base + 1;
    }, () => ({ hints: Object.fromEntries(created.map((id) => [id, p])) }));
    this.select(created.concat(clip.groups.map((g) => map.get(g.id))));
  }

  duplicate() {
    const r = this.buildClip();
    if (r) this.pasteClip(r.clip);
  }

  selectAll() {
    const t = this.tab;
    this.select([...Object.keys(t.nodes), ...Object.keys(t.groups)].filter((id) => this.L && (this.L.nodes.has(id) || this.L.groups.has(id))));
  }

  // ---------- onglets ----------
  switchTab(id) {
    if (id === this.doc.active) return;
    if (this.editor.active) this.editor.commit();
    const old = this.doc.tabs.find((t) => t.id === this.doc.active);
    if (old) old.view = { ...this.renderer.cam };
    if (this.layoutTimer) { clearTimeout(this.layoutTimer); this.layoutTimer = null; if (old) this.layouts.delete(old.id); }
    this.doc.active = id;
    this.sel.clear();
    this.lastCoalesce = null;
    this.tabs.render();
    this.panel.render();
    const L = this.layouts.get(id);
    if (L) { this.renderer.setLayout(L, { animate: false }); this.updateEmptyHint(); this.restoreView(); this.minimap.invalidate(); }
    else this.relayout({ animate: false }).then(() => this.restoreView());
  }

  addTab(name, shape = 'auto') {
    const n = this.doc.tabs.length + 1;
    let tid;
    this.change((t, doc) => {
      const nt = createTab(name || tr('Diagramme {n}', { n }));
      nt.settings = { ...t.settings, shape };
      doc.tabs.push(nt);
      tid = nt.id;
    }, { noLayout: true });
    this.switchTab(tid);
  }

  renameTab(id, name) {
    if (!name.trim()) return;
    this.change((t, doc) => { const tt = doc.tabs.find((x) => x.id === id); if (tt) tt.name = name.trim(); }, { noLayout: true });
  }

  duplicateTab(id) {
    const src = this.doc.tabs.find((x) => x.id === id);
    if (!src) return;
    let tid;
    this.change((t, doc) => {
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid('t');
      copy.name = src.name + tr(' (copie)');
      doc.tabs.splice(doc.tabs.indexOf(src) + 1, 0, copy);
      tid = copy.id;
    }, { noLayout: true });
    this.switchTab(tid);
  }

  async deleteTab(id) {
    if (this.doc.tabs.length <= 1) { toast(tr('Il faut garder au moins un onglet.')); return; }
    const tt = this.doc.tabs.find((x) => x.id === id);
    if (!tt) return;
    const count = Object.keys(tt.nodes).length;
    if (count) {
      const ok = await showModal({
        title: tr('Supprimer l’onglet ?'),
        body: tr('L’onglet « {name} » contient {count}. Tu pourras annuler avec Ctrl+Z.', { name: tt.name, count: tr(count > 1 ? '{n} cases' : '{n} case', { n: count }) }),
        buttons: [{ label: tr('Annuler'), value: false }, { label: tr('Supprimer'), value: true, kind: 'danger' }],
      });
      if (!ok) return;
    }
    const idx = this.doc.tabs.indexOf(tt);
    const wasActive = this.doc.active === id;
    this.change((t, doc) => { doc.tabs.splice(idx, 1); }, { noLayout: true });
    this.layouts.delete(id);
    if (wasActive) {
      const next = this.doc.tabs[Math.max(0, idx - 1)];
      this.doc.active = next.id;
      this.sel.clear();
      this.panel.render();
      this.relayout({ animate: false }).then(() => this.restoreView());
    }
    this.tabs.render();
  }

  moveTab(id, delta) {
    const i = this.doc.tabs.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.doc.tabs.length) return;
    this.change((t, doc) => { const [x] = doc.tabs.splice(i, 1); doc.tabs.splice(j, 0, x); }, { noLayout: true });
  }

  // ---------- fichiers ----------
  async confirmDiscard() {
    if (this.editor.active) this.editor.commit();
    if (!this.dirty) return true;
    const r = await showModal({
      title: tr('Enregistrer les modifications ?'),
      body: tr('« {name} » a des changements non enregistrés.', { name: this.fileName }),
      buttons: [{ label: tr('Annuler'), value: 'cancel' }, { label: tr('Ne pas enregistrer'), value: 'discard' }, { label: tr('Enregistrer'), value: 'save', kind: 'primary' }],
      dismissValue: 'cancel',
    });
    if (r === 'cancel') return false;
    if (r === 'save') return this.save();
    return true;
  }

  async newDoc() {
    if (!(await this.confirmDiscard())) return;
    this.loadDoc(createDoc(), null, tr('Sans titre'));
    await io.recoveryClear();
  }

  loadDoc(raw, path, name) {
    const doc = normalizeDoc(raw);
    this.doc = doc;
    this.filePath = path;
    this.fileName = name;
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesce = null;
    this.sel.clear();
    this.layouts.clear();
    this.renderer.L = null;
    this.setDirty(false);
    this.updateTitle();
    this.tabs.render();
    this.panel.render();
    return this.relayout({ animate: false }).then(() => this.restoreView());
  }

  async open() {
    if (!(await this.confirmDiscard())) return;
    let res;
    try { res = await io.openDialog(); } catch (err) { toast(tr('Ouverture impossible : ') + err.message, 'error'); return; }
    if (!res) return;
    this.loadContent(res.content, res.path, res.name);
  }

  async openPath(p) {
    if (!(await this.confirmDiscard())) return;
    try {
      const content = await io.readFile(p);
      this.loadContent(content, p);
    } catch (err) { toast(tr('Ouverture impossible : ') + err.message, 'error'); }
  }

  loadContent(content, path, name) {
    try {
      const raw = JSON.parse(content);
      const nm = name || (path ? path.split(/[\\/]/).pop() : tr('Sans titre'));
      this.loadDoc(raw, path || null, nm.replace(/\.schemo$/i, ''));
      io.recoveryClear();
    } catch (err) {
      showModal({ title: tr('Fichier illisible'), body: err.message || tr('Ce fichier n’est pas un diagramme Schémo.'), buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
    }
  }

  async save() {
    if (this.editor.active) this.editor.commit();
    if (!this.filePath && isDesktop) return this.saveAs();
    try {
      this.tab.view = { ...this.renderer.cam };
      const p = await io.save(this.filePath || (this.fileName + '.schemo'), serializeDoc(this.doc));
      if (!p) return false;
      this.afterSave(p);
      return true;
    } catch (err) { toast(tr('Enregistrement impossible : ') + err.message, 'error'); return false; }
  }

  async saveAs() {
    if (this.editor.active) this.editor.commit();
    try {
      this.tab.view = { ...this.renderer.cam };
      const p = await io.saveAs(serializeDoc(this.doc), (this.fileName || tr('Diagramme')) + '.schemo', this.filePath);
      if (!p) return false;
      this.afterSave(p);
      return true;
    } catch (err) { toast(tr('Enregistrement impossible : ') + err.message, 'error'); return false; }
  }

  afterSave(p) {
    if (isDesktop) this.filePath = p;
    this.fileName = String(p).split(/[\\/]/).pop().replace(/\.schemo$/i, '');
    this.setDirty(false);
    this.updateTitle();
    io.recoveryClear();
    toast(tr('Enregistré'));
  }

  async openExample() {
    if (!(await this.confirmDiscard())) return;
    await this.loadDoc(exampleDoc(), null, tr('Exemples'));
  }

  // ---------- mise à jour ----------
  // Au lancement, rien n'est dit s'il n'y a pas de mise à jour ou pas d'Internet ; depuis le menu, on répond toujours.
  async checkUpdate(manual = false) {
    if (!this.canUpdate || this.updating) return;
    let version;
    try { version = await io.updateCheck(); } catch (err) {
      console.error(err);
      if (manual) toast(tr('Impossible de vérifier les mises à jour. Es-tu connecté à Internet ?'), 'error');
      return;
    }
    if (!version) { if (manual) toast(tr('Schémo est à jour.')); return; }
    if (!manual && document.querySelector('.modal-wrap')) return;
    const yes = await showModal({
      title: tr('Mise à jour disponible'),
      body: tr('La mise à jour {version} de Schémo est disponible. Veux-tu la télécharger ?', { version }),
      buttons: [{ label: tr('Plus tard'), value: false }, { label: tr('Télécharger'), value: true, kind: 'primary' }],
    });
    if (!yes) return;
    this.updating = true;
    this.updateToast = stickyToast(tr('Téléchargement de la mise à jour…'));
    try { await io.updateDownload(); } catch (err) {
      console.error(err);
      toast(tr('Le téléchargement de la mise à jour a échoué.'), 'error');
      this.updating = false;
      return;
    } finally {
      this.updateToast.close();
      this.updateToast = null;
    }
    const now = await showModal({
      title: tr('Mise à jour prête'),
      body: tr('Schémo va se fermer, s’installer, puis se rouvrir. Si tu choisis plus tard, elle s’installera à la fermeture de Schémo.'),
      buttons: [{ label: tr('Plus tard'), value: false }, { label: tr('Installer maintenant'), value: true, kind: 'primary' }],
    });
    if (now && await this.confirmDiscard()) {
      await io.recoveryClear();
      await io.updateInstall();
    }
  }

  // ---------- export ----------
  async layoutForTab(tab) {
    if (tab.id === this.tab.id && this.L) return this.L;
    return computeLayout(tab, this.measure, {});
  }

  async exportDialog() {
    if (this.editor.active) this.editor.commit();
    const state = { format: 'png', bg: 'white', scale: '2', page: 'fit', tabs: 'current' };
    const seg = (key, options) => {
      const wrap = h('div', { class: 'seg' });
      const draw = () => {
        wrap.replaceChildren(...options.map(([v, label]) => h('button', {
          class: 'seg-btn' + (state[key] === v ? ' on' : ''),
          onclick: () => { state[key] = v; draw(); refresh(); },
        }, label)));
      };
      draw();
      return wrap;
    };
    const rows = h('div', { class: 'form' });
    const refresh = () => {
      rows.replaceChildren(...[
        h('label', { class: 'form-row' }, h('span', null, tr('Format')), seg('format', [['png', tr('Image PNG')], ['pdf', 'PDF'], ['svg', 'SVG']])),
        state.format !== 'pdf' ? h('label', { class: 'form-row' }, h('span', null, tr('Fond')), seg('bg', [['white', tr('Blanc')], ['transparent', tr('Transparent')]])) : null,
        state.format === 'png' ? h('label', { class: 'form-row' }, h('span', null, tr('Netteté')), seg('scale', [['1', tr('Normale')], ['2', tr('Haute')], ['3', tr('Très haute')]])) : null,
        state.format === 'pdf' ? h('label', { class: 'form-row' }, h('span', null, tr('Page')), seg('page', [['fit', tr('Ajustée')], ['letter', tr('Lettre')], ['legal', tr('Légal')], ['tabloid', tr('Tabloïd')]])) : null,
        state.format === 'pdf' ? h('label', { class: 'form-row' }, h('span', null, tr('Onglets')), seg('tabs', [['current', tr('Onglet actuel')], ['all', tr('Tous les onglets')]])) : null,
        h('p', { class: 'muted small' }, state.format === 'pdf'
          ? tr('Le PDF garde les formes nettes (vectoriel), idéal pour imprimer ou envoyer.')
          : state.format === 'svg' ? tr('Le SVG s’ouvre dans un navigateur et se retouche dans Inkscape ou Illustrator.')
            : tr('L’image PNG se colle partout (courriel, Word, Excel, PowerPoint).')),
      ].filter(Boolean));
    };
    refresh();
    const ok = await showModal({ title: tr('Exporter le diagramme'), body: rows, buttons: [{ label: tr('Annuler'), value: false }, { label: tr('Exporter…'), value: true, kind: 'primary' }] });
    if (!ok) return;
    await this.doExport(state);
  }

  async doExport(state) {
    const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'diagramme';
    const name = safe(this.isUntitledName() ? this.tab.name : `${this.fileName} - ${this.tab.name}`);
    try {
      if (state.format === 'pdf') {
        const tabs = state.tabs === 'all' ? this.doc.tabs : [this.tab];
        const pages = [];
        for (const t of tabs) {
          const L = await this.layoutForTab(t);
          if (!L.nodes.size && tabs.length > 1) continue;
          const s = buildSVG(L, t, this.measure, { background: '#ffffff' });
          pages.push({ svg: s.svg, w: s.w, h: s.h, name: t.name });
        }
        if (!pages.length) { toast(tr('Rien à exporter : le diagramme est vide.')); return; }
        const p = await io.exportPDF({ pages, pageSize: state.page, name: state.tabs === 'all' ? safe(this.fileName) : name });
        if (p) toast(tr('PDF exporté'));
        return;
      }
      const L = this.L;
      if (!L || !L.nodes.size) { toast(tr('Rien à exporter : le diagramme est vide.')); return; }
      const s = buildSVG(L, this.tab, this.measure, { background: state.bg === 'white' ? '#ffffff' : 'transparent' });
      if (state.format === 'svg') {
        const p = await io.exportFile({ data: s.svg, base64: false, ext: 'svg', name });
        if (p) toast(tr('SVG exporté'));
      } else {
        const b64 = await svgToPngBase64(s.svg, s.w, s.h, +state.scale);
        const p = await io.exportFile({ data: b64, base64: true, ext: 'png', name });
        if (p) toast(tr('Image exportée'));
      }
    } catch (err) {
      console.error(err);
      toast(tr('Export impossible : ') + err.message, 'error');
    }
  }

  // ---------- recherche ----------
  search(q) {
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const nq = norm(q.trim());
    this.renderer.matches = new Set();
    this.searchList = [];
    if (nq) {
      const L = this.L;
      for (const n of Object.values(this.tab.nodes)) {
        if (!L || !L.nodes.has(n.id)) continue;
        if (norm(n.title + ' ' + markdownPlain(n.desc) + ' ' + (n.date || '')).includes(nq)) { this.renderer.matches.add(n.id); this.searchList.push(n.id); }
      }
      for (const g of Object.values(this.tab.groups)) {
        if (L && (L.groups.has(g.id) || L.nodes.has(g.id)) && norm(g.title).includes(nq)) this.searchList.push(g.id);
      }
    }
    this.searchIndex = -1;
    this.renderer.requestFrame();
    return this.searchList.length;
  }

  searchNext(dir = 1) {
    if (!this.searchList || !this.searchList.length) return;
    this.searchIndex = (this.searchIndex + dir + this.searchList.length) % this.searchList.length;
    const id = this.searchList[this.searchIndex];
    this.select([id]);
    const L = this.L;
    const n = L.nodes.get(id), g = L.groups.get(id);
    const r = n ? { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h } : g;
    if (r) {
      const v = this.renderer.viewSize();
      const z = Math.max(this.renderer.cam.z, 0.8);
      this.renderer.setCamera({ x: v.w / 2 - (r.x + r.w / 2) * z, y: v.h / 2 - (r.y + r.h / 2) * z, z }, true);
    }
  }

  // ---------- interface ----------
  updateZoomLabel() {
    const z = document.getElementById('zoom-label');
    if (z) z.textContent = Math.round(this.renderer.cam.z * 100) + ' %';
  }

  updateEmptyHint() {
    const empty = !Object.keys(this.tab.nodes).length && !Object.keys(this.tab.groups).length;
    this.$.empty.classList.toggle('show', empty);
  }

  buildEmptyHint() {
    this.$.empty.replaceChildren(
      h('div', { class: 'empty-card' },
        h('div', { class: 'empty-art', html: EMPTY_ART }),
        h('h3', null, tr('Double-clique n’importe où pour créer une case')),
        h('p', null, tr('Ensuite, clique sur les petits '), h('b', null, '+'), tr(' autour d’une case pour en ajouter d’autres, ou tire une flèche d’un '), h('b', null, '+'), tr(' vers une autre case. Schémo range tout seul : boucle → cercle, arbre → hiérarchie, chaîne → processus.')),
        h('div', { class: 'empty-actions' },
          h('button', { class: 'btn primary', onclick: () => this.addNodeCenter() }, icon('addBox', 16), tr('Créer une case')),
          h('button', { class: 'btn', onclick: () => this.openExample() }, icon('sparkle', 16), tr('Voir les exemples')))));
  }

  fileMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu([
      { label: tr('Nouveau'), icon: 'newDoc', shortcut: 'Ctrl+N', action: () => this.newDoc() },
      { label: tr('Nouvelle fiche chronologique'), icon: 'timeline', action: () => this.addTab(tr('Chronologie'), 'timeline') },
      { label: tr('Ouvrir…'), icon: 'open', shortcut: 'Ctrl+O', action: () => this.open() },
      { label: tr('Enregistrer'), icon: 'save', shortcut: 'Ctrl+S', action: () => this.save() },
      { label: tr('Enregistrer sous…'), shortcut: tr('Ctrl+Maj+S'), action: () => this.saveAs() },
      { sep: true },
      { label: tr('Exporter (PNG, PDF, SVG)…'), icon: 'export', shortcut: 'Ctrl+E', action: () => this.exportDialog() },
      { sep: true },
      { label: tr('Ouvrir les exemples'), icon: 'sparkle', action: () => this.openExample() },
      { label: tr('Aide et raccourcis'), icon: 'help', shortcut: 'F1', action: () => this.showHelp() },
      this.canUpdate ? { label: tr('Rechercher une mise à jour…'), icon: 'export', action: () => this.checkUpdate(true) } : null,
      { label: 'Langue · Language', icon: 'globe', submenu: LANGS.map(([l, label]) => ({ label, checked: getLang() === l, action: () => this.setLanguage(l) })) },
      { sep: true },
      { heading: tr('Mise à jour {version}', { version: VERSION }) },
    ], r.left, r.bottom + 4);
  }

  layoutMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const gid = this.selectedOf('g')[0];
    const cur = gid ? this.tab.groups[gid].shape : this.tab.settings.shape;
    const items = [{ heading: gid ? tr('Forme du cadre « {name} »', { name: this.tab.groups[gid].title }) : tr('Forme de l’onglet') }];
    if (gid) items.push({ label: tr('Comme l’onglet'), checked: cur === 'inherit', action: () => this.setGroupProps([gid], { shape: 'inherit' }) });
    for (const s of LAYOUT_SHAPES) {
      items.push({ label: LAYOUT_LABELS[s], icon: LAYOUT_ICONS[s], checked: cur === s, action: () => (gid ? this.setGroupProps([gid], { shape: s }) : this.setTabSettings({ shape: s })) });
    }
    items.push({ sep: true }, { heading: tr('Sens de lecture') });
    for (const [d, label] of [['mixed', tr('Mixte (hiérarchie ↓, processus →)')], ['TB', tr('Tout de haut en bas')], ['LR', tr('Tout de gauche à droite')]]) {
      items.push({ label, checked: this.tab.settings.direction === d, action: () => this.setTabSettings({ direction: d }) });
    }
    showMenu(items, r.left, r.bottom + 4);
  }

  buildToolbar() {
    const tb = this.$.toolbar;
    const btn = (name, title, onclick, opts = {}) => h('button', { class: 'icon-btn' + (opts.cls ? ' ' + opts.cls : ''), title, 'aria-label': title, id: opts.id, onclick }, icon(name));
    const layoutBtn = h('button', { class: 'tool-btn', id: 'btn-layout', title: tr('Forme du diagramme (automatique, cycle, hiérarchie…)'), onclick: (e) => this.layoutMenu(e.currentTarget) }, icon('sparkle'), h('span', { id: 'layout-label' }, tr('Auto')), icon('chevDown', 14));
    const searchInput = h('input', {
      id: 'search-input', type: 'search', placeholder: tr('Rechercher…'), spellcheck: 'false',
      oninput: (e) => { const n = this.search(e.target.value); searchCount.textContent = e.target.value ? `${n}` : ''; },
      onkeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.searchNext(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape') { e.target.value = ''; this.search(''); searchCount.textContent = ''; e.target.blur(); }
      },
    });
    const searchCount = h('span', { class: 'search-count' });
    tb.replaceChildren(
      h('div', { class: 'tb-group' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: BRAND_SVG }), h('span', { class: 'brand-name' }, 'Schémo')),
        h('button', { class: 'tool-btn', title: tr('Fichier'), onclick: (e) => this.fileMenu(e.currentTarget) }, icon('menu'), h('span', null, tr('Fichier')))),
      h('div', { class: 'tb-sep' }),
      h('div', { class: 'tb-group' },
        btn('undo', tr('Annuler (Ctrl+Z)'), () => this.undo()),
        btn('redo', tr('Rétablir (Ctrl+Y)'), () => this.redo())),
      h('div', { class: 'tb-sep' }),
      h('div', { class: 'tb-group' },
        h('button', { class: 'tool-btn', title: tr('Nouvelle case (ou double-clic sur le fond)'), onclick: () => this.addNodeCenter() }, icon('addBox'), h('span', null, tr('Case'))),
        h('button', { class: 'tool-btn', title: tr('Mettre la sélection dans un cadre (Ctrl+G)'), onclick: () => this.groupSelection() }, icon('frame'), h('span', null, tr('Cadre'))),
        layoutBtn),
      h('div', { class: 'tb-flex' }),
      h('div', { class: 'tb-group search' }, icon('search', 16), searchInput, searchCount),
      h('div', { class: 'tb-group' },
        btn('zoomOut', tr('Zoom arrière (Ctrl+-)'), () => this.renderer.zoomCenter(1 / 1.2)),
        h('button', { class: 'zoom-label', id: 'zoom-label', title: tr('Revenir à 100 %'), onclick: () => this.zoomReset() }, '100 %'),
        btn('zoomIn', tr('Zoom avant (Ctrl+=)'), () => this.renderer.zoomCenter(1.2)),
        btn('fit', tr('Ajuster à l’écran (Ctrl+0)'), () => this.renderer.fit(true))),
      h('div', { class: 'tb-sep' }),
      h('div', { class: 'tb-group' },
        btn('export', tr('Exporter (Ctrl+E)'), () => this.exportDialog()),
        btn('moon', tr('Mode sombre'), () => this.toggleMode(), { id: 'btn-mode' }),
        h('button', { class: 'tool-btn lang-btn', id: 'btn-lang', title: tr('Changer de langue (français / anglais)'), onclick: (e) => this.languageMenu(e.currentTarget) }, icon('globe'), h('span', null, getLang().toUpperCase())),
        btn('help', tr('Aide (F1)'), () => this.showHelp())),
    );
  }

  refreshLayoutButton() {
    const gid = this.selectedOf('g')[0];
    const s = gid && this.tab.groups[gid] ? this.tab.groups[gid].shape : this.tab.settings.shape;
    const lab = document.getElementById('layout-label');
    if (lab) lab.textContent = s === 'inherit' ? tr('Comme l’onglet') : LAYOUT_LABELS[s] ? LAYOUT_LABELS[s].split(' (')[0] : tr('Auto');
    const b = document.getElementById('btn-layout');
    if (b) { const ic = b.querySelector('svg'); if (ic) ic.replaceWith(icon(LAYOUT_ICONS[s] || 'sparkle')); }
  }

  zoomReset() {
    const v = this.renderer.viewSize();
    const c = this.renderer.toWorld(v.left + v.w / 2, v.top + v.h / 2);
    this.renderer.setCamera({ x: v.w / 2 - c.x, y: v.h / 2 - c.y, z: 1 }, true);
  }

  showHelp() {
    const row = (k, d) => h('tr', null, h('td', null, h('kbd', null, k)), h('td', null, d));
    const body = h('div', { class: 'help' },
      h('h4', null, tr('Le principe')),
      h('p', null, tr('Tu crées des cases et tu les relies. Schémo regarde les liens et range tout seul :')),
      h('ul', null,
        h('li', null, h('b', null, tr('Boucle')), tr(' (A → B → C → A) : les cases se placent en cercle. Une case accrochée au cercle part vers l’extérieur.')),
        h('li', null, h('b', null, tr('Arbre')), tr(' (un chef, des branches) : hiérarchie de haut en bas.')),
        h('li', null, h('b', null, tr('Chaîne')), tr(' (A → B → C) : processus de gauche à droite, qui passe à la ligne s’il est long.')),
        h('li', null, h('b', null, tr('Mélange')), tr(' : les boucles restent en cercle et le reste s’organise en étages autour.'))),
      h('p', null, tr('Une flèche A → B veut dire « A vient avant B ». Le menu '), h('b', null, tr('Forme')), tr(' permet d’imposer un modèle (cycle, hiérarchie, processus, liste, pyramide, carte d’idées, chronologie) à l’onglet ou à un cadre.')),
      h('h4', null, tr('À la souris')),
      h('table', { class: 'keys' },
        row(tr('Double-clic sur le fond'), tr('Nouvelle case (dans le cadre si tu cliques dedans)')),
        row(tr('Clic sur un +'), tr('Ajoute une case reliée (après, avant, à côté, dans le cycle…)')),
        row(tr('Glisser un +'), tr('Tire une flèche vers une case ou un cadre (ou vers le vide pour créer)')),
        row(tr('Double-clic sur une case'), tr('Écrire dedans (Maj+Entrée = description)')),
        row(tr('Glisser une case'), tr('L’épingle à cet endroit, le reste s’adapte. Clic sur la punaise pour la relâcher.')),
        row(tr('Glisser une case dans un cadre'), tr('La met dans ce cadre')),
        row(tr('Clic sur la barre d’un cadre'), tr('Montre ses +, pour le relier à une case ou à un autre cadre')),
        row(tr('Glisser le fond'), tr('Déplacer la vue')),
        row(tr('Maj + glisser le fond'), tr('Sélectionner plusieurs cases')),
        row(tr('Molette'), tr('Zoom')),
        row(tr('Clic droit'), tr('Menu de la case, de la flèche ou du cadre'))),
      h('h4', null, tr('Au clavier')),
      h('table', { class: 'keys' },
        row(tr('F2 ou Entrée'), tr('Écrire dans la case sélectionnée')),
        row(tr('Suppr'), tr('Supprimer la sélection')),
        row('Ctrl+Z / Ctrl+Y', tr('Annuler / rétablir')),
        row('Ctrl+C / X / V / D', tr('Copier / couper / coller / dupliquer')),
        row('Ctrl+G', tr('Mettre la sélection dans un cadre')),
        row('Ctrl+A', tr('Tout sélectionner')),
        row('Ctrl+F', tr('Rechercher')),
        row('Ctrl+S / Ctrl+O / Ctrl+N', tr('Enregistrer / ouvrir / nouveau')),
        row('Ctrl+E', tr('Exporter en PNG, PDF ou SVG')),
        row('Ctrl+0', tr('Ajuster à l’écran'))),
      h('h4', null, tr('Description d’une case')),
      h('p', null, tr('Sous le titre, une case peut avoir une description. Écris-la dans le panneau de droite, ou avec Maj+Entrée dans la case.')),
      h('p', null, tr(MARKDOWN_HELP)),
      h('p', { class: 'muted small' }, tr('Schémo, mise à jour {version}. Tes diagrammes sont des fichiers .schemo que tu ranges où tu veux.', { version: VERSION })),
      h('p', { class: 'muted small' }, tr('Projet vibe-codé : écrit par une IA (Claude Code), dirigée par quelqu’un sans expérience en programmation.')));
    showModal({ title: tr('Comment ça marche'), body, width: 620, buttons: [{ label: tr('Compris'), value: true, kind: 'primary' }] });
  }

  // ---------- menus contextuels ----------
  contextMenu(kind, id, x, y, world) {
    const t = this.tab;
    const colorItems = (current, apply) => [
      { label: tr('Automatique (thème)'), checked: !current, action: () => apply(null) },
      { sep: true },
      ...SWATCHES.map((c) => ({ label: c.toUpperCase(), swatch: c, checked: current === c, action: () => apply(c) })),
    ];
    if (kind === 'node') {
      if (!this.sel.has(id)) this.select([id]);
      const ids = this.selectedOf('n');
      const n = t.nodes[id];
      showMenu([
        { label: tr('Écrire dans la case'), icon: 'edit', shortcut: 'F2', action: () => this.editor.editNode(id) },
        { sep: true },
        { label: tr('Forme de la case'), icon: 'addBox', submenu: Object.entries(SHAPE_LABELS).map(([s, l]) => ({ label: l, checked: n.shape === s, action: () => this.setNodeProps(ids, { shape: s }) })) },
        { label: tr('Couleur'), icon: 'palette', submenu: colorItems(n.color, (c) => this.setNodeColors(ids, { color: c, color2: null })) },
        n.pin ? { label: tr('Relâcher la punaise'), icon: 'unpin', action: () => this.unpin(ids) } : { label: tr('Épingler ici'), icon: 'pin', action: () => this.pinHere(ids) },
        { sep: true },
        { label: tr('Mettre dans un nouveau cadre'), icon: 'frame', shortcut: 'Ctrl+G', action: () => this.groupSelection() },
        n.group ? { label: tr('Sortir du cadre'), icon: 'ungroup', action: () => this.removeFromGroup(ids) } : null,
        { sep: true },
        { label: tr('Copier'), icon: 'copy', shortcut: 'Ctrl+C', action: () => this.copySelection() },
        { label: tr('Dupliquer'), icon: 'dup', shortcut: 'Ctrl+D', action: () => this.duplicate() },
        { label: tr('Supprimer'), icon: 'trash', shortcut: tr('Suppr'), danger: true, action: () => this.deleteSelection() },
      ], x, y);
    } else if (kind === 'edge') {
      if (!this.sel.has(id)) this.select([id]);
      const ids = this.selectedOf('e');
      const e = t.edges[id];
      showMenu([
        { label: e.label ? tr('Modifier le texte') : tr('Ajouter du texte'), icon: 'edit', action: () => this.editor.editEdge(id) },
        { label: tr('Inverser le sens'), icon: 'swap', action: () => this.reverseEdges(ids) },
        { sep: true },
        { label: tr('Tracé'), submenu: [['auto', tr('Automatique')], ['straight', tr('Droit')], ['curve', tr('Courbe')], ['ortho', tr('Angles droits')]].map(([v, l]) => ({ label: l, checked: e.routing === v, action: () => this.setEdgeProps(ids, { routing: v }) })) },
        { label: tr('Trait'), submenu: [['solid', tr('Plein')], ['dashed', tr('Tirets')], ['dotted', tr('Pointillé')]].map(([v, l]) => ({ label: l, checked: e.dash === v, action: () => this.setEdgeProps(ids, { dash: v }) })) },
        { label: tr('Pointes'), submenu: [['end', tr('Une pointe →')], ['both', tr('Deux pointes ↔')], ['none', tr('Sans pointe —')]].map(([v, l]) => ({ label: l, checked: e.arrows === v, action: () => this.setEdgeProps(ids, { arrows: v }) })) },
        { label: tr('Couleur'), icon: 'palette', submenu: colorItems(e.color, (c) => this.setEdgeProps(ids, { color: c })) },
        { sep: true },
        { label: tr('Supprimer'), icon: 'trash', shortcut: tr('Suppr'), danger: true, action: () => this.deleteSelection() },
      ], x, y);
    } else if (kind === 'group') {
      this.select([id]);
      const g = t.groups[id];
      showMenu([
        { label: tr('Renommer'), icon: 'edit', action: () => this.editor.editGroup(id) },
        { label: g.collapsed ? tr('Déplier') : tr('Replier'), icon: g.collapsed ? 'expand' : 'collapse', action: () => this.toggleCollapse(id) },
        { label: tr('Forme du contenu'), icon: 'sparkle', submenu: [['inherit', tr('Comme l’onglet')], ...LAYOUT_SHAPES.map((s) => [s, LAYOUT_LABELS[s]])].map(([v, l]) => ({ label: l, checked: g.shape === v, action: () => this.setGroupProps([id], { shape: v }) })) },
        { label: tr('Couleur'), icon: 'palette', submenu: colorItems(g.color, (c) => this.setGroupProps([id], { color: c })) },
        g.pin ? { label: tr('Relâcher la punaise'), icon: 'unpin', action: () => this.unpin([id]) } : null,
        { sep: true },
        { label: tr('Dissoudre le cadre (garder les cases)'), icon: 'ungroup', action: () => this.ungroup(id) },
        { label: tr('Supprimer le cadre et son contenu'), icon: 'trash', danger: true, action: () => this.deleteGroupWithContent(id) },
      ], x, y);
    } else {
      const anyPin = [...Object.values(t.nodes), ...Object.values(t.groups)].some((it) => it.pin);
      showMenu([
        { label: tr('Nouvelle case ici'), icon: 'addBox', action: () => this.addNodeAt(world) },
        { label: tr('Coller'), icon: 'paste', shortcut: 'Ctrl+V', action: () => this.paste() },
        { label: tr('Tout sélectionner'), shortcut: 'Ctrl+A', action: () => this.selectAll() },
        { sep: true },
        { label: tr('Forme de l’onglet'), icon: 'sparkle', submenu: LAYOUT_SHAPES.map((s) => ({ label: LAYOUT_LABELS[s], checked: t.settings.shape === s, action: () => this.setTabSettings({ shape: s }) })) },
        { label: tr('Ajuster à l’écran'), icon: 'fit', shortcut: 'Ctrl+0', action: () => this.renderer.fit(true) },
        anyPin ? { label: tr('Relâcher toutes les punaises'), icon: 'unpin', action: () => this.releaseAllPins() } : null,
      ], x, y);
    }
  }
}

export const LAYOUT_ICONS = { auto: 'sparkle', cycle: 'cycle', hierarchy: 'hierarchy', process: 'process', list: 'list', pyramid: 'pyramid', radial: 'radial', timeline: 'timeline', inherit: 'sparkle' };

const BRAND_SVG = '<svg viewBox="0 0 32 32" width="22" height="22"><defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="8" fill="url(#bg1)"/><path d="M16 7.5a8.5 8.5 0 0 1 7.4 12.7M8.6 20.2A8.5 8.5 0 0 1 16 7.5M23.4 20.2a8.5 8.5 0 0 1-14.8 0" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity=".7"/><rect x="12" y="4.5" width="8" height="6" rx="2" fill="#fff"/><rect x="19.5" y="17.5" width="8" height="6" rx="2" fill="#fff"/><rect x="4.5" y="17.5" width="8" height="6" rx="2" fill="#fff"/></svg>';

const EMPTY_ART = '<svg viewBox="0 0 220 120" width="220" height="120" fill="none"><path d="M110 22a46 46 0 0 1 40 69M70 91a46 46 0 0 1 40-69M150 91a46 46 0 0 1-80 0" stroke="currentColor" stroke-width="2" stroke-dasharray="5 5" opacity=".45"/><rect x="86" y="8" width="48" height="28" rx="8" fill="#3b82f6"/><rect x="128" y="78" width="48" height="28" rx="8" fill="#14b8a6"/><rect x="44" y="78" width="48" height="28" rx="8" fill="#8b5cf6"/></svg>';

const app = new App();
app.start();
export default app;
