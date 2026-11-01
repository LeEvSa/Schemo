// Scénario à la souris : créer, relier en cycle, brancher, épingler, encadrer, annuler, exporter, enregistrer.
export default async function (page, shot) {
  const S = (fn, arg) => page.evaluate(fn, arg);
  const center = async (title) => S((title) => {
    const app = window.__schemo;
    const n = Object.values(app.tab.nodes).find((x) => x.title === title);
    const b = app.renderer.nodeBox(n.id);
    const p = app.renderer.toScreen(b.x, b.y);
    return { id: n.id, x: p.x, y: p.y };
  }, title);
  const settle = (ms = 700) => page.waitForTimeout(ms);
  async function createAt(x, y, text) {
    await page.mouse.dblclick(x, y);
    await settle(500);
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await settle(500);
  }
  async function handle(title, side) {
    const c = await center(title);
    await page.mouse.move(c.x, c.y);
    await settle(250);
    const h = await page.$(`.handle[data-handle="${side}"]`);
    if (!h) throw new Error('pas de poignée ' + side + ' sur ' + title);
    const b = await h.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async function link(from, to) {
    const sides = await S((id) => Object.keys(window.__schemo.handleActionsFor(id) || {}), (await center(from)).id);
    const hp = await handle(from, sides.includes('right') ? 'right' : sides[0]);
    const t = await center(to);
    await page.mouse.move(hp.x, hp.y);
    await page.mouse.down();
    await page.mouse.move((hp.x + t.x) / 2, (hp.y + t.y) / 2, { steps: 5 });
    await page.mouse.move(t.x, t.y, { steps: 5 });
    await page.mouse.up();
    await settle();
  }
  const log = (m) => console.log('  ' + m);

  await createAt(400, 300, 'Case 1');
  await createAt(700, 300, 'Case 2');
  await createAt(550, 550, 'Case 3');
  await shot('i01-trois-cases');
  await link('Case 1', 'Case 3');
  await shot('i02-1-vers-3');
  await link('Case 3', 'Case 2');
  await shot('i03-3-vers-2');
  await link('Case 2', 'Case 1');
  await shot('i04-cycle');
  const roles = await S(() => [...window.__schemo.L.nodes.values()].map((n) => n.ctx.role).join(','));
  log('rôles après le cycle : ' + roles);
  // case 4 sous case 3 : poignée « branche »
  const id3 = (await center('Case 3')).id;
  const acts = await S((id) => window.__schemo.handleActionsFor(id), id3);
  const branchSide = Object.entries(acts).find(([, a]) => a.kind === 'branch')[0];
  log('côté branche de Case 3 : ' + branchSide);
  const hb = await handle('Case 3', branchSide);
  await page.mouse.click(hb.x, hb.y);
  await settle(600);
  await page.keyboard.type('Case 4');
  await page.keyboard.press('Enter');
  await settle();
  await shot('i05-case4');
  log('rôle case 4 : ' + await S(() => { const a = window.__schemo; const n = Object.values(a.tab.nodes).find((x) => x.title === 'Case 4'); return a.L.nodes.get(n.id).ctx.role; }));
  // insérer dans le cycle après Case 1
  const id1 = (await center('Case 1')).id;
  const acts1 = await S((id) => window.__schemo.handleActionsFor(id), id1);
  const ins = Object.entries(acts1).find(([, a]) => a.kind === 'insert-after');
  const hi = await handle('Case 1', ins[0]);
  await page.mouse.click(hi.x, hi.y);
  await settle(600);
  await page.keyboard.type('Étape insérée');
  await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
  await page.keyboard.type('une description');
  await page.keyboard.press('Enter');
  await settle();
  await shot('i06-insertion');
  // épingler Case 2 en la glissant
  const c2 = await center('Case 2');
  await page.mouse.move(c2.x, c2.y);
  await page.mouse.down();
  await page.mouse.move(c2.x + 150, c2.y + 200, { steps: 8 });
  await page.mouse.up();
  await settle();
  await shot('i07-epinglee');
  log('Case 2 épinglée : ' + JSON.stringify(await S((id) => window.__schemo.tab.nodes[id].pin, c2.id)));
  // tout sélectionner + cadre
  await page.mouse.click(1000, 700);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+g');
  await settle(900);
  await page.keyboard.type('Mon cycle');
  await page.keyboard.press('Enter');
  await settle();
  await shot('i08-cadre');
  // annuler 2 fois puis rétablir
  await page.mouse.click(1000, 760);
  await page.keyboard.press('Control+z');
  await settle(400);
  await page.keyboard.press('Control+z');
  await settle(400);
  await shot('i09-annule');
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  await settle();
  // forme imposée : processus
  await S(() => window.__schemo.setTabSettings({ shape: 'process' }));
  await settle();
  await shot('i10-force-processus');
  await S(() => window.__schemo.setTabSettings({ shape: 'auto' }));
  await settle();
  // mode sombre
  await S(() => window.__schemo.toggleMode());
  await settle(300);
  await shot('i11-sombre');
  await S(() => window.__schemo.toggleMode());
  // exports
  await S(() => window.__schemo.doExport({ format: 'png', bg: 'white', scale: '2' }));
  await S(() => window.__schemo.doExport({ format: 'svg', bg: 'transparent' }));
  await S(() => window.__schemo.doExport({ format: 'pdf', page: 'fit', tabs: 'current' }));
  await S(() => window.__schemo.doExport({ format: 'pdf', page: 'letter', tabs: 'all' }));
  // enregistrer
  const saved = await S(() => window.__schemo.saveAs());
  log('enregistré : ' + saved + ' → ' + await S(() => window.__schemo.filePath));
  const count = await S(() => Object.keys(window.__schemo.tab.nodes).length);
  log('cases : ' + count);
  await S(() => window.__schemo.newDoc());
  await settle(400);
  const p = await S(() => window.__schemo.filePath);
  log('après nouveau, chemin : ' + p);
}
