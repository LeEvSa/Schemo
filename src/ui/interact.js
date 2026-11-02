// Souris et clavier sur le canevas.
import { closeMenu, toast } from './dialogs.js';
import { canLink, isInsideGroup } from '../model.js';
import { tr } from '../i18n.js';

export class Interact {
  constructor(app) {
    this.app = app;
    this.rd = app.renderer;
    this.svg = app.$.svg;
    this.state = null;
    this.space = false;
    this.hoverTimer = null;
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    svg.addEventListener('dblclick', (e) => this.dbl(e));
    svg.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    svg.addEventListener('contextmenu', (e) => this.context(e));
    svg.addEventListener('pointermove', (e) => this.hover(e));
    svg.addEventListener('pointerleave', () => this.scheduleHoverClear());
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keyup', (e) => { if (e.key === ' ') { this.space = false; svg.classList.remove('space'); } });
    window.addEventListener('blur', () => { this.space = false; svg.classList.remove('space'); });
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('drop', (e) => this.dropFile(e));
  }

  world(e) { return this.rd.toWorld(e.clientX, e.clientY); }

  down(e) {
    const app = this.app;
    closeMenu();
    if (app.editor.active) app.editor.commit();
    const t = e.target;
    const base = { x0: e.clientX, y0: e.clientY, w0: this.world(e) };
    if (e.button === 1 || (e.button === 0 && this.space)) {
      e.preventDefault();
      this.state = { ...base, kind: 'pan', lx: e.clientX, ly: e.clientY };
      this.svg.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;
    const date = t.closest('.tl-date');
    if (date) { e.preventDefault(); app.focusDate(date.getAttribute('data-id')); this.state = { kind: 'none' }; return; }
    const handle = t.closest('.handle');
    if (handle) { e.preventDefault(); this.state = { ...base, kind: 'pending-handle', node: handle.getAttribute('data-node'), side: handle.getAttribute('data-handle') }; return; }
    const pin = t.closest('.npin');
    if (pin) { e.preventDefault(); app.unpin([pin.getAttribute('data-pin')]); this.state = { kind: 'none' }; return; }
    const tog = t.closest('.gtoggle');
    if (tog) { e.preventDefault(); app.toggleCollapse(tog.getAttribute('data-toggle')); this.state = { kind: 'none' }; return; }
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    const nodeEl = t.closest('.node');
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-id');
      if (multi) { app.toggleSelect(id); this.state = { kind: 'none' }; return; }
      if (!app.sel.has(id)) app.select([id]);
      this.state = { ...base, kind: 'pending-node', id };
      return;
    }
    const edgeEl = t.closest('.ehit, .elabel');
    if (edgeEl) {
      const id = edgeEl.getAttribute('data-id');
      if (multi) app.toggleSelect(id); else app.select([id]);
      this.state = { kind: 'none' };
      return;
    }
    const gbar = t.closest('.ghit');
    if (gbar) {
      const id = gbar.getAttribute('data-id');
      if (multi) { app.toggleSelect(id); this.state = { kind: 'none' }; return; }
      if (!app.sel.has(id)) app.select([id]);
      this.state = { ...base, kind: 'pending-node', id };
      return;
    }
    if (multi) { this.state = { ...base, kind: 'marquee', add: true }; return; }
    this.state = { ...base, kind: 'pending-bg' };
  }

  move(e) {
    const s = this.state;
    if (!s || s.kind === 'none') return;
    const far = Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 4;
    switch (s.kind) {
      case 'pending-bg':
        if (far) { s.kind = 'pan'; s.lx = s.x0; s.ly = s.y0; this.svg.classList.add('panning'); this.move(e); }
        break;
      case 'pan':
        this.rd.panBy(e.clientX - s.lx, e.clientY - s.ly);
        s.lx = e.clientX; s.ly = e.clientY;
        break;
      case 'pending-node':
        if (far) this.startDrag(s, e);
        break;
      case 'drag':
        this.updateDrag(s, e);
        break;
      case 'pending-handle':
        if (far) {
          s.kind = 'link';
          this.rd.link = { from: s.node, to: this.world(e), target: null };
          this.svg.classList.add('linking');
          this.move(e);
        }
        break;
      case 'link': {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const n = el && el.closest && el.closest('.node');
        const w = this.world(e);
        const id = n ? n.getAttribute('data-id') : this.app.groupAt(w);
        this.rd.link.to = w;
        this.rd.link.target = id && canLink(this.app.tab, s.node, id) ? id : null;
        this.rd.requestFrame();
        break;
      }
      case 'marquee': {
        const v = this.rd.viewSize();
        this.rd.marquee = { x0: s.x0 - v.left, y0: s.y0 - v.top, x1: e.clientX - v.left, y1: e.clientY - v.top };
        this.rd.requestFrame();
        break;
      }
      default: break;
    }
  }

  startDrag(s, e) {
    const app = this.app, t = app.tab, L = app.L;
    if (!L) return;
    const ids = app.sel.has(s.id) ? [...app.sel].filter((id) => t.nodes[id] || t.groups[id]) : [s.id];
    const center = (id) => {
      const n = L.nodes.get(id);
      if (n) return { x: n.x, y: n.y };
      const g = L.groups.get(id);
      return g ? { x: g.x + g.w / 2, y: g.y + g.h / 2 } : null;
    };
    const cur = (id) => {
      const c = this.rd.cur.nodes.get(id);
      if (c) return { x: c.x, y: c.y };
      const g = this.rd.cur.groups.get(id);
      return g ? { x: g.x + g.w / 2, y: g.y + g.h / 2 } : center(id);
    };
    const start = new Map();
    for (const id of ids) { const p = cur(id); if (p) start.set(id, p); }
    // le contenu d'un cadre déplacé le suit à l'écran
    const isUnder = (itemGroup, gid) => {
      let c = itemGroup;
      const seen = new Set();
      while (c && !seen.has(c)) { if (c === gid) return true; seen.add(c); c = t.groups[c] ? t.groups[c].group : null; }
      return false;
    };
    for (const gid of ids.filter((id) => t.groups[id])) {
      for (const id of [...L.nodes.keys(), ...L.groups.keys()]) {
        const it = t.nodes[id] || t.groups[id];
        if (it && !start.has(id) && isUnder(it.group, gid)) { const p = cur(id); if (p) start.set(id, p); }
      }
    }
    s.kind = 'drag';
    s.ids = app.topLevelOf(ids.filter((id) => start.has(id)));
    s.start = start;
    s.pos = new Map(start);
    this.rd.drag = { pos: s.pos };
    this.rd.handlesFor = null;
    this.svg.classList.add('dragging');
    this.updateDrag(s, e);
  }

  updateDrag(s, e) {
    const w = this.world(e);
    const dx = w.x - s.w0.x, dy = w.y - s.w0.y;
    for (const [id, p] of s.start) s.pos.set(id, { x: p.x + dx, y: p.y + dy });
    if (!this.rd.drag || this.rd.drag.pos !== s.pos) this.rd.drag = { pos: s.pos };
    const t = this.app.tab;
    const target = this.app.groupAt(w, new Set(s.ids));
    const prim = t.nodes[s.ids[0]] || t.groups[s.ids[0]];
    this.rd.dropTarget = prim && target !== (prim.group || null) ? target : null;
    this.rd.requestFrame();
  }

  up(e) {
    const s = this.state;
    this.state = null;
    if (!s) return;
    const app = this.app;
    this.svg.classList.remove('panning', 'linking', 'dragging');
    switch (s.kind) {
      case 'pending-bg':
        app.clearSelection();
        break;
      case 'pending-handle':
        app.handleAction(s.node, s.side);
        break;
      case 'drag': {
        const drag = this.rd.drag;
        const positions = new Map();
        for (const id of s.ids) positions.set(id, s.pos.get(id));
        this.rd.dropTarget = null;
        app.dropItems(s.ids, positions, this.world(e));
        setTimeout(() => { if (this.rd.drag === drag) { this.rd.drag = null; this.rd.requestFrame(); } }, 600);
        break;
      }
      case 'link': {
        const tgt = this.rd.link.target, w = this.rd.link.to;
        this.rd.link = null;
        if (tgt) app.linkNodes(s.node, tgt);
        else if (app.tab.groups[s.node] && isInsideGroup(app.tab, app.groupAt(w), s.node)) toast(tr('Un cadre ne peut pas être relié à ce qu’il contient.'));
        else app.addLinkedNodeAt(s.node, w);
        break;
      }
      case 'marquee': {
        const m = this.rd.marquee;
        this.rd.marquee = null;
        if (m) {
          const v = this.rd.viewSize();
          const a = this.rd.toWorld(Math.min(m.x0, m.x1) + v.left, Math.min(m.y0, m.y1) + v.top);
          const b = this.rd.toWorld(Math.max(m.x0, m.x1) + v.left, Math.max(m.y0, m.y1) + v.top);
          const ids = [];
          const L = app.L;
          for (const n of L.nodes.values()) {
            if (n.x + n.w / 2 >= a.x && n.x - n.w / 2 <= b.x && n.y + n.h / 2 >= a.y && n.y - n.h / 2 <= b.y) ids.push(n.id);
          }
          for (const g of L.groups.values()) if (g.x >= a.x && g.x + g.w <= b.x && g.y >= a.y && g.y + g.h <= b.y) ids.push(g.id);
          app.select(ids, s.add);
        }
        break;
      }
      default: break;
    }
    this.rd.requestFrame();
  }

  dbl(e) {
    const app = this.app;
    const t = e.target;
    if (t.closest('.handle') || t.closest('.npin') || t.closest('.gtoggle') || t.closest('.tl-date')) return;
    const nodeEl = t.closest('.node');
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-id');
      if (app.tab.groups[id]) app.toggleCollapse(id); else app.editor.editNode(id);
      return;
    }
    const edgeEl = t.closest('.ehit, .elabel');
    if (edgeEl) { app.editor.editEdge(edgeEl.getAttribute('data-id')); return; }
    const gbar = t.closest('.ghit');
    if (gbar) { app.editor.editGroup(gbar.getAttribute('data-id')); return; }
    app.addNodeAt(this.world(e));
  }

  wheel(e) {
    e.preventDefault();
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 30;
    if (e.deltaMode === 2) d *= 300;
    const k = e.ctrlKey ? 0.01 : 0.0017;
    this.rd.zoomAt(e.clientX, e.clientY, Math.exp(-d * k));
  }

  context(e) {
    e.preventDefault();
    const app = this.app;
    if (app.editor.active) app.editor.commit();
    const t = e.target;
    const w = this.world(e);
    const nodeEl = t.closest('.node');
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-id');
      app.contextMenu(app.tab.groups[id] ? 'group' : 'node', id, e.clientX, e.clientY, w);
      return;
    }
    const edgeEl = t.closest('.ehit, .elabel');
    if (edgeEl) { app.contextMenu('edge', edgeEl.getAttribute('data-id'), e.clientX, e.clientY, w); return; }
    const gbar = t.closest('.ghit');
    if (gbar) { app.contextMenu('group', gbar.getAttribute('data-id'), e.clientX, e.clientY, w); return; }
    app.contextMenu('bg', null, e.clientX, e.clientY, w);
  }

  hover(e) {
    if (this.state && this.state.kind !== 'none') return;
    const t = e.target;
    if (t.closest('.handle')) { clearTimeout(this.hoverTimer); return; }
    // la barre de titre d'un cadre montre ses +, pas son intérieur : on doit pouvoir traverser un cadre pour atteindre les + d'une case
    const n = t.closest('.node, .ghit');
    if (n) {
      const id = n.getAttribute('data-id');
      clearTimeout(this.hoverTimer);
      if (this.rd.handlesFor !== id) { this.rd.handlesFor = id; this.rd.requestFrame(); }
      return;
    }
    this.scheduleHoverClear();
  }

  scheduleHoverClear() {
    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => {
      const app = this.app;
      const one = app.sel.size === 1 ? [...app.sel][0] : null;
      const keep = one && (app.tab.nodes[one] || app.tab.groups[one]) ? one : null;
      if (this.rd.handlesFor !== keep) { this.rd.handlesFor = keep; this.rd.requestFrame(); }
    }, 380);
  }

  key(e) {
    const app = this.app;
    const tgt = e.target;
    if (document.querySelector('.modal-wrap')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    // dans un champ, seuls les raccourcis qui ne touchent pas au texte restent actifs
    const typing = tgt && tgt.closest && tgt.closest('input, textarea, select, [contenteditable="true"]');
    if (typing && !(k === 'F1' || (ctrl && ['s', 'o', 'n', 'e', 'f'].includes(k)))) return;
    if (e.key === ' ' && !ctrl) { this.space = true; this.svg.classList.add('space'); stop(); return; }
    if (ctrl) {
      if (k === 'z' && !e.shiftKey) { stop(); app.undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { stop(); app.redo(); return; }
      if (k === 's') { stop(); if (e.shiftKey) app.saveAs(); else app.save(); return; }
      if (k === 'o') { stop(); app.open(); return; }
      if (k === 'n') { stop(); app.newDoc(); return; }
      if (k === 'e') { stop(); app.exportDialog(); return; }
      if (k === 'f') { stop(); const s = document.getElementById('search-input'); if (s) { s.focus(); s.select(); } return; }
      if (k === 'c') { stop(); app.copySelection(false); return; }
      if (k === 'x') { stop(); app.copySelection(true); return; }
      if (k === 'v') { stop(); app.paste(); return; }
      if (k === 'd') { stop(); app.duplicate(); return; }
      if (k === 'a') { stop(); app.selectAll(); return; }
      if (k === 'g') {
        stop();
        const g = app.selectedOf('g')[0];
        if (e.shiftKey && g) app.ungroup(g); else app.groupSelection();
        return;
      }
      if (k === '0') { stop(); app.renderer.fit(true); return; }
      if (k === '=' || k === '+') { stop(); app.renderer.zoomCenter(1.2); return; }
      if (k === '-') { stop(); app.renderer.zoomCenter(1 / 1.2); return; }
      return;
    }
    if (k === 'Delete' || k === 'Backspace') { stop(); app.deleteSelection(); return; }
    if (k === 'F1') { stop(); app.showHelp(); return; }
    if (k === 'Escape') {
      stop();
      const s = document.getElementById('search-input');
      if (s && s.value) { s.value = ''; app.search(''); }
      app.clearSelection();
      return;
    }
    if (k === 'F2' || k === 'Enter') {
      const one = app.sel.size === 1 ? [...app.sel][0] : null;
      if (!one) return;
      stop();
      if (app.tab.nodes[one]) app.editor.editNode(one);
      else if (app.tab.edges[one]) app.editor.editEdge(one);
      else if (app.tab.groups[one]) app.editor.editGroup(one);
    }
  }

  async dropFile(e) {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !/\.schemo$/i.test(f.name)) return;
    const p = window.schemo && window.schemo.pathForFile ? window.schemo.pathForFile(f) : null;
    if (p) { this.app.openPath(p); return; }
    if (!(await this.app.confirmDiscard())) return;
    this.app.loadContent(await f.text(), null, f.name);
  }
}
