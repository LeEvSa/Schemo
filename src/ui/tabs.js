// Barre d'onglets du bas (comme les feuilles d'Excel).
import { tr } from '../i18n.js';
import { h, icon } from './dom.js';
import { showMenu } from './dialogs.js';

export class TabBar {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.editing = null;
  }

  render() {
    const app = this.app;
    const tabs = app.doc.tabs.map((t) => {
      if (this.editing === t.id) {
        const inp = h('input', { class: 'tab-input', value: t.name, spellcheck: 'false' });
        const done = (ok) => {
          if (this.editing !== t.id) return;
          this.editing = null;
          if (ok && inp.value.trim() && inp.value.trim() !== t.name) app.renameTab(t.id, inp.value);
          else this.render();
        };
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
        inp.addEventListener('blur', () => done(true));
        setTimeout(() => { inp.focus(); inp.select(); }, 0);
        return h('div', { class: 'tab on editing' }, inp);
      }
      const count = Object.keys(t.nodes).length;
      return h('div', {
        class: 'tab' + (t.id === app.doc.active ? ' on' : ''), title: tr('{name} — {count} (double-clic pour renommer)', { name: t.name, count: tr(count > 1 ? '{n} cases' : '{n} case', { n: count }) }),
        onclick: () => app.switchTab(t.id),
        ondblclick: () => { this.editing = t.id; this.render(); },
        oncontextmenu: (e) => { e.preventDefault(); this.menu(t, e.clientX, e.clientY); },
      }, h('span', { class: 'tab-name' }, t.name));
    });
    this.root.replaceChildren(
      h('div', { class: 'tabs' }, tabs,
        h('button', { class: 'tab-add', title: tr('Nouvel onglet'), onclick: () => app.addTab() }, icon('plus', 16))),
      h('div', { class: 'tabbar-right' },
        h('span', { class: 'muted small', id: 'status-text' }, app.filePath ? app.filePath : '')),
    );
  }

  menu(t, x, y) {
    const app = this.app;
    const i = app.doc.tabs.indexOf(t);
    showMenu([
      { label: tr('Renommer'), icon: 'edit', action: () => { this.editing = t.id; this.render(); } },
      { label: tr('Dupliquer'), icon: 'dup', action: () => app.duplicateTab(t.id) },
      { label: tr('Déplacer à gauche'), disabled: i === 0, action: () => app.moveTab(t.id, -1) },
      { label: tr('Déplacer à droite'), disabled: i === app.doc.tabs.length - 1, action: () => app.moveTab(t.id, 1) },
      { sep: true },
      { label: tr('Supprimer l’onglet'), icon: 'trash', danger: true, disabled: app.doc.tabs.length <= 1, action: () => app.deleteTab(t.id) },
    ], x, y - 10);
  }
}
