// Tracé des flèches, recalculé à chaque image à partir des positions courantes des cases.
// Un tracé est : polyligne {type:'poly', pts}, courbe {type:'cubic', p0,c1,c2,p1} ou arc {type:'arc', c,r,a0,a1,cw}.
import { boundary, inside } from './geometry.js';

const f = (v) => Math.round(v * 100) / 100;
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

function edgePoint(N, dx, dy) {
  const b = boundary(N.shape, N.w, N.h, N.trap, dx, dy);
  return { x: N.x + b.x, y: N.y + b.y };
}

function sidePoint(N, side) {
  const d = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side];
  return edgePoint(N, d[0], d[1]);
}

const NORMAL = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

function chooseSides(S, T) {
  const dx = T.x - S.x, dy = T.y - S.y;
  const gx = Math.abs(dx) - (S.w + T.w) / 2, gy = Math.abs(dy) - (S.h + T.h) / 2;
  // cases l'une au-dessus de l'autre (même en diagonale) : on sort par le bas, on entre par le haut
  const vertical = gy >= 30 || gy >= gx;
  if (!vertical) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function straight(S, T) {
  const dx = T.x - S.x, dy = T.y - S.y;
  return { type: 'poly', pts: [edgePoint(S, dx, dy), edgePoint(T, -dx, -dy)] };
}

function curve(S, T) {
  const [ss, ts] = chooseSides(S, T);
  const p0 = sidePoint(S, ss), p1 = sidePoint(T, ts);
  const horiz = ss === 'left' || ss === 'right';
  const dist = horiz ? Math.abs(p1.x - p0.x) : Math.abs(p1.y - p0.y);
  const k = Math.max(26, dist * 0.45);
  const n0 = NORMAL[ss], n1 = NORMAL[ts];
  return { type: 'cubic', p0, c1: { x: p0.x + n0.x * k, y: p0.y + n0.y * k }, c2: { x: p1.x + n1.x * k, y: p1.y + n1.y * k }, p1 };
}

function ortho(S, T) {
  const [ss, ts] = chooseSides(S, T);
  const p0 = sidePoint(S, ss), p1 = sidePoint(T, ts);
  if (ss === 'left' || ss === 'right') {
    if (Math.abs(p0.y - p1.y) < 1) return { type: 'poly', pts: [p0, p1] };
    const mx = (p0.x + p1.x) / 2;
    return { type: 'poly', pts: [p0, { x: mx, y: p0.y }, { x: mx, y: p1.y }, p1] };
  }
  if (Math.abs(p0.x - p1.x) < 1) return { type: 'poly', pts: [p0, p1] };
  const my = (p0.y + p1.y) / 2;
  return { type: 'poly', pts: [p0, { x: p0.x, y: my }, { x: p1.x, y: my }, p1] };
}

function tree(S, T, axis) {
  if (axis === 'LR') {
    const right = T.x >= S.x;
    const p0 = sidePoint(S, right ? 'right' : 'left'), p1 = sidePoint(T, right ? 'left' : 'right');
    if (Math.abs(p0.y - p1.y) < 1) return { type: 'poly', pts: [p0, p1] };
    const mx = (p0.x + p1.x) / 2;
    return { type: 'poly', pts: [p0, { x: mx, y: p0.y }, { x: mx, y: p1.y }, p1] };
  }
  const down = T.y >= S.y;
  const p0 = sidePoint(S, down ? 'bottom' : 'top'), p1 = sidePoint(T, down ? 'top' : 'bottom');
  if (Math.abs(p0.x - p1.x) < 1) return { type: 'poly', pts: [p0, p1] };
  const my = (p0.y + p1.y) / 2;
  return { type: 'poly', pts: [p0, { x: p0.x, y: my }, { x: p1.x, y: my }, p1] };
}

function hang(S, T) {
  const p0 = sidePoint(S, 'bottom');
  const p1 = sidePoint(T, T.x < S.x ? 'right' : 'left');
  if (p1.y <= p0.y + 4) return ortho(S, T);
  return { type: 'poly', pts: [p0, { x: S.x, y: p1.y }, p1] };
}

function elkRoute(S, T, hint, getBend) {
  const pts = [{ x: S.x + hint.so.dx, y: S.y + hint.so.dy }];
  for (const vid of hint.bends) {
    const b = getBend(vid);
    if (!b) return ortho(S, T);
    pts.push({ x: b.x, y: b.y });
  }
  pts.push({ x: T.x + hint.eo.dx, y: T.y + hint.eo.dy });
  return { type: 'poly', pts };
}

function circleOf(members, getNode) {
  let cx = 0, cy = 0, n = 0;
  const ps = [];
  for (const m of members) { const p = getNode(m); if (!p) continue; ps.push(p); cx += p.x; cy += p.y; n++; }
  if (n < 2) return null;
  cx /= n; cy /= n;
  let r = 0;
  for (const p of ps) r += Math.hypot(p.x - cx, p.y - cy);
  r /= n;
  return { c: { x: cx, y: cy }, r };
}

function arc(S, T, hint, getNode) {
  const circ = circleOf(hint.members, getNode);
  if (!circ || circ.r < 10) return curve(S, T);
  const { c, r } = circ;
  const as = Math.atan2(S.y - c.y, S.x - c.x), at = Math.atan2(T.y - c.y, T.x - c.x);
  const sgn = hint.cw ? 1 : -1;
  let span = sgn > 0 ? at - as : as - at;
  span = ((span % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (span < 1e-3) span = 2 * Math.PI;
  const pt = (a) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  const isIn = (N, p) => inside(N.shape, N.w, N.h, N.trap, p.x - N.x, p.y - N.y, 3);
  const exitAngle = (N, a0, dir) => {
    let lo = 0, hi = span / 2;
    if (isIn(N, pt(a0 + dir * hi))) return null;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (isIn(N, pt(a0 + dir * mid))) lo = mid; else hi = mid;
    }
    return hi;
  };
  const ds = exitAngle(S, as, sgn), dt = exitAngle(T, at, -sgn);
  if (ds === null || dt === null || ds + dt >= span) return curve(S, T);
  return { type: 'arc', c, r, a0: as + sgn * ds, a1: at - sgn * dt, cw: sgn > 0 };
}

function chord(S, T, hint, getNode) {
  const circ = circleOf(hint.members, getNode);
  const st = straight(S, T);
  if (!circ) return st;
  const [p0, p1] = st.pts;
  const m = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const q = { x: m.x + (circ.c.x - m.x) * 0.3, y: m.y + (circ.c.y - m.y) * 0.3 };
  return { type: 'cubic', p0, c1: { x: p0.x + (q.x - p0.x) * 2 / 3, y: p0.y + (q.y - p0.y) * 2 / 3 }, c2: { x: p1.x + (q.x - p1.x) * 2 / 3, y: p1.y + (q.y - p1.y) * 2 / 3 }, p1 };
}

// Choisit le tracé selon le style de la flèche et l'indice donné par la disposition.
export function routeOf(edge, hint, S, T, getNode, getBend) {
  if (Math.abs(S.x - T.x) < (S.w + T.w) / 2 && Math.abs(S.y - T.y) < (S.h + T.h) / 2) return straight(S, T);
  const style = edge.routing || 'auto';
  const k = hint ? hint.kind : null;
  if (style === 'straight') return straight(S, T);
  if (style === 'curve') return k === 'arc' ? arc(S, T, hint, getNode) : curve(S, T);
  if (style === 'ortho') {
    if (k === 'tree') return tree(S, T, hint.axis);
    if (k === 'hang') return hang(S, T);
    if (k === 'elk') return elkRoute(S, T, hint, getBend);
    return ortho(S, T);
  }
  switch (k) {
    case 'arc': return arc(S, T, hint, getNode);
    case 'chord': return chord(S, T, hint, getNode);
    case 'tree': return tree(S, T, hint.axis);
    case 'hang': return hang(S, T);
    case 'elk': return elkRoute(S, T, hint, getBend);
    case 'straight': return straight(S, T);
    default: return curve(S, T);
  }
}

// ---------- outils sur les tracés ----------

function arcPt(R, a) { return { x: R.c.x + R.r * Math.cos(a), y: R.c.y + R.r * Math.sin(a) }; }

export function endInfo(R, atStart) {
  if (R.type === 'poly') {
    const p = R.pts;
    const [a, b] = atStart ? [p[1], p[0]] : [p[p.length - 2], p[p.length - 1]];
    return { p: b, dir: norm(b.x - a.x, b.y - a.y) };
  }
  if (R.type === 'cubic') {
    if (atStart) {
      const q = Math.hypot(R.c1.x - R.p0.x, R.c1.y - R.p0.y) > 0.5 ? R.c1 : R.c2;
      return { p: R.p0, dir: norm(R.p0.x - q.x, R.p0.y - q.y) };
    }
    const q = Math.hypot(R.c2.x - R.p1.x, R.c2.y - R.p1.y) > 0.5 ? R.c2 : R.c1;
    return { p: R.p1, dir: norm(R.p1.x - q.x, R.p1.y - q.y) };
  }
  const a = atStart ? R.a0 : R.a1;
  const s = R.cw ? 1 : -1;
  const travel = { x: -Math.sin(a) * s, y: Math.cos(a) * s };
  return { p: arcPt(R, a), dir: atStart ? { x: -travel.x, y: -travel.y } : travel };
}

// Raccourcit le tracé (pour laisser la place aux pointes).
export function shorten(R, cutStart, cutEnd) {
  if (R.type === 'poly') {
    const pts = R.pts.map((p) => ({ ...p }));
    const cut = (i, j, d) => {
      const a = pts[i], b = pts[j];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l < 1e-6) return;
      const t = Math.min(d, l * 0.45) / l;
      pts[j] = { x: b.x + (a.x - b.x) * t, y: b.y + (a.y - b.y) * t };
    };
    if (cutEnd) cut(pts.length - 2, pts.length - 1, cutEnd);
    if (cutStart) cut(1, 0, cutStart);
    return { type: 'poly', pts };
  }
  if (R.type === 'cubic') {
    const out = { ...R };
    if (cutEnd) { const e = endInfo(R, false); out.p1 = { x: R.p1.x - e.dir.x * cutEnd, y: R.p1.y - e.dir.y * cutEnd }; out.c2 = { x: R.c2.x - e.dir.x * cutEnd, y: R.c2.y - e.dir.y * cutEnd }; }
    if (cutStart) { const e = endInfo(R, true); out.p0 = { x: R.p0.x - e.dir.x * cutStart, y: R.p0.y - e.dir.y * cutStart }; out.c1 = { x: R.c1.x - e.dir.x * cutStart, y: R.c1.y - e.dir.y * cutStart }; }
    return out;
  }
  const s = R.cw ? 1 : -1;
  return { ...R, a0: R.a0 + (s * cutStart) / R.r, a1: R.a1 - (s * cutEnd) / R.r };
}

function polyPath(pts, radius) {
  if (pts.length < 3 || radius <= 0) return 'M' + pts.map((p) => f(p.x) + ' ' + f(p.y)).join('L');
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) { d += `L${f(b.x)} ${f(b.y)}`; continue; }
    const p1 = { x: b.x + ((a.x - b.x) * r) / l1, y: b.y + ((a.y - b.y) * r) / l1 };
    const p2 = { x: b.x + ((c.x - b.x) * r) / l2, y: b.y + ((c.y - b.y) * r) / l2 };
    d += `L${f(p1.x)} ${f(p1.y)}Q${f(b.x)} ${f(b.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${f(z.x)} ${f(z.y)}`;
}

export function pathOf(R) {
  if (R.type === 'poly') return polyPath(R.pts, 10);
  if (R.type === 'cubic') return `M${f(R.p0.x)} ${f(R.p0.y)}C${f(R.c1.x)} ${f(R.c1.y)} ${f(R.c2.x)} ${f(R.c2.y)} ${f(R.p1.x)} ${f(R.p1.y)}`;
  const p0 = arcPt(R, R.a0), p1 = arcPt(R, R.a1);
  let span = R.cw ? R.a1 - R.a0 : R.a0 - R.a1;
  span = ((span % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return `M${f(p0.x)} ${f(p0.y)}A${f(R.r)} ${f(R.r)} 0 ${span > Math.PI ? 1 : 0} ${R.cw ? 1 : 0} ${f(p1.x)} ${f(p1.y)}`;
}

export function midOf(R) {
  if (R.type === 'poly') {
    const p = R.pts;
    let total = 0;
    for (let i = 1; i < p.length; i++) total += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    let half = total / 2;
    for (let i = 1; i < p.length; i++) {
      const l = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      if (half <= l && l > 0) return { x: p[i - 1].x + ((p[i].x - p[i - 1].x) * half) / l, y: p[i - 1].y + ((p[i].y - p[i - 1].y) * half) / l };
      half -= l;
    }
    return p[p.length - 1];
  }
  if (R.type === 'cubic') {
    const t = 0.5, u = 0.5;
    return {
      x: u * u * u * R.p0.x + 3 * u * u * t * R.c1.x + 3 * u * t * t * R.c2.x + t * t * t * R.p1.x,
      y: u * u * u * R.p0.y + 3 * u * u * t * R.c1.y + 3 * u * t * t * R.c2.y + t * t * t * R.p1.y,
    };
  }
  let span = R.cw ? R.a1 - R.a0 : R.a0 - R.a1;
  span = ((span % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return arcPt(R, R.a0 + (R.cw ? 1 : -1) * span / 2);
}

export function headPath(tip, dir, width) {
  const L = 8 + width * 1.7, W = 4 + width * 1.15;
  const bx = tip.x - dir.x * L, by = tip.y - dir.y * L;
  const px = -dir.y, py = dir.x;
  return `M${f(tip.x)} ${f(tip.y)}L${f(bx + px * W)} ${f(by + py * W)}L${f(bx - px * W)} ${f(by - py * W)}Z`;
}

export function headLength(width) { return 8 + width * 1.7; }

// Géométrie complète d'une flèche : chemin, pointes, milieu.
export function edgeGeometry(edge, hint, S, T, getNode, getBend) {
  const R = routeOf(edge, hint, S, T, getNode, getBend);
  const w = edge.width || 2;
  const L = headLength(w);
  const endHead = edge.arrows === 'end' || edge.arrows === 'both';
  const startHead = edge.arrows === 'both';
  const heads = [];
  if (endHead) { const e = endInfo(R, false); heads.push(headPath(e.p, e.dir, w)); }
  if (startHead) { const e = endInfo(R, true); heads.push(headPath(e.p, e.dir, w)); }
  const short = shorten(R, startHead ? L - 1 : 0, endHead ? L - 1 : 0);
  return { d: pathOf(short), hitD: pathOf(R), heads, mid: midOf(R) };
}
