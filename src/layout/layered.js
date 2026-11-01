// Disposition en couches (graphes avec embranchements) par ELK (Eclipse Layout Kernel).
import ELK from 'elkjs/lib/elk.bundled.js';
import { emptyArrangement } from './arrange.js';

let elk = null;
const getElk = () => (elk || (elk = new ELK()));

// edges : [{id, u, v, label, route}] — route=true : on garde le tracé calculé par ELK.
export async function layeredArrange(items, edges, size, sp, axis, orderOf, measure) {
  const A = emptyArrangement();
  const sorted = [...items].sort((a, b) => orderOf(a) - orderOf(b));
  const itemSet = new Set(items);
  const elkEdges = [];
  for (const e of [...edges].sort((a, b) => a.id < b.id ? -1 : 1)) {
    if (e.u === e.v || !itemSet.has(e.u) || !itemSet.has(e.v)) continue;
    const ee = { id: e.id, sources: [e.u], targets: [e.v] };
    if (e.label && measure) ee.labels = [{ id: e.id + ':l', text: e.label, width: Math.min(220, measure(e.label, 12, 400) + 12), height: 18 }];
    elkEdges.push(ee);
  }
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': axis === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.spacing.nodeNode': String(Math.round(sp.gap)),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.round(sp.level)),
      'elk.spacing.edgeNode': String(Math.round(sp.gap * 0.5)),
      'elk.spacing.edgeEdge': '10',
      'elk.layered.spacing.edgeNodeBetweenLayers': String(Math.round(sp.level * 0.35)),
      'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': String(Math.round(sp.comp)),
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.thoroughness': String(items.length > 120 ? 2 : items.length > 60 ? 4 : 7),
      'elk.spacing.edgeLabel': '4',
    },
    children: sorted.map((id) => ({ id, width: size(id).w, height: size(id).h })),
    edges: elkEdges,
  };
  const res = await getElk().layout(graph);
  for (const c of res.children) A.pos.set(c.id, { x: c.x + c.width / 2, y: c.y + c.height / 2 });
  const byId = new Map(edges.map((e) => [e.id, e]));
  for (const re of res.edges || []) {
    const e = byId.get(re.id);
    const sec = re.sections && re.sections[0];
    if (!e || !e.route || !sec) continue;
    const ps = A.pos.get(e.u), pt = A.pos.get(e.v);
    const vids = (sec.bendPoints || []).map((bp, k) => {
      const vid = 'b|' + e.id + '|' + k;
      A.bends.set(vid, { x: bp.x, y: bp.y });
      return vid;
    });
    A.hints.set(e.id, {
      kind: 'elk', axis, bends: vids,
      so: { dx: sec.startPoint.x - ps.x, dy: sec.startPoint.y - ps.y },
      eo: { dx: sec.endPoint.x - pt.x, dy: sec.endPoint.y - pt.y },
    });
  }
  // couches (pour les couleurs et les poignées)
  const key = (p) => Math.round(axis === 'LR' ? p.x : p.y);
  const layers = [...new Set([...A.pos.values()].map(key))].sort((a, b) => a - b);
  const layerOf = new Map(layers.map((v, i) => [v, i]));
  const seqSorted = [...A.pos.entries()].sort((a, b) => {
    const la = layerOf.get(key(a[1])), lb = layerOf.get(key(b[1]));
    if (la !== lb) return la - lb;
    return axis === 'LR' ? a[1].y - b[1].y : a[1].x - b[1].x;
  });
  seqSorted.forEach(([id, p], i) => {
    const layer = layerOf.get(key(p));
    A.ctx.set(id, { role: 'layered', axis, depth: layer, seq: i, seqLen: items.length, branch: layer });
  });
  return A;
}
