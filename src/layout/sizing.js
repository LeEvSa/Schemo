// Taille des cases : texte coupé en lignes, cases uniformes par groupe (comme SmartArt).
import { tr } from '../i18n.js';
import { parseMarkdown } from './markdown.js';

export const FONT = '"Segoe UI", "Segoe UI Variable Text", system-ui, -apple-system, Roboto, Ubuntu, "Helvetica Neue", Arial, sans-serif';
export const MONO = 'Consolas, "Cascadia Mono", Menlo, "DejaVu Sans Mono", monospace';
export const T = { title: 14, desc: 12.5, line: 1.3, padX: 12, padY: 9, indent: 13, gapTB: 3 };

// Part de la case réellement utilisable pour le texte, selon la forme (largeur, hauteur).
export const INNER = {
  rounded: [1, 1], rect: [1, 1], pill: [0.84, 1], ellipse: [0.74, 0.76], circle: [0.74, 0.76],
  diamond: [0.6, 0.62], hexagon: [0.8, 1], parallelogram: [0.78, 1], trap: [1, 1],
};

const MIN_TW = 86, MAX_TW = 170, MAX_TW_DESC = 236, MIN_H = 52;

export function makeMeasurer() {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map();
  return (text, size, weight, style = '') => {
    const key = style + '|' + weight + '|' + size + '|' + text;
    let w = cache.get(key);
    if (w === undefined) {
      if (cache.size > 30000) cache.clear();
      ctx.font = `${style === 'italic' ? 'italic ' : ''}${weight} ${size}px ${style === 'mono' ? MONO : FONT}`;
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

// Mesure approximative (tests hors navigateur).
export function approxMeasurer() {
  return (text, size, weight) => text.length * size * (weight >= 600 ? 0.56 : 0.52);
}

export function wrapText(text, maxW, size, weight, measure) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const w of words) {
    if (measure(w, size, weight) > maxW) {
      if (line) { lines.push(line); line = ''; }
      let chunk = '';
      for (const ch of w) {
        if (chunk && measure(chunk + ch, size, weight) > maxW) { lines.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
      continue;
    }
    const test = line ? line + ' ' + w : w;
    if (!line || measure(test, size, weight) <= maxW) line = test;
    else { lines.push(line); line = w; }
  }
  lines.push(line);
  return lines;
}

export function hasDesc(n) { return !!String(n.desc || '').trim(); }

const runWeight = (r, base) => (r.bold ? Math.max(700, base) : base);
const runStyle = (r) => (r.code ? 'mono' : r.italic ? 'italic' : '');
const runWidth = (r, text, size, base, measure) => measure(text, size, runWeight(r, base), runStyle(r));
const sameStyle = (a, b) => ['bold', 'italic', 'code', 'strike', 'link'].every((k) => !a[k] === !b[k]);

function appendRun(line, style, text) {
  const last = line[line.length - 1];
  if (last && sameStyle(last, style)) last.text += text;
  else line.push({ ...style, text });
}

// Comme wrapText, pour du texte à styles. Un « mot » peut changer de style en son milieu (**gr**as) : il ne se coupe pas là.
function wrapRuns(runs, maxW, size, base, measure) {
  const words = [];
  let open = false;
  for (const r of runs) {
    for (const part of r.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s/.test(part)) { open = false; continue; }
      if (!open) words.push([]);
      words[words.length - 1].push({ ...r, text: part });
      open = true;
    }
  }
  const lines = [];
  let cur = [], curW = 0;
  const push = () => { lines.push({ runs: cur, w: curW, text: cur.map((r) => r.text).join('') }); cur = []; curW = 0; };
  const space = measure(' ', size, base);
  for (const word of words) {
    const ww = word.reduce((sum, p) => sum + runWidth(p, p.text, size, base, measure), 0);
    if (ww > maxW) {
      if (cur.length) push();
      for (const p of word) {
        for (const ch of p.text) {
          const cw = runWidth(p, ch, size, base, measure);
          if (cur.length && curW + cw > maxW) push();
          appendRun(cur, p, ch);
          curW += cw;
        }
      }
      continue;
    }
    if (cur.length && curW + space + ww > maxW) push();
    if (cur.length) {
      // l'espace prend le style du mot seulement s'il continue le même style (sinon un lien soulignerait l'espace)
      appendRun(cur, sameStyle(cur[cur.length - 1], word[0]) ? word[0] : {}, ' ');
      curW += space;
    }
    for (const p of word) appendRun(cur, p, p.text);
    curW += ww;
  }
  if (cur.length || !lines.length) push();
  return lines;
}

const HEADING = { 1: 1.22, 2: 1.12, 3: 1.04 };

// Bloc de texte d'une case : lignes positionnées (haut du bloc = 0).
// Une ligne de description a des `runs` (morceaux stylés), `indent` (début du texte) et parfois `marker` (puce, numéro).
export function textBlock(n, innerW, scale, measure) {
  const ts = T.title * scale, ds = T.desc * scale;
  const title = (n.title || '').trim();
  const blocks = parseMarkdown(n.desc);
  const lines = [];
  let y = 0, width = 0;
  if (title || !blocks.length) {
    for (const l of wrapText(title, innerW, ts, 600, measure)) {
      const w = measure(l, ts, 600);
      lines.push({ text: l, size: ts, weight: 600, y, w, indent: 0 });
      width = Math.max(width, w);
      y += ts * T.line;
    }
  }
  if (blocks.length) {
    if (title) y += T.gapTB * scale;
    const unit = T.indent * scale;
    for (const b of blocks) {
      if (b.kind === 'gap') { y += ds * 0.5; continue; }
      if (b.kind === 'rule') { lines.push({ text: '', rule: true, size: ds, weight: 400, y, w: 0, indent: 0 }); y += ds * 0.7; continue; }
      const size = b.kind === 'h' ? ds * (HEADING[b.level] || 1) : ds;
      const weight = b.kind === 'h' ? 650 : 400;
      let indent = 0, markerX = 0;
      if (b.kind === 'li') {
        const at = b.level * unit;
        markerX = at + unit * 0.32;
        indent = at + (b.marker === 'dot' ? unit : Math.max(unit, measure(b.marker, ds, 400) + 4 * scale));
        if (b.marker !== 'dot') markerX = indent - 4 * scale;
      } else if (b.kind === 'quote') indent = unit * 0.8;
      wrapRuns(b.runs, Math.max(24, innerW - indent), size, weight, measure).forEach((l, i) => {
        const line = { text: l.text, runs: l.runs, size, weight, y, w: l.w + indent, indent };
        if (b.kind === 'li' && i === 0) { line.marker = b.marker; line.markerX = markerX; line.level = b.level; }
        if (b.kind === 'quote') line.quote = true;
        lines.push(line);
        width = Math.max(width, line.w);
        y += size * T.line;
      });
    }
  }
  return { lines, width, height: y, centered: !blocks.length };
}

function naturalWidth(n, measure) { return textBlock(n, 1e6, 1, measure).width; }

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

// Tailles uniformes pour un groupe de cases. Retourne Map id → {w, h, scale, text}.
// Les cases « ordinaires » (rectangles) fixent la taille commune ; un losange, un cercle ou une
// ellipse peut être plus haut si son texte l'exige, sans grossir les autres.
export function fitUniform(nodes, measure, shapeOf = (n) => n.shape) {
  const res = new Map();
  if (!nodes.length) return res;
  const inner = (n) => INNER[shapeOf(n)] || INNER.rounded;
  let core = nodes.filter((n) => inner(n)[0] >= 0.95);
  if (!core.length) core = nodes;
  const anyDesc = nodes.some(hasDesc);
  let tw = MIN_TW;
  for (const n of nodes) tw = Math.max(tw, naturalWidth(n, measure));
  tw = Math.min(tw, anyDesc ? MAX_TW_DESC : MAX_TW);
  let W = 0;
  for (const n of core) W = Math.max(W, (tw + 2 * T.padX) / inner(n)[0]);
  W = Math.ceil(W);
  const needOf = (n, w, scale) => {
    const [rx, ry] = inner(n);
    const tb = textBlock(n, w * rx - 2 * T.padX, scale, measure);
    return (tb.height + 2 * T.padY) / ry;
  };
  let scale = 1;
  let hs = core.map((n) => needOf(n, W, 1));
  const cap = Math.max(MIN_H, Math.min(210, median(hs) * 2.2));
  if (Math.max(...hs) > cap) {
    for (let s = 0.94; s >= 0.719; s -= 0.04) {
      scale = s;
      hs = core.map((n) => needOf(n, W, s));
      if (Math.max(...hs) <= cap) break;
    }
  }
  const H = Math.ceil(Math.max(MIN_H, ...hs));
  const coreSet = new Set(core);
  for (const n of nodes) {
    const shape = shapeOf(n);
    let w = W, h = H;
    if (!coreSet.has(n)) {
      // forme spéciale : un peu plus large si un mot ne rentre pas, plus haute si besoin
      const [rx] = inner(n);
      const longest = Math.max(0, ...String(n.title || '').split(/\s+/).map((wd) => measure(wd, T.title * scale, 600)));
      w = Math.max(W, Math.ceil((longest + 2 * T.padX) / rx));
      h = Math.max(H, Math.ceil(needOf(n, w, scale)));
      if (shape === 'diamond' && h > H * 1.6) { w = Math.ceil(w * 1.3); h = Math.max(H, Math.ceil(needOf(n, w, scale))); }
    }
    if (shape === 'circle') { w = h = Math.max(w, h, Math.ceil(needOf(n, Math.max(w, h), scale))); }
    const [rx] = inner(n);
    const text = textBlock(n, w * rx - 2 * T.padX, scale, measure);
    res.set(n.id, { w, h, scale, text });
  }
  return res;
}

// Taille d'un cadre replié (affiché comme une case).
export function collapsedSize(g, count, measure) {
  const tw = measure(g.title || tr('Cadre'), 13.5, 600);
  const w = Math.ceil(Math.min(280, Math.max(150, tw + 56)));
  return { w, h: 60 };
}

export function groupTitleWidth(g, measure) {
  return measure(g.title || tr('Cadre'), 13, 600) + 64;
}
