// Poignées « + » autour d'une case : ce que chaque côté ajoute, selon la structure où la case se trouve.
import { labels } from '../i18n.js';

const SIDES = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

export const HANDLE_LABELS = labels({
  after: 'Ajouter une case après (flèche sortante) — glisser pour relier',
  before: 'Ajouter une case avant (flèche entrante) — glisser pour relier',
  'insert-after': 'Insérer une case juste après — glisser pour relier',
  'insert-before': 'Insérer une case juste avant — glisser pour relier',
  branch: 'Ajouter une branche — glisser pour relier',
  'sibling-after': 'Ajouter une case à côté (même parent) — glisser pour relier',
  'sibling-before': 'Ajouter une case à côté (même parent) — glisser pour relier',
  'seq-after': 'Ajouter un élément après — glisser pour relier',
  'seq-before': 'Ajouter un élément avant — glisser pour relier',
});

const dot = (a, b) => a.x * b.x + a.y * b.y;
const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };

function bestSide(vec, exclude) {
  return Object.keys(SIDES).filter((s) => !exclude.includes(s)).sort((a, b) => dot(SIDES[b], vec) - dot(SIDES[a], vec))[0];
}

const A = (kind) => ({ kind, label: HANDLE_LABELS[kind] });

// Un cadre, ouvert ou replié : une case reliée après ou avant lui.
export function frameHandles() {
  return { right: A('after'), bottom: A('after'), left: A('before'), top: A('before') };
}

export function handleActions(n, L, tab, scopeShape) {
  if (!n) return null;
  if (scopeShape === 'timeline') return n.ctx && n.ctx.axis === 'TB' ? { bottom: A('seq-after'), top: A('seq-before') } : { right: A('seq-after'), left: A('seq-before') };
  if (scopeShape === 'pyramid') return { bottom: A('seq-after'), top: A('seq-before') };
  if (scopeShape === 'list') return { right: A('seq-after'), bottom: A('seq-after'), left: A('seq-before'), top: A('seq-before') };
  const ctx = n.ctx || {};
  const hasPreds = Object.values(tab.edges).some((e) => e.to === n.id && e.from !== n.id);
  switch (ctx.role) {
    case 'cycle': {
      let cx = 0, cy = 0, k = 0;
      for (const m of ctx.cycle || []) { const p = L.nodes.get(m); if (p) { cx += p.x; cy += p.y; k++; } }
      if (!k) break;
      const out = norm({ x: n.x - cx / k, y: n.y - cy / k });
      const cw = { x: -out.y, y: out.x };
      const sOut = bestSide(out, []);
      const sCw = bestSide(cw, [sOut]);
      const sCcw = bestSide({ x: -cw.x, y: -cw.y }, [sOut, sCw]);
      return { [sOut]: A('branch'), [sCw]: A('insert-after'), [sCcw]: A('insert-before') };
    }
    case 'ray': {
      const out = { x: Math.cos(ctx.angle || 0), y: Math.sin(ctx.angle || 0) };
      const sOut = bestSide(out, []);
      const back = bestSide({ x: -out.x, y: -out.y }, [sOut]);
      const res = { [sOut]: A('after') };
      for (const s of Object.keys(SIDES)) if (s !== sOut && s !== back) res[s] = A('sibling-after');
      return res;
    }
    case 'radial':
      return { top: A('branch'), right: A('branch'), bottom: A('branch'), left: A('branch') };
    case 'single':
    case 'pinned':
    case 'free':
      return { right: A('after'), bottom: A('after'), left: A('before'), top: A('before') };
    default:
      break;
  }
  const axis = ctx.axis || 'LR';
  const chainy = ctx.role === 'chain';
  const res = axis === 'TB'
    ? { bottom: A(chainy ? 'insert-after' : 'after'), top: A(chainy ? 'insert-before' : 'before'), right: A('sibling-after'), left: A('sibling-before') }
    : { right: A(chainy ? 'insert-after' : 'after'), left: A(chainy ? 'insert-before' : 'before'), bottom: A('sibling-after'), top: A('sibling-before') };
  if (!hasPreds) {
    for (const s of Object.keys(res)) if (res[s].kind.startsWith('sibling')) delete res[s];
  }
  return res;
}
