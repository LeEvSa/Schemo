// Géométrie des formes : contours SVG, points de bord, test « dedans ».

const f = (v) => Math.round(v * 100) / 100;

function roundedRect(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const x = -w / 2, y = -h / 2;
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}

function polygon(pts) {
  return 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
}

export function polygonOf(shape, w, h, trap) {
  const a = w / 2, b = h / 2;
  switch (shape) {
    case 'diamond': return [[0, -b], [a, 0], [0, b], [-a, 0]];
    case 'hexagon': { const i = Math.min(b * 0.58, w * 0.2); return [[-a + i, -b], [a - i, -b], [a, 0], [a - i, b], [-a + i, b], [-a, 0]]; }
    case 'parallelogram': { const s = Math.min(h * 0.35, w * 0.15); return [[-a + s, -b], [a, -b], [a - s, b], [-a, b]]; }
    case 'trap': { const t = (trap ? trap.top : w) / 2, bt = (trap ? trap.bottom : w) / 2; return [[-t, -b], [t, -b], [bt, b], [-bt, b]]; }
    default: return null;
  }
}

export function shapePath(shape, w, h, trap) {
  switch (shape) {
    case 'rect': return roundedRect(w, h, 2.5);
    case 'pill': return roundedRect(w, h, h / 2);
    case 'ellipse':
    case 'circle': {
      const a = w / 2, b = h / 2;
      return `M${f(-a)} 0A${f(a)} ${f(b)} 0 1 0 ${f(a)} 0A${f(a)} ${f(b)} 0 1 0 ${f(-a)} 0Z`;
    }
    case 'diamond':
    case 'hexagon':
    case 'parallelogram':
    case 'trap':
      return polygon(polygonOf(shape, w, h, trap));
    case 'rounded':
    default:
      return roundedRect(w, h, Math.min(12, Math.min(w, h) * 0.2));
  }
}

// Point du contour dans la direction (dx, dy) depuis le centre (relatif au centre).
export function boundary(shape, w, h, trap, dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 0, y: -h / 2 };
  dx /= len; dy /= len;
  if (shape === 'ellipse' || shape === 'circle') {
    const t = 1 / Math.sqrt((dx / (w / 2)) ** 2 + (dy / (h / 2)) ** 2);
    return { x: dx * t, y: dy * t };
  }
  const poly = polygonOf(shape, w, h, trap);
  if (poly) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const ex = x2 - x1, ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (x1 * ey - y1 * ex) / den;
      const s = (x1 * dy - y1 * dx) / den;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
    }
    if (best < Infinity) return { x: dx * best, y: dy * best };
  }
  if (shape === 'pill') {
    // bout arrondi
    const r = h / 2, cx = w / 2 - r;
    const tx = Math.abs(dx) > 1e-9 ? (w / 2) / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 1e-9 ? (h / 2) / Math.abs(dy) : Infinity;
    let t = Math.min(tx, ty);
    const px = dx * t;
    if (Math.abs(px) > cx) {
      const sx = Math.sign(dx) * cx;
      // intersection rayon / cercle centré (sx, 0)
      const bq = -2 * (dx * sx);
      const c = sx * sx - r * r;
      const disc = bq * bq - 4 * c;
      if (disc >= 0) t = (-bq + Math.sqrt(disc)) / 2;
    }
    return { x: dx * t, y: dy * t };
  }
  const tx = Math.abs(dx) > 1e-9 ? (w / 2) / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-9 ? (h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: dx * t, y: dy * t };
}

// Le point (relatif au centre) est-il dans la forme (agrandie de m) ?
export function inside(shape, w, h, trap, px, py, m = 0) {
  const a = w / 2 + m, b = h / 2 + m;
  if (shape === 'ellipse' || shape === 'circle') return (px / a) ** 2 + (py / b) ** 2 <= 1;
  if (shape === 'diamond') return Math.abs(px) / a + Math.abs(py) / b <= 1;
  return Math.abs(px) <= a && Math.abs(py) <= b;
}
