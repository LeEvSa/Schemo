// Affichage en direct : SVG, caméra (zoom / déplacement), animations de réorganisation.
import { tr } from '../i18n.js';
import { el, clear, fillNodeText, fillCGroup, fillPaint, timelineGeometry, drawTimeline, pinBadge, chevron, shadowFilter, nodePathD, dashArray, FONT_FAMILY } from './draw.js';
import { edgeGeometry } from './edges.js';
import { boundary } from './geometry.js';
import { nodeColors, groupColors, edgeColors, CANVAS } from './themes.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const ANIM_MS = 380;

export class Renderer {
  constructor(svg, host) {
    this.svg = svg;
    this.host = host; // { getTab, getMode, measure, onFrame, handleActions }
    this.cam = { x: 0, y: 0, z: 1 };
    this.camAnim = null;
    this.L = null;
    this.cur = { nodes: new Map(), groups: new Map(), bends: new Map(), alpha: new Map() };
    this.from = null;
    this.anim = null;
    this.els = { nodes: new Map(), groups: new Map(), edges: new Map(), labels: new Map() };
    this.sel = new Set();
    this.hover = null;
    this.matches = new Set();
    this.editing = null;
    this.drag = null;
    this.link = null;
    this.dropTarget = null;
    this.marquee = null;
    this.handlesFor = null;
    this.raf = null;
    this.build();
  }

  build() {
    const svg = this.svg;
    clear(svg);
    const defs = el('defs', null, svg);
    this.defs = defs;
    const pat = el('pattern', { id: 'dots', width: 24, height: 24, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 1.2, cy: 1.2, r: 1.2, class: 'dot' }, pat);
    this.dotPattern = pat;
    shadowFilter(defs);
    this.bg = el('rect', { class: 'bg', x: 0, y: 0, width: '100%', height: '100%', fill: 'url(#dots)' }, svg);
    this.world = el('g', { class: 'world', 'font-family': FONT_FAMILY }, svg);
    this.layerGroups = el('g', { class: 'l-groups' }, this.world);
    this.layerTimeline = el('g', { class: 'l-timeline' }, this.world);
    this.layerEdges = el('g', { class: 'l-edges' }, this.world);
    this.layerNodes = el('g', { class: 'l-nodes' }, this.world);
    this.layerLabels = el('g', { class: 'l-labels' }, this.world);
    this.layerOverlay = el('g', { class: 'l-overlay' }, this.world);
    this.screenOverlay = el('g', { class: 'l-screen' }, svg);
    this.applyCamera();
  }

  // ---------- caméra ----------
  viewSize() { const r = this.svg.getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; }
  toWorld(cx, cy) { const v = this.viewSize(); return { x: (cx - v.left - this.cam.x) / this.cam.z, y: (cy - v.top - this.cam.y) / this.cam.z }; }
  toScreen(x, y) { const v = this.viewSize(); return { x: x * this.cam.z + this.cam.x + v.left, y: y * this.cam.z + this.cam.y + v.top }; }

  applyCamera() {
    const { x, y, z } = this.cam;
    this.world.setAttribute('transform', `translate(${x} ${y}) scale(${z})`);
    this.dotPattern.setAttribute('patternTransform', `translate(${x} ${y}) scale(${z})`);
    this.bg.style.display = z < 0.32 ? 'none' : '';
    if (this.host.onCamera) this.host.onCamera(this.cam);
  }

  setCamera(c, animate = false) {
    if (!animate) { this.cam = { ...c }; this.camAnim = null; this.applyCamera(); this.requestFrame(); return; }
    this.camAnim = { from: { ...this.cam }, to: { ...c }, start: performance.now(), dur: 320 };
    this.requestFrame();
  }

  panBy(dx, dy) { this.camAnim = null; this.cam.x += dx; this.cam.y += dy; this.applyCamera(); this.requestFrame(); }

  zoomAt(cx, cy, factor) {
    this.camAnim = null;
    const v = this.viewSize();
    const px = cx - v.left, py = cy - v.top;
    const z = Math.max(0.08, Math.min(4, this.cam.z * factor));
    const wx = (px - this.cam.x) / this.cam.z, wy = (py - this.cam.y) / this.cam.z;
    this.cam = { x: px - wx * z, y: py - wy * z, z };
    this.applyCamera();
    this.requestFrame();
  }

  zoomCenter(factor) { const v = this.viewSize(); this.zoomAt(v.left + v.w / 2, v.top + v.h / 2, factor); }

  cameraFor(bb, maxZ = 1.25) {
    const v = this.viewSize();
    const pad = 60;
    if (!bb || bb.w <= 0) return { x: v.w / 2, y: v.h / 2, z: 1 };
    const z = Math.max(0.08, Math.min(maxZ, (v.w - pad * 2) / bb.w, (v.h - pad * 2) / bb.h));
    return { x: v.w / 2 - (bb.x + bb.w / 2) * z, y: v.h / 2 - (bb.y + bb.h / 2) * z, z };
  }

  fit(animate = true) { if (this.L) this.setCamera(this.cameraFor(this.L.bbox), animate); }

  // S'assure qu'un rectangle (monde) est visible ; déplace la vue doucement sinon.
  reveal(rect) {
    const v = this.viewSize();
    const m = 40;
    const z = this.cam.z;
    const sx0 = rect.x * z + this.cam.x, sy0 = rect.y * z + this.cam.y;
    const sx1 = (rect.x + rect.w) * z + this.cam.x, sy1 = (rect.y + rect.h) * z + this.cam.y;
    let dx = 0, dy = 0;
    if (sx0 < m) dx = m - sx0; else if (sx1 > v.w - m) dx = v.w - m - sx1;
    if (sy0 < m) dy = m - sy0; else if (sy1 > v.h - m) dy = v.h - m - sy1;
    if (dx || dy) this.setCamera({ x: this.cam.x + dx, y: this.cam.y + dy, z }, true);
  }

  // ---------- disposition ----------
  setLayout(L, opts = {}) {
    if (!(this.host.isDragging && this.host.isDragging())) this.drag = null;
    const animate = opts.animate !== false && this.L !== null && this.L.tabId === L.tabId;
    const hints = opts.hints || {};
    const start = { nodes: new Map(), groups: new Map(), bends: new Map(), alpha: new Map() };
    for (const [id, n] of L.nodes) {
      const c = this.cur.nodes.get(id);
      if (c && animate) start.nodes.set(id, { ...c });
      else if (animate && hints[id]) start.nodes.set(id, { x: hints[id].x, y: hints[id].y, w: n.w * 0.4, h: n.h * 0.4 });
      else if (animate) start.nodes.set(id, { x: n.x, y: n.y, w: n.w * 0.6, h: n.h * 0.6 });
      else start.nodes.set(id, { x: n.x, y: n.y, w: n.w, h: n.h });
      start.alpha.set(id, c && animate ? (this.cur.alpha.get(id) ?? 1) : animate ? 0 : 1);
    }
    for (const [id, g] of L.groups) {
      const c = this.cur.groups.get(id);
      start.groups.set(id, c && animate ? { ...c } : { ...g });
    }
    for (const [vid, p] of L.bends) {
      const c = this.cur.bends.get(vid);
      if (c && animate) { start.bends.set(vid, { ...c }); continue; }
      // un nouveau coude part de la ligne droite entre ses deux cases
      const parts = vid.split('|');
      const e = L.edges.get(parts[1]);
      const k = +parts[2];
      const hint = e && e.hint;
      const sN = e && start.nodes.get(e.from), tN = e && start.nodes.get(e.to);
      if (animate && sN && tN && hint && hint.bends) {
        const t = (k + 1) / (hint.bends.length + 1);
        start.bends.set(vid, { x: lerp(sN.x, tN.x, t), y: lerp(sN.y, tN.y, t) });
      } else start.bends.set(vid, { ...p });
    }
    this.L = L;
    this.from = start;
    this.cur = {
      nodes: new Map([...start.nodes].map(([k, v]) => [k, { ...v }])),
      groups: new Map([...start.groups].map(([k, v]) => [k, { ...v }])),
      bends: new Map([...start.bends].map(([k, v]) => [k, { ...v }])),
      alpha: new Map(start.alpha),
    };
    this.anim = animate ? { start: performance.now(), dur: ANIM_MS } : null;
    this.sync();
    this.requestFrame();
  }

  // Crée / supprime / met à jour les éléments (couleurs, texte, formes).
  sync() {
    const L = this.L;
    const tab = this.host.getTab();
    if (!L || !tab) return;
    const mode = this.host.getMode();
    const look = tab.settings;
    const shadow = tab.settings.shadow ? 'url(#sh)' : null;
    // cadres
    for (const [id, e] of this.els.groups) if (!L.groups.has(id)) { e.g.remove(); this.els.groups.delete(id); }
    const groupsSorted = [...L.groups.values()].sort((a, b) => a.depth - b.depth);
    for (const gl of groupsSorted) {
      const gm = tab.groups[gl.id];
      if (!gm) continue;
      let E = this.els.groups.get(gl.id);
      if (!E) {
        const g = el('g', { class: 'group', 'data-id': gl.id }, this.layerGroups);
        E = {
          g,
          frame: el('rect', { class: 'gframe', rx: 14 }, g),
          hitBar: el('rect', { class: 'ghit', 'data-id': gl.id }, g),
          title: el('text', { class: 'gtitle', 'font-size': 13, 'font-weight': 650 }, g),
          extra: el('g', null, g),
          sig: '',
        };
        this.els.groups.set(gl.id, E);
      }
      this.layerGroups.appendChild(E.g);
      const col = groupColors(look, gm.color, gl.depth, mode);
      const sig = [gm.title, col.fill, col.stroke, gl.pinned].join('|');
      if (sig !== E.sig) {
        E.sig = sig;
        E.frame.setAttribute('fill', col.fill);
        E.frame.setAttribute('stroke', col.stroke);
        E.title.setAttribute('fill', col.title);
        E.title.textContent = gm.title || tr('Cadre');
        E.col = col;
      }
    }
    // cases
    for (const [id, e] of this.els.nodes) if (!L.nodes.has(id)) { e.g.remove(); this.els.nodes.delete(id); }
    for (const nl of L.nodes.values()) {
      const isG = nl.kind === 'cgroup';
      const m = isG ? tab.groups[nl.id] : tab.nodes[nl.id];
      if (!m) continue;
      let E = this.els.nodes.get(nl.id);
      if (!E) {
        const g = el('g', { class: 'node' + (isG ? ' cgroup' : ''), 'data-id': nl.id }, this.layerNodes);
        E = { g, stack: isG ? el('path', { class: 'nstack' }, g) : null, shape: el('path', { class: 'nshape' }, g), text: el('g', { class: 'ntext' }, g), extra: el('g', null, g), sig: '', skey: '' };
        this.els.nodes.set(nl.id, E);
      }
      const colors = isG ? nodeColors(look, { depth: 0, seq: 0, seqLen: 1, branch: -1 }, gm_color(m)) : nodeColors(look, nl.ctx, m);
      const sig = JSON.stringify([colors, nl.text && [nl.text.width, nl.text.lines.map((l) => [l.text, l.size, l.y, l.indent, l.runs, l.marker, l.rule, l.quote])], nl.pinned, isG ? m.title + nl.count : '', nl.w, nl.h, shadow, this.editing === nl.id]);
      if (sig !== E.sig) {
        E.sig = sig;
        const paint = fillPaint(colors, this.defs);
        E.shape.setAttribute('fill', paint);
        E.shape.setAttribute('stroke', colors.stroke);
        E.shape.setAttribute('stroke-width', 1.5);
        if (shadow) E.shape.setAttribute('filter', shadow); else E.shape.removeAttribute('filter');
        if (E.stack) { E.stack.setAttribute('fill', paint); E.stack.setAttribute('opacity', 0.45); E.stack.setAttribute('stroke', colors.stroke); }
        if (isG) fillCGroup(E.text, nl, colors, m.title);
        else fillNodeText(E.text, nl, colors.text);
        E.text.style.visibility = this.editing === nl.id ? 'hidden' : '';
        clear(E.extra);
        if (isG) chevron(E.extra, nl.w / 2 - 18, 0, false, colors.text, nl.id);
        if (nl.pinned) pinBadge(E.extra, nl.w, nl.h, nl.id);
        E.colors = colors;
      }
    }
    // flèches
    for (const [id, e] of this.els.edges) if (!L.edges.has(id)) { e.g.remove(); this.els.edges.delete(id); }
    for (const [id, e] of this.els.labels) if (!L.edges.has(id) || !(tab.edges[id] && tab.edges[id].label)) { e.g.remove(); this.els.labels.delete(id); }
    for (const le of L.edges.values()) {
      const em = tab.edges[le.id];
      if (!em) continue;
      let E = this.els.edges.get(le.id);
      if (!E) {
        const g = el('g', { class: 'edge', 'data-id': le.id }, this.layerEdges);
        E = { g, hit: el('path', { class: 'ehit', 'data-id': le.id }, g), line: el('path', { class: 'eline', fill: 'none' }, g), heads: el('g', { class: 'eheads' }, g) };
        this.els.edges.set(le.id, E);
      }
      const col = edgeColors(em.color, mode);
      E.line.setAttribute('stroke', col.stroke);
      E.line.setAttribute('stroke-width', em.width);
      const da = dashArray(em.dash, em.width);
      if (da) E.line.setAttribute('stroke-dasharray', da); else E.line.removeAttribute('stroke-dasharray');
      E.line.setAttribute('stroke-linecap', em.dash === 'dotted' ? 'round' : 'butt');
      E.heads.setAttribute('fill', col.stroke);
      E.col = col;
      if (em.label) {
        let Lb = this.els.labels.get(le.id);
        if (!Lb) {
          const g = el('g', { class: 'elabel', 'data-id': le.id }, this.layerLabels);
          Lb = { g, rect: el('rect', { rx: 5 }, g), text: el('text', { 'text-anchor': 'middle', 'font-size': 12 }, g), key: '' };
          this.els.labels.set(le.id, Lb);
        }
        const key = em.label + '|' + mode + '|' + col.label;
        if (Lb.key !== key) {
          Lb.key = key;
          Lb.text.textContent = em.label;
          Lb.text.setAttribute('fill', col.label);
          Lb.w = Math.min(240, this.host.measure(em.label, 12, 400)) + 12;
          Lb.rect.setAttribute('width', Lb.w);
          Lb.rect.setAttribute('height', 19);
          Lb.rect.setAttribute('x', -Lb.w / 2);
          Lb.rect.setAttribute('y', -10.5);
          Lb.text.setAttribute('y', 4.2);
        }
      }
    }
  }

  // Redessine les textes (changement de langue).
  refreshText() { for (const m of [this.els.groups, this.els.nodes]) for (const E of m.values()) E.sig = ''; this.sync(); this.requestFrame(); }

  setEditing(id) { this.editing = id; this.sync(); this.requestFrame(); }

  requestFrame() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => { this.raf = null; this.frame(t); });
  }

  frame(now) {
    let again = false;
    if (this.camAnim) {
      const a = this.camAnim;
      const t = Math.min(1, (now - a.start) / a.dur);
      const k = ease(t);
      this.cam = { x: lerp(a.from.x, a.to.x, k), y: lerp(a.from.y, a.to.y, k), z: lerp(a.from.z, a.to.z, k) };
      this.applyCamera();
      if (t < 1) again = true; else this.camAnim = null;
    }
    if (this.L) {
      let t = 1;
      if (this.anim) {
        t = Math.min(1, (now - this.anim.start) / this.anim.dur);
        if (t >= 1) this.anim = null; else again = true;
      }
      this.interpolate(ease(t));
      this.draw();
    }
    if (this.host.onFrame) this.host.onFrame();
    if (again) this.requestFrame();
  }

  interpolate(k) {
    const L = this.L, F = this.from;
    for (const [id, n] of L.nodes) {
      const a = F.nodes.get(id) || n;
      const c = this.cur.nodes.get(id) || {};
      c.x = lerp(a.x, n.x, k); c.y = lerp(a.y, n.y, k); c.w = lerp(a.w, n.w, k); c.h = lerp(a.h, n.h, k);
      this.cur.nodes.set(id, c);
      const a0 = F.alpha.get(id) ?? 1;
      this.cur.alpha.set(id, lerp(a0, 1, k));
    }
    for (const [id, g] of L.groups) {
      const a = F.groups.get(id) || g;
      this.cur.groups.set(id, { x: lerp(a.x, g.x, k), y: lerp(a.y, g.y, k), w: lerp(a.w, g.w, k), h: lerp(a.h, g.h, k) });
    }
    for (const [vid, p] of L.bends) {
      const a = F.bends.get(vid) || p;
      this.cur.bends.set(vid, { x: lerp(a.x, p.x, k), y: lerp(a.y, p.y, k) });
    }
    for (const id of [...this.cur.nodes.keys()]) if (!L.nodes.has(id)) this.cur.nodes.delete(id);
    for (const id of [...this.cur.groups.keys()]) if (!L.groups.has(id)) this.cur.groups.delete(id);
    for (const id of [...this.cur.bends.keys()]) if (!L.bends.has(id)) this.cur.bends.delete(id);
    // déplacement à la souris en cours
    if (this.drag) {
      for (const [id, p] of this.drag.pos) {
        const c = this.cur.nodes.get(id);
        if (c) { c.x = p.x; c.y = p.y; }
        const g = this.cur.groups.get(id);
        if (g) { g.x = p.x - g.w / 2; g.y = p.y - g.h / 2; }
      }
    }
  }

  // Case courante avec sa forme (pour les tracés et l'interface).
  nodeBox(id) {
    const c = this.cur.nodes.get(id);
    const n = this.L && this.L.nodes.get(id);
    if (!c || !n) return null;
    return { id, x: c.x, y: c.y, w: c.w, h: c.h, shape: n.shape, trap: n.trap && { top: n.trap.top * (c.w / n.w), bottom: n.trap.bottom * (c.w / n.w) } };
  }

  // Case ou cadre courant : ce qu'une flèche peut relier.
  itemBox(id) {
    const g = this.cur.groups.get(id);
    return this.nodeBox(id) || (g ? { id, x: g.x + g.w / 2, y: g.y + g.h / 2, w: g.w, h: g.h, shape: 'rect' } : null);
  }

  edgeMid(id) {
    const L = this.L, tab = this.host.getTab();
    const le = L && L.edges.get(id), em = tab && tab.edges[id];
    if (!le || !em) return null;
    const S = this.itemBox(le.from), T = this.itemBox(le.to);
    if (!S || !T) return null;
    return edgeGeometry(em, le.hint, S, T, (x) => this.itemBox(x), (v) => this.cur.bends.get(v)).mid;
  }

  draw() {
    const L = this.L;
    const tab = this.host.getTab();
    if (!tab) return;
    for (const [id, E] of this.els.groups) {
      const g = this.cur.groups.get(id);
      if (!g) continue;
      E.frame.setAttribute('x', g.x); E.frame.setAttribute('y', g.y);
      E.frame.setAttribute('width', Math.max(0, g.w)); E.frame.setAttribute('height', Math.max(0, g.h));
      E.hitBar.setAttribute('x', g.x); E.hitBar.setAttribute('y', g.y);
      E.hitBar.setAttribute('width', Math.max(0, g.w)); E.hitBar.setAttribute('height', 30);
      E.title.setAttribute('x', g.x + 14); E.title.setAttribute('y', g.y + 21);
      const gl = L.groups.get(id);
      const xkey = [Math.round(g.x), Math.round(g.y), Math.round(g.w), gl && gl.pinned, E.sig].join('|');
      if (E.xkey !== xkey) {
        E.xkey = xkey;
        clear(E.extra);
        chevron(E.extra, g.x + g.w - 18, g.y + 16, true, E.col ? E.col.title : '#555', id);
        if (gl && gl.pinned) pinBadge(E.extra, 0, 0, id).setAttribute('transform', `translate(${g.x + g.w - 40} ${g.y + 16})`);
      }
      E.g.classList.toggle('selected', this.sel.has(id));
      E.g.classList.toggle('drop', this.dropTarget === id);
    }
    for (const [id, E] of this.els.nodes) {
      const c = this.cur.nodes.get(id);
      const n = L.nodes.get(id);
      if (!c || !n) continue;
      E.g.setAttribute('transform', `translate(${Math.round(c.x * 100) / 100} ${Math.round(c.y * 100) / 100})`);
      const a = this.cur.alpha.get(id) ?? 1;
      E.g.setAttribute('opacity', a < 0.999 ? a.toFixed(3) : 1);
      const skey = n.shape + (n.trap ? n.trap.top + ',' + n.trap.bottom : '') + '|' + c.w.toFixed(2) + '|' + c.h.toFixed(2);
      if (E.skey !== skey) {
        E.skey = skey;
        const box = this.nodeBox(id);
        E.shape.setAttribute('d', nodePathD(box));
        if (E.stack) { E.stack.setAttribute('d', nodePathD(box)); E.stack.setAttribute('transform', 'translate(5 5)'); }
      }
      E.g.classList.toggle('selected', this.sel.has(id));
      E.g.classList.toggle('match', this.matches.has(id));
      E.g.classList.toggle('dragging', !!(this.drag && this.drag.pos.has(id)));
    }
    this.drawTimelines();
    const getNode = (id) => this.itemBox(id);
    const getBend = (vid) => this.cur.bends.get(vid);
    for (const [id, E] of this.els.edges) {
      const le = L.edges.get(id);
      const em = tab.edges[id];
      if (!le || !em) continue;
      const S = this.itemBox(le.from), T = this.itemBox(le.to);
      if (!S || !T) continue;
      const dragging = this.drag && (this.drag.pos.has(le.from) || this.drag.pos.has(le.to));
      const hint = dragging ? null : le.hint;
      const geo = edgeGeometry(em, hint, S, T, getNode, getBend);
      E.line.setAttribute('d', geo.d);
      E.hit.setAttribute('d', geo.hitD);
      clear(E.heads);
      for (const h of geo.heads) el('path', { d: h }, E.heads);
      const a = Math.min(this.cur.alpha.get(le.from) ?? 1, this.cur.alpha.get(le.to) ?? 1);
      E.g.setAttribute('opacity', a < 0.999 ? a.toFixed(3) : 1);
      E.g.classList.toggle('selected', this.sel.has(id));
      const Lb = this.els.labels.get(id);
      if (Lb) {
        Lb.g.setAttribute('transform', `translate(${Math.round(geo.mid.x * 100) / 100} ${Math.round(geo.mid.y * 100) / 100})`);
        Lb.g.classList.toggle('selected', this.sel.has(id));
        Lb.g.style.visibility = this.editing === id ? 'hidden' : '';
      }
    }
    this.drawOverlay();
  }

  // Redessinée seulement quand quelque chose a changé : une longue chronologie compte beaucoup de textes.
  drawTimelines() {
    const mode = this.host.getMode();
    const col = edgeColors(null, mode);
    const dotOf = (id) => {
      const c = this.els.nodes.get(id) && this.els.nodes.get(id).colors;
      return c ? (c.fill.toLowerCase() === '#ffffff' ? c.stroke : c.fill) : col.stroke;
    };
    const geos = (this.L.timelines || []).map((tl) => timelineGeometry(tl, (id) => this.itemBox(id))).filter(Boolean);
    const key = JSON.stringify([mode, geos, geos.map((g) => g.ticks.map((t) => dotOf(t.id)))]);
    if (key === this.timelineKey) return;
    this.timelineKey = key;
    clear(this.layerTimeline);
    for (const g of geos) drawTimeline(this.layerTimeline, g, { line: col.stroke, text: col.label, bg: CANVAS[mode] }, dotOf);
  }

  drawOverlay() {
    const ov = this.layerOverlay;
    clear(ov);
    const z = this.cam.z;
    for (const id of this.sel) {
      const b = this.nodeBox(id);
      if (!b) continue;
      el('rect', { class: 'sel-box', x: b.x - b.w / 2 - 5, y: b.y - b.h / 2 - 5, width: b.w + 10, height: b.h + 10, rx: 10, 'stroke-width': 2 / z }, ov);
    }
    // poignées « + »
    const hid = this.handlesFor;
    if (hid && !this.drag && !this.link && this.editing !== hid) {
      const b = this.itemBox(hid);
      const actions = b && this.host.handleActions ? this.host.handleActions(hid) : null;
      if (b && actions) {
        const off = 17 / Math.max(0.6, Math.min(1.4, z)) + 0;
        const r = 9.5 / Math.max(0.55, Math.min(1.4, z));
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const act = actions[side];
          if (!act) continue;
          const d = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side];
          const p = boundary(b.shape, b.w, b.h, b.trap, d[0], d[1]);
          const cx = b.x + p.x + d[0] * off, cy = b.y + p.y + d[1] * off;
          const g = el('g', { class: 'handle', 'data-handle': side, 'data-node': hid, transform: `translate(${cx} ${cy})` }, ov);
          el('circle', { r: r + 6, class: 'handle-hit' }, g);
          el('circle', { r, class: 'handle-dot' }, g);
          const s = r * 0.5;
          el('path', { d: `M${-s} 0H${s}M0 ${-s}V${s}`, class: 'handle-plus', 'stroke-width': 2 / Math.max(0.55, Math.min(1.4, z)) }, g);
          const t = el('title', null, g);
          t.textContent = act.label;
        }
      }
    }
    // aperçu d'une nouvelle flèche
    if (this.link) {
      const S = this.itemBox(this.link.from);
      if (S) {
        let tx = this.link.to.x, ty = this.link.to.y;
        const T = this.link.target ? this.itemBox(this.link.target) : null;
        if (T) {
          el('rect', { class: 'link-target', x: T.x - T.w / 2 - 6, y: T.y - T.h / 2 - 6, width: T.w + 12, height: T.h + 12, rx: 12, 'stroke-width': 2.5 / z }, ov);
          const q = boundary(T.shape, T.w, T.h, T.trap, S.x - T.x, S.y - T.y);
          tx = T.x + q.x; ty = T.y + q.y;
        }
        const p = boundary(S.shape, S.w, S.h, S.trap, tx - S.x, ty - S.y);
        el('path', { class: 'link-preview', d: `M${S.x + p.x} ${S.y + p.y}L${tx} ${ty}`, 'stroke-width': 2 / z, 'stroke-dasharray': `${6 / z} ${4 / z}` }, ov);
        el('circle', { class: 'link-end', cx: tx, cy: ty, r: 4 / z }, ov);
      }
    }
    // rectangle de sélection (écran)
    clear(this.screenOverlay);
    if (this.marquee) {
      const m = this.marquee;
      el('rect', { class: 'marquee', x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0) }, this.screenOverlay);
    }
  }
}

function gm_color(m) { return m && m.color ? m.color : null; }
