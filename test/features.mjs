// Fonctions diverses : cadre replié, menus, export, aide, gros diagramme, texte long, copier-coller.
export default async function (page, shot) {
  const S = (fn, arg) => page.evaluate(fn, arg);
  const log = (m) => console.log('  ' + m);
  let step = 0;
  const settle = (ms = 700) => { step++; if (process.env.DBG) console.log('    étape', step); return page.waitForTimeout(ms); };
  await S(() => window.__schemo.openExample());
  await settle(900);
  // cadre replié
  await S(() => { const a = window.__schemo; a.switchTab(a.doc.tabs[4].id); });
  await settle(700);
  await S(() => { const a = window.__schemo; const g = Object.values(a.tab.groups).find((x) => x.title.includes('Phase 2')); a.toggleCollapse(g.id); });
  await settle(800);
  await S(() => window.__schemo.renderer.fit(false));
  await settle(300);
  await shot('f01-cadre-replie');
  log('flèches visibles avec le cadre replié : ' + await S(() => window.__schemo.L.edges.size));
  // menu clic droit sur une case
  const c = await S(() => { const a = window.__schemo; const n = [...a.L.nodes.values()].find((x) => x.kind === 'node'); return a.renderer.toScreen(n.x, n.y); });
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await settle(300);
  const fm = await page.$('.menu-item.has-sub');
  if (fm) { await fm.hover(); await settle(250); }
  await shot('f02-menu');
  await page.keyboard.press('Escape');
  // fenêtre d'export
  S(() => window.__schemo.exportDialog());
  await settle(400);
  await shot('f03-export');
  await page.keyboard.press('Escape');
  await settle(200);
  S(() => window.__schemo.showHelp());
  await settle(400);
  await shot('f04-aide');
  await page.keyboard.press('Escape');
  await settle(200);
  // texte long et sous-points dans l'onglet processus
  await S(() => { const a = window.__schemo; a.switchTab(a.doc.tabs[2].id); });
  await settle(600);
  const p = await S(() => { const a = window.__schemo; const n = Object.values(a.tab.nodes).find((x) => x.title === 'Signature'); const b = a.L.nodes.get(n.id); return a.renderer.toScreen(b.x, b.y); });
  await page.mouse.dblclick(p.x, p.y);
  await settle(300);
  await page.keyboard.type('Signature du contrat avec le client et dépôt de 30 %');
  await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
  await page.keyboard.type('Copie au bureau');
  await settle(500);
  await shot('f05-edition');
  await page.keyboard.press('Enter');
  await settle(700);
  await S(() => window.__schemo.renderer.fit(false));
  await settle(300);
  await shot('f06-apres-edition');
  // copier-coller
  const before = await S(() => Object.keys(window.__schemo.tab.nodes).length);
  const p2 = await S(() => { const a = window.__schemo; const n = Object.values(a.tab.nodes).find((x) => x.title.startsWith('Signature')); const b = a.L.nodes.get(n.id); return a.renderer.toScreen(b.x, b.y); });
  await page.mouse.click(p2.x, p2.y);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await settle(700);
  log('copier-coller : ' + before + ' → ' + await S(() => Object.keys(window.__schemo.tab.nodes).length));
  await page.keyboard.press('Control+z');
  await settle(400);
  // gros diagramme
  const t = await S(async () => {
    const a = window.__schemo;
    a.addTab();
    await new Promise((r) => setTimeout(r, 300));
    const ids = [];
    let s = 11;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    a.change((tab) => {
      for (let i = 0; i < 220; i++) {
        const id = 'n' + i.toString(36) + 'big';
        tab.nodes[id] = { id, title: 'Idée ' + i, desc: i % 9 === 0 ? '- détail' : '', shape: 'rounded', color: null, group: null, pin: null, order: i };
        ids.push(id);
      }
      for (let i = 1; i < 220; i++) if (rnd() < 0.92) { const id = 'e' + i + 'big'; tab.edges[id] = { id, from: ids[Math.floor(rnd() * i)], to: ids[i], label: '', routing: 'auto', dash: 'solid', width: 2, color: null, arrows: 'end', order: 1000 + i }; }
      for (let k = 0; k < 6; k++) { const x = Math.floor(rnd() * 220), y = Math.floor(rnd() * 220); if (x !== y) { const id = 'ex' + k; tab.edges[id] = { id, from: ids[x], to: ids[y], label: '', routing: 'auto', dash: 'solid', width: 2, color: null, arrows: 'end', order: 3000 + k }; } }
      tab.seq = 4000;
    }, { animate: false });
    const t0 = performance.now();
    await a.relayout({ animate: false });
    return performance.now() - t0;
  });
  log('gros diagramme : disposition en ' + Math.round(t) + ' ms');
  await S(() => window.__schemo.renderer.fit(false));
  await settle(500);
  await shot('f07-gros');
  // fluidité : animation après ajout d'une case
  const fps = await S(async () => {
    const a = window.__schemo;
    const first = Object.values(a.tab.nodes)[5];
    let frames = 0;
    const t0 = performance.now();
    const count = () => { frames++; if (performance.now() - t0 < 600) requestAnimationFrame(count); };
    requestAnimationFrame(count);
    a.handleAction(first.id, Object.keys(a.handleActionsFor(first.id))[0]);
    await new Promise((r) => setTimeout(r, 650));
    if (a.editor.active) a.editor.commit();
    return frames / ((performance.now() - t0) / 1000);
  });
  log('images par seconde pendant l’animation (220 cases) : ' + Math.round(fps));
  await shot('f08-gros-ajout');
}
