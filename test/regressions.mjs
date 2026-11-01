// Cas relevés par la relecture : glisser un cadre avec son contenu, Ctrl+G, Ctrl+D et Ctrl+X sur un cadre.
export default async function (page, shot) {
  const S = (fn, arg) => page.evaluate(fn, arg);
  const log = (m) => console.log('  ' + m);
  const settle = (ms = 700) => page.waitForTimeout(ms);
  await S(() => window.__schemo.openExample());
  await settle(900);
  await S(() => { const a = window.__schemo; a.switchTab(a.doc.tabs[4].id); });
  await settle(700);
  await S(() => window.__schemo.renderer.fit(false));
  await settle(300);
  const counts = () => S(() => { const a = window.__schemo; const t = a.tab; return Object.values(t.groups).map((g) => g.title.slice(0, 7) + ':' + Object.values(t.nodes).filter((n) => n.group === g.id).length + (g.group ? '(dans ' + t.groups[g.group].title.slice(0, 7) + ')' : '')).join(' | '); });
  log('départ : ' + await counts());
  // tout sélectionner puis glisser un cadre
  await page.keyboard.press('Control+a');
  const g = await S(() => { const a = window.__schemo; const g = [...a.L.groups.values()][0]; return a.renderer.toScreen(g.x + 60, g.y + 12); });
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 80, g.y + 300, { steps: 8 });
  await page.mouse.up();
  await settle(900);
  log('après glisser de tout : ' + await counts());
  // Ctrl+G sur cadres + contenu
  await page.keyboard.press('Control+z');
  await settle(500);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+g');
  await settle(800);
  await page.keyboard.press('Escape');
  await settle(200);
  log('après Ctrl+G : ' + await counts());
  await page.keyboard.press('Control+z');
  await settle(600);
  // Ctrl+D sur un cadre
  await S(() => { const a = window.__schemo; a.select([Object.keys(a.tab.groups)[0]]); });
  await page.keyboard.press('Control+d');
  await settle(800);
  log('après Ctrl+D : ' + await counts());
  await shot('r01-duplique');
  // Ctrl+X sur un cadre
  const nb = await S(() => Object.keys(window.__schemo.tab.nodes).length);
  await S(() => { const a = window.__schemo; a.select([Object.keys(a.tab.groups)[0]]); });
  await page.keyboard.press('Control+x');
  await settle(700);
  log('Ctrl+X : ' + nb + ' → ' + await S(() => Object.keys(window.__schemo.tab.nodes).length) + ' cases ; ' + await counts());
  // annuler revient au bon onglet et à sa vue
  await S(() => { const a = window.__schemo; a.switchTab(a.doc.tabs[0].id); });
  await settle(500);
  await page.keyboard.press('Control+z');
  await settle(800);
  log('annuler depuis un autre onglet → onglet actif : ' + await S(() => window.__schemo.tab.name));
}
