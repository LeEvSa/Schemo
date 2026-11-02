// Fenêtres (modales), menus contextuels, notifications.
import { tr } from '../i18n.js';
import { h, icon } from './dom.js';

let root = null;
const getRoot = () => root || (root = document.getElementById('overlay-root'));

export function showModal({ title, body, buttons = [{ label: 'OK', value: true, kind: 'primary' }], width = 440, dismissValue = null }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus(); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(dismissValue); }
      if (e.key === 'Enter' && !(e.target && e.target.tagName === 'TEXTAREA')) {
        const prim = buttons.find((b) => b.kind === 'primary');
        if (prim) { e.preventDefault(); e.stopPropagation(); close(typeof prim.value === 'function' ? prim.value() : prim.value); }
      }
    };
    const btns = buttons.map((b) => h('button', {
      class: 'btn ' + (b.kind || ''),
      onclick: () => close(typeof b.value === 'function' ? b.value() : b.value),
    }, b.label));
    const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', style: { width: width + 'px' } },
      h('div', { class: 'modal-head' }, h('h2', null, title),
        h('button', { class: 'icon-btn ghost', title: tr('Fermer'), onclick: () => close(dismissValue) }, icon('x', 18))),
      h('div', { class: 'modal-body' }, typeof body === 'string' ? h('p', null, body) : body),
      h('div', { class: 'modal-foot' }, btns));
    const wrap = h('div', { class: 'modal-wrap', onmousedown: (e) => { if (e.target === wrap) close(dismissValue); } }, dlg);
    getRoot().appendChild(wrap);
    document.addEventListener('keydown', onKey, true);
    const focusable = dlg.querySelector('input, textarea, select') || dlg.querySelector('.btn.primary');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  });
}

export function toast(msg, kind = '') {
  const t = h('div', { class: 'toast ' + kind }, msg);
  getRoot().appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 5000 : 2200);
}

// Notification qui reste affichée jusqu'à close() ; set() change son texte.
export function stickyToast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  getRoot().appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  return { set: (m) => { t.textContent = m; }, close: () => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); } };
}

let openMenu = null;

export function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', menuKey, true); }
}

function outside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
function menuKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); } }

function buildMenu(items, isSub) {
  const m = h('div', { class: 'menu' + (isSub ? ' sub' : ''), role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.appendChild(h('div', { class: 'menu-sep' })); continue; }
    if (it.heading) { m.appendChild(h('div', { class: 'menu-heading' }, it.heading)); continue; }
    const row = h('div', {
      class: 'menu-item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : '') + (it.submenu ? ' has-sub' : ''),
      role: 'menuitem',
    },
    h('span', { class: 'mi-icon' }, it.checked ? icon('check', 15) : it.icon ? icon(it.icon, 16) : (it.swatch ? h('span', { class: 'mi-swatch', style: { background: it.swatch } }) : null)),
    h('span', { class: 'mi-label' }, it.label),
    it.shortcut ? h('span', { class: 'mi-key' }, it.shortcut) : null,
    it.submenu ? h('span', { class: 'mi-arrow' }, icon('chevRight', 14)) : null);
    if (it.checked) row.classList.add('checked');
    if (it.submenu) {
      const sub = buildMenu(it.submenu, true);
      row.appendChild(sub);
      row.addEventListener('pointerenter', () => {
        sub.style.display = 'block';
        const r = sub.getBoundingClientRect();
        if (r.right > window.innerWidth - 4) { sub.style.left = 'auto'; sub.style.right = '100%'; }
        if (r.bottom > window.innerHeight - 4) sub.style.top = Math.max(-r.top + 4, window.innerHeight - 4 - r.bottom) + 'px';
      });
      row.addEventListener('pointerleave', () => { sub.style.display = 'none'; });
    } else if (!it.disabled) {
      row.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); it.action && it.action(); });
    }
    m.appendChild(row);
  }
  return m;
}

export function showMenu(items, x, y, opts = {}) {
  closeMenu();
  const m = buildMenu(items, false);
  m.style.left = x + 'px';
  m.style.top = y + 'px';
  getRoot().appendChild(m);
  const r = m.getBoundingClientRect();
  if (r.right > window.innerWidth - 6) m.style.left = Math.max(6, (opts.alignRight ? x : window.innerWidth - 6 - r.width)) + 'px';
  if (opts.alignRight) m.style.left = Math.max(6, x - r.width) + 'px';
  if (r.bottom > window.innerHeight - 6) m.style.top = Math.max(6, window.innerHeight - 6 - r.height) + 'px';
  openMenu = m;
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', menuKey, true); }, 0);
  return m;
}
