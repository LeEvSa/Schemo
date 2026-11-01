// Mini-carte (coin inférieur droit) : vue d'ensemble, clic ou glisser pour se déplacer.
import { nodeColors, groupColors } from '../render/themes.js';

export class Minimap {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dirty = true;
    this.map = null;
    let dragging = false;
    const go = (e) => {
      if (!this.map) return;
      const r = canvas.getBoundingClientRect();
      const wx = (e.clientX - r.left - this.map.ox) / this.map.s;
      const wy = (e.clientY - r.top - this.map.oy) / this.map.s;
      const rd = app.renderer;
      const v = rd.viewSize();
      rd.setCamera({ x: v.w / 2 - wx * rd.cam.z, y: v.h / 2 - wy * rd.cam.z, z: rd.cam.z }, false);
    };
    canvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); dragging = true; canvas.setPointerCapture(e.pointerId); go(e); });
    canvas.addEventListener('pointermove', (e) => { if (dragging) go(e); });
    canvas.addEventListener('pointerup', () => { dragging = false; });
  }

  invalidate() { this.dirty = true; this.app.renderer.requestFrame(); }

  draw() {
    if (!this.dirty) return;
    this.dirty = false;
    const app = this.app;
    const L = app.L;
    const rd = app.renderer;
    const c = this.canvas;
    const show = !!L && L.nodes.size >= 4;
    c.parentElement.classList.toggle('show', show);
    if (!show) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) { this.dirty = true; requestAnimationFrame(() => rd.requestFrame()); return; }
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const bb = L.bbox;
    const v = rd.viewSize();
    const vw = { x: -rd.cam.x / rd.cam.z, y: -rd.cam.y / rd.cam.z, w: v.w / rd.cam.z, h: v.h / rd.cam.z };
    const x0 = Math.min(bb.x, vw.x), y0 = Math.min(bb.y, vw.y);
    const x1 = Math.max(bb.x + bb.w, vw.x + vw.w), y1 = Math.max(bb.y + bb.h, vw.y + vw.h);
    const pad = 8;
    const s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
    const ox = pad - x0 * s + ((W - pad * 2) - (x1 - x0) * s) / 2;
    const oy = pad - y0 * s + ((H - pad * 2) - (y1 - y0) * s) / 2;
    this.map = { s, ox, oy };
    const tab = app.tab;
    const mode = app.mode;
    for (const g of L.groups.values()) {
      const gm = tab.groups[g.id];
      const col = groupColors(tab.settings, gm && gm.color, g.depth, mode);
      ctx.fillStyle = col.fill;
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth = 1;
      ctx.fillRect(ox + g.x * s, oy + g.y * s, g.w * s, g.h * s);
      ctx.strokeRect(ox + g.x * s, oy + g.y * s, g.w * s, g.h * s);
    }
    for (const n of L.nodes.values()) {
      const m = tab.nodes[n.id];
      const col = nodeColors(tab.settings, n.ctx, m);
      ctx.fillStyle = col.fill === '#ffffff' ? col.stroke : col.fill;
      ctx.fillRect(ox + (n.x - n.w / 2) * s, oy + (n.y - n.h / 2) * s, Math.max(1.5, n.w * s), Math.max(1.5, n.h * s));
    }
    ctx.strokeStyle = mode === 'dark' ? '#8ab4ff' : '#2f6fde';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = mode === 'dark' ? 'rgba(138,180,255,0.08)' : 'rgba(47,111,222,0.07)';
    ctx.fillRect(ox + vw.x * s, oy + vw.y * s, vw.w * s, vw.h * s);
    ctx.strokeRect(ox + vw.x * s, oy + vw.y * s, vw.w * s, vw.h * s);
  }
}
