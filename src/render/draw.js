// Construction des éléments SVG (partagée par l'affichage en direct et l'export).
import { tr } from '../i18n.js';
import { shapePath } from './geometry.js';
import { FONT, MONO, T } from '../layout/sizing.js';
import { GT } from '../layout/engine.js';

export const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }

const r2 = (v) => Math.round(v * 100) / 100;

export const PIN_PATH = 'M-3 -6h6l-.8 4.2 2.6 2.6v1h-9.6v-1l2.6-2.6zM0 1.8v4.4';

function fillRuns(t, l) {
  for (const r of l.runs) {
    const deco = [r.strike && 'line-through', r.link && 'underline'].filter(Boolean).join(' ');
    const s = el('tspan', {
      'font-weight': r.bold ? Math.max(700, l.weight) : null,
      'font-style': r.italic ? 'italic' : null,
      'font-family': r.code ? MONO : null,
      'text-decoration': deco || null,
    }, t);
    s.textContent = r.text;
  }
}

function drawMarker(g, l, x, base, color) {
  if (l.marker === 'dot') {
    // ronds pleins au premier niveau, ronds vides dans les sous-listes
    const r = r2(l.size * 0.15), cy = r2(base - l.size * 0.33);
    if (l.level) el('circle', { cx: r2(x), cy, r, fill: 'none', stroke: color, 'stroke-width': 1 }, g);
    else el('circle', { cx: r2(x), cy, r, fill: color }, g);
    return;
  }
  const t = el('text', { x: r2(x), y: r2(base), 'text-anchor': 'end', 'font-size': r2(l.size), 'font-weight': l.weight, fill: color }, g);
  t.textContent = l.marker;
}

// Texte d'une case (centré sur 0,0).
export function fillNodeText(g, n, color) {
  clear(g);
  const tb = n.text;
  if (!tb || !tb.lines.length) return;
  const top = -tb.height / 2;
  const left = -tb.width / 2;
  for (const l of tb.lines) {
    if (!l.text && tb.lines.length === 1) continue;
    const base = top + l.y + (l.size * T.line) / 2 + l.size * 0.34;
    if (tb.centered) {
      const t = el('text', { x: 0, y: r2(base), 'text-anchor': 'middle', 'font-size': r2(l.size), 'font-weight': l.weight, fill: color }, g);
      t.textContent = l.text;
    } else {
      if (l.rule) {
        const ry = r2(top + l.y + l.size * 0.35);
        el('line', { x1: r2(left), x2: r2(left + tb.width), y1: ry, y2: ry, stroke: color, 'stroke-opacity': 0.5, 'stroke-width': 1 }, g);
        continue;
      }
      if (l.marker) drawMarker(g, l, left + l.markerX, base, color);
      if (l.quote) el('rect', { x: r2(left), y: r2(top + l.y), width: 2, height: r2(l.size * T.line), fill: color, opacity: 0.55 }, g);
      // white-space:pre : les espaces entre deux morceaux de styles différents restent là
      const t = el('text', { x: r2(left + l.indent), y: r2(base), 'font-size': r2(l.size), 'font-weight': l.weight, fill: color, style: 'white-space:pre' }, g);
      if (l.runs) fillRuns(t, l); else t.textContent = l.text;
    }
  }
}

export function pinBadge(parent, w, h, id) {
  const g = el('g', { class: 'npin', 'data-pin': id, transform: `translate(${r2(w / 2 - 3)} ${r2(-h / 2 + 3)})` }, parent);
  el('circle', { r: 9.5, fill: '#ffffff', stroke: '#d94a64', 'stroke-width': 1.5 }, g);
  el('path', { d: PIN_PATH, fill: '#d94a64', stroke: '#d94a64', 'stroke-width': 1.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
  const t = el('title', null, g);
  t.textContent = tr('Case épinglée — cliquer pour la relâcher');
  return g;
}

// Contenu d'une case « cadre replié ».
export function fillCGroup(g, n, colors, title) {
  clear(g);
  const t = el('text', { x: -n.w / 2 + 14, y: -3, 'font-size': 13.5, 'font-weight': 600, fill: colors.text }, g);
  t.textContent = title || tr('Cadre');
  const c = el('text', { x: -n.w / 2 + 14, y: 15, 'font-size': 11.5, fill: colors.text, opacity: 0.8 }, g);
  c.textContent = `${n.count || 0} case${(n.count || 0) > 1 ? 's' : ''} — cadre replié`;
}

export function chevron(parent, x, y, open, color, id) {
  const g = el('g', { class: 'gtoggle', 'data-toggle': id, transform: `translate(${r2(x)} ${r2(y)})` }, parent);
  el('rect', { x: -10, y: -10, width: 20, height: 20, rx: 5, fill: 'transparent' }, g);
  el('path', { d: open ? 'M-4.5 -2 0 2.5 4.5 -2' : 'M-2 -4.5 2.5 0 -2 4.5', fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
  const tt = el('title', null, g);
  tt.textContent = open ? tr('Replier le cadre') : tr('Déplier le cadre');
  return g;
}

export function shadowFilter(defs, id = 'sh') {
  const f = el('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '170%' }, defs);
  el('feDropShadow', { dx: 0, dy: 1.6, stdDeviation: 2.4, 'flood-color': '#0b1220', 'flood-opacity': 0.2 }, f);
  return f;
}

// Remplissage d'une case : sa couleur, ou un dégradé ajouté aux <defs> la première fois qu'il sert.
export function fillPaint(colors, defs) {
  const g = colors.grad;
  if (!g) return colors.fill;
  const id = ('gr' + g.from + g.to + g.dir).replace(/[^\w]/g, '');
  if (!defs.querySelector('#' + id)) {
    const lg = el('linearGradient', { id, x1: 0, y1: 0, x2: g.dir === 'v' ? 0 : 1, y2: g.dir === 'h' ? 0 : 1 }, defs);
    el('stop', { offset: 0, 'stop-color': g.from }, lg);
    el('stop', { offset: 1, 'stop-color': g.to }, lg);
  }
  return `url(#${id})`;
}

// Ligne du temps à partir des positions courantes des cases : elle les suit pendant une animation ou un déplacement.
// La position de la ligne est la médiane de ce que dit chaque case, pour qu'une case tirée à la souris ne l'emporte pas.
export function timelineGeometry(tl, boxOf) {
  const horiz = tl.axis === 'LR';
  const marks = tl.members.map((m) => ({ m, b: boxOf(m.id) })).filter((x) => x.b);
  if (!marks.length) return null;
  const guesses = marks.map(({ m, b }) => (horiz ? b.y - m.side * (b.h / 2 + tl.stem) : b.x - m.side * (b.w / 2 + tl.stem))).sort((p, q) => p - q);
  const at = r2(guesses[Math.floor(guesses.length / 2)]);
  const along = marks.map(({ b }) => (horiz ? b.x : b.y));
  const ticks = marks.map(({ m, b }) => (horiz
    ? { id: m.id, label: m.label, x: r2(b.x), y: at, ex: r2(b.x), ey: r2(b.y - m.side * b.h / 2), lx: r2(b.x), ly: m.side < 0 ? at + 21 : at - 12 }
    : { id: m.id, label: m.label, x: at, y: r2(b.y), ex: r2(b.x - b.w / 2), ey: r2(b.y), lx: at - 14, ly: r2(b.y + 4.5) }));
  const start = r2(Math.min(...along) - 30), end = r2(Math.max(...along) + 30);
  // Une période : une bande depuis son point jusqu'à sa date de fin, située entre les cases voisines (les cases sont espacées également).
  const bandEnd = (i, last) => {
    if (last === Infinity) return end;
    let j = i;
    while (j + 1 < marks.length && marks[j + 1].m.k <= last) j++;
    if (j + 1 === marks.length) return last > marks[j].m.k ? along[j] + 22 : along[j];
    const k0 = marks[j].m.k, k1 = marks[j + 1].m.k;
    return along[j] + (along[j + 1] - along[j]) * (k1 > k0 ? Math.min(1, Math.max(0, (last - k0) / (k1 - k0))) : 0);
  };
  const lanes = [], bands = [];
  marks.forEach(({ m }, i) => {
    if (m.end === null || m.end === undefined) return;
    const from = along[i], to = Math.max(from + 14, bandEnd(i, m.end));
    // deux périodes qui se chevauchent : l'une à côté de l'autre plutôt que confondues
    let lane = lanes.findIndex((x) => x <= from);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = to + 4;
    bands.push({ id: m.id, from: r2(from), to: r2(to), off: [0, 8, -8][lane % 3] });
  });
  return { horiz, at, start, end, ticks, bands };
}

// colors : { line, text } ; dotOf(id) : couleur du point de chaque case.
export function drawTimeline(parent, geo, colors, dotOf) {
  const { horiz, at, start, end } = geo;
  const a = horiz ? { x: start, y: at } : { x: at, y: start };
  const z = horiz ? { x: end, y: at } : { x: at, y: end };
  el('line', { x1: a.x, y1: a.y, x2: z.x, y2: z.y, stroke: colors.line, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, parent);
  // la pointe dit dans quel sens le temps avance
  const tip = horiz ? `M${end + 12} ${at}L${end} ${at - 6}L${end} ${at + 6}Z` : `M${at} ${end + 12}L${at - 6} ${end}L${at + 6} ${end}Z`;
  el('path', { d: tip, fill: colors.line }, parent);
  for (const b of geo.bands) {
    const pos = at + b.off;
    el('line', { ...(horiz ? { x1: b.from, y1: pos, x2: b.to, y2: pos } : { x1: pos, y1: b.from, x2: pos, y2: b.to }), stroke: dotOf(b.id), 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-opacity': 0.6 }, parent);
  }
  for (const t of geo.ticks) {
    el('line', { x1: t.x, y1: t.y, x2: t.ex, y2: t.ey, stroke: colors.line, 'stroke-width': 1.5 }, parent);
    el('circle', { cx: t.x, cy: t.y, r: 6, fill: dotOf(t.id), stroke: colors.bg, 'stroke-width': 2 }, parent);
    if (t.label) {
      const lab = el('text', { class: 'tl-date', 'data-id': t.id, x: t.lx, y: t.ly, 'text-anchor': horiz ? 'middle' : 'end', 'font-size': 12.5, 'font-weight': 650, fill: colors.text }, parent);
      lab.textContent = t.label;
    }
  }
}

export function nodePathD(n) { return shapePath(n.shape, n.w, n.h, n.trap); }

export function dashArray(dash, width) {
  if (dash === 'dashed') return `${r2(width * 3.5 + 2)} ${r2(width * 2.5 + 2)}`;
  if (dash === 'dotted') return `0.1 ${r2(width * 2.4 + 1.5)}`;
  return null;
}

export const FONT_FAMILY = FONT;
export const GROUP_TITLE_H = GT;
