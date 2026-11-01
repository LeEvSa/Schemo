// Export d'un onglet en SVG autonome (base du PNG et du PDF).
import { tr } from '../i18n.js';
import { el, fillNodeText, fillCGroup, fillPaint, timelineGeometry, drawTimeline, shadowFilter, nodePathD, dashArray, FONT_FAMILY } from './draw.js';
import { edgeGeometry } from './edges.js';
import { nodeColors, groupColors, edgeColors } from './themes.js';

// Retourne { svg: chaîne, w, h }.
export function buildSVG(L, tab, measure, opts = {}) {
  const pad = opts.padding ?? 28;
  const bb = L.bbox;
  const w = Math.max(10, Math.ceil(bb.w + pad * 2)), h = Math.max(10, Math.ceil(bb.h + pad * 2));
  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'font-family': FONT_FAMILY });
  const look = tab.settings;
  const shadow = tab.settings.shadow;
  const defs = el('defs', null, svg);
  if (shadow) shadowFilter(defs);
  if (opts.background && opts.background !== 'transparent') el('rect', { x: 0, y: 0, width: w, height: h, fill: opts.background }, svg);
  const root = el('g', { transform: `translate(${pad - bb.x} ${pad - bb.y})` }, svg);
  const mode = 'light';
  const groups = [...L.groups.values()].sort((a, b) => a.depth - b.depth);
  for (const gl of groups) {
    const gm = tab.groups[gl.id];
    if (!gm) continue;
    const col = groupColors(look, gm.color, gl.depth, mode);
    el('rect', { x: gl.x, y: gl.y, width: gl.w, height: gl.h, rx: 14, fill: col.fill, stroke: col.stroke, 'stroke-width': 1.5 }, root);
    const t = el('text', { x: gl.x + 14, y: gl.y + 21, 'font-size': 13, 'font-weight': 650, fill: col.title }, root);
    t.textContent = gm.title || tr('Cadre');
  }
  const box = (id) => {
    const n = L.nodes.get(id);
    if (n) return { id, x: n.x, y: n.y, w: n.w, h: n.h, shape: n.shape, trap: n.trap };
    const g = L.groups.get(id);
    return g ? { id, x: g.x + g.w / 2, y: g.y + g.h / 2, w: g.w, h: g.h, shape: 'rect' } : null;
  };
  const ink = edgeColors(null, mode);
  const dotOf = (id) => {
    const n = L.nodes.get(id);
    if (!n) return ink.stroke;
    const c = nodeColors(look, n.ctx, tab.nodes[id] || (tab.groups[id] && tab.groups[id].color));
    return c.fill.toLowerCase() === '#ffffff' ? c.stroke : c.fill;
  };
  for (const tl of L.timelines || []) {
    const geo = timelineGeometry(tl, (id) => box(id));
    if (geo) drawTimeline(root, geo, { line: ink.stroke, text: ink.label, bg: opts.background && opts.background !== 'transparent' ? opts.background : '#ffffff' }, dotOf);
  }
  const edgesG = el('g', null, root);
  const labelsG = [];
  for (const le of L.edges.values()) {
    const em = tab.edges[le.id];
    const S = box(le.from), T = box(le.to);
    if (!em || !S || !T) continue;
    const geo = edgeGeometry(em, le.hint, S, T, box, (vid) => L.bends.get(vid));
    const col = edgeColors(em.color, mode);
    el('path', {
      d: geo.d, fill: 'none', stroke: col.stroke, 'stroke-width': em.width,
      'stroke-dasharray': dashArray(em.dash, em.width), 'stroke-linecap': em.dash === 'dotted' ? 'round' : 'butt',
    }, edgesG);
    for (const hd of geo.heads) el('path', { d: hd, fill: col.stroke }, edgesG);
    if (em.label) labelsG.push({ em, mid: geo.mid, col });
  }
  for (const nl of L.nodes.values()) {
    const isG = nl.kind === 'cgroup';
    const m = isG ? tab.groups[nl.id] : tab.nodes[nl.id];
    if (!m) continue;
    const colors = isG ? nodeColors(look, { depth: 0, seq: 0, seqLen: 1, branch: -1 }, m.color) : nodeColors(look, nl.ctx, m);
    const paint = fillPaint(colors, defs);
    const g = el('g', { transform: `translate(${nl.x} ${nl.y})` }, root);
    if (isG) el('path', { d: nodePathD(nl), fill: paint, stroke: colors.stroke, opacity: 0.45, transform: 'translate(5 5)' }, g);
    el('path', { d: nodePathD(nl), fill: paint, stroke: colors.stroke, 'stroke-width': 1.5, filter: shadow ? 'url(#sh)' : null }, g);
    const tg = el('g', null, g);
    if (isG) fillCGroup(tg, nl, colors, m.title); else fillNodeText(tg, nl, colors.text);
  }
  for (const { em, mid, col } of labelsG) {
    const lw = Math.min(240, measure(em.label, 12, 400)) + 12;
    const g = el('g', { transform: `translate(${mid.x} ${mid.y})` }, root);
    el('rect', { x: -lw / 2, y: -10.5, width: lw, height: 19, rx: 5, fill: opts.background && opts.background !== 'transparent' ? opts.background : '#ffffff', opacity: 0.94 }, g);
    const t = el('text', { y: 4.2, 'text-anchor': 'middle', 'font-size': 12, fill: col.label }, g);
    t.textContent = em.label;
  }
  const str = new XMLSerializer().serializeToString(svg);
  return { svg: '<?xml version="1.0" encoding="UTF-8"?>\n' + str, w, h };
}

// SVG → PNG (base64) via un canevas.
export function svgToPngBase64(svgStr, w, h, scale) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const max = 16000;
        const s = Math.min(scale, max / w, max / h);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * s));
        c.height = Math.max(1, Math.round(h * s));
        const ctx = c.getContext('2d');
        ctx.scale(s, s);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png').split(',')[1]);
      } catch (err) { reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr('Impossible de produire l’image.'))); };
    img.src = url;
  });
}
