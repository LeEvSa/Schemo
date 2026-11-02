// Tests du moteur de disposition (hors navigateur, mesure approximative du texte).
import { createTab, createNode, createEdge, createGroup, canLink, deleteItems, normalizeDoc, serializeDoc } from '../src/model.js';
import { computeLayout } from '../src/layout/engine.js';
import { timelineGeometry } from '../src/render/draw.js';
import { approxMeasurer } from '../src/layout/sizing.js';
import { parseDate, parseSpan, chronoOrder } from '../src/layout/dates.js';

const measure = approxMeasurer();
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('  ÉCHEC :', msg); } };

function overlaps(L) {
  const ns = [...L.nodes.values()];
  const bad = [];
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
    const a = ns[i], b = ns[j];
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.5 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 0.5) bad.push([a.id, b.id]);
  }
  return bad;
}

function build(spec) {
  const t = createTab('test');
  const ids = {};
  for (const name of spec.nodes) ids[name] = createNode(t, { title: name }).id;
  for (const [a, b] of spec.edges || []) createEdge(t, ids[a], ids[b]);
  return { t, ids };
}

async function run(name, spec, expect) {
  const { t, ids } = build(spec);
  if (spec.setup) spec.setup(t, ids);
  const t0 = performance.now();
  const L = await computeLayout(t, measure, {});
  const ms = (performance.now() - t0).toFixed(0);
  const roles = {};
  for (const [nm, id] of Object.entries(ids)) { const n = L.nodes.get(id); roles[nm] = n ? n.ctx.role : '(caché)'; }
  const ov = overlaps(L);
  console.log(`• ${name} (${ms} ms) bbox ${Math.round(L.bbox.w)}×${Math.round(L.bbox.h)}`);
  check(ov.length === 0, `${name} : ${ov.length} chevauchements`);
  if (expect) expect(L, ids, roles);
  return { L, ids, roles, t };
}

await run('cycle de l’exemple (1→3, 3→2, 2→1)', { nodes: ['Case 1', 'Case 2', 'Case 3'], edges: [['Case 1', 'Case 3'], ['Case 3', 'Case 2'], ['Case 2', 'Case 1']] },
  (L, ids, r) => {
    check(Object.values(r).every((x) => x === 'cycle'), 'tout en cycle : ' + JSON.stringify(r));
    const arcs = [...L.edges.values()].filter((e) => e.hint && e.hint.kind === 'arc').length;
    check(arcs === 3, 'trois arcs, trouvé ' + arcs);
  });

await run('cycle + case 4 sous case 3', { nodes: ['Case 1', 'Case 2', 'Case 3', 'Case 4'], edges: [['Case 1', 'Case 3'], ['Case 3', 'Case 2'], ['Case 2', 'Case 1'], ['Case 3', 'Case 4']] },
  (L, ids, r) => {
    check(r['Case 4'] === 'ray', 'case 4 en rayon : ' + r['Case 4']);
    const c = ['Case 1', 'Case 2', 'Case 3'].map((n) => L.nodes.get(ids[n]));
    const cx = c.reduce((s, n) => s + n.x, 0) / 3, cy = c.reduce((s, n) => s + n.y, 0) / 3;
    const n3 = L.nodes.get(ids['Case 3']), n4 = L.nodes.get(ids['Case 4']);
    check(Math.hypot(n4.x - cx, n4.y - cy) > Math.hypot(n3.x - cx, n3.y - cy), 'case 4 plus loin du centre que case 3');
  });

await run('chaîne → processus', { nodes: ['A', 'B', 'C', 'D'], edges: [['A', 'B'], ['B', 'C'], ['C', 'D']] },
  (L, ids, r) => {
    check(Object.values(r).every((x) => x === 'chain'), 'tout en chaîne');
    check(L.nodes.get(ids.A).x < L.nodes.get(ids.B).x, 'A à gauche de B');
  });

await run('long processus (12) → serpentin', { nodes: Array.from({ length: 12 }, (_, i) => 'Étape ' + (i + 1)), edges: Array.from({ length: 11 }, (_, i) => ['Étape ' + (i + 1), 'Étape ' + (i + 2)]) },
  (L, ids) => { check(L.bbox.w < 1300, 'largeur raisonnable : ' + L.bbox.w); });

await run('arbre → hiérarchie', { nodes: ['Patron', 'A', 'B', 'C', 'A1', 'A2', 'B1'], edges: [['Patron', 'A'], ['Patron', 'B'], ['Patron', 'C'], ['A', 'A1'], ['A', 'A2'], ['B', 'B1']] },
  (L, ids, r) => {
    check(Object.values(r).every((x) => x === 'tree'), 'tout en arbre');
    check(L.nodes.get(ids.Patron).y < L.nodes.get(ids.A).y, 'patron au-dessus');
  });

await run('arbre large (10 feuilles) → suspendu', { nodes: ['Chef', ...Array.from({ length: 10 }, (_, i) => 'Membre ' + i)], edges: Array.from({ length: 10 }, (_, i) => ['Chef', 'Membre ' + i]) },
  (L) => { const hang = [...L.edges.values()].filter((e) => e.hint && e.hint.kind === 'hang').length; check(hang === 10, 'feuilles suspendues : ' + hang); });

await run('losange (DAG) → couches ELK', { nodes: ['Début', 'Gauche', 'Droite', 'Fin'], edges: [['Début', 'Gauche'], ['Début', 'Droite'], ['Gauche', 'Fin'], ['Droite', 'Fin']] },
  (L, ids, r) => { check(Object.values(r).every((x) => x === 'layered'), 'couches : ' + JSON.stringify(r)); });

await run('mélange : processus avec une boucle', { nodes: ['Début', 'Vérifier', 'Corriger', 'Retester', 'Fin'], edges: [['Début', 'Vérifier'], ['Vérifier', 'Corriger'], ['Corriger', 'Retester'], ['Retester', 'Vérifier'], ['Retester', 'Fin']] },
  (L, ids, r) => { check(r['Vérifier'] === 'cycle' || r['Vérifier'] === 'layered', 'rôle vérifier : ' + r['Vérifier']); console.log('   rôles', JSON.stringify(r)); });

await run('deux cycles reliés', { nodes: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'], edges: [['a1', 'a2'], ['a2', 'a3'], ['a3', 'a1'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b1'], ['a2', 'b1']] },
  (L, ids, r) => { console.log('   rôles', JSON.stringify(r)); });

await run('cases isolées', { nodes: ['x', 'y', 'z'] });

const framed = {};
await run('cadres', { nodes: ['p1', 'p2', 'p3', 'q1', 'q2', 'r'], edges: [['p1', 'p2'], ['p2', 'p3'], ['q1', 'q2'], ['p3', 'q1'], ['r', 'p1']],
  setup: (t, ids) => {
    const g1 = createGroup(t, { title: 'Phase 1' }), g2 = createGroup(t, { title: 'Phase 2' });
    t.nodes[ids.p1].group = g1.id; t.nodes[ids.p2].group = g1.id; t.nodes[ids.p3].group = g1.id;
    t.nodes[ids.q1].group = g2.id; t.nodes[ids.q2].group = g2.id;
    framed[g1.id] = ['p1', 'p2', 'p3'];
    framed[g2.id] = ['q1', 'q2'];
  } },
  (L, ids) => {
    check(L.groups.size === 2, 'deux cadres');
    for (const [gid, names] of Object.entries(framed)) {
      const g = L.groups.get(gid);
      for (const nm of names) {
        const n = L.nodes.get(ids[nm]);
        check(n.x - n.w / 2 >= g.x && n.x + n.w / 2 <= g.x + g.w && n.y - n.h / 2 >= g.y && n.y + n.h / 2 <= g.y + g.h, `${nm} dans son cadre`);
      }
    }
  });

await run('cadre replié', { nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['b', 'c'], ['c', 'd']],
  setup: (t, ids) => { const g = createGroup(t, { title: 'Milieu', collapsed: true }); t.nodes[ids.b].group = g.id; t.nodes[ids.c].group = g.id; } },
  (L, ids, r) => { check(r.b === '(caché)', 'b caché'); check(L.edges.size === 2, 'flèches remappées : ' + L.edges.size); });

await run('épinglée', { nodes: ['A', 'B', 'C'], edges: [['A', 'B'], ['B', 'C']], setup: (t, ids) => { t.nodes[ids.B].pin = { x: 500, y: 400 }; } },
  (L, ids) => { const b = L.nodes.get(ids.B); check(b.x === 500 && b.y === 400, 'B reste à sa place'); });

for (const shape of ['cycle', 'hierarchy', 'process', 'list', 'pyramid', 'radial', 'timeline']) {
  await run('forme imposée ' + shape, { nodes: ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq'], edges: [['Un', 'Deux'], ['Un', 'Trois'], ['Trois', 'Quatre']], setup: (t) => { t.settings.shape = shape; } });
}

// gros diagramme : 220 cases, structure mixte
{
  const t = createTab('gros');
  const ids = [];
  for (let i = 0; i < 220; i++) ids.push(createNode(t, { title: 'Case numéro ' + i, desc: i % 7 === 0 ? '- détail un\n- détail deux' : '' }).id);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 1; i < 220; i++) if (rnd() < 0.85) createEdge(t, ids[Math.floor(rnd() * i)], ids[i]);
  for (let k = 0; k < 8; k++) { const a = Math.floor(rnd() * 220), b = Math.floor(rnd() * 220); if (a !== b) createEdge(t, ids[a], ids[b]); }
  const t0 = performance.now();
  const L = await computeLayout(t, measure, {});
  const ov = overlaps(L);
  console.log(`• gros diagramme 220 cases (${(performance.now() - t0).toFixed(0)} ms) bbox ${Math.round(L.bbox.w)}×${Math.round(L.bbox.h)}`);
  check(ov.length === 0, 'gros : ' + ov.length + ' chevauchements');
  // stabilité : on recalcule avec les positions précédentes, rien ne doit bouger
  const { positionsOf } = await import('../src/layout/engine.js');
  t.positions = positionsOf(L);
  const L2 = await computeLayout(t, measure, {});
  let moved = 0;
  for (const [id, n] of L2.nodes) { const p = L.nodes.get(id); if (Math.hypot(p.x - n.x, p.y - n.y) > 1) moved++; }
  check(moved === 0, 'stabilité : ' + moved + ' cases ont bougé');
}

// dates et chronologie
{
  const earlier = (a, b) => check(parseDate(a) < parseDate(b), `date : ${a} avant ${b}`);
  for (const [a, b] of [
    ['2026-03-15', '2026-03-16'], ['2026-03', '2026-04-01'], ['1967', '2026'], ['2025-12-31', '2026'], ['15/03/2026', '16/03/2026'], ['31/12/2025', '01/01/2026'],
    ['12/25/2025', '01/01/2026'], ['mars 2026', 'avril 2026'], ['15 mars 2026', '2 avril 2026'], ['1er mai 2026', '2 mai 2026'], ['March 15, 2026', 'April 2, 2026'], ['Sept. 2026', 'Octobre 2026'],
    ['Décembre 2025', 'janvier 2026'], ['T1 2026', 'T2 2026'], ['Q4 2025', 'Q1 2026'], ['printemps 2026', 'été 2026'], ['500 av. J.-C.', '100 av. J.-C.'], ['100 av. J.-C.', '100'], ['-500', '1967'],
    ['Jour 2', 'Jour 10'], ['Semaine 9', 'Semaine 12'], ['9h30', '14h'], ['2026-03-15 9h', '2026-03-15 14:30'],
  ]) earlier(a, b);
  for (const none of ['', '   ', 'bientôt', 'plus tard']) check(parseDate(none) === null, `pas une date : « ${none} »`);
  // périodes : [texte, même début que, même fin que]
  const K = (y, m = 1, d = 1) => parseSpan(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`).start;
  const yearEnd = (y) => K(y, 12, 31);
  for (const [txt, s, e] of [
    ['de l\'an 2000 à l\'an 2010', K(2000), yearEnd(2010)], ['De l’an 2000 à l’an 2010', K(2000), yearEnd(2010)], ['l\'an 2000 à l\'an 2010', K(2000), yearEnd(2010)],
    ['de 2000 à 2010', K(2000), yearEnd(2010)], ['2000 à 2010', K(2000), yearEnd(2010)], ['2000-2010', K(2000), yearEnd(2010)], ['2000–2010', K(2000), yearEnd(2010)], ['2000 - 2010', K(2000), yearEnd(2010)],
    ['2000 au 2010', K(2000), yearEnd(2010)], ['de 2000 jusqu\'à 2010', K(2000), yearEnd(2010)], ['de 2000 jusqu’en 2010', K(2000), yearEnd(2010)], ['entre 2000 et 2010', K(2000), yearEnd(2010)],
    ['from 2000 to 2010', K(2000), yearEnd(2010)], ['between 2000 and 2010', K(2000), yearEnd(2010)], ['2000 → 2010', K(2000), yearEnd(2010)], ['2000..2010', K(2000), yearEnd(2010)], ['2010 à 2000', K(2000), yearEnd(2010)],
    ['1990-95', K(1990), yearEnd(1995)], ['de 1995 à 02', K(1995), yearEnd(2002)],
    ['du 3 au 15 mars 2026', K(2026, 3, 3), K(2026, 3, 15)], ['3 au 15 mars 2026', K(2026, 3, 3), K(2026, 3, 15)], ['du 3 mars au 15 avril 2026', K(2026, 3, 3), K(2026, 4, 15)],
    ['mars à juin 2026', K(2026, 3), K(2026, 6, 31)], ['mars-juin 2026', K(2026, 3), K(2026, 6, 31)], ['de mars 2020 à juin 2021', K(2020, 3), K(2021, 6, 31)], ['T1 à T3 2026', K(2026, 1), K(2026, 9, 31)],
    ['2026-03-15 au 2026-04-02', K(2026, 3, 15), K(2026, 4, 2)], ['15/03/2026 - 02/04/2026', K(2026, 3, 15), K(2026, 4, 2)],
    ['années 1990', K(1990), yearEnd(1999)], ['les années 90', K(1990), yearEnd(1999)], ['1990s', K(1990), yearEnd(1999)], ['XXe siècle', K(1901), yearEnd(2000)], ['20e siècle', K(1901), yearEnd(2000)], ['xixe siècle', K(1801), yearEnd(1900)],
  ]) {
    const sp = parseSpan(txt);
    check(sp && sp.start === s && Math.floor(sp.end) === Math.floor(e), `période « ${txt} » : ${JSON.stringify(sp)}, voulu ${s} → ${e}`);
  }
  for (const txt of ['depuis 2010', 'since 2010', '2010 à aujourd\'hui', '2010 à maintenant', '2010 - présent', '2010 to now', '2010 -', '2010 à nos jours']) {
    const sp = parseSpan(txt);
    check(sp && sp.start === K(2010) && sp.end === Infinity, `période en cours « ${txt} » : ${JSON.stringify(sp)}`);
  }
  check(parseSpan('500 à 400 av. J.-C.').start < parseSpan('400 av. J.-C.').start && parseSpan('500 à 400 av. J.-C.').end > parseSpan('400 av. J.-C.').start, 'période avant J.-C.');
  check(parseSpan('100 av. J.-C. à 100').start < 0 && parseSpan('100 av. J.-C. à 100').end > 0, 'période de part et d\'autre de l\'an 1');
  check(parseSpan('de 14h à 16h').start < parseSpan('de 14h à 16h').end && parseSpan('de 14h à 16h').end < 1, 'période d\'heures');
  check(Math.floor(parseSpan('15 mars 2026 de 9h à 11h').start) === K(2026, 3, 15), 'heures d\'une journée');
  check(parseSpan('Jour 3 à 5').start < parseSpan('Jour 4').start && parseSpan('Jour 3 à 5').end > parseSpan('Jour 4').start, 'jours');
  // ce qui ne doit surtout pas devenir une période
  for (const one of ['2026-03', '2026-03-15', '2000-10', 'mars 2026', '1967', '15 mars 2026', 'T1 2026', '500 av. J.-C.', 'Sept. 2026', '2026-03-15 14:30']) check(parseSpan(one) && parseSpan(one).end === null, `date simple : « ${one} » : ${JSON.stringify(parseSpan(one))}`);
  for (const none of ['il y a longtemps', 'une date à la main', 'de temps en temps']) check(parseSpan(none) === null, `pas une date : « ${none} »`);
  // mois/année, jour/mois, année à deux chiffres, milliers avec une espace, heures
  check(parseDate('03/2026') === parseDate('mars 2026') && parseDate('3/2026') === parseDate('mars 2026'), 'mois/année');
  for (const [a, b] of [['12/2025', '01/2026'], ['1967', '03/2026'], ['15/03', '16/03'], ['31/01', '01/02'], ['5 000 av. J.-C.', '500 av. J.-C.']]) earlier(a, b);
  const q = parseSpan('03/2026 à 06/2026');
  check(q && q.start === K(2026, 3) && Math.floor(q.end) === K(2026, 6, 31), 'période mois/année : ' + JSON.stringify(q));
  check(parseDate('03/15') === parseDate('15/03'), 'mois/jour quand le 2e nombre n\'est pas un mois');
  check(parseDate('mai 68') === parseDate('mai 1968'), 'année à deux chiffres');
  check(parseDate('5 000 av. J.-C.') === parseDate('5000 av. J.-C.'), 'milliers avec une espace');
  check(parseDate('8 hommes') === parseDate('8'), 'un mot en h n\'est pas une heure');
  check(parseDate('10 heures 30') === parseDate('10h30') && parseDate('10 heures') === parseDate('10h'), 'heures écrites en toutes lettres');
  const ord = (list) => chronoOrder(list.map((_, i) => i), (i) => list[i]).map((i) => list[i]).join('|');
  check(ord(['de 2000 à 2010', '2005', '1999', 'de 2000 à 2003']) === '1999|de 2000 à 2003|de 2000 à 2010|2005', 'périodes : par début puis fin : ' + ord(['de 2000 à 2010', '2005', '1999', 'de 2000 à 2003']));
  const order = (list) => chronoOrder(list.map((_, i) => i), (i) => list[i]).map((i) => list[i]).join('|');
  check(order(['2026', '1967', '2000']) === '1967|2000|2026', 'classé par date');
  check(order(['2000', '', '1967']) === '1967|2000|', 'sans date : reste après la précédente');
  check(order(['', 'a', '']) === '|a|', 'aucune date : ordre gardé');

  const t = createTab('chrono');
  t.settings.shape = 'timeline';
  const dates = ['2026-05-04', '2026-03-02', '', '2026-04-15', 'une très longue date écrite à la main', '2026-06-01'];
  const ids = dates.map((date, i) => createNode(t, { title: 'Étape ' + i, date }).id);
  let L = await computeLayout(t, measure, {});
  const xOf = (i) => L.nodes.get(ids[i]).x;
  check(xOf(1) < xOf(3) && xOf(3) < xOf(0) && xOf(0) < xOf(5), 'chronologie : ordre des dates de gauche à droite');
  check(overlaps(L).length === 0, 'chronologie : pas de chevauchement');
  check(L.timelines.length === 1 && L.timelines[0].members.length === dates.length, 'chronologie : une ligne, tous les points');
  const inBox = (bb, n) => n.x - n.w / 2 >= bb.x - 0.5 && n.x + n.w / 2 <= bb.x + bb.w + 0.5 && n.y - n.h / 2 >= bb.y - 0.5 && n.y + n.h / 2 <= bb.y + bb.h + 0.5;
  check([...L.nodes.values()].every((n) => inBox(L.bbox, n)), 'chronologie : tout dans le cadre de vue');
  const tb = L.timelines[0].bb;
  check(tb.x >= L.bbox.x - 0.5 && tb.x + tb.w <= L.bbox.x + L.bbox.w + 0.5, 'chronologie : dates dans le cadre de vue');
  t.settings.direction = 'TB';
  L = await computeLayout(t, measure, {});
  const yOf = (i) => L.nodes.get(ids[i]).y;
  check(L.timelines[0].axis === 'TB' && yOf(1) < yOf(3) && yOf(3) < yOf(0), 'chronologie verticale');
  check(overlaps(L).length === 0, 'chronologie verticale : pas de chevauchement');
  // dans un cadre, et cadre replié (pas de ligne)
  const t2 = createTab('chrono cadre');
  const g = createGroup(t2, { title: 'Phases', shape: 'timeline' });
  for (let i = 0; i < 4; i++) createNode(t2, { title: 'P' + i, group: g.id, date: String(2020 + i) });
  L = await computeLayout(t2, measure, {});
  check(L.timelines.length === 1, 'chronologie dans un cadre');
  const fr = L.groups.get(g.id), tbb = L.timelines[0].bb;
  check(tbb.x >= fr.x && tbb.x + tbb.w <= fr.x + fr.w && tbb.y >= fr.y && tbb.y + tbb.h <= fr.y + fr.h, 'la ligne reste dans son cadre');
  t2.groups[g.id].collapsed = true;
  L = await computeLayout(t2, measure, {});
  check(L.timelines.length === 0, 'cadre replié : pas de ligne');
  const big = createTab('longue');
  big.settings.shape = 'timeline';
  for (let i = 0; i < 40; i++) createNode(big, { title: 'Évt ' + i, date: String(1900 + i) });
  L = await computeLayout(big, measure, {});
  check(L.timelines[0].axis === 'TB', 'longue chronologie : verticale');
  // bande d'une période : entre ses voisines, et sur des rangs différents si deux périodes se chevauchent
  {
    const tp = createTab('périodes');
    tp.settings.shape = 'timeline';
    const list = ['1990', 'de l\'an 2000 à l\'an 2010', '2005', 'de 2004 à 2008', '2020', 'depuis 2022'];
    const pid = list.map((date, i) => createNode(tp, { title: 'P' + i, date }).id);
    const LP = await computeLayout(tp, measure, {});
    check(overlaps(LP).length === 0, 'périodes : pas de chevauchement malgré les longues dates');
    const box = (id) => { const n = LP.nodes.get(id); return { x: n.x, y: n.y, w: n.w, h: n.h }; };
    const geo = timelineGeometry(LP.timelines[0], box);
    const b = (id) => geo.bands.find((x) => x.id === id);
    check(geo.bands.length === 3, 'trois bandes : ' + geo.bands.length);
    check(b(pid[1]).from === Math.round(LP.nodes.get(pid[1]).x * 100) / 100, 'la bande part de sa case');
    check(b(pid[1]).to > LP.nodes.get(pid[2]).x && b(pid[1]).to < LP.nodes.get(pid[4]).x, 'de 2000 à 2010 : dépasse 2005, s\'arrête avant 2020');
    check(b(pid[3]).off !== b(pid[1]).off, 'deux périodes qui se chevauchent : rangs différents');
    check(b(pid[5]).to === geo.end, 'période en cours : jusqu\'au bout de la ligne');
  }
  // un fichier garde la date
  const back = normalizeDoc(JSON.parse(serializeDoc({ tabs: [t], active: t.id }))).tabs[0];
  check(back.settings.shape === 'timeline' && back.nodes[ids[1]].date === '2026-03-02', 'chronologie relue du fichier');
}

// flèches avec un cadre à un bout
{
  const t = createTab('cadres');
  const g1 = createGroup(t, { title: 'A' }), g2 = createGroup(t, { title: 'B' });
  const a = createNode(t, { title: 'a', group: g1.id }), b = createNode(t, { title: 'b', group: g2.id }), c = createNode(t, { title: 'c' }), d = createNode(t, { title: 'd' });
  const toBox = createEdge(t, g1.id, c.id), toFrame = createEdge(t, d.id, g1.id), frames = createEdge(t, g1.id, g2.id);
  const inner = createEdge(t, g1.id, a.id); // un cadre et son contenu : pas dessinée
  let L = await computeLayout(t, measure, {});
  check(L.edges.get(toBox.id)?.from === g1.id && L.edges.get(toBox.id)?.to === c.id, 'cadre → case');
  check(L.edges.get(toFrame.id)?.to === g1.id, 'case → cadre');
  check(L.edges.get(frames.id)?.to === g2.id, 'cadre → cadre');
  check(!L.edges.has(inner.id), 'cadre → son contenu : pas dessinée');
  const gc = L.groups.get(g1.id), nc = L.nodes.get(c.id), nd = L.nodes.get(d.id);
  const out = (n) => n.x + n.w / 2 <= gc.x || n.x - n.w / 2 >= gc.x + gc.w || n.y + n.h / 2 <= gc.y || n.y - n.h / 2 >= gc.y + gc.h;
  check(out(nc) && out(nd), 'cases reliées hors du cadre');
  // cadre replié : la flèche reste, sur le cadre replié ; celle du cadre parent aussi
  t.groups[g1.id].collapsed = true;
  L = await computeLayout(t, measure, {});
  check(L.nodes.get(g1.id)?.kind === 'cgroup' && L.edges.get(toBox.id)?.from === g1.id, 'cadre replié → case');
  t.groups[g1.id].collapsed = false;
  // chargement et suppression
  const back = normalizeDoc(JSON.parse(serializeDoc({ tabs: [t], active: t.id }))).tabs[0];
  check(back.edges[toBox.id] && back.edges[frames.id], 'relu du fichier');
  check(!canLink(t, g1.id, a.id) && !canLink(t, a.id, g1.id) && !canLink(t, g1.id, g1.id), 'cadre et contenu : refusé');
  check(canLink(t, g1.id, c.id) && canLink(t, b.id, g1.id) && canLink(t, g1.id, g2.id), 'autres liens : permis');
  deleteItems(t, [g1.id], false);
  check(!t.edges[toBox.id] && !t.edges[frames.id] && t.nodes[a.id], 'cadre dissous : ses flèches partent, ses cases restent');
}

console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests passent.');
process.exit(failures ? 1 : 0);
