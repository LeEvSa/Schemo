// Panneau de droite : réglages de l'onglet, ou propriétés de la sélection.
import { tr, labels } from '../i18n.js';
import { h, icon } from './dom.js';
import { THEMES, SWATCHES, PALETTE, GRADIENTS, nodeColors, themeOf, monoBase, mix, defaultColors } from '../render/themes.js';
import { shapePath } from '../render/geometry.js';
import { SHAPES, LAYOUT_SHAPES } from '../model.js';
import { parseSpan } from '../layout/dates.js';
import { openColorPicker, colorPickerOpen } from './colorpicker.js';

export const SHAPE_LABELS = labels({
  rounded: 'Rectangle arrondi', rect: 'Rectangle', pill: 'Pilule', ellipse: 'Ellipse',
  circle: 'Cercle', diamond: 'Losange', hexagon: 'Hexagone', parallelogram: 'Parallélogramme',
});

export const LAYOUT_LABELS = labels({
  auto: 'Automatique', cycle: 'Cycle', hierarchy: 'Hiérarchie', process: 'Processus',
  list: 'Liste', pyramid: 'Pyramide', radial: 'Carte d’idées', timeline: 'Chronologie',
});

const LAYOUT_HELP = labels({
  auto: 'Schémo regarde tes liens et choisit : boucle → cercle, arbre → hiérarchie, chaîne → processus.',
  cycle: 'Toutes les cases sur un cercle, dans l’ordre des flèches.',
  hierarchy: 'De haut en bas, comme un organigramme.',
  process: 'Étapes à la suite, de gauche à droite, qui passent à la ligne.',
  list: 'Blocs alignés en grille, dans l’ordre.',
  pyramid: 'Étages empilés, du plus petit au plus large.',
  radial: 'Une idée au centre, les autres tout autour.',
  timeline: 'Les cases suivent une ligne du temps, classées toutes seules par date.',
});

const ICONS = { auto: 'sparkle', cycle: 'cycle', hierarchy: 'hierarchy', process: 'process', list: 'list', pyramid: 'pyramid', radial: 'radial', timeline: 'timeline', inherit: 'sparkle' };

const ROLE_WORDS = labels({
  cycle: 'dans un cycle (cercle)', ray: 'accrochée à un cycle', tree: 'dans une hiérarchie', chain: 'dans un processus',
  layered: 'dans un schéma à embranchements', single: 'seule (pas encore reliée)', pinned: 'épinglée à la main',
  list: 'dans une liste', pyramid: 'dans une pyramide', radial: 'dans une carte d’idées', timeline: 'dans une chronologie', free: 'libre',
});

function shapeIcon(shape) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '-16 -11 32 22');
  s.setAttribute('width', 30);
  s.setAttribute('height', 21);
  const w = shape === 'circle' ? 18 : 28, hh = 18;
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', shapePath(shape, w, hh));
  p.setAttribute('fill', 'currentColor');
  p.setAttribute('fill-opacity', '0.18');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.4');
  s.appendChild(p);
  return s;
}

export const MARKDOWN_HELP = 'Markdown : **gras**, *italique*, `code`, ~~barré~~, # titre, - liste, 1. liste, - [ ] à cocher, > citation';

const gradientCss = (from, to, dir = 'h') => `linear-gradient(${{ h: '90deg', v: '180deg', d: '135deg' }[dir]}, ${from}, ${to})`;

function themePreview(themeId, colors) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 60 22');
  s.setAttribute('width', 60);
  s.setAttribute('height', 22);
  for (let i = 0; i < 3; i++) {
    const c = nodeColors({ theme: themeId, colors: { ...colors, gradStyle: 'steps', text: null, border: null } }, { role: 'chain', depth: i === 0 ? 0 : 1, seq: i, seqLen: 3, branch: i }, null);
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', 1 + i * 20);
    r.setAttribute('y', 3);
    r.setAttribute('width', 17);
    r.setAttribute('height', 16);
    r.setAttribute('rx', 4);
    r.setAttribute('fill', c.fill);
    r.setAttribute('stroke', c.stroke);
    s.appendChild(r);
  }
  return s;
}

export class Panel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.lastKey = '';
    this.colorSeq = 0;
  }

  section(title, ...children) {
    return h('section', { class: 'p-sec' }, title ? h('h3', null, title) : null, ...children);
  }

  seg(options, current, onPick, cls = '') {
    return h('div', { class: 'seg ' + cls }, options.map(([v, label, title]) => h('button', {
      class: 'seg-btn' + (current === v ? ' on' : ''), title: title || null,
      onclick: () => onPick(v),
    }, label)));
  }

  // Ouvre le sélecteur de Schémo sous anchor. live : onPick(couleur, clé) à chaque changement, et tout le passage dans
  // le sélecteur = une seule étape d'annulation ; sinon onPick(couleur) une seule fois, à la fermeture. Tant qu'il est
  // ouvert, render() ne touche pas au panneau ; on redessine à sa fermeture.
  pickColor(anchor, value, onPick, live) {
    const key = 'color:' + (++this.colorSeq);
    openColorPicker(this.app, anchor, value, {
      onInput: live ? (v) => onPick(v, key) : null,
      onDone: (v) => {
        if (live) this.app.endCoalesce();
        else if (v) onPick(v);
        this.lastKey = '';
        this.render();
      },
    });
  }

  swatches(current, onPick, live = false) {
    const isCustom = current && !SWATCHES.includes(current);
    const pick = h('button', {
      type: 'button', class: 'sw sw-pick' + (isCustom ? ' on' : ''), title: tr('Autre couleur…'), 'aria-label': tr('Autre couleur…'),
      style: isCustom ? { background: current } : null,
      onclick: () => this.pickColor(pick, current, (v, k) => { pick.replaceChildren(); pick.style.background = v; onPick(v, k); }, live),
    }, isCustom ? null : icon('plus', 14));
    return h('div', { class: 'swatches' },
      h('button', { class: 'sw auto' + (!current ? ' on' : ''), title: tr('Automatique (suit le thème)'), onclick: () => onPick(null) }, 'A'),
      SWATCHES.map((c) => h('button', { class: 'sw' + (current === c ? ' on' : ''), title: c, style: { background: c }, onclick: () => onPick(c) })),
      pick);
  }

  // Une pastille de couleur avec son nom ; onChange reçoit (couleur, clé) et la pastille suit en direct.
  colorField(label, value, onChange) {
    const dot = h('span', { class: 'cf-dot', style: { background: value } });
    const btn = h('button', {
      type: 'button', class: 'cf', title: label || null, 'aria-label': label || tr('Couleur'),
      onclick: () => this.pickColor(btn, value, (v, k) => { dot.style.background = v; onChange(v, k); }, true),
    }, dot, label ? h('span', null, label) : null);
    return btn;
  }

  // Sous le choix du thème : ce qu'on peut modifier dans le thème en cours.
  themeEditor() {
    const app = this.app, s = app.tab.settings, c = s.colors, th = themeOf(s.theme), d = defaultColors();
    if (th.kind === 'mono') {
      return h('div', { class: 'cf-row' }, this.colorField(tr('Couleur principale'), monoBase(th, c), (v, k) => app.setTabColors({ base: v }, { coalesce: k, theme: 'perso' })));
    }
    if (th.kind === 'gradient') {
      const bar = h('div', { class: 'grad-bar', style: { background: gradientCss(c.from, c.to) } });
      const setEnd = (key) => (v, k) => {
        app.setTabColors({ [key]: v }, { coalesce: k });
        const now = app.tab.settings.colors;
        bar.style.background = gradientCss(now.from, now.to);
      };
      const changed = c.from !== d.from || c.to !== d.to || c.gradStyle !== d.gradStyle || c.gradDir !== d.gradDir;
      return h('div', { class: 'color-editor' },
        bar,
        h('div', { class: 'cf-row' },
          this.colorField(tr('Début'), c.from, setEnd('from')),
          this.colorField(tr('Fin'), c.to, setEnd('to')),
          h('button', { class: 'icon-btn', title: tr('Inverser'), 'aria-label': tr('Inverser'), onclick: () => app.setTabColors({ from: c.to, to: c.from }) }, icon('swap', 16))),
        h('div', { class: 'grad-chips' }, GRADIENTS.map((g) => h('button', {
          class: 'grad-chip' + (c.from === g.from && c.to === g.to ? ' on' : ''), title: tr(g.label), 'aria-label': tr(g.label),
          style: { background: gradientCss(g.from, g.to) }, onclick: () => app.setTabColors({ from: g.from, to: g.to }),
        }))),
        this.seg([['steps', tr('Case par case')], ['inside', tr('Dans la case')]], c.gradStyle, (v) => app.setTabColors({ gradStyle: v })),
        h('p', { class: 'muted small' }, c.gradStyle === 'inside' ? tr('Le dégradé est dessiné à l’intérieur de chaque case.') : tr('Chaque case prend une teinte, du début à la fin du diagramme.')),
        c.gradStyle === 'inside' ? this.gradDirSeg(c.gradDir, (v) => app.setTabColors({ gradDir: v })) : null,
        changed ? h('button', { class: 'btn small wide', onclick: () => app.setTabColors({ from: d.from, to: d.to, gradStyle: d.gradStyle, gradDir: d.gradDir }) }, tr('Rétablir')) : null);
    }
    if (['palette', 'pastel', 'dark'].includes(th.kind)) {
      const setOne = (i) => (v, k) => {
        const next = [...(app.tab.settings.colors.palette || PALETTE)];
        next[i] = v;
        app.setTabColors({ palette: next }, { coalesce: k });
      };
      return h('div', { class: 'color-editor' },
        h('div', { class: 'pal-row' }, (c.palette || PALETTE).map((v, i) => this.colorField('', v, setOne(i)))),
        h('p', { class: 'muted small' }, tr('Une couleur par branche du diagramme.')),
        c.palette ? h('button', { class: 'btn small wide', onclick: () => app.setTabColors({ palette: null }) }, tr('Rétablir')) : null);
    }
    return null;
  }

  gradDirSeg(current, onPick) {
    return this.seg([['h', '→', tr('Horizontal')], ['v', '↓', tr('Vertical')], ['d', '↘', tr('Diagonale')]], current, onPick);
  }

  render() {
    const app = this.app;
    const t = app.tab;
    const sel = [...app.sel];
    const key = t.id + '|' + sel.join(',');
    const active = document.activeElement;
    if (key === this.lastKey && colorPickerOpen()) return;
    if (key === this.lastKey && active && this.root.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    this.lastKey = key;
    const nodes = sel.filter((id) => t.nodes[id]);
    const edges = sel.filter((id) => t.edges[id]);
    const groups = sel.filter((id) => t.groups[id]);
    let content;
    if (groups.length === 1 && !nodes.length && !edges.length) content = this.groupPanel(groups[0]);
    else if (nodes.length) content = this.nodePanel(nodes, edges.length);
    else if (edges.length) content = this.edgePanel(edges);
    else content = this.tabPanel();
    this.root.replaceChildren(content);
    app.refreshLayoutButton();
    this.renderStats();
  }

  renderStats() {
    const el = this.root.querySelector('.p-stats');
    if (!el) return;
    const app = this.app, t = app.tab, L = app.L;
    const nN = Object.keys(t.nodes).length, nE = Object.keys(t.edges).length, nG = Object.keys(t.groups).length;
    const parts = [tr(nN > 1 ? '{n} cases' : '{n} case', { n: nN }), tr(nE > 1 ? '{n} flèches' : '{n} flèche', { n: nE })];
    if (nG) parts.push(tr(nG > 1 ? '{n} cadres' : '{n} cadre', { n: nG }));
    const seen = [];
    if (L) {
      const roles = {};
      for (const n of L.nodes.values()) if (n.kind === 'node') roles[n.ctx.role] = (roles[n.ctx.role] || 0) + 1;
      const word = { cycle: tr('en cycle'), tree: tr('en hiérarchie'), chain: tr('en processus'), layered: tr('à embranchements'), ray: tr('en rayons'), pinned: tr('épinglées'), single: tr('seules') };
      for (const [r, c] of Object.entries(roles)) if (word[r]) seen.push(`${c} ${word[r]}`);
    }
    el.replaceChildren(...[h('div', null, parts.join(' · ')), seen.length && t.settings.shape === 'auto' ? h('div', { class: 'muted small' }, tr('Détecté : ') + seen.join(', ')) : null].filter(Boolean));
  }

  tabPanel() {
    const app = this.app, t = app.tab, s = t.settings;
    const anyPin = [...Object.values(t.nodes), ...Object.values(t.groups)].some((it) => it.pin);
    const forced = ['cycle', 'process', 'list', 'pyramid'].includes(s.shape);
    const painted = Object.values(t.nodes).filter((n) => n.color || n.textColor || n.borderColor).length;
    return h('div', { class: 'p-inner' },
      h('div', { class: 'p-title' }, h('span', null, tr('Onglet')), h('span', { class: 'p-sub' }, t.name)),
      this.section(tr('Forme du diagramme'),
        h('div', { class: 'layout-grid' }, LAYOUT_SHAPES.map((v) => h('button', {
          class: 'lg-btn' + (s.shape === v ? ' on' : ''), title: LAYOUT_HELP[v],
          onclick: () => app.setTabSettings({ shape: v }),
        }, icon(ICONS[v], 20), h('span', null, LAYOUT_LABELS[v])))),
        h('p', { class: 'muted small' }, LAYOUT_HELP[s.shape] || ''),
        forced ? h('button', { class: 'btn small wide', title: tr('Ajoute les flèches qui manquent entre les cases, dans l’ordre affiché'), onclick: () => app.connectInOrder(null) }, icon('link', 15), tr('Relier les cases dans l’ordre')) : null),
      this.section(tr('Sens de lecture'),
        this.seg([['mixed', tr('Mixte'), tr('Hiérarchies de haut en bas, processus de gauche à droite')], ['TB', tr('↓ Vertical'), tr('Tout de haut en bas')], ['LR', tr('→ Horizontal'), tr('Tout de gauche à droite')]], s.direction, (v) => app.setTabSettings({ direction: v }))),
      this.section(tr('Espacement'),
        this.seg([['compact', tr('Serré')], ['normal', tr('Normal')], ['aere', tr('Aéré')]], s.spacing, (v) => app.setTabSettings({ spacing: v }))),
      this.section(tr('Couleurs'),
        h('div', { class: 'theme-grid' }, THEMES.map((th) => h('button', {
          class: 'th-btn' + (s.theme === th.id ? ' on' : ''), title: tr(th.label),
          onclick: () => app.setTabSettings({ theme: th.id }),
        }, themePreview(th.id, s.colors), h('span', null, tr(th.label))))),
        this.themeEditor(),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.shadow, onchange: (e) => app.setTabSettings({ shadow: e.target.checked }) }), tr('Ombre sous les cases'))),
      this.section(tr('Toutes les cases'),
        h('div', { class: 'p-label' }, tr('Couleur du texte')),
        this.swatches(s.colors.text, (v, k) => app.setTabColors({ text: v }, { coalesce: k }), true),
        h('div', { class: 'p-label' }, tr('Couleur de la bordure')),
        this.swatches(s.colors.border, (v, k) => app.setTabColors({ border: v }, { coalesce: k }), true),
        painted ? h('button', { class: 'btn small wide mt', title: tr('Ces cases reprennent les couleurs de l’onglet'), onclick: () => app.clearAllNodeColors() }, tr('Enlever les couleurs case par case ({n})', { n: painted })) : null),
      this.section(null,
        h('div', { class: 'btn-col' },
          anyPin ? h('button', { class: 'btn small wide', onclick: () => app.releaseAllPins() }, icon('unpin', 15), tr('Relâcher toutes les punaises')) : null,
          h('button', { class: 'btn small wide', onclick: () => app.renderer.fit(true) }, icon('fit', 15), tr('Ajuster à l’écran')))),
      h('div', { class: 'p-stats' }),
      h('div', { class: 'p-tip' }, icon('info', 15), h('span', null, tr('Double-clique sur le fond pour créer une case. Clic droit partout pour plus d’options.'))));
  }

  nodePanel(ids, edgeCount) {
    const app = this.app, t = app.tab;
    const one = ids.length === 1 ? t.nodes[ids[0]] : null;
    const first = t.nodes[ids[0]];
    const L = app.L;
    const ln = one && L ? L.nodes.get(one.id) : null;
    let roleLine = null;
    if (ln) {
      const c = ln.ctx;
      let w = ROLE_WORDS[c.role] || '';
      if (c.role === 'tree' || c.role === 'layered') w += c.depth ? tr(' (niveau {n})', { n: c.depth + 1 }) : tr(' (en haut)');
      if (c.role === 'chain') w += tr(' (étape {n} sur {total})', { n: c.seq + 1, total: c.seqLen });
      if (c.role === 'cycle') w += tr(' ({n} cases)', { n: c.seqLen });
      roleLine = h('p', { class: 'muted small' }, tr('Cette case est {role}.', { role: w }));
    }
    const titleInput = one ? h('input', {
      type: 'text', class: 'inp', value: one.title, placeholder: tr('Titre de la case'),
      oninput: (e) => app.setNodeProps([one.id], { title: e.target.value }, 'ptitle:' + one.id),
      onblur: () => app.endCoalesce(),
    }) : null;
    const descInput = one ? h('textarea', {
      class: 'inp', rows: 4, placeholder: tr('Description (Markdown)'),
      oninput: (e) => app.setNodeProps([one.id], { desc: e.target.value }, 'pdesc:' + one.id),
      onblur: (e) => { app.endCoalesce(); const cleaned = e.target.value.trimEnd(); if (cleaned !== one.desc) app.setNodeProps([one.id], { desc: cleaned }); },
    }) : null;
    if (descInput) descInput.value = one.desc;
    // dit ce que Schémo a compris ; le panneau ne se redessine pas pendant la frappe, d'où la mise à jour directe
    const dateText = (v) => {
      if (!v.trim()) return tr('Les cases se classent toutes seules par date. Sans date, une case reste après la précédente.');
      const span = parseSpan(v);
      if (!span) return tr('Date pas comprise : la case reste après la précédente.');
      return span.end === null ? tr('Date comprise.') : tr('Période comprise : une bande la montre sur la ligne.');
    };
    const dateNote = h('p', { class: 'muted small' }, dateText(one ? one.date : ''));
    const dateInput = one && app.scopeShapeOf(one.id) === 'timeline' ? h('input', {
      type: 'text', class: 'inp', id: 'node-date', value: one.date, placeholder: tr('ex. 2026-03-15, mars 2026, de 2000 à 2010'),
      oninput: (e) => { dateNote.textContent = dateText(e.target.value); app.setNodeProps([one.id], { date: e.target.value }, 'pdate:' + one.id); },
      onblur: () => app.endCoalesce(),
    }) : null;
    const allPinned = ids.every((id) => t.nodes[id].pin);
    const setColors = (props, k) => app.setNodeColors(ids, props, k);
    // Passer au dégradé part des couleurs actuelles de la case : son dégradé de thème s'il y en a un, sinon sa couleur
    // vers une teinte plus pâle (plus foncée si elle est déjà blanche).
    const startGradient = () => {
      const cur = nodeColors(t.settings, ln && ln.ctx, first);
      if (cur.grad) { setColors({ color: cur.grad.from, color2: cur.grad.to, gradDir: cur.grad.dir }); return; }
      setColors({ color: cur.fill, color2: mix(cur.fill, cur.fill.toLowerCase() === '#ffffff' ? '#000000' : '#ffffff', 0.45) });
    };
    const inGroup = ids.some((id) => t.nodes[id].group);
    return h('div', { class: 'p-inner' },
      h('div', { class: 'p-title' }, h('span', null, one ? tr('Case') : tr('{n} cases', { n: ids.length })), edgeCount ? h('span', { class: 'p-sub' }, '+ ' + tr(edgeCount > 1 ? '{n} flèches' : '{n} flèche', { n: edgeCount })) : null),
      dateInput ? this.section(tr('Date'), dateInput, dateNote) : null,
      one ? this.section(tr('Texte'), titleInput, descInput, h('p', { class: 'muted small' }, tr(MARKDOWN_HELP)), roleLine) : null,
      this.section(tr('Forme'),
        h('div', { class: 'shape-grid' }, SHAPES.map((s) => h('button', {
          class: 'sh-btn' + (first.shape === s ? ' on' : ''), title: SHAPE_LABELS[s],
          onclick: () => app.setNodeProps(ids, { shape: s }),
        }, shapeIcon(s))))),
      this.section(tr('Couleur'),
        this.seg([['solid', tr('Uni')], ['gradient', tr('Dégradé')]], first.color2 ? 'gradient' : 'solid', (v) => { if (v === 'gradient') startGradient(); else setColors({ color2: null }); }, 'seg-gap'),
        first.color2
          ? h('div', { class: 'color-editor' },
            h('div', { class: 'cf-row' },
              this.colorField(tr('Début'), first.color, (v, k) => setColors({ color: v }, k)),
              this.colorField(tr('Fin'), first.color2, (v, k) => setColors({ color2: v }, k))),
            this.gradDirSeg(first.gradDir, (v) => setColors({ gradDir: v })))
          : this.swatches(first.color, (c, k) => setColors({ color: c }, k), true)),
      this.section(tr('Couleur du texte'), this.swatches(first.textColor, (c, k) => setColors({ textColor: c }, k), true)),
      this.section(tr('Couleur de la bordure'), this.swatches(first.borderColor, (c, k) => setColors({ borderColor: c }, k), true)),
      this.section(tr('Position'),
        h('p', { class: 'muted small' }, allPinned ? tr('Épinglée : elle reste où tu l’as mise, le reste s’organise autour.') : tr('Rangée automatiquement. Glisse-la pour l’épingler ailleurs.')),
        allPinned
          ? h('button', { class: 'btn small wide', onclick: () => app.unpin(ids) }, icon('unpin', 15), tr('Relâcher la punaise'))
          : h('button', { class: 'btn small wide', onclick: () => app.pinHere(ids) }, icon('pin', 15), tr('Épingler ici'))),
      this.section(tr('Cadre'),
        h('div', { class: 'btn-col' },
          h('button', { class: 'btn small wide', onclick: () => app.groupSelection() }, icon('frame', 15), tr('Mettre dans un nouveau cadre')),
          inGroup ? h('button', { class: 'btn small wide', onclick: () => app.removeFromGroup(ids) }, icon('ungroup', 15), tr('Sortir du cadre')) : null)),
      this.section(null, h('button', { class: 'btn small wide danger', onclick: () => app.deleteSelection() }, icon('trash', 15), ids.length > 1 ? tr('Supprimer la sélection') : tr('Supprimer la case'))));
  }

  edgePanel(ids) {
    const app = this.app, t = app.tab;
    const e = t.edges[ids[0]];
    const one = ids.length === 1;
    const set = (p) => app.setEdgeProps(ids, p);
    const from = t.nodes[e.from] || t.groups[e.from], to = t.nodes[e.to] || t.groups[e.to];
    const nm = (n) => (n && n.title.trim() ? tr('« {name} »', { name: n.title.trim().slice(0, 28) }) : tr('une case'));
    return h('div', { class: 'p-inner' },
      h('div', { class: 'p-title' }, h('span', null, one ? tr('Flèche') : tr('{n} flèches', { n: ids.length }))),
      one ? h('p', { class: 'muted small' }, tr('De {from} vers {to}.', { from: nm(from), to: nm(to) }) + (from && to ? tr(' {name} vient donc avant.', { name: nm(from) }) : '')) : null,
      one ? this.section(tr('Texte sur la flèche'), h('input', {
        type: 'text', class: 'inp', value: e.label, placeholder: tr('ex. oui, non, après 2 jours…'),
        oninput: (ev) => app.setEdgeProps([e.id], { label: ev.target.value }, 'elabel:' + e.id),
        onblur: () => app.endCoalesce(),
      })) : null,
      this.section(tr('Tracé'), this.seg([['auto', tr('Auto'), tr('Selon la forme : arc dans un cycle, angles dans une hiérarchie')], ['straight', tr('Droit')], ['curve', tr('Courbe')], ['ortho', tr('Angles')]], e.routing, (v) => set({ routing: v }))),
      this.section(tr('Trait'), this.seg([['solid', tr('Plein')], ['dashed', tr('Tirets')], ['dotted', tr('Pointillé')]], e.dash, (v) => set({ dash: v }))),
      this.section(tr('Épaisseur'), this.seg([[1, tr('Fine')], [2, tr('Moyenne')], [3, tr('Épaisse')], [5, tr('Grosse')]], e.width, (v) => set({ width: v }))),
      this.section(tr('Pointes'), this.seg([['end', tr('→ Une')], ['both', tr('↔ Deux')], ['none', tr('— Aucune')]], e.arrows, (v) => set({ arrows: v }))),
      this.section(tr('Couleur'), this.swatches(e.color, (c) => set({ color: c }))),
      this.section(null, h('div', { class: 'btn-col' },
        h('button', { class: 'btn small wide', onclick: () => app.reverseEdges(ids) }, icon('swap', 15), tr('Inverser le sens')),
        h('button', { class: 'btn small wide danger', onclick: () => app.deleteSelection() }, icon('trash', 15), one ? tr('Supprimer la flèche') : tr('Supprimer')))));
  }

  groupPanel(id) {
    const app = this.app, t = app.tab;
    const g = t.groups[id];
    const opts = ['inherit', ...LAYOUT_SHAPES];
    return h('div', { class: 'p-inner' },
      h('div', { class: 'p-title' }, h('span', null, tr('Cadre'))),
      h('p', { class: 'muted small' }, tr('Glisse un + du cadre vers une case ou un autre cadre pour les relier.')),
      this.section(tr('Titre'), h('input', {
        type: 'text', class: 'inp', value: g.title, placeholder: tr('Titre du cadre'),
        oninput: (e) => app.setGroupProps([id], { title: e.target.value }, 'gtitle:' + id),
        onblur: () => app.endCoalesce(),
      })),
      this.section(tr('Forme du contenu'),
        h('div', { class: 'layout-grid' }, opts.map((v) => h('button', {
          class: 'lg-btn' + (g.shape === v ? ' on' : ''), title: v === 'inherit' ? tr('Même forme que l’onglet') : LAYOUT_HELP[v],
          onclick: () => app.setGroupProps([id], { shape: v }),
        }, icon(ICONS[v], 20), h('span', null, v === 'inherit' ? tr('Comme l’onglet') : LAYOUT_LABELS[v])))),
        ['cycle', 'process', 'list', 'pyramid'].includes(g.shape) ? h('button', { class: 'btn small wide', onclick: () => app.connectInOrder(id) }, icon('link', 15), tr('Relier les cases dans l’ordre')) : null),
      this.section(tr('Couleur'), this.swatches(g.color, (c) => app.setGroupProps([id], { color: c }))),
      this.section(null, h('div', { class: 'btn-col' },
        h('button', { class: 'btn small wide', onclick: () => app.toggleCollapse(id) }, icon(g.collapsed ? 'expand' : 'collapse', 15), g.collapsed ? tr('Déplier le cadre') : tr('Replier le cadre')),
        g.pin ? h('button', { class: 'btn small wide', onclick: () => app.unpin([id]) }, icon('unpin', 15), tr('Relâcher la punaise')) : null,
        h('button', { class: 'btn small wide', onclick: () => app.ungroup(id) }, icon('ungroup', 15), tr('Dissoudre (garder les cases)')),
        h('button', { class: 'btn small wide danger', onclick: () => app.deleteGroupWithContent(id) }, icon('trash', 15), tr('Supprimer avec le contenu')))));
  }
}
