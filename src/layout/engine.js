// Moteur de disposition de Schémo.
// Détecte la structure (boucle → cercle, arbre → hiérarchie, chaîne → processus, mélange → couches),
// range chaque cadre récursivement, garde les cases épinglées à leur place et stabilise la position
// des groupes d'un calcul à l'autre.
import { uniquePairs, adjacency, weakComponents, scc, flowOrder, cycleOrder } from './graph.js';
import { fitUniform, collapsedSize, groupTitleWidth } from './sizing.js';
import * as AR from './arrange.js';
import { layeredArrange } from './layered.js';
import { chronoOrder } from './dates.js';

export const GP = 16; // marge intérieure d'un cadre
export const GT = 36; // hauteur réservée au titre d'un cadre

export function spacingOf(settings) {
  const f = { compact: 0.72, normal: 1, aere: 1.4 }[settings.spacing] || 1;
  return { gap: 34 * f, level: 56 * f, arrow: 48 * f, comp: 64 * f, f };
}

function resolveAxis(kind, direction) {
  if (direction === 'TB') return 'TB';
  if (direction === 'LR') return 'LR';
  return kind === 'chain' ? 'LR' : 'TB';
}

function buildContext(tab, measure, opts) {
  const nodes = tab.nodes, groups = tab.groups;
  const settings = tab.settings;
  const outerCollapsed = (gid) => {
    let cur = gid, res = null;
    const seen = new Set();
    while (cur && groups[cur] && !seen.has(cur)) {
      seen.add(cur);
      if (groups[cur].collapsed) res = cur;
      cur = groups[cur].group;
    }
    return res;
  };
  const C = {
    tab, nodes, groups, measure, settings,
    sp: spacingOf(settings),
    direction: settings.direction || 'mixed',
    prev: tab.positions || {},
    focus: opts.focus || null,
    hints: opts.hints || {},
    children: new Map(),
    scopeEdges: new Map(),
    visibleEdges: [],
  };
  C.orderOf = (id) => (nodes[id] || groups[id] || { order: 0 }).order;
  C.pinOf = (id) => (nodes[id] || groups[id] || {}).pin || null;
  C.parentScope = (id) => (nodes[id] || groups[id] || {}).group || null;
  C.shapeOf = (scope) => {
    let cur = scope;
    const seen = new Set();
    while (cur && groups[cur] && !seen.has(cur)) {
      seen.add(cur);
      if (groups[cur].shape && groups[cur].shape !== 'inherit') return groups[cur].shape;
      cur = groups[cur].group;
    }
    return settings.shape || 'auto';
  };
  const visible = [];
  for (const g of Object.values(groups)) if (!outerCollapsed(g.group)) visible.push(g.id);
  for (const n of Object.values(nodes)) if (!outerCollapsed(n.group)) visible.push(n.id);
  for (const id of visible) {
    const p = C.parentScope(id);
    if (!C.children.has(p)) C.children.set(p, []);
    C.children.get(p).push(id);
  }
  for (const l of C.children.values()) l.sort((a, b) => C.orderOf(a) - C.orderOf(b));
  C.countInside = (gid) => {
    let c = 0;
    for (const n of Object.values(nodes)) {
      let cur = n.group;
      const seen = new Set();
      while (cur && !seen.has(cur)) { if (cur === gid) { c++; break; } seen.add(cur); cur = groups[cur] ? groups[cur].group : null; }
    }
    return c;
  };
  // Un bout de flèche : une case ou un cadre. Caché dans un cadre replié, il devient ce cadre.
  const visibleEndpoint = (id) => outerCollapsed(nodes[id] ? nodes[id].group : id) || id;
  const seenPairs = new Set();
  const scopesUp = (id) => {
    const res = [];
    let cur = C.parentScope(id);
    const seen = new Set();
    while (cur && !seen.has(cur)) { res.push(cur); seen.add(cur); cur = C.parentScope(cur); }
    res.push(null);
    return res;
  };
  const itemAt = (scope, x) => {
    let cur = x;
    let guard = 0;
    while (C.parentScope(cur) !== scope && guard++ < 1000) cur = C.parentScope(cur);
    return cur;
  };
  const edges = Object.values(tab.edges).sort((a, b) => a.order - b.order);
  for (const e of edges) {
    if (!(nodes[e.from] || groups[e.from]) || !(nodes[e.to] || groups[e.to])) continue;
    const a = visibleEndpoint(e.from), b = visibleEndpoint(e.to);
    if (a === b) continue;
    // case glissée dans le cadre auquel elle est reliée : la flèche n'est plus dessinée, elle revient si la case ressort
    if (scopesUp(a).includes(b) || scopesUp(b).includes(a)) continue;
    const remapped = a !== e.from || b !== e.to;
    if (remapped) {
      const k = a + '>' + b;
      if (seenPairs.has(k)) continue;
      seenPairs.add(k);
    }
    C.visibleEdges.push({ id: e.id, a, b, remapped });
    const upA = scopesUp(a), upB = new Set(scopesUp(b));
    const lca = upA.find((s) => upB.has(s)) ?? null;
    const u = itemAt(lca, a), v = itemAt(lca, b);
    if (u === v) continue;
    if (!C.scopeEdges.has(lca)) C.scopeEdges.set(lca, []);
    C.scopeEdges.get(lca).push({ id: e.id, u, v, label: e.label || '', direct: u === a && v === b });
  }
  return C;
}

function single(id, axis) {
  const A = AR.emptyArrangement();
  A.pos.set(id, { x: 0, y: 0 });
  A.ctx.set(id, { role: 'single', axis, depth: 0, seq: 0, seqLen: 1, branch: 0 });
  return A;
}

const aspectScore = (A, size) => {
  const bb = AR.arrangementBBox(A, size);
  const r = bb.w / Math.max(1, bb.h);
  return Math.abs(Math.log(r / 1.6));
};

// En mode « mixte », un grand arbre ou graphe en couches trop étalé est essayé dans l'autre sens ;
// on garde le plus proche d'un écran (16:10).
async function autoArrange(C, comp, edges, size) {
  const A = await autoArrangeDir(C, comp, edges, size, C.direction);
  if (C.direction !== 'mixed' || comp.length < 12) return A;
  const roles = new Set([...A.ctx.values()].map((c) => c.role));
  if (!(roles.has('tree') || roles.has('layered')) || roles.has('cycle')) return A;
  const bb = AR.arrangementBBox(A, size);
  if (bb.w / Math.max(1, bb.h) < 3.2) return A;
  const B = await autoArrangeDir(C, comp, edges, size, 'LR');
  return aspectScore(B, size) < aspectScore(A, size) - 0.25 ? B : A;
}

async function autoArrangeDir(C, comp, edges, size, dir) {
  const n = comp.length;
  if (n === 1) return single(comp[0], resolveAxis('chain', dir));
  const set = new Set(comp);
  const pairs = uniquePairs(edges, set);
  const { out, inn } = adjacency(comp, pairs);
  const cycles = scc(comp, out).filter((s) => s.length >= 2);
  if (cycles.length === 1 && cycles[0].length === n) {
    return AR.cycleArrange(cycleOrder(comp, pairs, C.orderOf), edges, size, C.sp, resolveAxis('cycle', dir));
  }
  const cid = new Map();
  cycles.forEach((c, i) => c.forEach((id) => cid.set(id, 'C' + i)));
  const rep = (id) => cid.get(id) || id;
  const cnodes = new Set(comp.map(rep));
  const upairs = new Set();
  for (const { u, v } of pairs) {
    const a = rep(u), b = rep(v);
    if (a !== b) upairs.add(a < b ? a + '|' + b : b + '|' + a);
  }
  const isUTree = upairs.size === cnodes.size - 1;
  if (cycles.length === 1 && isUTree) {
    const members = cycleOrder(cycles[0], pairs, C.orderOf);
    const memberSet = new Set(members);
    const nb = new Map(comp.map((id) => [id, []]));
    for (const { u, v } of pairs) {
      if (memberSet.has(u) && memberSet.has(v)) continue;
      nb.get(u).push(v);
      nb.get(v).push(u);
    }
    for (const l of nb.values()) l.sort((a, b) => C.orderOf(a) - C.orderOf(b));
    const rayKids = new Map(comp.map((id) => [id, []]));
    const seen = new Set(members);
    const queue = [...members];
    while (queue.length) {
      const v = queue.shift();
      for (const w of nb.get(v)) {
        if (seen.has(w)) continue;
        seen.add(w);
        rayKids.get(v).push(w);
        queue.push(w);
      }
    }
    return AR.cycleArrange(members, edges, size, C.sp, resolveAxis('cycle', dir), rayKids);
  }
  if (!cycles.length) {
    const isPath = pairs.length === n - 1 && comp.every((id) => out.get(id).length <= 1 && inn.get(id).length <= 1);
    if (isPath) {
      return AR.snakeArrange(flowOrder(comp, pairs, C.orderOf), edges, size, C.sp, resolveAxis('chain', dir), C.measure);
    }
    const roots = comp.filter((id) => inn.get(id).length === 0);
    const isOutTree = pairs.length === n - 1 && roots.length === 1 && comp.every((id) => id === roots[0] || inn.get(id).length === 1);
    if (isOutTree) return AR.treeArrange(roots[0], comp, pairs, edges, size, C.sp, resolveAxis('tree', dir), C.orderOf, C.measure);
    return layeredArrange(comp, edges.map((e) => ({ ...e, route: e.direct })), size, C.sp, resolveAxis('layered', dir), C.orderOf, C.measure);
  }
  return layeredWithCycles(C, comp, cycles, pairs, edges, size, dir);
}

// Graphe mêlé : chaque boucle devient un cercle, le reste est rangé en couches autour.
async function layeredWithCycles(C, comp, cycles, pairs, edges, size, dir) {
  const axis = resolveAxis('layered', dir);
  const blockMap = new Map();
  cycles.forEach((c, i) => {
    const cset = new Set(c);
    const m0 = cycleOrder(c, pairs, C.orderOf);
    const k = m0.length;
    const score = new Map(m0.map((m) => [m, 0]));
    for (const { u, v } of pairs) {
      if (!cset.has(u) && cset.has(v)) score.set(v, score.get(v) + 1);
      if (cset.has(u) && !cset.has(v)) score.set(u, score.get(u) - 1);
    }
    const start = k === 2 ? (axis === 'TB' ? -Math.PI / 2 : Math.PI) : -Math.PI / 2;
    let best = 0, bestCost = Infinity;
    for (let r = 0; r < k; r++) {
      let cost = 0;
      for (let j = 0; j < k; j++) {
        const th = start + (2 * Math.PI * ((j - r + k) % k)) / k;
        cost += score.get(m0[j]) * (axis === 'TB' ? Math.sin(th) : Math.cos(th));
      }
      if (cost < bestCost - 1e-9) { bestCost = cost; best = r; }
    }
    const members = [...m0.slice(best), ...m0.slice(0, best)];
    const inner = edges.filter((e) => cset.has(e.u) && cset.has(e.v));
    const sub = AR.cycleArrange(members, inner, size, C.sp, axis);
    const bb = AR.arrangementBBox(sub, size);
    AR.translateArrangement(sub, -bb.x, -bb.y);
    blockMap.set('C' + i, { members, sub, w: bb.w, h: bb.h, order: Math.min(...c.map(C.orderOf)) });
  });
  const superOf = new Map();
  for (const [bid, b] of blockMap) for (const m of b.members) superOf.set(m, bid);
  const items2 = comp.filter((id) => !superOf.has(id)).concat([...blockMap.keys()]);
  const size2 = (id) => (blockMap.has(id) ? { w: blockMap.get(id).w, h: blockMap.get(id).h } : size(id));
  const order2 = (id) => (blockMap.has(id) ? blockMap.get(id).order : C.orderOf(id));
  const edges2 = [];
  for (const e of edges) {
    const a = superOf.get(e.u) || e.u, b = superOf.get(e.v) || e.v;
    if (a === b) continue;
    const plain = a === e.u && b === e.v;
    edges2.push({ id: plain ? e.id : 'x' + e.id, u: a, v: b, label: e.label, route: e.direct && plain });
  }
  const L = await layeredArrange(items2, edges2, size2, C.sp, axis, order2, C.measure);
  const A = AR.emptyArrangement();
  for (const [id, p] of L.pos) {
    const b = blockMap.get(id);
    if (b) {
      for (const [m, q] of b.sub.pos) A.pos.set(m, { x: p.x - b.w / 2 + q.x, y: p.y - b.h / 2 + q.y });
      for (const [m, c] of b.sub.ctx) A.ctx.set(m, { ...c, depth: L.ctx.get(id).depth });
      for (const [eid, h] of b.sub.hints) A.hints.set(eid, h);
    } else {
      A.pos.set(id, p);
      A.ctx.set(id, L.ctx.get(id));
    }
  }
  for (const [eid, h] of L.hints) if (eid[0] !== 'x') A.hints.set(eid, h);
  for (const [vid, p] of L.bends) A.bends.set(vid, p);
  return A;
}

// Formes imposées (menu « Forme ») : tout le contenu suit le modèle choisi.
async function forcedArrange(C, shape, items, edges, size) {
  if (!items.length) return [];
  const dir = C.direction;
  const set = new Set(items);
  const pairs = uniquePairs(edges, set);
  const sorted = [...items].sort((a, b) => C.orderOf(a) - C.orderOf(b));
  const isNode = (id) => !!C.nodes[id];
  if (shape === 'timeline') {
    // « mixte » : horizontale, puis verticale quand elle deviendrait trop longue pour l'écran
    const axis = dir === 'TB' || (dir !== 'LR' && items.length > 16) ? 'TB' : 'LR';
    const dateOf = (id) => (C.nodes[id] && C.nodes[id].date ? C.nodes[id].date.trim() : '');
    return [AR.timelineArrange(chronoOrder(flowOrder(items, pairs, C.orderOf), dateOf), edges, size, C.sp, axis, dateOf, C.measure)];
  }
  if (items.length === 1) return [single(items[0], resolveAxis('chain', dir))];
  switch (shape) {
    case 'cycle': {
      const members = pairs.length ? cycleOrder(items, pairs, C.orderOf) : sorted;
      return [AR.cycleArrange(members, edges, size, C.sp, resolveAxis('cycle', dir))];
    }
    case 'hierarchy': {
      const axis = dir === 'LR' ? 'LR' : 'TB';
      const parts = [];
      for (const comp of weakComponents(items, edges, C.orderOf)) {
        if (comp.length === 1) { parts.push(single(comp[0], axis)); continue; }
        const cs = new Set(comp);
        const ce = edges.filter((e) => cs.has(e.u) && cs.has(e.v));
        const cp = uniquePairs(ce, cs);
        const { inn } = adjacency(comp, cp);
        const roots = comp.filter((id) => inn.get(id).length === 0);
        const outTree = cp.length === comp.length - 1 && roots.length === 1 && comp.every((id) => id === roots[0] || inn.get(id).length === 1);
        if (outTree) parts.push(AR.treeArrange(roots[0], comp, cp, ce, size, C.sp, axis, C.orderOf, C.measure));
        else parts.push(await layeredArrange(comp, ce.map((e) => ({ ...e, route: e.direct })), size, C.sp, axis, C.orderOf, C.measure));
      }
      return parts;
    }
    case 'process': {
      const axis = dir === 'TB' ? 'TB' : 'LR';
      const { out, inn } = adjacency(items, pairs);
      const acyclic = scc(items, out).every((s) => s.length === 1);
      const chains = acyclic && items.every((id) => out.get(id).length <= 1 && inn.get(id).length <= 1);
      if (chains) return [AR.snakeArrange(flowOrder(items, pairs, C.orderOf), edges, size, C.sp, axis, C.measure)];
      return [await layeredArrange(items, edges.map((e) => ({ ...e, route: e.direct })), size, C.sp, axis, C.orderOf, C.measure)];
    }
    case 'list':
      return [AR.gridArrange(flowOrder(items, pairs, C.orderOf), edges, size, C.sp, dir)];
    case 'pyramid':
      return [AR.pyramidArrange(flowOrder(items, pairs, C.orderOf), edges, size, C.sp, isNode)];
    case 'radial':
      return [AR.radialArrange(items, pairs, edges, size, C.sp, C.orderOf)];
    default:
      return [];
  }
}

// ---------- Placement des blocs ----------

function collides(r, placed, m) {
  for (const p of placed) {
    if (r.x < p.x + p.w + m && p.x < r.x + r.w + m && r.y < p.y + p.h + m && p.y < r.y + r.h + m) return true;
  }
  return false;
}

function findFree(desired, w, h, placed, m) {
  const r = { x: desired.x, y: desired.y, w, h };
  if (!collides(r, placed, m)) return { x: r.x, y: r.y };
  const cands = [];
  for (const p of placed) {
    cands.push({ x: p.x + p.w + m, y: desired.y }, { x: p.x - m - w, y: desired.y },
      { x: desired.x, y: p.y + p.h + m }, { x: desired.x, y: p.y - m - h });
  }
  const dist = (c) => Math.hypot(c.x - desired.x, c.y - desired.y);
  cands.sort((a, b) => dist(a) - dist(b));
  for (const c of cands) if (!collides({ x: c.x, y: c.y, w, h }, placed, m)) return c;
  let maxY = -Infinity;
  for (const p of placed) maxY = Math.max(maxY, p.y + p.h);
  return { x: desired.x, y: maxY + m };
}

function rowPlace(blocks, obstacles, gap, maxW) {
  const res = new Map();
  const placed = obstacles.map((r) => ({ ...r }));
  let x = 0, y = 0, rowH = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > maxW) { x = 0; y += rowH + gap; rowH = 0; }
    let pos = { x, y };
    if (obstacles.length) pos = findFree(pos, b.w, b.h, placed, gap * 0.5);
    res.set(b, pos);
    placed.push({ x: pos.x, y: pos.y, w: b.w, h: b.h });
    x += b.w + gap;
    rowH = Math.max(rowH, b.h);
  }
  return res;
}

function centerOf(R, id) {
  const n = R.nodes.get(id);
  if (n) return { x: n.x, y: n.y };
  const g = R.groups.get(id);
  if (g) return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  return null;
}

function stablePlace(C, blocks, obstacles) {
  const margin = C.sp.comp * 0.75;
  const prev = C.prev;
  const anchorFor = (b) => {
    const R = b.R;
    if (C.focus) {
      const rel = centerOf(R, C.focus);
      if (rel && C.hints[C.focus]) return { rel, abs: C.hints[C.focus], focus: true };
      if (rel && prev[C.focus]) return { rel, abs: prev[C.focus], focus: true };
    }
    const ids = [...R.nodes.keys(), ...R.groups.keys()];
    const oldest = (pred) => {
      let best = null;
      for (const id of ids) if (pred(id) && (best === null || C.orderOf(id) < C.orderOf(best))) best = id;
      return best;
    };
    // un élément déjà placé et non déplacé exprès garde le bloc immobile
    let a = oldest((id) => prev[id] && !C.hints[id]);
    if (a) return { rel: centerOf(R, a), abs: prev[a] };
    // sinon : là où l'utilisateur a créé ou lâché un élément
    a = oldest((id) => C.hints[id]);
    if (a) return { rel: centerOf(R, a), abs: C.hints[a] };
    a = oldest((id) => prev[id]);
    if (a) return { rel: centerOf(R, a), abs: prev[a] };
    return null;
  };
  const list = blocks.map((b) => ({ b, a: anchorFor(b) }));
  if (!list.some((x) => x.a)) {
    const maxW = Math.max(1500, ...blocks.map((b) => b.w));
    return rowPlace(blocks, obstacles, C.sp.comp, maxW);
  }
  list.sort((p, q) => {
    const fp = p.a && p.a.focus ? 0 : 1, fq = q.a && q.a.focus ? 0 : 1;
    if (fp !== fq) return fp - fq;
    const hp = p.a ? 0 : 1, hq = q.a ? 0 : 1;
    if (hp !== hq) return hp - hq;
    return p.b.minOrder - q.b.minOrder;
  });
  const res = new Map();
  const placed = obstacles.map((r) => ({ ...r }));
  for (const { b, a } of list) {
    let desired;
    if (a) desired = { x: a.abs.x - a.rel.x, y: a.abs.y - a.rel.y };
    else if (placed.length) {
      let maxX = -Infinity, minY = Infinity;
      for (const p of placed) { maxX = Math.max(maxX, p.x + p.w); minY = Math.min(minY, p.y); }
      desired = { x: maxX + margin, y: minY };
    } else desired = { x: 0, y: 0 };
    const pos = findFree(desired, b.w, b.h, placed, margin);
    res.set(b, pos);
    placed.push({ x: pos.x, y: pos.y, w: b.w, h: b.h });
  }
  return res;
}

// ---------- Assemblage ----------

function emptyResult() {
  return { nodes: new Map(), groups: new Map(), bends: new Map(), hints: new Map(), ctx: new Map(), origins: new Map(), timelines: [], w: 0, h: 0, origin: { x: 0, y: 0 } };
}

function mergeOffset(dst, src, dx, dy) {
  for (const [id, n] of src.nodes) dst.nodes.set(id, { ...n, x: n.x + dx, y: n.y + dy });
  for (const [id, g] of src.groups) dst.groups.set(id, { ...g, x: g.x + dx, y: g.y + dy });
  for (const [id, p] of src.bends) dst.bends.set(id, { x: p.x + dx, y: p.y + dy });
  for (const [id, o] of src.origins) dst.origins.set(id, { x: o.x + dx, y: o.y + dy });
  for (const [id, h] of src.hints) dst.hints.set(id, h);
  for (const [id, c] of src.ctx) dst.ctx.set(id, c);
  for (const t of src.timelines) dst.timelines.push({ ...t, bb: { ...t.bb, x: t.bb.x + dx, y: t.bb.y + dy } });
}

// Déploie un arrangement (positions d'éléments) en résultat complet (cases, cadres et leur contenu).
function expand(C, A, sizes, inner, nodeInfo) {
  const R = emptyResult();
  for (const [id, p] of A.pos) {
    const g = C.groups[id];
    const s = sizes.get(id);
    if (g) {
      const rect = { x: p.x - s.w / 2, y: p.y - s.h / 2, w: s.w, h: s.h };
      if (g.collapsed) {
        R.nodes.set(id, { x: p.x, y: p.y, w: s.w, h: s.h, kind: 'cgroup', shape: 'rounded', count: C.countInside(id) });
      } else {
        R.groups.set(id, { ...rect });
        const r = inner.get(id);
        if (r) {
          const cx = rect.x + (rect.w - r.w) / 2, cy = rect.y + GT;
          mergeOffset(R, r, cx, cy);
          R.origins.set(id, { x: cx + r.origin.x, y: cy + r.origin.y });
        }
      }
    } else {
      const info = nodeInfo.get(id);
      const ov = A.shapes.get(id);
      R.nodes.set(id, {
        x: p.x, y: p.y, w: ov ? ov.w : s.w, h: ov ? ov.h : s.h, kind: 'node',
        shape: ov ? ov.kind : C.nodes[id].shape, trap: ov && ov.kind === 'trap' ? { top: ov.top, bottom: ov.bottom } : null,
        text: info.text, scale: info.scale,
      });
    }
    const c = A.ctx.get(id);
    if (c) R.ctx.set(id, c);
  }
  for (const [id, h] of A.hints) R.hints.set(id, h);
  for (const [id, p] of A.bends) R.bends.set(id, p);
  if (A.timeline) R.timelines.push(A.timeline);
  return R;
}

function resultBBox(R) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of R.nodes.values()) {
    x0 = Math.min(x0, n.x - n.w / 2); y0 = Math.min(y0, n.y - n.h / 2);
    x1 = Math.max(x1, n.x + n.w / 2); y1 = Math.max(y1, n.y + n.h / 2);
  }
  for (const g of R.groups.values()) {
    x0 = Math.min(x0, g.x); y0 = Math.min(y0, g.y);
    x1 = Math.max(x1, g.x + g.w); y1 = Math.max(y1, g.y + g.h);
  }
  for (const p of R.bends.values()) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  for (const { bb } of R.timelines) {
    x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y); x1 = Math.max(x1, bb.x + bb.w); y1 = Math.max(y1, bb.y + bb.h);
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

async function layoutScope(C, scope) {
  const items = C.children.get(scope) || [];
  const sizes = new Map();
  const inner = new Map();
  const nodeInfo = new Map();
  for (const id of items) {
    const g = C.groups[id];
    if (!g) continue;
    if (g.collapsed) sizes.set(id, collapsedSize(g, C.countInside(id), C.measure));
    else {
      const r = await layoutScope(C, id);
      inner.set(id, r);
      const tw = groupTitleWidth(g, C.measure);
      sizes.set(id, { w: Math.max(r.w + 2 * GP, tw, 150), h: Math.max(r.h + GT + GP, 84) });
    }
  }
  const sizeNodes = (ids) => {
    const ns = ids.filter((id) => C.nodes[id]).map((id) => C.nodes[id]);
    for (const [id, info] of fitUniform(ns, C.measure)) {
      sizes.set(id, { w: info.w, h: info.h });
      nodeInfo.set(id, info);
    }
  };
  const size = (id) => sizes.get(id);
  const edges = C.scopeEdges.get(scope) || [];
  const pinned = items.filter((id) => C.pinOf(id));
  const free = items.filter((id) => !C.pinOf(id));
  const freeSet = new Set(free);
  const freeEdges = edges.filter((e) => freeSet.has(e.u) && freeSet.has(e.v));
  const shape = C.shapeOf(scope);
  const parts = [];
  if (shape === 'auto') {
    for (const comp of weakComponents(free, freeEdges, C.orderOf)) {
      sizeNodes(comp);
      const cs = new Set(comp);
      parts.push(await autoArrange(C, comp, freeEdges.filter((e) => cs.has(e.u) && cs.has(e.v)), size));
    }
  } else {
    sizeNodes(free);
    parts.push(...(await forcedArrange(C, shape, free, freeEdges, size)));
  }
  for (const id of pinned) if (C.nodes[id]) sizeNodes([id]);

  // chaque arrangement devient un bloc ramené en (0,0)
  const blocks = parts.map((A) => {
    const sz = (id) => sizes.get(id);
    const bb = AR.arrangementBBox(A, sz);
    AR.translateArrangement(A, -bb.x, -bb.y);
    const R = expand(C, A, sizes, inner, nodeInfo);
    let minOrder = Infinity;
    for (const id of A.pos.keys()) minOrder = Math.min(minOrder, C.orderOf(id));
    return { R, w: bb.w, h: bb.h, minOrder };
  });

  const obstacles = pinned.map((id) => {
    const s = sizes.get(id), p = C.pinOf(id);
    return { x: p.x - s.w / 2, y: p.y - s.h / 2, w: s.w, h: s.h };
  });
  const offsets = scope === null
    ? stablePlace(C, blocks, obstacles)
    : rowPlace(blocks, obstacles, C.sp.comp * 0.7, Math.max(420, ...blocks.map((b) => b.w),
      Math.sqrt(blocks.reduce((s, b) => s + b.w * b.h, 0)) * 1.7));

  const S = emptyResult();
  for (const b of blocks) {
    const o = offsets.get(b);
    mergeOffset(S, b.R, o.x, o.y);
  }
  for (const id of pinned) {
    const p = C.pinOf(id);
    const A = AR.emptyArrangement();
    A.pos.set(id, { x: p.x, y: p.y });
    A.ctx.set(id, { role: 'pinned', axis: resolveAxis('chain', C.direction), depth: 0, seq: 0, seqLen: 1, branch: 0 });
    mergeOffset(S, expand(C, A, sizes, inner, nodeInfo), 0, 0);
  }
  if (scope !== null) {
    const bb = resultBBox(S);
    const R = emptyResult();
    mergeOffset(R, S, -bb.x, -bb.y);
    R.w = bb.w;
    R.h = bb.h;
    R.origin = { x: -bb.x, y: -bb.y };
    return R;
  }
  return S;
}

const DEFAULT_CTX = { role: 'free', axis: 'LR', depth: 0, seq: 0, seqLen: 1, branch: 0 };

// Point d'entrée : calcule toute la disposition d'un onglet.
// opts : { focus: id à garder immobile, hints: {id: {x,y}} positions de création }
export async function computeLayout(tab, measure, opts = {}) {
  const C = buildContext(tab, measure, opts);
  const S = await layoutScope(C, null);
  const nodes = new Map();
  for (const [id, n] of S.nodes) {
    nodes.set(id, { ...n, id, ctx: S.ctx.get(id) || DEFAULT_CTX, pinned: !!C.pinOf(id) });
  }
  const groups = new Map();
  for (const [id, g] of S.groups) {
    let depth = 0, cur = tab.groups[id] && tab.groups[id].group;
    while (cur && tab.groups[cur] && depth < 50) { depth++; cur = tab.groups[cur].group; }
    groups.set(id, { ...g, id, depth, pinned: !!C.pinOf(id) });
  }
  const edges = new Map();
  for (const ve of C.visibleEdges) {
    if (!(nodes.has(ve.a) || groups.has(ve.a)) || !(nodes.has(ve.b) || groups.has(ve.b))) continue;
    edges.set(ve.id, { id: ve.id, from: ve.a, to: ve.b, remapped: ve.remapped, hint: S.hints.get(ve.id) || null });
  }
  const origins = new Map(S.origins);
  origins.set(null, { x: 0, y: 0 });
  return { tabId: tab.id, nodes, groups, edges, bends: S.bends, origins, timelines: S.timelines, bbox: resultBBox(S) };
}

// Positions (centres) à mémoriser pour stabiliser le prochain calcul.
export function positionsOf(L) {
  const pos = {};
  for (const [id, n] of L.nodes) pos[id] = { x: n.x, y: n.y };
  for (const [id, g] of L.groups) pos[id] = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  return pos;
}
