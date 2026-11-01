// Outils de graphe : paires uniques, composantes, cycles (Tarjan), ordres de lecture.

// Paires orientées uniques u→v (sans boucles sur soi-même), limitées à `idSet`.
export function uniquePairs(edges, idSet) {
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    if (e.u === e.v) continue;
    if (idSet && (!idSet.has(e.u) || !idSet.has(e.v))) continue;
    const k = e.u + '>' + e.v;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ u: e.u, v: e.v });
  }
  return out;
}

export function adjacency(ids, pairs) {
  const out = new Map(), inn = new Map();
  for (const id of ids) { out.set(id, []); inn.set(id, []); }
  for (const { u, v } of pairs) {
    if (!out.has(u) || !out.has(v)) continue;
    out.get(u).push(v);
    inn.get(v).push(u);
  }
  return { out, inn };
}

// Composantes faiblement connexes, triées par ordre de création.
export function weakComponents(ids, edges, orderOf) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const e of edges) {
    if (!parent.has(e.u) || !parent.has(e.v)) continue;
    const a = find(e.u), b = find(e.v);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map();
  for (const id of ids) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(id);
  }
  const comps = [...groups.values()];
  for (const c of comps) c.sort((a, b) => orderOf(a) - orderOf(b));
  comps.sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
  return comps;
}

// Composantes fortement connexes (Tarjan, itératif).
export function scc(ids, out) {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], result = [];
  for (const root of ids) {
    if (idx.has(root)) continue;
    idx.set(root, index); low.set(root, index); index++;
    stack.push(root); onStack.add(root);
    const work = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const v = top[0];
      const nbrs = out.get(v) || [];
      if (top[1] < nbrs.length) {
        const w = nbrs[top[1]++];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++;
          stack.push(w); onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), idx.get(w)));
        }
      } else {
        work.pop();
        if (work.length) {
          const p = work[work.length - 1][0];
          low.set(p, Math.min(low.get(p), low.get(v)));
        }
        if (low.get(v) === idx.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          result.push(comp);
        }
      }
    }
  }
  return result;
}

// Ordre de lecture : tri topologique, à égalité l'ordre de création ; les cycles sont brisés au plus ancien.
export function flowOrder(ids, pairs, orderOf) {
  const set = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  for (const { u, v } of pairs) {
    if (!set.has(u) || !set.has(v) || u === v) continue;
    indeg.set(v, indeg.get(v) + 1);
    out.get(u).push(v);
  }
  const sorted = [...ids].sort((a, b) => orderOf(a) - orderOf(b));
  const done = new Set();
  const res = [];
  while (res.length < sorted.length) {
    let pick = null;
    for (const id of sorted) if (!done.has(id) && indeg.get(id) <= 0) { pick = id; break; }
    if (pick === null) for (const id of sorted) if (!done.has(id)) { pick = id; break; }
    done.add(pick);
    res.push(pick);
    for (const w of out.get(pick)) indeg.set(w, indeg.get(w) - 1);
  }
  return res;
}

// Ordre autour d'un cycle : part du plus ancien et suit les flèches.
export function cycleOrder(ids, pairs, orderOf) {
  const set = new Set(ids);
  const out = new Map(ids.map((id) => [id, []]));
  for (const { u, v } of pairs) if (set.has(u) && set.has(v) && u !== v) out.get(u).push(v);
  for (const l of out.values()) l.sort((a, b) => orderOf(a) - orderOf(b));
  const sorted = [...ids].sort((a, b) => orderOf(a) - orderOf(b));
  const res = [];
  const seen = new Set();
  let cur = sorted[0];
  while (cur !== undefined) {
    res.push(cur);
    seen.add(cur);
    let next = out.get(cur).find((w) => !seen.has(w));
    if (next === undefined) {
      // coincé : une case pas encore placée qui reçoit une flèche d'une case placée, sinon la plus ancienne
      next = sorted.find((w) => !seen.has(w) && res.some((r) => out.get(r).includes(w)));
      if (next === undefined) next = sorted.find((w) => !seen.has(w));
    }
    cur = next;
  }
  return res;
}
