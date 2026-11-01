// Modèle de document Schémo : onglets, cases (nodes), flèches (edges), cadres (groups).
import { tr } from './i18n.js';
import { defaultColors } from './render/themes.js';

export const SHAPES = ['rounded', 'rect', 'pill', 'ellipse', 'circle', 'diamond', 'hexagon', 'parallelogram'];
export const LAYOUT_SHAPES = ['auto', 'cycle', 'hierarchy', 'process', 'list', 'pyramid', 'radial', 'timeline'];
export const DIRECTIONS = ['mixed', 'TB', 'LR'];
export const SPACINGS = ['compact', 'normal', 'aere'];
export const GRAD_DIRS = ['h', 'v', 'd'];

let counter = 0;
export function uid(prefix) {
  counter = (counter + 1) % 1679616;
  return prefix + Date.now().toString(36).slice(-6) + counter.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 5);
}

export function defaultSettings() {
  return { shape: 'auto', direction: 'mixed', theme: 'bleu', spacing: 'normal', shadow: true, colors: defaultColors() };
}

export function createTab(name) {
  return { id: uid('t'), name, nodes: {}, edges: {}, groups: {}, settings: defaultSettings(), seq: 1, positions: {}, view: null };
}

export function createDoc() {
  const t = createTab(tr('Diagramme 1'));
  return { format: 'schemo', version: 1, tabs: [t], active: t.id };
}

export function nextOrder(tab) {
  const o = tab.seq;
  tab.seq = Math.floor(tab.seq) + 1;
  return o;
}

export function createNode(tab, props = {}) {
  const n = {
    id: uid('n'), title: '', desc: '', date: '', shape: 'rounded', color: null, color2: null, gradDir: 'h', textColor: null, borderColor: null,
    group: null, pin: null, order: nextOrder(tab), ...props,
  };
  tab.nodes[n.id] = n;
  return n;
}

export function createEdge(tab, from, to, props = {}) {
  const e = {
    id: uid('e'), from, to, label: '', routing: 'auto', dash: 'solid', width: 2,
    color: null, arrows: 'end', order: nextOrder(tab), ...props,
  };
  tab.edges[e.id] = e;
  return e;
}

export function createGroup(tab, props = {}) {
  const g = {
    id: uid('g'), title: tr('Cadre'), group: null, collapsed: false, shape: 'inherit',
    color: null, pin: null, order: nextOrder(tab), ...props,
  };
  tab.groups[g.id] = g;
  return g;
}

export const isNodeId = (id) => typeof id === 'string' && id[0] === 'n';
export const isEdgeId = (id) => typeof id === 'string' && id[0] === 'e';
export const isGroupId = (id) => typeof id === 'string' && id[0] === 'g';

export function itemOf(tab, id) {
  return tab.nodes[id] || tab.groups[id] || tab.edges[id] || null;
}

// Parent (cadre) d'une case ou d'un cadre.
export function parentOf(tab, id) {
  const it = tab.nodes[id] || tab.groups[id];
  return it ? it.group || null : null;
}

// Vrai si `gid` est `ancestor` ou un de ses descendants.
export function isInsideGroup(tab, gid, ancestor) {
  let cur = gid;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    if (cur === ancestor) return true;
    seen.add(cur);
    cur = tab.groups[cur] ? tab.groups[cur].group : null;
  }
  return false;
}

// Un bout de flèche : une case ou un cadre.
export function itemExists(tab, id) { return !!(tab.nodes[id] || tab.groups[id]); }

// Une flèche peut relier deux cases ou cadres, sauf un cadre et ce qu'il contient.
export function canLink(tab, a, b) {
  if (a === b || !itemExists(tab, a) || !itemExists(tab, b)) return false;
  const parent = (id) => (tab.nodes[id] || tab.groups[id]).group;
  return !(tab.groups[a] && isInsideGroup(tab, parent(b), a)) && !(tab.groups[b] && isInsideGroup(tab, parent(a), b));
}

export function groupDepth(tab, gid) {
  let d = 0, cur = gid;
  const seen = new Set();
  while (cur && tab.groups[cur] && !seen.has(cur)) { seen.add(cur); d++; cur = tab.groups[cur].group; }
  return d;
}

export function edgesOf(tab, nodeId) {
  return Object.values(tab.edges).filter((e) => e.from === nodeId || e.to === nodeId);
}

// Supprime des cases / flèches / cadres. Les cadres sont dissous (contenu gardé) sauf si withContent.
export function deleteItems(tab, ids, withContent = false) {
  const set = new Set(ids);
  if (withContent) {
    // ajoute tout le contenu des cadres supprimés
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of Object.values(tab.nodes)) if (n.group && set.has(n.group) && !set.has(n.id)) { set.add(n.id); grew = true; }
      for (const g of Object.values(tab.groups)) if (g.group && set.has(g.group) && !set.has(g.id)) { set.add(g.id); grew = true; }
    }
  }
  for (const id of set) {
    if (tab.groups[id]) {
      const parent = tab.groups[id].group;
      for (const n of Object.values(tab.nodes)) if (n.group === id) { n.group = parent && !set.has(parent) ? parent : null; n.pin = null; }
      for (const g of Object.values(tab.groups)) if (g.group === id) { g.group = parent && !set.has(parent) ? parent : null; g.pin = null; }
      delete tab.groups[id];
    }
  }
  for (const id of set) {
    if (tab.nodes[id]) delete tab.nodes[id];
    if (tab.edges[id]) delete tab.edges[id];
  }
  for (const e of Object.values(tab.edges)) {
    if (!itemExists(tab, e.from) || !itemExists(tab, e.to)) delete tab.edges[e.id];
  }
  for (const id of Object.keys(tab.positions || {})) {
    if (!tab.nodes[id] && !tab.groups[id]) delete tab.positions[id];
  }
}

// Ordre à insérer juste après (dir=1) ou juste avant (dir=-1) une case.
export function orderBeside(tab, id, dir) {
  const it = tab.nodes[id] || tab.groups[id];
  const o = it.order;
  let best = null;
  for (const x of [...Object.values(tab.nodes), ...Object.values(tab.groups)]) {
    if (x.id === id) continue;
    if (dir > 0 && x.order > o && (best === null || x.order < best)) best = x.order;
    if (dir < 0 && x.order < o && (best === null || x.order > best)) best = x.order;
  }
  if (best === null) return dir > 0 ? o + 1 : o - 1;
  return (o + best) / 2;
}

// ---------- Chargement / enregistrement ----------

function str(v, d = '') { return typeof v === 'string' ? v : d; }
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
function pick(v, list, d) { return list.includes(v) ? v : d; }

const hexOr = (v, d = null) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

// Description en Markdown ; les anciens fichiers avaient des sous-points, qui deviennent une liste.
function readDesc(n) {
  if (typeof n.desc === 'string') return n.desc;
  if (!Array.isArray(n.bullets)) return '';
  return n.bullets.map((b) => str(b).trim()).filter(Boolean).map((b) => '- ' + b).join('\n');
}

function normalizeColors(raw) {
  const d = defaultColors(), c = raw && typeof raw === 'object' ? raw : {};
  return {
    base: hexOr(c.base, d.base), from: hexOr(c.from, d.from), to: hexOr(c.to, d.to),
    gradStyle: pick(c.gradStyle, ['steps', 'inside'], d.gradStyle),
    gradDir: pick(c.gradDir, GRAD_DIRS, d.gradDir),
    palette: Array.isArray(c.palette) && c.palette.length && c.palette.every((x) => hexOr(x)) ? [...c.palette] : null,
    text: hexOr(c.text), border: hexOr(c.border),
  };
}

export function normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tabs)) throw new Error(tr('Ce fichier n’est pas un diagramme Schémo valide.'));
  const doc = { format: 'schemo', version: 1, tabs: [], active: null };
  for (const rt of raw.tabs) {
    const t = createTab(str(rt.name, tr('Diagramme')));
    if (typeof rt.id === 'string') t.id = rt.id;
    const s = rt.settings || {};
    t.settings = {
      shape: pick(s.shape, LAYOUT_SHAPES, 'auto'),
      direction: pick(s.direction, DIRECTIONS, 'mixed'),
      theme: str(s.theme, 'bleu'),
      spacing: pick(s.spacing, SPACINGS, 'normal'),
      shadow: s.shadow !== false,
      colors: normalizeColors(s.colors),
    };
    let maxOrder = 0;
    for (const g of Object.values(rt.groups || {})) {
      if (!g || typeof g.id !== 'string') continue;
      t.groups[g.id] = {
        id: g.id, title: str(g.title, tr('Cadre')), group: typeof g.group === 'string' ? g.group : null,
        collapsed: !!g.collapsed, shape: pick(g.shape, ['inherit', ...LAYOUT_SHAPES], 'inherit'),
        color: typeof g.color === 'string' ? g.color : null,
        pin: g.pin && isFinite(g.pin.x) && isFinite(g.pin.y) ? { x: g.pin.x, y: g.pin.y } : null,
        order: num(g.order, 0),
      };
      maxOrder = Math.max(maxOrder, t.groups[g.id].order);
    }
    for (const g of Object.values(t.groups)) {
      if (g.group && (!t.groups[g.group] || isInsideGroup(t, g.group, g.id))) g.group = null;
    }
    for (const n of Object.values(rt.nodes || {})) {
      if (!n || typeof n.id !== 'string') continue;
      t.nodes[n.id] = {
        id: n.id, title: str(n.title), desc: readDesc(n), date: str(n.date),
        shape: pick(n.shape, SHAPES, 'rounded'), color: typeof n.color === 'string' ? n.color : null,
        color2: hexOr(n.color2), gradDir: pick(n.gradDir, GRAD_DIRS, 'h'), textColor: hexOr(n.textColor), borderColor: hexOr(n.borderColor),
        group: typeof n.group === 'string' && t.groups[n.group] ? n.group : null,
        pin: n.pin && isFinite(n.pin.x) && isFinite(n.pin.y) ? { x: n.pin.x, y: n.pin.y } : null,
        order: num(n.order, 0),
      };
      maxOrder = Math.max(maxOrder, t.nodes[n.id].order);
    }
    for (const e of Object.values(rt.edges || {})) {
      if (!e || typeof e.id !== 'string' || !itemExists(t, e.from) || !itemExists(t, e.to)) continue;
      t.edges[e.id] = {
        id: e.id, from: e.from, to: e.to, label: str(e.label),
        routing: pick(e.routing, ['auto', 'straight', 'curve', 'ortho'], 'auto'),
        dash: pick(e.dash, ['solid', 'dashed', 'dotted'], 'solid'),
        width: Math.min(6, Math.max(1, num(e.width, 2))),
        color: typeof e.color === 'string' ? e.color : null,
        arrows: pick(e.arrows, ['end', 'none', 'both'], 'end'),
        order: num(e.order, 0),
      };
      maxOrder = Math.max(maxOrder, t.edges[e.id].order);
    }
    t.seq = Math.max(num(rt.seq, 1), Math.floor(maxOrder) + 1);
    if (rt.positions && typeof rt.positions === 'object') {
      for (const [k, p] of Object.entries(rt.positions)) {
        if (p && isFinite(p.x) && isFinite(p.y) && (t.nodes[k] || t.groups[k])) t.positions[k] = { x: p.x, y: p.y };
      }
    }
    if (rt.view && isFinite(rt.view.x) && isFinite(rt.view.y) && isFinite(rt.view.z)) t.view = { x: rt.view.x, y: rt.view.y, z: rt.view.z };
    doc.tabs.push(t);
  }
  if (!doc.tabs.length) doc.tabs.push(createTab(tr('Diagramme 1')));
  doc.active = doc.tabs.some((t) => t.id === raw.active) ? raw.active : doc.tabs[0].id;
  return doc;
}

export function serializeDoc(doc) {
  const out = {
    format: 'schemo', version: 1, app: 'Schémo', active: doc.active,
    tabs: doc.tabs.map((t) => {
      const positions = {};
      for (const [k, p] of Object.entries(t.positions || {})) positions[k] = { x: Math.round(p.x), y: Math.round(p.y) };
      return {
        id: t.id, name: t.name, settings: t.settings, seq: t.seq,
        nodes: t.nodes, edges: t.edges, groups: t.groups, positions,
        view: t.view ? { x: Math.round(t.view.x), y: Math.round(t.view.y), z: +t.view.z.toFixed(3) } : null,
      };
    }),
  };
  return JSON.stringify(out, null, 1);
}

// Instantané pour annuler/rétablir (sans positions ni vue).
export function snapshotDoc(doc) {
  return JSON.stringify(doc, (k, v) => (k === 'positions' || k === 'view' ? undefined : v));
}

export function restoreSnapshot(doc, snap) {
  const data = JSON.parse(snap);
  const prev = new Map(doc.tabs.map((t) => [t.id, t]));
  for (const t of data.tabs) {
    const old = prev.get(t.id);
    t.positions = old ? old.positions : {};
    t.view = old ? old.view : null;
  }
  return data;
}
