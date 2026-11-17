import { parseSpan } from './dates.js';

// Formes de disposition : arbre, cycle (avec rayons), processus en serpentin, liste, pyramide, radial.
// Chaque fonction retourne un « arrangement » :
//   { pos: Map id→{x,y} (centres), hints: Map edgeId→indice de tracé, ctx: Map id→contexte,
//     bends: Map, shapes: Map id→forme imposée {kind, top, bottom, w, h} }

export function emptyArrangement() {
  return { pos: new Map(), hints: new Map(), ctx: new Map(), bends: new Map(), shapes: new Map() };
}

const axisVec = (axis) => (axis === 'LR'
  ? { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } }
  : { u: { x: 0, y: 1 }, v: { x: 1, y: 0 } });

function extents(size, u, v) {
  return {
    eu: (id) => Math.abs(u.x) * size(id).w + Math.abs(u.y) * size(id).h,
    ev: (id) => Math.abs(v.x) * size(id).w + Math.abs(v.y) * size(id).h,
  };
}

// Arbre « bien rangé » : retourne Map id → {d, b, hang} avec la racine en (0,0).
// d = profondeur (axe du flux), b = largeur (axe transversal).
export function tidy(root, childrenOf, eu, ev, sp, opts = {}) {
  const levelGap = opts.levelGap ?? sp.level;
  const sibGap = opts.sibGap ?? sp.gap;
  const hangMin = opts.hang ? 6 : Infinity;
  const depth = new Map([[root, 0]]);
  const order = [];
  const queue = [root];
  const parent = new Map();
  while (queue.length) {
    const v = queue.shift();
    order.push(v);
    for (const c of childrenOf(v)) {
      if (depth.has(c)) continue;
      depth.set(c, depth.get(v) + 1);
      parent.set(c, v);
      queue.push(c);
    }
  }
  const kidsOf = (v) => childrenOf(v).filter((c) => parent.get(c) === v);
  const hanging = new Set();
  for (const v of order) {
    const kids = kidsOf(v);
    if (kids.length >= hangMin && kids.every((k) => kidsOf(k).length === 0)) hanging.add(v);
  }
  const levelExt = [];
  for (const v of order) {
    if (parent.has(v) && hanging.has(parent.get(v))) continue;
    const d = depth.get(v);
    levelExt[d] = Math.max(levelExt[d] || 0, eu(v));
  }
  const D = [0];
  for (let d = 1; d < levelExt.length; d++) D[d] = D[d - 1] + (levelExt[d - 1] || 0) / 2 + levelGap + (levelExt[d] || 0) / 2;
  const tol = levelGap * 0.4;

  function sub(v) {
    const kids = kidsOf(v);
    const me = { id: v, d: D[depth.get(v)] ?? 0, b: 0, eu: eu(v), ev: ev(v) };
    if (!kids.length) return [me];
    if (hanging.has(v)) {
      const rects = [me];
      const trunk = opts.trunkGap ?? 22;
      let dL = me.d + me.eu / 2 + levelGap * 0.55, dR = dL;
      kids.forEach((k, i) => {
        const a = eu(k), c = ev(k);
        if (i % 2 === 0) { rects.push({ id: k, d: dL + a / 2, b: -(trunk + c / 2), eu: a, ev: c, hang: true }); dL += a + 14; }
        else { rects.push({ id: k, d: dR + a / 2, b: trunk + c / 2, eu: a, ev: c, hang: true }); dR += a + 14; }
      });
      return rects;
    }
    const placed = [];
    const rootsB = [];
    for (const k of kids) {
      const r = sub(k);
      let off = 0;
      if (placed.length) {
        off = -Infinity;
        for (const s of r) {
          for (const p of placed) {
            if (s.d - s.eu / 2 < p.d + p.eu / 2 + tol && p.d - p.eu / 2 < s.d + s.eu / 2 + tol) {
              off = Math.max(off, p.b + p.ev / 2 + sibGap - (s.b - s.ev / 2));
            }
          }
        }
        if (off === -Infinity) off = rootsB[rootsB.length - 1] + sibGap;
      }
      for (const s of r) s.b += off;
      placed.push(...r);
      rootsB.push(off);
    }
    const mid = (rootsB[0] + rootsB[rootsB.length - 1]) / 2;
    for (const s of placed) s.b -= mid;
    return [me, ...placed];
  }

  const res = new Map();
  for (const r of sub(root)) res.set(r.id, { d: r.d, b: r.b, hang: !!r.hang });
  return { pos: res, depth, parent };
}

function maxLabelWidth(edges, measure) {
  let m = 0;
  for (const e of edges) if (e.label && measure) m = Math.max(m, measure(e.label, 12, 400) + 12);
  return Math.min(m, 220);
}

// ---------- Hiérarchie (arbre orienté) ----------
export function treeArrange(root, items, pairs, edges, size, sp, axis, orderOf, measure) {
  const A = emptyArrangement();
  const kids = new Map(items.map((id) => [id, []]));
  for (const { u, v } of pairs) if (kids.has(u) && kids.has(v)) kids.get(u).push(v);
  for (const l of kids.values()) l.sort((a, b) => orderOf(a) - orderOf(b));
  const { u, v } = axisVec(axis);
  const { eu, ev } = extents(size, u, v);
  const lw = maxLabelWidth(edges, measure);
  const levelGap = lw ? Math.max(sp.level, axis === 'LR' ? lw + 30 : 48) : sp.level;
  const t = tidy(root, (id) => kids.get(id) || [], eu, ev, sp, { hang: axis === 'TB', levelGap });
  for (const [id, p] of t.pos) A.pos.set(id, { x: u.x * p.d + v.x * p.b, y: u.y * p.d + v.y * p.b });
  // contexte : profondeur, branche (enfant de la racine), ordre de lecture
  let seq = 0;
  const walk = (id, depth, branch) => {
    A.ctx.set(id, { role: 'tree', axis, depth, seq: seq++, seqLen: items.length, branch });
    (kids.get(id) || []).forEach((c, i) => { if (t.parent.get(c) === id) walk(c, depth + 1, depth === 0 ? i : branch); });
  };
  walk(root, 0, -1);
  for (const e of edges) {
    if (!e.direct) continue;
    const pv = t.pos.get(e.v);
    if (t.parent.get(e.v) === e.u && pv && pv.hang) A.hints.set(e.id, { kind: 'hang', axis });
    else if (t.parent.get(e.v) === e.u) A.hints.set(e.id, { kind: 'tree', axis });
  }
  return A;
}

// ---------- Cycle (cercle) avec rayons vers l'extérieur ----------
// members : ordre autour du cercle. rayKids : Map id → enfants (rayons, peut être vide).
export function cycleArrange(members, edges, size, sp, axis, rayKids = new Map()) {
  const A = emptyArrangement();
  const k = members.length;
  const start = k === 2 ? (axis === 'TB' ? -Math.PI / 2 : Math.PI) : -Math.PI / 2;
  const ang = members.map((_, i) => start + (2 * Math.PI * i) / k);
  const memberSet = new Set(members);
  const kidsOf = (id) => rayKids.get(id) || [];
  const hasRays = members.some((m) => kidsOf(m).length);
  const gapAxis = (p, q, a, b) => Math.max(
    Math.abs(p.x - q.x) - (size(a).w + size(b).w) / 2,
    Math.abs(p.y - q.y) - (size(a).h + size(b).h) / 2,
  );
  let R = 0;
  for (const m of members) R = Math.max(R, Math.max(size(m).w, size(m).h) / 2 + sp.arrow / 2);
  let pos = new Map();
  let rayInfo = new Map();
  for (let iter = 0; iter < 90; iter++) {
    pos = new Map();
    rayInfo = new Map();
    members.forEach((m, i) => pos.set(m, { x: R * Math.cos(ang[i]), y: R * Math.sin(ang[i]) }));
    let ok = true;
    for (let i = 0; i < k && ok; i++) {
      for (let j = i + 1; j < k; j++) {
        const adj = j === i + 1 || (i === 0 && j === k - 1);
        const g = gapAxis(pos.get(members[i]), pos.get(members[j]), members[i], members[j]);
        if (g < (adj ? sp.arrow : sp.gap * 0.7)) { ok = false; break; }
      }
    }
    if (ok && hasRays) {
      members.forEach((m, i) => {
        if (!kidsOf(m).length) return;
        const u = { x: Math.cos(ang[i]), y: Math.sin(ang[i]) };
        const v = { x: -u.y, y: u.x };
        const { eu, ev } = extents(size, u, v);
        const t = tidy(m, kidsOf, eu, ev, sp, { levelGap: sp.level * 0.8 });
        const pm = pos.get(m);
        for (const [id, p] of t.pos) {
          if (id === m) continue;
          pos.set(id, { x: pm.x + u.x * p.d + v.x * p.b, y: pm.y + u.y * p.d + v.y * p.b });
          rayInfo.set(id, { depth: t.depth.get(id), branch: i });
        }
      });
      const ids = [...pos.keys()];
      const margin = sp.gap * 0.5;
      outer: for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const p = pos.get(ids[a]), q = pos.get(ids[b]);
          const sa = size(ids[a]), sb = size(ids[b]);
          if (Math.abs(p.x - q.x) < (sa.w + sb.w) / 2 + margin && Math.abs(p.y - q.y) < (sa.h + sb.h) / 2 + margin) { ok = false; break outer; }
        }
      }
    }
    if (ok) break;
    R = R * 1.07 + 4;
  }
  A.pos = pos;
  members.forEach((m, i) => A.ctx.set(m, { role: 'cycle', axis, depth: 0, seq: i, seqLen: k, branch: i, cycle: members }));
  for (const [id, info] of rayInfo) {
    A.ctx.set(id, { role: 'ray', axis, depth: info.depth, seq: info.branch, seqLen: k, branch: info.branch, angle: ang[info.branch] });
  }
  const index = new Map(members.map((m, i) => [m, i]));
  for (const e of edges) {
    if (!e.direct) continue;
    if (memberSet.has(e.u) && memberSet.has(e.v)) {
      const i = index.get(e.u), j = index.get(e.v);
      if (j === (i + 1) % k) A.hints.set(e.id, { kind: 'arc', members, cw: true });
      else if (i === (j + 1) % k) A.hints.set(e.id, { kind: 'arc', members, cw: false });
      else A.hints.set(e.id, { kind: 'chord', members });
    } else {
      A.hints.set(e.id, { kind: 'straight' });
    }
  }
  return A;
}

// ---------- Processus en serpentin ----------
export function snakeArrange(order, edges, size, sp, axis, measure) {
  const A = emptyArrangement();
  const n = order.length;
  const lw = maxLabelWidth(edges, measure);
  const gapAlong = Math.max(sp.arrow, lw ? lw + 20 : 0);
  const along = (id) => (axis === 'TB' ? size(id).h : size(id).w);
  const avg = order.reduce((s, id) => s + along(id), 0) / Math.max(1, n);
  const room = axis === 'TB' ? 760 : 1180;
  const minCap = avg > 320 ? 1 : avg > 220 ? 2 : 3;
  const capacity = Math.max(minCap, Math.min(8, Math.floor(room / (avg + gapAlong))));
  const rows = Math.ceil(n / capacity);
  const per = Math.ceil(n / rows);
  const cell = order.map((id, i) => {
    const r = Math.floor(i / per);
    const c = r % 2 === 0 ? i % per : per - 1 - (i % per);
    return { id, r, c };
  });
  const alongSize = [], crossSize = [];
  for (const { id, r, c } of cell) {
    const s = size(id);
    alongSize[c] = Math.max(alongSize[c] || 0, axis === 'TB' ? s.h : s.w);
    crossSize[r] = Math.max(crossSize[r] || 0, axis === 'TB' ? s.w : s.h);
  }
  const crossGap = sp.arrow + (lw ? 10 : 0);
  const aPos = [], cPos = [];
  let acc = 0;
  for (let c = 0; c < alongSize.length; c++) { aPos[c] = acc + alongSize[c] / 2; acc += alongSize[c] + gapAlong; }
  acc = 0;
  for (let r = 0; r < crossSize.length; r++) { cPos[r] = acc + crossSize[r] / 2; acc += crossSize[r] + crossGap; }
  cell.forEach(({ id, r, c }, i) => {
    A.pos.set(id, axis === 'TB' ? { x: cPos[r], y: aPos[c] } : { x: aPos[c], y: cPos[r] });
    A.ctx.set(id, { role: 'chain', axis, depth: 0, seq: i, seqLen: n, branch: i });
  });
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'straight' });
  return A;
}

// ---------- File simple (bande des Fils narratifs, colonne du Tableau) ----------
export function rowArrange(order, edges, size, sp, axis, role) {
  const A = emptyArrangement();
  const n = order.length;
  let acc = 0;
  order.forEach((id, i) => {
    const s = size(id), len = axis === 'LR' ? s.w : s.h;
    A.pos.set(id, axis === 'LR' ? { x: acc + len / 2, y: 0 } : { x: 0, y: acc + len / 2 });
    acc += len + (axis === 'LR' ? sp.arrow : sp.gap * 0.5);
    A.ctx.set(id, { role, axis, depth: 0, seq: i, seqLen: n, branch: i });
  });
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'straight' });
  return A;
}

// ---------- Liste (grille de blocs) ----------
export function gridArrange(order, edges, size, sp, axis) {
  const A = emptyArrangement();
  const n = order.length;
  let cols;
  if (axis === 'TB') cols = 1;
  else if (axis === 'LR') cols = Math.min(n, 6);
  else cols = Math.min(n, Math.max(1, Math.round(Math.sqrt(n * 1.4))));
  const colW = [], rowH = [];
  order.forEach((id, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    colW[c] = Math.max(colW[c] || 0, size(id).w);
    rowH[r] = Math.max(rowH[r] || 0, size(id).h);
  });
  const gap = sp.gap * 0.6;
  const xs = [], ys = [];
  let acc = 0;
  for (let c = 0; c < colW.length; c++) { xs[c] = acc + colW[c] / 2; acc += colW[c] + gap; }
  acc = 0;
  for (let r = 0; r < rowH.length; r++) { ys[r] = acc + rowH[r] / 2; acc += rowH[r] + gap; }
  order.forEach((id, i) => {
    A.pos.set(id, { x: xs[i % cols], y: ys[Math.floor(i / cols)] });
    A.ctx.set(id, { role: 'list', axis, depth: 0, seq: i, seqLen: n, branch: i });
  });
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'curve' });
  return A;
}

// ---------- Chronologie ----------
// Horizontale : cases en alternance de part et d'autre de la ligne (compact), la date du côté opposé à sa case.
// Verticale : une seule colonne, les dates à gauche de la ligne. La ligne suit les cases à l'affichage : voir timelineGeometry.
// Unités de la ligne à l'échelle, en « jours » de dates.js (un an = 372, un mois = 31).
export const TIME_UNITS = { hour: 1 / 24, day: 1, month: 31, year: 372, decade: 3720, century: 37200, millennium: 372000 };
// unité choisie toute seule : la plus petite qui donne au plus 14 repères
export const autoTimeUnit = (span) => ['hour', 'day', 'month', 'year', 'decade', 'century'].find((u) => span / TIME_UNITS[u] <= 14) || 'millennium';

export function timelineArrange(order, edges, size, sp, axis, dateOf, measure, scale = null) {
  const A = emptyArrangement();
  const n = order.length;
  const lw = (id) => (dateOf(id) ? measure(dateOf(id), 12.5, 650) : 0);
  const members = [];
  // k : début, pour situer la fin d'une période parmi les autres cases (une case sans date prend celui de la précédente)
  let prevStart = -Infinity;
  const member = (id, side) => {
    const span = parseSpan(dateOf(id));
    if (span) prevStart = span.start;
    return { id, side, label: dateOf(id), k: prevStart, end: span ? span.end : null };
  };
  if (scale && scale.mode === 'scale' && n > 1) {
    const res = scaledTimeline(A, order, edges, size, sp, axis, member, scale);
    if (res) return res;
    prevStart = -Infinity;
  }
  let bb;
  if (axis === 'LR') {
    const stem = Math.max(40, 46 * sp.f), minStep = Math.max(44, 60 * sp.f);
    const xs = [];
    order.forEach((id, i) => {
      let x = 0;
      if (i > 0) x = xs[i - 1] + Math.max(minStep, lw(order[i - 1]) / 2 + 10, lw(id) / 2 + 10);
      if (i > 1) x = Math.max(x, xs[i - 2] + (size(order[i - 2]).w + size(id).w) / 2 + sp.gap * 0.6);
      xs[i] = x;
      const side = i % 2 === 0 ? -1 : 1;
      A.pos.set(id, { x, y: side * (stem + size(id).h / 2) });
      members.push(member(id, side));
    });
    const x0 = Math.min(xs[0] - 30, ...order.map((id, i) => xs[i] - lw(id) / 2));
    const x1 = Math.max(xs[n - 1] + 42, ...order.map((id, i) => xs[i] + lw(id) / 2));
    bb = { x: x0, y: -26, w: x1 - x0, h: 52 };
    A.timeline = { axis, stem, members, bb };
  } else {
    const stem = Math.max(26, 32 * sp.f), gap = sp.gap * 0.6;
    let y = 0;
    const ys = [];
    for (const id of order) {
      const s = size(id);
      ys.push(y + s.h / 2);
      A.pos.set(id, { x: stem + s.w / 2, y: y + s.h / 2 });
      members.push(member(id, 1));
      y += s.h + gap;
    }
    const wide = Math.max(0, ...order.map(lw));
    bb = { x: -(wide + 16), y: ys[0] - 24, w: wide + 22, h: ys[n - 1] - ys[0] + 60 };
    A.timeline = { axis, stem, members, bb };
  }
  order.forEach((id, i) => A.ctx.set(id, { role: 'timeline', axis, depth: 0, seq: i, seqLen: n, branch: i }));
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'curve' });
  return A;
}

// Ligne à l'échelle : l'écart entre deux cases suit le temps. Le point de chaque case reste à sa vraie place ; une case
// qui chevaucherait sa voisine passe sur une rangée plus éloignée de la ligne (au-dessus, en dessous, puis plus loin).
// Rend null s'il n'y a aucune date comprise (on garde alors l'espacement régulier).
function scaledTimeline(A, order, edges, size, sp, axis, member, scale) {
  const n = order.length;
  const ms = order.map((id) => member(id, 1));
  const members = [];
  const firstK = ms.find((m) => Number.isFinite(m.k));
  if (!firstK) return null;
  for (const m of ms) if (!Number.isFinite(m.k)) m.k = firstK.k; // sans date avant la première date : au même endroit
  const k0 = Math.min(...ms.map((m) => m.k)), k1 = Math.max(...ms.map((m) => (Number.isFinite(m.end) ? Math.max(m.k, m.end) : m.k)));
  const span = Math.max(k1 - k0, 1 / 24);
  let unit = scale.unit && TIME_UNITS[scale.unit] ? scale.unit : null;
  if (!unit) unit = autoTimeUnit(span);
  const along = (id) => (axis === 'LR' ? size(id).w : size(id).h);
  const avg = order.reduce((s, id) => s + along(id), 0) / n;
  // Auto : une longueur qui tient à peu près comme l'espacement régulier ; une unité choisie : 110 px par unité
  let ppk = scale.unit && TIME_UNITS[scale.unit] ? 110 / TIME_UNITS[unit] : Math.min(6000, Math.max(500, n * (avg + sp.gap) * 0.9)) / span;
  ppk = Math.min(ppk, 40000 / span);
  const stem = Math.max(40, 46 * sp.f);
  const gap = sp.gap * 0.5;
  const rowsUsed = new Map();
  const free = (row, a0, a1) => (rowsUsed.get(row) || []).every(([p, q]) => a1 <= p || a0 >= q);
  const tries = axis === 'LR' ? [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6] : [1, 2, 3, 4, 5, 6, 7, 8];
  const cross = Math.max(...order.map((id) => (axis === 'LR' ? size(id).h : size(id).w)));
  let farthest = 1;
  order.forEach((id, i) => {
    const m = ms[i];
    const a = (m.k - k0) * ppk;
    const half = along(id) / 2;
    let row = tries.find((r) => free(r, a - half - gap, a + half + gap));
    if (row === undefined) row = tries[tries.length - 1];
    (rowsUsed.get(row) || rowsUsed.set(row, []).get(row)).push([a - half - gap, a + half + gap]);
    const side = row < 0 ? -1 : 1, level = Math.abs(row);
    farthest = Math.max(farthest, level);
    m.side = side;
    m.row = level;
    m.stem = stem + (level - 1) * (cross + gap);
    const s = size(id);
    A.pos.set(id, axis === 'LR' ? { x: a, y: side * (m.stem + s.h / 2) } : { x: m.stem + s.w / 2, y: a });
    members.push(m);
  });
  const L = (k1 - k0) * ppk;
  const bb = axis === 'LR' ? { x: -30, y: -26, w: L + 72, h: 52 } : { x: -70, y: -24, w: 76, h: L + 60 };
  A.timeline = { axis, stem, members, bb, scale: { ppk, unit } };
  order.forEach((id, i) => A.ctx.set(id, { role: 'timeline', axis, depth: 0, seq: i, seqLen: n, branch: i }));
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'curve' });
  return A;
}

// ---------- Pyramide ----------
export function pyramidArrange(order, edges, size, sp, isNode) {
  const A = emptyArrangement();
  const n = order.length;
  const gapY = 6, slope = 0.55;
  let Wt = 0;
  for (const id of order) if (isNode(id)) Wt = Math.max(Wt, size(id).w);
  const H0 = order.length ? size(order[0]).h : 50;
  const base = Math.max(40, Wt - slope * H0);
  const widthAt = (y) => base + 2 * slope * y;
  let y = 0;
  order.forEach((id, i) => {
    const s = size(id);
    if (isNode(id)) {
      const top = widthAt(y), bottom = widthAt(y + s.h);
      A.shapes.set(id, { kind: 'trap', top, bottom, w: bottom, h: s.h });
      A.pos.set(id, { x: 0, y: y + s.h / 2 });
    } else {
      A.pos.set(id, { x: 0, y: y + s.h / 2 });
    }
    A.ctx.set(id, { role: 'pyramid', axis: 'TB', depth: i, seq: i, seqLen: n, branch: i });
    y += s.h + gapY;
  });
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'straight' });
  return A;
}

// ---------- Radial (carte d'idées) ----------
export function radialArrange(items, pairs, edges, size, sp, orderOf) {
  const A = emptyArrangement();
  const nb = new Map(items.map((id) => [id, []]));
  for (const { u, v } of pairs) {
    if (!nb.has(u) || !nb.has(v)) continue;
    nb.get(u).push(v);
    nb.get(v).push(u);
  }
  for (const l of nb.values()) l.sort((a, b) => orderOf(a) - orderOf(b));
  let root = items[0];
  for (const id of items) {
    const d = nb.get(id).length, dr = nb.get(root).length;
    if (d > dr || (d === dr && orderOf(id) < orderOf(root))) root = id;
  }
  const kids = new Map(items.map((id) => [id, []]));
  const depth = new Map([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const v = queue.shift();
    for (const w of nb.get(v)) {
      if (depth.has(w)) continue;
      depth.set(w, depth.get(v) + 1);
      kids.get(v).push(w);
      queue.push(w);
    }
  }
  for (const id of [...items].sort((a, b) => orderOf(a) - orderOf(b))) {
    if (!depth.has(id)) { depth.set(id, 1); kids.get(root).push(id); }
  }
  const leaves = new Map();
  const countLeaves = (v) => {
    const k = kids.get(v);
    const c = k.length ? k.reduce((s, w) => s + countLeaves(w), 0) : 1;
    leaves.set(v, c);
    return c;
  };
  countLeaves(root);
  const wedge = new Map([[root, { a0: -Math.PI / 2, span: 2 * Math.PI }]]);
  const branch = new Map([[root, -1]]);
  const assign = (v) => {
    const k = kids.get(v);
    if (!k.length) return;
    const w = wedge.get(v);
    let span = w.span, a0 = w.a0;
    if (v !== root && span > Math.PI) { a0 = w.a0 + (span - Math.PI) / 2; span = Math.PI; }
    const total = leaves.get(v);
    let a = a0;
    k.forEach((c, i) => {
      const s = (span * leaves.get(c)) / total;
      wedge.set(c, { a0: a, span: s });
      branch.set(c, v === root ? i : branch.get(v));
      a += s;
      assign(c);
    });
  };
  assign(root);
  const maxDepth = Math.max(...depth.values());
  const diag = (id) => Math.hypot(size(id).w, size(id).h);
  const R = [0];
  for (let d = 1; d <= maxDepth; d++) {
    let prevMax = 0, curMax = 0;
    for (const [id, dd] of depth) {
      if (dd === d - 1) prevMax = Math.max(prevMax, diag(id));
      if (dd === d) curMax = Math.max(curMax, diag(id));
    }
    let r = R[d - 1] + prevMax / 2 + sp.level * 0.9 + curMax / 2;
    for (const [id, dd] of depth) {
      if (dd !== d) continue;
      const span = Math.min(wedge.get(id).span, 2 * Math.PI);
      r = Math.max(r, (Math.max(size(id).w, size(id).h) + sp.gap) / Math.max(0.05, span));
    }
    R[d] = r;
  }
  let seq = 0;
  for (const id of items) {
    const d = depth.get(id);
    const w = wedge.get(id);
    const mid = w.a0 + w.span / 2;
    A.pos.set(id, d === 0 ? { x: 0, y: 0 } : { x: R[d] * Math.cos(mid), y: R[d] * Math.sin(mid) });
    A.ctx.set(id, { role: 'radial', axis: 'TB', depth: d, seq: seq++, seqLen: items.length, branch: branch.get(id) ?? 0 });
  }
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'straight' });
  return A;
}

// ---------- Arc dramatique ----------
// Les scènes de gauche à droite ; leur hauteur suit la tension (1 à 5). Sans aucun niveau choisi : courbe classique,
// qui monte jusqu'aux 2/3 puis redescend. Une scène sans niveau prend la moyenne de ses voisines qui en ont un.
export function arcTensions(order, tensionOf) {
  const n = order.length;
  const set = order.map((id) => tensionOf(id));
  if (!set.some((v) => v)) {
    if (n === 1) return [3];
    const p = Math.max(1, Math.round((n - 1) * 2 / 3));
    return order.map((_, i) => (i <= p ? 1 + (4 * i) / p : 5 - (3 * (i - p)) / Math.max(1, n - 1 - p)));
  }
  return set.map((v, i) => {
    if (v) return v;
    let a = i - 1, b = i + 1;
    while (a >= 0 && !set[a]) a--;
    while (b < n && !set[b]) b++;
    if (a < 0) return set[b];
    if (b >= n) return set[a];
    return set[a] + ((set[b] - set[a]) * (i - a)) / (b - a);
  });
}

export function arcArrange(order, edges, size, sp, tensionOf) {
  const A = emptyArrangement();
  const n = order.length;
  const t = arcTensions(order, tensionOf);
  const maxH = Math.max(...order.map((id) => size(id).h));
  const step = maxH * 0.8 + sp.gap * 0.5;
  let x = 0;
  order.forEach((id, i) => {
    if (i > 0) x += (size(order[i - 1]).w + size(id).w) / 2 + sp.gap * 0.6;
    A.pos.set(id, { x, y: -(t[i] - 1) * step });
    A.ctx.set(id, { role: 'arc', axis: 'LR', depth: 0, seq: i, seqLen: n, branch: i });
  });
  // la courbe passe derrière les cases (dessinée avec les lignes du temps, voir draw.timelineGeometry)
  A.timeline = { kind: 'arc', ids: [...order], bb: { x: 0, y: -4 * step, w: x, h: 4 * step } };
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'straight' });
  return A;
}

// ---------- Arbre généalogique ----------
// Une flèche va d'un parent à son enfant ; un trait sans pointe (ou à double pointe) relie un couple. Deux personnes qui
// ont un enfant ensemble forment aussi un couple, même sans trait. Chaque couple (ou personne seule) est une « famille »
// posée sur la rangée de sa génération. Les rangées s'ajustent tour à tour de haut en bas (chacun sous le milieu de ses
// parents) et de bas en haut (les parents au-dessus de leurs enfants), sans que deux familles se chevauchent.
export function familyArrange(items, edges, size, sp, orderOf) {
  const A = emptyArrangement();
  const set = new Set(items);
  const byOrder = (a, b) => orderOf(a) - orderOf(b);
  const ids = [...items].sort(byOrder);
  const partners = new Map(ids.map((id) => [id, new Set()]));
  const parents = new Map(ids.map((id) => [id, []]));
  const kids = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!set.has(e.u) || !set.has(e.v) || e.u === e.v) continue;
    if (e.arrows === 'end') {
      if (!parents.get(e.v).includes(e.u)) { parents.get(e.v).push(e.u); kids.get(e.u).push(e.v); }
    } else { partners.get(e.u).add(e.v); partners.get(e.v).add(e.u); }
  }
  // les parents d'un même enfant sont un couple
  for (const id of ids) {
    const ps = parents.get(id);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { partners.get(ps[i]).add(ps[j]); partners.get(ps[j]).add(ps[i]); }
  }
  // générations : un enfant sous ses parents, un couple sur la même rangée (bornes pour ne pas tourner en rond)
  const gen = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length + 2; pass++) {
    let changed = false;
    for (const id of ids) {
      let g = gen.get(id);
      for (const p of parents.get(id)) g = Math.max(g, gen.get(p) + 1);
      for (const q of partners.get(id)) g = Math.max(g, gen.get(q));
      if (g !== gen.get(id) && g < ids.length) { gen.set(id, g); changed = true; }
    }
    if (!changed) break;
  }
  // familles : personnes reliées en couple sur la même génération
  const unitOf = new Map();
  const units = [];
  for (const id of ids) {
    if (unitOf.has(id)) continue;
    const comp = [];
    const stack = [id];
    unitOf.set(id, units.length);
    while (stack.length) {
      const v = stack.pop();
      comp.push(v);
      for (const w of partners.get(v)) if (!unitOf.has(w) && gen.get(w) === gen.get(id)) { unitOf.set(w, units.length); stack.push(w); }
    }
    // ordre dans la famille : la chaîne des couples (deux mariages : la personne au milieu)
    const inComp = new Set(comp);
    const deg = (v) => [...partners.get(v)].filter((w) => inComp.has(w)).length;
    const start = comp.filter((v) => deg(v) <= 1).sort(byOrder)[0] || [...comp].sort(byOrder)[0];
    const seq = [];
    const seen = new Set();
    const walk = (v) => { seen.add(v); seq.push(v); for (const w of [...partners.get(v)].sort(byOrder)) if (inComp.has(w) && !seen.has(w)) walk(w); };
    walk(start);
    for (const v of [...comp].sort(byOrder)) if (!seen.has(v)) seq.push(v);
    units.push({ members: seq, gen: gen.get(id), order: Math.min(...seq.map(orderOf)), x: 0 });
  }
  const gapIn = sp.gap * 0.7, gapOut = sp.gap * 1.3;
  const widthOf = (u) => u.members.reduce((s, m) => s + size(m).w, 0) + gapIn * (u.members.length - 1);
  // position de chaque membre par rapport au centre de sa famille
  const offsets = (u) => {
    const res = new Map();
    let x = -widthOf(u) / 2;
    for (const m of u.members) { res.set(m, x + size(m).w / 2); x += size(m).w + gapIn; }
    return res;
  };
  const off = new Map();
  const refreshOffsets = (u) => { for (const [m, o] of offsets(u)) off.set(m, o); };
  units.forEach(refreshOffsets);
  const xOf = (m) => units[unitOf.get(m)].x + off.get(m);
  const maxGen = Math.max(0, ...units.map((u) => u.gen));
  const rows = Array.from({ length: maxGen + 1 }, () => []);
  for (const u of units) rows[u.gen].push(u);
  for (const r of rows) r.sort((a, b) => a.order - b.order);

  // une rangée : chaque famille veut être à `want`, on retire les chevauchements en bougeant le moins possible
  // (familles qui se touchent regroupées en blocs, chaque bloc centré sur la moyenne de ses souhaits)
  const settle = (row) => {
    row.sort((a, b) => a.want - b.want || a.order - b.order);
    const place = (blk) => {
      let acc = 0, sum = 0;
      for (const u of blk.units) { const w = widthOf(u); sum += u.want - (acc + w / 2); acc += w + gapOut; }
      blk.w = acc - gapOut;
      blk.left = sum / blk.units.length;
    };
    const blocks = [];
    for (const u of row) {
      let blk = { units: [u] };
      place(blk);
      while (blocks.length && blocks[blocks.length - 1].left + blocks[blocks.length - 1].w + gapOut > blk.left) {
        blk = { units: [...blocks.pop().units, ...blk.units] };
        place(blk);
      }
      blocks.push(blk);
    }
    for (const blk of blocks) {
      let acc = blk.left;
      for (const u of blk.units) { const w = widthOf(u); u.x = acc + w / 2; acc += w + gapOut; }
    }
  };
  // départ : chaque rangée posée dans l'ordre
  for (const row of rows) { let acc = 0; for (const u of row) { const w = widthOf(u); u.x = acc + w / 2; acc += w + gapOut; } }
  const down = () => {
    for (let g = 1; g <= maxGen; g++) {
      for (const u of rows[g]) {
        // dans le couple, celui dont les parents sont à gauche passe à gauche
        const pm = (m) => { const ps = parents.get(m); return ps.length ? ps.reduce((s, p) => s + xOf(p), 0) / ps.length : null; };
        if (u.members.length === 2) {
          const [a, b] = u.members, xa = pm(a), xb = pm(b);
          if (xa !== null && xb !== null && xa > xb) { u.members.reverse(); refreshOffsets(u); }
        }
        const wants = u.members.map((m) => (pm(m) === null ? null : pm(m) - off.get(m))).filter((w) => w !== null);
        u.want = wants.length ? wants.reduce((s, w) => s + w, 0) / wants.length : u.x;
      }
      settle(rows[g]);
    }
  };
  const up = () => {
    for (let g = maxGen - 1; g >= 0; g--) {
      for (const u of rows[g]) {
        const ks = [...new Set(u.members.flatMap((m) => kids.get(m)))];
        if (!ks.length) { u.want = u.x; continue; }
        // le milieu des parents de ces enfants (dans cette famille) au-dessus du milieu des enfants
        const ps = u.members.filter((m) => kids.get(m).length);
        const pMid = ps.reduce((s, m) => s + off.get(m), 0) / ps.length;
        u.want = ks.reduce((s, k) => s + xOf(k), 0) / ks.length - pMid;
      }
      settle(rows[g]);
    }
  };
  for (let it = 0; it < 4; it++) { down(); up(); }
  down();

  // rangées en hauteur
  const rowH = rows.map((r) => Math.max(0, ...r.flatMap((u) => u.members.map((m) => size(m).h))));
  let y = 0;
  const rowY = [];
  rowH.forEach((h, g) => { rowY[g] = y + h / 2; y += h + sp.level * 1.1; });
  let seq = 0;
  for (let g = 0; g <= maxGen; g++) {
    for (const u of [...rows[g]].sort((a, b) => a.x - b.x)) {
      for (const m of u.members) {
        A.pos.set(m, { x: xOf(m), y: rowY[g] });
        A.ctx.set(m, { role: 'family', axis: 'TB', depth: g, seq: seq++, seqLen: ids.length, branch: g });
      }
    }
  }
  for (const e of edges) {
    if (!e.direct) continue;
    A.hints.set(e.id, e.arrows === 'end' ? { kind: 'tree', axis: 'TB' } : { kind: 'straight' });
  }
  return A;
}

// ---------- Cible (cercles les uns dans les autres) ----------
// Au centre : la plus ancienne case sans flèche entrante. Sur le 1er cercle, ce qui y est relié directement, sur le 2e
// ce qui est relié à ceux-là, etc. (dans les deux sens). Ce qui n'est relié à rien va sur un dernier cercle, à part.
export function targetArrange(items, pairs, edges, size, sp, orderOf) {
  const A = emptyArrangement();
  const ids = [...items].sort((a, b) => orderOf(a) - orderOf(b));
  const nb = new Map(ids.map((id) => [id, []]));
  const hasIn = new Set();
  for (const { u, v } of pairs) {
    if (!nb.has(u) || !nb.has(v)) continue;
    nb.get(u).push(v); nb.get(v).push(u); hasIn.add(v);
  }
  for (const l of nb.values()) l.sort((a, b) => orderOf(a) - orderOf(b));
  const linked = ids.filter((id) => nb.get(id).length);
  const center = linked.find((id) => !hasIn.has(id)) || linked[0] || ids[0];
  const depth = new Map([[center, 0]]);
  const parent = new Map();
  const queue = [center];
  while (queue.length) {
    const v = queue.shift();
    for (const w of nb.get(v)) if (!depth.has(w)) { depth.set(w, depth.get(v) + 1); parent.set(w, v); queue.push(w); }
  }
  const maxLinked = Math.max(0, ...depth.values());
  const loose = ids.some((id) => !depth.has(id));
  for (const id of ids) if (!depth.has(id)) depth.set(id, maxLinked + 1);
  const rings = [];
  for (const id of ids) (rings[depth.get(id)] ||= []).push(id);
  const diag = (id) => (size(id).w + size(id).h) / 2; // encombrement moyen d'une case, quel que soit l'angle
  const R = [0];
  const angle = new Map([[center, -Math.PI / 2]]);
  for (let d = 1; d < rings.length; d++) {
    const ring = rings[d] || [];
    // dans l'ordre de leur case du cercle intérieur : moins de croisements
    ring.sort((a, b) => {
      const pa = parent.has(a) ? angle.get(parent.get(a)) : 9, pb = parent.has(b) ? angle.get(parent.get(b)) : 9;
      return (pa - pb) || (orderOf(a) - orderOf(b));
    });
    const prevMax = Math.max(0, ...(rings[d - 1] || []).map(diag)), curMax = Math.max(0, ...ring.map(diag));
    const around = ring.reduce((s, id) => s + Math.max(size(id).w, size(id).h) + sp.gap, 0);
    R[d] = Math.max(R[d - 1] + prevMax / 2 + sp.level + curMax / 2, around / (2 * Math.PI), d === 1 ? curMax : 0);
    ring.forEach((id, i) => angle.set(id, -Math.PI / 2 + (2 * Math.PI * i) / ring.length + (d % 2 ? 0 : Math.PI / Math.max(2, ring.length))));
  }
  let seq = 0;
  for (let d = 0; d < rings.length; d++) for (const id of rings[d] || []) {
    const a = angle.get(id);
    A.pos.set(id, d === 0 ? { x: 0, y: 0 } : { x: R[d] * Math.cos(a), y: R[d] * Math.sin(a) });
    A.ctx.set(id, { role: 'target', axis: 'TB', depth: d, seq: seq++, seqLen: ids.length, branch: d });
  }
  const Rmax = R[R.length - 1] || 0;
  if (rings.length > 1) A.timeline = { kind: 'rings', center, loose, radii: R.slice(1), bb: { x: -Rmax, y: -Rmax, w: 2 * Rmax, h: 2 * Rmax } };
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'straight' });
  return A;
}

// ---------- Réseau (personnages et relations) ----------
// Disposition « en toile » : les cases reliées s'attirent, toutes se repoussent ; pas de haut ni de bas.
// start(id) : position de départ connue (calcul précédent), pour que l'ajout d'une case ne bouscule pas tout.
export function networkArrange(items, pairs, edges, size, sp, orderOf, start, measure) {
  const A = emptyArrangement();
  const n = items.length;
  const ids = [...items].sort((a, b) => orderOf(a) - orderOf(b));
  const idx = new Map(ids.map((id, i) => [id, i]));
  const nb = ids.map(() => []);
  for (const { u, v } of pairs) {
    if (!idx.has(u) || !idx.has(v)) continue;
    nb[idx.get(u)].push(idx.get(v));
    nb[idx.get(v)].push(idx.get(u));
  }
  const W = ids.map((id) => size(id).w), H = ids.map((id) => size(id).h);
  const avg = ids.reduce((s, id, i) => s + Math.hypot(W[i], H[i]), 0) / Math.max(1, n);
  const lw = maxLabelWidth(edges, measure); // le texte des liens doit tenir entre les cases
  const k = avg * 0.5 + sp.level * 1.1 + lw * 0.45;
  const X = new Array(n), Y = new Array(n);
  let known = 0;
  ids.forEach((id, i) => { const p = start(id); if (p) { X[i] = p.x; Y[i] = p.y; known++; } });
  const R0 = k * Math.sqrt(n) * 0.6;
  ids.forEach((id, i) => {
    if (X[i] !== undefined) return;
    const ref = nb[i].find((j) => X[j] !== undefined);
    const a = i * 2.399963; // angle d'or : réparti sans hasard
    if (ref !== undefined) { X[i] = X[ref] + k * Math.cos(a); Y[i] = Y[ref] + k * Math.sin(a); }
    else { X[i] = R0 * Math.cos(a) * Math.sqrt((i + 1) / n); Y[i] = R0 * Math.sin(a) * Math.sqrt((i + 1) / n); }
  });
  const iters = n > 120 ? 160 : 260;
  let temp = known >= n * 0.6 ? k * 0.35 : k * 1.5;
  const cool = Math.pow(0.02, 1 / iters);
  for (let it = 0; it < iters; it++) {
    const dx = new Float64Array(n), dy = new Float64Array(n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let ex = X[i] - X[j], ey = Y[i] - Y[j];
      let d = Math.hypot(ex, ey);
      if (d < 0.01) { ex = (i - j) * 0.01 + 0.01; ey = 0.01; d = Math.hypot(ex, ey); }
      const f = (k * k) / d;
      dx[i] += (ex / d) * f; dy[i] += (ey / d) * f; dx[j] -= (ex / d) * f; dy[j] -= (ey / d) * f;
    }
    for (let i = 0; i < n; i++) for (const j of nb[i]) {
      if (j < i) continue;
      const ex = X[i] - X[j], ey = Y[i] - Y[j], d = Math.max(0.01, Math.hypot(ex, ey));
      const f = (d * d) / k;
      dx[i] -= (ex / d) * f; dy[i] -= (ey / d) * f; dx[j] += (ex / d) * f; dy[j] += (ey / d) * f;
    }
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += X[i]; cy += Y[i]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      dx[i] -= (X[i] - cx) * 0.02 * k / 10; dy[i] -= (Y[i] - cy) * 0.02 * k / 10; // légère gravité : les groupes isolés ne s'éloignent pas
      const d = Math.hypot(dx[i], dy[i]);
      if (d > 0) { const m = Math.min(d, temp); X[i] += (dx[i] / d) * m; Y[i] += (dy[i] / d) * m; }
    }
    temp *= cool;
  }
  // plus aucune case l'une sur l'autre
  const m = sp.gap * 0.6 + lw * 0.4;
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const ox = (W[i] + W[j]) / 2 + m - Math.abs(X[i] - X[j]);
      const oy = (H[i] + H[j]) / 2 + m - Math.abs(Y[i] - Y[j]);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (ox < oy) { const s = (X[i] < X[j] || (X[i] === X[j] && i < j) ? -1 : 1) * ox / 2; X[i] += s; X[j] -= s; }
      else { const s = (Y[i] < Y[j] || (Y[i] === Y[j] && i < j) ? -1 : 1) * oy / 2; Y[i] += s; Y[j] -= s; }
    }
    if (!moved) break;
  }
  ids.forEach((id, i) => {
    A.pos.set(id, { x: X[i], y: Y[i] });
    A.ctx.set(id, { role: 'network', axis: 'TB', depth: 0, seq: i, seqLen: n, branch: i });
  });
  for (const e of edges) if (e.direct) A.hints.set(e.id, { kind: 'straight' });
  return A;
}

// Rectangle englobant d'un arrangement (centres + tailles).
export function arrangementBBox(A, size) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [id, p] of A.pos) {
    const s = A.shapes.get(id) || size(id);
    x0 = Math.min(x0, p.x - s.w / 2); y0 = Math.min(y0, p.y - s.h / 2);
    x1 = Math.max(x1, p.x + s.w / 2); y1 = Math.max(y1, p.y + s.h / 2);
  }
  for (const p of A.bends.values()) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  if (A.timeline) {
    const b = A.timeline.bb;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function translateArrangement(A, dx, dy) {
  if (A.timeline) { A.timeline.bb.x += dx; A.timeline.bb.y += dy; }
  for (const p of A.pos.values()) { p.x += dx; p.y += dy; }
  for (const p of A.bends.values()) { p.x += dx; p.y += dy; }
}
