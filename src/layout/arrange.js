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
export function timelineArrange(order, edges, size, sp, axis, dateOf, measure) {
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
