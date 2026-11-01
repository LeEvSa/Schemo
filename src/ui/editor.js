// Écriture directement dans les cases, sur les flèches et dans le titre des cadres.
import { tr, getLang } from '../i18n.js';
import { h } from './dom.js';
import { T } from '../layout/sizing.js';

export class Editor {
  constructor(app, stage) {
    this.app = app;
    this.stage = stage;
    this.active = null;
  }

  stagePoint(x, y) {
    const rd = this.app.renderer;
    return { x: x * rd.cam.z + rd.cam.x, y: y * rd.cam.z + rd.cam.y };
  }

  // ---------- case ----------
  editNode(id) {
    this.commit();
    const app = this.app;
    const n = app.tab.nodes[id];
    if (!n || !app.L || !app.L.nodes.has(id)) return;
    const ta = h('textarea', { class: 'inline-editor node-editor', spellcheck: 'true', lang: getLang(), rows: 1 });
    ta.value = n.title + (n.desc ? '\n' + n.desc : '');
    const hint = h('div', { class: 'editor-hint' }, tr('Entrée : valider · Maj+Entrée : description · Échap : annuler'));
    this.active = { kind: 'node', id, el: ta, hint, before: { title: n.title, desc: n.desc }, changed: false };
    this.stage.append(ta, hint);
    app.renderer.setEditing(id);
    ta.addEventListener('input', () => this.nodeInput());
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.commit(); }
      else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '\n' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 1;
        this.nodeInput();
      } else if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
      else if (e.key === 'Tab') { e.preventDefault(); this.commit(); }
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (this.active && this.active.el === ta && document.activeElement !== ta) this.commit(); }, 0));
    this.styleNode();
    this.position();
    ta.focus();
    ta.select();
  }

  parse(v) {
    const nl = v.indexOf('\n');
    return nl < 0 ? { title: v, desc: '' } : { title: v.slice(0, nl), desc: v.slice(nl + 1) };
  }

  nodeInput() {
    const a = this.active;
    if (!a || a.kind !== 'node') return;
    const { title, desc } = this.parse(a.el.value);
    a.changed = true;
    this.app.change((t) => { const n = t.nodes[a.id]; if (n) { n.title = title; n.desc = desc; } }, { coalesce: 'edit:' + a.id, focus: a.id, debounce: 90 });
    this.styleNode();
  }

  styleNode() {
    const a = this.active;
    if (!a || a.kind !== 'node') return;
    const E = this.app.renderer.els.nodes.get(a.id);
    const col = E && E.colors;
    if (col) { a.el.style.background = col.fill; a.el.style.color = col.text; a.el.style.caretColor = col.text; }
    a.el.style.textAlign = a.el.value.includes('\n') ? 'left' : 'center';
  }

  // ---------- flèche ----------
  editEdge(id) {
    this.commit();
    const app = this.app;
    const e = app.tab.edges[id];
    if (!e || !app.L || !app.L.edges.has(id)) return;
    const inp = h('input', { class: 'inline-editor edge-editor', type: 'text', value: e.label, placeholder: tr('Texte de la flèche'), spellcheck: 'true', lang: getLang() });
    this.active = { kind: 'edge', id, el: inp, before: e.label, changed: false };
    this.stage.append(inp);
    app.renderer.setEditing(id);
    inp.addEventListener('input', () => {
      this.active.changed = true;
      app.change((t) => { if (t.edges[id]) t.edges[id].label = inp.value; }, { coalesce: 'edit:' + id, debounce: 150 });
    });
    this.bindSimple(inp);
    this.position();
    inp.focus();
    inp.select();
  }

  // ---------- cadre ----------
  editGroup(id) {
    this.commit();
    const app = this.app;
    const g = app.tab.groups[id];
    if (!g || !app.L || !(app.L.groups.has(id) || app.L.nodes.has(id))) return;
    const inp = h('input', { class: 'inline-editor group-editor', type: 'text', value: g.title, placeholder: tr('Titre du cadre'), spellcheck: 'true', lang: getLang() });
    this.active = { kind: 'group', id, el: inp, before: g.title, changed: false };
    this.stage.append(inp);
    inp.addEventListener('input', () => {
      this.active.changed = true;
      app.change((t) => { if (t.groups[id]) t.groups[id].title = inp.value; }, { coalesce: 'edit:' + id, debounce: 150, focus: id });
    });
    this.bindSimple(inp);
    this.position();
    inp.focus();
    inp.select();
  }

  bindSimple(inp) {
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (this.active && this.active.el === inp && document.activeElement !== inp) this.commit(); }, 0));
  }

  // ---------- commun ----------
  close() {
    const a = this.active;
    this.active = null;
    if (!a) return null;
    a.el.remove();
    if (a.hint) a.hint.remove();
    if (a.kind !== 'group') this.app.renderer.setEditing(null);
    return a;
  }

  commit() {
    const a = this.close();
    if (!a) return;
    const app = this.app;
    if (a.kind === 'node') {
      const n = app.tab.nodes[a.id];
      if (n && a.changed) {
        const title = n.title.trim();
        const desc = n.desc.replace(/^(\s*\n)+/, '').trimEnd();
        if (title !== n.title || desc !== n.desc) {
          app.change((t) => { const m = t.nodes[a.id]; if (m) { m.title = title; m.desc = desc; } }, { coalesce: 'edit:' + a.id, focus: a.id });
        } else app.relayout({ focus: a.id });
      }
    } else if (a.kind === 'edge') {
      const e = app.tab.edges[a.id];
      if (e && a.changed && e.label !== e.label.trim()) app.change((t) => { t.edges[a.id].label = e.label.trim(); }, { coalesce: 'edit:' + a.id });
    } else if (a.kind === 'group') {
      const g = app.tab.groups[a.id];
      if (g && a.changed && !g.title.trim()) app.change((t) => { t.groups[a.id].title = tr('Cadre'); }, { coalesce: 'edit:' + a.id });
    }
    app.endCoalesce();
    app.panel.render();
  }

  cancel() {
    const a = this.close();
    if (!a) return;
    const app = this.app;
    if (a.changed) {
      app.change((t) => {
        if (a.kind === 'node' && t.nodes[a.id]) { t.nodes[a.id].title = a.before.title; t.nodes[a.id].desc = a.before.desc; }
        if (a.kind === 'edge' && t.edges[a.id]) t.edges[a.id].label = a.before;
        if (a.kind === 'group' && t.groups[a.id]) t.groups[a.id].title = a.before;
      }, { coalesce: 'edit:' + a.id, focus: a.id });
    }
    app.endCoalesce();
  }

  // Suit la case (elle peut bouger pendant que le diagramme se réorganise).
  position() {
    const a = this.active;
    if (!a) return;
    const app = this.app, rd = app.renderer;
    const z = rd.cam.z;
    if (a.kind === 'node') {
      const b = rd.nodeBox(a.id);
      const ln = app.L && app.L.nodes.get(a.id);
      if (!b || !ln) return;
      const scale = ln.scale || 1;
      const fs = Math.max(11, T.title * scale * z);
      const w = Math.max(b.w * z, 170), hgt = Math.max(b.h * z, fs * 2.6);
      const c = this.stagePoint(b.x, b.y);
      Object.assign(a.el.style, { left: c.x - w / 2 + 'px', top: c.y - hgt / 2 + 'px', width: w + 'px', height: hgt + 'px', fontSize: fs + 'px', borderRadius: Math.min(12, 10 * z) + 'px' });
      Object.assign(a.hint.style, { left: c.x - 150 + 'px', top: c.y + hgt / 2 + 8 + 'px' });
    } else if (a.kind === 'edge') {
      const m = rd.edgeMid(a.id);
      if (!m) return;
      const c = this.stagePoint(m.x, m.y);
      Object.assign(a.el.style, { left: c.x - 90 + 'px', top: c.y - 15 + 'px', width: '180px' });
    } else if (a.kind === 'group') {
      const g = rd.cur.groups.get(a.id);
      const n = rd.cur.nodes.get(a.id);
      if (g) {
        const c = this.stagePoint(g.x + 6, g.y + 4);
        Object.assign(a.el.style, { left: c.x + 'px', top: c.y + 'px', width: Math.max(160, Math.min(300, (g.w - 50) * z)) + 'px' });
      } else if (n) {
        const c = this.stagePoint(n.x - n.w / 2, n.y - 14);
        Object.assign(a.el.style, { left: c.x + 'px', top: c.y + 'px', width: Math.max(160, n.w * z) + 'px' });
      }
    }
  }
}
