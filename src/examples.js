// Document d'exemples : montre ce que le rangement automatique fait avec différentes structures.
import { tr } from './i18n.js';
import { createTab, createNode, createEdge, createGroup } from './model.js';

function builder(name, settings = {}) {
  const t = createTab(name);
  Object.assign(t.settings, settings);
  const ids = {};
  const node = (key, title, items = [], props = {}) => { ids[key] = createNode(t, { title, desc: items.map((x) => '- ' + x).join('\n'), ...props }).id; return ids[key]; };
  const edge = (a, b, label = '') => createEdge(t, ids[a], ids[b], { label });
  return { t, ids, node, edge };
}

export function exampleDoc() {
  const tabs = [];

  {
    const { t, node, edge } = builder(tr('Cycle (ton exemple)'), { theme: 'colore' });
    node('1', tr('Case 1')); node('2', tr('Case 2')); node('3', tr('Case 3')); node('4', tr('Case 4'));
    edge('1', '3'); edge('3', '2'); edge('2', '1'); edge('3', '4');
    tabs.push(t);
  }
  {
    const { t, node, edge } = builder(tr('Hiérarchie'), { theme: 'bleu' });
    node('me', tr('Maître électricien'));
    node('a', tr('Chef d’équipe A')); node('b', tr('Chef d’équipe B')); node('bu', tr('Bureau'));
    node('a1', tr('Compagnon')); node('a2', tr('Apprenti'));
    node('b1', tr('Compagnon')); node('b2', tr('Apprenti')); node('b3', tr('Apprenti'));
    node('s', tr('Soumissions')); node('ac', tr('Achats'));
    edge('me', 'a'); edge('me', 'b'); edge('me', 'bu');
    edge('a', 'a1'); edge('a', 'a2'); edge('b', 'b1'); edge('b', 'b2'); edge('b', 'b3'); edge('bu', 's'); edge('bu', 'ac');
    tabs.push(t);
  }
  {
    const { t, node, edge } = builder(tr('Processus'), { theme: 'degrade' });
    node('1', tr('Visite du client'), [tr('Prendre les mesures'), tr('Photos du panneau')]);
    node('2', tr('Soumission'));
    node('3', tr('Signature'));
    node('4', tr('Permis'));
    node('5', tr('Installation'), [tr('Câblage'), tr('Raccordements')]);
    node('6', tr('Inspection'));
    node('7', tr('Mise en service'));
    node('8', tr('Facturation'));
    for (let i = 1; i < 8; i++) edge(String(i), String(i + 1));
    tabs.push(t);
  }
  {
    const { t, node, edge } = builder(tr('Procédure avec boucle'), { theme: 'colore' });
    node('p', tr('Panne signalée'), [], { shape: 'pill' });
    node('c', tr('Couper le courant'));
    node('d', tr('Diagnostiquer'));
    node('r', tr('Réparer'));
    node('te', tr('Tester'), [], { shape: 'diamond' });
    node('re', tr('Remettre en service'));
    node('ra', tr('Rapport au client'), [], { shape: 'pill' });
    edge('p', 'c'); edge('c', 'd'); edge('d', 'r'); edge('r', 'te');
    edge('te', 'd', tr('non')); edge('te', 're', tr('oui')); edge('re', 'ra');
    tabs.push(t);
  }
  {
    const { t, ids, node, edge } = builder(tr('Projet en phases (cadres)'), { theme: 'vert' });
    const g1 = createGroup(t, { title: tr('Phase 1 — Étude') });
    const g2 = createGroup(t, { title: tr('Phase 2 — Installation') });
    const g3 = createGroup(t, { title: tr('Phase 3 — Mise en service') });
    node('v', tr('Visite du site'), [], { group: g1.id }); node('f', tr('Analyse des factures'), [], { group: g1.id }); node('d', tr('Dimensionnement'), [], { group: g1.id });
    node('pe', tr('Permis'), [], { group: g2.id }); node('st', tr('Structure'), [], { group: g2.id }); node('pa', tr('Panneaux'), [], { group: g2.id }); node('on', tr('Onduleur'), [], { group: g2.id });
    node('in', tr('Inspection'), [], { group: g3.id }); node('hq', tr('Raccordement réseau'), [], { group: g3.id }); node('su', tr('Suivi de production'), [], { group: g3.id });
    edge('v', 'f'); edge('f', 'd'); edge('d', 'pe');
    edge('pe', 'st'); edge('st', 'pa'); edge('pa', 'on'); edge('on', 'in');
    edge('in', 'hq'); edge('hq', 'su');
    void ids;
    tabs.push(t);
  }
  {
    const { t, node, edge } = builder(tr('Carte d’idées'), { theme: 'pastel', shape: 'radial' });
    node('u', tr('Mon univers'), [], { shape: 'ellipse' });
    node('p', tr('Personnages')); node('l', tr('Lieux')); node('f', tr('Factions')); node('i', tr('Intrigue'));
    node('h', tr('Héros')); node('r', tr('Rival')); node('c', tr('Capitale')); node('fo', tr('Forêt')); node('o', tr('L’Ordre')); node('re', tr('Rebelles')); node('t', tr('Trahison'));
    edge('u', 'p'); edge('u', 'l'); edge('u', 'f'); edge('u', 'i');
    edge('p', 'h'); edge('p', 'r'); edge('l', 'c'); edge('l', 'fo'); edge('f', 'o'); edge('f', 're'); edge('i', 't');
    tabs.push(t);
  }
  {
    const { t, node } = builder(tr('Pyramide'), { theme: 'violet', shape: 'pyramid' });
    node('1', tr('Vision')); node('2', tr('Objectifs')); node('3', tr('Projets')); node('4', tr('Tâches')); node('5', tr('Actions de tous les jours'));
    tabs.push(t);
  }
  {
    const { t, node } = builder(tr('Chronologie'), { theme: 'degrade', shape: 'timeline' });
    node('1', tr('Visite du site'), [], { date: '2026-03-02' });
    node('2', tr('Soumission'), [], { date: '2026-03-10' });
    node('3', tr('Signature'), [], { date: '2026-03-20' });
    node('4', tr('Permis'), [], { date: '2026-04-15' });
    node('5', tr('Installation'), [], { date: '2026-05-04' });
    node('6', tr('Inspection'), [], { date: '2026-05-20' });
    node('7', tr('Mise en service'), [], { date: '2026-06-01' });
    tabs.push(t);
  }
  return { format: 'schemo', version: 1, tabs, active: tabs[0].id };
}
