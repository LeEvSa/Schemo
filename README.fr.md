# Schémo

[English](README.md) · **Français**

> **Projet vibe-codé.** Schémo a été entièrement écrit par une IA (Claude Code), dirigée par quelqu'un sans expérience en programmation. Aucune garantie : teste-le avant de t'y fier.
>
> **Vibe-coded project.** Schémo was written entirely by an AI (Claude Code), directed by someone with no programming experience. No warranty: test it before relying on it.

Éditeur de diagrammes pour Windows, entre draw.io et le SmartArt d'Excel : tu dessines des cases et des flèches à la souris, et **le diagramme se range tout seul** selon tes liens.

- **Boucle** (A → B → C → A) : les cases se placent en cercle, avec des flèches en arc. Une case accrochée au cercle part vers l'extérieur, comme un rayon.
- **Arbre** (un chef, des branches) : hiérarchie de haut en bas (organigramme). Une case avec beaucoup de sous-cases les range en colonnes « suspendues ».
- **Chaîne** (A → B → C) : processus de gauche à droite, qui passe à la ligne en serpentin s'il est long.
- **Mélange** : chaque boucle reste un cercle, le reste s'organise en étages autour (moteur ELK).
- Une flèche **A → B veut dire « A vient avant B »**.

## Installer

Télécharger `Schemo-Setup.exe` dans les [Releases](https://github.com/LeEvSa/Schemo/releases) et double-cliquer, puis suivre les écrans : tu choisis le dossier d'installation (droits d'administrateur seulement pour un dossier protégé ou une installation pour tous les utilisateurs). Schémo crée un raccourci dans le menu Démarrer (celui du Bureau est une case à cocher au dernier écran), et tu peux l'épingler à la barre des tâches. Tes diagrammes n'ont pas besoin d'Internet.

- **Mettre à jour :** au lancement, Schémo regarde sur GitHub s'il existe une nouvelle version et te la propose. Sans Internet, il n'en dit rien. Tes diagrammes ne sont jamais envoyés nulle part (voir [SECURITY.md](SECURITY.md), en anglais). Tu peux aussi passer par Fichier → Rechercher une mise à jour. Rien ne s'installe sans ton accord.
- **Désinstaller :** Paramètres de Windows → Applications, ou `Uninstall Schemo.exe` dans le dossier d'installation. Tes fichiers `.schemo` restent.

Au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur » (l'exe n'est pas signé) :
cliquer **Informations complémentaires → Exécuter quand même**.

Pour une clé USB ou un PC où tu ne veux rien installer : `Schemo.exe`, la version portable. Elle démarre plus lentement (elle se décompresse à chaque lancement), **ne s'épingle pas** à la barre des tâches (Windows épinglerait son dossier temporaire, qui disparaît) et ne se met pas à jour toute seule.

## Utiliser

| Geste | Effet |
|---|---|
| Double-clic sur le fond | Nouvelle case (dans le cadre si tu cliques dedans) |
| Clic sur un **+** autour d'une case | Ajoute une case reliée : après, avant, à côté, ou insérée dans le cycle |
| Glisser un **+** vers une case ou un cadre | Tire une flèche (vers le vide : crée une case au bout) |
| Clic sur la barre d'un cadre | Montre ses **+** : un cadre se relie comme une case |
| Double-clic sur une case | Écrire dedans — Maj+Entrée passe à la description |
| Glisser une case | L'épingle à cet endroit ; le reste s'organise autour. Clic sur la punaise pour la relâcher |
| Glisser une case dans un cadre | La met dans ce cadre |
| Glisser le fond / molette | Déplacer la vue / zoom |
| Maj + glisser le fond | Sélectionner plusieurs cases |
| Clic droit | Menu de la case, de la flèche, du cadre ou du fond |

- **Menu Forme** (barre du haut ou panneau) : Automatique, Cycle, Hiérarchie, Processus, Liste, Pyramide, Carte d'idées, Chronologie, Fils narratifs, Réseau, Arc dramatique, Tableau, Arbre généalogique, Cible, Chronologie parallèle — pour l'onglet entier ou un seul cadre.
- **Cadres** (Ctrl+G) : regroupent des cases, s'ajustent seuls, se replient (chevron) pour alléger les gros diagrammes.
- **Onglets** en bas comme Excel ; un fichier `.schemo` contient tous les onglets.
- **Panneau de droite** : forme des cases (rectangle arrondi, rectangle, pilule, ellipse, cercle, losange, hexagone, parallélogramme, et pour les histoires bouclier, étoile, nuage, couronne) et leur couleur, description (en Markdown), style des flèches (droite, courbe, angles, tirets, pointes, texte), thèmes de couleurs, espacement, sens de lecture.
- **Export** (Ctrl+E) : PNG (fond blanc, transparent ou sombre, haute résolution), PDF (blanc ou sombre, page ajustée ou Lettre/Légal/Tabloïd, un ou tous les onglets), SVG (blanc, transparent ou sombre). Sur fond sombre, flèches, cadres et ligne du temps prennent les couleurs du mode sombre.
- Raccourcis : Ctrl+Z/Y, Ctrl+C/X/V/D, Suppr, F2, Ctrl+A, Ctrl+F, Ctrl+S, Ctrl+O, Ctrl+N, Ctrl+0, F1 (aide).
- Ouvrir, Enregistrer sous et Exporter retiennent chacun le dernier dossier utilisé. Enregistrer sous part du dossier du diagramme quand il a déjà un fichier.
- Sauvegarde de secours automatique : si Schémo se ferme sans enregistrer, il propose de récupérer le travail au prochain lancement.

## Développement

```bash
npm install
npm test              # tests du moteur de disposition (node)
npm start             # compile et lance (il faut un écran)
npm run dist          # fabrique dist/Schemo-Setup.exe et dist/Schemo.exe (portable) depuis Linux
```

Structure : `src/layout/` (moteur de rangement), `src/render/` (dessin SVG, flèches, thèmes, export),
`src/ui/` (panneau, onglets, souris, édition), `src/app.js` (contrôleur), `electron/` (fenêtre, fichiers, PDF).
Voir `CLAUDE.md` pour les détails techniques.

## Langue / Language
Bouton globe (FR / EN) en haut à droite, ou Fichier → « Langue · Language ». Le choix est gardé.
Globe button (FR / EN) at the top right, or File → “Langue · Language”. The choice is remembered.

## Couleurs
- **Tout le diagramme** (panneau de droite, rien de sélectionné) : sous les thèmes, modifie celui qui est choisi.
  - *Dégradé* : couleurs de début et de fin, modèles tout faits, inverser, « Case par case » ou « Dans la case » avec son sens.
  - *Bleu, Vert, Orange, Violet, Une couleur* : la couleur principale.
  - *Coloré, Pastel, Nuit* : les 8 couleurs de la palette.
  - *Toutes les cases* : couleur du texte et de la bordure. « Enlever les couleurs case par case » remet les cases sur les couleurs de l'onglet.
- **Une case ou une sélection** : couleur unie ou dégradé, couleur du texte, couleur de la bordure.
- **+ (Autre couleur)** ou une pastille ouvre le sélecteur de couleur : code HEX par défaut, ou RGB / HSL. Schémo retient le mode choisi et les couleurs récentes. Entrée ou un clic ailleurs garde la couleur ; Échap revient à celle de départ.

## Description
Sous son titre, une case peut avoir une description écrite en Markdown (panneau de droite, ou Maj+Entrée dans la case) :
`**gras**`, `*italique*`, `` `code` ``, `~~barré~~`, `# titre`, `- liste`, `1. liste`, `- [ ] à cocher`, `> citation`, `---` pour une ligne.
Chaque ligne écrite reste une ligne. Un lien `[texte](url)` s'affiche souligné, sans s'ouvrir. Les sous-points des anciens fichiers deviennent une liste.

## Histoires

Des formes faites pour planifier des histoires (menu Forme, pour un onglet ou un cadre) :

- **Fils narratifs** : un cadre par personnage ou intrigue, empilés en bandes. Ses scènes vont de gauche à droite, dans l'ordre où tu les as créées. Les scènes s'alignent dans le temps d'une bande à l'autre : une flèche d'une scène vers une scène d'une autre bande place celle-ci après. Avec le thème Coloré, chaque bande a sa couleur.
- **Réseau** : les personnages et leurs relations. Les cases reliées restent proches, sans haut ni bas. Les nouveaux liens sont des traits sans pointe (écris la relation sur le lien, ex. « amis ») ; ajoute une pointe dans le panneau pour une relation à sens unique (« trahit »). Ajouter un personnage bouge à peine les autres.
- **Arc dramatique** : les scènes vont de gauche à droite sur une courbe qui suit la tension de l'histoire. Sélectionne une scène et choisis sa **Tension** (1 à 5) dans le panneau. Une scène laissée sur Auto se place entre ses voisines ; si aucune scène n'a encore de niveau, l'arc prend la forme classique (il monte jusqu'aux deux tiers, puis redescend).
- **Tableau** : un cadre par acte ou chapitre, en colonnes côte à côte, comme des fiches sur un tableau de liège. Les scènes s'y empilent de haut en bas. Glisse une scène dans une autre colonne pour la changer de chapitre. Les cases hors colonne forment une colonne de plus, à droite.
- **Arbre généalogique** : un trait **sans pointe** relie un couple, placé côte à côte ; une **flèche** va d'un parent à son enfant, et les enfants se placent sous le milieu du couple. Deux personnes qui ont un enfant ensemble se placent en couple même sans trait entre elles, et chacun se place sous ses propres parents, même quand les deux membres d'un couple viennent de familles différentes. Une couleur par génération. Autour d'une personne, le **+** du bas ajoute un enfant (relié aux deux membres du couple), celui du haut un parent, ceux des côtés un ou une partenaire. Pour faire d'une flèche un couple, mets-la « sans pointe » dans le panneau.
- **Cible** : des cercles les uns dans les autres, pour situer un univers ou des personnages. La plus ancienne case sans flèche entrante est au centre ; ce qui y est relié va sur le 1er cercle, ce qui est relié à ceux-là sur le 2e, etc. Les cases reliées à rien vont sur un dernier cercle, en pointillé.
- **Chronologie parallèle** : un cadre par personnage, empilés en bandes comme les Fils narratifs, mais chaque scène se place selon sa **Date**, sur un temps commun à toutes les bandes. Une règle en haut montre les dates, avec de fines lignes à travers les bandes pour lire qui fait quoi en même temps. Elle suit le réglage **Ligne du temps** de l'onglet : Régulier (une colonne par date) ou À l'échelle (vrais écarts ; les scènes trop proches s'empilent dans leur bande).

## Chronologie
Fichier → **Nouvelle fiche chronologique**, ou la forme **Chronologie** du panneau de droite (pour un onglet ou un cadre).
Sélectionne une case et écris sa date dans le champ **Date** : `2026-03-15`, `15/03/2026`, `mars 2026`, `T1 2026`, `1967`, `500 av. J.-C.`, `Jour 3`, `14h30`.
Une période marche aussi : `de l'an 2000 à l'an 2010`, `2000-2010`, `du 3 au 15 mars 2026`, `mars à juin 2026`, `depuis 2010`, `années 90`, `XXe siècle`. Une bande la montre sur la ligne, et le texte sous le champ dit si Schémo a compris.
Les cases se classent toutes seules et ta date s'affiche telle que tu l'as écrite. Par défaut, les cases sont espacées également. Sans rien sélectionner, la section **Ligne du temps** du panneau passe **À l'échelle** : l'écart entre deux cases suit le temps, des repères (années, mois, jours ou heures) s'affichent sur la ligne, et les cases trop proches passent sur une autre rangée. **Auto** choisit l'unité selon la durée ; choisis-en une (Heures à Siècles) pour fixer 1 unité = 110 px.
Une case sans date reste après la précédente. Une case glissée à la main est épinglée et sort de la ligne ; clique sur la punaise pour l'y remettre.


## Mises à jour
La liste est dans [CHANGELOG.md](CHANGELOG.md) (en anglais). Chaque mise à jour s'appelle semaine.numéro : `1.1` est la première de la semaine 1.

## Licence
Le code de Schémo est sous licence [MIT](LICENSE). Les logiciels tiers livrés avec l'exécutable sont listés dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
