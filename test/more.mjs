// Recherche, renommer un onglet, texte sur une flèche, glisser une case dans un cadre, Suppr, mini-carte.
export default async function (page, shot) {
  const S = (fn, arg) => page.evaluate(fn, arg);
  const log = (m) => console.log('  ' + m);
  const settle = (ms = 700) => page.waitForTimeout(ms);
  await S(() => window.__schemo.openExample());
  await settle(900);
  // recherche
  await page.keyboard.press('Control+f');
  await page.keyboard.type('case 3');
  await page.keyboard.press('Enter');
  await settle(500);
  log('recherche « case 3 » : ' + await S(() => window.__schemo.searchList.length) + ' résultat(s), sélection ' + await S(() => [...window.__schemo.sel].map((id) => window.__schemo.tab.nodes[id].title).join(',')));
  await shot('m01-recherche');
  await page.keyboard.press('Escape');
  // renommer l'onglet par double-clic
  const tab = await page.$('.tab.on');
  await tab.dblclick();
  await settle(200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Mon cycle');
  await page.keyboard.press('Enter');
  await settle(300);
  log('nom de l’onglet : ' + await S(() => window.__schemo.tab.name));
  // texte sur une flèche (double-clic sur le milieu)
  const mid = await S(() => { const a = window.__schemo; const e = [...a.L.edges.keys()][0]; const m = a.renderer.edgeMid(e); return { ...a.renderer.toScreen(m.x, m.y), id: e }; });
  await page.mouse.dblclick(mid.x, mid.y);
  await settle(300);
  await page.keyboard.type('ensuite');
  await page.keyboard.press('Enter');
  await settle(600);
  log('texte de la flèche : ' + await S((id) => window.__schemo.tab.edges[id].label, mid.id));
  await shot('m02-texte-fleche');
  // onglet des phases : glisser « Permis » dans la phase 1
  await S(() => { const a = window.__schemo; a.switchTab(a.doc.tabs[4].id); });
  await settle(700);
  await S(() => window.__schemo.renderer.fit(false));
  await settle(300);
  const drag = await S(() => {
    const a = window.__schemo;
    const n = Object.values(a.tab.nodes).find((x) => x.title === 'Permis');
    const g = Object.values(a.tab.groups).find((x) => x.title.includes('Phase 1'));
    const b = a.L.nodes.get(n.id), gr = a.L.groups.get(g.id);
    return { from: a.renderer.toScreen(b.x, b.y), to: a.renderer.toScreen(gr.x + gr.w - 30, gr.y + gr.h - 20), id: n.id, gid: g.id };
  });
  await page.mouse.move(drag.from.x, drag.from.y);
  await page.mouse.down();
  await page.mouse.move(drag.to.x, drag.to.y, { steps: 10 });
  await shot('m03-glisse-dans-cadre');
  await page.mouse.up();
  await settle(900);
  log('Permis dans la phase 1 : ' + await S((d) => window.__schemo.tab.nodes[d.id].group === d.gid, drag));
  await shot('m04-apres-cadre');
  // Suppr
  const before = await S(() => Object.keys(window.__schemo.tab.nodes).length);
  const p = await S((id) => { const a = window.__schemo; const b = a.L.nodes.get(id); return a.renderer.toScreen(b.x, b.y); }, drag.id);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Delete');
  await settle(700);
  log('Suppr : ' + before + ' → ' + await S(() => Object.keys(window.__schemo.tab.nodes).length) + ' cases, flèches restantes ' + await S(() => Object.keys(window.__schemo.tab.edges).length));
  // mini-carte visible ?
  log('mini-carte visible : ' + await S(() => document.querySelector('.minimap-wrap').classList.contains('show')));
  // fermeture avec changements non enregistrés : la question s'affiche
  await S(() => { window.__schemo.confirmDiscard().then((r) => { window.__closeAnswer = r; }); });
  await settle(300);
  await shot('m05-question-fermeture');
  const btn = await page.$('.modal-foot .btn:nth-child(2)');
  await btn.click();
  await settle(200);
  log('réponse « Ne pas enregistrer » : ' + await S(() => window.__closeAnswer));
}
