# Schémo — notes pour Claude

Application de bureau Windows (Electron) de diagrammes à rangement automatique, faite pour LeEvSa le 2026-10-29.
Guide utilisateur : `README.md` (anglais) et `README.fr.md` (français), à tenir à jour ensemble. **Tout ce qui paraît sur GitHub est en anglais par défaut** (règle demandée par LeEvSa le 2026-11-01) : description du dépôt, notes de release, `README.md`, `CHANGELOG.md`. Dépôt GitHub **public** `LeEvSa/Schemo`, licence MIT. Notes propres à la machine de développement : `CLAUDE.local.md`,
hors Git. **Rien de personnel dans le dépôt** : ni adresse, ni chemin, ni réseau.

## Mises à jour
Nom : **semaine.numéro** (règle demandée par LeEvSa le 2026-11-01). Semaines de 7 jours depuis la création : semaine 1 = 29 oct. au 4 nov. 2026.
**Chaque commit = une mise à jour** et porte son numéro comme nom (ex. « 2.1 », puis « 2.2 »), règle demandée par LeEvSa le 2026-11-07 ;
un commit n'oblige pas à publier un Setup. Pour chaque mise à jour : `npm run nouvelle-update` (met le numéro dans `package.json`), l'écrire dans `CHANGELOG.md`, puis `npm run dist`. Publier : commit, `git push`, puis `gh release create <numéro> dist/Schemo-Setup.exe dist/Schemo-Setup.exe.blockmap dist/latest.yml dist/Schemo.exe`. **`latest.yml` est indispensable** : sans lui, la mise à jour dans l'app (electron-updater, `main.cjs`) ne trouve rien.

## Ce que LeEvSa a demandé (questionnaire du 2026-10-29)
- Saisie **à la souris seulement** (pas de panneau texte ni de phrases rapides).
- Forme **détectée automatiquement**, avec menu pour imposer une forme (onglet ou cadre).
- Flèche **A → B = A vient avant B**.
- Case déplacée à la main = **épinglée**, le reste s'adapte ; clic sur la punaise pour relâcher.
- Dans un cycle, une case accrochée part **vers l'extérieur** (rayon).
- Cases **uniformes** façon SmartArt (texte qui passe à la ligne puis rapetisse).
- Description en Markdown sous le titre (a remplacé les sous-points le 2026-11-01), couleur par case, formes variées ; flèches : texte, style auto selon la forme, style au choix, sans pointe / double.
- Usage : procédures, organigrammes, planification, idées / univers. Diagrammes de 60 à 200+ cases.
- Export PNG, PDF, SVG. Sens « mixte » (hiérarchie ↓, processus →). Onglets. Cadres. Un seul .exe portable (le 2026-11-01, LeEvSa a demandé de pouvoir l'épingler à la barre des tâches : l'installateur est devenu la version principale).

## Commandes
- `npm test` : tests du moteur (`test/layout.test.mjs`, node, mesure du texte approximative).
- `node scripts/build.mjs [--prod]` : assemble l'interface dans `app/` (esbuild, ELK inclus).
- `npm run dist` (= `scripts/package-win.sh`) : fabrique `dist/Schemo-Setup.exe` (electron-builder, assistant NSIS avec choix du dossier) et `dist/Schemo.exe` (portable x64).
  Le travail se fait dans `~/.cache/schemo-build` ; préfixe wine `~/.wine-schemo`.
- Tests visuels dans Electron (serveur sans écran) :
  `SCHEMO_TEST_DIR=<dossier> xvfb-run -a -s "-screen 0 1600x1000x24" node test/visual.mjs <dossier-captures> [scenario.mjs]`
  Sans scénario : captures de tous les onglets d'exemple. Scénarios : `test/interaction.mjs`, `test/features.mjs`.
  `SCHEMO_TEST_DIR` supprime les boîtes de dialogue (enregistrement/export écrits dans ce dossier) ;
  `visual.mjs` donne un `userData` temporaire (sinon la sauvegarde de secours d'un test précédent bloque le démarrage).
  `window.__schemo` = l'objet App (accès pour les tests).
- L'exe ne démarre pas sous wine 10 (Electron 45) : impossible de le tester ici, le code est le même que sous Linux.
- `Schemo-Setup.exe` propose `%LOCALAPPDATA%\Programs\schemo` (dossier modifiable) et crée le raccourci « Schémo » du menu Démarrer ; celui du Bureau est une case décochée au dernier écran (`assets/installer.nsh`, langues français et anglais). À relancer pour mettre à jour. Le portable se décompresse dans
  un dossier temporaire à chaque lancement : Windows ne peut pas l'épingler. `main.cjs` fixe `setAppUserModelId` à la valeur de `appId` pour que la fenêtre se range sous le raccourci.

## Architecture
- `src/model.js` : document `{tabs:[{nodes, edges, groups, settings, positions, view}]}`. Ids préfixés `n`/`e`/`g`/`t`.
  `order` (création, flottant pour insérer entre deux) départage tout. `pin` = centre épinglé, relatif à l'origine
  interne du cadre parent (monde si aucun cadre).
- `src/layout/engine.js` : `computeLayout(tab, measure, {focus, hints})`. Récursif par cadre (un cadre = un bloc dans
  la portée parente ; replié = une case). Par portée : composantes connexes → `autoArrange` :
  1 cycle couvrant tout → cercle ; 1 cycle + arbre autour → cercle avec rayons ; chaîne → serpentin ; arbre sortant →
  hiérarchie (feuilles « suspendues » si ≥ 6) ; sinon couches ELK, les cycles devenant des super-cases (cercles tournés
  pour que les entrées soient en haut). En « mixte », un arbre / graphe trop large est réessayé de gauche à droite.
  Formes imposées : `forcedArrange`. Placement des blocs au premier niveau : **stable** (chaque bloc garde la position
  précédente de sa case `focus` ou de sa plus vieille case, puis évite les collisions) ; dans un cadre : rangées.
- `src/layout/markdown.js` : Markdown de `node.desc` (blocs + styles en ligne), sans dépendance. `normalizeDoc` convertit les anciens
  `bullets` en liste. `sizing.textBlock` en fait des lignes à `runs` stylés, `draw.fillNodeText` les dessine en `<tspan>`.
- `src/layout/sizing.js` : texte coupé en lignes, `fitUniform` (taille commune par composante ; losange/ellipse/cercle
  peuvent grandir seuls).
- Indices de tracé (`hint`) donnés par la disposition à chaque flèche : `arc` (cycle), `tree`/`hang` (hiérarchie),
  `elk` (coudes en points virtuels animés), `straight`, `chord`. `src/render/edges.js` recalcule les tracés à chaque image.
- Chronologie (forme imposée `timeline`) : `layout/dates.js` lit la date ou la période libre `node.date` (`parseSpan` → `{start, end}`) pour classer ; `AR.timelineArrange` place les cases et rend
  `A.timeline` (remonte dans `L.timelines`, compté dans les boîtes englobantes) ; `draw.timelineGeometry` recalcule la ligne depuis les positions courantes.
- Flèches : chaque bout est une case ou un cadre (`model.canLink`, refusé entre un cadre et son contenu). Une flèche devenue interne
  (case glissée dans le cadre relié) n'est plus dessinée mais reste, et revient si la case ressort. `renderer.itemBox` = case ou cadre.
- `src/render/renderer.js` : SVG, caméra, animation 380 ms (positions interpolées), poignées « + », aperçu de lien.
- `src/ui/handles.js` : action de chaque « + » selon le rôle de la case (cycle : rayon / insérer avant-après ; chaîne :
  insérer ; arbre : après / avant / à côté ; liste/pyramide imposées : élément suivant sans flèche).
- `src/app.js` : `change(fn, opts)` = instantané pour annuler + modification + `relayout`. `coalesce` regroupe une
  frappe en une seule étape d'annulation. Caméra : recule toute seule si le diagramme visible déborde.
- `src/i18n.js` (2026-10-30) : langue français / anglais. Le texte français du code sert de clé : `tr('texte', {n})`,
  dictionnaire `EN` dans le même fichier (tout nouveau texte d'interface → l'y ajouter). Constantes de module : `labels({...})`.
  Choix : bouton globe FR/EN de la barre d'outils ou Fichier → « Langue · Language » ; gardé dans `prefs.json` (`lang`),
  sinon langue du système. `main.cjs` lit la même préférence pour ses boîtes de dialogue.
- Couleurs (2026-11-01) : `settings.colors` de l'onglet (`base` du thème « Une couleur », `from`/`to`/`gradStyle`/`gradDir` du
  dégradé, `palette` de Coloré/Pastel/Nuit, `text`/`border` de toutes les cases) ; sur la case : `color`, `color2` (dégradé),
  `gradDir`, `textColor`, `borderColor`. `nodeColors(settings, ctx, case)` rend `{fill, stroke, text, grad?}` ; `fill` reste une
  couleur unie (mini-carte, texte) et `fillPaint` crée le `<linearGradient>` au besoin (écran et export). Modifier une couleur :
  `app.setTabColors` / `app.setNodeColors`, sans refaire la disposition (`recolor`). Sélecteur de couleur
  maison `ui/colorpicker.js` (2026-11-07, celui de Chromium ouvre toujours en RGB) : HEX par défaut, mode (`colorMode`) et
  couleurs récentes (`recentColors`) gardés dans `prefs.json`. `panel.pickColor` : tout le passage dans le sélecteur = une
  seule étape d'annulation ; Échap revient à la couleur de départ.
- `electron/main.cjs` : un seul exemplaire (verrou), fichiers `.schemo` (JSON), PDF par `printToPDF` d'une fenêtre cachée,
  sauvegarde de secours `recuperation.json` dans userData, préférences, fenêtre.
  Ouvrir / Enregistrer sous / Exporter retiennent chacun leur dossier (`openDir`, `saveDir`, `exportDir` de `prefs.json`, 2026-11-07) ;
  « Enregistrer sous » part du dossier du fichier ouvert s'il y en a un.
