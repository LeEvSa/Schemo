// Thèmes de couleurs (comme « Modifier les couleurs » de SmartArt) et outils de couleur.

export const PALETTE = ['#2f6fde', '#e8772e', '#1f9d6b', '#d94a64', '#7b52d3', '#d6a21e', '#1aa6b7', '#c2569f'];

// Réglages de couleurs d'un onglet (settings.colors) : tout ce que l'utilisateur peut modifier.
export function defaultColors() {
  return { base: '#0e8a7d', from: '#14a3b8', to: '#6c3fd1', gradStyle: 'steps', gradDir: 'h', palette: null, text: null, border: null };
}

export const GRADIENTS = [
  { label: 'Océan', from: '#14a3b8', to: '#6c3fd1' },
  { label: 'Coucher de soleil', from: '#f59e0b', to: '#db2777' },
  { label: 'Forêt', from: '#84cc16', to: '#0f766e' },
  { label: 'Feu', from: '#facc15', to: '#dc2626' },
  { label: 'Ciel', from: '#38bdf8', to: '#1e3a8a' },
  { label: 'Ardoise', from: '#9ca3af', to: '#1f2937' },
];

export const THEMES = [
  { id: 'bleu', label: 'Bleu', kind: 'mono', base: '#2f6fde' },
  { id: 'vert', label: 'Vert', kind: 'mono', base: '#1f9d6b' },
  { id: 'orange', label: 'Orange', kind: 'mono', base: '#e46f24' },
  { id: 'violet', label: 'Violet', kind: 'mono', base: '#7b52d3' },
  { id: 'colore', label: 'Coloré', kind: 'palette' },
  { id: 'degrade', label: 'Dégradé', kind: 'gradient' },
  { id: 'pastel', label: 'Pastel', kind: 'pastel' },
  { id: 'sobre', label: 'Sobre', kind: 'outline' },
  { id: 'nuit', label: 'Nuit', kind: 'dark' },
  { id: 'perso', label: 'Une couleur', kind: 'mono' },
];

export const SWATCHES = ['#2f6fde', '#1aa6b7', '#1f9d6b', '#7cb342', '#d6a21e', '#e8772e', '#d94a64', '#c2569f', '#7b52d3', '#3c4658', '#8a94a6', '#ffffff'];

export const CANVAS = { light: '#f5f6f8', dark: '#181b21' };

function hex(c) {
  let s = String(c || '').replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s, 16);
  if (!isFinite(n) || s.length !== 6) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export function luminance(c) {
  const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const textOn = (fill) => (luminance(fill) > 0.42 ? '#1c2230' : '#ffffff');

export function themeOf(id) { return THEMES.find((t) => t.id === id) || THEMES[0]; }

// Couleur de départ d'un thème une seule couleur : celle du thème, ou celle choisie pour « Une couleur ».
export function monoBase(t, c) { return t.base || c.base; }

function themeBase(settings) {
  const t = themeOf(settings.theme);
  const c = settings.colors || defaultColors();
  if (t.kind === 'mono') return monoBase(t, c);
  if (t.kind === 'gradient') return c.from;
  if (t.kind === 'outline' || t.kind === 'dark') return '#3c4658';
  return (c.palette || PALETTE)[0];
}

// Les couleurs de bordure et de texte choisies ont priorité : d'abord celles de la case, puis celles de l'onglet.
function withOverrides(colors, c, m) {
  const text = m.textColor || c.text;
  const stroke = m.borderColor || c.border;
  return { ...colors, ...(text ? { text } : null), ...(stroke ? { stroke } : null) };
}

function filled(fill, grad) { return { fill, stroke: mix(fill, '#000000', 0.18), text: textOn(fill), ...(grad ? { grad } : null) }; }

// Couleurs d'une case selon les réglages de l'onglet, son contexte (profondeur, branche, rang) et ses couleurs à elle.
// custom : l'objet case, ou simplement une couleur (cadre replié). `grad` = remplissage en dégradé, `fill` reste une
// couleur unie équivalente (mini-carte, calcul du texte).
export function nodeColors(settings, ctx, custom) {
  const cs = settings.colors || defaultColors();
  const m = typeof custom === 'string' ? { color: custom } : custom || {};
  return withOverrides(baseColors(settings.theme, cs, ctx, m), cs, m);
}

function baseColors(themeId, cs, ctx, m) {
  if (m.color) {
    if (m.color2) return filled(mix(m.color, m.color2, 0.5), { from: m.color, to: m.color2, dir: m.gradDir || 'h' });
    const fill = m.color;
    const light = luminance(fill) > 0.85;
    return { fill, stroke: light ? '#9aa3b2' : mix(fill, '#000000', 0.2), text: textOn(fill) };
  }
  const t = themeOf(themeId);
  const c = ctx || { depth: 0, seq: 0, seqLen: 1, branch: 0 };
  const depth = Math.max(0, c.depth || 0);
  const palette = cs.palette || PALETTE;
  const pal = (i) => palette[((i % palette.length) + palette.length) % palette.length];
  switch (t.kind) {
    case 'mono': {
      const fill = mix(monoBase(t, cs), '#ffffff', Math.min(0.38, depth * 0.13));
      return { fill, stroke: mix(fill, '#000000', 0.18), text: textOn(fill) };
    }
    case 'palette': {
      const fill = c.branch < 0 ? '#3c4658' : mix(pal(c.branch), '#ffffff', Math.min(0.3, (c.role === 'tree' || c.role === 'ray' || c.role === 'radial' ? Math.max(0, depth - 1) : 0) * 0.14));
      return { fill, stroke: mix(fill, '#000000', 0.18), text: textOn(fill) };
    }
    case 'gradient': {
      if (cs.gradStyle === 'inside') return filled(mix(cs.from, cs.to, 0.5), { from: cs.from, to: cs.to, dir: cs.gradDir });
      const tt = c.seqLen > 1 ? c.seq / (c.seqLen - 1) : 0;
      return filled(mix(cs.from, cs.to, tt));
    }
    case 'pastel': {
      const base = c.branch < 0 ? '#5b6577' : pal(c.branch);
      const fill = mix(base, '#ffffff', 0.8);
      return { fill, stroke: mix(base, '#ffffff', 0.25), text: '#1c2230' };
    }
    case 'outline':
      return { fill: '#ffffff', stroke: '#3d4656', text: '#1c2230' };
    case 'dark': {
      const accent = c.branch < 0 ? '#8a94a6' : pal(c.branch);
      const fill = mix('#232a36', '#ffffff', Math.min(0.12, depth * 0.04));
      return { fill, stroke: accent, text: '#f1f4f8' };
    }
    default:
      return { fill: '#2f6fde', stroke: '#1d4ea8', text: '#ffffff' };
  }
}

export function groupColors(settings, custom, depth, mode) {
  const base = custom || themeBase(settings);
  if (mode === 'dark') {
    return { fill: mix(base, CANVAS.dark, 0.84 - Math.min(0.12, depth * 0.04)), stroke: mix(base, CANVAS.dark, 0.35), title: mix(base, '#ffffff', 0.55) };
  }
  return { fill: mix(base, '#ffffff', 0.92 - Math.min(0.12, depth * 0.04)), stroke: mix(base, '#ffffff', 0.45), title: mix(base, '#000000', 0.3) };
}

export function edgeColors(custom, mode) {
  if (custom) return { stroke: custom, label: mode === 'dark' ? mix(custom, '#ffffff', 0.4) : mix(custom, '#000000', 0.25) };
  return mode === 'dark' ? { stroke: '#9ea8b6', label: '#d6dce5' } : { stroke: '#5d6878', label: '#394252' };
}
